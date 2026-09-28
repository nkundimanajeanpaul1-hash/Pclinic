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
    if (window.pcLabEngine && typeof window.pcLabEngine.getSelectedLabPatient === 'function') {
      var pat = window.pcLabEngine.getSelectedLabPatient();
      if (pat) return pat;
    }
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

  function openTab(tabName) {
    var btn = document.querySelector('.nav-tab[data-tab="' + tabName + '"]');
    if (btn && typeof window.switchTab === 'function') {
      window.switchTab(tabName, btn);
      closeDrawer();
      return true;
    }
    return false;
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
    var inEl = document.getElementById('labQaSearch');
    if (inEl) {
      inEl.focus();
      return;
    }
    var searchEl = document.getElementById('searchInput');
    if (searchEl) {
      searchEl.focus();
      searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  window.labDoctorQuickAction = function (action) {
    var p = getActivePatient();
    switch (action) {
      case 'specimen':
        openTab('specimen');
        break;
      case 'worklist':
        openTab('worklist');
        break;
      case 'results':
        openTab('results');
        break;
      case 'reports':
        openTab('reports');
        break;
      case 'pathology':
        openTab('pathology');
        break;
      case 'microbio':
        openTab('microbio');
        break;
      case 'bloodbank':
        openTab('bloodbank');
        break;
      case 'qc':
        openTab('qc');
        break;
      case 'barcode':
        if (window.pcLabEngine && typeof window.pcLabEngine.printBarcodeLabel === 'function') {
          window.pcLabEngine.printBarcodeLabel();
        } else {
          toast('🖨️ Printing accession barcode label...', 'info');
        }
        closeDrawer();
        break;
      case 'broadcast':
        if (window.pcLabEngine && typeof window.pcLabEngine.broadcastReportToDoctor === 'function') {
          window.pcLabEngine.broadcastReportToDoctor();
        } else {
          toast('📡 Laboratory results broadcast to Doctor Portal', 'success');
        }
        closeDrawer();
        break;
      case 'lab-request':
        navToForm('lab-request.html', true);
        break;
      case 'transfusion':
        navToForm('transfusion-registry.html', true);
        break;
      case 'search':
        focusSearch();
        break;
      default:
        if (typeof window.labQuickAction === 'function') {
          window.labQuickAction(action);
        } else {
          console.warn('Unknown lab quick action:', action);
        }
    }
  };

  function updatePatientContextBox() {
    var box = document.getElementById('labQaPatientBox');
    if (!box) return;
    var p = getActivePatient();
    if (!p) {
      box.innerHTML =
        '<div class="lab-qa-patient-empty">' +
          '<i class="ti ti-microscope" style="font-size:16px;color:#0284c7;"></i>' +
          '<span>No lab patient locked — search below to select</span>' +
        '</div>';
      return;
    }

    var initials = ((p.firstName ? p.firstName[0] : '') + (p.lastName ? p.lastName[0] : '')).toUpperCase() || (p.name ? p.name.substring(0, 2).toUpperCase() : 'PT');
    var fullName = p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || 'Patient #' + p.id;
    var mrn = p.mrn || p.id || 'N/A';
    var age = p.age ? p.age + 'y' : (p.gender || '');

    box.innerHTML =
      '<div class="lab-qa-patient-active">' +
        '<div class="lab-qa-patient-avatar">' + initials + '</div>' +
        '<div class="lab-qa-patient-details">' +
          '<div class="lab-qa-patient-name" title="' + fullName + '">' + fullName + '</div>' +
          '<div class="lab-qa-patient-sub">' +
            '<span>MRN: <strong>' + mrn + '</strong></span>' +
            (age ? '<span>· ' + age + '</span>' : '') +
            (p.insurance ? '<span>· ' + p.insurance + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function handleSearchInput(e) {
    var q = e.target.value.trim().toLowerCase();
    var list = document.getElementById('labQaSuggestList');
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
      return '<div class="lab-qa-suggest-item" data-id="' + p.id + '">' +
        '<div><strong>' + name + '</strong> <span style="color:#64748b;font-size:11px;">MRN: ' + mrn + '</span></div>' +
        '<span style="font-size:10px;background:#e0f2fe;color:#0284c7;font-weight:700;border-radius:4px;padding:2px 6px;">Select</span>' +
      '</div>';
    }).join('');

    list.style.display = 'block';

    list.querySelectorAll('.lab-qa-suggest-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.dataset.id;
        if (window.pcLabEngine && typeof window.pcLabEngine.selectLabPatient === 'function') {
          window.pcLabEngine.selectLabPatient(id);
        } else if (typeof window.selectPatient === 'function') {
          window.selectPatient(id);
        } else {
          var found = (pts || []).find(function (pt) { return String(pt.id) === String(id); });
          if (found) window.currentPatient = found;
        }
        list.style.display = 'none';
        document.getElementById('labQaSearch').value = '';
        updatePatientContextBox();
        toast('🔬 Laboratory patient locked', 'success');
      });
    });
  }

  function openDrawer() {
    var drawer = document.getElementById('labQaDrawer');
    var backdrop = document.getElementById('labQaBackdrop');
    if (drawer && backdrop) {
      updatePatientContextBox();
      drawer.classList.add('open');
      backdrop.classList.add('open');
      setTimeout(function () {
        var inEl = document.getElementById('labQaSearch');
        if (inEl) inEl.focus();
      }, 100);
    }
  }

  function closeDrawer() {
    var drawer = document.getElementById('labQaDrawer');
    var backdrop = document.getElementById('labQaBackdrop');
    if (drawer && backdrop) {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      var list = document.getElementById('labQaSuggestList');
      if (list) list.style.display = 'none';
    }
  }

  function toggleDrawer() {
    var drawer = document.getElementById('labQaDrawer');
    if (drawer && drawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function injectDrawer() {
    if (document.getElementById('labQaDrawer')) return;

    // 1. Floating Toggle Button
    var btn = document.createElement('button');
    btn.className = 'lab-qa-toggle-btn';
    btn.id = 'labQaToggleBtn';
    btn.type = 'button';
    btn.innerHTML = '<i class="ti ti-flask"></i> Lab Actions <span class="qa-badge" id="labQaBadge">⚡</span>';
    btn.title = 'Open Laboratory Quick Actions Drawer (⌘K)';
    btn.addEventListener('click', toggleDrawer);
    document.body.appendChild(btn);

    // 2. Backdrop
    var backdrop = document.createElement('div');
    backdrop.className = 'lab-qa-backdrop';
    backdrop.id = 'labQaBackdrop';
    backdrop.addEventListener('click', closeDrawer);
    document.body.appendChild(backdrop);

    // 3. Slide-out Drawer
    var drawer = document.createElement('div');
    drawer.className = 'lab-qa-drawer';
    drawer.id = 'labQaDrawer';
    drawer.innerHTML =
      '<div class="lab-qa-head">' +
        '<div class="lab-qa-head-title"><i class="ti ti-flask" style="color:#0284c7;"></i> Laboratory Quick Actions</div>' +
        '<button class="lab-qa-close-btn" id="labQaCloseBtn" title="Close drawer (Esc)"><i class="ti ti-x"></i></button>' +
      '</div>' +
      '<div class="lab-qa-patient-box" id="labQaPatientBox"></div>' +
      '<div class="lab-qa-search-box">' +
        '<i class="ti ti-search"></i>' +
        '<input type="text" class="lab-qa-search-in" id="labQaSearch" placeholder="Search patient name, MRN or ID…" autocomplete="off" />' +
        '<div class="lab-qa-suggest-list" id="labQaSuggestList"></div>' +
      '</div>' +
      '<div class="lab-qa-scroll">' +
        '<div class="lab-qa-group-title">Specimen & Worklist</div>' +
        '<div class="lab-qa-items-grid">' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'specimen\')">' +
            '<div class="lab-qa-icon lab-c-orange"><i class="ti ti-test-pipe"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Specimen</div><div class="lab-qa-sub">Accession & tube</div></div>' +
          '</div>' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'worklist\')">' +
            '<div class="lab-qa-icon lab-c-blue"><i class="ti ti-list-check"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Worklist</div><div class="lab-qa-sub">Pending benches</div></div>' +
          '</div>' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'barcode\')">' +
            '<div class="lab-qa-icon lab-c-slate"><i class="ti ti-barcode"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Barcode Label</div><div class="lab-qa-sub">Print tube tag</div></div>' +
          '</div>' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'lab-request\')">' +
            '<div class="lab-qa-icon lab-c-teal"><i class="ti ti-file-plus"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Requisition</div><div class="lab-qa-sub">Doctor request</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="lab-qa-group-title">Results & Reporting</div>' +
        '<div class="lab-qa-items-grid">' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'results\')">' +
            '<div class="lab-qa-icon lab-c-green"><i class="ti ti-report-analytics"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Lab Results</div><div class="lab-qa-sub">Entry & auto-flag</div></div>' +
          '</div>' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'reports\')">' +
            '<div class="lab-qa-icon lab-c-purple"><i class="ti ti-printer"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Print Report</div><div class="lab-qa-sub">Official release</div></div>' +
          '</div>' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'broadcast\')">' +
            '<div class="lab-qa-icon lab-c-blue"><i class="ti ti-send"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Send to Doctor</div><div class="lab-qa-sub">Live push notification</div></div>' +
          '</div>' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'qc\')">' +
            '<div class="lab-qa-icon lab-c-teal"><i class="ti ti-chart-line"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Daily QC</div><div class="lab-qa-sub">Controls & calibration</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="lab-qa-group-title">Specialty Benches</div>' +
        '<div class="lab-qa-items-grid">' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'pathology\')">' +
            '<div class="lab-qa-icon lab-c-purple"><i class="ti ti-microscope"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Pathology</div><div class="lab-qa-sub">Biopsy & histology</div></div>' +
          '</div>' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'microbio\')">' +
            '<div class="lab-qa-icon lab-c-pink"><i class="ti ti-virus"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Microbiology</div><div class="lab-qa-sub">Culture & sensitivity</div></div>' +
          '</div>' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'bloodbank\')">' +
            '<div class="lab-qa-icon lab-c-red"><i class="ti ti-droplet"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Blood Bank</div><div class="lab-qa-sub">Crossmatch units</div></div>' +
          '</div>' +
          '<div class="lab-qa-btn" onclick="labDoctorQuickAction(\'transfusion\')">' +
            '<div class="lab-qa-icon lab-c-red"><i class="ti ti-shield-check"></i></div>' +
            '<div class="lab-qa-text"><div class="lab-qa-label">Transfusion Log</div><div class="lab-qa-sub">Safety registry</div></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(drawer);

    document.getElementById('labQaCloseBtn').addEventListener('click', closeDrawer);
    document.getElementById('labQaSearch').addEventListener('input', handleSearchInput);

    // Keyboard shortcut Cmd+K or Ctrl+K or Esc
    window.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleDrawer();
      } else if (e.key === 'Escape') {
        closeDrawer();
      }
    });

    // Listen for lab patient selections
    window.addEventListener('patientSelected', updatePatientContextBox);
    window.addEventListener('patientsUpdated', updatePatientContextBox);
  }

  onReady(function () {
    injectDrawer();
  });
})();
