(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function getActivePatient() {
    return window.currentPatient || (window.pcPatient && window.pcPatient.get && window.pcPatient.get()) || null;
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type || 'info');
    } else if (typeof window.pcToast === 'function') {
      window.pcToast(msg, type || 'info');
    } else {
      console.log('[' + (type || 'info') + '] ' + msg);
    }
  }

  function navToForm(url, requiresPatient) {
    var p = getActivePatient();
    if (requiresPatient && !p) {
      toast('⚠️ Please select a patient first', 'warning');
      focusSearch();
      return;
    }
    var fullUrl = url;
    if (p && p.id) {
      fullUrl += (url.indexOf('?') === -1 ? '?' : '&') + 'patient=' + encodeURIComponent(p.id);
    }
    window.location.href = fullUrl;
  }

  function focusSearch() {
    var inEl = document.getElementById('docQaSearch');
    if (inEl) {
      inEl.focus();
      return;
    }
    var searchEl = document.getElementById('doctorSearchInput') || document.querySelector('.search-input');
    if (searchEl) {
      searchEl.focus();
      searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  window.doctorUniversalAction = function (action) {
    var p = getActivePatient();
    switch (action) {
      case 'clinical-note':
        navToForm('clinical-note.html', true);
        break;
      case 'prescription':
        if (p && typeof window.openPrescriptionModal === 'function') {
          closeDrawer();
          window.openPrescriptionModal(p);
        } else {
          navToForm('prescription.html', true);
        }
        break;
      case 'procedure-note':
        navToForm('procedure-note.html', true);
        break;
      case 'ward-round':
        navToForm('ward-round.html', true);
        break;
      case 'psychiatric':
        navToForm('psychiatric-care.html', true);
        break;
      case 'lab-request':
        navToForm('lab-request.html', true);
        break;
      case 'imaging-request':
        navToForm('imaging-request.html', true);
        break;
      case 'imaging-result':
        if (p && typeof window.openImagingResultsPage === 'function') {
          closeDrawer();
          window.openImagingResultsPage(p);
        } else {
          navToForm('imaging-request.html', true);
        }
        break;
      case 'ecg':
        navToForm('ecg-form.html', true);
        break;
      case 'surgery':
        navToForm('surgical-note.html', true);
        break;
      case 'admission':
        if (p && typeof window.openAdmissionFormFromDashboard === 'function') {
          closeDrawer();
          window.openAdmissionFormFromDashboard(p);
        } else {
          navToForm('admission-form.html', true);
        }
        break;
      case 'discharge':
        navToForm('discharge-summary.html', true);
        break;
      case 'hospitalization-cert':
        navToForm('hospitalization-certificate.html', true);
        break;
      case 'medical-cert':
        navToForm('medical-certificate.html', true);
        break;
      case 'sick-leave':
        navToForm('sick-leave.html', true);
        break;
      case 'referral':
        navToForm('referral.html', true);
        break;
      case 'transfer':
        navToForm('transfer-form.html', true);
        break;
      case 'search':
        focusSearch();
        break;
      default:
        console.warn('Unknown doctor action:', action);
    }
  };

  function updatePatientContextBox() {
    var box = document.getElementById('docQaPatientBox');
    if (!box) return;
    var p = getActivePatient();
    if (!p) {
      box.innerHTML =
        '<div class="doc-qa-patient-empty">' +
          '<i class="ti ti-stethoscope" style="font-size:16px;color:#0071e3;"></i>' +
          '<span>No patient active — search below to select</span>' +
        '</div>';
      return;
    }

    var initials = ((p.firstName ? p.firstName[0] : '') + (p.lastName ? p.lastName[0] : '')).toUpperCase() || (p.name ? p.name.substring(0, 2).toUpperCase() : 'PT');
    var fullName = p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || 'Patient #' + p.id;
    var mrn = p.mrn || p.id || 'N/A';
    var age = p.age ? p.age + 'y' : (p.gender || '');

    box.innerHTML =
      '<div class="doc-qa-patient-active">' +
        '<div class="doc-qa-patient-avatar">' + initials + '</div>' +
        '<div class="doc-qa-patient-details">' +
          '<div class="doc-qa-patient-name" title="' + fullName + '">' + fullName + '</div>' +
          '<div class="doc-qa-patient-sub">' +
            '<span>MRN: <strong>' + mrn + '</strong></span>' +
            (age ? '<span>· ' + age + '</span>' : '') +
            (p.insurance ? '<span>· ' + p.insurance + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function handleSearchInput(e) {
    var q = e.target.value.trim().toLowerCase();
    var list = document.getElementById('docQaSuggestList');
    if (!list) return;

    if (!q || q.length < 2) {
      list.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    var pts = [];
    if (typeof window.getPatients === 'function') {
      try { pts = window.getPatients() || []; } catch (err) {}
    }
    if (!pts || !pts.length) {
      pts = window.patients || [];
    }

    var matches = pts.filter(function (p) {
      var name = (p.name || ((p.firstName || '') + ' ' + (p.lastName || ''))).toLowerCase();
      var id = String(p.id || '').toLowerCase();
      var mrn = String(p.mrn || '').toLowerCase();
      var phone = String(p.phone || '').toLowerCase();
      return name.indexOf(q) !== -1 || id.indexOf(q) !== -1 || mrn.indexOf(q) !== -1 || phone.indexOf(q) !== -1;
    }).slice(0, 6);

    if (matches.length === 0) {
      list.innerHTML = '<div style="padding:10px;font-size:11.5px;color:#94a3b8;text-align:center;">No matching patients</div>';
      list.style.display = 'block';
      return;
    }

    list.innerHTML = matches.map(function (p) {
      var name = p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || 'Patient #' + p.id;
      var mrn = p.mrn || p.id;
      return '<div class="doc-qa-suggest-item" data-id="' + p.id + '">' +
        '<div><strong>' + name + '</strong> <span style="color:#64748b;font-size:11px;">MRN: ' + mrn + '</span></div>' +
        '<span style="font-size:10px;background:#e0f2fe;color:#0071e3;font-weight:700;border-radius:4px;padding:2px 6px;">Select</span>' +
      '</div>';
    }).join('');

    list.style.display = 'block';

    list.querySelectorAll('.doc-qa-suggest-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.dataset.id;
        if (typeof window.selectPatient === 'function') {
          window.selectPatient(id);
        } else {
          var found = (pts || []).find(function (pt) { return String(pt.id) === String(id); });
          if (found) window.currentPatient = found;
        }
        list.style.display = 'none';
        document.getElementById('docQaSearch').value = '';
        updatePatientContextBox();
        toast('👨‍⚕️ Patient locked for doctor workflow', 'success');
      });
    });
  }

  function openDrawer() {
    var drawer = document.getElementById('docQaDrawer');
    var backdrop = document.getElementById('docQaBackdrop');
    if (drawer && backdrop) {
      updatePatientContextBox();
      drawer.classList.add('open');
      backdrop.classList.add('open');
      setTimeout(function () {
        var inEl = document.getElementById('docQaSearch');
        if (inEl) inEl.focus();
      }, 100);
    }
  }

  function closeDrawer() {
    var drawer = document.getElementById('docQaDrawer');
    var backdrop = document.getElementById('docQaBackdrop');
    if (drawer && backdrop) {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      var list = document.getElementById('docQaSuggestList');
      if (list) list.style.display = 'none';
    }
  }

  function toggleDrawer() {
    var drawer = document.getElementById('docQaDrawer');
    if (drawer && drawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function injectDrawer() {
    if (document.getElementById('docQaDrawer')) return;

    // 1. Floating Toggle Button
    var btn = document.createElement('button');
    btn.className = 'doc-qa-toggle-btn';
    btn.id = 'docQaToggleBtn';
    btn.type = 'button';
    btn.innerHTML = '<i class="ti ti-stethoscope"></i> Doctor Actions <span class="qa-badge" id="docQaBadge">⚡</span>';
    btn.title = 'Open Doctor Quick Actions Drawer (⌘K)';
    btn.addEventListener('click', toggleDrawer);
    document.body.appendChild(btn);

    // 2. Backdrop
    var backdrop = document.createElement('div');
    backdrop.className = 'doc-qa-backdrop';
    backdrop.id = 'docQaBackdrop';
    backdrop.addEventListener('click', closeDrawer);
    document.body.appendChild(backdrop);

    // 3. Slide-out Drawer
    var drawer = document.createElement('div');
    drawer.className = 'doc-qa-drawer';
    drawer.id = 'docQaDrawer';
    drawer.innerHTML =
      '<div class="doc-qa-head">' +
        '<div class="doc-qa-head-title"><i class="ti ti-stethoscope" style="color:#0071e3;"></i> Doctor Quick Actions</div>' +
        '<button class="doc-qa-close-btn" id="docQaCloseBtn" title="Close drawer (Esc)"><i class="ti ti-x"></i></button>' +
      '</div>' +
      '<div class="doc-qa-patient-box" id="docQaPatientBox"></div>' +
      '<div class="doc-qa-search-box">' +
        '<i class="ti ti-search"></i>' +
        '<input type="text" class="doc-qa-search-in" id="docQaSearch" placeholder="Search patient name, MRN or ID…" autocomplete="off" />' +
        '<div class="doc-qa-suggest-list" id="docQaSuggestList"></div>' +
      '</div>' +
      '<div class="doc-qa-scroll">' +
        '<div class="doc-qa-group-title">Consultation & Notes</div>' +
        '<div class="doc-qa-items-grid">' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'clinical-note\')">' +
            '<div class="doc-qa-icon doc-c-blue"><i class="ti ti-notes"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Clinical Note</div><div class="doc-qa-sub">SOAP record</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'prescription\')">' +
            '<div class="doc-qa-icon doc-c-green"><i class="ti ti-pill"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Prescription</div><div class="doc-qa-sub">Rx medications</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'procedure-note\')">' +
            '<div class="doc-qa-icon doc-c-purple"><i class="ti ti-activity"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Procedure Note</div><div class="doc-qa-sub">Minor procedures</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'ward-round\')">' +
            '<div class="doc-qa-icon doc-c-orange"><i class="ti ti-clipboard-list"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Ward Round</div><div class="doc-qa-sub">Inpatient review</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'psychiatric\')">' +
            '<div class="doc-qa-icon doc-c-pink"><i class="ti ti-brain"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Psychiatric Care</div><div class="doc-qa-sub">Mental assessment</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="doc-qa-group-title">Diagnostics & Imaging</div>' +
        '<div class="doc-qa-items-grid">' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'lab-request\')">' +
            '<div class="doc-qa-icon doc-c-orange"><i class="ti ti-test-pipe"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Lab Request</div><div class="doc-qa-sub">Order tests</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'imaging-request\')">' +
            '<div class="doc-qa-icon doc-c-purple"><i class="ti ti-radio"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Imaging Request</div><div class="doc-qa-sub">X-ray, CT, Echo</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'imaging-result\')">' +
            '<div class="doc-qa-icon doc-c-green"><i class="ti ti-photo-scan"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Image Results</div><div class="doc-qa-sub">DICOM & scans</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'ecg\')">' +
            '<div class="doc-qa-icon doc-c-red"><i class="ti ti-heart-rate-monitor"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">ECG Exam</div><div class="doc-qa-sub">Trace & rhythm</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="doc-qa-group-title">Surgery & Hospitalization</div>' +
        '<div class="doc-qa-items-grid">' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'surgery\')">' +
            '<div class="doc-qa-icon doc-c-red"><i class="ti ti-scalpel"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Surgical Note</div><div class="doc-qa-sub">Operation log</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'admission\')">' +
            '<div class="doc-qa-icon doc-c-blue"><i class="ti ti-bed"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Admission Form</div><div class="doc-qa-sub">Admit to ward</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'discharge\')">' +
            '<div class="doc-qa-icon doc-c-green"><i class="ti ti-logout"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Discharge File</div><div class="doc-qa-sub">Summary & release</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'hospitalization-cert\')">' +
            '<div class="doc-qa-icon doc-c-slate"><i class="ti ti-certificate"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Hosp. Certificate</div><div class="doc-qa-sub">Stay proof</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="doc-qa-group-title">Certificates & Referrals</div>' +
        '<div class="doc-qa-items-grid">' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'medical-cert\')">' +
            '<div class="doc-qa-icon doc-c-teal"><i class="ti ti-file-certificate"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Medical Cert</div><div class="doc-qa-sub">Fitness & health</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'sick-leave\')">' +
            '<div class="doc-qa-icon doc-c-orange"><i class="ti ti-calendar-off"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Sick Leave</div><div class="doc-qa-sub">Work excuse</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'referral\')">' +
            '<div class="doc-qa-icon doc-c-purple"><i class="ti ti-share"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Referral Letter</div><div class="doc-qa-sub">Specialist referral</div></div>' +
          '</div>' +
          '<div class="doc-qa-btn" onclick="doctorUniversalAction(\'transfer\')">' +
            '<div class="doc-qa-icon doc-c-slate"><i class="ti ti-ambulance"></i></div>' +
            '<div class="doc-qa-text"><div class="doc-qa-label">Transfer Form</div><div class="doc-qa-sub">Inter-facility</div></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(drawer);

    document.getElementById('docQaCloseBtn').addEventListener('click', closeDrawer);
    document.getElementById('docQaSearch').addEventListener('input', handleSearchInput);

    // Keyboard shortcut Cmd+K or Ctrl+K or Esc
    window.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleDrawer();
      } else if (e.key === 'Escape') {
        closeDrawer();
      }
    });

    window.addEventListener('patientSelected', updatePatientContextBox);
    window.addEventListener('patientsUpdated', updatePatientContextBox);
  }

  onReady(function () {
    injectDrawer();
  });
})();
