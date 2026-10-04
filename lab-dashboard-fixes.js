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
    var ambient = document.querySelector('.lab-ambient-backdrop');
    if (ambient) ambient.style.display = 'none';
    var smart = byId('labSmartShell');
    if (smart) smart.style.display = 'none';
    var ribbon = byId('labCommandRibbon');
    if (ribbon) ribbon.style.display = 'none';
    var subNav = byId('subNav');
    if (subNav) subNav.style.display = 'none';
    var dcBar = byId('dcBar');
    if (dcBar) {
      dcBar.style.display = 'none';
      if (dcBar.parentNode) dcBar.parentNode.removeChild(dcBar);
    }
    var dcCtx = byId('dcCtx');
    if (dcCtx && dcCtx.parentNode) dcCtx.parentNode.removeChild(dcCtx);
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

  function notify(message, tone) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, tone || 'info');
      return;
    }
    try { window.alert(message); } catch (e) {}
  }

  function openLabTab(name) {
    var btn = document.querySelector('.nav-tab[data-tab="' + name + '"]');
    if (btn && typeof window.switchTab === 'function') {
      window.switchTab(name, btn);
      return true;
    }
    return false;
  }

  function focusLabSearch() {
    var search = byId('searchInput');
    if (!search) return false;
    try {
      search.focus();
      if (typeof search.select === 'function') search.select();
      return true;
    } catch (e) {
      return false;
    }
  }

  function refreshLabQueue() {
    if (window.pcLabEngine && typeof window.pcLabEngine.repaint === 'function') {
      window.pcLabEngine.repaint();
    }
    queueDoctorParityClasses();
    queueSharedLabHeaderSync();
  }

  function labQuickAction(action) {
    if (action === 'select') {
      if (focusLabSearch()) notify('Search patient by name or MRN, or use the patient identification bar above.', 'info');
      else notify('Use the patient identification bar above to select a patient first.', 'info');
      return;
    }
    if (action === 'refresh') {
      refreshLabQueue();
      notify('🔄 Laboratory queue refreshed', 'info');
      return;
    }
    var map = {
      overview: 'overview',
      queue: 'overview',
      patients: 'overview',
      specimen: 'specimen',
      worklist: 'worklist',
      results: 'results',
      pathology: 'pathology',
      microbio: 'microbio',
      bloodbank: 'bloodbank',
      qc: 'qc',
      reports: 'reports'
    };
    if (map[action]) {
      if (!openLabTab(map[action])) notify('The laboratory workspace is still loading.', 'warning');
      return;
    }
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
      if (arguments[0] === 'results') {
        pullLabRequestsFromCommonServer(false);
        renderLabResultsModule();
      }
      return out;
    };
    window.__labDoctorTabWrapped = true;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LAB RESULTS & RESULT ENTRY MODULE (Doctor Dashboard Parity & Live Sync)
     ══════════════════════════════════════════════════════════════════════════ */
  var activeLabResultsMode = 'results'; // 'results' | 'entry'
  var activeLabResultsPatientId = 'all';
  var activeTargetOrderId = null;

  var LAB_TEST_CATALOG = {
    'CBC - Complete Blood Count': [
      { code: 'HB', name: 'Hemoglobin (Hb)', unit: 'g/dL', range: '13.0 - 17.5', min: 13.0, max: 17.5, defaultVal: '14.2' },
      { code: 'WBC', name: 'White Blood Cell (WBC)', unit: '10^3/µL', range: '4.0 - 11.0', min: 4.0, max: 11.0, defaultVal: '6.8' },
      { code: 'PLT', name: 'Platelets (PLT)', unit: '10^3/µL', range: '150 - 450', min: 150, max: 450, defaultVal: '245' },
      { code: 'RBC', name: 'Red Blood Cell (RBC)', unit: '10^6/µL', range: '4.5 - 5.9', min: 4.5, max: 5.9, defaultVal: '4.95' },
      { code: 'HCT', name: 'Hematocrit (Hct)', unit: '%', range: '40.0 - 52.0', min: 40.0, max: 52.0, defaultVal: '43.5' }
    ],
    'Hemoglobin (Hb)': [
      { code: 'HB', name: 'Hemoglobin (Hb)', unit: 'g/dL', range: '13.0 - 17.5', min: 13.0, max: 17.5, defaultVal: '14.2' }
    ],
    'WBC - White Blood Cell Count': [
      { code: 'WBC', name: 'White Blood Cell (WBC)', unit: '10^3/µL', range: '4.0 - 11.0', min: 4.0, max: 11.0, defaultVal: '6.8' }
    ],
    'Platelet Count': [
      { code: 'PLT', name: 'Platelets (PLT)', unit: '10^3/µL', range: '150 - 450', min: 150, max: 450, defaultVal: '245' }
    ],
    'ESR - Erythrocyte Sedimentation Rate': [
      { code: 'ESR', name: 'ESR (Westergren)', unit: 'mm/hr', range: '0 - 20', min: 0, max: 20, defaultVal: '12' }
    ],
    'Blood Group & Rh Typing': [
      { code: 'BG', name: 'Blood Group & Rh', unit: 'Group', range: 'A/B/AB/O (Rh +/-)', min: null, max: null, defaultVal: 'O Positive' }
    ],
    'Malaria Parasite (MP)': [
      { code: 'MP', name: 'Malaria Parasite (MP)', unit: 'Smear', range: 'Negative', min: null, max: null, defaultVal: 'Negative (No trophozoites seen)' }
    ],
    'Fasting Blood Sugar (FBS)': [
      { code: 'FBS', name: 'Fasting Blood Sugar (FBS)', unit: 'mg/dL', range: '70 - 100', min: 70, max: 100, defaultVal: '88' }
    ],
    'Random Blood Sugar (RBS)': [
      { code: 'RBS', name: 'Random Blood Sugar (RBS)', unit: 'mg/dL', range: '70 - 140', min: 70, max: 140, defaultVal: '104' }
    ],
    'Renal Function Test (RFT)': [
      { code: 'CREAT', name: 'Serum Creatinine', unit: 'mg/dL', range: '0.6 - 1.2', min: 0.6, max: 1.2, defaultVal: '0.92' },
      { code: 'BUN', name: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', range: '7 - 20', min: 7, max: 20, defaultVal: '13.5' },
      { code: 'UREA', name: 'Serum Urea', unit: 'mmol/L', range: '2.5 - 7.1', min: 2.5, max: 7.1, defaultVal: '4.8' }
    ],
    'Liver Function Test (LFT)': [
      { code: 'ALT', name: 'ALT / SGPT', unit: 'U/L', range: '7 - 56', min: 7, max: 56, defaultVal: '26' },
      { code: 'AST', name: 'AST / SGOT', unit: 'U/L', range: '10 - 40', min: 10, max: 40, defaultVal: '28' },
      { code: 'TBIL', name: 'Total Bilirubin', unit: 'mg/dL', range: '0.2 - 1.2', min: 0.2, max: 1.2, defaultVal: '0.75' },
      { code: 'ALKP', name: 'Alkaline Phosphatase (ALP)', unit: 'U/L', range: '44 - 147', min: 44, max: 147, defaultVal: '78' }
    ],
    'Lipid Profile': [
      { code: 'CHOL', name: 'Total Cholesterol', unit: 'mg/dL', range: '< 200', min: 0, max: 200, defaultVal: '165' },
      { code: 'TRIG', name: 'Triglycerides', unit: 'mg/dL', range: '< 150', min: 0, max: 150, defaultVal: '115' },
      { code: 'HDL', name: 'HDL Cholesterol', unit: 'mg/dL', range: '> 40', min: 40, max: 999, defaultVal: '52' },
      { code: 'LDL', name: 'LDL Cholesterol', unit: 'mg/dL', range: '< 100', min: 0, max: 100, defaultVal: '90' }
    ],
    'Urinalysis': [
      { code: 'UR_PROT', name: 'Urine Protein', unit: 'Dipstick', range: 'Negative', min: null, max: null, defaultVal: 'Negative' },
      { code: 'UR_GLUC', name: 'Urine Glucose', unit: 'Dipstick', range: 'Negative', min: null, max: null, defaultVal: 'Negative' },
      { code: 'UR_LEUK', name: 'Leukocyte Esterase', unit: 'Dipstick', range: 'Negative', min: null, max: null, defaultVal: 'Negative' },
      { code: 'UR_MICR', name: 'Microscopy (WBC/RBC)', unit: '/HPF', range: '0 - 5', min: 0, max: 5, defaultVal: '1 - 2 /HPF' }
    ]
  };

  function getAllRawOrders() {
    var orders = [];
    try {
      orders = JSON.parse(localStorage.getItem('pclinic_orders') || '[]');
    } catch(e) {
      orders = [];
    }

    var patients = getPatientList();
    var synthesized = false;

    // Scan every patient in pclinic_patients and aggregate their labRequests
    patients.forEach(function(p) {
      if (!p || !Array.isArray(p.labRequests) || !p.labRequests.length) return;
      var pIdStr = String(p.id).replace(/^MOD-/i, '').trim();
      var pName = (p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient #' + pIdStr)).trim();

      p.labRequests.forEach(function(req, idx) {
        if (!req) return;
        var reqId = String(req.orderId || req.id || ('ORD-REQ-' + pIdStr + '-' + idx));
        var tests = Array.isArray(req.tests) ? req.tests.filter(Boolean) : [req.testName || req.test || req.item || 'Lab Examination'].filter(Boolean);
        if (!tests.length) return;

        var existing = orders.find(function(o) {
          if (!o) return false;
          if (String(o.id) === reqId || String(o.legacyRequestId || '') === reqId) return true;
          if (String(o.patientId).replace(/^MOD-/i, '').trim() === pIdStr && (o.dept === 'lab' || o.type === 'lab')) {
            var oTests = (o.items || []).map(function(it){ return it.name; });
            return tests.some(function(t){ return oTests.indexOf(t) !== -1; });
          }
          return false;
        });

        var rawStatus = String(req.status || 'pending').toLowerCase();
        var status = rawStatus === 'completed' ? 'completed' : rawStatus === 'cancelled' ? 'cancelled' : 'pending';

        if (!existing) {
          var newOrder = {
            id: reqId,
            dept: 'lab',
            type: 'lab',
            patientId: pIdStr,
            patientName: pName,
            mrn: p.mrn || pIdStr,
            doctor: req.requestedBy || req.orderedBy || req.doctor || 'Attending Physician',
            priority: req.priority || 'Routine',
            sampleType: req.sampleType || 'Whole Blood (EDTA)',
            status: status,
            items: tests.map(function(t) {
              return {
                code: 'LAB-' + String(t).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase(),
                name: String(t),
                price: Number(req.price) || 0
              };
            }),
            createdAt: req.timestamp || req.date || req.orderedAt || new Date().toISOString(),
            _commonServerPulled: true,
            _legacyLocalOnly: false
          };
          if (status === 'completed' && req.result) {
            newOrder.result = req.result;
          }
          orders.unshift(newOrder);
          synthesized = true;
        } else {
          if (status === 'completed' && existing.status !== 'completed') {
            existing.status = 'completed';
            synthesized = true;
          }
        }
      });
    });

    if (synthesized) {
      try { localStorage.setItem('pclinic_orders', JSON.stringify(orders)); } catch(e){}
    }

    return orders;
  }

  function saveAllRawOrders(orders) {
    try {
      localStorage.setItem('pclinic_orders', JSON.stringify(orders));
    } catch(e) {
      console.warn('saveAllRawOrders', e);
    }
  }

  async function pullLabRequestsFromCommonServer(isManual) {
    if (isManual) {
      notify('🔄 Contacting Common Server to pull requested labs…', 'info');
    }

    var cloudOrdersCount = 0;
    var cloudPatientsCount = 0;

    // 1. Fetch live from Firebase Firestore Common Server if available
    if (window.firebaseDB && window.firebaseFunctions) {
      var f = window.firebaseFunctions;
      try {
        var ordersSnap = await f.getDocs(f.collection(window.firebaseDB, 'orders'));
        if (ordersSnap && !ordersSnap.empty) {
          var cloudOrders = [];
          ordersSnap.forEach(function(doc) {
            var data = doc.data() || {};
            if (!data.id) data.id = doc.id;
            cloudOrders.push(data);
          });
          if (cloudOrders.length) {
            var rawOrders = [];
            try { rawOrders = JSON.parse(localStorage.getItem('pclinic_orders') || '[]'); } catch(e){}
            cloudOrders.forEach(function(co) {
              var idx = rawOrders.findIndex(function(o){ return String(o.id) === String(co.id); });
              if (idx >= 0) rawOrders[idx] = Object.assign({}, rawOrders[idx], co);
              else rawOrders.unshift(co);
              cloudOrdersCount++;
            });
            try { localStorage.setItem('pclinic_orders', JSON.stringify(rawOrders)); } catch(e){}
          }
        }
      } catch(err) {
        console.warn('Common server orders pull failed:', err);
      }

      try {
        var ptsSnap = await f.getDocs(f.collection(window.firebaseDB, 'patients'));
        if (ptsSnap && !ptsSnap.empty) {
          var cloudPts = [];
          ptsSnap.forEach(function(doc) {
            var data = doc.data() || {};
            if (!data.id) data.id = parseInt(doc.id, 10) || doc.id;
            cloudPts.push(data);
          });
          if (cloudPts.length) {
            var localPts = getPatientList();
            cloudPts.forEach(function(cp) {
              var pIdx = localPts.findIndex(function(p){ return String(p.id) === String(cp.id) || String(p.mrn) === String(cp.mrn); });
              if (pIdx >= 0) localPts[pIdx] = Object.assign({}, localPts[pIdx], cp);
              else localPts.unshift(cp);
              cloudPatientsCount++;
            });
            try { localStorage.setItem('pclinic_patients', JSON.stringify(localPts)); } catch(e){}
          }
        }
      } catch(err) {
        console.warn('Common server patients pull failed:', err);
      }
    }

    // 2. Synthesize all patient.labRequests and refresh local orders
    var allOrders = getAllRawOrders();

    // 3. Ensure pcOrders ledger is refreshed
    if (window.pcOrders && typeof window.pcOrders.aggregate === 'function') {
      try { window.pcOrders.aggregate(allOrders); } catch(e){}
    }

    // 4. Populate views
    populateLabResultsPatientSelect();
    renderRequestedLabsTable();
    renderVerifiedLabResultsTable();
    if (activeLabResultsMode === 'entry') {
      renderResultEntryTable(activeTargetOrderId);
    }

    if (window.pcLabEngine && typeof window.pcLabEngine.repaint === 'function') {
      try { window.pcLabEngine.repaint(); } catch(e){}
    }
    if (typeof window.loadPatients === 'function') {
      try { window.loadPatients(); } catch(e){}
    }

    // 5. Broadcast to Doctor Dashboard & Reception
    try {
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
      window.dispatchEvent(new CustomEvent('labResultsUpdated'));
      window.dispatchEvent(new CustomEvent('patientsUpdated'));
      window.dispatchEvent(new Event('storage'));
    } catch(e){}

    var labCount = allOrders.filter(function(o){ return o && (o.dept === 'lab' || o.type === 'lab'); }).length;
    var pendingCount = allOrders.filter(function(o){ return o && (o.dept === 'lab' || o.type === 'lab') && (o.status || '').toLowerCase() === 'pending'; }).length;

    if (isManual) {
      notify('✅ Pulled from Common Server: ' + labCount + ' total lab order(s) (' + pendingCount + ' pending for entry).', 'success');
    }
    return labCount;
  }

  function setupCommonServerLabRealtimeSync() {
    if (!window.firebaseDB || !window.firebaseFunctions) return;
    var f = window.firebaseFunctions;
    try {
      f.onSnapshot(f.collection(window.firebaseDB, 'orders'), function(snap) {
        if (!snap) return;
        var cloudOrders = [];
        snap.forEach(function(doc) {
          var d = doc.data() || {};
          if (!d.id) d.id = doc.id;
          cloudOrders.push(d);
        });
        if (cloudOrders.length) {
          var raw = [];
          try { raw = JSON.parse(localStorage.getItem('pclinic_orders') || '[]'); } catch(e){}
          cloudOrders.forEach(function(co) {
            var idx = raw.findIndex(function(o){ return String(o.id) === String(co.id); });
            if (idx >= 0) raw[idx] = Object.assign({}, raw[idx], co);
            else raw.unshift(co);
          });
          try { localStorage.setItem('pclinic_orders', JSON.stringify(raw)); } catch(e){}
          getAllRawOrders();
          if (byId('panel-results') && byId('panel-results').style.display !== 'none') {
            renderLabResultsModule();
          }
          if (window.pcLabEngine && typeof window.pcLabEngine.repaint === 'function') {
            window.pcLabEngine.repaint();
          }
        }
      }, function(err) { console.warn('orders onSnapshot:', err); });
    } catch(e){}

    try {
      f.onSnapshot(f.collection(window.firebaseDB, 'patients'), function(snap) {
        if (!snap) return;
        var cloudPts = [];
        snap.forEach(function(doc) {
          var d = doc.data() || {};
          if (!d.id) d.id = parseInt(doc.id, 10) || doc.id;
          cloudPts.push(d);
        });
        if (cloudPts.length) {
          var localPts = [];
          try { localPts = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
          cloudPts.forEach(function(cp) {
            var idx = localPts.findIndex(function(p){ return String(p.id) === String(cp.id) || String(p.mrn) === String(cp.mrn); });
            if (idx >= 0) localPts[idx] = Object.assign({}, localPts[idx], cp);
            else localPts.unshift(cp);
          });
          try { localStorage.setItem('pclinic_patients', JSON.stringify(localPts)); } catch(e){}
          getAllRawOrders();
          if (byId('panel-results') && byId('panel-results').style.display !== 'none') {
            renderLabResultsModule();
          }
          if (window.pcLabEngine && typeof window.pcLabEngine.repaint === 'function') {
            window.pcLabEngine.repaint();
          }
        }
      }, function(err) { console.warn('patients onSnapshot:', err); });
    } catch(e){}
  }

  function seedSampleLabRequestsIfEmpty() {
    var orders = getAllRawOrders();
    var labOrders = orders.filter(function(o) { return o && (o.dept === 'lab' || o.type === 'lab'); });
    var hasPending = labOrders.some(function(o) { return o.status === 'pending'; });

    if (hasPending && labOrders.length >= 2) return;

    var patients = getPatientList();
    if (!patients || !patients.length) return;

    var p1 = patients.find(function(p){ return String(p.id) === '1002'; }) || patients[0];
    var p2 = patients.find(function(p){ return String(p.id) === '1001'; }) || (patients[1] || patients[0]);
    var p3 = patients.find(function(p){ return String(p.id) === '1003'; }) || (patients[2] || patients[0]);

    var now = Date.now();
    var sampleOrders = [
      {
        id: 'ORD-LAB-2026-101',
        dept: 'lab',
        type: 'lab',
        patientId: String(p1.id),
        patientName: (p1.firstName + ' ' + p1.lastName).trim(),
        doctor: 'Dr. Jean Dupont',
        priority: 'Routine',
        sampleType: 'Whole Blood (EDTA)',
        status: 'pending',
        items: [
          { code: 'LAB-CBC', name: 'CBC - Complete Blood Count', price: 6000 },
          { code: 'LAB-RBS', name: 'Random Blood Sugar (RBS)', price: 2500 }
        ],
        createdAt: new Date(now - 35 * 60000).toISOString()
      },
      {
        id: 'ORD-LAB-2026-102',
        dept: 'lab',
        type: 'lab',
        patientId: String(p2.id),
        patientName: (p2.firstName + ' ' + p2.lastName).trim(),
        doctor: 'Dr. Alice Mukamana',
        priority: 'Urgent',
        sampleType: 'Serum / Smear',
        status: 'pending',
        items: [
          { code: 'LAB-RFT', name: 'Renal Function Test (RFT)', price: 12000 },
          { code: 'LAB-MALMP', name: 'Malaria Parasite (MP)', price: 3000 }
        ],
        createdAt: new Date(now - 75 * 60000).toISOString()
      },
      {
        id: 'ORD-LAB-2026-103',
        dept: 'lab',
        type: 'lab',
        patientId: String(p3.id),
        patientName: (p3.firstName + ' ' + p3.lastName).trim(),
        doctor: 'Dr. Robert Kagabo',
        priority: 'Routine',
        sampleType: 'Serum',
        status: 'completed',
        items: [
          { code: 'LAB-LFT', name: 'Liver Function Test (LFT)', price: 12000 }
        ],
        results: [
          { test: 'ALT / SGPT', value: '24', unit: 'U/L', range: '7 - 56', flag: 'Normal', verifiedBy: 'Laboratory Staff', date: new Date(now - 120 * 60000).toISOString() },
          { test: 'AST / SGOT', value: '28', unit: 'U/L', range: '10 - 40', flag: 'Normal', verifiedBy: 'Laboratory Staff', date: new Date(now - 120 * 60000).toISOString() },
          { test: 'Total Bilirubin', value: '0.8', unit: 'mg/dL', range: '0.2 - 1.2', flag: 'Normal', verifiedBy: 'Laboratory Staff', date: new Date(now - 120 * 60000).toISOString() }
        ],
        completedBy: 'Laboratory Staff (Technician)',
        completedAt: new Date(now - 120 * 60000).toISOString(),
        createdAt: new Date(now - 180 * 60000).toISOString()
      }
    ];

    sampleOrders.forEach(function(seed) {
      var exists = orders.some(function(o){ return String(o.id) === String(seed.id); });
      if (!exists) orders.unshift(seed);
    });

    saveAllRawOrders(orders);

    // Sync with patient.labRequests & labResults
    try {
      var pts = getPatientList();
      pts.forEach(function(pt) {
        if (String(pt.id) === String(p1.id)) {
          pt.labRequests = pt.labRequests || [];
          if (!pt.labRequests.some(function(r){ return r.id === 'ORD-LAB-2026-101'; })) {
            pt.labRequests.push({
              id: 'ORD-LAB-2026-101',
              tests: ['CBC - Complete Blood Count', 'Random Blood Sugar (RBS)'],
              priority: 'Routine',
              sampleType: 'Whole Blood (EDTA)',
              requestedBy: 'Dr. Jean Dupont',
              timestamp: new Date(now - 35 * 60000).toISOString(),
              status: 'pending'
            });
          }
        }
        if (String(pt.id) === String(p2.id)) {
          pt.labRequests = pt.labRequests || [];
          if (!pt.labRequests.some(function(r){ return r.id === 'ORD-LAB-2026-102'; })) {
            pt.labRequests.push({
              id: 'ORD-LAB-2026-102',
              tests: ['Renal Function Test (RFT)', 'Malaria Parasite (MP)'],
              priority: 'Urgent',
              sampleType: 'Serum / Smear',
              requestedBy: 'Dr. Alice Mukamana',
              timestamp: new Date(now - 75 * 60000).toISOString(),
              status: 'pending'
            });
          }
        }
        if (String(pt.id) === String(p3.id)) {
          pt.labRequests = pt.labRequests || [];
          if (!pt.labRequests.some(function(r){ return r.id === 'ORD-LAB-2026-103'; })) {
            pt.labRequests.push({
              id: 'ORD-LAB-2026-103',
              tests: ['Liver Function Test (LFT)'],
              priority: 'Routine',
              sampleType: 'Serum',
              requestedBy: 'Dr. Robert Kagabo',
              timestamp: new Date(now - 180 * 60000).toISOString(),
              status: 'completed'
            });
          }
          pt.labResults = pt.labResults || [];
          if (!pt.labResults.some(function(r){ return r.test === 'ALT / SGPT'; })) {
            pt.labResults.push(
              { test: 'ALT / SGPT', value: '24', unit: 'U/L', range: '7 - 56', flag: 'Normal', verifiedBy: 'Laboratory Staff', date: new Date(now - 120 * 60000).toISOString() },
              { test: 'AST / SGOT', value: '28', unit: 'U/L', range: '10 - 40', flag: 'Normal', verifiedBy: 'Laboratory Staff', date: new Date(now - 120 * 60000).toISOString() },
              { test: 'Total Bilirubin', value: '0.8', unit: 'mg/dL', range: '0.2 - 1.2', flag: 'Normal', verifiedBy: 'Laboratory Staff', date: new Date(now - 120 * 60000).toISOString() }
            );
          }
        }
      });
      localStorage.setItem('pclinic_patients', JSON.stringify(pts));
    } catch(e) {}
  }

  function populateLabResultsPatientSelect() {
    var sel = byId('labResultsPatientSelect');
    if (!sel) return;
    var patients = getPatientList();
    var currentVal = activeLabResultsPatientId || sel.value || 'all';

    var curLabP = currentLabPatient();
    if (curLabP && curLabP.id && (activeLabResultsPatientId === 'all' || !activeLabResultsPatientId)) {
      currentVal = String(curLabP.id);
      activeLabResultsPatientId = currentVal;
    }

    var html = '<option value="all">👥 All Patients</option>';
    patients.forEach(function(p) {
      var name = (p.firstName + ' ' + (p.lastName || '')).trim() || ('Patient #' + p.id);
      var mrn = p.mrn || p.id;
      html += '<option value="' + p.id + '">' + name + ' (MRN: ' + mrn + ')</option>';
    });
    sel.innerHTML = html;
    sel.value = currentVal;
  }

  function onLabResultsPatientChange(val) {
    activeLabResultsPatientId = val || 'all';
    renderLabResultsModule();
  }

  function switchLabResultsMode(mode) {
    activeLabResultsMode = mode || 'results';
    var btnResults = byId('btnModeLabResults');
    var btnEntry = byId('btnModeResultEntry');
    var viewResults = byId('view-lab-results');
    var viewEntry = byId('view-result-entry');

    if (activeLabResultsMode === 'results') {
      if (btnResults) {
        btnResults.style.background = '#ffffff';
        btnResults.style.color = '#0071e3';
        btnResults.style.fontWeight = '700';
        btnResults.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      }
      if (btnEntry) {
        btnEntry.style.background = 'transparent';
        btnEntry.style.color = 'var(--tm, #8e8e93)';
        btnEntry.style.fontWeight = '600';
        btnEntry.style.boxShadow = 'none';
      }
      if (viewResults) viewResults.style.display = 'block';
      if (viewEntry) viewEntry.style.display = 'none';
      renderRequestedLabsTable();
      renderVerifiedLabResultsTable();
    } else {
      if (btnEntry) {
        btnEntry.style.background = '#ffffff';
        btnEntry.style.color = '#0071e3';
        btnEntry.style.fontWeight = '700';
        btnEntry.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      }
      if (btnResults) {
        btnResults.style.background = 'transparent';
        btnResults.style.color = 'var(--tm, #8e8e93)';
        btnResults.style.fontWeight = '600';
        btnResults.style.boxShadow = 'none';
      }
      if (viewEntry) viewEntry.style.display = 'block';
      if (viewResults) viewResults.style.display = 'none';
      renderResultEntryTable(activeTargetOrderId);
    }
  }

  function openResultEntryForOrder(orderId) {
    activeTargetOrderId = orderId;
    switchLabResultsMode('entry');
  }

  function renderRequestedLabsTable() {
    var tbody = byId('tbodyRequestedLabs');
    var badge = byId('labReqCountBadge');
    var filterSel = byId('labReqFilter');
    var filter = filterSel ? filterSel.value : 'all';
    if (!tbody) return;

    var orders = getAllRawOrders().filter(function(o) {
      return o && (o.dept === 'lab' || o.type === 'lab');
    });

    if (activeLabResultsPatientId && activeLabResultsPatientId !== 'all') {
      orders = orders.filter(function(o) {
        return String(o.patientId).replace(/^MOD-/i, '') === String(activeLabResultsPatientId).replace(/^MOD-/i, '');
      });
    }

    if (filter !== 'all') {
      orders = orders.filter(function(o) {
        var st = (o.status || 'pending').toLowerCase();
        return st === filter;
      });
    }

    if (badge) badge.textContent = orders.length + ' request' + (orders.length !== 1 ? 's' : '');

    if (!orders.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--tm);font-size:12px;">No laboratory requests found matching the current filter.</td></tr>';
      return;
    }

    var patients = getPatientList();
    var rows = orders.map(function(o) {
      var pt = patients.find(function(p){ return String(p.id).replace(/^MOD-/i, '') === String(o.patientId).replace(/^MOD-/i, ''); }) || {};
      var pName = (o.patientName || (pt.firstName ? (pt.firstName + ' ' + (pt.lastName || '')) : ('Patient #' + o.patientId))).trim();
      var mrn = pt.mrn || o.patientId;
      var tests = (o.items || []).map(function(it){ return it.name || it.test || 'Lab Test'; }).join(', ');
      var priority = o.priority || 'Routine';
      var sampleType = o.sampleType || 'Whole Blood';
      var doctor = o.doctor || o.requestedBy || 'Attending Physician';
      var isCompleted = (o.status || '').toLowerCase() === 'completed';
      var isCancelled = (o.status || '').toLowerCase() === 'cancelled';
      var dateStr = o.createdAt ? new Date(o.createdAt).toLocaleString('en-GB') : (o.date || 'Today');

      var statusBadge = '';
      if (isCompleted) {
        statusBadge = '<span class="badge b-stable" style="background:#e9f9ee;color:#1a7a32;font-weight:700;font-size:10.5px;padding:3px 10px;border-radius:20px;">✅ Verified by Lab</span>';
      } else if (isCancelled) {
        statusBadge = '<span class="badge" style="background:#ffebe9;color:#8a1f1a;font-weight:700;font-size:10.5px;padding:3px 10px;border-radius:20px;">❌ Cancelled</span>';
      } else {
        statusBadge = '<span class="badge" style="background:#fff4e0;color:#7a4500;font-weight:700;font-size:10.5px;padding:3px 10px;border-radius:20px;">⏳ Pending at Lab</span>';
      }

      var actionBtn = '';
      if (!isCompleted && !isCancelled) {
        actionBtn = '<button type="button" class="btn-s" onclick="openResultEntryForOrder(\'' + o.id + '\')" style="height:26px;padding:0 10px;font-size:11px;font-weight:700;color:#0071e3;border-color:rgba(0,113,227,0.3);background:#eef6ff;border-radius:6px;cursor:pointer;"><i class="ti ti-pencil"></i> Enter Results</button>';
      } else if (isCompleted) {
        actionBtn = '<button type="button" class="btn-s" onclick="switchLabResultsMode(\'results\')" style="height:26px;padding:0 10px;font-size:11px;font-weight:700;color:#1a7a32;background:#e9f9ee;border-color:rgba(26,122,50,0.3);border-radius:6px;cursor:pointer;"><i class="ti ti-check"></i> Verified</button>';
      }

      return '<tr>' +
        '<td style="font-weight:700;color:#0071e3;font-size:11.5px;">#' + o.id + '</td>' +
        '<td><div style="font-weight:700;color:#1d1d1f;font-size:12px;">' + pName + '</div><div style="font-size:10.5px;color:var(--tm);">MRN: ' + mrn + '</div></td>' +
        '<td><div style="font-weight:700;color:#1d1d1f;font-size:12px;">' + tests + '</div><div style="font-size:10.5px;color:var(--tm);">' + priority + ' • ' + sampleType + ' • ' + doctor + '</div></td>' +
        '<td><span class="badge b-info" style="font-size:10.5px;">Laboratory</span></td>' +
        '<td style="font-size:11px;color:#6e6e73;white-space:nowrap;">' + dateStr + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + actionBtn + '</td>' +
      '</tr>';
    }).join('');

    tbody.innerHTML = rows;
  }

  function renderVerifiedLabResultsTable() {
    var tbody = byId('tbodyVerifiedLabResults');
    if (!tbody) return;

    var orders = getAllRawOrders().filter(function(o) {
      return o && (o.dept === 'lab' || o.type === 'lab') && (o.status || '').toLowerCase() === 'completed';
    });

    if (activeLabResultsPatientId && activeLabResultsPatientId !== 'all') {
      orders = orders.filter(function(o) {
        return String(o.patientId).replace(/^MOD-/i, '') === String(activeLabResultsPatientId).replace(/^MOD-/i, '');
      });
    }

    var patients = getPatientList();
    var verifiedRows = [];

    // Also pull verified results from patient records if present
    orders.forEach(function(o) {
      var pt = patients.find(function(p){ return String(p.id).replace(/^MOD-/i, '') === String(o.patientId).replace(/^MOD-/i, ''); }) || {};
      var pName = (o.patientName || (pt.firstName ? (pt.firstName + ' ' + (pt.lastName || '')) : ('Patient #' + o.patientId))).trim();
      var mrn = pt.mrn || o.patientId;
      var dateStr = o.completedAt ? new Date(o.completedAt).toLocaleString('en-GB') : 'Verified';
      var verifier = o.completedBy || 'Laboratory Staff';

      var results = Array.isArray(o.results) ? o.results : [];
      if (!results.length && o.result) {
        results = [{ test: o.items && o.items[0] ? o.items[0].name : 'Lab Exam', value: o.result, unit: '', range: 'Normal', flag: 'Normal' }];
      }

      results.forEach(function(r) {
        verifiedRows.push({
          test: r.test || 'Analyte',
          patientName: pName,
          mrn: mrn,
          value: r.value || '--',
          unit: r.unit || '',
          range: r.range || 'Reference Normal',
          flag: r.flag || 'Normal',
          dateStr: dateStr,
          verifier: verifier
        });
      });
    });

    // Check if patient records have standalone verified labResults
    if (activeLabResultsPatientId && activeLabResultsPatientId !== 'all') {
      var curP = patients.find(function(p){ return String(p.id).replace(/^MOD-/i, '') === String(activeLabResultsPatientId).replace(/^MOD-/i, ''); });
      if (curP && Array.isArray(curP.labResults)) {
        curP.labResults.forEach(function(r) {
          if (!verifiedRows.some(function(v){ return v.test === r.test && v.value === r.value; })) {
            verifiedRows.push({
              test: r.test || 'Analyte',
              patientName: (curP.firstName + ' ' + (curP.lastName || '')).trim(),
              mrn: curP.mrn || curP.id,
              value: r.value || '--',
              unit: r.unit || '',
              range: r.range || 'Reference Normal',
              flag: r.flag || 'Normal',
              dateStr: r.date ? new Date(r.date).toLocaleString('en-GB') : 'Verified',
              verifier: r.verifiedBy || 'Laboratory Staff'
            });
          }
        });
      }
    }

    if (!verifiedRows.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--tm);font-size:12px;">No verified laboratory results recorded yet. Results saved from Result Entry will appear here live.</td></tr>';
      return;
    }

    tbody.innerHTML = verifiedRows.map(function(r) {
      var flag = r.flag || 'Normal';
      var flagBadge = '';
      if (flag === 'Critical' || flag === 'Panic') {
        flagBadge = '<span style="background:#ffebe9;color:#8a1f1a;font-weight:800;font-size:10.5px;padding:2px 8px;border-radius:12px;border:0.5px solid rgba(138,31,26,0.25);">Critical</span>';
      } else if (flag === 'High') {
        flagBadge = '<span style="background:#fff4e0;color:#7a4500;font-weight:700;font-size:10.5px;padding:2px 8px;border-radius:12px;border:0.5px solid rgba(122,69,0,0.25);">High</span>';
      } else if (flag === 'Low') {
        flagBadge = '<span style="background:#fff4e0;color:#7a4500;font-weight:700;font-size:10.5px;padding:2px 8px;border-radius:12px;border:0.5px solid rgba(122,69,0,0.25);">Low</span>';
      } else {
        flagBadge = '<span style="background:#e9f9ee;color:#1a7a32;font-weight:700;font-size:10.5px;padding:2px 8px;border-radius:12px;border:0.5px solid rgba(26,122,50,0.25);">Normal</span>';
      }

      var valColor = '#1d1d1f';
      if (flag === 'High' || flag === 'Low') valColor = '#7a4500';
      if (flag === 'Critical') valColor = '#8a1f1a';

      return '<tr>' +
        '<td style="font-weight:700;color:#1d1d1f;font-size:12px;">' + r.test + '</td>' +
        '<td><div style="font-weight:700;color:#1d1d1f;font-size:11.5px;">' + r.patientName + '</div><div style="font-size:10px;color:var(--tm);">MRN: ' + r.mrn + '</div></td>' +
        '<td><strong style="font-size:12.5px;color:' + valColor + ';">' + r.value + '</strong></td>' +
        '<td style="font-size:11px;color:#6e6e73;">' + r.unit + '</td>' +
        '<td style="font-size:11px;color:#6e6e73;">' + r.range + '</td>' +
        '<td>' + flagBadge + '</td>' +
        '<td><span class="badge b-stable" style="background:#e9f9ee;color:#1a7a32;font-weight:700;font-size:10px;padding:2px 7px;">✓ Verified</span></td>' +
        '<td style="font-size:10.5px;color:#6e6e73;"><div style="white-space:nowrap;">' + r.dateStr + '</div><div style="font-size:9.5px;color:var(--tm);">' + r.verifier + '</div></td>' +
      '</tr>';
    }).join('');
  }

  function getAnalytesForOrder(order) {
    var items = order.items || [];
    var analytes = [];
    items.forEach(function(it) {
      var name = it.name || it.test || 'Test';
      if (LAB_TEST_CATALOG[name]) {
        analytes = analytes.concat(LAB_TEST_CATALOG[name]);
      } else {
        var matchedKey = Object.keys(LAB_TEST_CATALOG).find(function(k) {
          return k.toLowerCase().indexOf(name.toLowerCase()) !== -1 || name.toLowerCase().indexOf(k.toLowerCase()) !== -1;
        });
        if (matchedKey) {
          analytes = analytes.concat(LAB_TEST_CATALOG[matchedKey]);
        } else {
          analytes.push({
            code: it.code || 'PARAM',
            name: name,
            unit: 'Unit',
            range: 'Normal',
            min: null,
            max: null,
            defaultVal: ''
          });
        }
      }
    });

    var seen = {};
    return analytes.filter(function(a) {
      var k = a.code || a.name;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  function renderResultEntryTable(targetOrderId) {
    var tbody = byId('tbodyResultEntry');
    var badge = byId('entryTargetPatientBadge');
    if (!tbody) return;

    var orders = getAllRawOrders().filter(function(o) {
      return o && (o.dept === 'lab' || o.type === 'lab') && (o.status || '').toLowerCase() === 'pending';
    });

    if (targetOrderId) {
      var specific = orders.filter(function(o){ return String(o.id) === String(targetOrderId); });
      if (specific.length) orders = specific;
    } else if (activeLabResultsPatientId && activeLabResultsPatientId !== 'all') {
      orders = orders.filter(function(o) {
        return String(o.patientId).replace(/^MOD-/i, '') === String(activeLabResultsPatientId).replace(/^MOD-/i, '');
      });
    }

    if (badge) {
      if (orders.length === 1) {
        badge.textContent = 'Order #' + orders[0].id + ' • ' + (orders[0].patientName || 'Patient');
      } else {
        badge.textContent = orders.length + ' Pending Order' + (orders.length !== 1 ? 's' : '') + ' Ready for Entry';
      }
    }

    if (!orders.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--tm);font-size:12px;">' +
        '<div style="font-size:24px;margin-bottom:6px;">✅</div>' +
        'No pending laboratory requests requiring entry for the selected filter.<br>' +
        '<span style="font-size:11px;">Select "All Patients" or create/receive a new test request.</span>' +
      '</td></tr>';
      return;
    }

    var patients = getPatientList();
    var rowIndex = 1;
    var rowsHtml = '';

    orders.forEach(function(o) {
      var pt = patients.find(function(p){ return String(p.id).replace(/^MOD-/i, '') === String(o.patientId).replace(/^MOD-/i, ''); }) || {};
      var pName = (o.patientName || (pt.firstName ? (pt.firstName + ' ' + (pt.lastName || '')) : ('Patient #' + o.patientId))).trim();
      var mrn = pt.mrn || o.patientId;
      var analytes = getAnalytesForOrder(o);

      analytes.forEach(function(analyte) {
        var rowId = 'entry_row_' + rowIndex;
        var inputId = 'input_val_' + rowIndex;
        var flagId = 'flag_sel_' + rowIndex;

        rowsHtml += '<tr id="' + rowId + '">' +
          '<td style="font-weight:700;color:var(--tm);font-size:11px;">' + rowIndex + '</td>' +
          '<td><div style="font-weight:700;color:#1d1d1f;font-size:12px;">' + pName + '</div><div style="font-size:10.5px;color:var(--tm);">MRN: ' + mrn + ' • Order #' + o.id + '</div></td>' +
          '<td><div style="font-weight:700;color:#0071e3;font-size:12px;">' + analyte.name + '</div><div style="font-size:10px;color:var(--tm);">' + (analyte.code || '') + '</div></td>' +
          '<td style="background:rgba(0,113,227,0.03);">' +
            '<input type="text" id="' + inputId + '" class="fi result-entry-highlight-input" ' +
                   'data-order-id="' + o.id + '" ' +
                   'data-patient-id="' + o.patientId + '" ' +
                   'data-test-name="' + analyte.name + '" ' +
                   'data-unit="' + (analyte.unit || '') + '" ' +
                   'data-range="' + (analyte.range || '') + '" ' +
                   'data-min="' + (analyte.min != null ? analyte.min : '') + '" ' +
                   'data-max="' + (analyte.max != null ? analyte.max : '') + '" ' +
                   'data-flag-id="' + flagId + '" ' +
                   'value="' + (analyte.defaultVal || '') + '" ' +
                   'placeholder="Enter result…" ' +
                   'oninput="onResultEntryInputChange(this)" ' +
                   'style="width:130px;height:28px;font-size:12px;font-weight:700;color:#0071e3;background:#eef6ff !important;border:1.5px solid #0071e3 !important;border-radius:6px;padding:2px 8px;box-shadow:0 1px 3px rgba(0,113,227,0.15);" />' +
          '</td>' +
          '<td style="font-size:11.5px;color:#3a3a3c;font-weight:600;">' + (analyte.unit || '--') + '</td>' +
          '<td style="font-size:11px;color:#6e6e73;">' + (analyte.range || 'Normal') + '</td>' +
          '<td>' +
            '<select id="' + flagId + '" class="fi result-flag-select flag-normal" onchange="updateFlagSelectStyle(this)" style="height:26px;font-size:11px;font-weight:700;border-radius:6px;padding:0 6px;">' +
              '<option value="Normal" selected>Normal</option>' +
              '<option value="Low">Low</option>' +
              '<option value="High">High</option>' +
              '<option value="Critical">Critical</option>' +
            '</select>' +
          '</td>' +
          '<td><span class="badge b-info" style="font-size:10px;">Laboratory</span></td>' +
        '</tr>';
        rowIndex++;
      });
    });

    tbody.innerHTML = rowsHtml;
  }

  function onResultEntryInputChange(input) {
    if (!input) return;
    var val = input.value.trim();
    var min = input.getAttribute('data-min');
    var max = input.getAttribute('data-max');
    var flagId = input.getAttribute('data-flag-id');
    var flagSel = byId(flagId);
    if (!flagSel) return;

    if (min !== '' && max !== '' && !isNaN(val) && val !== '') {
      var num = parseFloat(val);
      var minNum = parseFloat(min);
      var maxNum = parseFloat(max);
      if (num < minNum) {
        flagSel.value = 'Low';
      } else if (num > maxNum) {
        flagSel.value = 'High';
      } else {
        flagSel.value = 'Normal';
      }
    } else {
      var lower = val.toLowerCase();
      if (lower.indexOf('pos') !== -1 || lower.indexOf('reactive') !== -1) {
        flagSel.value = 'High';
      } else if (lower.indexOf('neg') !== -1 || lower.indexOf('non') !== -1) {
        flagSel.value = 'Normal';
      }
    }
    updateFlagSelectStyle(flagSel);
  }

  function updateFlagSelectStyle(select) {
    if (!select) return;
    select.classList.remove('flag-normal', 'flag-low', 'flag-high', 'flag-critical');
    var val = (select.value || '').toLowerCase();
    if (val === 'critical') select.classList.add('flag-critical');
    else if (val === 'high') select.classList.add('flag-high');
    else if (val === 'low') select.classList.add('flag-low');
    else select.classList.add('flag-normal');
  }

  function saveAndSendLabResultsToDoctor() {
    var inputs = document.querySelectorAll('#tbodyResultEntry .result-entry-highlight-input');
    if (!inputs || !inputs.length) {
      notify('No pending laboratory tests found to save.', 'warning');
      return;
    }

    var ordersMap = {};
    var enteredCount = 0;

    inputs.forEach(function(inp) {
      var orderId = inp.getAttribute('data-order-id');
      var patientId = inp.getAttribute('data-patient-id');
      var testName = inp.getAttribute('data-test-name');
      var unit = inp.getAttribute('data-unit') || '';
      var range = inp.getAttribute('data-range') || '';
      var flagId = inp.getAttribute('data-flag-id');
      var flagSel = byId(flagId);
      var flag = flagSel ? flagSel.value : 'Normal';
      var value = (inp.value || '').trim();

      if (!value) return;
      enteredCount++;

      if (!ordersMap[orderId]) {
        ordersMap[orderId] = {
          orderId: orderId,
          patientId: patientId,
          results: []
        };
      }
      ordersMap[orderId].results.push({
        test: testName,
        value: value,
        unit: unit,
        range: range,
        flag: flag,
        verifiedBy: (window.currentStaff && window.currentStaff.name) || 'Laboratory Staff (Technician)',
        date: new Date().toISOString()
      });
    });

    if (enteredCount === 0) {
      notify('Please enter at least one test result measurement before saving.', 'warning');
      return;
    }

    var allOrders = getAllRawOrders();
    var allPatients = getPatientList();
    var nowIso = new Date().toISOString();
    var staffName = (window.currentStaff && window.currentStaff.name) || 'Laboratory Staff (Technician)';

    Object.keys(ordersMap).forEach(function(oId) {
      var entry = ordersMap[oId];
      var o = allOrders.find(function(item){ return String(item.id) === String(oId); });
      if (o) {
        o.status = 'completed';
        o.completedAt = nowIso;
        o.completedBy = staffName;
        o.results = entry.results;
        o.result = 'Verified: ' + entry.results.map(function(r){ return r.test + ': ' + r.value + ' ' + r.unit; }).join(', ');
      }

      // Update patient labRequests & labResults
      var p = allPatients.find(function(pt){ return String(pt.id).replace(/^MOD-/i, '') === String(entry.patientId).replace(/^MOD-/i, ''); });
      if (p) {
        p.labRequests = p.labRequests || [];
        p.labRequests.forEach(function(req) {
          if (String(req.id) === String(oId)) {
            req.status = 'completed';
          }
        });
        p.labResults = p.labResults || [];
        entry.results.forEach(function(res) {
          p.labResults.push(res);
        });
      }
    });

    saveAllRawOrders(allOrders);
    try {
      localStorage.setItem('pclinic_patients', JSON.stringify(allPatients));
    } catch(e){}

    // Live broadcast to Doctor Dashboard and other components
    try {
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
      window.dispatchEvent(new CustomEvent('labResultsUpdated'));
      window.dispatchEvent(new CustomEvent('patientsUpdated'));
      window.dispatchEvent(new CustomEvent('labResultSentToDoctor', { detail: { orders: ordersMap } }));
      localStorage.setItem('pclinic_last_lab_broadcast', Date.now().toString());
    } catch(e){}

    notify('✅ Results saved and automatically sent to Doctor Dashboard!', 'success');
    activeTargetOrderId = null;
    switchLabResultsMode('results');
  }

  function renderLabResultsModule() {
    seedSampleLabRequestsIfEmpty();
    populateLabResultsPatientSelect();
    switchLabResultsMode(activeLabResultsMode);
  }

  window.switchLabResultsMode = switchLabResultsMode;
  window.onLabResultsPatientChange = onLabResultsPatientChange;
  window.renderLabResultsModule = renderLabResultsModule;
  window.renderRequestedLabsTable = renderRequestedLabsTable;
  window.renderVerifiedLabResultsTable = renderVerifiedLabResultsTable;
  window.renderResultEntryTable = renderResultEntryTable;
  window.openResultEntryForOrder = openResultEntryForOrder;
  window.onResultEntryInputChange = onResultEntryInputChange;
  window.updateFlagSelectStyle = updateFlagSelectStyle;
  window.saveAndSendLabResultsToDoctor = saveAndSendLabResultsToDoctor;


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
      if (!key || key === 'pclinic_lab_selected_patient' || key === 'pclinic_active_patient' || key === 'pclinic_patients' || key === 'pclinic_orders') {
        queueSharedLabHeaderSync();
      }
      queueDoctorParityClasses();
    });

    // Auto pull requested labs from Common Server
    setTimeout(function() { pullLabRequestsFromCommonServer(false); }, 150);

    window.addEventListener('firebaseReady', function() {
      pullLabRequestsFromCommonServer(false);
      setupCommonServerLabRealtimeSync();
    });

    window.addEventListener('pclinicStaffReady', function() {
      pullLabRequestsFromCommonServer(false);
    });

    window.addEventListener('ordersUpdated', function() {
      renderRequestedLabsTable();
      renderVerifiedLabResultsTable();
      if (activeLabResultsMode === 'entry') renderResultEntryTable(activeTargetOrderId);
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
  window.labQuickAction = labQuickAction;
  window.pullLabRequestsFromCommonServer = pullLabRequestsFromCommonServer;
  window.labRefreshOverviewQueue = function () {
    pullLabRequestsFromCommonServer(true);
  };
})();
