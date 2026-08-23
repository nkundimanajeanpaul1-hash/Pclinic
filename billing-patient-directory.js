/* Restricted billing identity directory for Cashier/Finance. */
(function () {
  'use strict';
  var records = [];
  var unsubscribe = null;
  function normalize(d) {
    return {
      id: String(d.id || ''), mrn: String(d.mrn || d.id || ''),
      name: String(d.name || ((d.firstName || '') + ' ' + (d.lastName || '')).trim()),
      firstName: String(d.firstName || ''), lastName: String(d.lastName || ''),
      insurance: { provider: String(d.insuranceProvider || ''), patientPayPercent: Number(d.patientPayPercent != null ? d.patientPayPercent : 100) },
      billingPatientPayPercent: Number(d.patientPayPercent != null ? d.patientPayPercent : 100),
      status: d.active === false ? 'inactive' : 'active'
    };
  }
  function emit() { window.dispatchEvent(new CustomEvent('billingPatientDirectoryUpdated', { detail: { count: records.length } })); }
  function start() {
    if (unsubscribe || !window.firebaseDB || !window.firebaseFunctions) return;
    var f = window.firebaseFunctions;
    try {
      unsubscribe = f.onSnapshot(f.collection(window.firebaseDB, 'billingPatientDirectory'), function (snap) {
        records = []; snap.forEach(function (docSnap) { records.push(normalize(docSnap.data() || {})); });
        records.sort(function(a,b){ return a.name.localeCompare(b.name); }); emit();
      }, function (error) {
        console.error('Billing directory unavailable:', error);
        records = []; emit();
        if (window.pcToast) window.pcToast('Billing patient directory is unavailable.', 'error', 7000);
      });
    } catch (error) { console.error(error); }
  }
  function list() { return records.slice(); }
  function search(query) {
    var words=String(query||'').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if(!words.length)return list();
    return records.filter(function(p){var hay=[p.id,p.mrn,p.name,p.firstName,p.lastName,p.insurance.provider].join(' ').toLowerCase();return words.every(function(w){return hay.indexOf(w)!==-1;});});
  }
  window.getBillingPatients=list;
  window.searchBillingPatients=search;
  window.addEventListener('firebaseReady',start);
  if(window.firebaseReady)setTimeout(start,0);
})();
