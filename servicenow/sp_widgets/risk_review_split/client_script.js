api.controller = function($scope) {
  var c = this;
  $scope.selectedArticle = 0;
  $scope.currentFindingsList = [];
  $scope.uploading = false;
  $scope.uploadMessage = '';
  $scope.showDismissed = false; // 折りたたみの初期状態

  var CHECK_ID_LABELS = {
    'REQ-RISK-001': '①必須条件の欠落',
    'REQ-RISK-002': '②義務の強度',
    'REQ-RISK-003': '④曖昧な表現',
    'REQ-RISK-004': '②義務の強度',
    'REQ-RISK-005': '③添付文書との相違',
    'REQ-RISK-006': '③規則との相違',
    'REQ-RISK-007': '⑤誤字脱字等の体裁の不備',
    'REQ-RISK-008': '①必須条件の欠落',
    'OTHER': '⑥その他'
  };

  $scope.checkLabel = function(checkId) {
    return CHECK_ID_LABELS[checkId] || checkId;
  };

  // --- 重複を消して1つにまとめる処理 ---
  if ($scope.data && $scope.data.articles) {
    var seen = {};
    $scope.data.articles = $scope.data.articles.filter(function(a) {
      var key = (a.number !== undefined) ? a.number : (a.title || a.sys_id);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function normalizeNum(val) {
    if (val === null || val === undefined || val === '' || isNaN(val)) {
      return 0;
    }
    return parseInt(val, 10);
  }

  $scope.selectArticle = function(article) {
    var num = (article && article.number !== undefined) ? article.number : 0;
    $scope.selectedArticle = normalizeNum(num);
    var findings = ($scope.data && $scope.data.findings) || [];
    $scope.currentFindingsList = findings.filter(function(f) {
      return normalizeNum(f.article_number) === $scope.selectedArticle;
    });
  };

  // 左ペインのバッジ：未判定（unconfirmed）の件数
  $scope.countByArticle = function(number) {
    var target = normalizeNum(number);
    var findings = ($scope.data && $scope.data.findings) || [];
    return findings.filter(function(f) {
      return normalizeNum(f.article_number) === target && f.status === 'unconfirmed';
    }).length;
  };

  // 追加：要修正（action_required）の件数
  $scope.countActionReqByArticle = function(number) {
    var target = normalizeNum(number);
    var findings = ($scope.data && $scope.data.findings) || [];
    return findings.filter(function(f) {
      return normalizeNum(f.article_number) === target && f.status === 'action_required';
    }).length;
  };

  // 現在の条文の未判定件数
  $scope.currentPendingCount = function() {
    return ($scope.currentFindingsList || []).filter(function(f) {
      return f.status === 'unconfirmed';
    }).length;
  };

  // 現在の条文の修正不要件数
  $scope.currentDismissedCount = function() {
    return ($scope.currentFindingsList || []).filter(function(f) {
      return f.status === 'dismissed';
    }).length;
  };

  $scope.$watch('data.articles', function(articles) {
    if (articles && articles.length > 0) {
      $scope.selectArticle(articles[0]);
    }
  });

  function sendServerAction(payload, callback) {
    var serverObj = $scope.server || c.server;
    if (serverObj && serverObj.get) {
      serverObj.get(payload).then(function(r) { callback(r); });
    } else {
      $scope.data.actionPayload = payload;
      $scope.server.update().then(function(r) { callback(r); });
    }
  }

  // ステータス更新（要修正 / 修正不要）
  $scope.setStatus = function(finding, status) {
    sendServerAction({
      action: 'decide',
      finding_id: finding.sys_id,
      decision: status
    }, function(r) {
      finding.status = status;
    });
  };

  // メモ保存
  $scope.saveMemo = function(finding) {
    sendServerAction({
      action: 'save_memo',
      finding_id: finding.sys_id,
      memo: finding.memo || ''
    }, function(r) {
      // 成功時は何もしない（裏で保存される）
    });
  };

  // 現在の条文の未確認指摘を一括で「修正不要」にする
  $scope.bulkDismissCurrentArticle = function() {
    sendServerAction({
      action: 'bulkDismissArticle',
      version_id: $scope.data.versionSysId,
      article_number: $scope.selectedArticle
    }, function(r) {
      ($scope.currentFindingsList || []).forEach(function(f) {
        if (f.status === 'unconfirmed') {
          f.status = 'dismissed';
        }
      });
    });
  };

  // --- 所管課への案文確認の依頼（2026-09-20追加） ---
  $scope.showRequestModal = false;
  $scope.requestComment = '';
  $scope.requesting = false;
  $scope.requestError = '';

  // 契約書全体での、ステータス別の指摘件数
  $scope.totalCountByStatus = function(status) {
    var findings = ($scope.data && $scope.data.findings) || [];
    return findings.filter(function(f) {
      return f.status === status;
    }).length;
  };

  $scope.openRequestModal = function() {
    $scope.requestComment = '';
    $scope.requestError = '';
    $scope.showRequestModal = true;
  };

  $scope.closeRequestModal = function() {
    if ($scope.requesting) return;
    $scope.showRequestModal = false;
  };

  $scope.submitRequest = function() {
    if ($scope.requesting) return;
    $scope.requesting = true;
    $scope.requestError = '';

    sendServerAction({
      action: 'request_draft_check',
      renewal_check_id: $scope.data.renewalCheckId,
      version_id: $scope.data.versionSysId,
      comment: $scope.requestComment || ''
    }, function(r) {
      $scope.requesting = false;
      var res = (r && r.data && r.data.ajaxResult) || {};
      if (res.success) {
        $scope.showRequestModal = false;
        $scope.data.draftStatus = 'waiting_dept';
        $scope.data.canRequest = false;
        $scope.data.returnedComment = '';
      } else {
        $scope.requestError = res.error || '依頼に失敗しました。時間をおいて、もう一度お試しください。';
      }
    });
  };

  // 契約書PDFのアップロード
  $scope.onFileSelected = function(files) {
    if (!files || files.length === 0) return;
    var file = files[0];
    if (file.type !== 'application/pdf') {
      alert('PDFファイルを選択してください。');
      return;
    }

    $scope.uploading = true;
    $scope.uploadMessage = '';
    $scope.$apply();

    var formData = new FormData();
    formData.append('file', file);

    var uploadUrl = '/api/now/attachment/file?table_name=x_2177386_landle_0_contract_version&table_sys_id=' + $scope.data.versionSysId + '&file_name=' + encodeURIComponent(file.name);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);
    xhr.setRequestHeader('X-UserToken', window.g_ck);
    xhr.onload = function() {
      $scope.uploading = false;
      if (xhr.status === 201) {
        $scope.uploadMessage = '再審査中…';
      } else {
        $scope.uploadMessage = 'アップロード失敗(status=' + xhr.status + ')';
      }
      $scope.$apply();
    };
    xhr.onerror = function() {
      $scope.uploading = false;
      $scope.uploadMessage = 'アップロード失敗(通信エラー)';
      $scope.$apply();
    };
    xhr.send(formData);
  };
};