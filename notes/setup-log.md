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

## 2026-09-11〜09-12
- 契約リスク判定結果テーブルを新規作成（x_2177386_landle_0_risk_finding、契約バージョンを親として参照）。フィールドはrun_pipeline.pyの実出力に合わせて13項目で確定
- 信頼度ラベル（高/中/低）は仕様書の閾値通りUI側で都度算出する方針に決定（パイプライン出力はスコアのみのため）
- Script Include「ContractRiskFindingAjax」を実装（getFindings/decide/bulkApprove）。AbstractAjaxProcessorパターンを踏襲
- UI Action「リスク判定結果を確認する」を追加。③-Bと同じGlideAjax＋オーバーレイ表示パターンを流用。却下理由はカード内インラインのプルダウン選択方式に決定
- テストデータで個別承認・却下・一括承認の動作を確認済み
- Studioでのテーブル作成時にName欄が二重接頭辞になる不具合が発生し、作成手順を修正して解決

## 2026-09-13
- 契約書PDFの読み込みをローカルパス直読みからBlob Storage経由に変更。extract_full_textをバイト列受け取りに書き換え、download_blob_bytesを新設
- 金額検算の根拠資料をServiceNow標準の添付ファイル機能経由の取得に変更。当初Basic認証で実装したがインスタンス側で許可されておらず403、OAuth（Resource Owner Password Credentials方式）に切り替えて解決
- OAuth Application Registryを新規作成。Scope RestrictionはBroadly scopedにする必要があると判明（Securely scopedだと汎用APIが403）
- run_pipeline.pyのメイン処理を全面改訂。finding単位のCLI承認/却下を廃止し、判定結果をステータス「未確認」でServiceNowへ直接登録する方式に統一
- スコープアプリのカスタムテーブルへAPI経由で書き込むには、呼び出しユーザーにそのスコープ専用のadminロール付与が別途必要と判明
- test-contract-02-v2.pdfで一気通貫の動作確認に成功。全11条文・22件の本物のAI判定結果がServiceNow画面にカード表示され、個別承認・却下・一括承認すべて正常動作を確認
- 見た目重視の要望を踏まえ、左右分割UIの実装先はServiceNow Service Portalウィジェットに決定。Portal「risk_review」・ページ「Risk Review Split」(6/6カラム)を作成
- run_pipeline.py(CLI専用)のメイン処理を全面改訂し、HTTPトリガーのAzure Function `run_risk_extraction` として移植(`azure/risk_extraction_api/`に新設)。対話入力だったuser_notesはリクエストパラメータに変更
- 新規Function App `func-risk-extraction-poc`(rg-landlease-portfolio、Japan East、Flex従量課金、Python 3.12)を作成し、必要な環境変数を全て登録
- マネージドIDを有効化し、セッションプール(`sesspool-landlease-poc`)にAzure ContainerApps Session Executor / 共同作成者ロールを付与
- Azure Functions Core Tools(`func` CLI)経由でデプロイを実施

2026-09-14
- 契約条文テーブルを新規作成（x_2177386_landle_0_contract_article、契約バージョンを親として参照）。フィールドは契約バージョン・条文番号・条文見出し・条文本文の4項目
- 契約リスク判定結果テーブルに条文番号（u_article_number）を追加。findingと条文本文を紐付けるためのキーとして使用
- 左右分割UI（左：条文本文、右：対応するリスク判定カード）の設計を確定。契約全体レベルの指摘（REQ-RISK-001/006/008）は条文番号0（仮想の第0条）として条文一覧の先頭に統合表示する方針に決定
- 条文本文の保存方式は、表示のたびにAzure Function経由で都度取得する案ではなく、run_pipeline.py実行時にServiceNowへ永続化する方式を採用。finding⇔条文の紐付けが結局必須になるため、新規のAzure連携を増やさずに済む点を決め手とした
- run_pipeline.pyを改修（create_servicenow_article関数を追加、create_servicenow_findingにarticle_number引数を追加、契約全体＝第0条の登録処理、条文ループでの番号付け）。test-contract-02-v2.pdfで再実行し、条文番号付きで正常動作を確認（契約条文12件、finding計29件）
- Service Portalウィジェット「Risk Review Split」を新規実装。承認/却下/取消/条文単位の一括承認まで完成。既存Script Include「ContractRiskFindingAjax」をそのままGlideAjax経由で流用し、ロジックの二重管理を回避
- 左右分割はウィジェット間通信（ブロードキャストイベント）を避けるため、1ウィジェット内でCSS flexboxにより実現（2ウィジェット構成は不採用）
-取消（reset）機能、条文単位のbulkApproveArticle（契約全体＝article_number nullも対象に含むaddOrCondition考慮）、却下理由「その他（自由記述）」選択時のテキスト入力欄を追加実装。

