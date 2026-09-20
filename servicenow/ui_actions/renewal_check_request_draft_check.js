var caseGr = current.u_contract_case.getRefRecord();
var oldVerId = current.getValue('u_contract_version');
var newVerId = caseGr.isValidRecord() ? caseGr.getValue('current_version') : '';

if (!newVerId || newVerId == oldVerId) {
    gs.addErrorMessage('新しい契約書のチェックがまだ行われていません。契約作業画面で契約書チェックを行ってください。');
} else {
    var pending = new GlideRecord('x_2177386_landle_0_draft_check');
    pending.addQuery('u_renewal_check', current.getUniqueValue());
    pending.addQuery('u_status', 'waiting_dept');
    pending.setLimit(1);
    pending.query();

    if (pending.hasNext()) {
        gs.addErrorMessage('すでに所管課へ確認を依頼済みです。');
    } else {
        var dc = new GlideRecord('x_2177386_landle_0_draft_check');
        dc.initialize();
        dc.setValue('u_renewal_check', current.getUniqueValue());
        dc.setValue('u_contract_version', newVerId);
        dc.setValue('u_assigned_group', caseGr.getValue('u_dept_group'));
        dc.setValue('u_status', 'waiting_dept');
        dc.insert();
        gs.addInfoMessage('所管課へ案文の確認を依頼しました。');
    }
}

action.setRedirectURL(current);