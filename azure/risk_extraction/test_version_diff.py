"""
③-B「引継ぎビューア」の差分検出を、実際の契約書PDF2つ(前回バージョン・今回バージョン)で
エンドツーエンドで確認するテストスクリプト。

やっていること:
  1. 前回バージョン・今回バージョンそれぞれのPDFを読み込み、条文単位に分割する
  2. 条文タイトル(第N条)を突き合わせて、両方に存在する条文同士を比較する
  3. 各条文について、変更箇所を赤字にしたHTMLを生成する
  4. 結果を1つのHTMLファイルにまとめ、ブラウザで見た目を確認できるようにする

実行方法(リポジトリのルートで):
  python azure/risk_extraction/test_version_diff.py
"""

from run_pipeline import extract_full_text, split_into_articles, compare_with_previous_version

PREVIOUS_PDF = "docs/documents/test-contract-02.pdf"
CURRENT_PDF = "docs/documents/test-contract-02-v2.pdf"
OUTPUT_HTML = "version_diff_result.html"

previous_text = extract_full_text(PREVIOUS_PDF)
current_text = extract_full_text(CURRENT_PDF)

previous_articles = {a["title"]: a["body"] for a in split_into_articles(previous_text)}
current_articles = split_into_articles(current_text)

html_rows = []
for article in current_articles:
    title = article["title"]
    current_body = article["body"]
    previous_body = previous_articles.get(title)

    if previous_body is None:
        # 前回バージョンに存在しない、新規追加された条文
        diff_html = f'<span style="color:red">{current_body}</span>'
        note = "(新規追加)"
    elif previous_body == current_body:
        diff_html = current_body
        note = ""
    else:
        diff_html = compare_with_previous_version(previous_body, current_body)
        note = "(変更あり)"

    html_rows.append(f"<h3>{title} {note}</h3><p>{diff_html}</p>")

with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
    f.write("<html><body style='font-family:sans-serif;line-height:1.8;'>")
    f.write("<h2>前回バージョンとの差分(赤字が変更箇所)</h2>")
    f.write("".join(html_rows))
    f.write("</body></html>")

print(f"差分結果を {OUTPUT_HTML} に出力しました。ブラウザで開いて確認してください。")

# コンソールにも、変更があった条文だけサマリ表示する
print()
print("=== 変更があった条文 ===")
for article in current_articles:
    title = article["title"]
    previous_body = previous_articles.get(title)
    if previous_body is None:
        print(f"{title}: 新規追加")
    elif previous_body != article["body"]:
        print(f"{title}: 変更あり")
