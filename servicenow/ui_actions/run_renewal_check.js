var result = new RenewalCheckCreator().run();

gs.addInfoMessage(
    '期日チェック完了：起票 ' + result.created + ' 件 / 期日未到来 ' + result.not_yet +
    ' 件 / 起票済み ' + result.skipped_existing + ' 件 / 所管課未設定 ' + result.skipped_no_dept +
    ' 件 / 事前通知月数なし ' + result.skipped_no_months + ' 件'
);