"""
③-B「引継ぎビューア」用のAzure Function。

ServiceNowから、前回・今回それぞれの契約書PDFのBlob Storage上のパスを受け取り、
条文ごとに突き合わせて差分(変更箇所を赤字にしたHTML)を返す。

注意:
条文分割・差分検出のロジックは azure/risk_extraction/run_pipeline.py と同じものだが、
Azure Functionはデプロイ時にこのフォルダ単体で完結したパッケージとして扱われるため、
意図的にここへ複製している。ロジックを修正する場合は両方のファイルを更新すること。
(将来的に呼び出し頻度が増え、二重管理の負担が大きくなった場合は、共通ライブラリとして
切り出すことを検討する)
"""

import os
import re
import io
import json
import html
import difflib
import logging

import azure.functions as func
from azure.storage.blob import BlobServiceClient
import pdfplumber

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

BLOB_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
CONTAINER_NAME = "contracts"


# --- PDF読み込み(バイト列から。Blobからダウンロードしたデータをそのまま渡せる) ---
def extract_full_text(file_bytes):
    full_text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                full_text += t + "\n"
    return full_text


# --- 条文分割(漢数字・順序性フィルタ対応。run_pipeline.pyと同一ロジック) ---
_KANSUJI_DIGITS = {"〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
_KANSUJI_UNITS = {"十": 10, "百": 100, "千": 1000}
_KANSUJI_CHARS = "一二三四五六七八九十百千"


def _kansuji_to_int(s):
    if s.isdigit():
        return int(s)
    total, current = 0, 0
    for ch in s:
        if ch in _KANSUJI_DIGITS:
            current = _KANSUJI_DIGITS[ch]
        elif ch in _KANSUJI_UNITS:
            unit = _KANSUJI_UNITS[ch]
            current = current if current else 1
            total += current * unit
            current = 0
    return total + current


def _parse_article_number(title):
    m = re.match(rf"第([0-9０-９{_KANSUJI_CHARS}]+)条(?:の([0-9０-９{_KANSUJI_CHARS}]+))?", title)
    main = _kansuji_to_int(m.group(1))
    branch = _kansuji_to_int(m.group(2)) if m.group(2) else 0
    return main, branch


def split_into_articles(full_text, max_jump=5):
    if "付則" in full_text:
        full_text = full_text.split("付則")[0]
    elif "附則" in full_text:
        full_text = full_text.split("附則")[0]

    pattern = re.compile(
        rf"^(?:[（(][^）)]*[）)]\s*\n)?第[0-9０-９{_KANSUJI_CHARS}]+条(?:の[0-9０-９{_KANSUJI_CHARS}]+)?",
        re.MULTILINE
    )
    candidates = list(pattern.finditer(full_text))

    accepted = []
    last_main, last_branch = 0, 0
    for m in candidates:
        num_match = re.search(rf"第[0-9０-９{_KANSUJI_CHARS}]+条(?:の[0-9０-９{_KANSUJI_CHARS}]+)?", m.group())
        title = num_match.group()
        main, branch = _parse_article_number(title)

        is_next_main = 0 < (main - last_main) <= max_jump
        is_next_branch = (main == last_main and branch > last_branch)
        if not (is_next_main or is_next_branch):
            continue

        accepted.append({"title": title, "start": m.end(), "match_start": m.start()})
        last_main, last_branch = main, branch

    articles = []
    for i, a in enumerate(accepted):
        end = accepted[i + 1]["match_start"] if i + 1 < len(accepted) else len(full_text)
        body = full_text[a["start"]:end].strip()
        articles.append({"title": a["title"], "body": body})
    return articles


# --- 差分検出(文字単位。変更箇所だけを赤字にしたHTMLを返す) ---
def compare_with_previous_version(previous_text, current_text):
    matcher = difflib.SequenceMatcher(None, previous_text, current_text)
    html_parts = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            html_parts.append(html.escape(current_text[j1:j2]))
        elif tag in ("replace", "insert"):
            changed_text = html.escape(current_text[j1:j2])
            html_parts.append(f'<span style="color:red">{changed_text}</span>')
        elif tag == "delete":
            deleted_text = html.escape(previous_text[i1:i2])
            html_parts.append(f'<span style="color:red;text-decoration:line-through">{deleted_text}</span>')
    return "".join(html_parts)


def _download_blob(blob_path):
    """
    blob_pathは、コンテナ内でのパス(例: '案件123/test-contract-02.pdf')を想定する。
    """
    blob_service = BlobServiceClient.from_connection_string(BLOB_CONNECTION_STRING)
    blob_client = blob_service.get_blob_client(container=CONTAINER_NAME, blob=blob_path)
    return blob_client.download_blob().readall()


@app.route(route="compare_versions", methods=["POST"])
def compare_versions(req: func.HttpRequest) -> func.HttpResponse:
    """
    リクエストボディ(JSON):
    {
      "previous_blob_path": "案件123/test-contract-02.pdf",
      "current_blob_path": "案件123/test-contract-02-v2.pdf"
    }

    レスポンス(JSON):
    {
      "articles": [
        {"title": "第5条", "status": "changed", "diff_html": "..."},
        {"title": "第1条", "status": "unchanged", "diff_html": "..."},
        ...
      ]
    }
    """
    try:
        body = req.get_json()
        previous_blob_path = body["previous_blob_path"]
        current_blob_path = body["current_blob_path"]
    except (ValueError, KeyError):
        return func.HttpResponse(
            json.dumps({"error": "previous_blob_path と current_blob_path を指定してください"}, ensure_ascii=False),
            status_code=400,
            mimetype="application/json"
        )

    try:
        previous_bytes = _download_blob(previous_blob_path)
        current_bytes = _download_blob(current_blob_path)
    except Exception as e:
        logging.error(f"Blobダウンロードに失敗: {e}")
        return func.HttpResponse(
            json.dumps({"error": f"Blobの取得に失敗しました: {str(e)}"}, ensure_ascii=False),
            status_code=404,
            mimetype="application/json"
        )

    previous_text = extract_full_text(previous_bytes)
    current_text = extract_full_text(current_bytes)

    previous_articles = {a["title"]: a["body"] for a in split_into_articles(previous_text)}
    current_articles = split_into_articles(current_text)

    result = []
    for article in current_articles:
        title = article["title"]
        current_body = article["body"]
        previous_body = previous_articles.get(title)

        if previous_body is None:
            diff_html = f'<span style="color:red">{html.escape(current_body)}</span>'
            status = "added"
        elif previous_body == current_body:
            diff_html = html.escape(current_body)
            status = "unchanged"
        else:
            diff_html = compare_with_previous_version(previous_body, current_body)
            status = "changed"

        result.append({"title": title, "status": status, "diff_html": diff_html})

    return func.HttpResponse(
        json.dumps({"articles": result}, ensure_ascii=False),
        status_code=200,
        mimetype="application/json"
    )
