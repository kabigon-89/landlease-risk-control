current.u_dept_decision = 'renew';
current.u_status = 'waiting_asset';
current.u_answered_at = new GlideDateTime();

var grp = new GlideRecord('sys_user_group');
if (grp.get('name', '資産経営課')) {
    current.u_assigned_group = grp.getUniqueValue();
}

current.update();
action.setRedirectURL(current);