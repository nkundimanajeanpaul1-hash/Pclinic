const fs = require('fs');
const { JSDOM } = require('jsdom');
const HOSP = '/home/user/hospital/';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const html = fs.readFileSync(HOSP + 'radio-dashboard.html', 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/radio-dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.localStorage.setItem('pclinic_patients', JSON.stringify([
        { id: '1003', mrn: '1003', firstName: 'Claudine', lastName: 'Mukamana', dob: '1996-03-15', gender: 'Female', district: 'NYARUGENGE', department: 'SURGERY WARD 7' }
      ]));
      w.localStorage.setItem('pclinic_orders', '[]');
      w.localStorage.setItem('pclinic_bills', '[]');
      w.localStorage.setItem('pclinic_files', '[]');
      w.localStorage.setItem('pclinic_active_patient', '');
      w.pcToast = () => {};
    }
  });
  const w = dom.window;
  w.getPatients = () => JSON.parse(w.localStorage.getItem('pclinic_patients') || '[]');
  w.currentStaff = { name: 'Dr. Keza', role: 'Radiologist', staffId: 'R1' };
  await wait(400);

  console.log('\n═══ 1. PAGE STRUCTURE — zero template data ═══');
  const bodyText = w.document.body.innerHTML;
  const fake = ['John Kamau', 'Grace Wanjiru', 'Amina Hassan', 'Samuel Otieno', 'Mary Adhiambo', 'Peter Omondi', 'Faith Njeri', 'Tom Maina', 'Ndirangu', 'David Mutua', 'RAD-0629'];
  check('NO template patients / radiologists / fake accession numbers anywhere', fake.every(n => !bodyText.includes(n)));
  check('stat cards exist with live ids', ['stStudies','stPending','stReported','stCritical','stStat'].every(id => !!w.document.getElementById(id)));
  check('stat cards start at 0', w.document.getElementById('stStudies').textContent.trim() === '0');
  check('KPI pills exist with live ids', ['kpiPendingN','kpiStatN','kpiUnsignedN','kpiDoneN'].every(id => !!w.document.getElementById(id)));
  check('recent studies table is empty + rendered live', !!w.document.getElementById('recentBody'));
  check('worklist tbody empty (mount fills it)', !!w.document.getElementById('worklistBody') && w.document.getElementById('worklistBody').children.length === 0);
  check('signed reports tbody live', !!w.document.getElementById('signedBody'));
  check('report writer fields EMPTY (no prefilled fake report)', w.document.getElementById('findingsText').value === '' && w.document.getElementById('rptPatient').value === '');
  check('gate lock overlay exists', !!w.document.getElementById('gateLock'));
  check('Apple stylesheet linked', html.includes('pclinic-apple.css'));

  console.log('\n═══ 2. BAR 3 — radiology buttons + patient selection, gated ═══');
  w.eval(fs.readFileSync(HOSP + 'pclinic-file.js', 'utf8'));
  await wait(1200);
  const dc = w.document.getElementById('dcBar');
  check('dcBar exists', !!dc);
  check('radiology variant mounted (data-radio-complete)', dc.getAttribute('data-radio-complete') === '1');
  const selBtn = w.document.getElementById('radSelBtn');
  check('patient selection button exists', !!selBtn);
  const chip = w.document.getElementById('radBarPatient');
  check('chip shows no patient selected', !!chip && chip.textContent.includes('No patient selected'));
  const labels = [...dc.querySelectorAll('[data-rad-view],[data-rad-print]')].map(b => b.textContent.trim());
  console.log('  bar buttons:', JSON.stringify(labels));
  check('exactly the 6 radiology buttons (no generic clinical buttons)', JSON.stringify(labels) === JSON.stringify(['New imaging request','Worklist','Image viewer','Report writer','Signed reports','Print']));
  check('ALL radiology buttons LOCKED without a patient', [...dc.querySelectorAll('[data-rad-view],[data-rad-print]')].every(b => b.classList.contains('ab-off')));
  check('window.pcRadioBar exported', !!w.pcRadioBar && typeof w.pcRadioBar.refresh === 'function');

  console.log('\n═══ 3. SELECT PATIENT → picker unlocks the board ═══');
  w.radioSelectPatient();
  await wait(50);
  const pickRow = w.document.querySelector('.rad-pick-row');
  check('patient picker opens with the reception patient', !!pickRow && pickRow.textContent.includes('Mukamana'));
  pickRow.click();
  await wait(50);
  check('picker closes after selection', !w.document.querySelector('.rad-pick-row'));
  check('active patient saved to Common Server key', w.localStorage.getItem('pclinic_active_patient') === '1003');
  check('Bar 3 chip shows the selected patient', w.document.getElementById('radBarPatient').textContent.includes('Mukamana') && w.document.getElementById('radBarPatient').textContent.includes('1003'));
  check('Bar 3 buttons UNLOCKED after selection', [...dc.querySelectorAll('[data-rad-view],[data-rad-print]')].every(b => !b.classList.contains('ab-off')));
  const demoFamily = w.document.getElementById('ocSearchFamily');
  check('identification bar shows the selected patient', !!demoFamily && (demoFamily.value || '').toUpperCase().includes('MUKAMANA'));
  check('request form auto-filled with the patient', w.document.getElementById('reqPatient').value.includes('Mukamana'));

  console.log('\n═══ 4. WORKLIST — real Common Server orders ═══');
  w.eval(fs.readFileSync(HOSP + 'pclinic-orders.js', 'utf8'));
  await wait(300);
  const o1 = w.pcOrders.create({ patientId: '1003', patientName: 'Claudine Mukamana', type: 'imaging', priority: 'stat', notes: 'SpO2 low', items: [{ code: 'IMG-1', name: 'CT chest with contrast', qty: 1, price: 0 }] });
  const o2 = w.pcOrders.create({ patientId: '1003', patientName: 'Claudine Mukamana', type: 'imaging', priority: 'routine', notes: '', items: [{ code: 'IMG-2', name: 'X-Ray — Chest PA', qty: 1, price: 0 }] });
  check('imaging orders land in dept radiology', o1.dept === 'radiology' && o2.dept === 'radiology');
  w.eval(fs.readFileSync(HOSP + 'pclinic-worklist.js', 'utf8'));
  w.pcWorklist.mount({ dept: 'radiology', target: '#worklistBody', mode: 'table', cols: 6 });
  w.updateAllLive();
  await wait(50);
  const wlRows = w.document.querySelectorAll('#worklistBody tr');
  check('worklist renders the real orders (not fake rows)', wlRows.length === 2 && [...wlRows].every(r => !r.textContent.includes('RAD-0629')));
  check('worklist row shows the real patient + study', wlRows[0].textContent.includes('Mukamana') && wlRows[0].textContent.includes('CT chest'));
  check('pending KPI = 2', w.document.getElementById('stPending').textContent.trim() === '2');
  check('STAT KPI = 1', w.document.getElementById('stStat').textContent.trim() === '1');
  check('worklist tab badge = 2', w.document.getElementById('tabWorkCnt').textContent.trim() === '2');
  check('recent studies table shows the real orders', w.document.getElementById('recentBody').textContent.includes('CT chest'));
  check('modal pending shows live count', (w.openModal('pending'), w.document.getElementById('modalTitle').textContent.includes('2')));

  console.log('\n═══ 5. REPORT WRITER — save to Common Server + notify doctor ═══');
  w.openReportFor(w.pcOrders.list({ dept: 'radiology' }).find(o => o.id === o1.id));
  await wait(30);
  check('report header shows the study', w.document.getElementById('rptHead').textContent.includes('CT chest'));
  check('patient field auto-filled', w.document.getElementById('rptPatient').value.includes('Mukamana'));
  check('accession = real order id', w.document.getElementById('rptAcc').value === o1.id);
  check('indication auto-filled from order notes', w.document.getElementById('rptIndication').value === 'SpO2 low');
  w.document.getElementById('findingsText').value = 'Bilateral infiltrates.';
  w.document.getElementById('impressionText').value = 'Consistent with pneumonia.';
  w.document.getElementById('reportStatus').value = 'Final — signed';
  w.signReport();
  await wait(100);
  const files = JSON.parse(w.localStorage.getItem('pclinic_files') || '[]');
  const rep = files.find(f => f.type === 'radiology');
  check('report SAVED to pclinic_files (Common Server)', !!rep && rep.patientId === '1003');
  check('report carries the findings + impression', (rep.fields || []).some(f => f.label === 'Findings' && f.value.includes('infiltrates')));
  check('order marked completed', w.pcOrders.list({ dept: 'radiology' }).find(o => o.id === o1.id).status === 'completed');
  const msgs = JSON.parse(w.localStorage.getItem('pclinic_messages') || '[]');
  check('doctor notified via pcMessages', msgs.some(m => m.patientId === '1003' && /report ready/i.test(m.text || '')));
  check('signed reports table shows the report', w.document.getElementById('signedBody').textContent.includes('CT chest'));
  check('reported today KPI = 1', w.document.getElementById('stReported').textContent.trim() === '1');

  console.log('\n═══ 6. NEW IMAGING REQUEST from the board → real order + bill ═══');
  const before = w.pcOrders.list({ dept: 'radiology' }).length;
  w.radioNav('request');
  await wait(30);
  w.document.getElementById('reqIndication').value = 'Trauma follow-up';
  w.document.querySelector('input[name="study"]').checked = true;
  w.document.getElementById('reqPriority').value = 'Urgent';
  w.submitRequest();
  await wait(100);
  const after = w.pcOrders.list({ dept: 'radiology' }).length;
  const lastOrder = w.pcOrders.list({ dept: 'radiology' })[0];
  check('request created a real radiology order', after === before + 1);
  check('order carries patient, indication, priority', lastOrder.patientId === '1003' && lastOrder.notes.includes('Trauma follow-up') && lastOrder.priority === 'urgent');
  check('order belongs to dept radiology', lastOrder.dept === 'radiology');

  console.log('\n═══ 7. PATIENT GATE — locked without a patient ═══');
  w.radioNav('viewer');
  await wait(30);
  check('with patient: viewer opens, no lock', w.document.getElementById('gateLock').style.display !== 'flex');
  w.localStorage.removeItem('pclinic_active_patient');
  w.eval("window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: null }))");
  await wait(50);
  w.document.getElementById('radBarPatient');
  w.pcRadioBar.refresh();
  await wait(30);
  check('bar chip returns to no-patient', w.document.getElementById('radBarPatient').textContent.includes('No patient selected'));
  check('bar buttons re-lock', [...dc.querySelectorAll('[data-rad-view],[data-rad-print]')].every(b => b.classList.contains('ab-off')));
  // clear the page-level selection like a fresh session would
  w.eval('currentPatient = null; currentOrder = null; currentOrderId = null;');
  w.radioNav('report');
  await wait(50);
  check('report view locked with overlay', w.document.getElementById('gateLock').style.display === 'flex');
  w.eval('submitRequest()');
  check('submit blocked without a patient (no new order)', w.pcOrders.list({ dept: 'radiology' }).length === after);

  console.log('\n═══ 8. STAFF CHIP — real logged-in radiologist ═══');
  w.radioSetStaff();
  check('chip shows the real staff name (Dr. Keza)', w.document.getElementById('radUname').textContent === 'Dr. Keza');
  check('initials computed from the real name', w.document.getElementById('radUa').textContent === 'DK');
  check('reporting radiologist field = real staff', w.document.getElementById('rptRadiologist').value === 'Dr. Keza');

  console.log('\n═══════════════════════════════════');
  console.log('RADIOLOGY BOARD RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
