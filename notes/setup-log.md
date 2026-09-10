# 構築ログ

## 2026-09-03
- リソースグループ作成：rg-landlease-portfolio（Japan East）
- Foundryリソース作成：aoai-landlease-poc
- デフォルトプロジェクト：proj-default
- モデルデプロイ：gpt-5-mini（動作確認済み）
- サブスクリプション：Azure for Students（AOAI利用可能なことを確認）

## 2026-09-04
- リソース作成：リソースグループ、Foundry(Azure OpenAI)、Blob Storage、AI Search
- モデルデプロイ：gpt-5-mini、text-embedding-3-large
- AI Searchの自動チャンク分割はページ単位となり、条文単位の分割は不可と判明
  → Pythonスクリプトを自作し、正規表現で条文単位に分割、Push方式でインデックスへ直接登録する方式に変更
- リスク抽出パイプライン(run_pipeline.py)を実装
  - GPT-5-miniによるリスク判定(Self-Consistency：3回判定→多数派一致率を確信度化)
  - リスクスコア0-100点(5段階の採点基準をプロンプトに明記)
  - Groundedness検出(Azure AI Content Safety)による根拠検証
    - 検証用サブスクリプションの許可リージョンとGroundedness検出の対応リージョンが一致しなかったため、東部リージョン用に別サブスクリプションを用意して対応
  - 11条文全件で動作確認済み
- リポジトリ構成整理：docs/notes/servicenow/azureフォルダに分割、GitHub Pages公開設定を修正

## 2026-09-05
- 判定フロー修正：Groundedness検証→条件付きSelf-Consistency検証の2段階フローに変更（無条件で両方実行していたロジックを見直し）
- 信頼度スコアの統合ルールを確定：Groundedness通過時はそのスコアを採用、不通過時のみSelf-Consistencyの一致率を採用
- テストスクリプト（test_groundedness.py）を作成し、判定ロジックが実際に機能するか検証
- Groundedness検証のreasoning機能を試行
  - Content SafetyのマネージドID有効化、Azure OpenAIへのロール割り当て（Cognitive Services User）を設定
  - 対応必須とされるGPT-4o（0513・0806）が両バージョンとも既に廃止済み（新規デプロイ不可）と判明。別サブスクリプション（PAYG、East US 2）でも同様の結果を確認
  - 公式ドキュメントの記載と実際の提供状況に齟齬があることを、REST版ドキュメントの該当箇所で確認
  - reasoning=false（簡易検証）での運用を決定。

## 2026-09-06
- 契約プロファイル抽出を実装：条文分割前に契約書全文からAI1回で相手方属性・契約期間・用途・地代水準を抽出し、以降の判定に前提情報として付与
- 担当者による自由記述の補足情報入力を実装：System/Userメッセージ分離により、参考情報として扱いプロンプトインジェクションを防止
- REQ-RISK-001〜008を実装：契約全体レベル(001, 006, 008)と条文単位(002〜005, 007)の2判定プロセスに分離し、同一指摘の重複検出を解消
- Recall優先／Precision優先の運用方針、REQ-RISK-003(定性表現)の裁量とのバランス評価基準をプロンプトに反映
- OTHER(その他の潜在的リスク)の運用基準を追加：重複禁止・手続き上の軽微な不備除外・スコア61点以上に限定
- 信頼度スコアの算出方式を単純化：Self-Consistency(3回再実行)を廃止し、根拠検証NG時は信頼度50%固定の「要確認」フラグ方式に変更
- Structured Outputs(JSON Schema, strict)を導入：APIバージョンを2024-08-01-previewに更新し、check_idをenumで制約
- 各findingに根拠引用(citation)を追加：原文からの直接引用(20〜40文字程度)を提示

## 2026-09-07
- 規則データの条文分割ロジックを拡張：漢数字(第一条等)・枝番(第五条の二等)に対応し、他法令への条文引用を実際の条文境界と誤検出しないよう、行頭判定+番号の順序性フィルタを追加
- 東京都公有財産規則(実在・公開データ)を用いて分割ロジックを実データ検証、契約書側の分割結果に回帰がないことも確認
- ①(リスク抽出)と③(ナレッジ蓄積)の役割分担を整理：規則データの参照は①のRAGソースの一部、契約固有の経緯・引継ぎ情報は③として完全に独立した機能とする方針を決定
- ③-B「引継ぎビューア」を設計：新規テーブルは作らず、既存の契約案件/契約バージョンの親子構造をそのまま活用。前回バージョンの特定はクエリで実施
- 前回バージョンとの差分検出ロジック(compare_with_previous_version)を実装：AIを使わない決定的な処理とし、文字単位で変更箇所のみを赤字にしたHTMLを生成
- テスト契約書の更新版(test-contract-02-v2.pdf、賃料改定+一文追加)を作成し、11条文中1条文のみが正しくchangedと検出されることをエンドツーエンドで確認
- 差分検出ロジックをAzure Function化(function_app.py)：ServiceNowからBlob Storage上のパスを渡すとJSON形式で差分結果を返すAPIとして実装。デプロイパッケージの独立性を優先し、run_pipeline.pyとはコードを意図的に複製
- Azureポータルで関数アプリを作成
- Azure Functions(func-version-diff-poc、Flex従量課金、Python 3.12)を作成し、VS Codeからfunction_app.py一式をデプロイ
- Blob Storage(stlandleasepoc/contracts)にテスト用契約書2点をアップロード
- デプロイ後のAPI呼び出しで404エラーが発生。ログストリームで原因を切り分け：
  - 環境変数(AZURE_STORAGE_CONNECTION_STRING)の保存漏れ
  - 「アクセスキー」と「接続文字列」の取り違え
  の2段階の問題を特定・修正
