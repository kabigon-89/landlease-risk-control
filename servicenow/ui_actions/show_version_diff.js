function showVersionDiff() {
    var ga = new GlideAjax('ContractVersionDiffAjax');
    ga.addParam('sysparm_name', 'getDiff');
    ga.addParam('sysparm_version_id', g_form.getUniqueValue());
    ga.getXML(handleDiffResponse);
}

function handleDiffResponse(response) {
    var raw = response.responseText;

    if (!raw) {
        alert('サーバーからの応答が取得できませんでした。もう一度ボタンを押してみてください。');
        return;
    }

    var match = raw.match(/answer="([\s\S]*?)"\s+sysparm_max=/);
    if (!match) {
        alert('応答の解析に失敗しました。\n\n生データ:\n' + raw);
        return;
    }

    var answer = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'");

    var result = JSON.parse(answer);

    if (result.error) {
        alert('エラー: ' + result.error);
        return;
    }

    if (result.status != 200) {
        alert('Azure Functionでエラーが発生しました(ステータス: ' + result.status + ')\n' + result.body);
        return;
    }

    var body = JSON.parse(result.body);
    var articles = body.articles || [];
    articles = articles.filter(function(art) { return art.status === 'changed'; });

    var contentHtml = '';
    if (articles.length === 0) {
        contentHtml = '<p style="color:#627382;">前バージョンとの間に変更された条文はありませんでした。</p>';
    } else {
        for (var i = 0; i < articles.length; i++) {
            var art = articles[i];
            contentHtml += '<div style="margin-bottom:16px;padding:16px 20px;background:#fff;border-radius:6px;border-left:5px solid #d9534f;box-shadow:0 1px 3px rgba(0,0,0,0.1);">';
            contentHtml += '<h3 style="margin-top:0;margin-bottom:10px;">' + art.title + '<span style="font-size:0.85em;color:#627382;margin-left:8px;">(変更あり)</span></h3>';
            contentHtml += '<div>' + art.diff_html + '</div>';
            contentHtml += '</div>';
        }
    }

    var targetDoc = (typeof top !== 'undefined' && top.document) ? top.document : document;

    var overlay = targetDoc.createElement('div');
    overlay.id = 'contractDiffOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;overflow:auto;';

    var panel = targetDoc.createElement('div');
    panel.style.cssText = 'background:#f4f6f8;max-width:800px;margin:40px auto;padding:24px 28px;border-radius:8px;position:relative;font-family:sans-serif;color:#182026;';
    panel.innerHTML = '<button id="closeDiffOverlayBtn" style="position:absolute;top:16px;right:16px;padding:6px 14px;cursor:pointer;">閉じる</button>' +
        '<h2 style="margin-top:0;margin-bottom:20px;">契約バージョン差分結果</h2>' + contentHtml;

    overlay.appendChild(panel);
    targetDoc.body.appendChild(overlay);

    targetDoc.getElementById('closeDiffOverlayBtn').addEventListener('click', function() {
        targetDoc.body.removeChild(overlay);
    });
}