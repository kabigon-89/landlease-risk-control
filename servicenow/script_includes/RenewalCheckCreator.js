var RenewalCheckCreator = Class.create();
RenewalCheckCreator.prototype = {
    initialize: function() {},

    run: function() {
        var result = {created: 0, not_yet: 0, skipped_existing: 0, skipped_no_dept: 0, skipped_no_months: 0};
        var nowMs = new GlideDateTime().getNumericValue();

        var ver = new GlideRecord('x_2177386_landle_0_contract_version');
        ver.addNotNullQuery('end_date');
        ver.query();

        while (ver.next()) {
            var verId = ver.getUniqueValue();
            var caseId = ver.getValue('contract_case');
            if (!caseId) {
                continue;
            }

            // 契約案件の現行バージョン以外は対象外
            var caseGr = ver.contract_case.getRefRecord();
            if (caseGr.getValue('current_version') != verId) {
                continue;
            }

            // 事前通知月数が未入力なら対象外
            var noticeMonths = parseInt(ver.getValue('renewal_notice_months'), 10);
            if (isNaN(noticeMonths)) {
                result.skipped_no_months++;
                continue;
            }

            // 通知日 ＝ 契約終了日の（事前通知月数＋3か月）前
            var endDateStr = ver.getValue('end_date').substring(0, 10);
            var noticeDate = new GlideDateTime(endDateStr + ' 00:00:00');
            noticeDate.addMonthsUTC(-(noticeMonths + 3));

            if (noticeDate.getNumericValue() > nowMs) {
                result.not_yet++;
                continue;
            }

            // すでに起票済みなら何もしない
            var dup = new GlideRecord('x_2177386_landle_0_renewal_check');
            dup.addQuery('u_contract_version', verId);
            dup.setLimit(1);
            dup.query();
            if (dup.hasNext()) {
                result.skipped_existing++;
                continue;
            }

            // 所管課が未設定なら起票しない
            var deptId = caseGr.getValue('u_dept_group');
            if (!deptId) {
                gs.warn('[RenewalCheckCreator] 所管課が未設定のため起票をスキップ: ' + caseGr.getDisplayValue());
                result.skipped_no_dept++;
                continue;
            }

            var rc = new GlideRecord('x_2177386_landle_0_renewal_check');
            rc.initialize();
            rc.setValue('u_contract_case', caseId);
            rc.setValue('u_contract_version', verId);
            rc.setValue('u_status', 'waiting_dept');
            rc.setValue('u_assigned_group', deptId);
            rc.insert();
            result.created++;
        }

        gs.info('[RenewalCheckCreator] ' + JSON.stringify(result));
        return result;
    },

    type: 'RenewalCheckCreator'
};