import { useState, useEffect, useCallback } from "react";

// ── Constants ────────────────────────────────────────────────────────────────

const COLOR_PAIRS = [
  { bg: "#dbeafe", text: "#1e3a8a" },
  { bg: "#d1fae5", text: "#065f46" },
  { bg: "#fef3c7", text: "#78350f" },
  { bg: "#ede9fe", text: "#3730a3" },
  { bg: "#fee2e2", text: "#7f1d1d" },
  { bg: "#ccfbf1", text: "#134e4a" },
];

const INITIAL_APPOINTMENTS = [
  { id: 1, name: "Alice Mutoni",        phone: "+250 788 111 222", date: "2026-06-28", time: "08:30", doctor: "Dr. Amina Uwase — Cardiology",     dept: "Cardiology",  notes: "Follow-up on BP medication", status: "confirmed" },
  { id: 2, name: "Bernard Habiyambere", phone: "+250 788 333 444", date: "2026-06-28", time: "09:00", doctor: "Dr. Jean Habimana — Pediatrics",   dept: "Pediatrics",  notes: "Fever and cough for 3 days", status: "pending"   },
  { id: 3, name: "Claudine Ingabire",   phone: "+250 788 555 666", date: "2026-06-28", time: "10:15", doctor: "Dr. Claire Mugisha — General",      dept: "General",     notes: "Annual checkup",             status: "confirmed" },
  { id: 4, name: "David Nzeyimana",     phone: "+250 788 777 888", date: "2026-06-29", time: "11:00", doctor: "Dr. Eric Nkurunziza — Orthopedics", dept: "Orthopedics", notes: "Knee pain after fall",       status: "pending"   },
  { id: 5, name: "Esther Uwamahoro",    phone: "+250 788 999 000", date: "2026-06-27", time: "14:00", doctor: "Dr. Grace Ineza — Neurology",       dept: "Neurology",   notes: "Recurring migraines",        status: "cancelled" },
];

const DOCTORS = [
  "Dr. Amina Uwase — Cardiology",
  "Dr. Jean Habimana — Pediatrics",
  "Dr. Claire Mugisha — General",
  "Dr. Eric Nkurunziza — Orthopedics",
  "Dr. Grace Ineza — Neurology",
];

