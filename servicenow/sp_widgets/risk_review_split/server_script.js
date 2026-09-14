(function() {
  // 1. クライアントからの更新要求（承認・却下・取消・条文ごとの一括承認）
  if (input && input.action) {
    var result = { success: true };

    if (input.action === 'decide') {
      var findRec = new GlideRecord('x_2177386_landle_0_risk_finding');
      if (findRec.get(input.finding_id)) {
        if (input.decision === 'reset') {
          findRec.setValue('u_status', 'unconfirmed');
          findRec.setValue('u_rejection_reason', '');
        } else {
          findRec.setValue('u_status', input.decision);
          if (input.decision === 'rejected') {
            findRec.setValue('u_rejection_reason', input.rejection_reason);
          }
        }
        findRec.update();
      } else {
        result = { success: false, error: 'レコードが見つかりません' };
      }
    } else if (input.action === 'bulkApproveArticle') {
      var targetNum = parseInt(input.article_number, 10);
      var bulkRec = new GlideRecord('x_2177386_landle_0_risk_finding');
      bulkRec.addQuery('u_contract_version', input.version_id);
      bulkRec.addQuery('u_status', 'unconfirmed');

      // 0（契約全体）の場合は null または 0 のレコードを対象にする
      if (targetNum === 0) {
        var qc = bulkRec.addQuery('u_article_number', 0);
        qc.addOrCondition('u_article_number', null);
      } else {
        bulkRec.addQuery('u_article_number', targetNum);
      }

      bulkRec.query();
      while (bulkRec.next()) {
        bulkRec.setValue('u_status', 'approved');
        bulkRec.update();
      }
    }

    data.ajaxResult = result;
    return;
  }

  // 2. 初期ロード：URLパラメータの取得
  var versionSysId = $sp.getParameter('version');
  data.versionSysId = versionSysId || '';

  if (!versionSysId) {
    data.error = 'URLパラメータ「version」が指定されていません。';
    data.articles = [];
    data.findings = [];
    return;
  }

  // 3. 契約バージョンの取得
  var versionGr = new GlideRecord('x_2177386_landle_0_contract_version');
  if (!versionGr.get(versionSysId)) {
    data.error = '指定された契約バージョンが見つかりません。';
    data.articles = [];
    data.findings = [];
    return;
  }

  data.versionLabel = versionGr.getDisplayValue();
  data.error = '';

  // 4. 条文データの取得
  data.articles = [];
  var artGr = new GlideRecord('x_2177386_landle_0_contract_article');
  artGr.addQuery('u_contract_version', versionSysId);
  artGr.orderBy('u_article_number');
  artGr.query();
  while (artGr.next()) {
    data.articles.push({
      number: parseInt(artGr.getValue('u_article_number'), 10),
      title: artGr.getValue('u_article_title'),
      text: artGr.getValue('u_article_text')
    });
  }

  // 5. リスク指摘の取得
  data.findings = [];
  var findGr = new GlideRecord('x_2177386_landle_0_risk_finding');
  findGr.addQuery('u_contract_version', versionSysId);
  findGr.orderBy('u_article_number');
  findGr.query();
  while (findGr.next()) {
    data.findings.push({
      sys_id: findGr.getUniqueValue(),
      article_number: findGr.getValue('u_article_number') ? parseInt(findGr.getValue('u_article_number'), 10) : 0,
      check_id: findGr.getValue('u_check_id'),
      risk_score: findGr.getValue('u_risk_score'),
      risk_level: findGr.getValue('u_risk_level'),
      reason: findGr.getValue('u_reason'),
      score_reason: findGr.getValue('u_score_reason'),
      citation: findGr.getValue('u_citation'),
      confidence: findGr.getValue('u_confidence'),
      confidence_source: findGr.getValue('u_confidence_source'),
      status: findGr.getValue('u_status'),
      rejection_reason: findGr.getDisplayValue('u_rejection_reason')
    });
  }

  // 6. 却下理由リスト
  data.rejectionReasons = [
    '実務上許容範囲内である（軽微な指摘）',
    '契約書の他の条項・運用で既に手当てされている',
    'この物件・相手方の特性上、リスクが当てはまらない',
    '所管課・法務等に確認済みで問題ないと判断された',
    'その他（自由記述）'
  ];
})();