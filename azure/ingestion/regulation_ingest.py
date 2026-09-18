"""
regulation_ingest.py

東京都公有財産規則のような自治体規則PDFを条文単位に分割し、
Azure OpenAIでベクトル化した上でAzure AI Searchへ登録するスクリプト。

split_contract.py（契約書用）とは条文見出しの表記が異なるため
（契約書は算用数字、規則は漢数字＋枝番）、別スクリプトとして用意している。

条文分割の考え方：
  - 見出し候補は「行頭にある第◯条（枝番含む）」のみを対象にする
    （本文中の「第◯条の規定により」といった引用は、pdfplumber抽出時の
    折り返しにより行頭に来てしまうことがあるため、行頭判定だけでは
    区別しきれない）
  - そこで、直前に採用した条番号から見て自然な順序
    （本条なら+1、枝番なら同じ本条内での連番）になっているものだけを
    本物の見出しとして採用する（順序性フィルタ）
  - 附則（改正履歴）は判定対象に含める価値が薄いため、本文の末尾
    （「付則」が最初に現れる箇所）で打ち切り、対象外とする

2026-09-18追記：
  条番号の表記は自治体・規則によって漢数字（第一条）・算用数字（第１条）の
  どちらもありうることが実データ検証で判明したため、両方に対応するよう
  ARTICLE_PATTERN／kanji_to_int／COMPOUND_DELETE_*を拡張した。
"""

import os
import re
import hashlib

import pdfplumber
from dotenv import load_dotenv
from openai import AzureOpenAI
from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential


# ============================================================
# 1. PDFからのテキスト抽出
# ============================================================

def extract_full_text(pdf_path):
    """PDFの全ページからテキストを抽出し、1つの文字列に連結する"""
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"
    return full_text


# ============================================================
# 2. 条文分割（漢数字・算用数字・枝番対応、行頭判定＋順序性フィルタ）
# ============================================================

# 条見出しのパターン：行頭の「第◯条」（枝番「の◯」を含む）。漢数字・算用数字（全角含む）両対応。
ARTICLE_PATTERN = re.compile(
    r"^第([0-9０-９一二三四五六七八九十百]+)条(?:の([0-9０-９一二三四五六七八九十]+))?",
    re.MULTILINE,
)

# 附則の開始位置を検出するパターン（「付則」「附則」どちらの表記にも対応）
FUSOKU_PATTERN = re.compile(r"^(?:付|附)\s*則", re.MULTILINE)

KANJI_DIGITS = {
    "○": 0, "一": 1, "二": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
}


def kanji_to_int(s):
    """簡易的な漢数字→整数変換（本規則で使われる範囲：〜百程度まで対応）。算用数字（全角含む）にも対応する。"""
    if not s:
        return 0
    normalized = s.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    if normalized.isdigit():
        return int(normalized)
    if "百" in s:
        left, _, rest = s.partition("百")
        hundreds = KANJI_DIGITS.get(left, 1) if left else 1
        return hundreds * 100 + kanji_to_int(rest)
    if "十" in s:
        left, _, right = s.partition("十")
        tens = KANJI_DIGITS.get(left, 1) if left else 1
        ones = KANJI_DIGITS.get(right, 0) if right else 0
        return tens * 10 + ones
    return KANJI_DIGITS.get(s, 0)


def find_article_boundary(full_text):
    """本文の末尾（附則の直前）の位置を返す。見つからなければ文書全体の長さを返す"""
    match = FUSOKU_PATTERN.search(full_text)
    return match.start() if match else len(full_text)


def is_valid_heading(main_num, branch_num, prev_main, prev_branch):
    """
    直前に採用した条番号 (prev_main, prev_branch) から見て、
    今回の候補 (main_num, branch_num) が自然な次の見出しかどうかを判定する。

    枝番は「第五条の二」のように2から始まる（「の一」は使われない）
    ため、本条から枝番へ移る際は branch_num == 2 を正当な開始とみなす。
    """
    if branch_num == 0:
        # 本条見出し：直前の本条番号+1であること
        return main_num == prev_main + 1
    else:
        # 枝番見出し：本条番号が直前と同じであること
        if main_num != prev_main:
            return False
        if prev_branch == 0:
            return branch_num == 2
        return branch_num == prev_branch + 1


