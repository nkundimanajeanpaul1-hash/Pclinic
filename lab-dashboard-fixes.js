(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function masterHeader() {
    var el = byId('pcMasterHeader');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pcMasterHeader';
    el.className = 'pc-master-header';
    if (document.body && document.body.firstChild) document.body.insertBefore(el, document.body.firstChild);
    else if (document.body) document.body.appendChild(el);
    return el;
  }

  function getPatientList() {
    try {
      if (typeof window.getPatients === 'function') return window.getPatients() || [];
    } catch (e) {}
    try {
      return JSON.parse(localStorage.getItem('pclinic_patients') || '[]');
    } catch (e) {}
    return [];
  }

  function currentLabPatient() {
    try {
      if (window.pcLabEngine && typeof window.pcLabEngine.getSelectedLabPatient === 'function') {
        var selected = window.pcLabEngine.getSelectedLabPatient();
        if (selected && selected.id) return selected;
      }
    } catch (e) {}
    var pid = '';
    try {
      pid = localStorage.getItem('pclinic_lab_selected_patient') || localStorage.getItem('pclinic_active_patient') || '';
    } catch (e) {}
    if (!pid) return null;
    var list = getPatientList();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i] && list[i].id) === String(pid)) return list[i];
    }
    return null;
  }

  function clearedLabPatient() {
    return {
      _cleared: true,
      id: '',
      mrn: '',
      lastName: '',
      firstName: '',
      nationalId: '',
      department: 'Laboratory',
      dob: '',
      gender: '',
      archiveCode: '',
      insurance: 'RSSB / RAMA',
      district: 'NYARUGENGE'
    };
  }

  function hideLegacyLabChrome() {
    document.body && document.body.classList.add('lab-doctor-shell');
    var topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.display = 'none';
    var breadcrumb = byId('breadcrumb');
    if (breadcrumb) breadcrumb.style.display = 'none';
  }

  function ensureSharedLabHeader() {
    hideLegacyLabChrome();
    if (!window.pcFile || typeof window.pcFile.renderDemoBar !== 'function') return false;
    try {
      window.pcFile.renderDemoBar(masterHeader(), currentLabPatient() || clearedLabPatient());
      return true;
    } catch (e) {
      console.warn('ensureSharedLabHeader', e);
      return false;
    }
  }

  function queueSharedLabHeaderSync() {
    clearTimeout(window.__labDoctorHeaderTimer);
    window.__labDoctorHeaderTimer = setTimeout(ensureSharedLabHeader, 20);
  }

  function syncLabSearchUi() {
    var search = byId('searchInput');
    if (search) search.setAttribute('placeholder', 'Search patient by name or MRN…');
  }

  function tag(el, className) {
    if (!el || !className) return;
    String(className).split(/\s+/).filter(Boolean).forEach(function (name) { el.classList.add(name); });
  }

  function tagFirstAndTables(rootId) {
    var root = byId(rootId);
    if (!root) return;
    tag(root, 'lab-doctor-body');
    var kids = Array.prototype.slice.call(root.children || []).filter(function (el) { return el && el.nodeType === 1; });
    if (kids[0]) tag(kids[0], 'lab-doctor-section-head');
    kids.forEach(function (el) {
      if (el.tagName === 'TABLE') tag(el, 'lab-doctor-table-block');
      var table = el.querySelector && el.querySelector('table.wtbl');
      if (table) tag(el, 'lab-doctor-table-card');
    });
  }

  function applyDoctorParityClasses() {
    tag(document.body, 'lab-doctor-shell');
    [
      'sub-overview-default',
      'sub-worklist-view',
      'sub-results-entry',
      'sub-pathology-form',
      'sub-microbio-form',
      'sub-bloodbank-xmatch',
      'sub-qc-form',
      'sub-reports-queue'
    ].forEach(tagFirstAndTables);

    document.querySelectorAll('.panel-header').forEach(function (el) { tag(el, 'lab-doctor-panel-head'); });
    document.querySelectorAll('.panel-title').forEach(function (el) { tag(el, 'lab-doctor-panel-title'); });
    document.querySelectorAll('.panel-actions').forEach(function (el) { tag(el, 'lab-doctor-panel-actions'); });
    document.querySelectorAll('.path-card').forEach(function (el) { tag(el, 'lab-doctor-form-card'); });
    document.querySelectorAll('.path-head').forEach(function (el) { tag(el, 'lab-doctor-form-head'); });
    document.querySelectorAll('.path-body').forEach(function (el) { tag(el, 'lab-doctor-form-body'); });
    document.querySelectorAll('.fg').forEach(function (el) { tag(el, 'lab-doctor-form-grid'); });
    document.querySelectorAll('.fa').forEach(function (el) { tag(el, 'lab-doctor-form-actions'); });
    document.querySelectorAll('.section-title').forEach(function (el) { tag(el, 'lab-doctor-inline-title'); });
    document.querySelectorAll('.bb-tabs').forEach(function (el) { tag(el, 'lab-doctor-pill-tabs'); });
    document.querySelectorAll('.bb-tab').forEach(function (el) { tag(el, 'lab-doctor-pill-tab'); });
    document.querySelectorAll('.bb-panel').forEach(function (el) { tag(el, 'lab-doctor-form-card'); });
    document.querySelectorAll('.reports-stat-card').forEach(function (el) { tag(el, 'lab-doctor-kpi-card'); });
    document.querySelectorAll('.specimen-topbar, .reports-topbar, .specimen-footer, .reports-footer, .reports-archive').forEach(function (el) { tag(el, 'lab-doctor-glass-card'); });
    document.querySelectorAll('.tube-pill, .cond-pill, .qc-pill').forEach(function (el) { tag(el, 'lab-doctor-pill'); });
    document.querySelectorAll('#panel-worklist > .panel-body > table.wtbl, #panel-results > .panel-body > table.wtbl, #panel-overview table.wtbl, #panel-reports table.wtbl').forEach(function (el) { tag(el, 'lab-doctor-table-block'); });

    var qc = byId('sub-qc-form');
    if (qc) {
      var qcKids = Array.prototype.slice.call(qc.children || []).filter(function (el) { return el && el.nodeType === 1; });
      if (qcKids[0]) tag(qcKids[0], 'lab-doctor-qc-head');
      if (qcKids[1]) tag(qcKids[1], 'lab-doctor-qc-banner');
      if (qcKids[2]) tag(qcKids[2], 'lab-doctor-qc-table');
      if (qcKids[3]) tag(qcKids[3], 'lab-doctor-qc-footer');
    }

    var micro = byId('sub-microbio-form');
    if (micro) {
      var microKids = Array.prototype.slice.call(micro.children || []).filter(function (el) { return el && el.nodeType === 1; });
      if (microKids[0]) tag(microKids[0], 'lab-doctor-micro-head');
      if (microKids[1]) tag(microKids[1], 'lab-doctor-micro-banner');
      if (microKids[2]) tag(microKids[2], 'lab-doctor-micro-table');
      if (microKids[3]) tag(microKids[3], 'lab-doctor-micro-footer');
    }

    var modal = byId('modalOverlay');
    if (modal) tag(modal, 'lab-doctor-modal-overlay');
    var modalCard = modal && modal.querySelector ? modal.querySelector('.modal') : null;
    if (modalCard) tag(modalCard, 'lab-doctor-modal-card');
  }

  function queueDoctorParityClasses() {
    clearTimeout(window.__labDoctorParityTimer);
    window.__labDoctorParityTimer = setTimeout(applyDoctorParityClasses, 30);
  }

  function wrapLabTabSwitch() {
    if (window.__labDoctorTabWrapped || typeof window.switchTab !== 'function') return;
    var original = window.switchTab;
    window.switchTab = function () {
      var out = original.apply(this, arguments);
      queueDoctorParityClasses();
      return out;
    };
    window.__labDoctorTabWrapped = true;
  }

  function initLabDoctorParity() {
    hideLegacyLabChrome();
    syncLabSearchUi();
    applyDoctorParityClasses();
    ensureSharedLabHeader();
    wrapLabTabSwitch();
    var tries = 0;
    (function waitForSharedChrome() {
      wrapLabTabSwitch();
      applyDoctorParityClasses();
      if (ensureSharedLabHeader()) return;
      tries += 1;
      if (tries < 80) window.setTimeout(waitForSharedChrome, 80);
    })();

    window.addEventListener('pcPatientChanged', function () { queueSharedLabHeaderSync(); queueDoctorParityClasses(); });
    window.addEventListener('labSelectionChanged', function () { queueSharedLabHeaderSync(); queueDoctorParityClasses(); });
    window.addEventListener('focus', function () { queueSharedLabHeaderSync(); queueDoctorParityClasses(); wrapLabTabSwitch(); });
    window.addEventListener('storage', function (event) {
      var key = event && event.key ? String(event.key) : '';
      if (!key || key === 'pclinic_lab_selected_patient' || key === 'pclinic_active_patient' || key === 'pclinic_patients') {
        queueSharedLabHeaderSync();
      }
      queueDoctorParityClasses();
    });
    window.setTimeout(queueDoctorParityClasses, 60);
    window.setTimeout(queueDoctorParityClasses, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLabDoctorParity, { once: true });
  } else {
    initLabDoctorParity();
  }

  window.applyDoctorParityClasses = applyDoctorParityClasses;
  window.ensureSharedLabHeader = ensureSharedLabHeader;
})();
