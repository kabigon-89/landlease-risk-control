// UI Action: 差分を確認する
// Table: 契約バージョン (x_2177386_landle_0_contract_version)
// Action name: show_version_diff
// Type: Client (Form button)

function showVersionDiff() {
    var ga = new GlideAjax('ContractVersionDiffAjax');
    ga.addParam('sysparm_name', 'getDiff');
    ga.addParam('sysparm_version_id', g_form.getUniqueValue());
    ga.getXML(handleDiffResponse);
}

function handleDiffResponse(response) {
    var answer = response.responseXML.documentElement.getAttribute('answer');
    var result = JSON.parse(answer);

    if (result.error) {
        alert('エラー: ' + result.error);
        return;
    }

    alert('Azure Functionからの応答(ステータス: ' + result.status + ')\n\n' + result.body);
}