# 「第◯条及び第◯条　削除」のように、削除された条文がまとめて1つの
# 見出しで宣言されているパターン（同じ行の先頭からの続き）。漢数字・算用数字両対応。
COMPOUND_DELETE_AND = re.compile(r"^及び第([0-9０-９一二三四五六七八九十百]+)条\s*削除")
COMPOUND_DELETE_RANGE = re.compile(r"^から第([0-9０-９一二三四五八九十百]+)条まで\s*削除")


def split_articles(full_text):
    """
    行頭の「第◯条」を条文見出しとして検出し、条文ごとに分割する。
    附則（改正履歴）は対象外とし、本文の末尾で打ち切る。

    「第二十三条及び第二十四条　削除」のように、削除された条文が
    まとめて1つの見出しで宣言されている場合は、そこで宣言されている
    最大の条番号までprev_mainを進める（そうしないと、以降の見出しが
    すべて「本文中の引用」と誤判定され、条文の分割が途中で止まってしまう）。

    戻り値：[{"article_number": "第一条", "body": "..."}, ...]
    """
    boundary = find_article_boundary(full_text)
    body_text = full_text[:boundary]

    candidates = list(ARTICLE_PATTERN.finditer(body_text))

    accepted = []
    prev_main = 0
    prev_branch = 0

    for m in candidates:
        main_num = kanji_to_int(m.group(1))
        branch_num = kanji_to_int(m.group(2)) if m.group(2) else 0

        if is_valid_heading(main_num, branch_num, prev_main, prev_branch):
            accepted.append(m)
            prev_main = main_num
            prev_branch = branch_num

            # 直後に「及び第◯条　削除」「から第◯条まで　削除」が続く場合、
            # そこまでprev_mainを進める（同じ行内に限定して誤検出を防ぐ）
            tail = body_text[m.end():].split("\n", 1)[0]
            compound = COMPOUND_DELETE_AND.match(tail) or COMPOUND_DELETE_RANGE.match(tail)
            if compound:
                prev_main = kanji_to_int(compound.group(1))
                prev_branch = 0
        # 正当でない場合は「本文中の引用」とみなして無視する

    articles = []
    for i, m in enumerate(accepted):
        title = m.group(0)
        start = m.end()
        end = accepted[i + 1].start() if i + 1 < len(accepted) else len(body_text)
        body = body_text[start:end].strip()
        articles.append({
            "article_number": title,
            "body": body,
        })

    return articles


# ============================================================
# 3. Embedding化
# ============================================================

def get_openai_client():
    return AzureOpenAI(
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=os.getenv("AZURE_OPENAI_KEY"),
        api_version="2024-02-01",
    )


def embed_text(client, deployment_name, text):
    response = client.embeddings.create(model=deployment_name, input=text)
    return response.data[0].embedding


# ============================================================
# 4. Azure AI Searchへの登録
# ============================================================

def get_search_client():
    return SearchClient(
        endpoint=os.getenv("AZURE_SEARCH_ENDPOINT"),
        index_name=os.getenv("AZURE_SEARCH_INDEX_NAME"),
        credential=AzureKeyCredential(os.getenv("AZURE_SEARCH_KEY")),
    )


def upload_articles(search_client, openai_client, deployment_name, source_name, articles):
    upload_docs = []
    for i, article in enumerate(articles):
        vector = embed_text(openai_client, deployment_name, article["body"])
        doc_id = hashlib.md5(f"{source_name}_{i}".encode()).hexdigest()

        upload_docs.append({
            "chunk_id": doc_id,
            "parent_id": source_name,
            "chunk": article["body"],
            "title": source_name,
            "header_1": article["article_number"],
            "text_vector": vector,
        })

    search_client.upload_documents(documents=upload_docs)
    print(f"アップロード完了: {len(upload_docs)}件")


# ============================================================
# 実行
# ============================================================

if __name__ == "__main__":
    load_dotenv()

    PDF_PATH = "docs/documents/○○市公有財産管理規則.pdf"
    SOURCE_NAME = "○○市公有財産管理規則"

    full_text = extract_full_text(PDF_PATH)
    articles = split_articles(full_text)

    print(f"分割された条文数: {len(articles)}")
    for a in articles:
        print(f"[{a['article_number']}] {a['body'][:40]}...")

    deployment_name = os.getenv("EMBEDDING_DEPLOYMENT_NAME")

    openai_client = get_openai_client()
    search_client = get_search_client()

    upload_articles(search_client, openai_client, deployment_name, SOURCE_NAME, articles)