2026-09-15
- azure/risk_extraction_api/function_app.py（HTTPトリガー版）に、9/14にrun_pipeline.py（CLI版）へ加えた変更（create_servicenow_article関数、create_servicenow_findingへのarticle_number引数）を移植
- ③契約書アップロード→自動審査を実装。ServiceNowの添付ファイル作成をトリガーにAzure Functionを自動呼び出しする構成にし、function_app.pyに自動起動モード（attachment_sys_idを受け取り、添付ファイルを取得してBlob Storageへ保存してから既存処理を実行）を追加。fetch_servicenow_attachment_by_sys_id・upload_blob_bytesを新設し、func azure functionapp publishでデプロイ
- トリガーは、添付ファイル保存のトランザクションをブロックしないよう非同期構成に決定：Business Rule（sys_attachment、after insert）でgs.eventQueue()によりイベントを発火し、Script Action側でAzure FunctionへのREST呼び出しを実行。画面反映は自動ポーリング、新規バージョンレコードの作成はボタン押下時にServiceNow側で先に行う方針
- ServiceNow側でBusiness Rule「契約書アップロードで自動審査を起動」、Event Registration「x_2177386_landle_0.attachment_uploaded」、Script Action「契約書自動審査の呼び出し」、REST Message「LandLease Risk Extraction API」を新規作成
- 契約書PDFの添付アップロード→Business Rule→イベント発火→Script Action→Azure Function呼び出し→AI判定→ServiceNowへの書き戻しという流れが自動で動作することをエンドツーエンドで確認。契約リスク判定結果テーブルにREQ-RISK-001等の実データが自動登録されることを確認
- テスト時のデータ重複が契約条文・契約リスク判定結果テーブルに発生。削除は次回に持ち越し
- Risk Review Splitウィジェットへの「修正版PDF再アップロード」UI追加を設計（body_html.htmlに再アップロードエリア、client_script.jsにXMLHttpRequestによるAttachment API直接呼び出し処理を追加する案）。ただしウィジェット自体が別途大幅改修されており（未確認/要修正の2段階ステータス、バッジ2種、メモ欄、一括処理ボタン、アコーディオン等）、今回の案は未適用。次回はその最新版をベースに組み込む

2026-09-16
- ワークフロー（期日管理・通知機能）の実装方針を決定。契約更新の系統のみ対象とし、通知は所管課への1回に統合。所管課が更新／変更／終了を判断→資産経営課のTODOリストへ→契約基本情報画面→前回契約書DL→リスク抽出画面という流れで設計。フェーズA〜F（保留）に分割
- 事前通知タイミングはAIが契約書から読み取る方式に決定（契約書記載の月数＋3か月マージン、記載なしなら終了日6か月前）
- フェーズA実装：契約プロファイル抽出（extract_contract_profile）に事前通知期間の抽出を追加し、run_pipeline.py・function_app.py両方に反映、Azureへデプロイ
- ServiceNowの契約バージョンテーブルに「事前通知月数」フィールドを新規追加

2026-09-17
* デモ用のリスク入り契約書（土地賃貸借契約書・別紙1賃料算定資料・別紙2カフェ運営協定書）を新規作成。REQ-RISK-001〜008に加え、条文間の重複・矛盾を検出する新チェック観点REQ-RISK-009を仕様書に追加
* 契約書アップロード→自動審査の一連の流れを新規実装。「契約作業ワークスペース」ウィジェット（基本情報表示・編集、経緯メモ入力、契約書・関連資料のアップロード、契約書チェックボタン）を新規作成し、ボタン押下で新しい契約バージョンを自動作成・ファイル添付・Azure Function呼び出しまで行うように構築
* Business Rule・Script Actionの発火条件を修正し、アップロード→自動審査→Risk Review Split画面への自動遷移という一気通貫の動作を実際に確認
* Azure Function側に再審査時のクリーンアップ処理を追加（同一バージョンへの再アップロードで判定結果が重複しないように対応）
* Risk Review Split画面のデザインをServiceNowブランドカラーに刷新
* リポジトリ内の試作スクリプト・不要ファイルを整理（削除、.gitignoreにキャッシュ除外を追記）
* 契約案件・契約バージョンのデータ設計上の制約（相手方担当者名は契約案件に一元化しており、バージョンごとの履歴は残らない）を確認。今回はシンプルさを優先しこの設計のまま運用する方針とした

