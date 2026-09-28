(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
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
            focus('#receptionDockSearch') || focus('#receptionSearch');
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

  /* ── LIVE ACTIVITY & ROTATING FACTS (MATCHING HUB) ── */
  var liveIdx = 0;
  function liveFacts() {
    var live = window.__pclinicLive || null;
    var q = live && live.queue != null ? live.queue :
      (typeof window.queue !== 'undefined' && Array.isArray(window.queue) ?
        window.queue.filter(function(x){ return x.status === 'waiting' || x.status === 'in-progress'; }).length :
        (document.getElementById('qcnt') ? document.getElementById('qcnt').textContent : '–'));

    var reg = live && live.today != null ? live.today :
      (typeof window.getPatients === 'function' ?
        (window.getPatients() || []).filter(function(p){
          var today = new Date().toISOString().slice(0, 10);
          return (p.date && p.date.indexOf(today) === 0) || (p.registeredAt && p.registeredAt.indexOf(today) === 0) || p.registeredToday;
        }).length :
        (document.getElementById('stTotal') ? document.getElementById('stTotal').textContent : '–'));

    var total = live && live.total != null ? live.total :
      (typeof window.getPatients === 'function' ? (window.getPatients() || []).length : '–');

    var now = new Date();
    var next = new Date(now); next.setMinutes(0, 0, 0); next.setHours(now.getHours() + 1);
    var mins = Math.max(1, Math.round((next - now) / 6e4));

    return [
      'Queue · ' + q + ' waiting',
      'Today · ' + reg + ' registered',
      'Next slot · in ' + mins + ' min',
      'Total · ' + total + ' patients'
    ];
  }

  function liveTick() {
    var el = document.getElementById('ggLiveTxt');
    if (!el) return;
    var f = liveFacts();
    el.textContent = f[liveIdx % f.length];
    liveIdx++;
    var pill = document.getElementById('ggLive');
    if (pill) {
      pill.classList.remove('swap');
      void pill.offsetWidth;
      pill.classList.add('swap');
    }
  }

  function refreshReceptionHeader() {
    // Date
    var d = new Date();
    var dateEl = document.getElementById('todayDate');
    if (dateEl) {
      dateEl.textContent = '· ' + d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    }

    // Today patients count
    var live = window.__pclinicLive || null;
    var today = d.toISOString().slice(0, 10);
    var todayCount = 0;
    if (live && live.today != null) {
      todayCount = live.today;
    } else if (typeof window.getPatients === 'function') {
      var pts = window.getPatients() || [];
      todayCount = pts.filter(function(p) {
        return (p.date && p.date.indexOf(today) === 0) || (p.registeredAt && p.registeredAt.indexOf(today) === 0) || p.registeredToday;
      }).length;
    }
    var qs = document.getElementById('qsPatients');
    if (qs) qs.textContent = todayCount;

    // Sync theme icon
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var tIcon = document.getElementById('receptionThemeIcon');
    if (tIcon) tIcon.className = isDark ? 'ti ti-sun' : 'ti ti-moon';
  }

  async function fetchReceptionCommonCounts() {
    if (!window.firebaseDB || !window.firebaseFunctions) return null;
    var fs = window.firebaseFunctions, db = window.firebaseDB;
    var today = new Date().toISOString().slice(0, 10);
    var out = {};
    var patientsRef = fs.collection(db, 'patients');
    try {
      var r = await Promise.all([
        fs.getCountFromServer(patientsRef),
        fs.getCountFromServer(fs.query(patientsRef, fs.where('registered', '==', today))),
        fs.getCountFromServer(fs.query(patientsRef, fs.where('queueStatus', '==', 'waiting')))
      ]);
      out.total = r[0].data().count;
      out.today = r[1].data().count;
      out.queue = r[2].data().count;
      out.at = Date.now();
      window.__pclinicLive = out;
      refreshReceptionHeader();
      liveTick();
      return out;
    } catch (e) {
      console.warn('Common server counts query fallback to local cache:', e);
      return null;
    }
  }

  /* ── DOCK SEARCH CAPSULE EVENT HANDLING (MATCHING SCREENSHOT) ── */
  function setupDockSearch() {
    var dockInput = document.getElementById('receptionDockSearch');
    var dockResults = document.getElementById('receptionDockResults');
    if (!dockInput) return;

    function renderDockMatches(query) {
      if (!dockResults) return;
      var q = String(query || '').trim().toLowerCase();
      dockResults.replaceChildren();

      if (q.length < 2) {
        dockResults.classList.remove('open');
        return;
      }

      var patients = [];
      try { patients = window.getPatients() || []; } catch (e) {}

      var words = q.split(/\s+/).filter(Boolean);
      var matches = patients.filter(function (p) {
        var hay = [p.name, p.firstName, p.middleName, p.lastName, p.id, p.mrn, p.phone, p.nationalId].join(' ').toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) !== -1; });
      }).slice(0, 6);

      if (!matches.length) {
        var empty = document.createElement('div');
        empty.style.cssText = 'padding:14px; text-align:center; color:#8e8e93; font-size:11.5px;';
        empty.textContent = 'No matching patient found for “' + q + '”';
        dockResults.appendChild(empty);
      } else {
        matches.forEach(function (p) {
          var item = document.createElement('div');
          item.className = 'reception-dock-item';
          var name = p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient ' + (p.id || ''));
          var mrn = p.mrn || p.id || '—';
          var phone = p.phone || 'No phone';

          item.innerHTML =
            '<div class="rdi-ic" style="background:#eaf2ff; color:#0071e3;"><i class="ti ti-user"></i></div>' +
            '<div style="flex:1; min-width:0;">' +
              '<div class="rdi-name">' + name + '</div>' +
              '<div class="rdi-meta">MRN: ' + mrn + ' · Tel: ' + phone + '</div>' +
            '</div>' +
            '<span style="font-size:10px; font-weight:600; color:#0071e3; background:#eaf2ff; padding:2px 7px; border-radius:6px;">View</span>';

          item.addEventListener('click', function () {
            dockResults.classList.remove('open');
            dockInput.value = '';
            if (typeof window.openPatient === 'function') {
              window.openPatient(p.id);
            } else if (typeof window.showView === 'function') {
              window.showView('history', getNavBtn('history'));
            }
          });

          dockResults.appendChild(item);
        });
      }

      dockResults.classList.add('open');
    }

    dockInput.addEventListener('input', function () {
      var val = this.value;
      var mainSearch = document.getElementById('receptionSearch');
      if (mainSearch) mainSearch.value = val;
      if (typeof window.searchReceptionHub === 'function') {
        window.searchReceptionHub(val);
      }
      renderDockMatches(val);
    });

    dockInput.addEventListener('focus', function () {
      if (this.value.length >= 2) {
        renderDockMatches(this.value);
      }
    });

    dockInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        this.value = '';
        var mainSearch = document.getElementById('receptionSearch');
        if (mainSearch) mainSearch.value = '';
        if (dockResults) dockResults.classList.remove('open');
        this.blur();
      }
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.hub-dock-search')) {
        if (dockResults) dockResults.classList.remove('open');
      }
    });

    // Keyboard shortcut: ⌘F / Ctrl+F
    window.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        dockInput.focus();
        dockInput.select();
      }
    });
  }

  onReady(function () {
    refreshReceptionHeader();
    liveTick();
    setInterval(liveTick, 5000);
    setInterval(refreshReceptionHeader, 10000);

    setupDockSearch();

    window.addEventListener('firebaseReady', function () {
      fetchReceptionCommonCounts();
    });
    window.addEventListener('patientsUpdated', function () {
      setTimeout(fetchReceptionCommonCounts, 1200);
      refreshReceptionHeader();
    });
    window.addEventListener('storage', function (ev) {
      if (!ev || !ev.key || ev.key.indexOf('pclinic_') > -1) {
        refreshReceptionHeader();
        liveTick();
      }
    });

    if (window.firebaseDB && window.firebaseFunctions) {
      fetchReceptionCommonCounts();
    }
  });
})();
