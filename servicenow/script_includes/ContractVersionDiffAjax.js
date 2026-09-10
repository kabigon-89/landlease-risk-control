var ContractVersionDiffAjax = Class.create();
ContractVersionDiffAjax.prototype = Object.extendsObject(global.AbstractAjaxProcessor, {

    getDiff: function() {
        var versionSysId = this.getParameter('sysparm_version_id');
        var versionGr = new GlideRecord('x_2177386_landle_0_contract_version');
        if (!versionGr.get(versionSysId)) {
            return JSON.stringify({error: '対象のバージョンが見つかりません'});
        }

        var currentVersionNumber = versionGr.getValue('version_number');
        var contractCaseId = versionGr.getValue('contract_case');
        var currentBlobPath = versionGr.getValue('blob_path');

        if (!currentVersionNumber || !currentBlobPath) {
            return JSON.stringify({error: 'バージョン番号または契約書Blobパスが未設定です'});
        }

        var prevGr = new GlideRecord('x_2177386_landle_0_contract_version');
        prevGr.addQuery('contract_case', contractCaseId);
        prevGr.addQuery('version_number', parseInt(currentVersionNumber) - 1);
        prevGr.query();

        if (!prevGr.next()) {
            return JSON.stringify({error: '前のバージョンが見つかりません(これが最初のバージョンです)'});
        }

        var previousBlobPath = prevGr.getValue('blob_path');
        if (!previousBlobPath) {
            return JSON.stringify({error: '前バージョンの契約書Blobパスが未設定です'});
        }

        try {
            var request = new sn_ws.RESTMessageV2('Contract Version Diff API', 'compare_versions');
            request.setStringParameterNoEscape('previous_blob_path', previousBlobPath);
            request.setStringParameterNoEscape('current_blob_path', currentBlobPath);

            var response = request.execute();
            var httpStatus = response.getStatusCode();
            var responseBody = response.getBody();

            return JSON.stringify({
                status: httpStatus,
                body: responseBody
            });
        } catch (ex) {
            return JSON.stringify({error: 'Azure Function呼び出しでエラーが発生しました: ' + ex.getMessage()});
        }
    },

    type: 'ContractVersionDiffAjax'
});