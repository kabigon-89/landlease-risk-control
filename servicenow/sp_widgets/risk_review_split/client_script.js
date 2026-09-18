api.controller = function($timeout) {
  var c = this;

  c.form = {
    contractorName: c.data.contractorName,
    contactPersonName: c.data.contactPersonName,
    contactInfo: c.data.contactInfo,
    propertyLocation: c.data.propertyLocation,
    leasePurpose: c.data.leasePurpose,
    startDate: c.data.startDate,
    endDate: c.data.endDate,
    newNote: ''
  };

  c.pdfFile = null;
  c.relatedFiles = [];
  c.relatedFilesLoading = false; // 追加: 関連資料のBase64変換が完了するまでtrue
  c.submitting = false;
  c.checking = false;
  c.errorMessage = '';

  function fileToBase64(file, callback) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var base64 = e.target.result.split(',')[1];
      callback({ name: file.name, type: file.type, base64: base64 });
    };
    reader.readAsDataURL(file);
  }

  c.onPdfSelected = function(fileList) {
    if (!fileList || fileList.length === 0) { return; }
    fileToBase64(fileList[0], function(result) {
      c.pdfFile = result;
      $timeout(function() {});
    });
  };

  c.onRelatedFilesSelected = function(fileList) {
    if (!fileList || fileList.length === 0) { return; }
    c.relatedFiles = [];
    c.relatedFilesLoading = true; // 追加: 変換開始と同時にロック
    $timeout(function() {}); // 追加: ロック状態を即座に画面へ反映させる

    var remaining = fileList.length;
    for (var i = 0; i < fileList.length; i++) {
      fileToBase64(fileList[i], function(result) {
        c.relatedFiles.push(result);
        remaining--;
        if (remaining === 0) {
          c.relatedFilesLoading = false; // 追加: 全件変換完了でロック解除
          $timeout(function() {});
        }
      });
    }
  };

  function callServer(payload, callback) {
    c.data.actionPayload = payload;
    c.server.update().then(function(response) {
      callback(response.data.ajaxResult);
    });
  }

  function pollFindings(versionSysId, attemptsLeft) {
    if (attemptsLeft <= 0) {
      c.checking = false;
      c.errorMessage = 'AIの処理が想定より時間がかかっています。しばらくしてからRisk Review画面を開いてください。';
      return;
    }
    $timeout(function() {
      callServer({ action: 'check_findings', version_sys_id: versionSysId }, function(result) {
        if (result && result.count > 0) {
          c.checking = false;
          window.location.href = '/risk_review?id=risk_review_split&version=' + versionSysId;
        } else {
          pollFindings(versionSysId, attemptsLeft - 1);
        }
      });
    }, 5000);
  }

  c.submit = function() {
    if (!c.pdfFile) {
      c.errorMessage = '契約書本体のPDFを選択してください。';
      return;
    }
    if (c.relatedFilesLoading) { // 追加: 関連資料の変換が終わっていなければ送信させない
      c.errorMessage = '関連資料を読み込み中です。しばらく待ってから送信してください。';
      return;
    }
    c.errorMessage = '';
    c.submitting = true;

    var payload = {
      action: 'submit',
      version_sys_id: c.data.versionSysId,
      contractor_name: c.form.contractorName,
      contact_person_name: c.form.contactPersonName,
      contact_info: c.form.contactInfo,
      property_location: c.form.propertyLocation,
      lease_purpose: c.form.leasePurpose,
      start_date: c.form.startDate,
      end_date: c.form.endDate,
      new_note: c.form.newNote,
      pdf_file: c.pdfFile,
      related_files: c.relatedFiles
    };

    callServer(payload, function(result) {
      c.submitting = false;
      if (!result || !result.success) {
        c.errorMessage = (result && result.error) || '送信に失敗しました。';
        return;
      }
      c.checking = true;
      pollFindings(result.version_sys_id, 24); // 5秒×24回=最大2分待つ
    });
  };
};