## 2026-09-18
- ①〜⑥再編を実装：run_pipeline.pyのCONTRACT_LEVEL_CHECK_IDS・ARTICLE_LEVEL_CHECK_IDSおよび判定プロンプトを、REQ-RISK-XXXから①〜⑥に書き換え
- Groundedness関連コードを全面撤去：run_pipeline.pyからcheck_groundedness関数・信頼度スコア算出ロジック(confidence/confidence_source/is_grounded)を削除し、evaluate_findingsを簡素化。ServiceNowへの書き込み(u_confidence等)も停止
- Risk Review Splitウィジェット(サーバースクリプト・body_html.html)から信頼度バッジ・根拠表示(confidence/confidence_source)を削除
- 契約作業ワークスペースの不具合を修正：関連資料(別紙)のBase64変換完了前に送信できてしまうレースコンディションを解消(relatedFilesLoadingフラグを追加し、変換完了まで送信ボタンを無効化・読み込み中インジケーターを表示)
- 契約書チェックのsubmit処理の不具合を修正：Azure Function呼び出し(RESTMessageV2.execute())が既定タイムアウト(約4分)を超えて接続断になった際、失敗をログに残すのみで成功扱いにしてしまい、AI判定が完了しきっていない状態でRisk Review Split画面へ遷移し白画面になる不具合を特定。タイムアウトを10分に延長し、失敗時はsuccess:falseを返すよう修正。あわせてfinding件数ベースのポーリングを廃止し、submit成功時に直接遷移する方式に変更
- 非同期化に着手
  - Azure Storage Queue(risk-extraction-jobs)を新規作成
  - function_app.pyを「受付」(HTTPトリガー。リクエストをキューに積んで202を即時応答)と「実処理」(Queueトリガー。従来の処理をそのまま移植)の2関数に分割し、処理完了/失敗をServiceNowへ通知するnotify_servicenow_completionを追加
  - requirements.txtにazure-storage-queueを追加
  - ServiceNow側の受け口としてScripted REST API「LandLease Risk Extraction Callback」(receive_completionリソース、POST、認証必須・ACL認可なし)を新規作成
  - 契約バージョンテーブルにu_processing_status(Choice: unstarted/processing/completed/failed)、u_processing_error(String)フィールドを追加
 
 2026-09-19 作業ログ
 ## 2026-09-19
- 非同期化を実装：Azure Storage Queue（risk-extraction-jobs）を新設し、run_risk_extraction（HTTPトリガー）を受付専用に変更（キューに積んで202を即時応答）。実処理はprocess_risk_extraction_job（Queueトリガー）に分離し、完了/失敗はServiceNow側の新規Scripted REST API「LandLease Risk Extraction Callback」経由で通知する方式に変更
- 契約バージョンテーブルにu_processing_status（Choice）・u_processing_error（String）フィールドを追加。ServiceNow側のsubmitアクションをRESTMessageV2の202判定に、クライアント側のポーリングをfinding件数ベースからu_processing_statusベースに変更
- Azure FunctionsのFlex ConsumptionプランでQueueトリガーが発火しない不具合を修正：host.jsonのextensionBundle欠落、およびQueueメッセージのエンコード方式不一致（messageEncoding: none）の2点を特定・修正
- Flex Consumptionプラン自体の不安定さが解消しなかったため、標準のConsumptionプラン（Linux）でfunc-risk-extraction-poc-v2を新規作成し、環境変数を移設して本番系を切り替え
- 契約作業ワークスペースのServer Scriptで、input.actionが常にundefinedになりsubmitアクションが機能しない不具合を特定・修正（この環境ではinputがactionPayloadを含むdata全体になるため、input.actionPayloadの形で正規化する対応を追加）
- 契約バージョンの表示名が生成されない不具合を調査。原因となっていたBusiness Rule「契約バージョン表示名の自動生成」の中身が別処理（旧添付ファイル起動ロジック）に上書きされていたことを特定し、過去バージョンから復元。あわせて契約作業ワークスペースのサーバースクリプト側でも表示名を直接生成するよう変更
- Risk Review Splitのクライアントスクリプトに契約作業ワークスペース用コードが誤って上書きされていた事故を発見・復元
- Risk Review Splitのサーバースクリプト・body_html.htmlから信頼度バッジ・根拠表示（confidence/confidence_source）を削除
- 上記対応により、契約作業ワークスペースからの「契約書チェック」→非同期受付→AI判定（11条文完走）→ServiceNowへの完了通知→Risk Review Split画面への自動遷移までの一連の流れを実機確認
- 引継ぎメモを更新（次回最優先: func-risk-extraction-poc-v2への①〜⑥再編＋Groundedness撤去の反映）
- `func-risk-extraction-poc-v2`のマネージドID未有効化によるエラーを解消（有効化＋セッションプールへのロール付与＋リトライ処理追加）
- 別紙（ファイル名に「別紙」を含む添付）の内容をAI判定（①〜⑥）に反映したが、リスク抽出画面に表示されていない。
- Risk Review Split画面の指摘表示を、REQ-RISK-XXXの生ID表示から①〜⑥の分類名表示に変更
- `requirements.txt`のライブラリ記載漏れ（`openai`等）を修正し、Function App自体が起動しない不具合を解消
- `contract_workspace`の`callServer`関数のレスポンス解析バグを修正し、submit後に「審査中です」の表示が出るようになった