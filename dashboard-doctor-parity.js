(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function first(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function clickSelector(selector) {
    const node = document.querySelector(selector);
    if (!node) return false;
    node.click();
    return true;
  }

  function focusSelector(selector) {
    const node = document.querySelector(selector);
    if (!node) return false;
    if (typeof node.focus === 'function') node.focus();
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }

  function scrollSelector(selector) {
    const node = document.querySelector(selector);
    if (!node) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    node.classList.add('doctor-parity-quick-target');
    setTimeout(function () { node.classList.remove('doctor-parity-quick-target'); }, 1200);
    return true;
  }

  function byRole() {
    if (document.body.classList.contains('role-theater')) return 'theater';
    if (document.body.classList.contains('role-pharmacy')) return 'pharmacy';
    if (document.body.classList.contains('role-admin')) return 'admin';
    if (document.body.classList.contains('role-cashier')) return 'cashier';
    if (document.body.classList.contains('role-finance')) return 'finance';
    if (document.body.classList.contains('role-inventory')) return 'inventory';
    if (document.body.classList.contains('role-hr')) return 'hr';
    if (document.body.classList.contains('role-beds')) return 'beds';
    return '';
  }

  const ACTIONS = {
    theater: [
      { icon: 'ti-calendar', tone: 'blue', label: "Today's schedule", desc: 'Open the operating schedule.', run: function () { return clickSelector('[data-tab="schedule"]'); } },
      { icon: 'ti-calendar-plus', tone: 'green', label: 'Book surgery', desc: 'Open the booking form.', run: function () { return typeof window.openBookModal === 'function' ? (window.openBookModal(), true) : clickSelector('#btnBookSurgery'); } },
      { icon: 'ti-bed', tone: 'purple', label: 'Theaters', desc: 'View room availability.', run: function () { return clickSelector('[data-tab="theaters"]'); } },
      { icon: 'ti-user-md', tone: 'teal', label: 'Surgeons', desc: 'Open surgeon schedule.', run: function () { return clickSelector('[data-tab="surgeons"]'); } },
      { icon: 'ti-clipboard-list', tone: 'orange', label: 'Procedures', desc: 'Open procedure log.', run: function () { return clickSelector('[data-tab="procedures"]'); } },
      { icon: 'ti-download', tone: 'slate', label: 'Export', desc: 'Download surgery data.', run: function () { return typeof window.exportSurgeries === 'function' ? (window.exportSurgeries(), true) : clickSelector('.btn-export'); } }
    ],
    pharmacy: [
      { icon: 'ti-search', tone: 'blue', label: 'Search item', desc: 'Focus inventory search.', run: function () { return focusSelector('#searchInput'); } },
      { icon: 'ti-plus', tone: 'green', label: 'Add item', desc: 'Open new stock item form.', run: function () { return typeof window.openAddModal === 'function' ? (window.openAddModal(), true) : clickSelector('.btn-add'); } },
      { icon: 'ti-apps', tone: 'teal', label: 'All inventory', desc: 'Show the full inventory list.', run: function () { return clickSelector('.cat-pill[onclick*="all"]') || scrollSelector('.panel'); } },
      { icon: 'ti-bandage', tone: 'purple', label: 'Consumables', desc: 'Filter consumable items.', run: function () { return clickSelector('.cat-pill[onclick*="consumable"]'); } },
      { icon: 'ti-receipt', tone: 'orange', label: 'Medication bills', desc: 'Jump to pending pharmacy bills.', run: function () { return scrollSelector('.bills-section'); } },
      { icon: 'ti-pill', tone: 'red', label: 'Prescriptions', desc: 'Jump to prescriptions to dispense.', run: function () { return scrollSelector('.prescriptions-section'); } }
    ],
    admin: [
      { icon: 'ti-layout-dashboard', tone: 'blue', label: 'Overview', desc: 'Open the admin home view.', run: function () { return clickSelector('[data-tab="dashboard"]'); } },
      { icon: 'ti-users', tone: 'teal', label: 'Patients', desc: 'Open patient records.', run: function () { return clickSelector('[data-tab="patients"]'); } },
      { icon: 'ti-pill', tone: 'green', label: 'Pharmacy', desc: 'Manage pharmacy catalog.', run: function () { return clickSelector('[data-tab="pharmacy"]'); } },
      { icon: 'ti-test-pipe', tone: 'purple', label: 'Lab exams', desc: 'Manage laboratory exams.', run: function () { return clickSelector('[data-tab="lab"]'); } },
      { icon: 'ti-coin', tone: 'orange', label: 'Billing', desc: 'Open bills and revenue.', run: function () { return clickSelector('[data-tab="billing"]'); } },
      { icon: 'ti-user-cog', tone: 'red', label: 'Staff', desc: 'Open staff control.', run: function () { return clickSelector('[data-tab="staff"]'); } }
    ],
    cashier: [
      { icon: 'ti-receipt', tone: 'blue', label: 'Billing queue', desc: 'Open live billing queue.', run: function () { return clickSelector('.nav .ntab:nth-child(1)'); } },
      { icon: 'ti-file-plus', tone: 'green', label: 'New invoice', desc: 'Raise a new invoice.', run: function () { return typeof window.openModal === 'function' ? (window.openModal('newInvModal'), true) : false; } },
      { icon: 'ti-credit-card-pay', tone: 'teal', label: 'Record payment', desc: 'Open payment collection form.', run: function () { return typeof window.openModal === 'function' ? (window.openModal('payModal'), true) : false; } },
      { icon: 'ti-file-invoice', tone: 'purple', label: 'Invoices', desc: 'Open invoices and receipt preview.', run: function () { return clickSelector('.nav .ntab:nth-child(2)'); } },
      { icon: 'ti-shield-check', tone: 'orange', label: 'Claims', desc: 'Open RSSB and insurance claims.', run: function () { return clickSelector('.nav .ntab:nth-child(4)'); } },
      { icon: 'ti-chart-bar', tone: 'red', label: 'Reports', desc: 'Open finance reports.', run: function () { return clickSelector('.nav .ntab:nth-child(5)'); } }
    ],
    finance: [
      { icon: 'ti-layout-dashboard', tone: 'blue', label: 'Overview', desc: 'Open the Finance overview.', run: function () { return clickSelector('[data-tab="overview"]'); } },
      { icon: 'ti-users', tone: 'teal', label: 'Patients', desc: 'Open the patient list.', run: function () { return clickSelector('[data-tab="patients"]'); } },
      { icon: 'ti-file-plus', tone: 'green', label: 'Admission', desc: 'Open admission workflow.', run: function () { return clickSelector('[data-tab="admission"]'); } },
      { icon: 'ti-bed', tone: 'purple', label: 'Ward round', desc: 'Open ward round section.', run: function () { return clickSelector('[data-tab="ward"]'); } },
      { icon: 'ti-radio', tone: 'orange', label: 'Imaging', desc: 'Open imaging requests.', run: function () { return clickSelector('[data-tab="imaging"]'); } },
      { icon: 'ti-test-pipe', tone: 'red', label: 'Lab', desc: 'Open lab requests.', run: function () { return clickSelector('[data-tab="lab"]'); } }
    ],
    inventory: [
      { icon: 'ti-layout-dashboard', tone: 'blue', label: 'Overview', desc: 'Open stock overview.', run: function () { return clickSelector('[data-tab="overview"]'); } },
      { icon: 'ti-box', tone: 'teal', label: 'Inventory list', desc: 'Open the full stock table.', run: function () { return clickSelector('[data-tab="items"]'); } },
      { icon: 'ti-arrows-up-down', tone: 'green', label: 'Movements', desc: 'Open stock movement history.', run: function () { return clickSelector('[data-tab="movements"]'); } },
      { icon: 'ti-truck', tone: 'purple', label: 'Suppliers', desc: 'Open supplier registry.', run: function () { return clickSelector('[data-tab="suppliers"]'); } },
      { icon: 'ti-alert-triangle', tone: 'orange', label: 'Reorder alerts', desc: 'Open low-stock alerts.', run: function () { return clickSelector('[data-tab="reorder"]'); } },
      { icon: 'ti-plus', tone: 'red', label: 'Add item', desc: 'Open the new inventory item form.', run: function () { return typeof window.openAddItemModal === 'function' ? (window.openAddItemModal(), true) : clickSelector('.btn-p'); } }
    ],
    hr: [
      { icon: 'ti-layout-dashboard', tone: 'blue', label: 'Overview', desc: 'Open HR overview.', run: function () { return clickSelector('[data-tab="overview"]'); } },
      { icon: 'ti-users', tone: 'teal', label: 'Staff directory', desc: 'Open the staff list.', run: function () { return clickSelector('[data-tab="staff"]'); } },
      { icon: 'ti-calendar-event', tone: 'green', label: 'Leave', desc: 'Open leave management.', run: function () { return clickSelector('[data-tab="leave"]'); } },
      { icon: 'ti-clock', tone: 'purple', label: 'Shift roster', desc: 'Open weekly roster.', run: function () { return clickSelector('[data-tab="shifts"]'); } },
      { icon: 'ti-credit-card', tone: 'orange', label: 'Payroll', desc: 'Open payroll summary.', run: function () { return clickSelector('[data-tab="payroll"]'); } },
      { icon: 'ti-user-plus', tone: 'red', label: 'Recruitment', desc: 'Open job postings.', run: function () { return clickSelector('[data-tab="recruitment"]'); } }
    ],
    beds: [
      { icon: 'ti-building-hospital', tone: 'blue', label: 'Ward beds', desc: 'Jump to ward occupancy.', run: function () { return scrollSelector('#wardsContainer'); } },
      { icon: 'ti-bed', tone: 'green', label: 'Open first bed', desc: 'Open the first bed card.', run: function () { return clickSelector('.bed-card'); } },
      { icon: 'ti-circle-check', tone: 'teal', label: 'Available beds', desc: 'Jump to current bed cards.', run: function () { return scrollSelector('#wardsContainer'); } },
      { icon: 'ti-user', tone: 'purple', label: 'Occupied beds', desc: 'Review occupied beds.', run: function () { return scrollSelector('#wardsContainer'); } },
      { icon: 'ti-droplet', tone: 'orange', label: 'Cleaning', desc: 'Check cleaning and maintenance beds.', run: function () { return scrollSelector('#wardsContainer'); } },
      { icon: 'ti-refresh', tone: 'red', label: 'Refresh view', desc: 'Reload current bed registry view.', run: function () { return typeof window.location.reload === 'function' ? (window.location.reload(), true) : false; } }
    ]
  };

  function layoutTargets(role) {
    if (role === 'beds') {
      const nodes = [
        first(['.greeting']),
        first(['.stats-grid']),
        first(['.legend']),
        first(['#wardsContainer'])
      ].filter(Boolean);
      return { anchor: nodes[0] || null, nodes: nodes };
    }
    if (role === 'cashier') {
      const nodes = Array.from(document.body.children).filter(function (node) {
        return node && node.classList && node.classList.contains('view');
      });
      return { anchor: nodes[0] || null, nodes: nodes };
    }
    if (role === 'admin') {
      const mainPanel = first(['.main-panel']);
      return { anchor: mainPanel, nodes: mainPanel ? [mainPanel] : [] };
    }
    const content = first(['.content-area', '.main-panel', '.app']);
    return { anchor: content, nodes: content ? [content] : [] };
  }

  function maybeHideLegacyQuickActions(role) {
    if (role === 'finance') {
      const heading = Array.from(document.querySelectorAll('#tab-overview .section-title')).find(function (node) {
        return /quick actions/i.test(String(node.textContent || ''));
      });
      const grid = document.querySelector('#tab-overview .qa-grid');
      if (heading) heading.classList.add('doctor-parity-hidden-legacy-quick-actions');
      if (grid) grid.classList.add('doctor-parity-hidden-legacy-quick-actions');
    }
    if (role === 'admin') {
      const card = Array.from(document.querySelectorAll('#tab-dashboard .card')).find(function (node) {
        return /quick actions/i.test(String(node.textContent || ''));
      });
      if (card) card.classList.add('doctor-parity-hidden-legacy-quick-actions');
    }
  }

  function mountWorkspace(role, panel) {
    const existing = document.getElementById('doctorParityWorkspace');
    if (existing) {
      const side = existing.querySelector('.doctor-parity-side');
      if (side && panel && !side.contains(panel)) side.appendChild(panel);
      return true;
    }
    const plan = layoutTargets(role);
    if (!plan || !plan.anchor || !plan.nodes || !plan.nodes.length) return false;
    const wrap = document.createElement('section');
    wrap.id = 'doctorParityWorkspace';
    wrap.className = 'doctor-parity-workspace';
    const main = document.createElement('div');
    main.className = 'doctor-parity-main';
    const side = document.createElement('aside');
    side.className = 'doctor-parity-side';
    wrap.appendChild(main);
    wrap.appendChild(side);
    plan.anchor.insertAdjacentElement('beforebegin', wrap);
    plan.nodes.filter(function (node, index, list) {
      return !!node && list.indexOf(node) === index && node !== wrap;
    }).forEach(function (node) {
      main.appendChild(node);
    });
    side.appendChild(panel);
    maybeHideLegacyQuickActions(role);
    return true;
  }

  function buildActionCard(action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'doctor-parity-quick-card';
    button.setAttribute('data-tone', action.tone || 'blue');
    button.title = action.desc || action.label || '';
    button.innerHTML = '' +
      '<span class="doctor-parity-quick-ic"><i class="ti ' + action.icon + '"></i></span>' +
      '<span class="doctor-parity-quick-copy">' +
        '<span class="doctor-parity-quick-label">' + action.label + '</span>' +
        '<span class="doctor-parity-quick-desc">' + (action.desc || '') + '</span>' +
      '</span>';
    button.addEventListener('click', function () {
      try {
        const ok = action.run();
        if (!ok && typeof window.showToast === 'function') window.showToast('This quick action is not available in the current page state.', 'warning');
      } catch (error) {
        console.error('doctor parity quick action failed:', error);
        if (typeof window.showToast === 'function') window.showToast('Quick action failed to open.', 'error');
      }
    });
    return button;
  }

  function buildPanel(role, items) {
    const wrap = document.createElement('section');
    wrap.id = 'doctorParityQuickActions';
    wrap.className = 'doctor-parity-quick-panel';
    wrap.innerHTML = '<div class="doctor-parity-quick-headbar"><div><div class="doctor-parity-quick-kicker">Quick actions</div><div class="doctor-parity-quick-title">Doctor-style shortcuts</div></div><div class="doctor-parity-quick-note">' + role.charAt(0).toUpperCase() + role.slice(1) + ' dashboard</div></div><div class="doctor-parity-quick-grid"></div>';
    const grid = wrap.querySelector('.doctor-parity-quick-grid');
    items.forEach(function (action) { grid.appendChild(buildActionCard(action)); });
    return wrap;
  }

  onReady(function () {
    if (!document.body || document.getElementById('doctorParityQuickActions')) return;
    const role = byRole();
    const items = ACTIONS[role] || [];
    if (!role || !items.length) return;
    const panel = buildPanel(role, items);
    if (!mountWorkspace(role, panel)) return;
  });
})();
