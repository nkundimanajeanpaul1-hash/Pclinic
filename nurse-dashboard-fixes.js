(function () {
  'use strict';

  var PATIENT_FIELD_IDS = ['triagePatient', 'vitalsPatient', 'cpnPatient', 'fpPatient', 'billPatient', 'labPatient', 'notesPatient', 'medsPatient', 'cpPatient'];
  var STAFF_FIELD_IDS = ['triageNurse', 'cpnNurse', 'fpNurse', 'billNurse', 'notesNurse', 'medsNurse', 'delBy', 'cpNurse'];
  var LOCATION_FIELD_IDS = ['cpnLocation', 'notesWard', 'billWard'];
  var syncingFromSharedBar = false;

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

  function masterHeader() {
    var el = document.getElementById('pcMasterHeader');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pcMasterHeader';
    var app = document.getElementById('app');
    if (app && app.parentNode) app.parentNode.insertBefore(el, app);
    else if (document.body) document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  function hideLegacyPatientCard() {
    var card = document.getElementById('patientCard');
    if (card) {
      card.classList.remove('show');
      card.style.display = 'none';
      card.setAttribute('hidden', 'hidden');
      card.setAttribute('aria-hidden', 'true');
    }
  }

  function syncSharedPatientBar(patient) {
    if (syncingFromSharedBar) return;
    try {
      if (patient && patient.id && !patient._cleared) localStorage.setItem('pclinic_active_patient', String(patient.id));
      else localStorage.removeItem('pclinic_active_patient');
    } catch (e) {}
    try {
      if (window.pcFile && typeof window.pcFile.renderDemoBar === 'function') {
        window.pcFile.renderDemoBar(masterHeader(), patient || {
          _cleared: true,
          id: '', mrn: '', lastName: '', firstName: '', nationalId: '',
          department: '', dob: '', gender: '', archiveCode: '',
          insurance: 'RSSB / RAMA', district: 'NYARUGENGE'
        });
      }
    } catch (e) { console.warn(e); }
    try {
      window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: patient && !patient._cleared ? patient : null }));
    } catch (e) {}
  }

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
    if (level === 1) return { label: 'Red · Immediate', cls: 'b-critical', previewCls: 'triage-preview-red', priority: 'critical', color: 'red' };
    if (level === 2) return { label: 'Orange · Very urgent', cls: 'b-warn', previewCls: 'triage-preview-orange', priority: 'high', color: 'orange' };
    if (level === 3) return { label: 'Yellow · Urgent', cls: 'b-orange', previewCls: 'triage-preview-yellow', priority: 'medium', color: 'yellow' };
    if (level === 4) return { label: 'Green · Routine', cls: 'b-stable', previewCls: 'triage-preview-green', priority: 'low', color: 'green' };
    if (level === 5) return { label: 'Blue · Non-urgent', cls: 'b-info', previewCls: 'triage-preview-blue', priority: 'low', color: 'blue' };
    return { label: 'Not triaged', cls: 'b-info', previewCls: 'triage-preview-neutral', priority: 'low', color: 'neutral' };
  }

  var TRIAGE_CONDITION_RULES = {
    'active-bleeding': { id: 'active-bleeding', label: 'Active bleeding', level: 1 },
    'seizure': { id: 'seizure', label: 'Seizure', level: 1 },
    'unconscious-airway': { id: 'unconscious-airway', label: 'Unconscious / airway compromise', level: 1 },
    'active-labor': { id: 'active-labor', label: 'In active labor', level: 2 },
    'respiratory-distress': { id: 'respiratory-distress', label: 'Respiratory distress', level: 2 },
    'severe-pain': { id: 'severe-pain', label: 'Severe pain', level: 2 },
    'fever-dehydration': { id: 'fever-dehydration', label: 'Fever / dehydration / other concern', level: 3 }
  };

  function lastTriage(p) { return latestEntry(p && p.triage); }
  function lastVitals(p) { return latestEntry(p && p.vitals); }
  function lastCpn(p) { return latestEntry(p && p.cpnHistory); }
  function lastNursingNote(p) { return latestEntry(p && p.nursingNotes); }
  function lastTouch(p) {
    var items = [lastTriage(p), lastVitals(p), lastCpn(p), lastNursingNote(p), latestEntry(p && p.medicationLog)];
    return latestEntry(items.filter(Boolean));
  }

  function hasMeaningfulVitals(v) {
    if (!v) return false;
    return ['temperature', 'temp', 'pulse', 'bpSystolic', 'bpDiastolic', 'bp', 'spo2', 'respiratoryRate', 'rr', 'weight', 'painScore'].some(function (k) {
      return v[k] != null && String(v[k]).trim() !== '';
    });
  }

  function patientHasSavedVitals(patient) {
    return !!(patient && hasMeaningfulVitals(lastVitals(patient)));
  }

  function triageVitalsInterpretation(patient) {
    var v = lastVitals(patient);
    if (!v || !hasMeaningfulVitals(v)) {
      return {
        available: false,
        level: 0,
        info: triageInfo(0),
        reasons: ['No saved vital signs yet.'],
        vitals: null
      };
    }
    var level = 4;
    var reasons = [];
    var temp = Number(v.temperature != null ? v.temperature : v.temp);
    var pulse = Number(v.pulse);
    var spo2 = Number(v.spo2);
    var rr = Number(v.respiratoryRate != null ? v.respiratoryRate : v.rr);
    var sys = Number(v.bpSystolic);
    var dia = Number(v.bpDiastolic);
    var pain = Number(v.painScore);

    if (!isNaN(spo2)) {
      if (spo2 < 90) { level = Math.min(level, 1); reasons.push('SpO₂ critically low (' + spo2 + '%)'); }
      else if (spo2 < 95) { level = Math.min(level, 2); reasons.push('SpO₂ low (' + spo2 + '%)'); }
    }
    if (!isNaN(sys)) {
      if (sys < 90) { level = Math.min(level, 1); reasons.push('Systolic BP very low (' + sys + ')'); }
      else if (sys < 100 || sys >= 180) { level = Math.min(level, 2); reasons.push('Systolic BP concerning (' + sys + ')'); }
    }
    if (!isNaN(dia)) {
      if (dia < 60 || dia >= 110) { level = Math.min(level, 2); reasons.push('Diastolic BP concerning (' + dia + ')'); }
    }
    if (!isNaN(pulse)) {
      if (pulse > 130 || pulse < 40) { level = Math.min(level, 1); reasons.push('Pulse critical (' + pulse + ' bpm)'); }
      else if (pulse > 110 || pulse < 50) { level = Math.min(level, 2); reasons.push('Pulse abnormal (' + pulse + ' bpm)'); }
    }
    if (!isNaN(rr)) {
      if (rr >= 30 || rr <= 8) { level = Math.min(level, 1); reasons.push('Respiratory rate critical (' + rr + '/min)'); }
      else if (rr >= 24) { level = Math.min(level, 2); reasons.push('Respiratory rate elevated (' + rr + '/min)'); }
    }
    if (!isNaN(temp)) {
      if (temp >= 40 || temp < 35) { level = Math.min(level, 2); reasons.push('Temperature concerning (' + temp + '°C)'); }
      else if (temp >= 38.5) { level = Math.min(level, 3); reasons.push('Fever (' + temp + '°C)'); }
    }
    if (!isNaN(pain)) {
      if (pain >= 8) { level = Math.min(level, 2); reasons.push('Severe pain score (' + pain + '/10)'); }
      else if (pain >= 5) { level = Math.min(level, 3); reasons.push('Moderate pain score (' + pain + '/10)'); }
    }

    if (!reasons.length) reasons.push('Saved vital signs currently suggest routine triage.');

    return {
      available: true,
      level: level,
      info: triageInfo(level),
      reasons: reasons,
      vitals: v
    };
  }

  function syncTriageConditionUi() {
    document.querySelectorAll('.triage-condition').forEach(function (label) {
      var input = label.querySelector('input[data-triage-condition]');
      if (input && input.checked) label.classList.add('active');
      else label.classList.remove('active');
    });
  }

  function clearTriageSelections() {
    document.querySelectorAll('input[data-triage-condition]').forEach(function (input) {
      input.checked = false;
    });
    syncTriageConditionUi();
  }

  function selectedTriageConditions() {
    return Array.prototype.slice.call(document.querySelectorAll('input[data-triage-condition]:checked')).map(function (input) {
      return TRIAGE_CONDITION_RULES[input.value];
    }).filter(Boolean);
  }

  function triageAssessment(patient) {
    var base = triageVitalsInterpretation(patient);
    var chosen = selectedTriageConditions();
    var level = base.available ? base.level : 0;
    var reasons = base.reasons.slice();
    chosen.forEach(function (cond) {
      level = level ? Math.min(level, cond.level) : cond.level;
      reasons.unshift(cond.label);
    });
    var info = triageInfo(level || 0);
    return {
      base: base,
      conditions: chosen,
      level: level || 0,
      info: info,
      reasons: reasons,
      priority: info.priority,
      color: info.color
    };
  }

  function triagePreviewHtml(assessment, prefix) {
    if (!assessment || !assessment.level) {
      return 'No triage category ready yet.';
    }
    var head = (prefix ? prefix + ': ' : '') + assessment.info.label;
    var conds = assessment.conditions.length ? ('Emergency conditions: ' + assessment.conditions.map(function (c) { return c.label; }).join(', ') + '. ') : '';
    var reasons = assessment.reasons.length ? assessment.reasons.join(' • ') : 'No triage triggers.';
    return '<strong>' + esc(head) + '</strong><small>' + esc(conds + reasons) + '</small>';
  }

  function renderTriagePanel(patient) {
    patient = patient || getCurrentPatient();
    var stamp = document.getElementById('triageVitalsStamp');
    var summary = document.getElementById('triageVitalsSummary');
    var suggested = document.getElementById('triageSuggestedCategory');
    var finalBox = document.getElementById('triageFinalPreview');
    var saveBtn = document.getElementById('saveTriageBtn');
    var grid = document.getElementById('triageConditionGrid');
    if (!summary || !suggested || !finalBox || !saveBtn) return;

    if (!patient) {
      if (stamp) stamp.value = '';
      if (grid) delete grid.dataset.patientId;
      clearTriageSelections();
      summary.innerHTML = 'Select a patient and save vital signs first.';
      suggested.className = 'triage-preview triage-preview-neutral';
      suggested.innerHTML = 'No vital-sign interpretation yet.';
      finalBox.className = 'triage-preview triage-preview-neutral';
      finalBox.innerHTML = 'No triage category ready yet.';
      saveBtn.disabled = true;
      return;
    }

    if (grid && grid.dataset.patientId !== String(patient.id)) {
      clearTriageSelections();
      grid.dataset.patientId = String(patient.id);
    }
    syncTriageConditionUi();

    var base = triageVitalsInterpretation(patient);
    var v = base.vitals;
    if (!base.available || !v) {
      if (stamp) stamp.value = '';
      summary.innerHTML = 'No saved vital signs yet for this patient. Save vital signs first in the Vitals tab.';
      suggested.className = 'triage-preview triage-preview-neutral';
      suggested.innerHTML = 'Vitals required before triage can open.';
      finalBox.className = 'triage-preview triage-preview-neutral';
      finalBox.innerHTML = 'Save vital signs first, then return to Triage.';
      saveBtn.disabled = true;
      return;
    }

    if (stamp) {
      var when = v.timestamp || v.at || v.date || patient.updatedAt || '';
      stamp.value = when ? new Date(ms(when)).toLocaleString('en-GB') : 'Saved vitals';
    }

    summary.innerHTML = [
      ['Temp', (v.temperature != null ? v.temperature : v.temp), '°C'],
      ['Pulse', v.pulse, 'bpm'],
      ['Resp', (v.respiratoryRate != null ? v.respiratoryRate : v.rr), '/min'],
      ['BP', (v.bp || ((v.bpSystolic || '--') + '/' + (v.bpDiastolic || '--'))), ''],
      ['SpO₂', v.spo2, '%'],
      ['Pain', (v.painScore != null ? v.painScore : ''), '/10']
    ].map(function (item) {
      return '<div class="triage-vital-chip"><div class="triage-vital-label">' + esc(item[0]) + '</div><div class="triage-vital-value">' + esc((item[1] == null || item[1] === '') ? '—' : item[1]) + (item[2] ? '<span style="font-size:11px;font-weight:500;color:var(--tm);margin-left:3px;">' + esc(item[2]) + '</span>' : '') + '</div></div>';
    }).join('');

    suggested.className = 'triage-preview ' + base.info.previewCls;
    suggested.innerHTML = triagePreviewHtml({ level: base.level, info: base.info, conditions: [], reasons: base.reasons }, 'Suggested from saved vitals');

    var final = triageAssessment(patient);
    finalBox.className = 'triage-preview ' + final.info.previewCls;
    finalBox.innerHTML = triagePreviewHtml(final, 'Final category');
    saveBtn.disabled = !final.level;
  }

  function updateTriagePreview() {
    syncTriageConditionUi();
    renderTriagePanel(getCurrentPatient());
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

  var cpnPreviewRecordId = null;

  function fmtDateTime(value) {
    var t = ms(value);
    if (!t) return '—';
    return new Date(t).toLocaleString('en-GB');
  }

  function toDateInputValue(value) {
    var t = ms(value || Date.now());
    if (!t) return '';
    return new Date(t).toISOString().slice(0, 10);
  }

  function cpnFieldValue(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function ancVisitCount(patient) {
    return patient && Array.isArray(patient.cpnHistory) ? patient.cpnHistory.length : 0;
  }

  function parseDateOnly(value) {
    if (!value) return null;
    var m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function formatGestAgeLabel(weeks, days) {
    if (weeks == null || isNaN(weeks)) return '';
    return String(weeks) + ' weeks' + (days != null && !isNaN(days) ? ' ' + String(days) + ' days' : '');
  }

  function computeAncFromLmp(lmp) {
    var d = parseDateOnly(lmp);
    if (!d) return null;
    var today = new Date();
    var todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var diffDays = Math.floor((todayOnly.getTime() - d.getTime()) / 86400000);
    if (diffDays < 0) return null;
    var weeks = Math.floor(diffDays / 7);
    var days = diffDays % 7;
    var edd = new Date(d.getTime());
    edd.setDate(edd.getDate() + 280);
    return {
      weeks: weeks,
      days: days,
      gaLabel: formatGestAgeLabel(weeks, days),
      edd: toDateInputValue(edd)
    };
  }

  function syncCpnComputedFields(patient) {
    patient = patient || getCurrentPatient();
    var visit = document.getElementById('cpnVisitNumber');
    if (visit) visit.value = patient ? String(ancVisitCount(patient) + 1) : '';
    var lmp = document.getElementById('cpnLmp');
    var ga = document.getElementById('cpnGestAge');
    var edd = document.getElementById('cpnEdd');
    var calc = computeAncFromLmp(lmp && lmp.value);
    if (ga) ga.value = calc ? calc.gaLabel : '';
    if (edd) edd.value = calc ? calc.edd : '';
    var loc = document.getElementById('cpnLocation');
    if (loc && !loc.value && patient) loc.value = displayLocation(patient);
  }

  function cpnDraft(patient) {
    syncCpnComputedFields(patient);
    return {
      id: 'draft',
      timestamp: cpnFieldValue('cpnDateTime') || nowIso(),
      nurse: cpnFieldValue('cpnNurse') || currentStaffName(),
      location: cpnFieldValue('cpnLocation') || displayLocation(patient),
      visitNumber: cpnFieldValue('cpnVisitNumber') || String((patient ? ancVisitCount(patient) : 0) + 1),
      pregnancies: cpnFieldValue('cpnPregnancies'),
      lmp: cpnFieldValue('cpnLmp'),
      gestationalAge: cpnFieldValue('cpnGestAge'),
      edd: cpnFieldValue('cpnEdd'),
      rdv: cpnFieldValue('cpnRdv'),
      quickening: cpnFieldValue('cpnQuickening'),
      fundalHeight: cpnFieldValue('cpnFundalHeight'),
      ttDose: cpnFieldValue('cpnTtDose'),
      assessment: cpnFieldValue('cpnAssessment'),
      notes: cpnFieldValue('cpnNotes')
    };
  }

  function previewCpnHistory(recordId) {
    cpnPreviewRecordId = recordId || null;
    renderCpnDocPreview(getCurrentPatient());
    var rows = document.querySelectorAll('#cpnHistoryList .pcf-hrow');
    rows.forEach(function (row) {
      if (String(row.getAttribute('data-cpn-id') || '') === String(recordId || '')) row.classList.add('is-selected');
      else row.classList.remove('is-selected');
    });
  }

  function renderCpnDocPreview(patient) {
    var box = document.getElementById('cpnDocPreview');
    if (!box) return;
    patient = patient || getCurrentPatient();
    if (!patient) {
      box.innerHTML = '<div class="pcf-empty"><i class="ti ti-baby-carriage"></i>Select a patient to start or review an ANC / CPN visit.</div>';
      return;
    }
    var history = Array.isArray(patient.cpnHistory) ? patient.cpnHistory.slice() : [];
    var record = null;
    if (cpnPreviewRecordId) record = history.find(function (item) { return String(item && item.id) === String(cpnPreviewRecordId); }) || null;
    if (!record) record = cpnDraft(patient);
    function sec(titleText, value) {
      return '<div class="sec"><h4>' + esc(titleText) + '</h4><p>' + (value ? esc(value) : '<span class="none">Not recorded</span>') + '</p></div>';
    }
    box.innerHTML = '' +
      '<div class="dh">' +
        '<div><div class="org">PCLINIC / CHUK</div><div class="sub">Maternity service · ANC / CPN documentation preview</div></div>' +
        '<div class="meta"><b>' + esc(cpnPreviewRecordId ? 'Saved ANC / CPN Visit' : 'ANC / CPN Preview') + '</b><br>' + esc(fmtDateTime(record.timestamp)) + '</div>' +
      '</div>' +
      '<div class="dtitle">ANC / CPN File</div>' +
      '<div class="pinfo">' +
        '<div><span>Patient</span> ' + esc(displayName(patient)) + '</div>' +
        '<div><span>MRN</span> ' + esc(displayMrn(patient)) + '</div>' +
        '<div><span>Visit no.</span> ' + esc(record.visitNumber || '—') + '</div>' +
        '<div><span>Nurse</span> ' + esc(record.nurse || currentStaffName()) + '</div>' +
        '<div><span>LMP</span> ' + esc(record.lmp || '—') + '</div>' +
        '<div><span>Gest age</span> ' + esc(record.gestationalAge || '—') + '</div>' +
        '<div><span>EDD</span> ' + esc(record.edd || '—') + '</div>' +
        '<div><span>RDV</span> ' + esc(record.rdv || '—') + '</div>' +
        '<div><span>No. of pregnancy</span> ' + esc(record.pregnancies || '—') + '</div>' +
        '<div><span>Location</span> ' + esc(record.location || displayLocation(patient)) + '</div>' +
      '</div>' +
      sec('Quickening', record.quickening) +
      sec('Fundal height (cm)', record.fundalHeight) +
      sec('Vaccine / tetanus dose given', record.ttDose) +
      sec('ANC / CPN impression', record.assessment) +
      sec('Notes / complaints / observations', record.notes);
  }

  function updateCPNCount(patient) {
    var countEl = document.getElementById('cpnCount');
    if (!countEl) return;
    countEl.textContent = String(ancVisitCount(patient));
    var visit = document.getElementById('cpnVisitNumber');
    if (visit) visit.value = patient ? String(ancVisitCount(patient) + 1) : '';
  }

  function renderCPNHistory(patient) {
    var box = document.getElementById('cpnHistoryList');
    if (!box) return;
    patient = patient || getCurrentPatient();
    var history = patient && Array.isArray(patient.cpnHistory) ? patient.cpnHistory.slice().sort(function (a, b) {
      return ms(b && b.timestamp) - ms(a && a.timestamp);
    }) : [];
    updateCPNCount(patient);
    if (!history.length) {
      cpnPreviewRecordId = null;
      box.innerHTML = '<p class="pcf-empty"><i class="ti ti-baby-carriage"></i>No ANC / CPN visits yet. Create one above.</p>';
      renderCpnDocPreview(patient);
      return;
    }
    box.innerHTML = history.map(function (cpn) {
      var dt = new Date(ms(cpn.timestamp) || Date.now());
      var visitNo = cpn.visitNumber || '—';
      var ga = cpn.gestationalAge || 'No GA';
      var summary = [cpn.ttDose ? ('TT ' + cpn.ttDose) : '', cpn.quickening || '', cpn.fundalHeight ? ('Fundal ' + cpn.fundalHeight + ' cm') : '', cpn.assessment || 'ANC / CPN visit'].filter(Boolean).join(' • ');
      return '<button type="button" class="pcf-hrow" data-cpn-id="' + esc(cpn.id) + '" onclick="previewCPNHistory(\'' + String(cpn.id).replace(/'/g, "\\'") + '\')" style="text-align:left;border:none;width:100%;cursor:pointer;">' +
        '<div class="date"><div class="d">' + esc(String(dt.getDate()).padStart(2, '0')) + '</div><div class="m">' + esc(dt.toLocaleString('en-US', { month: 'short' })) + '</div></div>' +
        '<div class="meat"><b>Visit ' + esc(String(visitNo)) + ' · ' + esc(ga) + '</b><span>' + esc(summary.slice(0, 180)) + (summary.length > 180 ? '…' : '') + '</span></div>' +
        '<div class="by">' + esc(cpn.nurse || currentStaffName()) + '<br>' + esc(fmtDateTime(cpn.timestamp)) + '</div>' +
      '</button>';
    }).join('');
    if (cpnPreviewRecordId) previewCpnHistory(cpnPreviewRecordId);
    else renderCpnDocPreview(patient);
  }

  function wireCpnPreviewEvents() {
    ['cpnDateTime', 'cpnNurse', 'cpnLocation', 'cpnPregnancies', 'cpnLmp', 'cpnGestAge', 'cpnEdd', 'cpnRdv', 'cpnQuickening', 'cpnFundalHeight', 'cpnTtDose', 'cpnAssessment', 'cpnNotes'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.cpnPreviewBound) return;
      el.dataset.cpnPreviewBound = '1';
      el.addEventListener('input', function () { cpnPreviewRecordId = null; syncCpnComputedFields(getCurrentPatient()); renderCpnDocPreview(getCurrentPatient()); });
      el.addEventListener('change', function () { cpnPreviewRecordId = null; syncCpnComputedFields(getCurrentPatient()); renderCpnDocPreview(getCurrentPatient()); });
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
    hideLegacyPatientCard();
    setPatientFieldValues(patient || null);
    applyStaffUi();
    if (!patient) {
      syncSharedPatientBar(null);
      renderTriagePanel(null);
      renderCPNHistory(null);
      renderCpnDocPreview(null);
      if (typeof window.renderBillHistory === 'function') window.renderBillHistory(null);
      if (typeof window.updateBillCount === 'function') window.updateBillCount(null);
      if (typeof window.renderLabResults === 'function') window.renderLabResults();
      if (typeof window.renderVitalsGraph === 'function') window.renderVitalsGraph();
      if (typeof window.renderNursingNotes === 'function') window.renderNursingNotes(null);
      if (typeof window.updateNursingNoteCount === 'function') window.updateNursingNoteCount(null);
      if (typeof window.updateNursingChips === 'function') window.updateNursingChips();
      return;
    }
    syncSharedPatientBar(patient);
    if (typeof window.fillForms === 'function') window.fillForms(patient);
    renderTriagePanel(patient);
    renderCPNHistory(patient);
    renderCpnDocPreview(patient);
    if (typeof window.renderCarePlanHistory === 'function') window.renderCarePlanHistory();
    if (typeof window.renderDeliveriesHistory === 'function') window.renderDeliveriesHistory();
    if (typeof window.renderVitalsGraph === 'function') window.renderVitalsGraph();
    if (typeof window.renderLabResults === 'function') window.renderLabResults(patient);
    if (typeof window.renderNursingNotes === 'function') window.renderNursingNotes(patient);
    if (typeof window.updateNursingNoteCount === 'function') window.updateNursingNoteCount(patient);
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
        '<td><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;"><strong>' + name + '</strong><button class="btn-s" style="padding:2px 10px;font-size:10px;background:var(--ac);color:#fff;border:none;" onclick="event.stopPropagation();selectPatient(\'' + sid + '\', { keepTab: true })"><i class="ti ti-check"></i> Select</button></div></td>' +
        '<td><span class="badge b-info">' + esc(displayMrn(p)) + '</span></td>' +
        '<td>' + esc(p.dob || 'N/A') + ' (' + age + ')</td>' +
        '<td>' + esc(p.gender || 'N/A') + '</td>' +
        '<td>' + esc(p.phone || 'N/A') + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + statusText + '</span></td>' +
        '<td>' +
          '<button class="btn-s" style="padding:2px 10px;font-size:10px;background:var(--ac);color:#fff;border:none;" onclick="event.stopPropagation();selectPatient(\'' + sid + '\', { keepTab: true })"><i class="ti ti-check"></i> Select</button>' +
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
    ['triageDateTime', 'vitalsDateTime', 'cpnDateTime', 'notesDateTime', 'delDateTime', 'cpDateTime'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = dt;
    });
    ['fpDate', 'billDate', 'medsDate', 'fpReturn', 'fpLmp', 'cpEvalDate'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = d;
    });
    var labDate = document.getElementById('labDate');
    if (labDate && !labDate.dataset.nursePreserve) labDate.value = '';
    syncCpnComputedFields(patient || null);
  }

  function selectPatient(id, opts) {
    opts = opts || {};
    var p = getPatient(id);
    if (!p) return safeToast('❌ Patient not found', 'error');
    setCurrentPatient(p);
    syncSharedPatientBar(p);
    refreshPatientUi(p, !!opts.quiet);
    var suggestions = document.getElementById('suggestions');
    if (suggestions) suggestions.classList.remove('show');
    var searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = displayName(p) + ' — ' + displayMrn(p);
    if (!opts.keepTab && typeof window.switchTab === 'function') window.switchTab('overview', document.querySelector('[data-tab="overview"]'));
    return p;
  }

  var billKindFilter = 'all';
  var billHistoryFilter = 'all';
  var activeBillPreviewKey = '';
  var lastRemovedBillItem = null;

  function moneyRwf(n) {
    return 'RWF ' + (Number(n) || 0).toLocaleString('en-US');
  }

  function billItemKey(item) {
    var raw = (item && (item.key || item.code)) || [normalize(item && item.name), normalize(item && item.category), normalize(item && item.kind)].join('-');
    var clean = String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return clean || ('bill-item-' + Math.random().toString(36).slice(2, 8));
  }

  function billCatalogKind(item) {
    var category = normalize(item && (item.category || item.type || item.kind));
    return category === 'consumable' ? 'consumable' : 'medication';
  }

  function inventoryNumber(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return isNaN(n) ? null : n;
  }

  function pharmacyInventoryItems() {
    try {
      if (window.pcPharmacy && typeof window.pcPharmacy.list === 'function') {
        var shared = window.pcPharmacy.list() || [];
        return Array.isArray(shared) ? shared : [];
      }
      var raw = JSON.parse(localStorage.getItem('pclinic_pharmacy_inventory') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }

  function normalizeBillingItem(source, invItem) {
    source = source || {};
    invItem = invItem || {};
    var item = {
      code: source.code || invItem.code || '',
      name: source.name || invItem.name || '',
      price: Number(source.price != null ? source.price : invItem.price) || 0,
      category: source.category || invItem.category || 'Other',
      unit: invItem.unit || source.unit || source.description || '',
      stockQty: inventoryNumber(invItem.qty != null ? invItem.qty : source.qty),
      hasStockCount: inventoryNumber(invItem.qty != null ? invItem.qty : source.qty) != null
    };
    item.kind = billCatalogKind(item);
    item.key = billItemKey(item);
    return item;
  }

  function pharmacyBillingCatalog() {
    var tariff = [];
    try {
      if (window.pcTariff && typeof window.pcTariff.byDept === 'function') tariff = window.pcTariff.byDept('pharmacy') || [];
    } catch (e) {}
    var inv = pharmacyInventoryItems();
    var byCode = {};
    var byName = {};
    inv.forEach(function (it) {
      if (!it) return;
      if (it.code) byCode[String(it.code)] = it;
      if (it.name) byName[normalize(it.name)] = it;
    });
    var merged = [];
    var seen = {};
    (Array.isArray(tariff) ? tariff : []).forEach(function (t) {
      var invItem = byCode[String((t && t.code) || '')] || byName[normalize(t && t.name)] || {};
      var item = normalizeBillingItem(t, invItem);
      if (!item.name || seen[item.key]) return;
      seen[item.key] = true;
      merged.push(item);
    });
    inv.forEach(function (it) {
      var item = normalizeBillingItem(it, it);
      if (!item.name || seen[item.key]) return;
      seen[item.key] = true;
      merged.push(item);
    });
    return merged.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function billCatalogMatches(item, query) {
    var q = normalize(query);
    if (!q) return true;
    return [item.name, item.code, item.category, item.unit, item.kind].map(normalize).join(' ').indexOf(q) !== -1;
  }

  function findCatalogItem(key) {
    return pharmacyBillingCatalog().find(function (it) { return String(it.key || '') === String(key || ''); }) || null;
  }

  function selectedBillQtyForItem(key) {
    var row = document.querySelector('#billRows tr[data-bill-key="' + esc(String(key || '')) + '"]');
    if (!row) return 0;
    return parseFloat((row.querySelector('[data-bill="qty"]') || {}).value) || 0;
  }

  function billStockState(item, requestedQty) {
    item = item || {};
    var qty = Number(requestedQty) || 0;
    if (!item.hasStockCount) {
      return {
        severity: 'unknown',
        badgeClass: 'is-unknown',
        label: 'Stock not set',
        detail: 'Live stock count is not saved yet on the common server.'
      };
    }
    var stock = Number(item.stockQty) || 0;
    if (stock <= 0) {
      return {
        severity: 'out',
        badgeClass: 'is-out',
        label: 'Out of stock',
        detail: 'Current saved stock is 0 on the common server.'
      };
    }
    if (qty > 0 && qty > stock) {
      return {
        severity: 'warning',
        badgeClass: 'is-warning',
        label: 'Qty exceeds stock',
        detail: String(qty) + ' requested but only ' + String(stock) + ' saved in stock.'
      };
    }
    if (stock <= 5) {
      return {
        severity: 'low',
        badgeClass: 'is-low',
        label: 'Low stock · ' + String(stock),
        detail: 'Only ' + String(stock) + ' item' + (stock === 1 ? '' : 's') + ' left in saved stock.'
      };
    }
    return {
      severity: 'available',
      badgeClass: 'is-available',
      label: 'In stock · ' + String(stock),
      detail: String(stock) + ' item' + (stock === 1 ? '' : 's') + ' available on the common server.'
    };
  }

  function billStockBadge(item, requestedQty) {
    var state = billStockState(item, requestedQty);
    return '<span class="bill-stock-badge ' + state.badgeClass + '">' + esc(state.label) + '</span>';
  }

  function billCatalogHost() {
    return document.getElementById('svcList') || document.getElementById('billCatalogList');
  }

  function normalizeBillStatus(status) {
    status = normalize(status);
    if (status === 'posted') return 'pending';
    if (status !== 'pending' && status !== 'partial' && status !== 'paid' && status !== 'cancelled') return 'pending';
    return status;
  }

  function recentBillRecords() {
    if (window.pcBilling && typeof window.pcBilling.list === 'function') {
      return (window.pcBilling.list() || []).slice().sort(function (a, b) {
        return ms((b && (b.createdAt || b.timestamp)) || 0) - ms((a && (a.createdAt || a.timestamp)) || 0);
      });
    }
    var rows = [];
    getAllPatients().forEach(function (patient) {
      var history = Array.isArray(patient && patient.billingHistory) ? patient.billingHistory : [];
      history.forEach(function (bill) {
        rows.push({
          id: bill.sharedBillId || bill.id || uid('nurse-bill'),
          number: bill.sharedBillNumber || ('NUR-' + String(bill.id || '').slice(-8)),
          patientId: patient.id,
          patientName: displayName(patient),
          items: bill.items || [],
          total: Number(bill.patientPays != null ? bill.patientPays : bill.total) || 0,
          subtotal: Number(bill.total) || 0,
          createdAt: bill.sharedBillCreatedAt || bill.timestamp || bill.date || nowIso(),
          status: normalizeBillStatus(bill.sharedBillStatus || bill.status || 'pending'),
          _localOnly: !bill.sharedBillId,
          _patientBill: bill
        });
      });
    });
    return rows.sort(function (a, b) { return ms(b.createdAt) - ms(a.createdAt); });
  }

  function setBillKindFilter(kind, btn) {
    billKindFilter = kind || 'all';
    var switcher = document.getElementById('billKindSwitch');
    if (switcher) switcher.querySelectorAll('button').forEach(function (node) { node.classList.remove('on', 'active'); });
    if (btn) btn.classList.add('on');
    renderBillCatalog();
  }

  function setBillHistoryFilter(filter, btn) {
    billHistoryFilter = filter || 'all';
    var bar = document.getElementById('billHistoryFilterBar');
    if (bar) bar.querySelectorAll('button').forEach(function (node) { node.classList.remove('on', 'active'); });
    if (btn) btn.classList.add('on');
    renderBillHistory();
  }

  function openRecentBill(id) {
    if (!id) return;
    if (window.pcBilling && typeof window.pcBilling.list === 'function') {
      window.location.href = 'receipt.html?bill=' + encodeURIComponent(String(id));
      return;
    }
    safeToast('ℹ️ Detailed receipt opens when the shared billing engine is available.', 'info');
  }

  function renderBillCatalogPreview(key) {
    if (key != null) activeBillPreviewKey = String(key || '');
    var host = document.getElementById('billCatalogPreview');
    if (!host) return null;
    var item = activeBillPreviewKey ? findCatalogItem(activeBillPreviewKey) : null;
    if (!item) {
      host.innerHTML = 'Click an item to open its details before adding it to the bill.';
      return null;
    }
    var inBillQty = selectedBillQtyForItem(item.key);
    var state = billStockState(item, inBillQty || 1);
    host.innerHTML = '<div class="bill-preview-card">' +
      '<div class="bill-preview-head">' +
        '<div>' +
          '<div class="bill-preview-name">' + esc(item.name) + '</div>' +
          '<div class="bill-preview-sub">Review this saved common-server item before adding it to the bill.</div>' +
        '</div>' +
        '<span class="bill-kind-badge ' + (item.kind === 'consumable' ? 'is-consumable' : 'is-medication') + '">' + esc(item.kind === 'consumable' ? 'Consumable' : 'Medication') + '</span>' +
      '</div>' +
      '<div class="bill-preview-grid">' +
        '<div class="bill-preview-kv"><span>Price</span><strong>' + esc(moneyRwf(item.price)) + '</strong></div>' +
        '<div class="bill-preview-kv"><span>Code</span><strong>' + esc(item.code || '—') + '</strong></div>' +
        '<div class="bill-preview-kv"><span>Category</span><strong>' + esc(item.category || '—') + '</strong></div>' +
        '<div class="bill-preview-kv"><span>Unit</span><strong>' + esc(item.unit || '—') + '</strong></div>' +
        '<div class="bill-preview-kv"><span>Stock</span><strong>' + esc(state.label) + '</strong></div>' +
        '<div class="bill-preview-kv"><span>Already in bill</span><strong>' + esc(String(inBillQty || 0)) + '</strong></div>' +
      '</div>' +
      '<div class="bill-preview-warning ' + state.badgeClass + '" id="billPreviewWarning">' + esc(state.detail) + '</div>' +
      '<div class="bill-preview-actions">' +
        '<div class="fgl bill-preview-qty-wrap"><div class="lbl">Quantity to add</div><input class="fi" id="billPreviewQty" type="number" min="1" value="1" oninput="updateBillPreviewWarning()"></div>' +
        '<button class="btn-p" type="button" onclick="confirmBillPreviewAdd()"><i class="ti ti-plus"></i> Add to bill</button>' +
      '</div>' +
    '</div>';
    updateBillPreviewWarning();
    return item;
  }

  function updateBillPreviewWarning() {
    var item = activeBillPreviewKey ? findCatalogItem(activeBillPreviewKey) : null;
    var warning = document.getElementById('billPreviewWarning');
    if (!item || !warning) return null;
    var qty = parseInt(((document.getElementById('billPreviewQty') || {}).value || '1'), 10) || 1;
    var inBillQty = selectedBillQtyForItem(item.key);
    var state = billStockState(item, qty + inBillQty);
    warning.className = 'bill-preview-warning ' + state.badgeClass;
    warning.textContent = state.detail + (inBillQty ? ' Already in bill: ' + inBillQty + '.' : '');
    return state;
  }

  function openBillItemDetails(key) {
    renderBillCatalogPreview(key);
  }

  function syncBillRowsFromCatalog() {
    var catalog = pharmacyBillingCatalog();
    var map = {};
    catalog.forEach(function (item) { map[item.key] = item; });
    document.querySelectorAll('#billRows tr[data-bill-key]').forEach(function (row) {
      var key = String(row.getAttribute('data-bill-key') || '');
      var item = map[key];
      if (!item) return;
      row.setAttribute('data-bill-code', item.code || '');
      row.setAttribute('data-bill-kind', item.kind || '');
      row.setAttribute('data-bill-category', item.category || '');
      row.setAttribute('data-bill-unit-label', item.unit || '');
      row.setAttribute('data-bill-stock-known', item.hasStockCount ? '1' : '0');
      row.setAttribute('data-bill-stock-qty', item.hasStockCount ? String(item.stockQty) : '');
      row.setAttribute('data-bill-name', item.name || '');
      var nameField = row.querySelector('[data-bill="name"]'); if (nameField) nameField.value = item.name || '';
      var unitField = row.querySelector('[data-bill="price"]'); if (unitField) unitField.value = String(item.price || 0);
      var label = row.querySelector('[data-bill="unit"]'); if (label) label.textContent = moneyRwf(item.price);
      var nameBox = row.querySelector('.bill-item-name'); if (nameBox) nameBox.textContent = item.name || '';
      var metaBox = row.querySelector('.bill-item-meta'); if (metaBox) metaBox.textContent = (item.code || '—') + (item.unit ? ' · ' + item.unit : '');
      var kindBadge = row.querySelector('.bill-kind-badge');
      if (kindBadge) {
        kindBadge.className = 'bill-kind-badge ' + (item.kind === 'consumable' ? 'is-consumable' : 'is-medication');
        kindBadge.textContent = item.kind === 'consumable' ? 'Consumable' : 'Medication';
      }
    });
  }

  function renderBillStockLive() {
    var ribbon = document.getElementById('billStockLive');
    var cartWarnings = document.getElementById('billCartWarnings');
    var catalog = pharmacyBillingCatalog();
    var low = catalog.filter(function (item) { return billStockState(item).severity === 'low'; }).length;
    var out = catalog.filter(function (item) { return billStockState(item).severity === 'out'; }).length;
    var unknown = catalog.filter(function (item) { return billStockState(item).severity === 'unknown'; }).length;
    var cartNotes = [];
    document.querySelectorAll('#billRows tr[data-bill-key]').forEach(function (row) {
      var item = {
        key: row.getAttribute('data-bill-key') || '',
        name: row.getAttribute('data-bill-name') || ((row.querySelector('[data-bill="name"]') || {}).value || ''),
        hasStockCount: row.getAttribute('data-bill-stock-known') === '1',
        stockQty: inventoryNumber(row.getAttribute('data-bill-stock-qty'))
      };
      var qty = parseFloat((row.querySelector('[data-bill="qty"]') || {}).value) || 0;
      var state = billStockState(item, qty);
      if (state.severity === 'warning' || state.severity === 'out' || state.severity === 'low') {
        cartNotes.push('<div class="bill-cart-warning ' + state.badgeClass + '"><strong>' + esc(item.name || 'Item') + ':</strong> ' + esc(state.detail) + '</div>');
      }
    });
    if (ribbon) ribbon.textContent = 'Live stock: ' + low + ' low-stock · ' + out + ' out-of-stock · ' + unknown + ' without saved stock count';
    if (cartWarnings) {
      if (!cartNotes.length) {
        cartWarnings.innerHTML = '';
        cartWarnings.hidden = true;
      } else {
        cartWarnings.hidden = false;
        cartWarnings.innerHTML = cartNotes.join('');
      }
    }
  }

  function renderBillUndoBar() {
    var bar = document.getElementById('billUndoBar');
    if (!bar) return;
    if (!lastRemovedBillItem || !lastRemovedBillItem.item) {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    bar.hidden = false;
    bar.innerHTML = '<span><strong>Removed:</strong> ' + esc(lastRemovedBillItem.item.name || 'Item') + ' × ' + esc(String(lastRemovedBillItem.qty || 1)) + '</span><button class="btn-s" type="button" onclick="undoRemoveBillRow()"><i class="ti ti-arrow-back-up"></i> Undo</button>';
  }

  function buildBillRowHtml(item, qty) {
    item = item || {};
    qty = qty == null ? 1 : qty;
    var kindLabel = item.kind === 'consumable' ? 'Consumable' : 'Medication';
    return '<tr data-bill-key="' + esc(item.key || '') + '" data-bill-code="' + esc(item.code || '') + '" data-bill-kind="' + esc(item.kind || '') + '" data-bill-category="' + esc(item.category || '') + '" data-bill-unit-label="' + esc(item.unit || '') + '" data-bill-stock-known="' + (item.hasStockCount ? '1' : '0') + '" data-bill-stock-qty="' + esc(item.hasStockCount ? item.stockQty : '') + '" data-bill-name="' + esc(item.name || '') + '">' +
      '<td>' +
        '<button class="bill-row-link" type="button" onclick="openBillItemDetails(\'' + String(item.key || '').replace(/'/g, "\'") + '\')">' +
          '<div class="bill-item-name">' + esc(item.name || '') + '</div>' +
          '<div class="bill-item-meta"><span class="bill-history-type">' + esc(kindLabel) + '</span> ' + esc(item.code || '—') + (item.unit ? ' · ' + esc(item.unit) : '') + ' · ' + esc(moneyRwf(item.price)) + '</div>' +
        '</button>' +
        '<div class="bill-row-warning" data-bill="warning"></div>' +
        '<input type="hidden" data-bill="price" value="' + esc(item.price) + '"><input type="hidden" data-bill="name" value="' + esc(item.name || '') + '">' +
      '</td>' +
      '<td><input class="fi bill-qty-input qty" type="number" data-bill="qty" min="1" value="' + esc(qty) + '" oninput="calcBill()"></td>' +
      '<td class="row-total" style="font-weight:700;text-align:right;">' + esc(moneyRwf(item.price * qty)) + '</td>' +
      '<td style="text-align:center;"><button class="del bill-remove-btn" type="button" onclick="removeBillRow(this)"><i class="ti ti-trash"></i></button></td>' +
    '</tr>';
  }

  function ensureBillRows() {
    var tb = document.getElementById('billRows');
    if (!tb) return;
    if (!tb.querySelector('tr[data-bill-key]')) tb.innerHTML = '<tr><td colspan="4" class="empty" style="text-align:center;padding:26px 14px;color:var(--tm);">No items yet — pick a medication or consumable above</td></tr>';
    calcBill();
  }

  function insertBillItem(item, qty, silent) {
    if (!item) return;
    var tb = document.getElementById('billRows');
    if (!tb) return;
    var existing = tb.querySelector('tr[data-bill-key="' + esc(item.key) + '"]');
    if (existing) {
      var qtyField = existing.querySelector('[data-bill="qty"]');
      var current = parseFloat((qtyField || {}).value) || 0;
      if (qtyField) qtyField.value = current + (Number(qty) || 1);
    } else {
      var empty = tb.querySelector('td[colspan="4"]');
      if (empty && empty.parentNode) empty.parentNode.remove();
      tb.insertAdjacentHTML('beforeend', buildBillRowHtml(item, qty || 1));
    }
    calcBill();
    renderBillCatalogPreview(item.key);
    if (!silent) safeToast('➕ Added ' + item.name + ' to bill.', 'success');
  }

  function addBillItemFromCatalog(itemKey, qty) {
    var item = findCatalogItem(itemKey);
    if (!item) return safeToast('⚠️ Selected item was not found in the common-server catalogue.', 'warning');
    insertBillItem(item, qty || 1);
  }

  function confirmBillPreviewAdd() {
    var item = activeBillPreviewKey ? findCatalogItem(activeBillPreviewKey) : null;
    if (!item) return safeToast('⚠️ Choose an item first.', 'warning');
    var qty = parseInt(((document.getElementById('billPreviewQty') || {}).value || '1'), 10) || 1;
    addBillItemFromCatalog(item.key, qty);
  }

  function addBillRow() {
    safeToast('ℹ️ Use the service list above to add saved medications or consumables.', 'info');
    renderBillCatalog();
  }

  function rowToBillSnapshot(row) {
    if (!row) return null;
    return {
      item: {
        key: row.getAttribute('data-bill-key') || '',
        code: row.getAttribute('data-bill-code') || '',
        name: row.getAttribute('data-bill-name') || ((row.querySelector('[data-bill="name"]') || {}).value || ''),
        category: row.getAttribute('data-bill-category') || '',
        unit: row.getAttribute('data-bill-unit-label') || '',
        kind: row.getAttribute('data-bill-kind') || 'medication',
        price: parseFloat((row.querySelector('[data-bill="price"]') || {}).value) || 0,
        hasStockCount: row.getAttribute('data-bill-stock-known') === '1',
        stockQty: inventoryNumber(row.getAttribute('data-bill-stock-qty'))
      },
      qty: parseFloat((row.querySelector('[data-bill="qty"]') || {}).value) || 1
    };
  }

  function removeBillRow(btn) {
    var row = btn && btn.closest ? btn.closest('tr') : null;
    if (!row) return;
    lastRemovedBillItem = rowToBillSnapshot(row);
    row.remove();
    renderBillUndoBar();
    ensureBillRows();
    calcBill();
    if (lastRemovedBillItem && lastRemovedBillItem.item) safeToast('🗑 Removed ' + lastRemovedBillItem.item.name + '. Undo is available.', 'info');
  }

  function undoRemoveBillRow() {
    if (!lastRemovedBillItem || !lastRemovedBillItem.item) return;
    insertBillItem(lastRemovedBillItem.item, lastRemovedBillItem.qty || 1, true);
    safeToast('↩️ Restored ' + lastRemovedBillItem.item.name, 'success');
    lastRemovedBillItem = null;
    renderBillUndoBar();
  }

  function calcBill() {
    syncBillRowsFromCatalog();
    var rows = document.querySelectorAll('#billRows tr[data-bill-key]');
    var sub = 0;
    var medicationSub = 0;
    var consumableSub = 0;
    rows.forEach(function (r) {
      var qty = parseFloat((r.querySelector('[data-bill="qty"]') || {}).value) || 0;
      var unit = parseFloat((r.querySelector('[data-bill="price"]') || {}).value) || 0;
      var tot = Math.round(qty * unit);
      var td = r.querySelector('.row-total');
      if (td) td.textContent = moneyRwf(tot);
      var kind = String(r.getAttribute('data-bill-kind') || 'medication');
      if (kind === 'consumable') consumableSub += tot;
      else medicationSub += tot;
      var rowItem = {
        hasStockCount: r.getAttribute('data-bill-stock-known') === '1',
        stockQty: inventoryNumber(r.getAttribute('data-bill-stock-qty'))
      };
      var state = billStockState(rowItem, qty);
      var warn = r.querySelector('[data-bill="warning"]');
      if (warn) {
        warn.className = 'bill-row-warning ' + state.badgeClass;
        warn.textContent = state.detail;
      }
      r.classList.remove('bill-row-low', 'bill-row-out', 'bill-row-warning');
      if (state.severity === 'low') r.classList.add('bill-row-low');
      if (state.severity === 'out') r.classList.add('bill-row-out');
      if (state.severity === 'warning') r.classList.add('bill-row-warning');
      sub += tot;
    });
    var paymentMode = ((document.getElementById('billPayment') || {}).value || 'Cash');
    var coverPercent = typeof window.getCoverPercent === 'function' ? window.getCoverPercent(paymentMode) : 0;
    var coverPercentDisplay = Math.round(coverPercent * 100);
    var insuranceCover = Math.round(sub * coverPercent);
    var patientPays = sub - insuranceCover;
    var coverField = document.getElementById('billCoverPercent');
    if (coverField) coverField.value = coverPercentDisplay + '%';
    var medEl = document.getElementById('billMedicationSub'); if (medEl) medEl.textContent = moneyRwf(medicationSub);
    var consEl = document.getElementById('billConsumableSub'); if (consEl) consEl.textContent = moneyRwf(consumableSub);
    var subEl = document.getElementById('billSub'); if (subEl) subEl.textContent = moneyRwf(sub);
    var insEl = document.getElementById('billInsurance'); if (insEl) insEl.textContent = '-' + moneyRwf(insuranceCover);
    var totalEl = document.getElementById('billTotal'); if (totalEl) totalEl.textContent = moneyRwf(patientPays);
    renderBillStockLive();
    renderBillUndoBar();
    if (activeBillPreviewKey) updateBillPreviewWarning();
  }

  function clearBill() {
    var tb = document.getElementById('billRows');
    if (tb) tb.innerHTML = '';
    var ward = document.getElementById('billWard');
    if (ward) ward.value = getCurrentPatient() ? displayLocation(getCurrentPatient()) : '';
    lastRemovedBillItem = null;
    renderBillUndoBar();
    ensureBillRows();
    renderBillCatalog();
    renderBillCatalogPreview(activeBillPreviewKey || '');
  }

  function renderBillCatalog() {
    syncBillRowsFromCatalog();
    var host = billCatalogHost();
    var meta = document.getElementById('billCatalogMeta');
    if (!host) return [];
    var q = ((document.getElementById('billCatalogSearch') || {}).value || '');
    var allItems = pharmacyBillingCatalog();
    var items = allItems.filter(function (item) {
      var kindOk = billKindFilter === 'all' || item.kind === billKindFilter;
      return kindOk && billCatalogMatches(item, q);
    });
    var low = items.filter(function (item) { return billStockState(item).severity === 'low'; }).length;
    var out = items.filter(function (item) { return billStockState(item).severity === 'out'; }).length;
    if (meta) meta.textContent = items.length + ' saved priced item' + (items.length === 1 ? '' : 's') + ' from the common server · ' + low + ' low stock · ' + out + ' out of stock';
    if (!items.length) {
      host.innerHTML = '<div class="empty">No saved priced items match this filter.<br><span style="font-size:11px;">Admin → Pharmacy can add medications or consumables with prices.</span></div>';
      renderBillStockLive();
      return items;
    }
    host.innerHTML = items.map(function (item) {
      var selected = selectedBillQtyForItem(item.key);
      return '<div class="svc-item' + (activeBillPreviewKey === item.key ? ' active' : '') + '" onclick="openBillItemDetails(\'' + String(item.key).replace(/'/g, "\'") + '\')">' +
        '<span>' +
          '<span class="n">' + esc(item.name) + '</span><br>' +
          '<span class="c">' + esc(item.code || '—') + ' · ' + esc(item.unit || '—') + ' · ' + esc(item.kind === 'consumable' ? 'Consumable' : 'Medication') + ' · ' + billStockBadge(item, selected) + (selected ? ' <span class="bill-in-cart-badge">In bill ' + esc(String(selected)) + '</span>' : '') + '</span>' +
        '</span>' +
        '<span class="p">' + esc(moneyRwf(item.price)) + '</span>' +
      '</div>';
    }).join('');
    renderBillStockLive();
    if (activeBillPreviewKey && !findCatalogItem(activeBillPreviewKey)) activeBillPreviewKey = '';
    if (activeBillPreviewKey) renderBillCatalogPreview(activeBillPreviewKey);
    return items;
  }

  function renderBillHistory() {
    var container = document.getElementById('billList') || document.getElementById('billHistoryList');
    var meta = document.getElementById('billRecentMeta');
    if (!container) return;
    var list = recentBillRecords().filter(function (bill) {
      return billHistoryFilter === 'all' || normalizeBillStatus(bill.status) === billHistoryFilter;
    }).slice(0, 25);
    if (meta) meta.textContent = list.length ? 'Latest common-server bills' : 'No bills for this filter yet';
    if (!list.length) {
      container.innerHTML = '<div class="empty">No bills yet</div>';
      updateBillCount();
      return;
    }
    container.innerHTML = '';
    list.forEach(function (bill) {
      var d = document.createElement('div');
      d.className = 'bill-row';
      var left = document.createElement('div');
      left.innerHTML = '<div style="font-weight:600;font-size:12.5px"></div><div style="font-size:10.5px;color:var(--tm);margin-top:2px"></div>';
      left.children[0].textContent = String(bill.number || 'INV') + ' · ' + String(bill.patientName || '—');
      left.children[1].textContent = new Date(ms(bill.createdAt) || Date.now()).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) + ' · ' + ((bill.items || []).length) + ' item' + (((bill.items || []).length) === 1 ? '' : 's');
      var right = document.createElement('div');
      right.style.cssText = 'text-align:right;display:flex;flex-direction:column;gap:4px;align-items:flex-end';
      var amt = document.createElement('div');
      amt.style.cssText = 'font-weight:700;font-size:13px';
      amt.textContent = moneyRwf(bill.total || 0);
      var bg = document.createElement('span');
      bg.className = 'badge b-' + normalizeBillStatus(bill.status);
      bg.textContent = normalizeBillStatus(bill.status);
      right.append(amt, bg);
      d.append(left, right);
      d.style.cursor = 'pointer';
      d.onclick = function () { openRecentBill(bill.id); };
      container.appendChild(d);
    });
    updateBillCount();
  }

  function updateBillCount() {
    var countEl = document.getElementById('billHistoryCount');
    if (!countEl) return;
    var total = recentBillRecords().filter(function (bill) {
      return billHistoryFilter === 'all' || normalizeBillStatus(bill.status) === billHistoryFilter;
    }).length;
    countEl.textContent = total + ' bill' + (total === 1 ? '' : 's');
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
    if (!patientHasSavedVitals(patient)) return safeToast('⚠️ Save vital signs first before opening or saving Triage.', 'warning');
    if (typeof window.updatePatient !== 'function') return safeToast('❌ Secure triage saving is not available on this page.', 'error');

    var assessment = triageAssessment(patient);
    if (!assessment.level) return safeToast('⚠️ No triage category is ready yet.', 'warning');

    var vital = assessment.base.vitals || {};
    var entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      date: nowIso(),
      at: nowIso(),
      timestamp: nowIso(),
      level: assessment.level,
      color: assessment.color,
      label: assessment.info.label,
      priority: assessment.priority,
      chiefComplaint: assessment.conditions.length ? assessment.conditions.map(function (c) { return c.label; }).join(', ') : 'Vitals-based triage',
      basedOnVitalId: vital.id || '',
      basedOnVitals: {
        temperature: vital.temperature != null ? vital.temperature : vital.temp,
        pulse: vital.pulse != null ? vital.pulse : null,
        respiratoryRate: vital.respiratoryRate != null ? vital.respiratoryRate : vital.rr,
        spo2: vital.spo2 != null ? vital.spo2 : null,
        bpSystolic: vital.bpSystolic != null ? vital.bpSystolic : null,
        bpDiastolic: vital.bpDiastolic != null ? vital.bpDiastolic : null,
        bp: vital.bp || '',
        painScore: vital.painScore != null ? vital.painScore : null
      },
      interpretedFromVitals: assessment.base.reasons.slice(),
      emergencyConditions: assessment.conditions.map(function (c) {
        return { id: c.id, label: c.label, level: c.level };
      }),
      triagedBy: currentStaffName(),
      triagedById: getStaff() ? getStaff().staffId : '',
      notes: assessment.reasons.join(' • ')
    };

    var next = Array.isArray(patient.triage) ? patient.triage.slice() : [];
    next.push(entry);
    var triageCategory = {
      level: assessment.level,
      color: assessment.color,
      label: assessment.info.label,
      priority: assessment.priority,
      reasons: assessment.reasons.slice(),
      emergencyConditions: assessment.conditions.map(function (c) { return c.label; }),
      basedOnVitalId: vital.id || '',
      savedAt: entry.timestamp,
      savedBy: currentStaffName()
    };

    safeToast('⏳ Saving triage category to the Common Server…', 'info');
    var saved = await window.updatePatient(patient.id, {
      triage: next,
      priority: assessment.priority,
      triageLevel: assessment.level,
      triageColor: assessment.color,
      triageLabel: assessment.info.label,
      triageCategory: triageCategory,
      triagedAt: entry.timestamp
    });
    if (!saved) return safeToast('❌ Triage was NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, clearTriage);
    safeToast('✅ Triage category saved for ' + displayName(saved) + ' — ' + assessment.info.label, 'success');
  }
  function clearTriage() {
    clearTriageSelections();
    renderTriagePanel(getCurrentPatient());
  }
  function selectTriage() {
    updateTriagePreview();
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
    syncCpnComputedFields(patient);
    var pregnancies = cpnFieldValue('cpnPregnancies');
    var lmp = cpnFieldValue('cpnLmp');
    var gestationalAge = cpnFieldValue('cpnGestAge');
    var edd = cpnFieldValue('cpnEdd');
    var rdv = cpnFieldValue('cpnRdv');
    var quickening = cpnFieldValue('cpnQuickening');
    var fundalHeight = cpnFieldValue('cpnFundalHeight');
    var ttDose = cpnFieldValue('cpnTtDose');
    var assessment = cpnFieldValue('cpnAssessment');
    var notes = cpnFieldValue('cpnNotes');
    if (!pregnancies && !lmp && !rdv && !quickening && !fundalHeight && !ttDose && !assessment && !notes) {
      return safeToast('⚠️ Please fill in the ANC / CPN visit details first.', 'warning');
    }
    var entry = {
      id: Date.now(),
      type: 'anc-cpn',
      timestamp: cpnFieldValue('cpnDateTime') || nowIso(),
      visitNumber: cpnFieldValue('cpnVisitNumber') || String(ancVisitCount(patient) + 1),
      pregnancies: pregnancies,
      lmp: lmp,
      gestationalAge: gestationalAge,
      edd: edd,
      rdv: rdv,
      quickening: quickening,
      fundalHeight: fundalHeight,
      ttDose: ttDose,
      assessment: assessment,
      notes: notes,
      nurse: ((document.getElementById('cpnNurse') || {}).value || currentStaffName()),
      location: ((document.getElementById('cpnLocation') || {}).value || displayLocation(patient))
    };
    safeToast('⏳ Saving ANC / CPN visit to the Common Server…', 'info');
    var saved = await appendPatientHistory('cpnHistory', entry);
    if (!saved) return safeToast('❌ ANC / CPN visit was NOT saved. Please retry.', 'error');
    refreshAfterSave(saved, clearCPN);
    safeToast('✅ ANC / CPN visit saved for ' + displayName(saved), 'success');
  }
  function clearCPN() {
    cpnPreviewRecordId = null;
    ['cpnPregnancies', 'cpnLmp', 'cpnGestAge', 'cpnEdd', 'cpnRdv', 'cpnQuickening', 'cpnFundalHeight', 'cpnTtDose', 'cpnAssessment', 'cpnNotes'].forEach(function (id) {
      var el = document.getElementById(id); if (!el) return; if (el.tagName === 'SELECT') el.value = ''; else el.value = '';
    });
    fillForms(getCurrentPatient());
    syncCpnComputedFields(getCurrentPatient());
    renderCpnDocPreview(getCurrentPatient());
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

  function nursingNoteSummary(note) {
    if (!note) return '';
    var body = String(note.note || note.body || '').trim();
    if (body) return body;
    var parts = [];
    if (note.subjective) parts.push(note.subjective);
    if (note.objective) parts.push(note.objective);
    if (note.plan) parts.push(note.plan);
    if (note.education) parts.push(note.education);
    return parts.join('\n\n').trim();
  }

  function nursingNoteStatusClass(status) {
    var s = String(status || 'Stable').toLowerCase();
    if (s === 'improved') return 'improved';
    if (s === 'deteriorated') return 'deteriorated';
    if (s === 'transferred') return 'transferred';
    if (s === 'discharged') return 'discharged';
    return 'stable';
  }

  function notesComposerCard() {
    return document.getElementById('notesComposerCard');
  }

  function openNewNursingNote() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) {
      safeToast('⚠️ Please select a patient first', 'warning');
      focusPatientSearch();
      return;
    }
    var card = notesComposerCard();
    if (card) card.hidden = false;
    clearNursingNote();
    var body = document.getElementById('notesBody');
    if (body) setTimeout(function () { body.focus(); }, 40);
  }

  function carePlanComposerCard() {
    return document.getElementById('careplanComposerCard');
  }

  function openNewCarePlan() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) {
      safeToast('⚠️ Please select a patient first', 'warning');
      focusPatientSearch();
      return;
    }
    var card = carePlanComposerCard();
    if (card) card.hidden = false;
    clearCarePlan();
    var body = document.getElementById('cpBody');
    if (body) setTimeout(function () { body.focus(); }, 40);
  }

  function carePlanStatusClass(status) {
    var s = String(status || 'Active').toLowerCase();
    if (s === 'achieved') return 'achieved';
    if (s === 'discontinued') return 'discontinued';
    return 'active';
  }

  function updateCarePlanCount(patient) {
    var countEl = document.getElementById('cpCount');
    if (!countEl) return;
    var total = Array.isArray(patient && patient.carePlans) ? patient.carePlans.length : 0;
    countEl.textContent = total + ' plan' + (total !== 1 ? 's' : '');
  }

  function carePlanSummary(plan) {
    if (!plan) return '';
    if (String(plan.body || '').trim()) return String(plan.body || '').trim();
    var parts = [];
    if (plan.problem) parts.push(plan.problem);
    if (plan.goals) parts.push('Goals: ' + plan.goals);
    if (plan.interventions) parts.push('Interventions: ' + plan.interventions);
    return parts.join('\n\n').trim();
  }

  function renderCarePlanHistory(patient) {
    patient = patient || refreshCurrentPatientFromStore();
    var container = document.getElementById('cpHistoryList');
    if (!container) return;
    var plans = Array.isArray(patient && patient.carePlans) ? patient.carePlans.slice() : [];
    updateCarePlanCount(patient);
    if (!plans.length) {
      container.innerHTML = '<div class="nurse-lab-empty" style="padding:26px;">📋 No nursing care plans yet on the Common Server.<div style="margin-top:12px;"><button class="btn-p notes-simple-add-btn" type="button" onclick="openNewCarePlan()"><i class="ti ti-plus"></i> Add New Care Plan</button></div></div>';
      return;
    }
    plans.sort(function (a, b) { return ms(b && (b.timestamp || b.at || b.date || b.evalDate)) - ms(a && (a.timestamp || a.at || a.date || a.evalDate)); });
    container.innerHTML = plans.map(function (cp) {
      var status = String(cp.status || 'Active');
      var summary = carePlanSummary(cp) || '—';
      return '<div class="notes-simple-entry">' +
        '<div class="notes-simple-entry-head">' +
          '<div class="notes-simple-entry-meta"><b>' + esc(cp.by || currentStaffName()) + '</b><br>' + esc(fmtDateTime(cp.timestamp || cp.at || cp.date || cp.evalDate)) + '</div>' +
          '<span class="notes-simple-status ' + carePlanStatusClass(status) + '">' + esc(status) + '</span>' +
        '</div>' +
        '<div class="notes-simple-entry-note">' + esc(summary) + '</div>' +
        '<div class="notes-simple-entry-foot">📅 Evaluation: ' + esc(cp.evalDate || '—') + '</div>' +
      '</div>';
    }).join('');
  }

  function openNursingNoteFromCarePlan() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) {
      safeToast('⚠️ Please select a patient first', 'warning');
      focusPatientSearch();
      return;
    }
    var notesBtn = document.querySelector('[data-tab="notes"]');
    if (typeof window.switchTab === 'function') window.switchTab('notes', notesBtn);
    if (typeof window.switchSub === 'function') window.switchSub('notes-form');
    openNewNursingNote();
    safeToast('📝 Nursing Notes opened from Care Plan for ' + displayName(patient), 'info');
  }

  function closeNewNursingNote() {
    var card = notesComposerCard();
    if (card) card.hidden = true;
    clearNursingNote();
  }

  function closeNewCarePlan() {
    var card = carePlanComposerCard();
    if (card) card.hidden = true;
    clearCarePlan();
  }

  function renderNursingNotes(patient) {
    var container = document.getElementById('nursingNotesList');
    if (!container) return;
    var notes = Array.isArray(patient && patient.nursingNotes) ? patient.nursingNotes.slice() : [];
    if (!notes.length) {
      container.innerHTML = '<div class="nurse-lab-empty" style="padding:26px;">📋 No nursing notes yet on the Common Server.<div style="margin-top:12px;"><button class="btn-p notes-simple-add-btn" type="button" onclick="openNewNursingNote()"><i class="ti ti-plus"></i> Add New Note</button></div></div>';
      return;
    }
    notes.sort(function (a, b) { return ms(b && (b.timestamp || b.date)) - ms(a && (a.timestamp || a.date)); });
    container.innerHTML = notes.map(function (note) {
      var status = String(note.status || 'Stable');
      var summary = nursingNoteSummary(note) || '—';
      return '<div class="notes-simple-entry">' +
        '<div class="notes-simple-entry-head">' +
          '<div class="notes-simple-entry-meta"><b>' + esc(note.nurse || currentStaffName()) + '</b><br>' + esc(fmtDateTime(note.timestamp || note.date)) + '</div>' +
          '<span class="notes-simple-status ' + nursingNoteStatusClass(status) + '">' + esc(status) + '</span>' +
        '</div>' +
        '<div class="notes-simple-entry-note">' + esc(summary) + '</div>' +
        '<div class="notes-simple-entry-foot">📍 ' + esc(note.ward || displayLocation(patient) || 'General') + '</div>' +
      '</div>';
    }).join('');
  }

  function updateNursingNoteCount(patient) {
    var countEl = document.getElementById('nursingNoteCount');
    if (!countEl) return;
    var total = Array.isArray(patient && patient.nursingNotes) ? patient.nursingNotes.length : 0;
    countEl.textContent = total + ' note' + (total !== 1 ? 's' : '');
  }

  async function saveNursingNote() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var body = ((document.getElementById('notesBody') || {}).value || '').trim();
    if (!body) return safeToast('⚠️ Please write the nursing note first', 'warning');
    var stamp = ((document.getElementById('notesDateTime') || {}).value || '').trim();
    var entry = {
      id: Date.now(),
      timestamp: stamp || nowIso(),
      date: stamp || nowIso(),
      note: body,
      body: body,
      subjective: body,
      objective: '',
      plan: '',
      education: '',
      status: ((document.getElementById('notesStatus') || {}).value || 'Stable'),
      nurse: ((document.getElementById('notesNurse') || {}).value || currentStaffName()),
      ward: displayLocation(patient),
      source: 'nurse-notes-simple'
    };
    safeToast('⏳ Saving nursing note to the Common Server…', 'info');
    var saved = await appendPatientHistory('nursingNotes', entry);
    if (!saved) return safeToast('❌ Nursing note was NOT saved. Please retry.', 'error');
    clearNursingNote();
    var card = notesComposerCard();
    if (card) card.hidden = true;
    refreshPatientUi(saved, true);
    renderNursingNotes(saved);
    updateNursingNoteCount(saved);
    var history = document.getElementById('nursingNotesList');
    if (history && typeof history.scrollIntoView === 'function') {
      try { history.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { history.scrollIntoView(); }
    }
    safeToast('✅ Nursing note saved for ' + displayName(saved), 'success');
  }
  function clearNursingNote() {
    var body = document.getElementById('notesBody'); if (body) body.value = '';
    var status = document.getElementById('notesStatus'); if (status) status.value = 'Stable';
    var dateTime = document.getElementById('notesDateTime'); if (dateTime) dateTime.value = nowLocalValue();
    if (typeof window.fillForms === 'function') fillForms(getCurrentPatient());
  }

  function collectBillRows() {
    var rows = document.querySelectorAll('#billRows tr[data-bill-key]');
    var items = [];
    rows.forEach(function (row) {
      var key = String(row.getAttribute('data-bill-key') || '');
      var code = String(row.getAttribute('data-bill-code') || '');
      var kind = String(row.getAttribute('data-bill-kind') || 'medication');
      var category = String(row.getAttribute('data-bill-category') || 'Other');
      var unitLabel = String(row.getAttribute('data-bill-unit-label') || '');
      var stockKnown = row.getAttribute('data-bill-stock-known') === '1';
      var stockQty = inventoryNumber(row.getAttribute('data-bill-stock-qty'));
      var name = String(((row.querySelector('[data-bill="name"]') || {}).value || '')).trim();
      var qty = parseFloat((row.querySelector('[data-bill="qty"]') || {}).value) || 0;
      var unit = parseFloat((row.querySelector('[data-bill="price"]') || {}).value) || 0;
      if (name && qty > 0 && unit > 0) {
        items.push({
          key: key,
          code: code,
          name: name,
          description: name,
          type: kind,
          category: category,
          unitLabel: unitLabel,
          quantity: qty,
          qty: qty,
          unitPrice: unit,
          price: unit,
          total: Math.round(qty * unit),
          stockKnown: stockKnown,
          stockQty: stockQty,
          stockState: billStockState({ hasStockCount: stockKnown, stockQty: stockQty }, qty).severity,
          source: 'pharmacy-catalog'
        });
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
    var medicationSubtotal = items.filter(function (item) { return String(item.type || '').toLowerCase() !== 'consumable'; }).reduce(function (sum, item) { return sum + (item.total || 0); }, 0);
    var consumableSubtotal = items.filter(function (item) { return String(item.type || '').toLowerCase() === 'consumable'; }).reduce(function (sum, item) { return sum + (item.total || 0); }, 0);
    var paymentMode = ((document.getElementById('billPayment') || {}).value || 'Cash');
    var coverPercent = typeof window.getCoverPercent === 'function' ? window.getCoverPercent(paymentMode) : 0;
    var insuranceCover = Math.round(totalBill * coverPercent);
    var patientPays = totalBill - insuranceCover;
    var sharedBill = null;
    try {
      if (window.pcBilling && typeof window.pcBilling.create === 'function') {
        sharedBill = window.pcBilling.create({
          patientId: patient.id,
          patientName: displayName(patient),
          items: items.map(function (item) {
            return { code: item.code || '', name: item.description || item.name || 'Item', qty: item.quantity || item.qty || 1, price: item.unitPrice || item.price || 0 };
          }),
          patientPayPercent: Math.max(0, Math.min(100, Math.round((1 - coverPercent) * 100))),
          insurance: { provider: paymentMode, patientPayPercent: Math.max(0, Math.min(100, Math.round((1 - coverPercent) * 100))) },
          source: 'nurse-billing'
        });
      }
    } catch (e) {
      console.warn('pcBilling.create failed', e);
    }
    var entry = {
      id: Date.now(),
      timestamp: nowIso(),
      items: items,
      total: totalBill,
      medicationSubtotal: medicationSubtotal,
      consumableSubtotal: consumableSubtotal,
      paymentMode: paymentMode,
      coverPercent: coverPercent,
      insuranceCover: insuranceCover,
      patientPays: patientPays,
      ward: ((document.getElementById('billWard') || {}).value || displayLocation(patient)),
      nurse: ((document.getElementById('billNurse') || {}).value || currentStaffName()),
      date: ((document.getElementById('billDate') || {}).value || todayIso()),
      status: sharedBill ? sharedBill.status : 'Posted',
      sharedBillId: sharedBill ? sharedBill.id : null,
      sharedBillNumber: sharedBill ? sharedBill.number : null,
      sharedBillStatus: sharedBill ? sharedBill.status : null,
      sharedBillCreatedAt: sharedBill ? sharedBill.createdAt : null,
      sharedBillTotal: sharedBill ? sharedBill.total : null,
      sharedBillGrossTotal: sharedBill ? sharedBill.grossTotal : null
    };
    safeToast(sharedBill ? '⏳ Creating bill and sending it to cashier…' : '⏳ Posting bill to the Common Server…', 'info');
    var saved = await appendPatientHistory('billingHistory', entry);
    if (!saved) return safeToast('❌ Bill was NOT posted. Please retry.', 'error');
    refreshAfterSave(saved, clearBill);
    renderBillHistory();
    safeToast('✅ Bill created for ' + displayName(saved) + ' - Total: RWF ' + totalBill.toLocaleString() + ' | Patient pays: RWF ' + patientPays.toLocaleString(), 'success');
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

  function clearCarePlan() {
    ['cpBody', 'cpProblem', 'cpGoals', 'cpInterventions', 'cpEvalDate', 'cpDateTime'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var status = document.getElementById('cpStatus');
    if (status) status.value = 'Active';
    if (typeof window.fillForms === 'function') fillForms(getCurrentPatient());
  }

  async function saveCarePlan() {
    var patient = refreshCurrentPatientFromStore();
    if (!patient) return safeToast('⚠️ Please select a patient first', 'warning');
    var body = ((document.getElementById('cpBody') || {}).value || '').trim();
    if (!body) return safeToast('⚠️ Please write the care plan first', 'warning');
    var stamp = ((document.getElementById('cpDateTime') || {}).value || '').trim();
    var evalDate = stamp ? String(stamp).slice(0, 10) : '';
    var firstLine = body.split(/\n+/).map(function (line) { return String(line || '').trim(); }).filter(Boolean)[0] || body;
    var problemEl = document.getElementById('cpProblem'); if (problemEl) problemEl.value = firstLine;
    var goalsEl = document.getElementById('cpGoals'); if (goalsEl) goalsEl.value = '';
    var interventionsEl = document.getElementById('cpInterventions'); if (interventionsEl) interventionsEl.value = body;
    var evalDateEl = document.getElementById('cpEvalDate'); if (evalDateEl) evalDateEl.value = evalDate;
    var entry = {
      id: 'CP-' + Date.now(),
      timestamp: stamp || nowIso(),
      date: stamp || nowIso(),
      at: stamp || nowIso(),
      problem: firstLine,
      goals: '',
      interventions: body,
      body: body,
      evalDate: evalDate,
      status: ((document.getElementById('cpStatus') || {}).value || 'Active'),
      by: ((document.getElementById('cpNurse') || {}).value || currentStaffName()),
      source: 'nurse-careplan-simple'
    };
    safeToast('⏳ Saving care plan to the Common Server…', 'info');
    var saved = await appendPatientHistory('carePlans', entry);
    if (!saved) return safeToast('❌ Care plan was NOT saved. Please retry.', 'error');
    clearCarePlan();
    var card = carePlanComposerCard();
    if (card) card.hidden = true;
    refreshPatientUi(saved, true);
    renderCarePlanHistory(saved);
    updateCarePlanCount(saved);
    var history = document.getElementById('cpHistoryList');
    if (history && typeof history.scrollIntoView === 'function') {
      try { history.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { history.scrollIntoView(); }
    }
    safeToast('✅ Care plan saved for ' + displayName(saved), 'success');
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

  function openLabResultsTab(btn) {
    var tabBtn = btn && btn.nodeType === 1 ? btn : document.querySelector('[data-tab="lab"]');
    if (typeof window.switchTab === 'function') window.switchTab('lab', tabBtn);
    if (typeof window.switchSub === 'function') window.switchSub('lab-view');
    renderLabResults();
    var panel = document.getElementById('panel-lab');
    if (panel && typeof panel.scrollIntoView === 'function') {
      try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { panel.scrollIntoView(); }
    }
  }

  function openLabResultsFlowSheet(patient) {
    var selectedPatient = patient || refreshCurrentPatientFromStore();
    if (!selectedPatient) return safeToast('⚠️ Please select a patient first', 'warning');
    try {
      var freshPatients = JSON.parse(localStorage.getItem('pclinic_patients') || '[]');
      var fresh = freshPatients.find(function (p) { return String(p.id) === String(selectedPatient.id); });
      if (fresh) {
        selectedPatient = fresh;
        setCurrentPatient(fresh);
      }
    } catch (e) {}
    try {
      localStorage.setItem('pclinic_lab_patient_data', JSON.stringify({
        id: selectedPatient.id,
        firstName: selectedPatient.firstName || '',
        lastName: selectedPatient.lastName || '',
        mrn: selectedPatient.mrn || '',
        labRequests: Array.isArray(selectedPatient.labRequests) ? selectedPatient.labRequests : [],
        labResults: Array.isArray(selectedPatient.labResults) ? selectedPatient.labResults : []
      }));
    } catch (e) {}
    openLabResultsTab(document.querySelector('[data-tab="lab"]'));
    var resultsBox = document.getElementById('labResultsList');
    if (resultsBox && typeof resultsBox.scrollIntoView === 'function') {
      try { resultsBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { resultsBox.scrollIntoView(); }
    }
    safeToast('📊 Lab results are shown inside the Nurse dashboard for ' + displayName(selectedPatient), 'info');
  }

  function renderLabRequests(patient) {
    patient = patient || refreshCurrentPatientFromStore();
    var container = document.getElementById('labRequestsList');
    var count = document.getElementById('labRequestCount');
    var filterEl = document.getElementById('labRequestStatusFilter');
    if (!container) return;

    if (!patient) {
      container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--tm);font-size:12px;">🔒 No patient selected.</p>';
      if (count) count.textContent = '0 requests';
      return;
    }
    try {
      var pts = JSON.parse(localStorage.getItem('pclinic_patients') || '[]');
      var fresh = pts.find(function (x) { return String(x.id) === String(patient.id); });
      if (fresh) patient = fresh;
    } catch (e) {}

    var requests = Array.isArray(patient.labRequests) ? patient.labRequests : [];
    var filter = filterEl ? filterEl.value : 'all';
    var pid = String(patient.id || '').replace(/^MOD-/i, '');
    var realOrders = [];
    try {
      realOrders = JSON.parse(localStorage.getItem('pclinic_orders') || '[]').filter(function (o) {
        return String(o.patientId || '').replace(/^MOD-/i, '') === pid && (o.type === 'lab' || o.dept === 'lab');
      });
    } catch (e) {}

    function liveStatus(req) {
      if (req.status === 'Cancelled' || req.status === 'cancelled') return 'cancelled';
      var reqTests = (Array.isArray(req.tests) ? req.tests : []).map(function (t) { return String(t).toLowerCase(); });
      for (var i = 0; i < realOrders.length; i++) {
        var o = realOrders[i];
        var items = (o.items || []).map(function (it) { return String(it.name || '').toLowerCase(); });
        var anyMatch = reqTests.some(function (rt) { return items.some(function (it) { return it.indexOf(rt) !== -1 || rt.indexOf(it) !== -1; }); });
        if (anyMatch) {
          if (o.status === 'completed' || o.status === 'Completed') return 'completed';
          if (o.status === 'cancelled' || o.status === 'Cancelled') return 'cancelled';
        }
      }
      return 'pending';
    }

    var withStatus = requests.map(function (req) {
      return { req: req, live: liveStatus(req) };
    });
    var filtered = filter === 'all' ? withStatus : withStatus.filter(function (x) { return x.live === filter; });
    if (count) count.textContent = filtered.length + ' request' + (filtered.length !== 1 ? 's' : '');

    if (!filtered.length) {
      container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--tm);font-size:12px;">No lab requests found.</p>';
      return;
    }

    container.innerHTML = filtered.slice().reverse().map(function (x) {
      var req = x.req || {};
      var live = x.live;
      var date = req.timestamp ? new Date(req.timestamp).toLocaleString() : 'No date';
      var tests = req.tests ? req.tests.join(', ') : 'No tests selected';

      var badge = '';
      if (live === 'completed') {
        badge = '<span style="background:#e9f9ee;color:#1a7a32;font-weight:700;font-size:10.5px;padding:3px 10px;border-radius:20px;">✅ Verified by Lab</span>';
      } else if (live === 'cancelled') {
        badge = '<span style="background:#ffebe9;color:#8a1f1a;font-weight:700;font-size:10.5px;padding:3px 10px;border-radius:20px;">❌ Cancelled</span>';
      } else {
        badge = '<span style="background:#fff4e0;color:#7a4500;font-weight:700;font-size:10.5px;padding:3px 10px;border-radius:20px;">⏳ Pending at Lab</span>';
      }

      var actions = '';
      if (live === 'completed') {
        actions = '<button onclick="openLabResultsFlowSheet()" style="background:#eaf2ff;color:#0071e3;border:0.5px solid rgba(0,113,227,0.3);padding:4px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;">📊 View Results</button>';
      } else {
        actions = '<span style="font-size:11px;color:#6e6e73;font-weight:700;">Read-only</span>';
      }

      return '<div style="display:flex;align-items:center;gap:12px;background:#fff;border:0.5px solid rgba(0,0,0,0.1);border-radius:12px;padding:12px 16px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.05);flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:180px;">' +
          '<div style="font-weight:800;color:#1d1d1f;font-size:12.5px;">' + esc(tests) + '</div>' +
          '<div style="font-size:11px;color:#6e6e73;margin-top:2px;">' + esc(req.priority || 'Routine') + ' • ' + esc(req.sampleType || 'N/A') + ' • ' + esc(req.requestedBy || 'Unknown') + '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:#6e6e73;white-space:nowrap;">' + esc(date) + '</div>' +
        badge +
        '<div style="white-space:nowrap;">' + actions + '</div>' +
      '</div>';
    }).join('');
  }


  function nurseLabBaseCategories() {
    return [
      {
        id: 'chem',
        title: '20000 USUAL CHEMISTRY',
        className: 'oc-cat-chem',
        tests: [
          { code: '20001', name: 'UREA/BLOOD', unit: 'mmol/l', range: '3-9.2' },
          { code: '20002', name: 'CREATININE/BLOOD', unit: 'µmol/l', range: '63.6-110.5' },
          { code: '20003', name: 'NA + (SODIUM)/BLOOD', unit: 'mmol/l', range: '135-145' },
          { code: '20004', name: 'K + (POTASSIUM)/BLOOD', unit: 'mmol/l', range: '3.5-5.0' },
          { code: '20005', name: 'MAGNESIUM/BLOOD', unit: 'mmol/l', range: '0.66-1.07' },
          { code: '20006', name: 'CL -(CHLORURE)/BLOOD', unit: 'mmol/l', range: '98-107' },
          { code: '20007', name: 'FASTING GLUCOSE/BLOOD', unit: 'mmol/l', range: '3.9-5.6' },
          { code: '20008', name: 'LIVER FUNCTION (SGPT/ALT)', unit: 'U/l', range: '7-56' },
          { code: '20009', name: 'LIVER FUNCTION (SGOT/AST)', unit: 'U/l', range: '10-40' }
        ]
      },
      {
        id: 'fbc',
        title: '31000 FULL BLOOD COUNT',
        className: 'oc-cat-fbc',
        tests: [
          { code: '31001', name: 'WBC', unit: '10^3/µl', range: '4-10' },
          { code: '31002', name: 'RBC', unit: '10^6/µl', range: '4.5-6.2' },
          { code: '31003', name: 'hemoglobin', unit: 'g/dl', range: '13-17' },
          { code: '31004', name: 'Hct', unit: '%', range: '40-54' },
          { code: '31005', name: 'MCV', unit: 'fL', range: '82-98' },
          { code: '31006', name: 'MCH', unit: 'pg', range: '27-31' },
          { code: '31007', name: 'MCHC', unit: 'g/dl', range: '32-36' },
          { code: '31008', name: 'platelets', unit: '10^3/µl', range: '150-450' },
          { code: '31009', name: 'RDW', unit: '%', range: '11.5-14.5' },
          { code: '31010', name: 'MPV', unit: 'fL', range: '6.9-10.6' },
          { code: '32001', name: 'neutrophiles', unit: '%', range: '40-75' },
          { code: '32002', name: 'lymphocytes', unit: '%', range: '20-40' },
          { code: '32003', name: 'monocytes', unit: '%', range: '2-8' },
          { code: '32004', name: 'eosinophiles', unit: '%', range: '1-4' }
        ]
      },
      {
        id: 'sero',
        title: '40000 SEROLOGY & IMMUNOLOGY',
        className: 'oc-cat-sero',
        tests: [
          { code: '40001', name: 'HIV 1/2 ANTIBODY/AG', unit: '', range: 'Negative' },
          { code: '40002', name: 'HBsAg (HEPATITIS B)', unit: '', range: 'Negative' },
          { code: '40003', name: 'HCV ANTIBODY', unit: '', range: 'Negative' },
          { code: '40004', name: 'SYPHILIS RPR/VDRL', unit: '', range: 'Negative' },
          { code: '40005', name: 'CRP (C-REACTIVE PROTEIN)', unit: 'mg/l', range: '0-5' },
          { code: '40006', name: 'WIDAL TEST (SALMONELLA)', unit: '', range: 'Negative' },
          { code: '40007', name: 'H. PYLORI AG/AB', unit: '', range: 'Negative' }
        ]
      },
      {
        id: 'micro',
        title: '50000 MICROBIOLOGY & CULTURES',
        className: 'oc-cat-mic',
        tests: [
          { code: '50001', name: 'MALARIA PARASITE (MP)', unit: '', range: 'Negative' },
          { code: '50002', name: 'BLOOD CULTURE & SENSITIVITY', unit: '', range: 'No growth' },
          { code: '50003', name: 'URINE CULTURE & SENSITIVITY', unit: '', range: 'No growth' },
          { code: '50004', name: 'STOOL OVA & CYSTS', unit: '', range: 'Negative' }
        ]
      },
      {
        id: 'uri',
        title: '60000 URINALYSIS',
        className: 'oc-cat-uri',
        tests: [
          { code: '60001', name: 'URINE PROTEIN/ALBUMIN', unit: '', range: 'Negative' },
          { code: '60002', name: 'URINE GLUCOSE', unit: '', range: 'Negative' },
          { code: '60003', name: 'URINE KETONES', unit: '', range: 'Negative' },
          { code: '60004', name: 'URINE WBC / LEUKOCYTES', unit: '/HPF', range: '0-5' }
        ]
      }
    ];
  }

  function nurseLabCategories() {
    var categories = JSON.parse(JSON.stringify(nurseLabBaseCategories()));
    try {
      if (!window.pcLabCatalog || typeof window.pcLabCatalog.list !== 'function') return categories;
      var known = {};
      var byId = {};
      categories.forEach(function (c) {
        byId[c.id] = c;
        (c.tests || []).forEach(function (t) { known[String(t.code).toUpperCase()] = true; });
      });
      window.pcLabCatalog.list().forEach(function (ex) {
        var catId = ex.category || 'other';
        var cat = byId[catId];
        if (!cat) {
          cat = {
            id: catId,
            title: String(window.pcLabCatalog.categoryLabel(catId) || catId).toUpperCase(),
            className: 'oc-cat-' + catId,
            color: '#334155',
            tests: []
          };
          byId[catId] = cat;
          categories.push(cat);
        }
        (ex.parameters || []).forEach(function (p) {
          var code = String(p.code || '').toUpperCase();
          if (!code || known[code]) return;
          known[code] = true;
          cat.tests.push({ code: p.code, name: p.name, unit: p.unit || '', range: p.range || '' });
        });
      });
    } catch (e) {}
    return categories;
  }

  function nurseLabStripMod(v) {
    return String(v == null ? '' : v).replace(/^MOD-/i, '').trim();
  }

  function nurseLabOrderedLabel(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return String(entry).trim();
    return String(entry.name || entry.test || entry.orderItemName || entry.code || '').trim();
  }

  function nurseLabOrderedSetLabels(testsOrdered) {
    var out = [];
    (Array.isArray(testsOrdered) ? testsOrdered : []).forEach(function (entry) {
      var label = nurseLabOrderedLabel(entry);
      if (label && out.indexOf(label) === -1) out.push(label);
    });
    return out;
  }

  function nurseLabFindResultForOrderedLabel(results, label) {
    if (!Array.isArray(results) || !label) return null;
    var wanted = String(label).toLowerCase().trim();
    for (var i = 0; i < results.length; i++) {
      var row = results[i] || {};
      var name = String(row.test || row.name || row.orderItemName || row.code || '').toLowerCase().trim();
      if (!name) continue;
      if (name === wanted || name.indexOf(wanted) !== -1 || wanted.indexOf(name) !== -1) return row;
    }
    return null;
  }

  function nurseLabFindResultForTest(results, t) {
    if (!Array.isArray(results)) return null;
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r && r.code && String(r.code) === String(t.code)) return r;
    }
    var tn = String(t.name || '').toLowerCase();
    for (var j = 0; j < results.length; j++) {
      var r2 = results[j];
      if (!r2) continue;
      var rn = String(r2.test || r2.name || '').toLowerCase();
      if (rn && (rn.indexOf(tn) !== -1 || tn.indexOf(rn) !== -1)) return r2;
    }
    return null;
  }

  function nurseLabTestIsOrdered(testsOrdered, t, cat) {
    if (!Array.isArray(testsOrdered) || !testsOrdered.length) return false;
    try {
      if (window.pcLabCatalog && typeof window.pcLabCatalog.matchesParameter === 'function') {
        if (window.pcLabCatalog.matchesParameter(testsOrdered, t)) return true;
      }
    } catch (e) {}
    var tn = String(t.name || '').toLowerCase();
    var tc = String(t.code || '').toLowerCase();
    var catId = cat ? cat.id : '';
    return testsOrdered.some(function (nm) {
      var n = String(nm || '').toLowerCase();
      if (!n) return false;
      if (tc && n === tc) return true;
      if (tn && (n === tn || n.indexOf(tn) !== -1 || tn.indexOf(n) !== -1)) return true;
      if ((catId === 'uri' || catId === 'urinalysis') && n.indexOf('urinalysis') !== -1) return true;
      if ((catId === 'fbc' || catId === 'hematology') && (n.indexOf('full blood') !== -1 || n === '13100')) return true;
      return false;
    });
  }

  function nurseLabFlagBadge(flag) {
    var f = String(flag || 'Normal');
    var bg = '#e9f9ee', fg = '#1a7a32';
    if (f.indexOf('High') !== -1 || f.indexOf('Low') !== -1) { bg = '#fff4e0'; fg = '#7a4500'; }
    if (f.indexOf('Critical') !== -1) { bg = '#ffebe9'; fg = '#8a1f1a'; }
    if (f === 'Normal' || f === 'N' || !flag) return '';
    var short = 'H';
    if (f.indexOf('Critical') !== -1) short = 'C';
    else if (f.indexOf('Low') !== -1) short = 'L';
    return '<span class="oc-flag" style="background:' + bg + ';color:' + fg + ';">' + short + '</span>';
  }

  function nurseLabDateKey(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return 'unknown';
      return d.getFullYear() + '-' + String(d.getMonth() + 101).slice(1) + '-' + String(d.getDate() + 100).slice(1);
    } catch (e) {
      return 'unknown';
    }
  }

  function nurseLabReadOrdersForPatient(pidRaw) {
    try {
      if (window.pcOrders && typeof window.pcOrders.listServerConfirmed === 'function') {
        return (window.pcOrders.listServerConfirmed({ dept: 'lab', patientId: pidRaw }) || []).filter(function (o) {
          return String(o.status || '').toLowerCase() !== 'cancelled';
        });
      }
    } catch (e) {}
    try {
      return JSON.parse(localStorage.getItem('pclinic_orders') || '[]').filter(function (o) {
        return nurseLabStripMod(o.patientId) === pidRaw && (o.type === 'lab' || o.dept === 'lab') && !o._legacyLocalOnly && !o._syncFailed && String(o.status || '').toLowerCase() !== 'cancelled';
      });
    } catch (e2) {
      return [];
    }
  }

  function nurseLabShortRequestId(id) {
    var clean = String(id || '').replace(/[^A-Za-z0-9-]/g, '');
    return clean ? clean.slice(-8) : '—';
  }

  function nurseLabEntryTimeLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 'Time —';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function nurseLabRenderEmptyState(msg) {
    var head = document.getElementById('nurseMatrixHead');
    var body = document.getElementById('nurseMatrixBody');
    if (head) head.innerHTML = '';
    if (body) {
      body.innerHTML = '<tr><td style="text-align:center;padding:56px 20px;color:#6e6e73;font-size:13px;">' +
        '<div style="font-size:34px;margin-bottom:10px;">🧪</div>' + msg + '</td></tr>';
    }
  }

  function nurseLabPadEmptyResultColumns() {
    var wrap = document.querySelector('#labResultsList .oc-matrix-wrapper');
    var table = document.getElementById('nurseOcMatrixTable');
    var headRow = table && table.tHead && table.tHead.rows[0];
    if (!wrap || !table || !headRow) return;
    var COL = 150;
    var LEFT = 150 + 250;
    var used = 0;
    for (var i = 2; i < headRow.cells.length; i++) used++;
    var room = Math.max(0, wrap.clientWidth - LEFT);
    var need = Math.floor(room / COL);
    var extra = need - used;
    if (extra <= 0) return;
    for (var n = 0; n < extra; n++) {
      var th = document.createElement('th');
      th.className = 'oc-col-order-hdr oc-empty-col';
      th.innerHTML = '<div class="oc-col-order-date" style="opacity:.28">—</div>';
      headRow.appendChild(th);
    }
    var rows = table.tBodies[0] ? table.tBodies[0].rows : [];
    for (var r = 0; r < rows.length; r++) {
      for (var n2 = 0; n2 < extra; n2++) {
        var td = document.createElement('td');
        td.className = 'oc-res-cell oc-empty-col';
        td.style.color = '#9ca3af';
        td.style.opacity = '0.28';
        td.textContent = '--';
        rows[r].appendChild(td);
      }
    }
  }

  function nurseLabBuildMatrix(patient, dateFilter) {
    if (!patient || !patient.id) {
      nurseLabRenderEmptyState('🔒 No patient selected.<br><span style="font-size:11.5px;">This flow sheet shows only the selected patient.</span>');
      return;
    }

    var pidRaw = nurseLabStripMod(patient.id);
    var orders = nurseLabReadOrdersForPatient(pidRaw);
    var sets = orders.map(function (o) {
      return {
        kind: 'order',
        id: String(o.id || ''),
        date: o.completedAt || o.orderedAt || new Date().toISOString(),
        status: o.status || 'pending',
        results: Array.isArray(o.results) ? o.results : [],
        testsOrdered: (window.pcLabCatalog && window.pcLabCatalog.expandOrderItems)
          ? window.pcLabCatalog.expandOrderItems(o.items || [])
          : (Array.isArray(o.items) ? o.items.map(function (it) { return it.name; }) : []),
        verifiedBy: o.completedBy || ''
      };
    });

    var knownIds = orders.map(function (o) { return String(o.id); });
    var labReqs = Array.isArray(patient.labRequests) ? patient.labRequests : [];
    labReqs.forEach(function (req) {
      if (!req) return;
      var rid = String(req.id || '');
      if (rid && knownIds.indexOf(rid) !== -1) return;
      var st = String(req.status || 'Pending').toLowerCase();
      if (st === 'cancelled') return;
      var items = Array.isArray(req.testItems) && req.testItems.length ? req.testItems : (Array.isArray(req.tests) ? req.tests : []);
      knownIds.push(rid);
      sets.push({
        kind: 'request',
        id: rid || ('req-' + (req.timestamp || '')),
        date: req.timestamp || new Date().toISOString(),
        status: st === 'completed' ? 'completed' : 'pending',
        results: Array.isArray(req.results) ? req.results : [],
        testsOrdered: (window.pcLabCatalog && window.pcLabCatalog.expandOrderItems)
          ? window.pcLabCatalog.expandOrderItems(items)
          : items.map(function (it) { return typeof it === 'string' ? it : (it.name || ''); }),
        verifiedBy: req.verifiedBy || ''
      });
    });

    var storedResults = Array.isArray(patient.labResults) ? patient.labResults : [];
    storedResults.forEach(function (r) {
      if (!r || !Array.isArray(r.tests) || !r.tests.length) return;
      if (r.orderId && knownIds.indexOf(String(r.orderId)) !== -1) return;
      sets.push({
        kind: 'stored',
        id: String(r.id || r.orderId || ''),
        date: r.date || new Date().toISOString(),
        status: 'completed',
        results: r.tests,
        testsOrdered: r.tests.map(function (t) { return t.test || t.name || ''; }),
        verifiedBy: r.verifiedBy || ''
      });
    });

    sets.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    if (dateFilter) {
      sets = sets.filter(function (s) { return nurseLabDateKey(s.date) === dateFilter; });
    }

    if (!sets.length) {
      nurseLabRenderEmptyState(dateFilter
        ? ('No laboratory entries found for <strong>' + esc(displayName(patient)) + '</strong> on <strong>' + esc(dateFilter) + '</strong>.')
        : ('No laboratory orders yet for <strong>' + esc(displayName(patient)) + '</strong>.<br><span style="font-size:11.5px;">Create a Lab Request and the laboratory will publish verified results here.</span>'));
      return;
    }

    function isVerifiedSet(s) {
      return s.status === 'completed' || s.status === 'Completed';
    }

    function groupSetsByDay(list) {
      var groups = [];
      (list || []).forEach(function (s) {
        var key = nurseLabDateKey(s.date);
        var g = groups[groups.length - 1];
        if (!g || g.key !== key) {
          g = { key: key, sets: [], verifiedCount: 0 };
          groups.push(g);
        }
        g.sets.push(s);
        if (isVerifiedSet(s)) g.verifiedCount++;
      });
      return groups;
    }

    function buildGroupEntries(group, orderedCheck, resultCheck) {
      var entries = [];
      group.sets.forEach(function (s) {
        var ordered = !!orderedCheck(s);
        var result = resultCheck ? resultCheck(s) : null;
        if (!ordered && !result) return;
        entries.push({
          kind: result ? 'result' : (isVerifiedSet(s) ? 'reported' : 'pending'),
          at: s.date || '',
          id: s.id || '',
          r: result || null
        });
      });
      entries.sort(function (a, b) { return new Date(a.at || 0) - new Date(b.at || 0); });
      return entries;
    }

    function renderEntryBadge(entry) {
      if (!entry) return '';
      if (entry.kind === 'result') {
        var val = entry.r && entry.r.value != null && entry.r.value !== '' ? entry.r.value : '—';
        return '<span style="font-weight:800;">' + esc(val) + '</span>' + nurseLabFlagBadge(entry.r && entry.r.flag);
      }
      if (entry.kind === 'reported') return '<span style="color:#6e6e73;font-weight:700;">Reported</span>';
      return '<span class="oc-pending-badge">Pending</span>';
    }

    function renderGroupCell(entries) {
      if (!entries || !entries.length) return '<td class="oc-res-cell" style="color:#9ca3af;opacity:0.35;">--</td>';
      if (entries.length === 1) return '<td class="oc-res-cell">' + renderEntryBadge(entries[0]) + '</td>';
      return '<td class="oc-res-cell" style="white-space:normal;padding:6px 4px;">' +
        '<div style="display:flex;flex-direction:column;gap:4px;align-items:stretch;">' +
        entries.map(function (entry, idx) {
          return '<div style="padding:' + (idx === entries.length - 1 ? '0' : '0 0 4px 0') + ';' + (idx === entries.length - 1 ? '' : 'border-bottom:1px dashed rgba(0,0,0,0.10);') + '">' +
            '<div style="font-size:9px;color:#6e6e73;margin-bottom:2px;">' + esc(nurseLabEntryTimeLabel(entry.at) + ' • ' + nurseLabShortRequestId(entry.id)) + '</div>' +
            '<div>' + renderEntryBadge(entry) + '</div>' +
          '</div>';
        }).join('') +
        '</div>' +
      '</td>';
    }

    var groups = groupSetsByDay(sets);
    groups.reverse();
    var head = document.getElementById('nurseMatrixHead');
    var body = document.getElementById('nurseMatrixBody');
    var headHtml = '<tr>' +
      '<th style="width:60px;text-align:left;">Analysis</th>' +
      '<th style="width:112px;text-align:left;">Parameter</th>';
    groups.forEach(function (g) {
      var first = g.sets[0] || null;
      var d = new Date(first && first.date || '');
      var dateStr = isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      var countLabel = g.sets.length + ' request' + (g.sets.length === 1 ? '' : 's');
      var chip = '';
      if (g.verifiedCount === g.sets.length) {
        chip = '<span style="display:inline-block;background:#e9f9ee;color:#1a7a32;font-weight:800;font-size:8px;padding:1px 6px;border-radius:20px;margin-top:2px;">✓ ' + countLabel + '</span>';
      } else if (g.verifiedCount > 0) {
        chip = '<span style="display:inline-block;background:#fff4e0;color:#7a4500;font-weight:800;font-size:8px;padding:1px 6px;border-radius:20px;margin-top:2px;">' + g.verifiedCount + '/' + g.sets.length + ' ready</span>';
      } else {
        chip = '<span style="display:inline-block;background:#fff4e0;color:#7a4500;font-weight:800;font-size:8px;padding:1px 6px;border-radius:20px;margin-top:2px;">⏳ ' + countLabel + '</span>';
      }
      headHtml += '<th class="oc-col-order-hdr"><div class="oc-col-order-date">' + dateStr + '</div>' + chip + '</th>';
    });
    headHtml += '</tr>';
    if (head) head.innerHTML = headHtml;

    function entriesForMatrixTest(group, t, cat) {
      return buildGroupEntries(
        group,
        function (s) { return nurseLabTestIsOrdered(s.testsOrdered, t, cat); },
        function (s) { return isVerifiedSet(s) ? nurseLabFindResultForTest(s.results, t) : null; }
      );
    }

    function testActivityScore(t, cat) {
      var score = 0;
      for (var gi = 0; gi < groups.length; gi++) {
        var entries = entriesForMatrixTest(groups[gi], t, cat);
        var recency = groups.length - gi;
        if (entries.some(function (entry) { return entry.kind === 'result'; })) score = Math.max(score, 1000 + recency * 10);
        else if (entries.some(function (entry) { return entry.kind === 'reported'; })) score = Math.max(score, 700 + recency * 10);
        else if (entries.some(function (entry) { return entry.kind === 'pending'; })) score = Math.max(score, 500 + recency * 10);
      }
      return score;
    }

    var categories = nurseLabCategories();
    var catsOrdered = categories.map(function (cat) {
      var tests = (cat.tests || []).slice().sort(function (a, b) { return testActivityScore(b, cat) - testActivityScore(a, cat); });
      var catScore = 0;
      tests.forEach(function (t) { catScore = Math.max(catScore, testActivityScore(t, cat)); });
      return { cat: cat, tests: tests, score: catScore };
    }).sort(function (a, b) { return b.score - a.score; });

    var bodyHtml = '';
    var rowCount = 0;
    catsOrdered.forEach(function (pack) {
      var cat = pack.cat;
      var totalTests = pack.tests.length;
      pack.tests.forEach(function (t, idx) {
        var rowClass = (rowCount % 2 === 0) ? 'row-even' : 'row-odd';
        rowCount++;
        bodyHtml += '<tr class="' + rowClass + '">';
        if (idx === 0) bodyHtml += '<td class="oc-cat-cell ' + cat.className + '" rowspan="' + totalTests + '">' + cat.title + '</td>';
        var unitStr = t.unit ? ' (' + t.unit + ')' : '';
        var rangeStr = t.range ? ' [' + t.range + ']' : '';
        bodyHtml += '<td class="oc-test-cell"><span class="oc-test-code">' + t.code + '</span><span>' + t.name + unitStr + '</span><span class="oc-test-range">' + rangeStr + '</span></td>';
        groups.forEach(function (g) { bodyHtml += renderGroupCell(entriesForMatrixTest(g, t, cat)); });
        bodyHtml += '</tr>';
      });
    });

    function matchesKnownMatrix(label) {
      for (var c = 0; c < categories.length; c++) {
        for (var ti = 0; ti < categories[c].tests.length; ti++) {
          if (nurseLabTestIsOrdered([label], categories[c].tests[ti], categories[c])) return true;
        }
      }
      return false;
    }

    var extraOrdered = [];
    groups.forEach(function (g) {
      g.sets.forEach(function (s) {
        nurseLabOrderedSetLabels(s.testsOrdered).forEach(function (label) {
          if (!label || matchesKnownMatrix(label) || extraOrdered.indexOf(label) !== -1) return;
          extraOrdered.push(label);
        });
      });
    });

    if (extraOrdered.length) {
      extraOrdered.forEach(function (label, idx) {
        var rowClass = (rowCount % 2 === 0) ? 'row-even' : 'row-odd';
        rowCount++;
        bodyHtml += '<tr class="' + rowClass + '">';
        if (idx === 0) bodyHtml += '<td class="oc-cat-cell oc-cat-uri" rowspan="' + extraOrdered.length + '">ADDITIONAL REQUESTS</td>';
        bodyHtml += '<td class="oc-test-cell"><span class="oc-test-code">EXTRA</span><span>' + esc(label) + '</span><span class="oc-test-range"> [Requested test]</span></td>';
        groups.forEach(function (g) {
          var entries = buildGroupEntries(
            g,
            function (s) {
              return nurseLabOrderedSetLabels(s.testsOrdered).some(function (entry) {
                var lowA = String(entry || '').toLowerCase();
                var lowB = String(label || '').toLowerCase();
                return lowA === lowB || lowA.indexOf(lowB) !== -1 || lowB.indexOf(lowA) !== -1;
              });
            },
            function (s) { return isVerifiedSet(s) ? nurseLabFindResultForOrderedLabel(s.results, label) : null; }
          );
          bodyHtml += renderGroupCell(entries);
        });
        bodyHtml += '</tr>';
      });
    }

    if (body) body.innerHTML = bodyHtml;
    nurseLabPadEmptyResultColumns();
  }

  function nurseLabBuildCandSCard(r, patient) {
    var atbRows = (Array.isArray(r.antibiotics) ? r.antibiotics : []).map(function (a, i) {
      var atbName = Array.isArray(a) ? (a[1] || a[0] || 'Antibiotic') : (a.name || a.antibiotic || 'Antibiotic');
      var sens = Array.isArray(a) ? (a[2] || 'Sensitive') : (a.sensitivity || 'Sensitive');
      var sLow = String(sens).toLowerCase();
      var fg = sLow === 'resistant' ? '#8a1f1a' : (sLow === 'intermediate' ? '#7a4500' : '#1a7a32');
      return '<tr>' +
        '<td style="padding:7px 12px;border:0.5px solid #d8d8dc;font-weight:700;">' + (i + 1) + '</td>' +
        '<td style="padding:7px 12px;border:0.5px solid #d8d8dc;">' + esc(atbName) + '</td>' +
        '<td style="padding:7px 12px;border:0.5px solid #d8d8dc;text-align:center;font-weight:800;color:' + fg + ';">' + esc(sens) + '</td>' +
      '</tr>';
    }).join('');
    var repDate = r.date ? new Date(r.date).toLocaleDateString('en-GB') : '—';
    var collDate = r.collectedAt ? new Date(r.collectedAt).toLocaleDateString('en-GB') : repDate;
    return '<div style="background:#fff;border:1px solid var(--bd);border-radius:16px;padding:22px;margin-bottom:16px;box-shadow:var(--shadow);">' +
      '<div style="text-align:center;border-bottom:2px solid #1d1d1f;padding-bottom:12px;margin-bottom:16px;">' +
        '<div style="font-size:18px;font-weight:800;letter-spacing:0.5px;color:#1d1d1f;">MICROBIOLOGY</div>' +
        '<div style="font-size:13.5px;font-weight:800;margin-top:3px;color:#1d1d1f;">Culture and Sensitivity</div>' +
        '<div style="font-size:11.5px;color:#6e6e73;margin-top:6px;">' + esc(r.incubationNote || '') + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:12.5px;color:#3a3a3c;margin-bottom:16px;">' +
        '<div><strong>Date of Sample Collection:</strong> ' + esc(collDate) + '</div>' +
        '<div><strong>Date of Reporting:</strong> ' + esc(repDate) + '</div>' +
        '<div><strong>Sample Type:</strong> ' + esc(r.sampleType || '—') + '</div>' +
        '<div><strong>Organism Isolated:</strong> ' + esc(r.organism || '—') + '</div>' +
        '<div><strong>Colony Count:</strong> ' + esc(r.colonyCount || '—') + '</div>' +
        '<div><strong>Patient:</strong> ' + esc(displayName(patient)) + ' • MRN ' + esc(displayMrn(patient)) + '</div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
        '<thead><tr style="background:#f5f5f7;">' +
          '<th style="padding:8px 12px;border:0.5px solid #d8d8dc;text-align:left;width:10%;">S. No.</th>' +
          '<th style="padding:8px 12px;border:0.5px solid #d8d8dc;text-align:left;">Antibiotic</th>' +
          '<th style="padding:8px 12px;border:0.5px solid #d8d8dc;width:24%;">Sensitivity</th>' +
        '</tr></thead><tbody>' + atbRows + '</tbody></table>' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px;border-top:1px solid #d8d8dc;padding-top:12px;font-size:11.5px;color:#3a3a3c;">' +
        '<div><strong>Verifying Senior MLT:</strong> ' + esc(r.verifiedBy || 'PClinic MOD Laboratory') + '</div>' +
        '<div style="border:1.5px solid #1d1d1f;padding:6px 14px;border-radius:6px;font-weight:800;font-size:10.5px;letter-spacing:0.5px;">MOD / PCLINIC VERIFIED</div>' +
      '</div>' +
    '</div>';
  }

  function nurseLabBuildMicrobiologyReports(patient, dateFilter) {
    var box = document.getElementById('nurseMicroReports');
    if (!box) return;
    if (!patient) { box.style.display = 'none'; box.innerHTML = ''; return; }
    var entries = [];
    (Array.isArray(patient.labResults) ? patient.labResults : []).forEach(function (r) {
      if (!r || !Array.isArray(r.antibiotics) || !r.antibiotics.length) return;
      if (dateFilter && nurseLabDateKey(r.date || r.collectedAt) !== dateFilter) return;
      entries.push(r);
    });
    try {
      var orders = JSON.parse(localStorage.getItem('pclinic_orders') || '[]');
      orders.forEach(function (o) {
        var micro = o && o.microbiology;
        if (!o || nurseLabStripMod(o.patientId) !== nurseLabStripMod(patient.id) || !micro || !Array.isArray(micro.antibiotics) || !micro.antibiotics.length) return;
        if (dateFilter && nurseLabDateKey(micro.date || micro.collectedAt || o.completedAt || o.orderedAt) !== dateFilter) return;
        entries.push(micro);
      });
    } catch (e) {}
    if (!entries.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    box.innerHTML = '<div style="font-size:14px;font-weight:800;color:#1d1d1f;margin:20px 0 12px;">🧫 Microbiology — Culture &amp; Sensitivity Reports</div>' +
      entries.map(function (entry) { return nurseLabBuildCandSCard(entry, patient); }).join('');
  }

  function renderLabResults(patient) {
    patient = patient || refreshCurrentPatientFromStore();
    var box = document.getElementById('labResultsList');
    if (!box) return;
    if (!patient) {
      box.innerHTML = '<div class="nurse-lab-empty">🔒 Select a patient first to see laboratory results from the Common Server.</div>';
      return;
    }
    try {
      localStorage.setItem('pclinic_lab_patient_data', JSON.stringify({
        id: patient.id,
        firstName: patient.firstName || '',
        lastName: patient.lastName || '',
        mrn: patient.mrn || '',
        labRequests: Array.isArray(patient.labRequests) ? patient.labRequests : [],
        labResults: Array.isArray(patient.labResults) ? patient.labResults : []
      }));
    } catch (e) {}
    box.innerHTML = '<div class="nurse-lab-results-host">' +
      '<div class="oc-matrix-wrapper">' +
        '<table class="oc-matrix-table" id="nurseOcMatrixTable">' +
          '<thead id="nurseMatrixHead"></thead>' +
          '<tbody id="nurseMatrixBody"></tbody>' +
        '</table>' +
      '</div>' +
      '<div id="nurseMicroReports" style="display:none;"></div>' +
    '</div>';
    nurseLabBuildMatrix(patient, '');
    nurseLabBuildMicrobiologyReports(patient, '');
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

  function showVitalsRequiredPrompt() {
    var modal = document.getElementById('modalOverlay');
    var title = document.getElementById('modalTitle');
    var body = document.getElementById('modalBody');
    if (!modal || !title || !body) return safeToast('⚠️ Open Vitals and save them first.', 'warning');
    title.textContent = 'Fill vital signs first';
    body.innerHTML = '' +
      '<div style="display:flex;flex-direction:column;gap:14px;">' +
        '<div style="font-size:14px;font-weight:700;color:var(--tp);">Vital Signs page opened first</div>' +
        '<div style="font-size:12px;color:var(--ts);line-height:1.6;">Before triage, please <strong>fill and save the patient\'s vital signs first</strong>. Once vitals are saved, you can return to Triage and the category will be interpreted from those saved vitals.</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn-p" onclick="closeModal(); var temp=document.getElementById(\'vitalsTemp\'); if(temp) temp.focus();"><i class="ti ti-heartbeat"></i> Fill vitals now</button>' +
          '<button class="btn-s" onclick="closeModal()">OK</button>' +
        '</div>' +
      '</div>';
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
    window.addEventListener('storage', function () { loadPatients(); renderBillCatalog(); renderBillHistory(); });
    window.addEventListener('focus', function () { loadPatients(); renderBillCatalog(); renderBillHistory(); });
    window.addEventListener('tariffUpdated', function () { renderBillCatalog(); calcBill(); renderBillHistory(); });
    window.addEventListener('pharmacyInventoryUpdated', function () { renderBillCatalog(); calcBill(); });
    window.addEventListener('billsUpdated', function () { renderBillHistory(); updateBillCount(); });
    window.addEventListener('labResultsUpdated', function () { renderLabResults(); refreshKpisAndQueue(getAllPatients()); });
    window.addEventListener('pclinicSyncError', function () { loadPatients(); renderLabResults(); renderBillCatalog(); renderBillHistory(); });
    window.addEventListener('pcPatientChanged', function (event) {
      var detail = event && event.detail ? event.detail : null;
      syncingFromSharedBar = true;
      try {
        if (detail && detail.id && !detail._cleared) {
          var fresh = getPatient(detail.id) || detail;
          setCurrentPatient(fresh);
          refreshPatientUi(fresh, true);
          var searchInput = document.getElementById('searchInput');
          if (searchInput) searchInput.value = displayName(fresh) + ' — ' + displayMrn(fresh);
        } else {
          setCurrentPatient(null);
          hideLegacyPatientCard();
          setPatientFieldValues(null);
          var suggestions = document.getElementById('suggestions');
          if (suggestions) suggestions.classList.remove('show');
          var searchInput2 = document.getElementById('searchInput');
          if (searchInput2) searchInput2.value = '';
          renderTriagePanel(null);
          if (typeof window.renderLabResults === 'function') window.renderLabResults(null);
          if (typeof window.renderVitalsGraph === 'function') window.renderVitalsGraph();
          if (typeof window.updateNursingChips === 'function') window.updateNursingChips();
        }
      } finally {
        syncingFromSharedBar = false;
      }
    });
  }

  function installOverrides() {
    window.showToast = safeToast;
    window.nurseShowToast = safeToast;
    window.displayPatientCard = function () {
      hideLegacyPatientCard();
      return getCurrentPatient();
    };
    window.updateVitalsStrip = function () {
      hideLegacyPatientCard();
      return null;
    };
    window.updateClock = updateClock;
    window.loadPatients = loadPatients;
    window.renderPatientTable = renderPatientTable;
    window.filterPatients = function () { renderPatientTable(getAllPatients()); };
    window.updateKPIs = function (patients) { return refreshKpisAndQueue(patients); };
    window.updateQueue = updateQueue;
    window.handleSmartSearch = handleSmartSearch;
    window.lookupPatient = lookupPatient;
    window.fillForms = fillForms;
    window.renderCPNHistory = renderCPNHistory;
    window.updateCPNCount = updateCPNCount;
    window.renderCpnDocPreview = renderCpnDocPreview;
    window.previewCPNHistory = previewCpnHistory;
    window.selectPatient = selectPatient;
    window.addBillRow = addBillRow;
    window.addBillItemFromCatalog = addBillItemFromCatalog;
    window.removeBillRow = removeBillRow;
    window.renderBillCatalog = renderBillCatalog;
    window.renderBillHistory = renderBillHistory;
    window.updateBillCount = updateBillCount;
    window.setBillKindFilter = setBillKindFilter;
    window.setBillHistoryFilter = setBillHistoryFilter;
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
    window.renderNursingNotes = renderNursingNotes;
    window.updateNursingNoteCount = updateNursingNoteCount;
    window.openNewNursingNote = openNewNursingNote;
    window.openNursingNoteFromCarePlan = openNursingNoteFromCarePlan;
    window.closeNewNursingNote = closeNewNursingNote;
    window.saveNursingNote = saveNursingNote;
    window.clearNursingNote = clearNursingNote;
    window.saveBill = saveBill;
    window.saveMedicationLog = saveMedicationLog;
    window.renderCarePlanHistory = renderCarePlanHistory;
    window.updateCarePlanCount = updateCarePlanCount;
    window.openNewCarePlan = openNewCarePlan;
    window.closeNewCarePlan = closeNewCarePlan;
    window.saveCarePlan = saveCarePlan;
    window.clearCarePlan = clearCarePlan;
    window.setCarePlanStatus = setCarePlanStatus;
    window.deleteCarePlan = deleteCarePlan;
    window.saveDelivery = saveDelivery;
    window.deleteDelivery = deleteDelivery;
    window.renderLabRequests = renderLabRequests;
    window.renderLabResults = renderLabResults;
    window.openLabResultsTab = openLabResultsTab;
    window.openLabResultsFlowSheet = openLabResultsFlowSheet;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.showVitalsRequiredPrompt = showVitalsRequiredPrompt;
    window.updateNursingChips = updateNursingChips;
    window.updateTriagePreview = updateTriagePreview;
    var legacySwitchTab = window.switchTab;
    if (typeof legacySwitchTab === 'function') {
      window.switchTab = function (name, btn) {
        if (name === 'triage') {
          var triagePatient = refreshCurrentPatientFromStore();
          if (!triagePatient) {
            safeToast('⚠️ Select a patient first, then save vital signs before triage.', 'warning');
            focusPatientSearch();
            return;
          }
          if (!patientHasSavedVitals(triagePatient)) {
            legacySwitchTab('vitals', document.querySelector('[data-tab="vitals"]'));
            if (typeof window.switchSub === 'function') window.switchSub('vitals-form');
            showVitalsRequiredPrompt();
            var temp = document.getElementById('vitalsTemp'); if (temp) setTimeout(function(){ temp.focus(); }, 80);
            return;
          }
        }
        legacySwitchTab(name, btn);
        if (name === 'lab') renderLabResults();
        if (name === 'patients') renderPatientTable(getAllPatients());
        if (name === 'overview') refreshKpisAndQueue(getAllPatients());
        if (name === 'vitals' && typeof window.renderVitalsGraph === 'function') window.renderVitalsGraph();
        if (name === 'triage') renderTriagePanel(getCurrentPatient());
        if (name === 'careplan') {
          renderCarePlanHistory(getCurrentPatient());
          updateCarePlanCount(getCurrentPatient());
          closeNewCarePlan();
        }
        if (name === 'notes') {
          renderNursingNotes(getCurrentPatient());
          updateNursingNoteCount(getCurrentPatient());
          closeNewNursingNote();
        }
        if (name === 'billing') { renderBillCatalog(); ensureBillRows(); }
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
    hideLegacyPatientCard();
    installSelectedPatientFields();
    setPatientFieldValues(getCurrentPatient());
    wireCpnPreviewEvents();
    ensureBillRows();
    renderBillCatalog();
    renderBillHistory();
    updateBillCount();
    var billDate = document.getElementById('billDate'); if (billDate && !billDate.value) billDate.value = todayIso();
    var fpDate = document.getElementById('fpDate'); if (fpDate && !fpDate.value) fpDate.value = todayIso();
    var medsDate = document.getElementById('medsDate'); if (medsDate && !medsDate.value) medsDate.value = todayIso();
    var notesDate = document.getElementById('notesDateTime'); if (notesDate && !notesDate.value) notesDate.value = nowLocalValue();
    var labDate = document.getElementById('labDate'); if (labDate) labDate.value = '';
    ['cpnLmp', 'cpnEdd', 'cpnRdv', 'cpnGestAge', 'cpnPregnancies', 'cpnFundalHeight', 'cpnAssessment', 'cpnNotes'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var cpnQuick = document.getElementById('cpnQuickening'); if (cpnQuick) cpnQuick.value = '';
    var cpnDose = document.getElementById('cpnTtDose'); if (cpnDose) cpnDose.value = '';
    var medList = document.getElementById('medLogList'); if (medList) medList.innerHTML = '';
    ensureMedicationEditorRow();
    wireRefreshEvents();
    loadPatients();
    var initialPatient = getCurrentPatient();
    if (!initialPatient && window.pcFile && typeof window.pcFile.patient === 'function') {
      try { initialPatient = window.pcFile.patient() || null; } catch (e) {}
    }
    if (!initialPatient) {
      try {
        var activeId = localStorage.getItem('pclinic_active_patient');
        if (activeId) initialPatient = getPatient(activeId);
      } catch (e) {}
    }
    if (initialPatient) {
      setCurrentPatient(initialPatient);
      refreshPatientUi(initialPatient, true);
      syncSharedPatientBar(initialPatient);
      var searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = displayName(initialPatient) + ' — ' + displayMrn(initialPatient);
    } else {
      renderTriagePanel(null);
      renderLabResults();
    }
    setInterval(function () {
      updateClock();
      if (window.currentStaff) applyStaffUi();
    }, 60000);
    updateClock();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
