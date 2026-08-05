import { useState, useCallback } from "react";

// ── Tabler Icons CDN (loaded once via a style tag) ───────────────────────────
// Make sure your project loads:
// <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.0.0/dist/tabler-icons.min.css" />

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = [
  { bg: "#dbeafe", txt: "#1e3a8a" },
  { bg: "#d1fae5", txt: "#065f46" },
  { bg: "#fef3c7", txt: "#78350f" },
  { bg: "#ede9fe", txt: "#3730a3" },
  { bg: "#fee2e2", txt: "#7f1d1d" },
  { bg: "#ccfbf1", txt: "#134e4a" },
];

const DOCTORS = [
  "Dr. Amina Uwase — Cardiology",
  "Dr. Jean Habimana — Pediatrics",
  "Dr. Claire Mugisha — General",
  "Dr. Eric Nkurunziza — Orthopedics",
  "Dr. Grace Ineza — Neurology",
];

const DEPARTMENTS = ["Cardiology", "Pediatrics", "General", "Orthopedics", "Neurology", "Emergency"];

const INITIAL_APPOINTMENTS = [
  { id: 1, name: "Alice Mutoni",        phone: "+250 788 111 222", date: "2026-06-28", time: "08:30", doctor: "Dr. Amina Uwase — Cardiology",     dept: "Cardiology",  notes: "Follow-up on BP medication", status: "confirmed" },
  { id: 2, name: "Bernard Habiyambere", phone: "+250 788 333 444", date: "2026-06-28", time: "09:00", doctor: "Dr. Jean Habimana — Pediatrics",   dept: "Pediatrics",  notes: "Fever and cough for 3 days", status: "pending"   },
  { id: 3, name: "Claudine Ingabire",   phone: "+250 788 555 666", date: "2026-06-28", time: "10:15", doctor: "Dr. Claire Mugisha — General",      dept: "General",     notes: "Annual checkup",             status: "confirmed" },
  { id: 4, name: "David Nzeyimana",     phone: "+250 788 777 888", date: "2026-06-29", time: "11:00", doctor: "Dr. Eric Nkurunziza — Orthopedics", dept: "Orthopedics", notes: "Knee pain after fall",       status: "pending"   },
  { id: 5, name: "Esther Uwamahoro",    phone: "+250 788 999 000", date: "2026-06-27", time: "14:00", doctor: "Dr. Grace Ineza — Neurology",       dept: "Neurology",   notes: "Recurring migraines",        status: "cancelled" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function colorFor(id) {
  return COLORS[id % COLORS.length];
}
function fmtDateTime(date, time) {
  const dt = new Date(`${date}T${time}`);
  return (
    dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " · " +
    dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

// ── Global CSS (injected once) ───────────────────────────────────────────────

const GLOBAL_CSS = `
@import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.0.0/dist/tabler-icons.min.css');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #f4f6fb;
  --surface-0: #f4f6fb;
  --surface-1: #ebebea;
  --surface-2: #ffffff;
  --border: rgba(0,0,0,0.09);
  --border-strong: rgba(0,0,0,0.16);
  --text-primary: #1a1a18;
  --text-secondary: #5f5e5a;
  --text-muted: #888780;
  --fill-accent: #2563eb;
  --fill-accent-hover: #1d4ed8;
  --bg-accent: #eff6ff;
  --border-accent: #93c5fd;
  --text-accent: #1e40af;
  --on-accent: #ffffff;
  --bg-success: #f0fdf4; --border-success: #86efac; --text-success: #166534;
  --bg-warning: #fefce8; --border-warning: #fde68a; --text-warning: #854d0e;
  --bg-danger:  #fef2f2; --border-danger:  #fca5a5; --text-danger:  #991b1b;
  --radius: 8px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1c1a;
    --surface-0: #1c1c1a;
    --surface-1: #252523;
    --surface-2: #2e2e2b;
    --border: rgba(255,255,255,0.09);
    --border-strong: rgba(255,255,255,0.16);
    --text-primary: #f0efe8;
    --text-secondary: #b4b2a9;
    --text-muted: #888780;
    --fill-accent: #3b82f6;
    --fill-accent-hover: #60a5fa;
    --bg-accent: #1e3a5f;
    --border-accent: #3b82f6;
    --text-accent: #93c5fd;
    --on-accent: #ffffff;
    --bg-success: #14532d; --text-success: #86efac;
    --bg-warning: #422006; --text-warning: #fde68a;
    --bg-danger:  #450a0a; --text-danger:  #fca5a5;
  }
}

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text-primary);
  font-size: 13px;
}

/* ── Layout ── */
.hms-app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ── Topbar ── */
.hms-topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-bottom: 0.5px solid var(--border); background: var(--surface-2); flex-shrink: 0; }
.hms-topbar-left { display: flex; align-items: center; gap: 10px; }
.hms-logo { width: 30px; height: 30px; border-radius: 8px; background: var(--fill-accent); display: flex; align-items: center; justify-content: center; color: var(--on-accent); }
.hms-logo i { font-size: 16px; }
.hms-title { font-size: 15px; font-weight: 500; }
.hms-subtitle { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.hms-date-chip { font-size: 11px; color: var(--text-muted); background: var(--surface-1); border: 0.5px solid var(--border); border-radius: var(--radius); padding: 5px 10px; display: flex; align-items: center; gap: 5px; }

/* ── Stats ── */
.hms-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 12px 20px; background: var(--surface-1); border-bottom: 0.5px solid var(--border); flex-shrink: 0; }
.hms-stat-card { background: var(--surface-2); border: 0.5px solid var(--border); border-radius: 12px; padding: 11px 13px; display: flex; align-items: center; gap: 10px; }
.hms-stat-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.hms-stat-icon i { font-size: 18px; }
.hms-stat-icon.blue  { background: #dbeafe; color: #185fa5; }
.hms-stat-icon.green { background: #d1fae5; color: #166534; }
.hms-stat-icon.amber { background: #fef3c7; color: #854d0e; }
.hms-stat-icon.teal  { background: #e1f5ee; color: #0f6e56; }
.hms-stat-label { font-size: 11px; color: var(--text-muted); }
.hms-stat-value { font-size: 20px; font-weight: 500; line-height: 1.2; }
.hms-stat-value.blue  { color: #185fa5; }
.hms-stat-value.green { color: #166534; }
.hms-stat-value.amber { color: #854d0e; }
.hms-stat-value.teal  { color: #0f6e56; }

/* ── Main split ── */
.hms-main { display: grid; grid-template-columns: 300px 1fr; flex: 1; min-height: 0; overflow: hidden; }

/* ── Sidebar ── */
.hms-sidebar { border-right: 0.5px solid var(--border); background: var(--surface-2); display: flex; flex-direction: column; overflow: hidden; }
.hms-sidebar-tabs { display: flex; border-bottom: 0.5px solid var(--border); flex-shrink: 0; }
.hms-stab { flex: 1; padding: 10px; font-size: 12px; font-weight: 500; text-align: center; cursor: pointer; color: var(--text-muted); border: none; border-bottom: 2px solid transparent; background: none; transition: color 0.15s, border-color 0.15s; font-family: var(--font); }
.hms-stab.active { color: var(--text-accent); border-bottom-color: var(--fill-accent); }

/* ── Search & filters ── */
.hms-search-panel { padding: 12px 14px; border-bottom: 0.5px solid var(--border); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
.hms-search-wrap { position: relative; }
.hms-search-wrap i { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 14px; pointer-events: none; }
.hms-search-wrap input { padding: 7px 9px 7px 30px; width: 100%; font-size: 12px; border-radius: var(--radius); border: 0.5px solid var(--border-strong); background: var(--surface-1); color: var(--text-primary); font-family: var(--font); }
.hms-search-wrap input:focus { outline: none; border-color: var(--border-accent); box-shadow: 0 0 0 2px var(--bg-accent); }
.hms-filter-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.hms-chip { padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 500; cursor: pointer; border: 0.5px solid var(--border-strong); background: none; color: var(--text-secondary); transition: background 0.12s, color 0.12s; font-family: var(--font); }
.hms-chip.active-all       { background: var(--surface-2); color: var(--text-primary); border-color: var(--border-strong); }
.hms-chip.active-confirmed { background: #d1fae5; color: #065f46; border-color: #6ee7b7; }
.hms-chip.active-pending   { background: #fef3c7; color: #78350f; border-color: #fcd34d; }
.hms-chip.active-cancelled { background: #fee2e2; color: #7f1d1d; border-color: #fca5a5; }

/* ── Patient list ── */
.hms-list-scroll { flex: 1; overflow-y: auto; }
.hms-list-scroll::-webkit-scrollbar { width: 3px; }
.hms-list-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
.hms-appt-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; border-bottom: 0.5px solid var(--border); transition: background 0.1s; }
.hms-appt-row:hover { background: var(--bg-accent); }
.hms-appt-row.selected { background: var(--bg-accent); }
.hms-avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; flex-shrink: 0; }
.hms-appt-info { flex: 1; min-width: 0; }
.hms-appt-name { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hms-appt-meta { font-size: 11px; color: var(--text-muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hms-badge { font-size: 10px; padding: 2px 7px; border-radius: 99px; font-weight: 500; white-space: nowrap; flex-shrink: 0; }
.hms-badge.confirmed { background: #d1fae5; color: #065f46; }
.hms-badge.pending   { background: #fef3c7; color: #78350f; }
.hms-badge.cancelled { background: #fee2e2; color: #7f1d1d; }
.hms-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; gap: 8px; color: var(--text-muted); }
.hms-empty-state i { font-size: 28px; }
.hms-empty-state p { font-size: 12px; }

/* ── Booking form ── */
.hms-form-scroll { flex: 1; overflow-y: auto; padding: 16px; }
.hms-form-scroll::-webkit-scrollbar { width: 3px; }
.hms-form-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
.hms-section-label { font-size: 11px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 10px; }
.hms-field { margin-bottom: 12px; }
.hms-field label { display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; font-weight: 500; }
.hms-field input, .hms-field select, .hms-field textarea {
  width: 100%; padding: 7px 9px; font-size: 12px; border-radius: var(--radius);
  border: 0.5px solid var(--border-strong); background: var(--surface-1);
  color: var(--text-primary); font-family: var(--font);
}
.hms-field input:focus, .hms-field select:focus, .hms-field textarea:focus {
  outline: none; border-color: var(--border-accent); box-shadow: 0 0 0 2px var(--bg-accent);
}
.hms-field textarea { resize: none; height: 52px; }
.hms-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.hms-btn-book { width: 100%; padding: 9px; background: var(--fill-accent); color: var(--on-accent); border: none; border-radius: var(--radius); font-size: 12px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.15s; margin-top: 4px; font-family: var(--font); }
.hms-btn-book:hover { background: var(--fill-accent-hover); }

/* ── Content panel ── */
.hms-content { background: var(--surface-1); display: flex; flex-direction: column; overflow: hidden; }
.hms-content-header { padding: 12px 18px; border-bottom: 0.5px solid var(--border); background: var(--surface-2); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.hms-ctabs { display: flex; gap: 4px; }
.hms-ctab { padding: 6px 12px; font-size: 12px; font-weight: 500; border-radius: var(--radius); cursor: pointer; border: none; background: none; color: var(--text-muted); transition: background 0.12s, color 0.12s; font-family: var(--font); }
.hms-ctab.active { background: var(--surface-1); color: var(--text-primary); }
.hms-header-actions { display: flex; gap: 6px; }
.hms-icon-btn { background: none; border: 0.5px solid var(--border-strong); border-radius: var(--radius); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-secondary); transition: background 0.12s, color 0.12s; }
.hms-icon-btn:hover { background: var(--surface-2); color: var(--text-primary); }
.hms-icon-btn i { font-size: 14px; }

/* ── Detail view ── */
.hms-detail-panel { flex: 1; overflow-y: auto; padding: 18px; }
.hms-detail-panel::-webkit-scrollbar { width: 3px; }
.hms-detail-panel::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
.hms-detail-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 10px; color: var(--text-muted); }
.hms-detail-empty i { font-size: 36px; }
.hms-detail-empty p { font-size: 13px; }
.hms-detail-card { background: var(--surface-2); border: 0.5px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.hms-detail-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.hms-detail-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 500; flex-shrink: 0; }
.hms-detail-name { font-size: 15px; font-weight: 500; }
.hms-detail-phone { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.hms-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.hms-info-item { background: var(--surface-1); border-radius: var(--radius); padding: 8px 10px; }
.hms-info-label { font-size: 10px; color: var(--text-muted); margin-bottom: 2px; }
.hms-info-value { font-size: 12px; font-weight: 500; }
.hms-notes-box { background: var(--surface-1); border-radius: var(--radius); padding: 10px; margin-top: 10px; }
.hms-notes-label { font-size: 10px; color: var(--text-muted); margin-bottom: 4px; }
.hms-notes-text { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
.hms-action-row { display: flex; gap: 8px; }
.hms-action-btn { flex: 1; padding: 8px; border-radius: var(--radius); font-size: 12px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; transition: opacity 0.12s; font-family: var(--font); }
.hms-action-btn:hover { opacity: 0.85; }
.hms-action-btn.confirm { background: #d1fae5; color: #065f46; border: 0.5px solid #6ee7b7; }
.hms-action-btn.cancel  { background: #fee2e2; color: #7f1d1d; border: 0.5px solid #fca5a5; }
.hms-action-btn.delete  { background: var(--surface-1); color: var(--text-secondary); border: 0.5px solid var(--border-strong); }

/* ── Schedule view ── */
.hms-schedule-view { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.hms-schedule-view::-webkit-scrollbar { width: 3px; }
.hms-schedule-view::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
.hms-doctor-block { background: var(--surface-2); border: 0.5px solid var(--border); border-radius: 12px; overflow: hidden; }
.hms-doctor-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 0.5px solid var(--border); }
.hms-doctor-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-accent); color: var(--text-accent); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; flex-shrink: 0; }
.hms-doctor-name { font-size: 13px; font-weight: 500; }
.hms-doctor-dept { font-size: 11px; color: var(--text-muted); }
.hms-doctor-count { margin-left: auto; font-size: 11px; background: var(--bg-accent); color: var(--text-accent); padding: 2px 8px; border-radius: 99px; }
.hms-schedule-slots { padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
.hms-slot { display: flex; align-items: center; gap: 10px; padding: 7px 10px; background: var(--surface-1); border-radius: var(--radius); border: 0.5px solid var(--border); }
.hms-slot-time { font-size: 11px; font-weight: 500; color: var(--text-muted); min-width: 38px; }
.hms-slot-avatar { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 500; flex-shrink: 0; }
.hms-slot-name { font-size: 12px; font-weight: 500; flex: 1; }
.hms-slot-notes { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }

/* ── Toast ── */
.hms-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--text-primary); color: var(--bg); border-radius: var(--radius); padding: 8px 16px; font-size: 12px; font-weight: 500; z-index: 999; white-space: nowrap; pointer-events: none; transition: opacity 0.25s; opacity: 0; }
.hms-toast.show { opacity: 1; }

/* ── Responsive ── */
@media (max-width: 720px) {
  .hms-stats { grid-template-columns: 1fr 1fr; }
  .hms-main  { grid-template-columns: 1fr; }
}
`;

// ── Toast hook ───────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState({ msg: "", show: false });
  const showToast = useCallback((msg) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 2500);
  }, []);
  return [toast, showToast];
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, iconClass, label, value, valueClass }) {
  return (
    <div className="hms-stat-card">
      <div className={`hms-stat-icon ${iconClass}`}>
        <i className={`ti ${icon}`} aria-hidden="true" />
      </div>
      <div>
        <div className="hms-stat-label">{label}</div>
        <div className={`hms-stat-value ${valueClass}`}>{value}</div>
      </div>
    </div>
  );
}

