(function executeRule(current, previous /*null when async*/) {
    if (current.getValue('table_name') != 'x_2177386_landle_0_contract_version') {
        return;
    }

    var versionGr = new GlideRecord('x_2177386_landle_0_contract_version');
    if (!versionGr.get(current.getValue('table_sys_id'))) {
        return;
    }

    // 契約書本体として指定された添付ファイルでなければ、審査を起動しない
    // （関連資料など、他の添付ファイルのアップロードでは発火させない）
    var attachmentSysId = current.getValue('sys_id');
    var pdfAttachmentId = versionGr.getValue('u_contract_pdf_attachment');
    if (!pdfAttachmentId || pdfAttachmentId != attachmentSysId) {
        return;
    }

    var versionNumber = versionGr.getValue('version_number');
    var blobPath = current.getValue('table_sys_id') + '_v' + versionNumber + '.pdf';
    versionGr.setValue('blob_path', blobPath);
    versionGr.update();

    gs.eventQueue(
        'x_2177386_landle_0.attachment_uploaded',
        versionGr,
        attachmentSysId,
        blobPath
    );
})(current, previous);