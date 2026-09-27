(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function getNavBtn(view) {
    if (typeof window.getNavBtn === 'function') {
      try {
        var btn = window.getNavBtn(view);
        if (btn) return btn;
      } catch (e) {}
    }
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

  window.receptionQuickAction = function (action) {
    try {
      switch (action) {
        case 'search':
          if (typeof window.focusDupSearch === 'function') {
            window.focusDupSearch();
          } else {
            focus('#receptionSearch');
          }
          break;
        case 'register':
          show('booking');
          break;
        case 'queue':
          show('queue');
          break;
        case 'callnext':
          if (typeof window.raCallNext === 'function') {
            window.raCallNext();
          } else if (typeof window.callNextWaiting === 'function') {
            window.callNextWaiting();
          } else if (typeof window.showToast === 'function') {
            window.showToast('No waiting patients found in queue.', 'info');
          }
          break;
        case 'appointments':
          show('appointments');
          break;
        case 'referrals':
          show('referrals');
          break;
        case 'beds':
          show('beds');
          break;
        case 'admission':
          if (typeof window.raAdmission === 'function') {
            window.raAdmission();
          } else {
            show('beds');
          }
          break;
        case 'printcard':
          if (typeof window.raPrintCard === 'function') {
            window.raPrintCard();
          } else if (typeof window.showToast === 'function') {
            window.showToast('Select a patient from the queue or search first.', 'warning');
          }
          break;
        case 'emergency':
          if (typeof window.raEmergency === 'function') {
            window.raEmergency();
          } else {
            show('queue');
          }
          break;
        case 'messages':
          if (typeof window.openMessageCenter === 'function') {
            window.openMessageCenter();
          } else if (typeof window.raMessages === 'function') {
            window.raMessages();
          } else {
            window.open('messages.html', '_blank');
          }
          break;
        case 'help':
          if (typeof window.showShortcuts === 'function') {
            window.showShortcuts();
          } else if (typeof window.showToast === 'function') {
            window.showToast('⚡ Quick Actions: Instant access to core Reception workflows.', 'info');
          }
          break;
        default:
          console.warn('Unknown reception quick action:', action);
      }
    } catch (err) {
      console.error('Error executing reception quick action:', err);
      if (typeof window.showToast === 'function') {
        window.showToast('Quick action failed: ' + err.message, 'error');
      }
    }
  };

  function injectQuickPanel() {
    var aside = document.querySelector('.aside');
    if (!aside || document.getElementById('receptionDoctorQuickPanel')) return false;

    var panel = document.createElement('div');
    panel.id = 'receptionDoctorQuickPanel';
    panel.className = 'panel reception-quick-panel';
    panel.innerHTML =
      '<div class="section-title reception-quick-headbar">⚡ Quick Actions</div>' +
      '<div class="reception-quick-actions">' +
        '<div class="qa-card" onclick="receptionQuickAction(\'search\')" title="Search patient">' +
          '<div class="qa-ic" style="background:#eaf2ff; color:#0071e3;"><i class="ti ti-user-search"></i></div>' +
          '<div class="qa-label">Search patient</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'register\')" title="Register new patient">' +
          '<div class="qa-ic" style="background:#e9f9ee; color:#1a7a32;"><i class="ti ti-user-plus"></i></div>' +
          '<div class="qa-label">Register patient</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'queue\')" title="Live queue">' +
          '<div class="qa-ic" style="background:#e6f6f8; color:#007080;"><i class="ti ti-list-numbers"></i></div>' +
          '<div class="qa-label">Queue list</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'callnext\')" title="Call next patient">' +
          '<div class="qa-ic" style="background:#e9f9ee; color:#1a7a32;"><i class="ti ti-player-play"></i></div>' +
          '<div class="qa-label">Call next</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'appointments\')" title="Appointments & RDV">' +
          '<div class="qa-ic" style="background:#f5eaff; color:#7c3aed;"><i class="ti ti-calendar-plus"></i></div>' +
          '<div class="qa-label">Appointments</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'referrals\')" title="Referrals">' +
          '<div class="qa-ic" style="background:#eaf2ff; color:#0071e3;"><i class="ti ti-git-branch"></i></div>' +
          '<div class="qa-label">Referrals</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'beds\')" title="Bed occupancy">' +
          '<div class="qa-ic" style="background:#fff4e0; color:#b85d00;"><i class="ti ti-bed"></i></div>' +
          '<div class="qa-label">Bed occupancy</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'admission\')" title="Patient admission">' +
          '<div class="qa-ic" style="background:#fff4e0; color:#b85d00;"><i class="ti ti-login-2"></i></div>' +
          '<div class="qa-label">Admission</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'printcard\')" title="Print patient ID card">' +
          '<div class="qa-ic" style="background:#f1f5f9; color:#475569;"><i class="ti ti-id-badge-2"></i></div>' +
          '<div class="qa-label">Print ID card</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'emergency\')" title="Emergency triage">' +
          '<div class="qa-ic" style="background:#ffebe9; color:#c0392b;"><i class="ti ti-emergency-bed"></i></div>' +
          '<div class="qa-label">Emergency</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'messages\')" title="Message center">' +
          '<div class="qa-ic" style="background:#f5eaff; color:#7c3aed;"><i class="ti ti-message-circle"></i></div>' +
          '<div class="qa-label">Messages</div>' +
        '</div>' +
        '<div class="qa-card" onclick="receptionQuickAction(\'help\')" title="Help & shortcuts" style="margin-bottom:0;">' +
          '<div class="qa-ic" style="background:#eaf2ff; color:#0284c7;"><i class="ti ti-help"></i></div>' +
          '<div class="qa-label">Help & shortcuts</div>' +
        '</div>' +
      '</div>';

    aside.insertAdjacentElement('afterbegin', panel);
    return true;
  }

  onReady(function () {
    injectQuickPanel();
  });
})();