const DEPARTMENTS = ["Cardiology", "Pediatrics", "General", "Orthopedics", "Neurology", "Emergency"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split("T")[0];
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function colorFor(id) {
  return COLOR_PAIRS[id % COLOR_PAIRS.length];
}

function formatDateTime(date, time) {
  const dt = new Date(`${date}T${time}`);
  const dateStr = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${dateStr} at ${timeStr}`;
}

// ── Styles (CSS-in-JS) ───────────────────────────────────────────────────────

const css = `
  @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.0.0/dist/tabler-icons.min.css');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #f4f4f2; --surface-1: #ebebea; --surface-2: #ffffff;
    --border: rgba(0,0,0,0.10); --border-strong: rgba(0,0,0,0.18);
    --text-primary: #1a1a18; --text-secondary: #5f5e5a; --text-muted: #888780;
    --accent: #2563eb; --accent-hover: #1d4ed8; --accent-bg: #eff6ff; --accent-text: #1e40af;
    --success-bg: #f0fdf4; --success-text: #166534;
    --warning-bg: #fefce8; --warning-text: #854d0e;
    --danger-bg: #fef2f2;  --danger-text: #991b1b;
    --radius: 8px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1c1a; --surface-1: #252523; --surface-2: #2e2e2b;
      --border: rgba(255,255,255,0.10); --border-strong: rgba(255,255,255,0.18);
      --text-primary: #f0efe8; --text-secondary: #b4b2a9; --text-muted: #888780;
      --accent: #3b82f6; --accent-hover: #60a5fa; --accent-bg: #1e3a5f; --accent-text: #93c5fd;
      --success-bg: #14532d; --success-text: #86efac;
      --warning-bg: #422006; --warning-text: #fde68a;
      --danger-bg: #450a0a;  --danger-text: #fca5a5;
    }
  }

  body { font-family: var(--font); background: var(--bg); color: var(--text-primary); min-height: 100vh; padding: 1.5rem; }

  .page { max-width: 960px; margin: 0 auto; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
  .header h1 { font-size: 20px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .header h1 i { color: var(--accent); font-size: 20px; }
  .header p { font-size: 13px; color: var(--text-muted); margin-top: 3px; }
  .date-badge { font-size: 12px; color: var(--text-muted); background: var(--surface-2); border: 0.5px solid var(--border); border-radius: var(--radius); padding: 6px 12px; display: flex; align-items: center; gap: 6px; }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 1.5rem; }
  .stat { background: var(--surface-2); border: 0.5px solid var(--border); border-radius: 12px; padding: 1rem 1.1rem; }
  .stat .label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
  .stat .value { font-size: 24px; font-weight: 600; }
  .stat .value.blue  { color: var(--accent); }
  .stat .value.green { color: var(--success-text); }
  .stat .value.amber { color: var(--warning-text); }

  .layout { display: grid; grid-template-columns: 340px 1fr; gap: 1rem; align-items: start; }

  @media (max-width: 720px) {
    .stats { grid-template-columns: 1fr 1fr; }
    .layout { grid-template-columns: 1fr; }
  }

  .card { background: var(--surface-2); border: 0.5px solid var(--border); border-radius: 12px; padding: 1.25rem; }
  .card-title { font-size: 14px; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 6px; color: var(--text-primary); }
  .card-title i { font-size: 16px; color: var(--accent); }

  .field { margin-bottom: 0.8rem; }
  .field label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; font-weight: 500; }
  .field input, .field select, .field textarea {
    width: 100%; padding: 8px 10px; font-size: 13px; border-radius: var(--radius);
    border: 0.5px solid var(--border-strong); background: var(--surface-1);
    color: var(--text-primary); font-family: var(--font); transition: border-color 0.15s, box-shadow 0.15s;
  }
  .field input:focus, .field select:focus, .field textarea:focus {
    outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-bg);
  }
  .field textarea { resize: none; height: 60px; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

  .btn-primary {
    width: 100%; padding: 9px; background: var(--accent); color: #fff; border: none;
    border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer;
    margin-top: 6px; display: flex; align-items: center; justify-content: center;
    gap: 6px; transition: background 0.15s;
  }
  .btn-primary:hover { background: var(--accent-hover); }

  .filter-row { display: flex; gap: 8px; margin-bottom: 1rem; }
  .filter-row input, .filter-row select {
    padding: 7px 10px; font-size: 12px; border: 0.5px solid var(--border-strong);
    border-radius: var(--radius); background: var(--surface-1); color: var(--text-primary); font-family: var(--font);
  }
  .filter-row input { flex: 1; }
  .filter-row input:focus, .filter-row select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-bg); }

  .appt-list { display: flex; flex-direction: column; gap: 8px; max-height: 480px; overflow-y: auto; }
  .appt-list::-webkit-scrollbar { width: 4px; }
  .appt-list::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }

  .appt-item { background: var(--surface-1); border: 0.5px solid var(--border); border-radius: var(--radius); padding: 10px 12px; display: flex; align-items: center; gap: 10px; transition: border-color 0.15s; }
  .appt-item:hover { border-color: var(--border-strong); }

  .avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
  .appt-info { flex: 1; min-width: 0; }
  .appt-name { font-size: 13px; font-weight: 600; }
  .appt-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .badge { font-size: 11px; padding: 2px 9px; border-radius: 99px; font-weight: 600; white-space: nowrap; }
  .badge.confirmed { background: var(--success-bg); color: var(--success-text); }
  .badge.pending   { background: var(--warning-bg); color: var(--warning-text); }
  .badge.cancelled { background: var(--danger-bg);  color: var(--danger-text); }

  .actions { display: flex; gap: 4px; }
  .icon-btn { background: none; border: 0.5px solid var(--border-strong); border-radius: var(--radius); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-secondary); transition: background 0.12s, color 0.12s; }
  .icon-btn:hover { background: var(--surface-2); color: var(--text-primary); }
  .icon-btn i { font-size: 14px; }

  .empty { text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); font-size: 13px; }
  .empty i { font-size: 32px; display: block; margin-bottom: 8px; }

  .toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); background: var(--text-primary); color: var(--bg); border-radius: var(--radius); padding: 9px 18px; font-size: 13px; font-weight: 500; z-index: 100; white-space: nowrap; box-shadow: 0 4px 16px rgba(0,0,0,0.15); transition: opacity 0.2s; }
`;

// ── Sub-components ───────────────────────────────────────────────────────────

function Toast({ message, visible }) {
  return (
    <div className="toast" style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}>
      {message}
    </div>
  );
}

function StatCard({ label, value, colorClass }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value ${colorClass}`}>{value}</div>
    </div>
  );
}

function AppointmentItem({ appt, onChangeStatus, onDelete }) {
  const c = colorFor(appt.id);
  return (
    <div className="appt-item">
      <div className="avatar" style={{ background: c.bg, color: c.text }}>
        {initials(appt.name)}
      </div>
      <div className="appt-info">
        <div className="appt-name">{appt.name}</div>
        <div className="appt-meta">
          {appt.doctor} &middot; {formatDateTime(appt.date, appt.time)}
        </div>
      </div>
      <span className={`badge ${appt.status}`}>{appt.status}</span>
      <div className="actions">
        {appt.status === "pending" && (
          <button className="icon-btn" title="Confirm" onClick={() => onChangeStatus(appt.id, "confirmed")}>
            <i className="ti ti-check" />
          </button>
        )}
        {appt.status !== "cancelled" && (
          <button className="icon-btn" title="Cancel" onClick={() => onChangeStatus(appt.id, "cancelled")}>
            <i className="ti ti-x" />
          </button>
        )}
        <button className="icon-btn" title="Delete" onClick={() => onDelete(appt.id)}>
          <i className="ti ti-trash" />
        </button>
      </div>
    </div>
  );
}

