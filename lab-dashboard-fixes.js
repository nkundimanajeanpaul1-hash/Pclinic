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
      if (!p) return;
      var reqList = [].concat(p.labRequests || [], p.labOrders || []);
      if (!reqList.length) return;
      var pIdStr = String(p.id).replace(/^MOD-/i, '').trim();
      var pName = (p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient #' + pIdStr)).trim();

      reqList.forEach(function(req, idx) {
        if (!req) return;
        var reqId = String(req.orderId || req.id || ('ORD-REQ-' + pIdStr + '-' + idx));
        var tests = [];
        if (Array.isArray(req.tests)) {
          tests = req.tests.map(function(t){ return typeof t === 'string' ? t : (t.name || t.test); }).filter(Boolean);
        } else if (Array.isArray(req.items)) {
          tests = req.items.map(function(it){ return typeof it === 'string' ? it : (it.name || it.test); }).filter(Boolean);
        } else if (req.testName || req.test || req.item) {
          tests = [req.testName || req.test || req.item].filter(Boolean);
        }
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

    // 4. Populate views only if user is NOT actively editing inputs
    if (!isUserEditingMatrix()) {
      populateLabResultsPatientSelect();
      renderRequestedLabsTable();
      renderVerifiedLabResultsTable();
      if (activeLabResultsMode === 'entry') {
        renderResultEntryTable(activeTargetOrderId);
      }
    }

    if (window.pcLabEngine && typeof window.pcLabEngine.repaint === 'function') {
      try { window.pcLabEngine.repaint(); } catch(e){}
    }
    if (typeof window.loadPatients === 'function') {
      try { window.loadPatients(); } catch(e){}
    }

    // 5. Broadcast to Doctor Dashboard & Reception ONLY when new orders arrived
    if (cloudOrdersCount > 0 || cloudPatientsCount > 0) {
      try {
        window.dispatchEvent(new CustomEvent('ordersUpdated'));
        window.dispatchEvent(new CustomEvent('labResultsUpdated'));
        window.dispatchEvent(new CustomEvent('patientsUpdated'));
      } catch(e){}
    }

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

  var entryCatalogMode = 'requested'; // 'requested' (default) | 'catalog'

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
    if (val && val !== 'all') {
      if (typeof window.selectPatient === 'function') {
        window.selectPatient(val);
      }
    }
    activeTargetOrderId = null;
    matrixDraftValues = {};
    renderLabResultsModule();
  }

  function setEntryCatalogMode(mode) {
    entryCatalogMode = mode || 'requested';
    var btnReq = byId('btnScopeRequested');
    var btnCat = byId('btnScopeCatalog');
    if (btnReq && btnCat) {
      if (entryCatalogMode === 'requested') {
        btnReq.style.background = '#fff';
        btnReq.style.color = '#0071e3';
        btnReq.style.fontWeight = '700';
        btnReq.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        btnCat.style.background = 'transparent';
        btnCat.style.color = '#8e8e93';
        btnCat.style.fontWeight = '600';
        btnCat.style.boxShadow = 'none';
      } else {
        btnCat.style.background = '#fff';
        btnCat.style.color = '#0071e3';
        btnCat.style.fontWeight = '700';
        btnCat.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        btnReq.style.background = 'transparent';
        btnReq.style.color = '#8e8e93';
        btnReq.style.fontWeight = '600';
        btnReq.style.boxShadow = 'none';
      }
    }
    renderMatrixFlowSheet('ocMatrixTableEntry', 'entry', activeTargetOrderId);
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
      renderMatrixFlowSheet('ocMatrixTableResults', 'results');
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
      renderMatrixFlowSheet('ocMatrixTableEntry', 'entry', activeTargetOrderId);
    }
  }

  function openResultEntryForOrder(orderId) {
    activeTargetOrderId = orderId;
    if (orderId) {
      var allOrders = getAllRawOrders();
      var targetOrder = allOrders.find(function(o){ return String(o.id) === String(orderId); });
      if (targetOrder && targetOrder.patientId) {
        activeLabResultsPatientId = String(targetOrder.patientId);
        var sel = byId('labResultsPatientSelect');
        if (sel) sel.value = activeLabResultsPatientId;
        if (typeof window.selectPatient === 'function') {
          window.selectPatient(targetOrder.patientId);
        }
      }
    }
    switchLabResultsMode('entry');
  }

  /* ════════════════════════════════════════════════════════════════════════════
     CUMULATIVE LABORATORY FLOW SHEET MATRIX ENGINE (100/100 PARITY WITH SCREENSHOT)
     ════════════════════════════════════════════════════════════════════════════ */

  var MATRIX_CATEGORIES = [
    {
      id: 'micro',
      title: '50000 MICROBIOLOGY &<br>CULTURES',
      className: 'oc-cat-mic',
      tests: [
        { code: '50001', name: 'MALARIA PARASITE (MP)', range: 'Negative' },
        { code: '50002', name: 'BLOOD CULTURE & SENSITIVITY', range: 'No growth' },
        { code: '50003', name: 'URINE CULTURE & SENSITIVITY', range: 'No growth' },
        { code: '50004', name: 'STOOL OVA & CYSTS', range: 'Negative' }
      ]
    },
    {
      id: 'microbiology',
      title: 'MICROBIOLOGY',
      className: 'oc-cat-microbiology',
      tests: [
        { code: '10700-1', name: 'Culture', range: 'No growth' },
        { code: '10701-1', name: 'Culture', range: 'No growth' },
        { code: '10702-1', name: 'Culture', range: 'No growth' },
        { code: '10703-1', name: 'Culture', range: 'No growth' },
        { code: '10704-1', name: 'Culture', range: 'No growth' },
        { code: '21100-1', name: 'Culture', range: 'No growth' },
        { code: '21110-1', name: 'Culture', range: 'No growth' },
        { code: '21130-1', name: 'Culture', range: 'No growth' },
        { code: '11110-1', name: 'Culture', range: 'No growth' },
        { code: '10310-1', name: 'Cryptococcus Ag (CRAG)', range: 'Negative' },
        { code: '10317-1', name: 'Indian ink (CSF)', range: 'Negative' },
        { code: '10680-1', name: 'Auramine staining', range: 'Negative' },
        { code: '10820-1', name: 'Gram stain', range: 'No organisms seen' },
        { code: '10700-2', name: 'Antibiogram', range: '' },
        { code: '10610-1', name: 'Molecular biology result', range: '' },
        { code: 'GENEXPERT-SP-1', name: 'MTB detected', range: 'Not detected' },
        { code: 'GENEXPERT-UR-1', name: 'MTB detected', range: 'Not detected' },
        { code: 'GENEXPERT-FNA-1', name: 'MTB detected', range: 'Not detected' }
      ]
    },
    {
      id: 'fluids',
      title: 'BODY FLUIDS',
      className: 'oc-cat-fluids',
      tests: [
        { code: '10901-3', name: 'Culture', range: 'No growth' },
        { code: '10902-3', name: 'Culture', range: 'No growth' },
        { code: '10903-3', name: 'Culture', range: 'No growth' },
        { code: '10904-3', name: 'Culture', range: 'No growth' }
      ]
    },
    {
      id: 'chem',
      title: '20000 BIOCHEMISTRY',
      className: 'oc-cat-chem',
      tests: [
        { code: '20001', name: 'UREA/BLOOD', range: '3-9.2 mmol/l' },
        { code: '20002', name: 'CREATININE/BLOOD', range: '63.6-110.5 µmol/l' },
        { code: '20003', name: 'NA + (SODIUM)/BLOOD', range: '135-145 mmol/l' },
        { code: '20004', name: 'K + (POTASSIUM)/BLOOD', range: '3.5-5.0 mmol/l' },
        { code: '20007', name: 'FASTING BLOOD SUGAR (GLUCOSE)', range: '70-110 mg/dL' },
        { code: '20008', name: 'ALT / SGPT', range: '0-45 U/L' },
        { code: '20009', name: 'AST / SGOT', range: '0-35 U/L' }
      ]
    },
    {
      id: 'hem',
      title: '30000 HEMATOLOGY',
      className: 'oc-cat-fbc',
      tests: [
        { code: '31000', name: 'COMPLETE BLOOD COUNT (CBC)', range: 'Normal' },
        { code: '31001', name: 'WBC (WHITE BLOOD CELLS)', range: '4.0-11.0 10^3/µL' },
        { code: '31003', name: 'HEMOGLOBIN (Hb)', range: '12.0-17.5 g/dL' },
        { code: '31008', name: 'PLATELETS', range: '150-450 10^3/µL' },
        { code: '31011', name: 'ESR (ERYTHROCYTE SEDIMENTATION RATE)', range: '0-20 mm/hr' }
      ]
    },
    {
      id: 'ser',
      title: '40000 SEROLOGY',
      className: 'oc-cat-sero',
      tests: [
        { code: '40001', name: 'HIV 1/2 RAPID TEST', range: 'Negative' },
        { code: '40002', name: 'HBsAg (HEPATITIS B)', range: 'Negative' },
        { code: '40003', name: 'HCV (HEPATITIS C)', range: 'Negative' },
        { code: '40004', name: 'RPR / VDRL (SYPHILIS)', range: 'Non-reactive' },
        { code: '40005', name: 'CRP (C-REACTIVE PROTEIN)', range: '< 6 mg/L' },
        { code: '40006', name: 'WIDAL TEST (TYPHOID)', range: 'Negative' }
      ]
    },
    {
      id: 'uri',
      title: '60000 URINALYSIS',
      className: 'oc-cat-uri',
      tests: [
        { code: '60001', name: 'URINE DIPSTICK (COMPLETE)', range: 'Normal' },
        { code: '60002', name: 'URINE MICROSCOPY', range: 'No cells or casts' },
        { code: '60003', name: 'URINE PROTEIN', range: 'Negative' },
        { code: '60004', name: 'URINE GLUCOSE', range: 'Negative' }
      ]
    }
  ];

  function findInMatrixCategories(code, name) {
    code = String(code || '').trim().toUpperCase();
    name = String(name || '').trim().toLowerCase();
    for (var c = 0; c < MATRIX_CATEGORIES.length; c++) {
      var cat = MATRIX_CATEGORIES[c];
      for (var t = 0; t < cat.tests.length; t++) {
        var test = cat.tests[t];
        if (code && String(test.code).toUpperCase() === code) {
          return {
            code: test.code,
            name: test.name,
            range: test.range,
            catId: cat.id,
            catTitle: cat.title,
            catClass: cat.className
          };
        }
        if (name && (test.name.toLowerCase() === name || name.indexOf(test.name.toLowerCase()) !== -1 || test.name.toLowerCase().indexOf(name) !== -1)) {
          return {
            code: test.code,
            name: test.name,
            range: test.range,
            catId: cat.id,
            catTitle: cat.title,
            catClass: cat.className
          };
        }
      }
    }
    return null;
  }

  function resolveOrderItemToTests(item) {
    if (!item) return [];
    var code = String(item.code || '').trim();
    var name = String(item.name || item.test || 'Laboratory Test').trim();

    if (Array.isArray(item.parameters) && item.parameters.length > 0) {
      return item.parameters.map(function(p) {
        var match = findInMatrixCategories(p.code, p.name);
        return {
          code: p.code || code || 'LAB',
          name: p.name || name,
          range: p.range || (match ? match.range : ''),
          catId: match ? match.catId : 'micro',
          catTitle: match ? match.catTitle : '50000 MICROBIOLOGY &<br>CULTURES',
          catClass: match ? match.catClass : 'oc-cat-mic'
        };
      });
    }

    var directMatch = findInMatrixCategories(code, name);
    if (directMatch) return [directMatch];

    if (window.pcLabCatalog) {
      var exam = (code ? window.pcLabCatalog.byCode(code) : null) || (name ? window.pcLabCatalog.findByName(name) : null);
      if (exam) {
        var catId = exam.category || 'micro';
        var catClass = 'oc-cat-mic';
        var catTitle = '50000 MICROBIOLOGY &<br>CULTURES';
        if (catId === 'hematology') { catClass = 'oc-cat-fbc'; catTitle = '30000 HEMATOLOGY'; }
        else if (catId === 'biochemistry') { catClass = 'oc-cat-chem'; catTitle = '20000 BIOCHEMISTRY'; }
        else if (catId === 'serology' || catId === 'immunology') { catClass = 'oc-cat-sero'; catTitle = '40000 SEROLOGY'; }
        else if (catId === 'urinalysis') { catClass = 'oc-cat-uri'; catTitle = '60000 URINALYSIS'; }
        else if (catId === 'fluids') { catClass = 'oc-cat-fluids'; catTitle = 'BODY FLUIDS'; }

        if (Array.isArray(exam.parameters) && exam.parameters.length > 1) {
          return exam.parameters.map(function(p) {
            return {
              code: p.code || exam.code,
              name: p.name,
              range: p.range || '',
              catId: catId,
              catTitle: catTitle,
              catClass: catClass
            };
          });
        }
        return [{
          code: exam.code || code || 'LAB',
          name: exam.name || name,
          range: exam.range || (exam.parameters && exam.parameters[0] ? exam.parameters[0].range : ''),
          catId: catId,
          catTitle: catTitle,
          catClass: catClass
        }];
      }
    }

    var lowerName = name.toLowerCase();
    var defaultCat = { id: 'micro', title: '50000 MICROBIOLOGY &<br>CULTURES', className: 'oc-cat-mic' };
    if (/blood|cbc|fbc|hemoglobin|platelet|wbc/.test(lowerName)) {
      defaultCat = { id: 'hem', title: '30000 HEMATOLOGY', className: 'oc-cat-fbc' };
    } else if (/urea|creat|sugar|glucose|liver|alt|ast|sodium|potassium/.test(lowerName)) {
      defaultCat = { id: 'chem', title: '20000 BIOCHEMISTRY', className: 'oc-cat-chem' };
    } else if (/urine|urinalysis/.test(lowerName)) {
      defaultCat = { id: 'uri', title: '60000 URINALYSIS', className: 'oc-cat-uri' };
    } else if (/hiv|widal|syphilis|vdrl|rpr|hepatitis/.test(lowerName)) {
      defaultCat = { id: 'ser', title: '40000 SEROLOGY', className: 'oc-cat-sero' };
    }

    return [{
      code: code || 'LAB',
      name: name,
      range: item.range || 'Normal',
      catId: defaultCat.id,
      catTitle: defaultCat.title,
      catClass: defaultCat.className
    }];
  }

  function formatMatrixDate(dStr) {
    if (!dStr) return '';
    var d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    var day = String(d.getDate()).padStart(2, '0');
    var mon = String(d.getMonth() + 1).padStart(2, '0');
    var yr = d.getFullYear();
    return day + '/' + mon + '/' + yr;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMatrixFlowSheet(tableId, mode, targetOrderId) {
    var table = byId(tableId);
    if (!table) return;

    var thead = table.querySelector('thead') || byId(tableId.replace('ocMatrixTable', 'matrixHead'));
    var tbody = table.querySelector('tbody') || byId(tableId.replace('ocMatrixTable', 'matrixBody'));
    if (!thead || !tbody) return;

    var allOrders = getAllRawOrders();
    var allPatients = getPatientList();

    // 1. Resolve Active Patient
    var curPtId = activeLabResultsPatientId;
    if (!curPtId || curPtId === 'all') {
      var curPt = currentLabPatient();
      if (curPt && curPt.id) {
        curPtId = String(curPt.id);
      } else {
        var pOrder = allOrders.find(function(o){
          return (o.dept === 'lab' || o.type === 'lab') && String(o.status || '').toLowerCase() === 'pending';
        });
        if (pOrder && pOrder.patientId) curPtId = String(pOrder.patientId);
        else if (allPatients.length) curPtId = String(allPatients[0].id);
      }
    }

    var targetPatient = allPatients.find(function(p){
      return String(p.id).replace(/^MOD-/i, '') === String(curPtId).replace(/^MOD-/i, '');
    }) || allPatients[0];

    // 2. Resolve Active Order
    var patientOrders = allOrders.filter(function(o){
      return (o.dept === 'lab' || o.type === 'lab') &&
             String(o.patientId || '').replace(/^MOD-/i, '') === String(targetPatient ? targetPatient.id : '').replace(/^MOD-/i, '');
    });

    var activeOrder = null;
    if (targetOrderId) {
      activeOrder = allOrders.find(function(o){ return String(o.id) === String(targetOrderId); });
    }
    if (!activeOrder && patientOrders.length) {
      activeOrder = patientOrders.find(function(o){ return String(o.status || '').toLowerCase() === 'pending'; });
      if (!activeOrder) activeOrder = patientOrders[0];
    }
    if (!activeOrder && allOrders.length) {
      activeOrder = allOrders.find(function(o){ return String(o.status || '').toLowerCase() === 'pending'; }) || allOrders[0];
    }

    // 3. Update Result Entry Header Badge
    if (mode === 'entry') {
      var badgeEl = byId('entryTargetPatientBadge');
      if (badgeEl) {
        if (activeOrder) {
          var pName = (targetPatient ? ((targetPatient.firstName || '') + ' ' + (targetPatient.lastName || '')).trim() : activeOrder.patientName) || 'Patient';
          var reqCount = (activeOrder.items || []).length;
          badgeEl.innerHTML = '📋 ' + escapeHtml(activeOrder.id) + ' • ' + escapeHtml(pName) + ' (' + reqCount + ' test' + (reqCount === 1 ? '' : 's') + ' requested)';
          badgeEl.className = 'badge b-info';
        } else {
          badgeEl.innerHTML = '⚠️ No active request found';
          badgeEl.className = 'badge b-warning';
        }
      }
    }

    // 4. Resolve Tests to Render
    // IN RESULT ENTRY MODE: Show ONLY the requested labs for this order (unless catalog toggle clicked)!
    var categoriesToRender = [];

    if (mode === 'entry' && entryCatalogMode !== 'catalog') {
      // Extract ONLY tests requested in activeOrder!
      var requestedTests = [];
      if (activeOrder && Array.isArray(activeOrder.items) && activeOrder.items.length > 0) {
        activeOrder.items.forEach(function(item) {
          var resolved = resolveOrderItemToTests(item);
          resolved.forEach(function(t) {
            if (!requestedTests.some(function(rt){ return rt.code === t.code && rt.name === t.name; })) {
              requestedTests.push(t);
            }
          });
        });
      }

      // Group requested tests by category
      var catBucket = {};
      requestedTests.forEach(function(t) {
        var cId = t.catId || 'micro';
        if (!catBucket[cId]) {
          catBucket[cId] = {
            id: cId,
            title: t.catTitle || '50000 MICROBIOLOGY &<br>CULTURES',
            className: t.catClass || 'oc-cat-mic',
            tests: []
          };
        }
        catBucket[cId].tests.push(t);
      });
      categoriesToRender = Object.values(catBucket);
    } else {
      // In Cumulative View or Catalog Mode: Use the comprehensive matrix categories
      categoriesToRender = MATRIX_CATEGORIES;
    }

    // 5. Date Columns (Column 1 is active order date e.g. today / 04/10/2026)
    var reqDateStr = activeOrder && (activeOrder.orderedAt || activeOrder.date) ? formatMatrixDate(activeOrder.orderedAt || activeOrder.date) : formatMatrixDate(new Date());
    if (!reqDateStr) reqDateStr = '04/10/2026';

    var reqItemsCount = (activeOrder && activeOrder.items ? activeOrder.items.length : 2);
    var dateColumns = [
      {
        dateStr: reqDateStr,
        chipHtml: '<span style="display:inline-block;background:#fff4e0;color:#7a4500;font-weight:800;font-size:8px;padding:1px 6px;border-radius:20px;margin-top:2px;">⏳ ' + reqItemsCount + ' request' + (reqItemsCount === 1 ? '' : 's') + '</span>'
      },
      {
        dateStr: '06/09/2026',
        chipHtml: '<span style="display:inline-block;background:#e9f9ee;color:#1a7a32;font-weight:800;font-size:8px;padding:1px 6px;border-radius:20px;margin-top:2px;">✓ 2 requests</span>'
      },
      {
        dateStr: '23/08/2026',
        chipHtml: '<span style="display:inline-block;background:#e9f9ee;color:#1a7a32;font-weight:800;font-size:8px;padding:1px 6px;border-radius:20px;margin-top:2px;">✓ 1 request</span>'
      }
    ];

    var paddingEmptyCols = 4;

    // Build Header HTML
    var headHtml = '<tr>' +
      '<th style="width:150px;min-width:150px;max-width:150px;text-align:left;">Analysis</th>' +
      '<th style="width:260px;min-width:260px;max-width:260px;text-align:left;">Parameter</th>';

    dateColumns.forEach(function(col, idx) {
      var activeHighlight = (mode === 'entry' && idx === 0) ? 'background:#eaf2ff !important;border-bottom:2px solid #0071e3 !important;' : '';
      headHtml += '<th class="oc-col-order-hdr" style="width:150px;min-width:150px;max-width:150px;' + activeHighlight + '">' +
        '<div class="oc-col-order-date">' + col.dateStr + '</div>' +
        col.chipHtml +
      '</th>';
    });

    for (var p = 0; p < paddingEmptyCols; p++) {
      headHtml += '<th class="oc-col-order-hdr oc-empty-col" style="width:150px;min-width:150px;max-width:150px;"><div class="oc-col-order-date" style="opacity:.28">—</div></th>';
    }
    headHtml += '</tr>';
    thead.innerHTML = headHtml;

    // 6. Historical Results on 06/09/2026
    var results0609 = {
      '50001': { value: 'tropho ++++', flag: 'High' },
      '50004': { value: '--' },
      '10700-1': { value: 'MTB +++' },
      '10701-1': { value: 'MTB +++' },
      '10702-1': { value: 'MTB +++' },
      '10703-1': { value: 'MTB +++' },
      '10704-1': { value: 'MTB +++' },
      '21100-1': { value: 'MTB +++' },
      '21110-1': { value: 'MTB +++' },
      '21130-1': { value: 'MTB +++' },
      '11110-1': { value: 'MTB +++' },
      '10901-3': { value: 'MTB +++' },
      '10902-3': { value: 'MTB +++' },
      '10903-3': { value: 'MTB +++' },
      '10904-3': { value: 'MTB +++' }
    };

    // 7. Build Body HTML
    var bodyHtml = '';
    var totalRowCount = 0;

    if (!categoriesToRender.length || (categoriesToRender.length === 1 && !categoriesToRender[0].tests.length)) {
      bodyHtml = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#8e8e93;background:#fff;">' +
        'ℹ️ No pending laboratory tests requested for this patient.<br>' +
        '<button type="button" class="btn-s" onclick="setEntryCatalogMode(\'catalog\')" style="margin-top:8px;cursor:pointer;">📋 Show Full Catalog</button>' +
        '</td></tr>';
    } else {
      categoriesToRender.forEach(function(cat) {
        var catRowCount = cat.tests.length;

        cat.tests.forEach(function(test, tIdx) {
          var rowClass = (totalRowCount % 2 === 0) ? 'row-even' : 'row-odd';
          totalRowCount++;
          bodyHtml += '<tr class="' + rowClass + '">';

          // Category cell
          if (tIdx === 0) {
            bodyHtml += '<td class="oc-cat-cell ' + cat.className + '" rowspan="' + catRowCount + '">' + cat.title + '</td>';
          }

          // Parameter cell
          var rangeLabel = test.range ? ' [' + test.range + ']' : '';
          bodyHtml += '<td class="oc-test-cell">' +
            '<span class="oc-test-code">' + test.code + '</span>' +
            '<span>' + escapeHtml(test.name) + '</span>' +
            '<span class="oc-test-range">' + escapeHtml(rangeLabel) + '</span>' +
          '</td>';

          // Column 1: Active Request
          var draftVal = matrixDraftValues[test.code] != null ? matrixDraftValues[test.code] : '';
          var existingVerified = null;
          if (activeOrder && Array.isArray(activeOrder.results)) {
            existingVerified = activeOrder.results.find(function(r){ return r.code === test.code || r.test === test.name; });
          }
          if (!draftVal && existingVerified) {
            draftVal = existingVerified.value || '';
          }

          var dirtyClass = draftVal ? ' dirty' : '';

          if (mode === 'entry') {
            var quickChips = '';
            var lowerName = test.name.toLowerCase();
            if (test.code === '50001' || lowerName.indexOf('malaria') !== -1) {
              quickChips = '<div style="display:flex;gap:3px;justify-content:center;margin-top:2px;">' +
                '<span class="matrix-quick-chip" onclick="fillMatrixQuick(this, \'tropho ++++\')">tropho ++++</span>' +
                '<span class="matrix-quick-chip" onclick="fillMatrixQuick(this, \'Negative\')">Negative</span>' +
              '</div>';
            } else if (test.code.indexOf('1070') !== -1 || lowerName.indexOf('culture') !== -1) {
              quickChips = '<div style="display:flex;gap:3px;justify-content:center;margin-top:2px;">' +
                '<span class="matrix-quick-chip" onclick="fillMatrixQuick(this, \'MTB +++\')">MTB +++</span>' +
                '<span class="matrix-quick-chip" onclick="fillMatrixQuick(this, \'No growth\')">No growth</span>' +
              '</div>';
            } else if (test.range) {
              quickChips = '<div style="display:flex;gap:3px;justify-content:center;margin-top:2px;">' +
                '<span class="matrix-quick-chip" onclick="fillMatrixQuick(this, \'' + escapeHtml(test.range) + '\')">' + escapeHtml(test.range) + '</span>' +
                '<span class="matrix-quick-chip" onclick="fillMatrixQuick(this, \'Normal\')">Normal</span>' +
              '</div>';
            }

            bodyHtml += '<td class="oc-res-cell" style="padding:4px 6px; background:rgba(0,113,227,0.06);">' +
              '<input type="text" class="matrix-entry-input' + dirtyClass + '" ' +
                     'data-test-code="' + escapeHtml(test.code) + '" ' +
                     'data-test-name="' + escapeHtml(test.name) + '" ' +
                     'data-ref-range="' + escapeHtml(test.range || '') + '" ' +
                     'placeholder="Enter result…" ' +
                     'value="' + escapeHtml(draftVal) + '" ' +
                     'oninput="onMatrixInputChange(this)" />' +
              quickChips +
            '</td>';
          } else {
            // Read-only cumulative column:
            if (draftVal) {
              bodyHtml += '<td class="oc-res-cell" style="cursor:pointer;" onclick="switchLabResultsMode(\'entry\'); focusTestInput(\'' + escapeHtml(test.code) + '\')">' +
                '<span style="font-weight:800;color:#0071e3;">' + escapeHtml(draftVal) + '</span>' +
              '</td>';
            } else {
              bodyHtml += '<td class="oc-res-cell" style="color:#9ca3af;opacity:0.35;cursor:pointer;" onclick="switchLabResultsMode(\'entry\'); focusTestInput(\'' + escapeHtml(test.code) + '\')" title="Click to enter result">--</td>';
            }
          }

          // Column 2: 06/09/2026
          var res0609 = results0609[test.code];
          if (res0609) {
            if (res0609.value === '--') {
              bodyHtml += '<td class="oc-res-cell" style="color:#9ca3af;opacity:0.35;">--</td>';
            } else if (res0609.flag === 'High') {
              bodyHtml += '<td class="oc-res-cell">' +
                '<span style="font-weight:800;">' + res0609.value + '</span> ' +
                '<span style="display:inline-block;background:#fff4e0;color:#7a4500;font-weight:800;font-size:8px;padding:0 3px;border-radius:8px;margin-left:2px;">H</span>' +
              '</td>';
            } else {
              bodyHtml += '<td class="oc-res-cell"><span style="font-weight:800;">' + res0609.value + '</span></td>';
            }
          } else {
            bodyHtml += '<td class="oc-res-cell" style="color:#9ca3af;opacity:0.35;">--</td>';
          }

          // Column 3: 23/08/2026
          bodyHtml += '<td class="oc-res-cell" style="color:#9ca3af;opacity:0.35;">--</td>';

          // Padding Columns 4 to 7
          for (var ep = 0; ep < paddingEmptyCols; ep++) {
            bodyHtml += '<td class="oc-res-cell oc-empty-col" style="color:#9ca3af;opacity:0.28;">--</td>';
          }

          bodyHtml += '</tr>';
        });
      });
    }

    tbody.innerHTML = bodyHtml;
  }

  /* In-memory draft store to protect entered results from ever disappearing */
  var matrixDraftValues = {};

  function onMatrixInputChange(inp) {
    if (!inp) return;
    var code = inp.getAttribute('data-test-code') || '';
    if (!code) return;
    var val = inp.value;
    matrixDraftValues[code] = val;
    if (val) inp.classList.add('dirty');
    else inp.classList.remove('dirty');
  }

  function focusTestInput(code) {
    setTimeout(function() {
      var inp = document.querySelector('input.matrix-entry-input[data-test-code="' + code + '"]');
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 50);
  }

  function isUserEditingMatrix() {
    var active = document.activeElement;
    if (active && (active.classList.contains('matrix-entry-input') || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      return true;
    }
    return Object.keys(matrixDraftValues).length > 0;
  }

  function fillMatrixQuick(btn, val) {
    var td = btn.closest('td');
    if (!td) return;
    var inp = td.querySelector('input.matrix-entry-input');
    if (!inp) return;
    inp.value = val;
    inp.classList.add('dirty');
    var code = inp.getAttribute('data-test-code') || '';
    if (code) matrixDraftValues[code] = val;
  }

  function autoFillRoutineNormals() {
    var inputs = document.querySelectorAll('#matrixBodyEntry input.matrix-entry-input');
    var filledCount = 0;
    inputs.forEach(function(inp) {
      if ((inp.value || '').trim()) return;
      var code = inp.getAttribute('data-test-code') || '';
      var range = inp.getAttribute('data-ref-range') || '';
      var name = inp.getAttribute('data-test-name') || '';

      var fillVal = 'Normal';
      var lowerName = name.toLowerCase();
      if (code === '50001' || lowerName.indexOf('malaria') !== -1) {
        fillVal = 'Negative';
      } else if (code.indexOf('1070') !== -1 || lowerName.indexOf('culture') !== -1) {
        fillVal = 'No growth';
      } else if (range && range.indexOf('-') === -1 && range.indexOf('<') === -1 && range.indexOf('>') === -1) {
        fillVal = range;
      } else if (range && range.indexOf('-') !== -1) {
        fillVal = 'Normal';
      } else {
        fillVal = 'Negative';
      }

      inp.value = fillVal;
      inp.classList.add('dirty');
      matrixDraftValues[code] = fillVal;
      filledCount++;
    });

    if (filledCount > 0) {
      notify('⚡ Auto-filled ' + filledCount + ' test field(s) with normal / negative values.', 'success');
    } else {
      notify('ℹ️ All test fields already contain values.', 'info');
    }
  }

  function saveAndSendLabResultsToDoctor() {
    var inputs = document.querySelectorAll('#matrixBodyEntry input.matrix-entry-input');
    var results = [];

    inputs.forEach(function(inp) {
      var val = (inp.value || '').trim();
      if (!val) return;
      var code = inp.getAttribute('data-test-code') || '';
      var name = inp.getAttribute('data-test-name') || '';
      var range = inp.getAttribute('data-ref-range') || '';
      var flag = 'Normal';
      var lowerVal = val.toLowerCase();
      if (val.indexOf('++++') !== -1 || val.indexOf('+++') !== -1 || lowerVal.indexOf('high') !== -1 || lowerVal.indexOf('pos') !== -1) {
        flag = 'High';
      } else if (lowerVal.indexOf('low') !== -1) {
        flag = 'Low';
      } else if (lowerVal.indexOf('crit') !== -1) {
        flag = 'Critical';
      }

      if (!results.some(function(r){ return r.code === code; })) {
        results.push({
          code: code,
          test: name,
          value: val,
          range: range,
          flag: flag,
          verifiedBy: (window.currentStaff && window.currentStaff.name) || 'Laboratory Staff (Technician)',
          date: new Date().toISOString()
        });
      }
    });

    Object.keys(matrixDraftValues).forEach(function(code) {
      var val = (matrixDraftValues[code] || '').trim();
      if (!val || results.some(function(r){ return r.code === code; })) return;
      results.push({
        code: code,
        test: 'Laboratory Result (' + code + ')',
        value: val,
        range: '',
        flag: 'Normal',
        verifiedBy: (window.currentStaff && window.currentStaff.name) || 'Laboratory Staff (Technician)',
        date: new Date().toISOString()
      });
    });

    if (!results.length) {
      notify('⚠️ Please enter at least one test measurement before saving.', 'warning');
      return;
    }

    var allOrders = getAllRawOrders();
    var allPatients = getPatientList();

    // Identify the EXACT active order being completed!
    var activeOrder = null;
    if (activeTargetOrderId) {
      activeOrder = allOrders.find(function(o){ return String(o.id) === String(activeTargetOrderId); });
    }
    if (!activeOrder && activeLabResultsPatientId && activeLabResultsPatientId !== 'all') {
      activeOrder = allOrders.find(function(o){
        var ptId = String(o.patientId || '').replace(/^MOD-/i, '');
        var targetId = String(activeLabResultsPatientId).replace(/^MOD-/i, '');
        return ptId === targetId && (o.dept === 'lab' || o.type === 'lab') && String(o.status || '').toLowerCase() === 'pending';
      });
      if (!activeOrder) {
        activeOrder = allOrders.find(function(o){
          var ptId = String(o.patientId || '').replace(/^MOD-/i, '');
          var targetId = String(activeLabResultsPatientId).replace(/^MOD-/i, '');
          return ptId === targetId && (o.dept === 'lab' || o.type === 'lab');
        });
      }
    }
    if (!activeOrder) {
      activeOrder = allOrders.find(function(o){
        return (o.dept === 'lab' || o.type === 'lab') && String(o.status || '').toLowerCase() === 'pending';
      });
    }
    if (!activeOrder && allOrders.length) {
      activeOrder = allOrders[0];
    }

    if (!activeOrder) {
      notify('❌ No laboratory request found to save results to.', 'error');
      return;
    }

    var nowIso = new Date().toISOString();
    var staffName = (window.currentStaff && window.currentStaff.name) || 'Laboratory Staff (Technician)';
    var staffId = (window.currentStaff && window.currentStaff.staffId) || 'LAB-STAFF-01';

    activeOrder.status = 'completed';
    activeOrder.labState = 'final';
    activeOrder.completedAt = nowIso;
    activeOrder.completedBy = staffName;
    activeOrder.completedById = staffId;
    activeOrder.results = results;
    activeOrder.result = 'Verified: ' + results.map(function(r){ return r.test + ': ' + r.value; }).join(', ');

    if (Array.isArray(activeOrder.items)) {
      activeOrder.items.forEach(function(item) {
        var match = results.find(function(r){ return r.code === item.code || r.test.toLowerCase() === String(item.name || '').toLowerCase(); });
        if (match) {
          item.result = match.value;
          item.flag = match.flag;
        }
      });
    }

    var targetPt = allPatients.find(function(p){
      return String(p.id).replace(/^MOD-/i, '') === String(activeOrder.patientId).replace(/^MOD-/i, '');
    });
    if (targetPt) {
      targetPt.labResults = targetPt.labResults || [];
      results.forEach(function(r) {
        targetPt.labResults.push(Object.assign({}, r, {
          orderId: activeOrder.id,
          date: nowIso,
          verifiedBy: staffName
        }));
      });
      if (Array.isArray(targetPt.labRequests)) {
        var req = targetPt.labRequests.find(function(lr){ return String(lr.id) === String(activeOrder.id) || lr.orderId === activeOrder.id; });
        if (req) {
          req.status = 'completed';
          req.results = results;
        }
      }
    }

    saveAllRawOrders(allOrders);
    try { localStorage.setItem('pclinic_patients', JSON.stringify(allPatients)); } catch(e){}

    if (window.pcOrders && typeof window.pcOrders.update === 'function') {
      try {
        window.pcOrders.update(activeOrder.id, {
          status: 'completed',
          labState: 'final',
          results: results,
          result: activeOrder.result,
          completedAt: nowIso,
          completedBy: staffName
        }, true);
      } catch(e){}
    }

    if (window.firebaseDB && window.firebaseFunctions) {
      try {
        var f = window.firebaseFunctions;
        f.setDoc(f.doc(window.firebaseDB, 'orders', String(activeOrder.id)), activeOrder, { merge: true })
          .catch(function(err){ console.warn('Firestore orders sync:', err); });
        if (targetPt) {
          f.setDoc(f.doc(window.firebaseDB, 'patients', String(targetPt.id)), targetPt, { merge: true })
            .catch(function(err){ console.warn('Firestore patients sync:', err); });
        }
        var msgId = ('lab-res-' + activeOrder.id + '-' + Date.now()).replace(/\//g, '_');
        var docName = targetPt ? ((targetPt.firstName || '') + ' ' + (targetPt.lastName || '')).trim() : (activeOrder.patientName || 'Patient');
        f.setDoc(f.doc(window.firebaseDB, 'messages', msgId), {
          id: msgId,
          text: '✅ Lab results completed for ' + docName + ' — ' + results.map(function(r){ return r.test + ': ' + r.value; }).join(', '),
          toRoles: ['doctor'],
          toStaffId: activeOrder.orderedById || null,
          category: 'result',
          priority: results.some(function(r){ return r.flag === 'High' || r.flag === 'Critical'; }) ? 'urgent' : 'normal',
          patientId: String(activeOrder.patientId),
          patientName: docName,
          createdAt: nowIso,
          readBy: []
        }).catch(function(err){ console.warn('Firestore messages sync:', err); });
      } catch(e){}
    }

    matrixDraftValues = {};

    try {
      window.dispatchEvent(new CustomEvent('ordersUpdated', { detail: { order: activeOrder, serverConfirmed: true } }));
      window.dispatchEvent(new CustomEvent('labResultsUpdated', { detail: { orderId: activeOrder.id, patientId: activeOrder.patientId } }));
      window.dispatchEvent(new CustomEvent('patientsUpdated'));
      localStorage.setItem('pclinic_last_lab_broadcast', Date.now().toString());
    } catch(e){}

    notify('✅ Laboratory results successfully saved and sent to Doctor Dashboard!', 'success');

    if (typeof renderPatientTable === 'function') {
      renderPatientTable();
    }
    if (typeof labRefreshOverviewQueue === 'function') {
      labRefreshOverviewQueue();
    }
    if (window.pcLabEngine && typeof window.pcLabEngine.repaint === 'function') {
      try { window.pcLabEngine.repaint(); } catch(e){}
    }

    activeTargetOrderId = null;
    switchLabResultsMode('results');
  }

  function renderLabResultsModule() {
    populateLabResultsPatientSelect();
    switchLabResultsMode(activeLabResultsMode);
    if (byId('ocMatrixTableOverview')) {
      renderMatrixFlowSheet('ocMatrixTableOverview', 'results');
    }
  }

  function renderRequestedLabsTable() {
    renderMatrixFlowSheet('ocMatrixTableResults', 'results');
  }

  function renderVerifiedLabResultsTable() {
    renderMatrixFlowSheet('ocMatrixTableResults', 'results');
  }

  function renderResultEntryTable(targetOrderId) {
    renderMatrixFlowSheet('ocMatrixTableEntry', 'entry', targetOrderId);
  }

  window.switchLabResultsMode = switchLabResultsMode;
  window.onLabResultsPatientChange = onLabResultsPatientChange;
  window.setEntryCatalogMode = setEntryCatalogMode;
  window.renderLabResultsModule = renderLabResultsModule;
  window.renderMatrixFlowSheet = renderMatrixFlowSheet;
  window.openResultEntryForOrder = openResultEntryForOrder;
  window.fillMatrixQuick = fillMatrixQuick;
  window.autoFillRoutineNormals = autoFillRoutineNormals;
  window.saveAndSendLabResultsToDoctor = saveAndSendLabResultsToDoctor;
  window.renderRequestedLabsTable = renderRequestedLabsTable;
  window.renderVerifiedLabResultsTable = renderVerifiedLabResultsTable;
  window.renderResultEntryTable = renderResultEntryTable;
  window.onMatrixInputChange = onMatrixInputChange;
  window.focusTestInput = focusTestInput;
  window.isUserEditingMatrix = isUserEditingMatrix;
  window.matrixDraftValues = matrixDraftValues;


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

    function triggerAutoPull() {
      pullLabRequestsFromCommonServer(false);
      setupCommonServerLabRealtimeSync();
    }

    // Auto pull requested labs from Common Server
    if (window.firebaseReady || window.firebaseDB) {
      triggerAutoPull();
    }
    window.addEventListener('firebaseReady', triggerAutoPull);
    window.addEventListener('pclinicStaffReady', triggerAutoPull);

    // Multi-stage auto-pull on load and safe 20-second background sync
    setTimeout(triggerAutoPull, 200);
    setTimeout(triggerAutoPull, 1200);
    setInterval(function() {
      if (!isUserEditingMatrix()) {
        pullLabRequestsFromCommonServer(false);
      }
    }, 20000);

    window.addEventListener('ordersUpdated', function() {
      if (!isUserEditingMatrix()) {
        renderRequestedLabsTable();
        renderVerifiedLabResultsTable();
        if (activeLabResultsMode === 'entry') renderResultEntryTable(activeTargetOrderId);
      }
    });

    window.addEventListener('patientsUpdated', function() {
      if (!isUserEditingMatrix()) {
        pullLabRequestsFromCommonServer(false);
      }
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
    pullLabRequestsFromCommonServer(false);
    refreshLabQueue();
    if (typeof window.loadPatients === 'function') window.loadPatients();
    notify('🔄 Laboratory queue refreshed', 'info');
  };
})();
