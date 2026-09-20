var RenewalCheckHelper = Class.create();
RenewalCheckHelper.prototype = {
    initialize: function() {},

    // 更新確認に対する最新の案文確認が「確認済み」かどうかを返す
    isDraftConfirmed: function(renewalCheckSysId) {
        var dc = new GlideRecord('x_2177386_landle_0_draft_check');
        dc.addQuery('u_renewal_check', renewalCheckSysId);
        dc.orderByDesc('sys_created_on');
        dc.setLimit(1);
        dc.query();
        return dc.next() && dc.getValue('u_status') == 'confirmed';
    },

    type: 'RenewalCheckHelper'
};