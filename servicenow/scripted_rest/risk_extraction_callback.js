(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {

    var body = request.body.data;

    if (!body || !body.version_sys_id) {
        response.setStatus(400);
        response.setBody({ error: 'version_sys_id が指定されていません' });
        return;
    }

    var versionGr = new GlideRecord('x_2177386_landle_0_contract_version');
    if (!versionGr.get(body.version_sys_id)) {
        response.setStatus(404);
        response.setBody({ error: '指定された契約バージョンが見つかりません' });
        return;
    }

    versionGr.setValue('u_processing_status', body.success ? 'completed' : 'failed');
    versionGr.setValue('u_processing_error', body.success ? '' : (body.error || ''));
    versionGr.update();

    gs.info('契約バージョン ' + body.version_sys_id + ' の処理完了通知を受信しました: ' +
        (body.success ? 'completed' : ('failed - ' + body.error)));

    response.setStatus(200);
    response.setBody({ result: 'ok' });

})(request, response);