current.u_status = 'confirmed';
current.u_answered_at = new GlideDateTime();
current.update();
action.setRedirectURL('/risk_review?id=landlease_home');