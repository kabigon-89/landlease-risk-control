var verId = current.getValue('u_contract_version');
var attId = '';

if (verId) {
    var att = new GlideSysAttachment().getAttachments('x_2177386_landle_0_contract_version', verId);
    while (att.next()) {
        var name = att.getValue('file_name') || '';
        if (name.toLowerCase().indexOf('.pdf') > -1 && name.indexOf('別紙') == -1) {
            attId = att.getUniqueValue();
            break;
        }
    }
}

if (attId) {
    action.setRedirectURL('/sys_attachment.do?sys_id=' + attId);
} else {
    gs.addErrorMessage('契約書PDFが見つかりませんでした。');
    action.setRedirectURL(current);
}