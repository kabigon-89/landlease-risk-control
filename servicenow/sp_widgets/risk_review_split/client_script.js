api.controller = function($scope) {
  var c = this;

  $scope.selectedArticle = 0;
  $scope.currentFindingsList = [];

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

  // 左ペインのバッジ：未確認（unconfirmed）のみカウント
  $scope.countByArticle = function(number) {
    var target = normalizeNum(number);
    var findings = ($scope.data && $scope.data.findings) || [];
    return findings.filter(function(f) {
      return normalizeNum(f.article_number) === target && f.status === 'unconfirmed';
    }).length;
  };

  // 現在表示中の条文の未確認件数
  $scope.currentPendingCount = function() {
    return ($scope.currentFindingsList || []).filter(function(f) {
      return f.status === 'unconfirmed';
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
      serverObj.get(payload).then(function(r) {
        callback(r);
      });
    } else {
      $scope.data.actionPayload = payload;
      $scope.server.update().then(function(r) {
        callback(r);
      });
    }
  }

  // 単一承認
  $scope.approve = function(finding) {
    sendServerAction({
      action: 'decide',
      finding_id: finding.sys_id,
      decision: 'approved'
    }, function(r) {
      if (r && r.data && r.data.ajaxResult && r.data.ajaxResult.error) {
        alert(r.data.ajaxResult.error);
        return;
      }
      finding.status = 'approved';
    });
  };

  // 単一却下（自由記述対応）
  $scope.reject = function(finding) {
    if (!finding.selectedReason) {
      alert('却下理由を選択してください。');
      return;
    }

    var finalReason = finding.selectedReason;
    if (finding.selectedReason === 'その他（自由記述）') {
      if (!finding.customReason || !finding.customReason.trim()) {
        alert('自由記述の理由を入力してください。');
        return;
      }
      finalReason = finding.customReason.trim();
    }

    sendServerAction({
      action: 'decide',
      finding_id: finding.sys_id,
      decision: 'rejected',
      rejection_reason: finalReason
    }, function(r) {
      if (r && r.data && r.data.ajaxResult && r.data.ajaxResult.error) {
        alert(r.data.ajaxResult.error);
        return;
      }
      finding.status = 'rejected';
      finding.rejection_reason = finalReason;
    });
  };

  // 取消
  $scope.resetDecision = function(finding) {
    sendServerAction({
      action: 'decide',
      finding_id: finding.sys_id,
      decision: 'reset'
    }, function(r) {
      if (r && r.data && r.data.ajaxResult && r.data.ajaxResult.error) {
        alert(r.data.ajaxResult.error);
        return;
      }
      finding.status = 'unconfirmed';
      finding.rejection_reason = '';
      finding.selectedReason = '';
      finding.customReason = '';
    });
  };

  // 現在表示中の条文の未確認指摘を一括承認
  $scope.bulkApproveCurrentArticle = function() {
    sendServerAction({
      action: 'bulkApproveArticle',
      version_id: $scope.data.versionSysId,
      article_number: $scope.selectedArticle
    }, function(r) {
      ($scope.currentFindingsList || []).forEach(function(f) {
        if (f.status === 'unconfirmed') {
          f.status = 'approved';
        }
      });
    });
  };
};