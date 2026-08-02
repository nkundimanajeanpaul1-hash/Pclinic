#!/usr/bin/env python3
"""
Rebuild every clinical file page from one template.

Why
---
Each of the ten pages carried its own ~200-line copy of the same
history/render/save logic. They had already drifted (clinical-note
still had dead prescription code it never used). The shared logic now
lives in pclinic-filepage.js and a page is just a config object, so
each file drops from ~310 lines to ~70.

Layout is v2: single screen, no page scroll, diagnosis/RDV/attachments
as sheets, print opens its own window.
"""
import json, pathlib

D = pathlib.Path('/home/user/uploads')

A = 'area'   # textarea, full width
T = 'text'   # short text, pairs up two per row
S = 'sel'
DT = 'date'

def f(fid, label, kind=T, ph='', panel=None, icon=None, options=None, rows=None):
    d = {'id': fid, 'label': label}
    if kind != T: d['kind'] = kind
    if ph: d['ph'] = ph
    if panel: d['panel'] = panel
    if icon: d['icon'] = icon
    if options: d['options'] = options
    if rows: d['rows'] = rows
    return d


PAGES = {
'opd-file': dict(
    type='opd', ref='OPD', title='OPD File', sub='OPD File',
    docTitle='Out-Patient Consultation', icon='ti-folder-open',
    histTitle='OPD visit history', histUnit='visit',
    newLabel='New OPD File for Today',
    dx=True, rdv=True, att=True, vitals=True, rx=False,
    fields=[
        f('complaint', 'Presenting complaint', T, 'e.g. Fever and headache for 3 days',
          'Consultation', 'ti-stethoscope'),
        f('duration', 'Duration', T, '3 days', 'Consultation'),
        f('history', 'History of presenting illness', A,
          'Onset, duration, character, aggravating and relieving factors…', 'Consultation'),
        f('past', 'Past medical / surgical history', A,
          'Previous illnesses, operations, chronic medication…', 'Consultation'),
        f('exam', 'Examination findings', A, 'General condition, systemic examination…',
          'Examination', 'ti-clipboard-heart'),
        f('plan', 'Management plan', A, 'Investigations, treatment, advice…',
          'Plan', 'ti-clipboard-check'),
    ]),

'clinical-note': dict(
    type='clinical', ref='CN', title='Clinical Note', sub='Clinical',
    docTitle='Clinical Progress Note', icon='ti-notes',
    histTitle='Previous clinical notes', histUnit='note',
    newLabel='New Clinical Note',
    dx=True, rdv=True, att=True, vitals=True, rx=False,
    fields=[
        f('sub', 'Subjective', A, 'What the patient reports today…', 'SOAP note', 'ti-notes'),
        f('obj', 'Objective', A, 'Examination findings, vitals, results…', 'SOAP note'),
        f('ass', 'Assessment', A, 'Clinical impression…', 'SOAP note'),
        f('plan', 'Plan', A, 'Management and next steps…', 'SOAP note'),
    ]),

'surgical-note': dict(
    type='surgical', ref='SN', title='Surgical Note', sub='Surgery',
    docTitle='Operative Note', icon='ti-scissors',
    histTitle='Previous operations', histUnit='operation',
    newLabel='New Surgical Note', signer='Operating Surgeon',
    dx=False, rdv=True, att=True, vitals=False, rx=False,
    fields=[
        f('proc', 'Procedure performed', T, 'e.g. Appendicectomy', 'Operation', 'ti-scissors'),
        f('date', 'Date of operation', DT, '', 'Operation'),
        f('preop', 'Pre-operative diagnosis', T, '', 'Operation'),
        f('postop', 'Post-operative diagnosis', T, '', 'Operation'),
        f('team', 'Surgeon / Assistant', T, '', 'Team', 'ti-users'),
        f('anaes', 'Anaesthetist / Type', T, 'Dr X · Spinal', 'Team'),
        f('find', 'Findings', A, 'What was found at operation…', 'Operation record', 'ti-clipboard-text'),
        f('steps', 'Procedure in detail', A, 'Incision, steps, closure…', 'Operation record'),
        f('ebl', 'Estimated blood loss', T, '150 ml', 'Operation record'),
        f('spec', 'Specimens / Implants', T, 'Sent for histology', 'Operation record'),
        f('plan', 'Post-operative plan', A, 'Analgesia, antibiotics, mobilisation, review…',
          'Post-operative', 'ti-clipboard-check'),
    ]),

'nursing-note': dict(
    type='nursing', ref='NN', title='Nursing Note', sub='Nursing',
    docTitle='Nursing Note', icon='ti-heart-rate-monitor',
    histTitle='Previous nursing notes', histUnit='note',
    newLabel='New Nursing Note', signer='Nurse on duty',
    dx=False, rdv=False, att=True, vitals=True, rx=False,
    fields=[
        f('shift', 'Shift', S, '', 'Shift', 'ti-clock',
          options=['Morning', 'Afternoon', 'Night']),
        f('ward', 'Ward / Bed', T, 'Ward B · Bed 12', 'Shift'),
        f('obs', 'Observations', A, 'General condition, intake/output, wound, pain score…',
          'Care record', 'ti-heart-rate-monitor'),
        f('care', 'Care given', A, 'Medication given, dressing, hygiene, mobilisation…', 'Care record'),
        f('resp', 'Patient response', A, 'How the patient responded…', 'Care record'),
        f('hand', 'Handover / Concerns', A, 'What the next shift must know…',
          'Handover', 'ti-arrows-exchange'),
    ]),

'procedure-note': dict(
    type='procedure', ref='PR', title='Procedure Note', sub='Procedure',
    docTitle='Procedure Note', icon='ti-stethoscope',
    histTitle='Previous procedures', histUnit='procedure',
    newLabel='New Procedure Note',
    dx=False, rdv=True, att=True, vitals=False, rx=False,
    fields=[
        f('proc', 'Procedure', T, 'e.g. Lumbar puncture', 'Procedure', 'ti-stethoscope'),
        f('ind', 'Indication', T, 'Why it was done', 'Procedure'),
        f('consent', 'Consent obtained', S, '', 'Procedure', options=['Yes — written', 'Yes — verbal', 'Emergency, not obtained']),
        f('anaes', 'Anaesthesia / Sedation', T, 'Local lidocaine 1%', 'Procedure'),
        f('desc', 'Description', A, 'How the procedure was carried out…', 'Record', 'ti-clipboard-text'),
        f('comp', 'Complications', A, 'None, or describe…', 'Record'),
        f('plan', 'Post-procedure instructions', A, 'Observation, analgesia, when to review…',
          'Aftercare', 'ti-clipboard-check'),
    ]),

'discharge-summary': dict(
    type='discharge', ref='DS', title='Discharge Summary', sub='Discharge',
    docTitle='Discharge Summary', icon='ti-door-exit',
    histTitle='Previous discharges', histUnit='discharge',
    newLabel='New Discharge Summary',
    dx=True, rdv=True, att=True, vitals=False, rx=False,
    fields=[
        f('adm', 'Date of admission', DT, '', 'Stay', 'ti-calendar'),
        f('disch', 'Date of discharge', DT, '', 'Stay'),
        f('ward', 'Ward', T, 'Medical ward', 'Stay'),
        f('cond', 'Condition on discharge', S, '', 'Stay',
          options=['Recovered', 'Improved', 'Unchanged', 'Referred', 'Against medical advice', 'Deceased']),
        f('reason', 'Reason for admission', A, 'Why the patient was admitted…', 'Clinical', 'ti-report-medical'),
        f('course', 'Course in hospital', A, 'Investigations, treatment, progress…', 'Clinical'),
        f('meds', 'Discharge medication', A, 'Drug, dose, duration — one per line…',
          'Going home', 'ti-pill'),
        f('plan', 'Follow-up instructions', A, 'What the patient must do, danger signs…', 'Going home'),
    ]),

'referral': dict(
    type='referral', ref='RF', title='Referral Letter', sub='Referral',
    docTitle='Referral Letter', icon='ti-send',
    histTitle='Previous referrals', histUnit='referral',
    newLabel='New Referral Letter',
    dx=True, rdv=False, att=True, vitals=False, rx=False,
    fields=[
        f('fac', 'Refer to (facility)', T, 'e.g. CHUK', 'Referred to', 'ti-building-hospital'),
        f('dept', 'Department / Specialist', T, 'Cardiology', 'Referred to'),
        f('urg', 'Urgency', S, '', 'Referred to', options=['Routine', 'Urgent', 'Emergency']),
        f('transport', 'Transport', S, '', 'Referred to', options=['Own means', 'Ambulance', 'Ambulance with escort']),
        f('reason', 'Reason for referral', A, 'What you want the receiving team to do…',
          'Clinical summary', 'ti-report-medical'),
        f('summary', 'Clinical summary', A, 'History, findings, results so far…', 'Clinical summary'),
        f('given', 'Treatment given so far', A, 'Drugs, fluids, procedures already done…', 'Clinical summary'),
    ]),

'ward-round': dict(
    type='ward', ref='WR', title='Ward Round', sub='Ward Round',
    docTitle='Ward Round Note', icon='ti-bed',
    histTitle='Previous ward rounds', histUnit='round',
    newLabel='New Ward Round Note',
    dx=True, rdv=False, att=True, vitals=True, rx=False,
    fields=[
        f('bed', 'Ward / Bed', T, 'Ward B · Bed 12', 'Round', 'ti-bed'),
        f('day', 'Day of admission', T, 'Day 3', 'Round'),
        f('events', 'Overnight events', A, 'What happened since the last round…', 'Review', 'ti-moon'),
        f('exam', 'Examination', A, 'Findings today…', 'Review'),
        f('ass', 'Assessment', A, 'Progress, problems…', 'Review'),
        f('plan', 'Plan for today', A, 'Investigations, treatment changes, discharge planning…',
          'Plan', 'ti-clipboard-check'),
    ]),

'prescription': dict(
    type='prescription', ref='RX', title='Prescription', sub='Prescription',
    docTitle='Prescription', icon='ti-pill',
    histTitle='Previous prescriptions', histUnit='prescription',
    newLabel='New Prescription',
    dx=True, rdv=False, att=False, vitals=False, rx=True,
    fields=[
        f('notes', 'Notes to the pharmacist', A, 'Substitutions allowed, counselling points…',
          'Prescription', 'ti-pill'),
    ]),

'admission-form': dict(
    type='admission', ref='AD', title='Admission Form', sub='Admission',
    docTitle='Admission Form', icon='ti-file-plus',
    histTitle='Previous admissions', histUnit='admission',
    newLabel='New Admission Form',
    dx=True, rdv=False, att=True, vitals=True, rx=False,
    fields=[
        f('ward', 'Ward requested', S, '', 'Admission', 'ti-building-hospital',
          options=['Medical', 'Surgical', 'Paediatric', 'Maternity', 'ICU', 'Isolation']),
        f('los', 'Expected length of stay', T, '3 days', 'Admission'),
        f('prov', 'Provisional diagnosis', T, '', 'Admission'),
        f('cons', 'Admitting consultant', T, '', 'Admission'),
        f('reason', 'Reason for admission', A, 'Why inpatient care is needed…', 'Clinical', 'ti-report-medical'),
        f('hist', 'Relevant history', A, 'Presenting illness, past history, allergies…', 'Clinical'),
        f('exam', 'Examination on admission', A, 'Findings…', 'Clinical'),
        f('plan', 'Initial management plan', A, 'Investigations, treatment, monitoring…',
          'Plan', 'ti-clipboard-check'),
    ]),
}


