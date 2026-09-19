(function() {
  if (input && input.action) {
    var result = { success: true };

    // 1. ステータス変更
    if (input.action === 'decide') {
      var findRec = new GlideRecord('x_2177386_landle_0_risk_finding');
      if (findRec.get(input.finding_id)) {
        findRec.setValue('u_status', input.decision);
        findRec.update();
      } else {
        result.success = false;
        result.error = '対象の指摘レコードが見つかりません。';
      }
    } 
    // 2. メモ保存
    else if (input.action === 'save_memo') {
      var memoRec = new GlideRecord('x_2177386_landle_0_risk_finding');
      if (memoRec.get(input.finding_id)) {
        memoRec.setValue('u_rejection_reason', input.memo);
        memoRec.update();
      } else {
        result.success = false;
        result.error = '対象の指摘レコードが見つかりません。';
      }
    }
    // 3. 一括修正不要
    else if (input.action === 'bulkDismissArticle') {
      var targetNum = parseInt(input.article_number, 10);
      var bulkRec = new GlideRecord('x_2177386_landle_0_risk_finding');
      bulkRec.addQuery('u_contract_version', input.version_id);
      bulkRec.addQuery('u_status', 'unconfirmed');

      if (targetNum === 0) {
        var qc = bulkRec.addNullQuery('u_article_number');
        qc.addOrCondition('u_article_number', 0);
      } else {
        bulkRec.addQuery('u_article_number', targetNum);
      }
      
      // updateMultiple を使うことでループを回さず一括更新
      bulkRec.setValue('u_status', 'dismissed');
      bulkRec.updateMultiple();
    }

    data.ajaxResult = result;
    return;
  }

  // --- 初期ロード ---
  var versionSysId = $sp.getParameter('version');
  data.versionSysId = versionSysId || '';

  if (!versionSysId) {
    data.error = 'URLパラメータ「version」が指定されていません。';
    return;
  }

  var versionGr = new GlideRecord('x_2177386_landle_0_contract_version');
  if (!versionGr.get(versionSysId)) {
    data.error = '指定された契約バージョンが見つかりません。';
    return;
  }
  data.versionLabel = versionGr.getDisplayValue();
  data.error = '';

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

  data.findings = [];
  var findGr = new GlideRecord('x_2177386_landle_0_risk_finding');
  findGr.addQuery('u_contract_version', versionSysId);
  findGr.orderBy('u_article_number');
  findGr.query();
  while (findGr.next()) {
    var itemStatus = findGr.getValue('u_status') || 'unconfirmed';
    data.findings.push({
      sys_id: findGr.getUniqueValue(),
      article_number: findGr.getValue('u_article_number') ? parseInt(findGr.getValue('u_article_number'), 10) : 0,
      check_id: findGr.getValue('u_check_id'),
      risk_score: findGr.getValue('u_risk_score'),
      risk_level: findGr.getValue('u_risk_level'),
      reason: findGr.getValue('u_reason'),
      citation: findGr.getValue('u_citation'),
      status: itemStatus,
      memo: findGr.getValue('u_rejection_reason') || ''
    });
  }
})();