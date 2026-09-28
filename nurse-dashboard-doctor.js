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

  function switchDashboardTab(tabName, subName) {
    if (typeof window.switchTab === 'function') {
      var btn = document.querySelector('[data-tab="' + tabName + '"]');
      window.switchTab(tabName, btn);
      if (subName && typeof window.switchSub === 'function') {
        setTimeout(function () {
          window.switchSub(subName);
        }, 50);
      }
      closeDrawer();
      return true;
    }
    return false;
  }

  function focusSearch() {
    var inEl = document.getElementById('nurseQaSearch');
    if (inEl) {
      inEl.focus();
      return;
    }
    var searchEl = document.getElementById('searchPatient') || document.querySelector('.search-input');
    if (searchEl) {
      searchEl.focus();
      searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  window.nurseQuickAction = function (action) {
    var p = getActivePatient();
    switch (action) {
      case 'triage-form':
        navToForm('triage-form.html', true);
        break;
      case 'triage-tab':
        switchDashboardTab('triage', 'triage-form');
        break;
      case 'vitals':
        switchDashboardTab('vitals', 'vitals-form');
        break;
      case 'nursing-note':
        navToForm('nursing-note.html', true);
        break;
      case 'injection':
        navToForm('injection-registry.html', true);
        break;
      case 'pansement':
        navToForm('pansement-registry.html', true);
        break;
      case 'transfusion':
        navToForm('transfusion-registry.html', true);
        break;
      case 'malnutrition':
        navToForm('malnutrition-followup.html', true);
        break;
      case 'icu':
        navToForm('icu-surveillance.html', true);
        break;
      case 'beds':
        navToForm('beds-setup.html', false);
        break;
      case 'careplan':
        switchDashboardTab('careplan');
        break;
      case 'cpn':
        switchDashboardTab('cpn', 'cpn-ante');
        break;
      case 'fp':
        switchDashboardTab('fp', 'fp-consult');
        break;
      case 'medications':
        switchDashboardTab('medications');
        break;
      case 'billing':
        switchDashboardTab('billing', 'bill-med');
        break;
      case 'admission':
        navToForm('admission-form.html', true);
        break;
      case 'discharge':
        navToForm('discharge-summary.html', true);
        break;
      case 'transfer':
        navToForm('transfer-form.html', true);
        break;
      case 'search':
        focusSearch();
        break;
      default:
        console.warn('Unknown nurse quick action:', action);
    }
  };

  function updatePatientContextBox() {
    var box = document.getElementById('nurseQaPatientBox');
    if (!box) return;
    var p = getActivePatient();
    if (!p) {
      box.innerHTML =
        '<div class="nurse-qa-patient-empty">' +
          '<i class="ti ti-user-exclamation" style="font-size:16px;color:#f59e0b;"></i>' +
          '<span>No patient active — search below to lock patient</span>' +
        '</div>';
      return;
    }

    var initials = ((p.firstName ? p.firstName[0] : '') + (p.lastName ? p.lastName[0] : '')).toUpperCase() || 'PT';
    var fullName = ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || 'Patient #' + p.id;
    var mrn = p.mrn || p.id || 'N/A';
    var age = p.age ? p.age + 'y' : (p.gender || '');

    box.innerHTML =
      '<div class="nurse-qa-patient-active">' +
        '<div class="nurse-qa-patient-avatar">' + initials + '</div>' +
        '<div class="nurse-qa-patient-details">' +
          '<div class="nurse-qa-patient-name" title="' + fullName + '">' + fullName + '</div>' +
          '<div class="nurse-qa-patient-sub">' +
            '<span>MRN: <strong>' + mrn + '</strong></span>' +
            (age ? '<span>· ' + age + '</span>' : '') +
            (p.insurance ? '<span>· ' + p.insurance + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function handleSearchInput(e) {
    var q = e.target.value.trim().toLowerCase();
    var list = document.getElementById('nurseQaSuggestList');
    if (!list) return;

    if (!q || q.length < 2) {
      list.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    var pts = [];
    if (typeof window.getPatients === 'function') {
      try { pts = window.getPatients() || []; } catch (e) {}
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
      return '<div class="nurse-qa-suggest-item" data-id="' + p.id + '">' +
        '<div><strong>' + name + '</strong> <span style="color:#64748b;font-size:11px;">MRN: ' + mrn + '</span></div>' +
        '<span style="font-size:10px;background:#e2e8f0;border-radius:4px;padding:2px 6px;">Select</span>' +
      '</div>';
    }).join('');

    list.style.display = 'block';

    list.querySelectorAll('.nurse-qa-suggest-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.dataset.id;
        if (typeof window.selectPatient === 'function') {
          window.selectPatient(id);
        } else {
          var found = (window.patients || []).find(function (pt) { return String(pt.id) === String(id); });
          if (found) {
            window.currentPatient = found;
            if (typeof window.displayPatientCard === 'function') window.displayPatientCard(found);
            if (typeof window.fillForms === 'function') window.fillForms(found);
          }
        }
        list.style.display = 'none';
        document.getElementById('nurseQaSearch').value = '';
        updatePatientContextBox();
        toast('👤 Active patient selected', 'success');
      });
    });
  }

  function openDrawer() {
    var drawer = document.getElementById('nurseQaDrawer');
    var backdrop = document.getElementById('nurseQaBackdrop');
    if (drawer && backdrop) {
      updatePatientContextBox();
      drawer.classList.add('open');
      backdrop.classList.add('open');
      setTimeout(function () {
        var inEl = document.getElementById('nurseQaSearch');
        if (inEl) inEl.focus();
      }, 100);
    }
  }

  function closeDrawer() {
    var drawer = document.getElementById('nurseQaDrawer');
    var backdrop = document.getElementById('nurseQaBackdrop');
    if (drawer && backdrop) {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      var list = document.getElementById('nurseQaSuggestList');
      if (list) list.style.display = 'none';
    }
  }

  function toggleDrawer() {
    var drawer = document.getElementById('nurseQaDrawer');
    if (drawer && drawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function injectDrawer() {
    if (document.getElementById('nurseQaDrawer')) return;

    // 1. Floating Toggle Button
    var btn = document.createElement('button');
    btn.className = 'nurse-qa-toggle-btn';
    btn.id = 'nurseQaToggleBtn';
    btn.type = 'button';
    btn.innerHTML = '<i class="ti ti-bolt"></i> Quick Actions <span class="qa-badge" id="nurseQaBadge">⚡</span>';
    btn.title = 'Open Nurse Quick Actions Drawer (⌘K)';
    btn.addEventListener('click', toggleDrawer);
    document.body.appendChild(btn);

    // 2. Backdrop
    var backdrop = document.createElement('div');
    backdrop.className = 'nurse-qa-backdrop';
    backdrop.id = 'nurseQaBackdrop';
    backdrop.addEventListener('click', closeDrawer);
    document.body.appendChild(backdrop);

    // 3. Slide-out Drawer
    var drawer = document.createElement('div');
    drawer.className = 'nurse-qa-drawer';
    drawer.id = 'nurseQaDrawer';
    drawer.innerHTML =
      '<div class="nurse-qa-head">' +
        '<div class="nurse-qa-head-title"><i class="ti ti-bolt" style="color:#007080;"></i> Nurse Quick Actions</div>' +
        '<button class="nurse-qa-close-btn" id="nurseQaCloseBtn" title="Close drawer (Esc)"><i class="ti ti-x"></i></button>' +
      '</div>' +
      '<div class="nurse-qa-patient-box" id="nurseQaPatientBox"></div>' +
      '<div class="nurse-qa-search-box">' +
        '<i class="ti ti-search"></i>' +
        '<input type="text" class="nurse-qa-search-in" id="nurseQaSearch" placeholder="Search patient name or MRN…" autocomplete="off" />' +
        '<div class="nurse-qa-suggest-list" id="nurseQaSuggestList"></div>' +
      '</div>' +
      '<div class="nurse-qa-scroll">' +
        '<div class="nurse-qa-group-title">Core Clinical Forms</div>' +
        '<div class="nurse-qa-items-grid">' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'triage-form\')">' +
            '<div class="nurse-qa-icon qa-c-red"><i class="ti ti-urgent"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Triage Form</div><div class="nurse-qa-sub">Full assessment</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'vitals\')">' +
            '<div class="nurse-qa-icon qa-c-blue"><i class="ti ti-heartbeat"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Record Vitals</div><div class="nurse-qa-sub">BP, pulse, temp</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'nursing-note\')">' +
            '<div class="nurse-qa-icon qa-c-purple"><i class="ti ti-notes"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Nursing Note</div><div class="nurse-qa-sub">Progress review</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'careplan\')">' +
            '<div class="nurse-qa-icon qa-c-teal"><i class="ti ti-clipboard-list"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Care Plan</div><div class="nurse-qa-sub">Goals & eval</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="nurse-qa-group-title">Clinical Registries</div>' +
        '<div class="nurse-qa-items-grid">' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'injection\')">' +
            '<div class="nurse-qa-icon qa-c-orange"><i class="ti ti-needle"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Injections</div><div class="nurse-qa-sub">Registry log</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'pansement\')">' +
            '<div class="nurse-qa-icon qa-c-green"><i class="ti ti-bandage"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Pansement</div><div class="nurse-qa-sub">Wound dressing</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'transfusion\')">' +
            '<div class="nurse-qa-icon qa-c-red"><i class="ti ti-droplet"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Transfusion</div><div class="nurse-qa-sub">Blood units</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'icu\')">' +
            '<div class="nurse-qa-icon qa-c-purple"><i class="ti ti-activity"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">ICU Watch</div><div class="nurse-qa-sub">Hourly surveillance</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'malnutrition\')">' +
            '<div class="nurse-qa-icon qa-c-pink"><i class="ti ti-baby-carriage"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Malnutrition</div><div class="nurse-qa-sub">Follow-up log</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'beds\')">' +
            '<div class="nurse-qa-icon qa-c-blue"><i class="ti ti-bed"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Bed Setup</div><div class="nurse-qa-sub">Ward allocation</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="nurse-qa-group-title">Maternity & Prescriptions</div>' +
        '<div class="nurse-qa-items-grid">' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'cpn\')">' +
            '<div class="nurse-qa-icon qa-c-teal"><i class="ti ti-shield-heart"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">CPN Care</div><div class="nurse-qa-sub">Antenatal consult</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'fp\')">' +
            '<div class="nurse-qa-icon qa-c-pink"><i class="ti ti-heart"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Family Plan</div><div class="nurse-qa-sub">Counselling</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'medications\')">' +
            '<div class="nurse-qa-icon qa-c-orange"><i class="ti ti-pill"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Medications</div><div class="nurse-qa-sub">Dose logging</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'billing\')">' +
            '<div class="nurse-qa-icon qa-c-slate"><i class="ti ti-receipt"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Bill Items</div><div class="nurse-qa-sub">Consumables</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="nurse-qa-group-title">Transfers & Admissions</div>' +
        '<div class="nurse-qa-items-grid">' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'admission\')">' +
            '<div class="nurse-qa-icon qa-c-blue"><i class="ti ti-login"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Admission</div><div class="nurse-qa-sub">Ward entry form</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'discharge\')">' +
            '<div class="nurse-qa-icon qa-c-green"><i class="ti ti-logout"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Discharge</div><div class="nurse-qa-sub">Summary file</div></div>' +
          '</div>' +
          '<div class="nurse-qa-btn" onclick="nurseQuickAction(\'transfer\')">' +
            '<div class="nurse-qa-icon qa-c-slate"><i class="ti ti-ambulance"></i></div>' +
            '<div class="nurse-qa-text"><div class="nurse-qa-label">Transfer</div><div class="nurse-qa-sub">Patient referral</div></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(drawer);

    document.getElementById('nurseQaCloseBtn').addEventListener('click', closeDrawer);
    document.getElementById('nurseQaSearch').addEventListener('input', handleSearchInput);

    // Keyboard shortcut Cmd+K or Ctrl+K or Esc
    window.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleDrawer();
      } else if (e.key === 'Escape') {
        closeDrawer();
      }
    });

    // Sync active patient on selection
    window.addEventListener('patientSelected', function () {
      updatePatientContextBox();
    });
    window.addEventListener('patientsUpdated', function () {
      updatePatientContextBox();
    });

    // Also update when user clicks patient table row
    document.addEventListener('click', function (e) {
      var row = e.target.closest('tr[onclick*="selectPatient"], tr[data-patient-id]');
      if (row) {
        setTimeout(updatePatientContextBox, 150);
      }
    });
  }

  onReady(function () {
    injectDrawer();
  });
})();
