if (!current.getValue('u_dept_comment')) {
    gs.addErrorMessage('差し戻す場合は、所管課コメントに理由を入力してください。');
    action.setRedirectURL(current);
} else {
    current.u_status = 'returned';
    current.u_answered_at = new GlideDateTime();
    current.update();
    action.setRedirectURL('/risk_review?id=landlease_home');
}