- Azureポータルの「コードとテスト」機能で実行し、ローカル検証と同じ結果(11条文中1条文のみchanged)がAPI経由で再現できることを確認。③-Bの差分検出APIが実際に呼び出し可能な状態になった

## 2026-09-09
- ServiceNow Studioで新規アプリケーション「LandLease Risk Control」を作成(Scoped App)
- 契約案件テーブル(親)を新規作成
  - 契約相手方名称、相手方担当者名、相手方連絡先、貸付対象地を追加
  - 現行契約バージョン(Reference→契約バージョン)を追加し、親→子の参照を接続
- 契約バージョンテーブル(子)を新規作成
  - 契約案件(Reference→契約案件)、バージョン種別、契約締結日、契約開始日、契約終了日、通知期限、ステータスを追加
- 経緯メモ・リスク判定却下理由・所管課やり取り履歴・金額検算履歴/差異理由の4フィールドをJournal型で追加
  - 日時・入力者付きの追記式ログとして記録される想定

## 2026-09-10
- 契約案件テーブルにテストレコード作成（L0001003）。貸付目的をDisplay値に設定
- 契約バージョンテーブルにバージョン1・2を作成し、Journal型フィールドの自動記録を確認
- 契約バージョンテーブルにバージョン番号（Integer）・契約書Blobパス（String）を追加
- ③-B差分表示ボタンのServiceNow側実装を完了
  - REST Message「Contract Version Diff API」、Script Include「ContractVersionDiffAjax」、UI Action「差分を確認する」を作成し、画面内オーバーレイで差分をハイライト表示
  - スコープアプリ特有の制約を確認：global.AbstractAjaxProcessorの必要性、response.responseXML不使用（responseTextを正規表現パース）、window.open()不可（document.createElementでオーバーレイ生成）、top.documentのフォールバック
- 契約バージョン表示名の自動生成Business Ruleの不具合を解消
  - 原因はBR設定ではなく、切り分けテストで実在しないフィールドを更新していたため`gr.update()`が実質無変更となりBR自体がスキップされていたこと。実在フィールドで再テストし表示名生成を確認
- RAG接続（REQ-RISK-006向け）を実装
  - regulation_ingest.pyを新規作成し、東京都公有財産規則を条文単位（漢数字・枝番・複合削除見出し対応）に分割してAzure AI Searchへ登録。本条47件＋枝番11件＝58条文を欠落なく登録できることを実データ検証
  - run_pipeline.pyに、契約書中の法令引用を抽出しAzure AI Searchから該当条文を取得してREQ-RISK-006判定に組み込む処理を実装
  - header_1フィールドがfilterable属性でないため`$filter`が使えないと判明 → 全文検索＋完全一致チェック方式に変更
- OTHERの過検出を軽減：契約書全体に共通する欠落は条文単位で繰り返し指摘しない旨をプロンプトに追加し、検出数が11条中6条→5条に減少することを確認（さらなる調整はUI実装後に実契約書で判断）
- 金額検算機能（仕様書5章⑵②）を実装
  - Azure Container Apps セッションプール（sesspool-landlease-poc、Code interpreter/PythonLTS、East US 2）を新規作成
  - 認可に"Session Executor"に加え"Contributor"ロールも必要と判明。ドキュメント記載の最新API（/executions、2025-10-02-preview）は実機で動作せず、旧API（/code/execute、2024-02-02-preview）を採用（ドキュメントと実装の乖離を実機確認）
  - AIが算定根拠から算定ロジックを組み立て、計算はセッションプール側で実行する設計で実装。テスト契約書で検算結果1,125,000円・記載額1,200,000円・差異75,000円の検出を確認
- フィードバックループ機能（仕様書5章⑵④）を実装
  - finding単位の承認/却下フローをCLIで実装（一括承認＋定型理由5カテゴリ選択で入力負荷を軽減）
  - 判定履歴をnotes/decision_log.jsonlに記録し、却下事例のみAzure AI Searchへナレッジ登録（判定プロンプト側からの参照は未実装、今後の課題）
  - decision_log.jsonlの集計によるモニタリング機能（累計却下率、信頼度スコア帯別却下率）を実装。推移の把握は実行回数蓄積後の課題として保留

