(function () {
  'use strict';

  var PATIENT_FIELD_IDS = ['triagePatient', 'vitalsPatient', 'cpnPatient', 'fpPatient', 'billPatient', 'labPatient', 'notesPatient', 'medsPatient'];
  var STAFF_FIELD_IDS = ['triageNurse', 'cpnNurse', 'fpNurse', 'billNurse', 'notesNurse', 'medsNurse', 'delBy'];
  var LOCATION_FIELD_IDS = ['cpnLocation', 'notesWard', 'billWard'];

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nowIso() { return new Date().toISOString(); }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function nowLocalValue() { return new Date().toISOString().slice(0, 16); }

  function ms(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v.seconds) return v.seconds * 1000;
    var t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  }

  function isSameDay(a, b) {
    if (!a || !b) return false;
    var da = new Date(ms(a));
    var db = new Date(ms(b));
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }

  function latestEntry(list) {
    list = Array.isArray(list) ? list.slice() : [];
    if (!list.length) return null;
    return list.sort(function (a, b) {
      return ms(b && (b.timestamp || b.dateTime || b.date || b.at || b.completedAt || b.updatedAt)) - ms(a && (a.timestamp || a.dateTime || a.date || a.at || a.completedAt || a.updatedAt));
    })[0] || null;
  }

  function getStaff() { return window.currentStaff || null; }
  function currentStaffName() {
    var s = getStaff();
    return (s && (s.name || s.displayName || s.staffId)) || 'Nurse';
  }
  function currentStaffRole() {
    var s = getStaff();
    return (s && (s.department || s.dept || s.unit || s.role)) || 'Nursing';
  }
  function currentStaffInitials() {
    var name = currentStaffName().trim().split(/\s+/).filter(Boolean);
    return (name[0] ? name[0][0] : 'N') + (name[1] ? name[1][0] : '');
  }

  function getAllPatients() {
    try { return typeof window.getPatients === 'function' ? (window.getPatients() || []) : []; }
    catch (e) { return []; }
  }
  function getPatient(id) {
    try {
      if (typeof window.getPatient === 'function') {
        var hit = window.getPatient(id);
        if (hit) return hit;
      }
    } catch (e) {}
    var sid = String(id);
    return getAllPatients().find(function (p) {
      return String(p && p.id) === sid || String(p && p.mrn) === sid;
    }) || null;
  }
  function getCurrentPatient() { return window.currentPatient || null; }
  function setCurrentPatient(p) { window.currentPatient = p || null; }

  function displayName(p) {
    if (!p) return '';
    return String(p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient ' + (p.mrn || p.id || ''))).trim();
  }
  function displayMrn(p) { return String((p && (p.mrn || p.id)) || 'N/A'); }
  function displayLocation(p) { return String((p && (p.location || p.department || p.ward || 'General')) || 'General'); }
  function displayStatus(p) { return String((p && (p.queueStatus || p.status || 'active')) || 'active'); }
  function normalize(s) { return String(s || '').trim().toLowerCase(); }

  function triageInfo(level) {
    level = Number(level || 0);
    if (level === 1) return { label: 'Red · Immediate', cls: 'b-critical' };
    if (level === 2) return { label: 'Orange · Very urgent', cls: 'b-warn' };
    if (level === 3) return { label: 'Yellow · Urgent', cls: 'b-orange' };
    if (level === 4) return { label: 'Green · Routine', cls: 'b-stable' };
    if (level === 5) return { label: 'Blue · Non-urgent', cls: 'b-info' };
    return { label: 'Not triaged', cls: 'b-info' };
  }

  function lastTriage(p) { return latestEntry(p && p.triage); }
  function lastVitals(p) { return latestEntry(p && p.vitals); }
  function lastCpn(p) { return latestEntry(p && p.cpnHistory); }
  function lastNursingNote(p) { return latestEntry(p && p.nursingNotes); }
  function lastTouch(p) {
    var items = [lastTriage(p), lastVitals(p), lastCpn(p), lastNursingNote(p), latestEntry(p && p.medicationLog)];
    return latestEntry(items.filter(Boolean));
  }

  function isInactiveStatus(status) {
    status = normalize(status);
    return ['inactive', 'archived', 'deleted', 'deceased', 'discharged', 'cancelled'].indexOf(status) !== -1;
  }
  function isQueuePatient(p) {
    if (!p) return false;
    var status = displayStatus(p);
    return !isInactiveStatus(status);
  }
  function hasSeenToday(p) {
    var status = normalize(displayStatus(p));
    if (['seen', 'in-progress', 'completed', 'triaged'].indexOf(status) !== -1) return true;
    var lt = lastTouch(p);
    return !!(lt && isSameDay(lt.timestamp || lt.dateTime || lt.date || lt.at, Date.now()));
  }
  function isUrgentPatient(p) {
    var priority = normalize(p && p.priority);
    if (['critical', 'urgent', 'emergency', 'red', 'orange'].indexOf(priority) !== -1) return true;
    var triage = lastTriage(p);
    if (triage && Number(triage.level || 0) > 0 && Number(triage.level) <= 2) return true;
    var cpn = lastCpn(p);
    if (cpn && ['critical', 'warning'].indexOf(normalize(cpn.status)) !== -1) return true;
    var note = lastNursingNote(p);
    if (note && ['deteriorated', 'critical', 'warning'].indexOf(normalize(note.status)) !== -1) return true;
    var vit = lastVitals(p);
    if (vit) {
      if ((vit.spo2 != null && Number(vit.spo2) < 92) || (vit.pulse != null && Number(vit.pulse) > 130) || (vit.temperature != null && Number(vit.temperature) >= 39.5)) return true;
    }
    return false;
  }
  function cpnDue(p) {
    if (!isQueuePatient(p)) return false;
    var cpn = lastCpn(p);
    if (!cpn) return true;
    return !isSameDay(cpn.timestamp || cpn.dateTime || cpn.date || cpn.at, Date.now());
  }
  function queuePatients(all) {
    return (all || []).filter(isQueuePatient).sort(function (a, b) {
      return ms((b && (b.queueAdded || b.locationSince || b.updatedAt || b.registered))) - ms((a && (a.queueAdded || a.locationSince || a.updatedAt || a.registered)));
    });
  }
  function waitingPatients(all) {
    return queuePatients(all).filter(function (p) {
      var status = normalize(displayStatus(p));
      if (['waiting', 'queued', 'queue', 'pending', 'registered'].indexOf(status) !== -1) return true;
      return !hasSeenToday(p);
    });
  }
  function urgentPatients(all) { return queuePatients(all).filter(isUrgentPatient); }
  function seenPatients(all) { return queuePatients(all).filter(hasSeenToday); }
  function cpnDuePatients(all) { return queuePatients(all).filter(cpnDue); }
  function nursingMetrics(all) {
    return {
      queue: queuePatients(all),
      waiting: waitingPatients(all),
      urgent: urgentPatients(all),
      seen: seenPatients(all),
      cpnDue: cpnDuePatients(all)
    };
  }

  function patientMatchesQuery(p, query) {
    var q = normalize(query);
    if (!q) return true;
    var hay = [displayName(p), p && p.firstName, p && p.lastName, p && p.mrn, p && p.id, p && p.nationalId, p && p.personId, p && p.phone]
      .map(function (v) { return normalize(v); })
      .join(' ');
    return hay.indexOf(q) !== -1;
  }

  function focusPatientSearch() {
    var input = document.getElementById('searchInput');
    if (!input) return;
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    input.focus();
    input.select();
  }

  function applyStaffUi() {
    var h = new Date().getHours();
    var part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    var greet = document.getElementById('overviewGreeting');
    var ctx = document.getElementById('overviewContext');
    var uname = document.querySelector('.uname');
    var ua = document.querySelector('.ua');
    if (greet) greet.textContent = part + ', ' + currentStaffName();
    if (ctx) ctx.innerHTML = '<span id="todayDate">' + esc(new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })) + '</span> · ' + esc(currentStaffRole());
    if (uname) uname.textContent = currentStaffName();
    if (ua) ua.textContent = currentStaffInitials().toUpperCase();
    STAFF_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = currentStaffName();
    });
  }

  function installSelectedPatientFields() {
    PATIENT_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.readOnly = true;
      el.setAttribute('data-patient-sync', '1');
      el.title = 'Select a patient from the top search bar or the Patients tab';
      if (!el.dataset.nurseBound) {
        el.dataset.nurseBound = '1';
        el.addEventListener('focus', function () { focusPatientSearch(); });
        el.addEventListener('click', function () { focusPatientSearch(); });
      }
    });
  }

  function setPatientFieldValues(patient) {
    installSelectedPatientFields();
    var text = patient ? (displayName(patient) + ' — ' + displayMrn(patient)) : '';
    PATIENT_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.value = text;
      el.placeholder = patient ? 'Selected patient' : 'Select a patient from the search or Patients tab';
    });
    LOCATION_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id === 'billWard') {
        if (patient) el.value = displayLocation(patient);
      } else {
        el.value = patient ? (displayLocation(patient) + (patient.bed ? ' - Bed ' + patient.bed : '')) : '';
      }
    });
  }

  function refreshCurrentPatientFromStore() {
    var p = getCurrentPatient();
    if (!p || p.id == null) return null;
    var fresh = getPatient(p.id) || p;
    setCurrentPatient(fresh);
    return fresh;
  }

  function refreshPatientUi(patient, quiet) {
    patient = patient || refreshCurrentPatientFromStore();
    setPatientFieldValues(patient || null);
    applyStaffUi();
    if (!patient) {
      if (typeof window.renderLabResults === 'function') window.renderLabResults();
      if (typeof window.renderVitalsGraph === 'function') window.renderVitalsGraph();
      if (typeof window.updateNursingChips === 'function') window.updateNursingChips();
      return;
    }
    if (typeof window.displayPatientCard === 'function') window.displayPatientCard(patient);
    if (typeof window.fillForms === 'function') window.fillForms(patient);
    if (typeof window.renderCarePlanHistory === 'function') window.renderCarePlanHistory();
    if (typeof window.renderDeliveriesHistory === 'function') window.renderDeliveriesHistory();
    if (typeof window.renderVitalsGraph === 'function') window.renderVitalsGraph();
    if (typeof window.renderLabResults === 'function') window.renderLabResults(patient);
    if (typeof window.updateNursingChips === 'function') window.updateNursingChips();
    if (!quiet) safeToast('👤 Loaded patient: ' + displayName(patient), 'success');
  }

  function safeToast(message, type, duration) {
    var delegated = window.sharedShowToast || (window.showToast && window.showToast !== safeToast ? window.showToast : null) || window.pcToast || null;
    if (delegated) return delegated(String(message == null ? '' : message), type || 'info', duration || 3500);
    var container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.textContent = String(message == null ? '' : message);
    container.appendChild(toast);
    setTimeout(function () { toast.classList.add('show'); }, 10);
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 400);
    }, duration || 3500);
    return toast;
  }

  function updateClock() {
    var liveClock = document.getElementById('liveClock');
    if (liveClock) {
      var now = new Date();
      liveClock.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }
    var todayDate = document.getElementById('todayDate');
    if (todayDate) {
      todayDate.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
  }

  function renderPatientTable(patients) {
    var tbody = document.getElementById('patientTableBody');
    var count = document.getElementById('patientCount');
    if (!tbody) return [];
    var filter = normalize((document.getElementById('patientFilter') || {}).value || '');
    var statusFilter = ((document.getElementById('statusFilter') || {}).value || 'all');
    var data = Array.isArray(patients) ? patients.slice() : getAllPatients().slice();
    if (filter) data = data.filter(function (p) { return patientMatchesQuery(p, filter); });
    if (statusFilter === 'active') data = data.filter(isQueuePatient);
    if (statusFilter === 'inactive') data = data.filter(function (p) { return !isQueuePatient(p); });
    data.sort(function (a, b) { return displayName(a).localeCompare(displayName(b)); });
    if (count) count.textContent = data.length;
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--tm);">No patients found.</td></tr>';
      return data;
    }
    tbody.innerHTML = data.map(function (p) {
      var name = esc(displayName(p));
      var age = esc(window.getAge ? window.getAge(p.dob) : 'N/A');
      var statusText = esc(displayStatus(p));
      var statusClass = isQueuePatient(p) ? 'b-stable' : 'b-warn';
      var sid = String(p.id).replace(/'/g, "\\'");
      return '<tr onclick="selectPatient(\'' + sid + '\')" style="cursor:pointer;">' +
        '<td><strong>' + name + '</strong></td>' +
        '<td><span class="badge b-info">' + esc(displayMrn(p)) + '</span></td>' +
        '<td>' + esc(p.dob || 'N/A') + ' (' + age + ')</td>' +
        '<td>' + esc(p.gender || 'N/A') + '</td>' +
        '<td>' + esc(p.phone || 'N/A') + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + statusText + '</span></td>' +
        '<td>' +
          '<button class="btn-s" style="padding:2px 10px;font-size:10px;" onclick="event.stopPropagation();selectPatient(\'' + sid + '\')"><i class="ti ti-eye"></i> View</button>' +
          '<button class="btn-s" style="padding:2px 10px;font-size:10px;background:var(--acb);color:var(--ac);" onclick="event.stopPropagation();openVitalsForPatient(\'' + sid + '\')"><i class="ti ti-heartbeat"></i> Vitals</button>' +
        '</td></tr>';
    }).join('');
    return data;
  }

  function refreshKpisAndQueue(patients) {
    var metrics = nursingMetrics(Array.isArray(patients) ? patients : getAllPatients());
    var ids = {
      queue: document.getElementById('kpiQueue'),
      waiting: document.getElementById('kpiWaiting'),
      urgent: document.getElementById('kpiUrgent'),
      seen: document.getElementById('kpiSeen'),
      cpnDue: document.getElementById('kpiCpnDue')
    };
    if (ids.queue) ids.queue.textContent = metrics.queue.length;
    if (ids.waiting) ids.waiting.textContent = metrics.waiting.length;
    if (ids.urgent) ids.urgent.textContent = metrics.urgent.length;
    if (ids.seen) ids.seen.textContent = metrics.seen.length;
    if (ids.cpnDue) ids.cpnDue.textContent = metrics.cpnDue.length;
    updateQueue(metrics.queue);
    return metrics;
  }

  function updateQueue(queueList) {
    var tbody = document.getElementById('queueTableBody');
    if (!tbody) return;
    var list = Array.isArray(queueList) ? queueList : nursingMetrics(getAllPatients()).queue;
    list = list.slice(0, 12);
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tm);">No patients in queue</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (p, i) {
      var triage = lastTriage(p);
      var tri = triageInfo(triage && triage.level);
      var purpose = (triage && triage.chiefComplaint) || p.visitReason || p.reason || p.department || 'General care';
      var status = normalize(displayStatus(p));
      var statusLabel = status ? status.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : (hasSeenToday(p) ? 'Seen today' : 'Waiting');
      var statusClass = isUrgentPatient(p) ? 'b-critical' : hasSeenToday(p) ? 'b-info' : 'b-teal';
      var timeBase = p.queueAdded || p.locationSince || (triage && (triage.timestamp || triage.date || triage.at)) || p.updatedAt || p.registered || (Date.now() - (i * 60000));
      return '<tr onclick="selectPatient(\'' + String(p.id).replace(/'/g, "\\'") + '\')" style="cursor:pointer;">' +
        '<td><strong>' + esc(displayName(p)) + '</strong></td>' +
        '<td>' + esc(displayMrn(p)) + '</td>' +
        '<td>' + esc(new Date(ms(timeBase) || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</td>' +
        '<td>' + esc(purpose) + '</td>' +
        '<td><span class="badge ' + tri.cls + '">' + esc(tri.label) + '</span></td>' +
        '<td><span class="badge ' + statusClass + '">' + esc(statusLabel) + '</span></td>' +
      '</tr>';
    }).join('');
  }

  function loadPatients() {
    var all = getAllPatients();
    renderPatientTable(all);
    refreshKpisAndQueue(all);
    if (getCurrentPatient()) refreshPatientUi(refreshCurrentPatientFromStore(), true);
    return all;
  }

  function handleSmartSearch(query) {
    var q = normalize(query);
    var container = document.getElementById('suggestions');
    if (!container) return [];
    if (!q) { container.classList.remove('show'); container.innerHTML = ''; return []; }
    var matches = getAllPatients().filter(function (p) { return patientMatchesQuery(p, q); }).slice(0, 8);
    if (!matches.length) { container.classList.remove('show'); container.innerHTML = ''; return []; }
    container.innerHTML = matches.map(function (p) {
      var sid = String(p.id).replace(/'/g, "\\'");
      return '<div class="suggestion-item" onclick="selectPatient(\'' + sid + '\')">' +
        '<span>👤</span>' +
        '<span><span class="highlight">' + esc(displayName(p)) + '</span> — ' + esc(displayMrn(p)) + ' · ID ' + esc(p.id) + '</span>' +
      '</div>';
    }).join('');
    container.classList.add('show');
    return matches;
  }

  function lookupPatient() {
    var input = document.getElementById('searchInput');
    var q = normalize(input && input.value);
    if (!q) return;
    var p = getAllPatients().find(function (pt) { return patientMatchesQuery(pt, q); }) || null;
    if (!p) return safeToast('❌ Patient not found', 'error');
    selectPatient(p.id);
  }

  function fillForms(patient) {
    patient = patient || getCurrentPatient();
    applyStaffUi();
    setPatientFieldValues(patient || null);
    var dt = nowLocalValue();
    var d = todayIso();
    ['triageDateTime', 'vitalsDateTime', 'cpnDateTime', 'notesDateTime', 'delDateTime'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = dt;
    });
    ['fpDate', 'billDate', 'medsDate', 'fpReturn', 'fpLmp', 'cpEvalDate'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = d;
    });
    var labDate = document.getElementById('labDate');
    if (labDate && !labDate.dataset.nursePreserve) labDate.value = '';
  }

  function selectPatient(id) {
    var p = getPatient(id);
    if (!p) return safeToast('❌ Patient not found', 'error');
    setCurrentPatient(p);
    refreshPatientUi(p, false);
    var suggestions = document.getElementById('suggestions');
    if (suggestions) suggestions.classList.remove('show');
    var searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = displayName(p) + ' — ' + displayMrn(p);
    if (typeof window.switchTab === 'function') window.switchTab('overview', document.querySelector('[data-tab="overview"]'));
    return p;
  }

  function buildBillRowHtml(desc, category, qty, unit) {
    return '<tr>' +
      '<td><input class="fi" type="text" data-bill="desc" placeholder="Item name…" value="' + esc(desc || '') + '" style="width:100%;"/></td>' +
      '<td><select class="fi" data-bill="category" style="font-size:11px;width:100%;">' +
        '<option' + ((category || 'Medication') === 'Medication' ? ' selected' : '') + '>Medication</option>' +
        '<option' + (category === 'Consumable' ? ' selected' : '') + '>Consumable</option>' +
        '<option' + (category === 'Procedure' ? ' selected' : '') + '>Procedure</option>' +
      '</select></td>' +
      '<td><input class="fi" type="number" data-bill="qty" min="1" value="' + (qty == null ? 1 : qty) + '" style="width:60px;" oninput="calcBill()"/></td>' +
      '<td><input class="fi" type="number" data-bill="unit" min="0" value="' + (unit == null ? 0 : unit) + '" style="width:80px;" oninput="calcBill()"/></td>' +
      '<td class="row-total" style="font-weight:600;text-align:center;">0</td>' +
      '<td style="text-align:center;"><button onclick="this.closest(\'tr\').remove(); if(!document.querySelector(\'#billRows tr\')) addBillRow(); calcBill();" style="border:none;background:none;cursor:pointer;color:var(--red);font-size:16px;padding:4px 8px;"><i class="ti ti-trash"></i></button></td>' +
    '</tr>';
  }
  function ensureBillRows() {
    var tb = document.getElementById('billRows');
    if (!tb) return;
    if (!tb.querySelector('tr')) tb.innerHTML = buildBillRowHtml('', 'Medication', 1, 0);
    calcBill();
  }
  function addBillRow() {
    var tb = document.getElementById('billRows');
    if (!tb) return;
    tb.insertAdjacentHTML('beforeend', buildBillRowHtml('', 'Medication', 1, 0));
    calcBill();
  }
  function calcBill() {
    var rows = document.querySelectorAll('#billRows tr');
    var sub = 0;
    rows.forEach(function (r) {
      var qty = parseFloat((r.querySelector('[data-bill="qty"]') || {}).value) || 0;
      var unit = parseFloat((r.querySelector('[data-bill="unit"]') || {}).value) || 0;
      var tot = Math.round(qty * unit);
      var td = r.querySelector('.row-total');
      if (td) td.textContent = String(tot);
      sub += tot;
    });
    var paymentMode = ((document.getElementById('billPayment') || {}).value || 'Cash');
    var coverPercent = typeof window.getCoverPercent === 'function' ? window.getCoverPercent(paymentMode) : 0;
    var coverPercentDisplay = Math.round(coverPercent * 100);
    var insuranceCover = Math.round(sub * coverPercent);
    var patientPays = sub - insuranceCover;
    var coverField = document.getElementById('billCoverPercent');
    if (coverField) coverField.value = coverPercentDisplay + '%';
    var subEl = document.getElementById('billSub'); if (subEl) subEl.textContent = 'RWF ' + sub.toLocaleString();
    var insEl = document.getElementById('billInsurance'); if (insEl) insEl.textContent = '-RWF ' + insuranceCover.toLocaleString();
    var totalEl = document.getElementById('billTotal'); if (totalEl) totalEl.textContent = 'RWF ' + patientPays.toLocaleString();
  }
  function clearBill() {
    var tb = document.getElementById('billRows');
    if (!tb) return;
    tb.innerHTML = '';
    ensureBillRows();
    var ward = document.getElementById('billWard');
    if (ward) ward.value = getCurrentPatient() ? displayLocation(getCurrentPatient()) : '';
  }

  function medStatusClass(status) {
    status = String(status || 'Pending');
    return status === 'Given' ? 'b-green' : status === 'Held' ? 'b-red' : 'b-orange';
  }
  function buildMedicationRowHtml(id, item) {
    item = item || {};
    var status = item.status || 'Pending';
    return '<div class="med-log-item" data-med-row="' + id + '">' +
      '<input class="fi" data-med="name" style="flex:1;font-size:11px;padding:4px 8px;min-width:160px;" placeholder="Medication name" value="' + esc(item.medication || item.name || '') + '"/>' +
      '<input class="fi" data-med="dose" style="width:110px;font-size:11px;padding:4px 8px;" placeholder="Dose" value="' + esc(item.dose || '') + '"/>' +
      '<input class="fi" data-med="time" type="time" style="width:100px;font-size:11px;padding:4px 8px;" value="' + esc(item.time || '') + '"/>' +
      '<span class="badge ' + medStatusClass(status) + '" id="medStatus' + id + '">' + esc(status) + '</span>' +
      '<button class="btn-s" style="padding:2px 8px;font-size:10px;" onclick="toggleMedStatus(' + id + ')">Toggle</button>' +
      '<button class="btn-s" style="padding:2px 8px;font-size:10px;background:var(--redb);color:var(--red);" onclick="removeMed(' + id + ')"><i class="ti ti-x"></i></button>' +
    '</div>';
  }
  function ensureMedicationEditorRow() {
    var list = document.getElementById('medLogList');
    if (!list) return;
    if (!list.querySelector('.med-log-item')) addMedicationRow();
  }
  function addMedicationRow(prefill) {
    window.medCounter = Number(window.medCounter || 0) + 1;
    var id = window.medCounter;
    var list = document.getElementById('medLogList');
    if (!list) return;
    list.insertAdjacentHTML('beforeend', buildMedicationRowHtml(id, prefill || {}));
  }
  function removeMed(id) {
    var row = document.querySelector('.med-log-item[data-med-row="' + String(id) + '"]');
    if (row) row.remove();
    ensureMedicationEditorRow();
  }
  function toggleMedStatus(id) {
    var statusEl = document.getElementById('medStatus' + id);
    if (!statusEl) return;
    var next = statusEl.textContent === 'Given' ? 'Pending' : statusEl.textContent === 'Pending' ? 'Held' : 'Given';
    statusEl.textContent = next;
    statusEl.className = 'badge ' + medStatusClass(next);
  }

  function refreshAfterSave(savedPatient, clearFn) {
    if (!savedPatient) return false;
    setCurrentPatient(savedPatient);
    refreshPatientUi(savedPatient, true);
    loadPatients();
    if (typeof clearFn === 'function') clearFn();
    return true;
  }

  async function appendPatientHistory(fieldName, entry) {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) {
      safeToast('⚠️ Please select a patient first', 'warning');
      return null;
    }
    if (typeof window.updatePatient !== 'function') {
      safeToast('❌ Secure patient saving is not available on this page.', 'error');
      return null;
    }
    var next = Array.isArray(patient[fieldName]) ? patient[fieldName].slice() : [];
    next.push(entry);
    return await window.updatePatient(patient.id, (function () { var out = {}; out[fieldName] = next; return out; })());
  }

  async function replacePatientHistory(fieldName, nextArray) {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) {
      safeToast('⚠️ Please select a patient first', 'warning');
      return null;
    }
    if (typeof window.updatePatient !== 'function') {
      safeToast('❌ Secure patient saving is not available on this page.', 'error');
      return null;
    }
    var patch = {};
    patch[fieldName] = Array.isArray(nextArray) ? nextArray : [];
    return await window.updatePatient(patient.id, patch);
  }

  async function saveTriage() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var complaint = (document.getElementById('triageComplaint') || {}).value || '';
    complaint = complaint.trim();
    if (!complaint) return safeToast('⚠️ Please enter chief complaint', 'warning');
    var entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      date: nowIso(),
      at: nowIso(),
      timestamp: nowIso(),
      level: Number(window.triageLevel || 4),
      chiefComplaint: complaint,
      trauma: ((document.getElementById('triageTrauma') || {}).value || '').trim(),
      airway: ((document.getElementById('triageAirway') || {}).value || 'Patent'),
      breathing: ((document.getElementById('triageBreathing') || {}).value || 'Normal'),
      circulation: ((document.getElementById('triageCirculation') || {}).value || 'Normal'),
      gcs: ((document.getElementById('triageGCS') || {}).value || '15'),
      painScore: parseInt((document.getElementById('triagePain') || {}).value, 10) || 0,
      disposition: ((document.getElementById('triageDisposition') || {}).value || 'OPD queue'),
      allocatedTo: ((document.getElementById('triageAllocated') || {}).value || 'Doctor on call'),
      triagedBy: ((document.getElementById('triageNurse') || {}).value || currentStaffName()),
      triagedById: getStaff() ? getStaff().staffId : '',
      notes: ((document.getElementById('triageNotes') || {}).value || '').trim()
    };
    safeToast('⏳ Saving triage to the Common Server…', 'info');
    var saved = await appendPatientHistory('triage', entry);
    if (!saved) return safeToast('❌ Triage was NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, clearTriage);
    safeToast('✅ Triage saved for ' + displayName(saved), 'success');
  }
  function clearTriage() {
    ['triageComplaint', 'triageGCS', 'triageTrauma', 'triagePain', 'triageAllocated', 'triageNotes'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    document.querySelectorAll('.tl').forEach(function (t) { t.classList.remove('sel'); });
    var d = document.querySelector('.tl4'); if (d) d.classList.add('sel');
    window.triageLevel = 4;
    fillForms(getCurrentPatient());
  }
  function selectTriage(el, level) {
    document.querySelectorAll('.tl').forEach(function (t) { t.classList.remove('sel'); });
    if (el) el.classList.add('sel');
    window.triageLevel = Number(level || 4);
  }

  async function saveVitals() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var sys = parseInt((document.getElementById('vitalsBPSys') || {}).value, 10) || null;
    var dia = parseInt((document.getElementById('vitalsBPDia') || {}).value, 10) || null;
    var entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      date: nowIso(),
      at: nowIso(),
      timestamp: nowIso(),
      temperature: parseFloat((document.getElementById('vitalsTemp') || {}).value) || null,
      temp: parseFloat((document.getElementById('vitalsTemp') || {}).value) || null,
      pulse: parseInt((document.getElementById('vitalsPulse') || {}).value, 10) || null,
      respiratoryRate: parseInt((document.getElementById('vitalsResp') || {}).value, 10) || null,
      rr: parseInt((document.getElementById('vitalsResp') || {}).value, 10) || null,
      spo2: parseInt((document.getElementById('vitalsSpO2') || {}).value, 10) || null,
      bpSystolic: sys,
      bpDiastolic: dia,
      bp: (sys && dia) ? (sys + '/' + dia) : '',
      weight: parseFloat((document.getElementById('vitalsWeight') || {}).value) || null,
      height: parseFloat((document.getElementById('vitalsHeight') || {}).value) || null,
      bloodGlucose: parseFloat((document.getElementById('vitalsGlucose') || {}).value) || null,
      muac: parseFloat((document.getElementById('vitalsMUAC') || {}).value) || null,
      painScore: parseInt((document.getElementById('vitalsPain') || {}).value, 10) || 0,
      avpu: ((document.getElementById('vitalsAVPU') || {}).value || 'Alert'),
      recordedBy: currentStaffName(),
      recordedById: getStaff() ? getStaff().staffId : ''
    };
    var hasData = ['temperature', 'pulse', 'respiratoryRate', 'spo2', 'bpSystolic', 'bpDiastolic', 'weight', 'height', 'bloodGlucose', 'muac'].some(function (k) { return entry[k] != null; });
    if (!hasData) return safeToast('⚠️ Enter at least one vital sign before saving.', 'warning');
    safeToast('⏳ Saving vital signs to the Common Server…', 'info');
    var saved = await appendPatientHistory('vitals', entry);
    if (!saved) return safeToast('❌ Vital signs were NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, clearVitals);
    safeToast('✅ Vitals saved for ' + displayName(saved), 'success');
  }
  function clearVitals() {
    ['vitalsTemp', 'vitalsPulse', 'vitalsResp', 'vitalsSpO2', 'vitalsBPSys', 'vitalsBPDia', 'vitalsWeight', 'vitalsHeight', 'vitalsGlucose', 'vitalsMUAC', 'vitalsPain'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    var avpu = document.getElementById('vitalsAVPU'); if (avpu) avpu.value = 'Alert';
    fillForms(getCurrentPatient());
  }
  function openVitalsForPatient(id) {
    selectPatient(id);
    if (typeof window.switchTab === 'function') window.switchTab('vitals', document.querySelector('[data-tab="vitals"]'));
    if (typeof window.switchSub === 'function') window.switchSub('vitals-form');
    var temp = document.getElementById('vitalsTemp'); if (temp) temp.focus();
  }

  async function saveCPN() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var subjective = ((document.getElementById('cpnSubjective') || {}).value || '').trim();
    var objective = ((document.getElementById('cpnObjective') || {}).value || '').trim();
    var assessment = ((document.getElementById('cpnAssessment') || {}).value || '').trim();
    var plan = ((document.getElementById('cpnPlan') || {}).value || '').trim();
    if (!subjective || !objective || !assessment || !plan) return safeToast('⚠️ Please fill in all required fields (*)', 'warning');
    var entry = {
      id: Date.now(),
      timestamp: nowIso(),
      subjective: subjective,
      objective: objective,
      assessment: assessment,
      plan: plan,
      nurse: ((document.getElementById('cpnNurse') || {}).value || currentStaffName()),
      location: ((document.getElementById('cpnLocation') || {}).value || displayLocation(patient)),
      status: ((document.getElementById('cpnStatus') || {}).value || 'stable'),
      education: ((document.getElementById('cpnEducation') || {}).value || '').trim(),
      referrals: ((document.getElementById('cpnReferrals') || {}).value || '').trim()
    };
    safeToast('⏳ Saving CPN to the Common Server…', 'info');
    var saved = await appendPatientHistory('cpnHistory', entry);
    if (!saved) return safeToast('❌ CPN was NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, clearCPN);
    safeToast('✅ CPN saved successfully for ' + displayName(saved), 'success');
  }
  function clearCPN() {
    ['cpnSubjective', 'cpnObjective', 'cpnAssessment', 'cpnPlan', 'cpnEducation', 'cpnReferrals'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    var status = document.getElementById('cpnStatus'); if (status) status.value = 'stable';
    fillForms(getCurrentPatient());
  }

  function selectFp(el, method) {
    document.querySelectorAll('.fp-btn').forEach(function (b) { b.classList.remove('sel'); });
    if (el) el.classList.add('sel');
    window.selectedFpMethod = method || '';
  }
  async function saveFP() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var method = window.selectedFpMethod || '';
    if (!method) return safeToast('⚠️ Please select a contraceptive method', 'warning');
    var entry = {
      id: Date.now(),
      timestamp: nowIso(),
      method: method,
      visitType: ((document.getElementById('fpType') || {}).value || ''),
      batch: ((document.getElementById('fpBatch') || {}).value || '').trim(),
      returnDate: ((document.getElementById('fpReturn') || {}).value || ''),
      lmp: ((document.getElementById('fpLmp') || {}).value || ''),
      pregnancyTest: ((document.getElementById('fpPregTest') || {}).value || 'Not done'),
      bp: ((document.getElementById('fpBp') || {}).value || '').trim(),
      weight: ((document.getElementById('fpWeight') || {}).value || ''),
      counselling: ((document.getElementById('fpCounselling') || {}).value || '').trim(),
      contraindications: ((document.getElementById('fpContraindications') || {}).value || '').trim(),
      nurse: ((document.getElementById('fpNurse') || {}).value || currentStaffName()),
      status: 'Active'
    };
    safeToast('⏳ Saving Family Planning visit to the Common Server…', 'info');
    var saved = await appendPatientHistory('fpHistory', entry);
    if (!saved) return safeToast('❌ Family Planning visit was NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, clearFP);
    safeToast('✅ Family Planning saved for ' + displayName(saved), 'success');
  }
  function clearFP() {
    ['fpBatch', 'fpReturn', 'fpLmp', 'fpBp', 'fpWeight', 'fpCounselling', 'fpContraindications'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    var preg = document.getElementById('fpPregTest'); if (preg) preg.value = 'Not done';
    document.querySelectorAll('.fp-btn').forEach(function (b) { b.classList.remove('sel'); });
    window.selectedFpMethod = '';
    fillForms(getCurrentPatient());
  }

  async function saveNursingNote() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var subjective = ((document.getElementById('notesSubjective') || {}).value || '').trim();
    var objective = ((document.getElementById('notesObjective') || {}).value || '').trim();
    var plan = ((document.getElementById('notesPlan') || {}).value || '').trim();
    if (!subjective && !objective && !plan) return safeToast('⚠️ Please fill in at least one section', 'warning');
    var entry = {
      id: Date.now(),
      timestamp: nowIso(),
      subjective: subjective,
      objective: objective,
      plan: plan,
      education: ((document.getElementById('notesEducation') || {}).value || '').trim(),
      status: ((document.getElementById('notesStatus') || {}).value || 'Stable'),
      nurse: ((document.getElementById('notesNurse') || {}).value || currentStaffName()),
      ward: ((document.getElementById('notesWard') || {}).value || displayLocation(patient)),
      reviewDate: ((document.getElementById('notesReview') || {}).value || '')
    };
    safeToast('⏳ Saving nursing note to the Common Server…', 'info');
    var saved = await appendPatientHistory('nursingNotes', entry);
    if (!saved) return safeToast('❌ Nursing note was NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, clearNursingNote);
    safeToast('✅ Nursing note saved for ' + displayName(saved), 'success');
  }
  function clearNursingNote() {
    ['notesSubjective', 'notesObjective', 'notesPlan', 'notesEducation', 'notesReview'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    var status = document.getElementById('notesStatus'); if (status) status.value = 'Stable';
    fillForms(getCurrentPatient());
  }

  function collectBillRows() {
    var rows = document.querySelectorAll('#billRows tr');
    var items = [];
    rows.forEach(function (row) {
      var desc = ((row.querySelector('[data-bill="desc"]') || {}).value || '').trim();
      var category = ((row.querySelector('[data-bill="category"]') || {}).value || 'Medication');
      var qty = parseFloat((row.querySelector('[data-bill="qty"]') || {}).value) || 0;
      var unit = parseFloat((row.querySelector('[data-bill="unit"]') || {}).value) || 0;
      if (desc && qty > 0 && unit >= 0) {
        items.push({ description: desc, category: category, quantity: qty, unitPrice: unit, total: Math.round(qty * unit) });
      }
    });
    return items;
  }
  async function saveBill() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var items = collectBillRows();
    if (!items.length) return safeToast('⚠️ No items to bill. Please add at least one item with quantity and price.', 'warning');
    var totalBill = items.reduce(function (sum, item) { return sum + (item.total || 0); }, 0);
    var paymentMode = ((document.getElementById('billPayment') || {}).value || 'Cash');
    var coverPercent = typeof window.getCoverPercent === 'function' ? window.getCoverPercent(paymentMode) : 0;
    var insuranceCover = Math.round(totalBill * coverPercent);
    var patientPays = totalBill - insuranceCover;
    var entry = {
      id: Date.now(),
      timestamp: nowIso(),
      items: items,
      total: totalBill,
      paymentMode: paymentMode,
      coverPercent: coverPercent,
      insuranceCover: insuranceCover,
      patientPays: patientPays,
      ward: ((document.getElementById('billWard') || {}).value || displayLocation(patient)),
      nurse: ((document.getElementById('billNurse') || {}).value || currentStaffName()),
      date: ((document.getElementById('billDate') || {}).value || todayIso()),
      status: 'Posted'
    };
    safeToast('⏳ Posting bill to the Common Server…', 'info');
    var saved = await appendPatientHistory('billingHistory', entry);
    if (!saved) return safeToast('❌ Bill was NOT posted. Please retry.', 'error');
    refreshAfterSave(saved, clearBill);
    safeToast('✅ Bill posted for ' + displayName(saved) + ' - Total: RWF ' + totalBill.toLocaleString() + ' | Patient pays: RWF ' + patientPays.toLocaleString(), 'success');
  }

  async function saveMedicationLog() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var rows = document.querySelectorAll('#medLogList .med-log-item');
    var meds = [];
    rows.forEach(function (row) {
      var name = ((row.querySelector('[data-med="name"]') || {}).value || '').trim();
      var dose = ((row.querySelector('[data-med="dose"]') || {}).value || '').trim();
      var time = ((row.querySelector('[data-med="time"]') || {}).value || '').trim();
      var status = ((row.querySelector('.badge') || {}).textContent || 'Pending').trim();
      if (name) meds.push({ medication: name, dose: dose + (time ? ' · ' + time : ''), time: time, status: status });
    });
    if (!meds.length) return safeToast('⚠️ No medications to log', 'warning');
    var entry = {
      id: Date.now(),
      timestamp: nowIso(),
      medications: meds,
      nurse: ((document.getElementById('medsNurse') || {}).value || currentStaffName()),
      shift: ((document.getElementById('medsShift') || {}).value || 'Morning'),
      date: ((document.getElementById('medsDate') || {}).value || todayIso()),
      status: 'Completed'
    };
    safeToast('⏳ Saving medication log to the Common Server…', 'info');
    var saved = await appendPatientHistory('medicationLog', entry);
    if (!saved) return safeToast('❌ Medication log was NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, function () {
      var list = document.getElementById('medLogList');
      if (list) list.innerHTML = '';
      ensureMedicationEditorRow();
    });
    safeToast('✅ Medication log saved for ' + displayName(saved), 'success');
  }

  async function saveCarePlan() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var problem = ((document.getElementById('cpProblem') || {}).value || '').trim();
    if (!problem) return safeToast('⚠️ Enter the nursing problem / diagnosis', 'warning');
    var entry = {
      id: 'CP-' + Date.now(),
      problem: problem,
      goals: ((document.getElementById('cpGoals') || {}).value || '').trim(),
      interventions: ((document.getElementById('cpInterventions') || {}).value || '').trim(),
      evalDate: ((document.getElementById('cpEvalDate') || {}).value || ''),
      status: ((document.getElementById('cpStatus') || {}).value || 'Active'),
      by: currentStaffName(),
      at: nowIso()
    };
    safeToast('⏳ Saving care plan to the Common Server…', 'info');
    var saved = await appendPatientHistory('carePlans', entry);
    if (!saved) return safeToast('❌ Care plan was NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, window.clearCarePlan);
    safeToast('🗒️ Care plan saved to the Common Server', 'success');
  }
  async function setCarePlanStatus(i, status) {
    var patient = refreshCurrentPatientFromStore();
    if (!patient || !Array.isArray(patient.carePlans) || !patient.carePlans[i]) return;
    var next = patient.carePlans.slice();
    next[i] = Object.assign({}, next[i], { status: status });
    safeToast('⏳ Updating care plan on the Common Server…', 'info');
    var saved = await replacePatientHistory('carePlans', next);
    if (!saved) return safeToast('❌ Care plan update failed. Please retry.', 'error');
    refreshAfterSave(saved);
    safeToast(status === 'Achieved' ? '✅ Care plan goal achieved' : 'Care plan updated', 'success');
  }
  async function deleteCarePlan(i) {
    var patient = refreshCurrentPatientFromStore();
    if (!patient || !Array.isArray(patient.carePlans) || !patient.carePlans[i]) return;
    if (!window.confirm('Delete this care plan?')) return;
    var next = patient.carePlans.slice(); next.splice(i, 1);
    safeToast('⏳ Removing care plan from the Common Server…', 'info');
    var saved = await replacePatientHistory('carePlans', next);
    if (!saved) return safeToast('❌ Care plan deletion failed. Please retry.', 'error');
    refreshAfterSave(saved);
    safeToast('🗑 Care plan removed from the Common Server', 'info');
  }

  async function saveDelivery() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var date = ((document.getElementById('delDateTime') || {}).value || '');
    var weight = ((document.getElementById('delWeight') || {}).value || '');
    if (!date || !weight) return safeToast('⚠️ Fill delivery date and birth weight', 'warning');
    var entry = {
      id: 'DEL-' + Date.now(),
      dateTime: date,
      type: ((document.getElementById('delType') || {}).value || ''),
      sex: ((document.getElementById('delSex') || {}).value || ''),
      weight: parseFloat(weight) || null,
      apgar: ((document.getElementById('delApgar') || {}).value || '').trim(),
      outcome: ((document.getElementById('delOutcome') || {}).value || ''),
      by: ((document.getElementById('delBy') || {}).value || currentStaffName()),
      notes: ((document.getElementById('delNotes') || {}).value || '').trim(),
      at: nowIso()
    };
    safeToast('⏳ Saving delivery record to the Common Server…', 'info');
    var saved = await appendPatientHistory('deliveries', entry);
    if (!saved) return safeToast('❌ Delivery record was NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, window.clearDelivery);
    safeToast('🤰 Delivery registered on the Common Server', 'success');
  }
  async function deleteDelivery(i) {
    var patient = refreshCurrentPatientFromStore();
    if (!patient || !Array.isArray(patient.deliveries) || !patient.deliveries[i]) return;
    if (!window.confirm('Delete this delivery record?')) return;
    var next = patient.deliveries.slice(); next.splice(i, 1);
    safeToast('⏳ Removing delivery record from the Common Server…', 'info');
    var saved = await replacePatientHistory('deliveries', next);
    if (!saved) return safeToast('❌ Delivery deletion failed. Please retry.', 'error');
    refreshAfterSave(saved);
    safeToast('🗑 Delivery record removed from the Common Server', 'info');
  }

  function verifiedLabRecords(patient) {
    patient = patient || getCurrentPatient();
    if (!patient) return [];
    var pid = String(patient.id || '').replace(/^MOD-/i, '');
    var records = [];
    var seen = {};
    try {
      var embedded = Array.isArray(patient.labResults) ? patient.labResults : [];
      embedded.forEach(function (r) {
        if (!r) return;
        var key = String(r.orderId || r.id || ('embedded-' + records.length));
        if (seen[key]) return;
        seen[key] = true;
        records.push({
          source: 'patient',
          key: key,
          date: r.date || r.completedAt || r.at || r.timestamp,
          verifiedBy: r.verifiedBy || 'Laboratory',
          tests: Array.isArray(r.tests) ? r.tests : [],
          antibiotics: Array.isArray(r.antibiotics) ? r.antibiotics : [],
          sampleType: r.sampleType || '',
          organism: r.organism || '',
          colonyCount: r.colonyCount || '',
          comments: r.comments || '',
          critical: !!r.critical,
          raw: r
        });
      });
    } catch (e) {}
    try {
      var orders = JSON.parse(localStorage.getItem('pclinic_orders') || '[]').filter(function (o) {
        return String(o.patientId || '').replace(/^MOD-/i, '') === pid && (o.type === 'lab' || o.dept === 'lab') && (o.status === 'completed' || o.status === 'Completed');
      });
      orders.forEach(function (o) {
        if (!o) return;
        var key = String(o.id || ('order-' + records.length));
        if (seen[key]) return;
        seen[key] = true;
        records.push({
          source: 'order',
          key: key,
          date: o.completedAt || o.updatedAt || o.orderedAt,
          verifiedBy: o.completedBy || 'Laboratory',
          tests: Array.isArray(o.results) ? o.results : [],
          antibiotics: [],
          sampleType: '',
          organism: '',
          colonyCount: '',
          comments: o.labComments || '',
          critical: !!o.critical || (Array.isArray(o.results) && o.results.some(function (r) { return String(r.flag || '').toLowerCase().indexOf('critical') !== -1; })),
          title: (o.items || []).map(function (it) { return it.name; }).join(', '),
          raw: o
        });
      });
    } catch (e) {}
    return records.sort(function (a, b) { return ms(b.date) - ms(a.date); });
  }

  function renderLabResults(patient) {
    patient = patient || refreshCurrentPatientFromStore();
    var box = document.getElementById('labResultsContainer');
    var labDate = document.getElementById('labDate');
    if (!box) return;
    if (!patient) {
      box.innerHTML = '<div class="cpn-empty">🔒 Select a patient first to see verified laboratory results from the Common Server.</div>';
      return;
    }
    var filterDate = (labDate && labDate.value) || '';
    if (labDate && filterDate) labDate.dataset.nursePreserve = '1';
    else if (labDate) delete labDate.dataset.nursePreserve;
    var records = verifiedLabRecords(patient).filter(function (r) {
      if (!filterDate) return true;
      var d = ms(r.date);
      if (!d) return false;
      return new Date(d).toISOString().slice(0, 10) === filterDate;
    });
    if (!records.length) {
      box.innerHTML = '<div class="cpn-empty">No verified lab results found' + (filterDate ? ' for ' + esc(filterDate) : '') + '.<br><span style="font-size:11px;">Results appear here automatically once the laboratory verifies and releases them.</span></div>';
      return;
    }
    box.innerHTML = records.map(function (r) {
      var title = r.title || (r.tests && r.tests.length ? r.tests.map(function (t) { return t.test || t.name || 'Test'; }).slice(0, 4).join(', ') : 'Laboratory result');
      var testsHtml = '';
      if (r.antibiotics && r.antibiotics.length) {
        testsHtml = '<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:8px;">' +
          '<thead><tr style="background:rgba(0,0,0,0.03);"><th style="padding:6px 10px;text-align:left;border-bottom:0.5px solid var(--bd);">Antibiotic</th><th style="padding:6px 10px;text-align:left;border-bottom:0.5px solid var(--bd);">Sensitivity</th></tr></thead><tbody>' +
          r.antibiotics.map(function (a) {
            var name = Array.isArray(a) ? (a[1] || 'Antibiotic') : (a.name || a.antibiotic || 'Antibiotic');
            var sens = Array.isArray(a) ? (a[2] || 'Sensitive') : (a.sensitivity || 'Sensitive');
            var sensStyle = String(sens).toLowerCase() === 'resistant' ? 'color:var(--red);font-weight:700;' : 'color:var(--ac);font-weight:700;';
            return '<tr><td style="padding:6px 10px;border-bottom:0.5px solid var(--bd);">' + esc(name) + '</td><td style="padding:6px 10px;border-bottom:0.5px solid var(--bd);' + sensStyle + '">' + esc(sens) + '</td></tr>';
          }).join('') +
          '</tbody></table>';
      } else {
        testsHtml = (Array.isArray(r.tests) ? r.tests : []).map(function (t) {
          var flag = String(t.flag || 'Normal');
          var flagStyle = flag.indexOf('Critical') !== -1 ? 'color:var(--red);' : (flag.indexOf('High') !== -1 || flag.indexOf('Low') !== -1 ? 'color:var(--orange);' : 'color:var(--green);');
          return '<div class="result-row">' +
            '<div class="result-test"><strong>' + esc(t.test || t.name || 'Test') + '</strong></div>' +
            '<div class="result-range">' + esc(t.referenceRange || t.range || '—') + '</div>' +
            '<div class="result-val" style="' + flagStyle + '">' + esc(t.value || '—') + (t.unit ? ' ' + esc(t.unit) : '') + (flag && flag !== 'Normal' ? ' · ' + esc(flag) : '') + '</div>' +
          '</div>';
        }).join('');
      }
      return '<div class="apple-glass" style="position:relative;padding:14px 16px;margin-bottom:10px;border:0.5px solid var(--bd);border-radius:12px;background:rgba(255,255,255,0.55);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:700;color:var(--tp);">🧪 ' + esc(title || 'Verified laboratory results') + '</div>' +
            '<div style="font-size:11px;color:var(--tm);margin-top:2px;">' + esc(r.date ? new Date(ms(r.date)).toLocaleString('en-GB') : 'Verified result') + ' · Verified by ' + esc(r.verifiedBy || 'Laboratory') + '</div>' +
          '</div>' +
          '<span class="badge ' + (r.critical ? 'b-critical' : 'b-stable') + '">' + (r.critical ? '⚠ Critical result' : '✓ Verified') + '</span>' +
        '</div>' +
        ((r.sampleType || r.organism || r.comments) ? ('<div style="display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--tm);margin-bottom:8px;">' +
          (r.sampleType ? '<span><strong>Sample:</strong> ' + esc(r.sampleType) + '</span>' : '') +
          (r.organism ? '<span><strong>Organism:</strong> ' + esc(r.organism) + '</span>' : '') +
          (r.colonyCount ? '<span><strong>Colony count:</strong> ' + esc(r.colonyCount) + '</span>' : '') +
          '</div>') : '') +
        testsHtml +
        (r.comments ? '<div style="margin-top:8px;font-size:11px;color:var(--tm);"><strong>Comments:</strong> ' + esc(r.comments) + '</div>' : '') +
      '</div>';
    }).join('');
  }

  function buildModalRows(type) {
    var all = getAllPatients();
    var metrics = nursingMetrics(all);
    var map = {
      queue: { title: 'Today\'s full queue', rows: metrics.queue },
      waiting: { title: 'Currently waiting', rows: metrics.waiting },
      urgent: { title: 'Urgent — immediate attention', rows: metrics.urgent },
      seen: { title: 'Patients seen today', rows: metrics.seen },
      'cpn-due': { title: 'CPN due today', rows: metrics.cpnDue }
    };
    return map[type] || { title: 'Queue details', rows: [] };
  }

  function openModal(type) {
    var modal = document.getElementById('modalOverlay');
    var title = document.getElementById('modalTitle');
    var body = document.getElementById('modalBody');
    if (!modal || !title || !body) return safeToast('❌ Dashboard modal is missing from the page.', 'error');
    var out = buildModalRows(type);
    title.textContent = out.title;
    if (!out.rows.length) {
      body.innerHTML = '<div class="cpn-empty">No patients match this view right now.</div>';
      modal.classList.add('show');
      return;
    }
    body.innerHTML = '<table class="wtbl"><thead><tr><th>Patient</th><th>MRN</th><th>Location</th><th>Triage</th><th>Status</th><th></th></tr></thead><tbody>' + out.rows.slice(0, 30).map(function (p) {
      var tri = triageInfo(lastTriage(p) && lastTriage(p).level);
      var statusText = hasSeenToday(p) ? 'Seen today' : displayStatus(p);
      var sid = String(p.id).replace(/'/g, "\\'");
      return '<tr>' +
        '<td><strong>' + esc(displayName(p)) + '</strong></td>' +
        '<td>' + esc(displayMrn(p)) + '</td>' +
        '<td>' + esc(displayLocation(p)) + '</td>' +
        '<td><span class="badge ' + tri.cls + '">' + esc(tri.label) + '</span></td>' +
        '<td>' + esc(statusText) + '</td>' +
        '<td><button class="btn-s" onclick="closeModal(); selectPatient(\'' + sid + '\')">Open</button></td>' +
      '</tr>';
    }).join('') + '</tbody></table>';
    modal.classList.add('show');
  }
  function closeModal() {
    var modal = document.getElementById('modalOverlay');
    if (modal) modal.classList.remove('show');
  }

  function updateNursingChips() {
    var patient = getCurrentPatient();
    var name = patient ? (displayName(patient) + ' — MRN ' + displayMrn(patient)) : 'No patient selected';
    ['careplanPatientChip', 'delPatientChip', 'vitalsGraphPatient'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = name;
    });
  }

  function wireRefreshEvents() {
    window.addEventListener('storage', function () { loadPatients(); });
    window.addEventListener('focus', function () { loadPatients(); });
    window.addEventListener('labResultsUpdated', function () { renderLabResults(); refreshKpisAndQueue(getAllPatients()); });
    window.addEventListener('pclinicSyncError', function () { loadPatients(); renderLabResults(); });
  }

  function installOverrides() {
    window.showToast = safeToast;
    window.nurseShowToast = safeToast;
    window.updateClock = updateClock;
    window.loadPatients = loadPatients;
    window.renderPatientTable = renderPatientTable;
    window.filterPatients = function () { renderPatientTable(getAllPatients()); };
    window.updateKPIs = function (patients) { return refreshKpisAndQueue(patients); };
    window.updateQueue = updateQueue;
    window.handleSmartSearch = handleSmartSearch;
    window.lookupPatient = lookupPatient;
    window.fillForms = fillForms;
    window.selectPatient = selectPatient;
    window.addBillRow = addBillRow;
    window.calcBill = calcBill;
    window.clearBill = clearBill;
    window.addMedicationRow = addMedicationRow;
    window.removeMed = removeMed;
    window.toggleMedStatus = toggleMedStatus;
    window.selectFp = selectFp;
    window.saveTriage = saveTriage;
    window.clearTriage = clearTriage;
    window.selectTriage = selectTriage;
    window.saveVitals = saveVitals;
    window.clearVitals = clearVitals;
    window.openVitalsForPatient = openVitalsForPatient;
    window.saveCPN = saveCPN;
    window.clearCPN = clearCPN;
    window.saveFP = saveFP;
    window.clearFP = clearFP;
    window.saveNursingNote = saveNursingNote;
    window.clearNursingNote = clearNursingNote;
    window.saveBill = saveBill;
    window.saveMedicationLog = saveMedicationLog;
    window.saveCarePlan = saveCarePlan;
    window.setCarePlanStatus = setCarePlanStatus;
    window.deleteCarePlan = deleteCarePlan;
    window.saveDelivery = saveDelivery;
    window.deleteDelivery = deleteDelivery;
    window.renderLabResults = renderLabResults;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.updateNursingChips = updateNursingChips;
    var legacySwitchTab = window.switchTab;
    if (typeof legacySwitchTab === 'function') {
      window.switchTab = function (name, btn) {
        legacySwitchTab(name, btn);
        if (name === 'lab') renderLabResults();
        if (name === 'patients') renderPatientTable(getAllPatients());
        if (name === 'overview') refreshKpisAndQueue(getAllPatients());
        if (name === 'vitals' && typeof window.renderVitalsGraph === 'function') window.renderVitalsGraph();
      };
    }
    var legacySwitchSub = window.switchSub;
    if (typeof legacySwitchSub === 'function') {
      window.switchSub = function (subId) {
        legacySwitchSub(subId);
        if (subId === 'lab-view') renderLabResults();
        if (subId === 'vitals-graph' && typeof window.renderVitalsGraph === 'function') window.renderVitalsGraph();
      };
    }
  }

  function init() {
    installOverrides();
    window.selectedFpMethod = '';
    window.medCounter = 0;
    document.querySelectorAll('.fp-btn').forEach(function (b) { b.classList.remove('sel'); });
    applyStaffUi();
    installSelectedPatientFields();
    setPatientFieldValues(getCurrentPatient());
    ensureBillRows();
    var billDate = document.getElementById('billDate'); if (billDate && !billDate.value) billDate.value = todayIso();
    var fpDate = document.getElementById('fpDate'); if (fpDate && !fpDate.value) fpDate.value = todayIso();
    var medsDate = document.getElementById('medsDate'); if (medsDate && !medsDate.value) medsDate.value = todayIso();
    var labDate = document.getElementById('labDate'); if (labDate) labDate.value = '';
    var medList = document.getElementById('medLogList'); if (medList) medList.innerHTML = '';
    ensureMedicationEditorRow();
    loadPatients();
    renderLabResults();
    wireRefreshEvents();
    setInterval(function () {
      updateClock();
      if (window.currentStaff) applyStaffUi();
    }, 60000);
    updateClock();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
