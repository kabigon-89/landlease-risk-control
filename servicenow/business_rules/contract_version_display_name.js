(function executeRule(current, previous) {
    var displayName = '';
    var caseGr = current.contract_case.getRefRecord();
    if (caseGr.isValidRecord()) {
        displayName += caseGr.getValue('lease_purpose') + '－' + caseGr.getValue('contractor_name');
    }
    var endDate = current.getValue('end_date');
    if (endDate) {
        displayName += '（〜' + endDate + '）';
    }
    current.setValue('display_name', displayName);
})(current, previous);