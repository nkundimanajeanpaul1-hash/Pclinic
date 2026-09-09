(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function getNavBtn(view) {
    return document.querySelector('.ntab[onclick*="\'' + view + '\'"]');
  }

  function show(view) {
    if (typeof window.showView === 'function') {
      window.showView(view, getNavBtn(view));
      return true;
    }
    return false;
  }

  function focus(selector) {
    var node = document.querySelector(selector);
    if (!node) return false;
    if (typeof node.focus === 'function') node.focus();
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('reception-doctor-highlight');
    setTimeout(function () { node.classList.remove('reception-doctor-highlight'); }, 1100);
    return true;
  }

  function run(action) {
    try {
      var ok = action();
      if (!ok && typeof window.showToast === 'function') window.showToast('This Reception shortcut is not available right now.', 'warning');
    } catch (error) {
      console.error('reception doctor shortcut failed:', error);
      if (typeof window.showToast === 'function') window.showToast('Reception shortcut failed to open.', 'error');
    }
  }

  function buildButton(item) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'reception-doctor-quick-card';
    button.setAttribute('data-tone', item.tone);
    button.title = item.title;
    button.innerHTML = '<span class="reception-doctor-quick-ic"><i class="ti ' + item.icon + '"></i></span><span class="reception-doctor-quick-label">' + item.label + '</span>';
    button.addEventListener('click', function () { run(item.action); });
    return button;
  }

  function injectQuickPanel() {
    var aside = document.querySelector('.aside');
    if (!aside || document.getElementById('receptionDoctorQuickPanel')) return false;

    var items = [
      { icon: 'ti-search', tone: 'blue', label: 'Search patient', title: 'Focus duplicate and patient search', action: function () { return focus('#receptionSearch'); } },
      { icon: 'ti-user-plus', tone: 'green', label: 'Register', title: 'Open new patient registration', action: function () { return show('booking'); } },
      { icon: 'ti-list-numbers', tone: 'teal', label: 'Queue', title: 'Open the waiting queue', action: function () { return show('queue'); } },
      { icon: 'ti-calendar-plus', tone: 'purple', label: 'RDV', title: 'Open appointment booking', action: function () { return show('appointments'); } },
      { icon: 'ti-bed', tone: 'orange', label: 'Beds', title: 'Open bed occupancy view', action: function () { return show('beds'); } },
      { icon: 'ti-messages', tone: 'red', label: 'Messages', title: 'Open shared server messages', action: function () { return typeof window.raMessages === 'function' ? (window.raMessages(), true) : false; } }
    ];

    var panel = document.createElement('section');
    panel.id = 'receptionDoctorQuickPanel';
    panel.className = 'reception-doctor-quick-panel';
    panel.innerHTML = '<div class="reception-doctor-quick-headbar"><div><div class="reception-doctor-quick-kicker">Quick actions</div><div class="reception-doctor-quick-title">Reception shortcuts</div></div></div><div class="reception-doctor-quick-grid"></div>';
    var grid = panel.querySelector('.reception-doctor-quick-grid');
    items.forEach(function (item) { grid.appendChild(buildButton(item)); });
    aside.insertAdjacentElement('afterbegin', panel);
    return true;
  }

  onReady(function () {
    injectQuickPanel();
  });
})();
