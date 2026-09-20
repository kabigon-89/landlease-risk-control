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
    // 4. 所管課への案文確認の依頼（2026-09-20追加）
    else if (input.action === 'request_draft_check') {
      var reqRenewal = new GlideRecord('x_2177386_landle_0_renewal_check');
      if (!reqRenewal.get(input.renewal_check_id) || reqRenewal.getValue('u_status') != 'waiting_asset') {
        result.success = false;
        result.error = '対応中の更新確認が見つかりません。';
      } else {
        var reqCase = reqRenewal.u_contract_case.getRefRecord();
        if (!reqCase.isValidRecord() || reqCase.getValue('current_version') != input.version_id) {
          result.success = false;
          result.error = '最新の契約バージョンではないため、依頼できません。';
        } else if (!reqCase.getValue('u_dept_group')) {
          result.success = false;
          result.error = '契約案件に所管課が設定されていません。';
        } else {
          var reqPending = new GlideRecord('x_2177386_landle_0_draft_check');
          reqPending.addQuery('u_renewal_check', reqRenewal.getUniqueValue());
          reqPending.addQuery('u_status', 'waiting_dept');
          reqPending.setLimit(1);
          reqPending.query();

          if (reqPending.hasNext()) {
            result.success = false;
            result.error = 'すでに所管課へ確認を依頼済みです。';
          } else {
            var reqDraft = new GlideRecord('x_2177386_landle_0_draft_check');
            reqDraft.initialize();
            reqDraft.setValue('u_renewal_check', reqRenewal.getUniqueValue());
            reqDraft.setValue('u_contract_version', input.version_id);
            reqDraft.setValue('u_assigned_group', reqCase.getValue('u_dept_group'));
            reqDraft.setValue('u_status', 'waiting_dept');
            reqDraft.setValue('u_request_comment', input.comment || '');
            reqDraft.insert();
          }
        }
      }
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

  // --- 所管課への案文確認の依頼に必要な情報（2026-09-20追加） ---
  // 現行バージョンを開いていて、対応中(資産経営課対応中)の更新確認があり、
  // その更新確認の対象バージョンより新しい場合だけ、依頼ボタンを出す。
  data.renewalCheckId = '';
  data.renewalNumber = '';
  data.draftStatus = '';
  data.returnedComment = '';
  data.canRequest = false;

  var caseOfVersion = versionGr.contract_case.getRefRecord();
  if (caseOfVersion.isValidRecord() && caseOfVersion.getValue('current_version') == versionSysId) {
    var renewalGr = new GlideRecord('x_2177386_landle_0_renewal_check');
    renewalGr.addQuery('u_contract_case', versionGr.getValue('contract_case'));
    renewalGr.addQuery('u_status', 'waiting_asset');
    renewalGr.addQuery('u_dept_decision', '!=', 'terminate');
    renewalGr.orderByDesc('u_answered_at');
    renewalGr.setLimit(1);
    renewalGr.query();

    if (renewalGr.next() && renewalGr.getValue('u_contract_version') != versionSysId) {
      data.renewalCheckId = renewalGr.getUniqueValue();
      data.renewalNumber = renewalGr.getValue('number');

      var latestDraft = new GlideRecord('x_2177386_landle_0_draft_check');
      latestDraft.addQuery('u_renewal_check', renewalGr.getUniqueValue());
      latestDraft.orderByDesc('sys_created_on');
      latestDraft.setLimit(1);
      latestDraft.query();
      if (latestDraft.next()) {
        data.draftStatus = latestDraft.getValue('u_status') || '';
        if (data.draftStatus == 'returned') {
          data.returnedComment = latestDraft.getValue('u_dept_comment') || '';
        }
      }
      data.canRequest = (data.draftStatus != 'waiting_dept' && data.draftStatus != 'confirmed');
    }
  }
})();