function Badge({ status }) {
  return <span className={`hms-badge ${status}`}>{status}</span>;
}

function Avatar({ name, id, size = 34, fontSize = 11 }) {
  const c = colorFor(id);
  return (
    <div
      className="hms-avatar"
      style={{ width: size, height: size, fontSize, background: c.bg, color: c.txt }}
    >
      {initials(name)}
    </div>
  );
}

// ── Patient list panel ───────────────────────────────────────────────────────

function PatientList({ appointments, selectedId, onSelect }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");

  const filtered = appointments
    .filter((a) => {
      const q = search.toLowerCase();
      return (
        (!filter || a.status === filter) &&
        (!q || a.name.toLowerCase().includes(q) || a.doctor.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const chips = [
    { label: "All", value: "" },
    { label: "Confirmed", value: "confirmed" },
    { label: "Pending", value: "pending" },
    { label: "Cancelled", value: "cancelled" },
  ];

  return (
    <>
      <div className="hms-search-panel">
        <div className="hms-search-wrap">
          <i className="ti ti-search" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search patient or doctor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="hms-filter-chips">
          {chips.map((c) => (
            <button
              key={c.value}
              className={`hms-chip${filter === c.value ? ` active-${c.value || "all"}` : ""}`}
              onClick={() => setFilter(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="hms-list-scroll">
        {filtered.length === 0 ? (
          <div className="hms-empty-state">
            <i className="ti ti-calendar-off" aria-hidden="true" />
            <p>No appointments found</p>
          </div>
        ) : (
          filtered.map((a) => (
            <div
              key={a.id}
              className={`hms-appt-row${selectedId === a.id ? " selected" : ""}`}
              onClick={() => onSelect(a.id)}
              role="button"
              aria-label={`View ${a.name}`}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelect(a.id)}
            >
              <Avatar name={a.name} id={a.id} />
              <div className="hms-appt-info">
                <div className="hms-appt-name">{a.name}</div>
                <div className="hms-appt-meta">
                  {a.doctor.split("—")[0].trim()} · {fmtDateTime(a.date, a.time)}
                </div>
              </div>
              <Badge status={a.status} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── Booking form panel ───────────────────────────────────────────────────────

function BookingForm({ onBook }) {
  const [form, setForm] = useState({
    name: "", phone: "", date: todayStr(), time: "09:00",
    doctor: "", dept: "", notes: "",
  });

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit() {
    if (!form.name || !form.date || !form.time || !form.doctor) {
      onBook(null);
      return;
    }
    onBook({ ...form });
    setForm({ name: "", phone: "", date: todayStr(), time: "09:00", doctor: "", dept: "", notes: "" });
  }

  return (
    <div className="hms-form-scroll">
      <div className="hms-section-label">Patient info</div>
      <div className="hms-field">
        <label>Full name</label>
        <input name="name" type="text" placeholder="e.g. Alice Mutoni" value={form.name} onChange={handleChange} />
      </div>
      <div className="hms-field">
        <label>Phone number</label>
        <input name="phone" type="text" placeholder="+250 7xx xxx xxx" value={form.phone} onChange={handleChange} />
      </div>
      <div className="hms-row2">
        <div className="hms-field">
          <label>Date</label>
          <input name="date" type="date" value={form.date} onChange={handleChange} />
        </div>
        <div className="hms-field">
          <label>Time</label>
          <input name="time" type="time" value={form.time} onChange={handleChange} />
        </div>
      </div>
      <div className="hms-section-label" style={{ marginTop: 4 }}>Appointment details</div>
      <div className="hms-field">
        <label>Doctor</label>
        <select name="doctor" value={form.doctor} onChange={handleChange}>
          <option value="">Select doctor</option>
          {DOCTORS.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="hms-field">
        <label>Department</label>
        <select name="dept" value={form.dept} onChange={handleChange}>
          <option value="">Select department</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="hms-field">
        <label>Reason for visit</label>
        <textarea name="notes" placeholder="Brief description of symptoms or reason…" value={form.notes} onChange={handleChange} />
      </div>
      <button className="hms-btn-book" onClick={handleSubmit}>
        <i className="ti ti-calendar-plus" aria-hidden="true" /> Confirm booking
      </button>
    </div>
  );
}

// ── Detail view ──────────────────────────────────────────────────────────────

function DetailView({ appointment, onChangeStatus, onDelete }) {
  if (!appointment) {
    return (
      <div className="hms-detail-empty">
        <i className="ti ti-cursor-text" aria-hidden="true" />
        <p>Select a patient to view details</p>
      </div>
    );
  }
  const a = appointment;
  const c = colorFor(a.id);
  return (
    <>
      <div className="hms-detail-card">
        <div className="hms-detail-top">
          <div className="hms-detail-avatar" style={{ background: c.bg, color: c.txt }}>
            {initials(a.name)}
          </div>
          <div>
            <div className="hms-detail-name">{a.name}</div>
            <div className="hms-detail-phone">
              <i className="ti ti-phone" style={{ fontSize: 11, verticalAlign: -1 }} aria-hidden="true" />{" "}
              {a.phone || "—"}
            </div>
            <Badge status={a.status} />
          </div>
        </div>
        <div className="hms-info-grid">
          <div className="hms-info-item">
            <div className="hms-info-label">Date &amp; time</div>
            <div className="hms-info-value">{fmtDateTime(a.date, a.time)}</div>
          </div>
          <div className="hms-info-item">
            <div className="hms-info-label">Department</div>
            <div className="hms-info-value">{a.dept || "—"}</div>
          </div>
          <div className="hms-info-item" style={{ gridColumn: "1 / -1" }}>
            <div className="hms-info-label">Doctor</div>
            <div className="hms-info-value">{a.doctor || "—"}</div>
          </div>
        </div>
        <div className="hms-notes-box">
          <div className="hms-notes-label">Notes</div>
          <div className="hms-notes-text">{a.notes || "No notes added."}</div>
        </div>
      </div>
      <div className="hms-action-row">
        {a.status === "pending" && (
          <button className="hms-action-btn confirm" onClick={() => onChangeStatus(a.id, "confirmed")}>
            <i className="ti ti-check" aria-hidden="true" /> Confirm
          </button>
        )}
        {a.status !== "cancelled" && (
          <button className="hms-action-btn cancel" onClick={() => onChangeStatus(a.id, "cancelled")}>
            <i className="ti ti-x" aria-hidden="true" /> Cancel
          </button>
        )}
        <button className="hms-action-btn delete" onClick={() => onDelete(a.id)}>
          <i className="ti ti-trash" aria-hidden="true" /> Delete
        </button>
      </div>
    </>
  );
}

// ── Schedule view ─────────────────────────────────────────────────────────────

function ScheduleView({ appointments }) {
  const byDoctor = appointments.reduce((acc, a) => {
    if (!acc[a.doctor]) acc[a.doctor] = [];
    acc[a.doctor].push(a);
    return acc;
  }, {});

  if (!Object.keys(byDoctor).length) {
    return (
      <div className="hms-detail-empty" style={{ height: 200 }}>
        <i className="ti ti-calendar-off" aria-hidden="true" />
        <p>No appointments scheduled</p>
      </div>
    );
  }

  return (
    <>
      {Object.entries(byDoctor).map(([doc, list]) => {
        const c = colorFor(list[0].id);
        const parts = doc.split("—");
        const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        return (
          <div className="hms-doctor-block" key={doc}>
            <div className="hms-doctor-header">
              <div className="hms-doctor-avatar" style={{ background: c.bg, color: c.txt }}>
                {initials(parts[0].replace("Dr.", "").trim())}
              </div>
              <div>
                <div className="hms-doctor-name">{parts[0].trim()}</div>
                <div className="hms-doctor-dept">{(parts[1] || "").trim()}</div>
              </div>
              <div className="hms-doctor-count">
                {list.length} appt{list.length > 1 ? "s" : ""}
              </div>
            </div>
            <div className="hms-schedule-slots">
              {sorted.map((a) => {
                const ac = colorFor(a.id);
                return (
                  <div className="hms-slot" key={a.id}>
                    <span className="hms-slot-time">{a.time}</span>
                    <div className="hms-slot-avatar" style={{ background: ac.bg, color: ac.txt }}>
                      {initials(a.name)}
                    </div>
                    <span className="hms-slot-name">{a.name}</span>
                    <span className="hms-slot-notes">{a.notes}</span>
                    <Badge status={a.status} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function HospitalAppointmentManager() {
  const [appointments, setAppointments] = useState(INITIAL_APPOINTMENTS);
  const [nextId, setNextId] = useState(6);
  const [selectedId, setSelectedId] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("list"); // "list" | "book"
  const [contentTab, setContentTab] = useState("detail"); // "detail" | "schedule"
  const [toast, showToast] = useToast();

  const today = todayStr();
  const stats = {
    today:     appointments.filter((a) => a.date === today).length,
    confirmed: appointments.filter((a) => a.status === "confirmed").length,
    pending:   appointments.filter((a) => a.status === "pending").length,
    total:     appointments.length,
  };

  const selectedAppt = appointments.find((a) => a.id === selectedId) || null;

  function handleBook(formData) {
    if (!formData) { showToast("Fill in name, date, time and doctor"); return; }
    const newAppt = { ...formData, id: nextId, status: "pending" };
    setAppointments((prev) => [...prev, newAppt]);
    setNextId((n) => n + 1);
    showToast(`Appointment booked for ${formData.name}`);
    setSidebarTab("list");
  }

  function handleChangeStatus(id, status) {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    showToast(`Appointment ${status}`);
  }

  function handleDelete(id) {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
    showToast("Appointment removed");
  }

  function exportCSV() {
    const rows = [
      ["ID", "Name", "Phone", "Date", "Time", "Doctor", "Department", "Notes", "Status"],
      ...appointments.map((a) => [a.id, a.name, a.phone, a.date, a.time, a.doctor, a.dept, a.notes, a.status]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    link.download = "appointments.csv";
    link.click();
    showToast("CSV exported");
  }

  function printList() {
    const rows = appointments
      .map((a) => `<tr><td>${a.name}</td><td>${a.phone || ""}</td><td>${a.date} ${a.time}</td><td>${a.doctor}</td><td>${a.status}</td></tr>`)
      .join("");
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Appointments</title><style>body{font-family:sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px}th{background:#f4f4f2}</style></head><body><h2>Appointment list</h2><table><thead><tr><th>Name</th><th>Phone</th><th>Date/Time</th><th>Doctor</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    win.print();
  }

  const currentDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <div className="hms-app">
        {/* Topbar */}
        <div className="hms-topbar">
          <div className="hms-topbar-left">
            <div className="hms-logo"><i className="ti ti-building-hospital" aria-hidden="true" /></div>
            <div>
              <div className="hms-title">MediCore HMS</div>
              <div className="hms-subtitle">Appointments — Reception</div>
            </div>
          </div>
          <div className="hms-date-chip">
            <i className="ti ti-clock" aria-hidden="true" />
            <span>{currentDate}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="hms-stats">
          <StatCard icon="ti-calendar"     iconClass="blue"  label="Today"     value={stats.today}     valueClass="blue"  />
          <StatCard icon="ti-circle-check" iconClass="green" label="Confirmed" value={stats.confirmed} valueClass="green" />
          <StatCard icon="ti-clock"        iconClass="amber" label="Pending"   value={stats.pending}   valueClass="amber" />
          <StatCard icon="ti-users"        iconClass="teal"  label="Total"     value={stats.total}     valueClass="teal"  />
        </div>

        {/* Main layout */}
        <div className="hms-main">
          {/* Sidebar */}
          <div className="hms-sidebar">
            <div className="hms-sidebar-tabs">
              <button className={`hms-stab${sidebarTab === "list" ? " active" : ""}`} onClick={() => setSidebarTab("list")}>Patients</button>
              <button className={`hms-stab${sidebarTab === "book" ? " active" : ""}`} onClick={() => setSidebarTab("book")}>Book</button>
            </div>
            {sidebarTab === "list" ? (
              <PatientList appointments={appointments} selectedId={selectedId} onSelect={setSelectedId} />
            ) : (
              <BookingForm onBook={handleBook} />
            )}
          </div>

          {/* Content */}
          <div className="hms-content">
            <div className="hms-content-header">
              <div className="hms-ctabs">
                <button className={`hms-ctab${contentTab === "detail" ? " active" : ""}`} onClick={() => setContentTab("detail")}>Detail</button>
                <button className={`hms-ctab${contentTab === "schedule" ? " active" : ""}`} onClick={() => setContentTab("schedule")}>Schedule</button>
              </div>
              <div className="hms-header-actions">
                <button className="hms-icon-btn" title="Export CSV" aria-label="Export CSV" onClick={exportCSV}>
                  <i className="ti ti-download" aria-hidden="true" />
                </button>
                <button className="hms-icon-btn" title="Print list" aria-label="Print list" onClick={printList}>
                  <i className="ti ti-printer" aria-hidden="true" />
                </button>
              </div>
            </div>

            {contentTab === "detail" ? (
              <div className="hms-detail-panel">
                <DetailView appointment={selectedAppt} onChangeStatus={handleChangeStatus} onDelete={handleDelete} />
              </div>
            ) : (
              <div className="hms-schedule-view">
                <ScheduleView appointments={appointments} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      <div className={`hms-toast${toast.show ? " show" : ""}`}>{toast.msg}</div>
    </>
  );
}