TEMPLATE = """<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PClinic — {title}</title>
<link rel="icon" type="image/png" href="logo.png">
<link rel="stylesheet" href="pclinic-ui.css">
<link rel="stylesheet" href="pclinic-file.css">
<link rel="preload" as="style" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.0.0/dist/tabler-icons.min.css" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.0.0/dist/tabler-icons.min.css"></noscript>
<script>(function(){{try{{document.documentElement.setAttribute('data-theme',localStorage.getItem('pclinic-theme')||'light');}}catch(e){{}}}})();</script>
</head>
<body class="pcf">

<div class="pc-topbar noprint">
    <div class="pc-brand">
        <img class="pc-logo" src="logo-wide.png" alt="PClinic" width="118" height="30">
        <span class="pc-appsub" id="appSub">{sub}</span>
    </div>
    <div class="pc-tr">
        <button class="pc-iconbtn" onclick="pcToggleTheme()" title="Dark mode"><i class="ti ti-moon" id="themeIcon"></i></button>
        <div class="pc-chip"><span class="pc-avatar" id="userAvatar">··</span><span id="userName">…</span></div>
        <button class="pc-iconbtn" onclick="pclinicLogout()" title="Sign out"><i class="ti ti-logout"></i></button>
    </div>
</div>

<div class="pcf-wrap">
    <div id="pcfRoot" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>
</div>

<div class="pc-toasts noprint"></div>

<script type="module" src="firebase-config.js"></script>
<script src="auth-guard.js"></script>
<script src="pclinic-state.js"></script>
<script src="patient-data.js"></script>
<script src="pclinic-orders.js"></script>
<script src="pclinic-file.js"></script>
<script src="pclinic-filepage.js"></script>
<script>
pcFilePage.init({config});
</script>
<script src="pclinic-handoff.js"></script>
</body>
</html>
"""

written = []
for name, cfg in PAGES.items():
    js = json.dumps(cfg, indent=2, ensure_ascii=False)
    html = TEMPLATE.format(title=cfg['title'], sub=cfg.get('sub', cfg['title']), config=js)
    p = D / (name + '.html')
    old = len(p.read_text(encoding='utf-8').splitlines()) if p.exists() else 0
    p.write_text(html, encoding='utf-8')
    new = len(html.splitlines())
    written.append((name, old, new))

print(f"{'page':<24}{'before':>8}{'after':>8}")
tb = ta = 0
for n, o, a in written:
    print(f'{n:<24}{o:>8}{a:>8}')
    tb += o; ta += a
print(f"{'TOTAL':<24}{tb:>8}{ta:>8}   ({tb-ta} lines of duplication removed)")
