(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function masterHeader() {
    var host = byId('pcMasterHeader');
    if (host) return host;
    var app = byId('app');
    host = document.createElement('div');
    host.id = 'pcMasterHeader';
    host.className = 'pc-master-header';
    if (app && app.parentNode) app.parentNode.insertBefore(host, app);
    else document.body.insertBefore(host, document.body.firstChild || null);
    return host;
  }

  function getPatients() {
    if (typeof window.getPatients === 'function') {
      try {
        var rows = window.getPatients();
        if (Array.isArray(rows)) return rows;
      } catch (_) {}
    }
    return [];
  }

  function activePatientId() {
    try {
      return String(
        sessionStorage.getItem('pclinic_active_patient') ||
        localStorage.getItem('pclinic_active_patient') ||
        ''
      ).trim();
    } catch (_) {
      return '';
    }
  }

  function currentRadioPatient() {
    var known = window.currentPatient;
    if (known && (known.id || known.patientId)) return known;
    var requestedId = activePatientId();
    if (!requestedId) return null;
    var match = getPatients().find(function (item) {
      return String(item && item.id) === requestedId;
    });
    return match || null;
  }

  function clearedRadioPatient() {
    return {
      id: '',
      name: '',
      patientName: '',
      fileNumber: '',
      patientNumber: '',
      age: '',
      sex: '',
      gender: '',
      department: 'Radiology'
    };
  }

  function ensureSharedRadioHeader() {
    var host = masterHeader();
    if (!window.pcFile || typeof window.pcFile.renderDemoBar !== 'function' || !host) return false;
    try {
      window.pcFile.renderDemoBar(host, currentRadioPatient() || clearedRadioPatient());
      return true;
    } catch (error) {
      console.warn('Radiology parity header render skipped:', error && error.message ? error.message : error);
      return false;
    }
  }

  function showSecondaryNav() {
    var nav = byId('tb2');
    if (!nav) return;
    nav.style.display = 'flex';
  }

  function syncSearchPlaceholder() {
    var input = byId('globalSearch');
    if (!input) return;
    input.placeholder = 'Search patient by name, MRN, or accession — press Enter to select';
  }

  function tag(selector, className) {
    document.querySelectorAll(selector).forEach(function (node) {
      node.classList.add(className);
    });
  }

  function applyRadioDoctorParity() {
    document.body.classList.add('radio-doctor-shell');
    masterHeader();
    showSecondaryNav();
    syncSearchPlaceholder();
    tag('.panel', 'radio-doctor-panel');
    tag('.ph', 'radio-doctor-head');
    tag('.pb', 'radio-doctor-body');
    tag('.tbl', 'radio-doctor-table');
    tag('.sc', 'radio-doctor-stat');
    tag('.ov-c', 'radio-doctor-shortcut');
    tag('.viewer-quick-btn', 'radio-doctor-tile');
    tag('.modal', 'radio-doctor-modal');
  }

  function queueApply() {
    applyRadioDoctorParity();
    ensureSharedRadioHeader();
  }

  function wrapSwitchView() {
    if (window.__radioDoctorSwitchWrapped || typeof window.switchView !== 'function') return;
    var original = window.switchView;
    window.switchView = function () {
      var result = original.apply(this, arguments);
      setTimeout(queueApply, 0);
      return result;
    };
    window.__radioDoctorSwitchWrapped = true;
  }

  function lateBind() {
    wrapSwitchView();
    queueApply();
  }

  document.addEventListener('DOMContentLoaded', function () {
    lateBind();
    setTimeout(lateBind, 40);
    setTimeout(lateBind, 220);
    setTimeout(lateBind, 800);
  });

  window.addEventListener('load', lateBind);
  window.addEventListener('focus', queueApply);
  window.addEventListener('pcPatientChanged', function () {
    setTimeout(queueApply, 0);
  });
  window.addEventListener('storage', function (event) {
    if (!event || event.key === 'pclinic_active_patient' || event.key === 'patients') setTimeout(queueApply, 0);
  });

  window.ensureSharedRadioHeader = ensureSharedRadioHeader;
  window.applyRadioDoctorParity = applyRadioDoctorParity;
})();