function BookingForm({ onBook }) {
  const [form, setForm] = useState({
    name: "", phone: "", date: today(), time: "09:00",
    doctor: "", dept: "", notes: "",
  });

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit() {
    if (!form.name || !form.date || !form.time || !form.doctor) {
      onBook(null, "Please fill in name, date, time and doctor.");
      return;
    }
    onBook(form);
    setForm({ name: "", phone: "", date: today(), time: "09:00", doctor: "", dept: "", notes: "" });
  }

  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-plus" /> Book appointment</div>

      <div className="field">
        <label>Patient name</label>
        <input name="name" type="text" placeholder="Full name" value={form.name} onChange={handleChange} />
      </div>
      <div className="field">
        <label>Phone number</label>
        <input name="phone" type="text" placeholder="+250 7xx xxx xxx" value={form.phone} onChange={handleChange} />
      </div>
      <div className="row2">
        <div className="field">
          <label>Date</label>
          <input name="date" type="date" value={form.date} onChange={handleChange} />
        </div>
        <div className="field">
          <label>Time</label>
          <input name="time" type="time" value={form.time} onChange={handleChange} />
        </div>
      </div>
      <div className="field">
        <label>Doctor</label>
        <select name="doctor" value={form.doctor} onChange={handleChange}>
          <option value="">Select doctor</option>
          {DOCTORS.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Department</label>
        <select name="dept" value={form.dept} onChange={handleChange}>
          <option value="">Select department</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea name="notes" placeholder="Reason for visit..." value={form.notes} onChange={handleChange} />
      </div>
      <button className="btn-primary" onClick={handleSubmit}>
        <i className="ti ti-calendar-plus" /> Confirm booking
      </button>
    </div>
  );
}

function AppointmentList({ appointments, onChangeStatus, onDelete }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = appointments
    .filter((a) => {
      const q = search.toLowerCase();
      return (
        (a.name.toLowerCase().includes(q) || a.doctor.toLowerCase().includes(q)) &&
        (!statusFilter || a.status === statusFilter)
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-list" /> Appointment list</div>
      <div className="filter-row">
        <input
          type="text"
          placeholder="Search patient or doctor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div className="appt-list">
        {filtered.length === 0 ? (
          <div className="empty">
            <i className="ti ti-calendar-off" />
            No appointments found
          </div>
        ) : (
          filtered.map((a) => (
            <AppointmentItem
              key={a.id}
              appt={a}
              onChangeStatus={onChangeStatus}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [appointments, setAppointments] = useState(INITIAL_APPOINTMENTS);
  const [nextId, setNextId] = useState(6);
  const [toast, setToast] = useState({ message: "", visible: false });

  const currentDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const showToast = useCallback((msg) => {
    setToast({ message: msg, visible: true });
    const t = setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 2500);
    return () => clearTimeout(t);
  }, []);

  function handleBook(formData, errorMsg) {
    if (!formData) { showToast(errorMsg); return; }
    setAppointments((prev) => [...prev, { ...formData, id: nextId, status: "pending" }]);
    setNextId((n) => n + 1);
    showToast(`Appointment booked for ${formData.name}`);
  }

  function handleChangeStatus(id, status) {
    setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status } : a));
    showToast(`Appointment ${status}`);
  }

  function handleDelete(id) {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    showToast("Appointment removed");
  }

  const t = today();
  const stats = {
    todayCount: appointments.filter((a) => a.date === t).length,
    confirmed:  appointments.filter((a) => a.status === "confirmed").length,
    pending:    appointments.filter((a) => a.status === "pending").length,
    total:      appointments.length,
  };

  return (
    <>
      <style>{css}</style>
      <div className="page">
        {/* Header */}
        <div className="header">
          <div>
            <h1><i className="ti ti-calendar-event" /> Appointments</h1>
            <p>City General Hospital — Reception desk</p>
          </div>
          <div className="date-badge">
            <i className="ti ti-clock" />
            <span>{currentDate}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="stats">
          <StatCard label="Today's appointments" value={stats.todayCount} colorClass="blue" />
          <StatCard label="Confirmed"            value={stats.confirmed}  colorClass="green" />
          <StatCard label="Pending"              value={stats.pending}    colorClass="amber" />
          <StatCard label="Total patients"       value={stats.total}      colorClass="" />
        </div>

        {/* Main layout */}
        <div className="layout">
          <BookingForm onBook={handleBook} />
          <AppointmentList
            appointments={appointments}
            onChangeStatus={handleChangeStatus}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}
