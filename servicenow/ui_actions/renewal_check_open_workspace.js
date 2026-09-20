var verId = current.getValue('u_contract_version');

if (verId) {
    action.setRedirectURL('/risk_review?id=contract_workspace&version=' + verId);
} else {
    gs.addErrorMessage('対象の契約バージョンが設定されていません。');
    action.setRedirectURL(current);
}