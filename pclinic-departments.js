/* PClinic shared department / service taxonomy.
 *
 * Precise patient location is a 4-level path:
 *   Setting (Inpatient / Outpatient-OPD) → Service (Surgical / Non-surgical) → Specialty → Unit
 * Examples:
 *   Outpatient - Surgery - Orthopedics
 *   Inpatient - Non-surgical - Pediatrics
 *   Inpatient - Surgery - Cardiothoracic - ICU
 *
 * Structured fields saved on the patient document:
 *   deptSetting, deptServiceType, deptSpecialty, deptUnit
 * The human-readable path is saved in `department` (and `location`).
 * Legacy patients (free-text department) are parsed with alias matching,
 * so old records keep working with the new grouped filters.
 */
(function(){
'use strict';

var TAXONOMY = {
  settings: [
    { id:'outpatient', label:'Outpatient (OPD)' },
    { id:'inpatient',  label:'Inpatient' }
  ],
  serviceTypes: [
    { id:'non-surgical', label:'Non-surgical' },
    { id:'surgical',     label:'Surgical' }
  ],
  specialties: {
    'non-surgical': [
      { id:'general-medicine',   label:'General Medicine (OPD)' },
      { id:'pediatrics',         label:'Pediatrics' },
      { id:'internal-medicine',  label:'Internal Medicine' },
      { id:'cardiology',         label:'Cardiology' },
      { id:'psychiatry',         label:'Psychiatry' },
      { id:'gynecology',         label:'Gynecology & Obstetrics' },
      { id:'neurology',          label:'Neurology' },
      { id:'ent',                label:'ENT (Ear, Nose, Throat)' },
      { id:'ophthalmology',      label:'Ophthalmology' },
      { id:'dermatology',        label:'Dermatology' },
      { id:'nephrology',         label:'Nephrology' },
      { id:'respiratory',        label:'Respiratory' },
      { id:'gastroenterology',   label:'Gastroenterology' },
      { id:'endocrinology',      label:'Endocrinology & Diabetes' }
    ],
    'surgical': [
      { id:'orthopedics',          label:'Orthopedics' },
      { id:'general-surgery',      label:'General Surgery' },
      { id:'pediatric-surgery',    label:'Pediatric Surgery' },
      { id:'cardiothoracic',       label:'Cardiothoracic Surgery' },
      { id:'neurosurgery',         label:'Neurosurgery' },
      { id:'urology',              label:'Urology' },
      { id:'gynecologic-surgery',  label:'Gynecologic Surgery' },
      { id:'ent-surgery',          label:'ENT Surgery' },
      { id:'ophthalmic-surgery',   label:'Ophthalmic Surgery' },
      { id:'plastic-surgery',      label:'Plastic & Reconstructive Surgery' },
      { id:'vascular-surgery',     label:'Vascular Surgery' }
    ]
  },
  units: [
    { id:'',         label:'No specific unit' },
    { id:'icu',      label:'ICU (Intensive Care)' },
    { id:'hcu',      label:'HCU (High Care)' },
    { id:'ward',     label:'Ward' },
    { id:'ot',       label:'OT / Theater' },
    { id:'recovery', label:'Recovery' }
  ]
};

var UNIT_SHORT = { icu:'ICU', hcu:'HCU', ward:'Ward', ot:'OT / Theater', recovery:'Recovery' };

/* Order matters: specific names before generic ones. */
var LEGACY_SPECIALTY_ALIASES = [
  { match:['orthopedics','orthopaedics','ortho'],                     id:'orthopedics',         type:'surgical' },
  { match:['cardiothoracic','cardio-thoracic','cardio tho','cardiotho','cardiothoracis','cto'], id:'cardiothoracic', type:'surgical' },
  { match:['neurosurgery','neuro-surgery'],                           id:'neurosurgery',        type:'surgical' },
  { match:['pediatric surgery','paediatric surgery','paeds surgery'], id:'pediatric-surgery',   type:'surgical' },
  { match:['general surgery','gen surgery'],                          id:'general-surgery',     type:'surgical' },
  { match:['gynecologic surgery','gynaecologic surgery','gynae surgery'], id:'gynecologic-surgery', type:'surgical' },
  { match:['vascular surgery'],                                       id:'vascular-surgery',    type:'surgical' },
  { match:['plastic'],                                                id:'plastic-surgery',     type:'surgical' },
  { match:['urology','uro'],                                          id:'urology',             type:'surgical' },
  { match:['ent surgery'],                                            id:'ent-surgery',         type:'surgical' },
  { match:['ophthalmic surgery','eye surgery'],                       id:'ophthalmic-surgery',  type:'surgical' },
  { match:['pediatrics','paediatrics','pedi'],                        id:'pediatrics',          type:'non-surgical' },
  { match:['cardiology','cardio'],                                    id:'cardiology',          type:'non-surgical' },
  { match:['neurology','neuro'],                                   id:'neurology',           type:'non-surgical' },
  { match:['gynecology','gynaecology','gyne','maternity','obs'],      id:'gynecology',          type:'non-surgical' },
  { match:['psychiatry','psych'],                                     id:'psychiatry',          type:'non-surgical' },
  { match:['internal medicine','internal-medicine'],                  id:'internal-medicine',   type:'non-surgical' },
  { match:['ent','ear nose throat'],                                  id:'ent',                 type:'non-surgical' },
  { match:['ophthalmology','eye'],                                    id:'ophthalmology',       type:'non-surgical' },
  { match:['dermatology','skin'],                                     id:'dermatology',         type:'non-surgical' },
  { match:['nephrology','renal'],                                     id:'nephrology',          type:'non-surgical' },
  { match:['respiratory','pulmonary'],                                id:'respiratory',         type:'non-surgical' },
  { match:['gastroenterology','gastro'],                              id:'gastroenterology',    type:'non-surgical' },
  { match:['endocrinology','diabetes','thyroid'],                     id:'endocrinology',       type:'non-surgical' },
  { match:['general','opd','outpatient','medicine'],                  id:'general-medicine',    type:'non-surgical' }
];

var LEGACY_UNIT_ALIASES = [
  { match:['icu'],              id:'icu' },
  { match:['hcu','high care'],  id:'hcu' },
  { match:['theater','operating'], id:'ot' },
  { match:['ward'],             id:'ward' }
];

function escRe(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function legacyMatch(text, words){
  for(var i=0;i<words.length;i++){
    if(new RegExp('\\b'+escRe(words[i]),'i').test(text)) return true;
  }
  return false;
}

function findSpecialty(id){
  id = String(id||'').toLowerCase();
  var all = (TAXONOMY.specialties['non-surgical']||[]).concat(TAXONOMY.specialties['surgical']||[]);
  for(var i=0;i<all.length;i++){ if(all[i].id===id) return all[i]; }
  for(var j=0;j<all.length;j++){ if(all[j].label.toLowerCase()===id) return all[j]; }
  return null;
}

function findInList(list, id){
  id = String(id||'').toLowerCase();
  for(var i=0;i<list.length;i++){ if(list[i].id===id) return list[i]; }
  return null;
}

function deptKey(setting, type, specialty, unit){
  return [setting||'', type||'', specialty||'', unit||''].join('|');
}

function deptPath(setting, type, specialty, unit){
  var parts=[];
  if(setting) parts.push(setting==='inpatient'?'Inpatient':'Outpatient');
  if(type) parts.push(type==='surgical'?'Surgery':'Non-surgical');
  if(specialty){
    var s = findSpecialty(specialty);
    parts.push(s ? s.label : String(specialty));
  }
  if(unit){
    var u = UNIT_SHORT[String(unit).toLowerCase()];
    parts.push(u || String(unit));
  }
  return parts.join(' - ');
}

/* Resolve a patient's location info from structured fields, falling back to
 * legacy free-text parsing of department/location/visitType. */
function parsePatientDept(p){
  p = p || {};
  var info = { setting:'', type:'', specialty:'', unit:'', path:'', legacy:false };
  if(p.deptSetting || p.deptServiceType || p.deptSpecialty){
    info.setting   = String(p.deptSetting||'').toLowerCase();
    info.type      = String(p.deptServiceType||'').toLowerCase();
    info.specialty = String(p.deptSpecialty||'').toLowerCase();
    info.unit      = String(p.deptUnit||'').toLowerCase();
    info.path = p.department || deptPath(info.setting, info.type, info.specialty, info.unit);
    return info;
  }
  info.legacy = true;
  var text = [p.department, p.location, p.visitType].map(function(x){ return String(x||'').toLowerCase(); }).join(' . ');
  if(/\binpatient\b|\badmitted\b/.test(text)) info.setting = 'inpatient';
  else if(/\boutpatient\b|\bopd\b/.test(text)) info.setting = 'outpatient';
  for(var i=0;i<LEGACY_UNIT_ALIASES.length;i++){
    if(legacyMatch(text, LEGACY_UNIT_ALIASES[i].match)){ info.unit = LEGACY_UNIT_ALIASES[i].id; break; }
  }
  for(var j=0;j<LEGACY_SPECIALTY_ALIASES.length;j++){
    if(legacyMatch(text, LEGACY_SPECIALTY_ALIASES[j].match)){
      info.specialty = LEGACY_SPECIALTY_ALIASES[j].id;
      info.type = LEGACY_SPECIALTY_ALIASES[j].type;
      break;
    }
  }
  info.path = p.department || deptPath(info.setting, info.type, info.specialty, info.unit);
  return info;
}

function deptLabel(p){
  var info = parsePatientDept(p);
  return info.path || (p && p.department) || 'Not set';
}

/* Filter matching.
 * value formats:
 *   '' / 'all'                         → match everything
 *   'setting|type|specialty|unit'      → grouped option (empty or 'any' part = wildcard)
 *   legacy names ('ICU','OPD','Maternity','Emergency','Cardiology'…) → alias match
 */
function deptMatches(p, value){
  value = String(value==null?'':value).trim();
  if(!value || value.toLowerCase()==='all') return true;
  if(value.indexOf('|')===-1) return legacyQuickMatch(p, value.toLowerCase());
  var parts = value.split('|');
  while(parts.length<4) parts.push('');
  var want = { setting:parts[0], type:parts[1], specialty:parts[2], unit:parts[3] };
  var info = parsePatientDept(p);
  function partOk(wantVal, haveVal, unknownPass){
    if(wantVal==='' || wantVal.toLowerCase()==='any') return true;
    if(wantVal.toLowerCase()===haveVal) return true;
    if(unknownPass && info.legacy && !haveVal) return true; /* legacy records have unknown setting/type */
    return false;
  }
  if(!partOk(want.setting, info.setting, true)) return false;
  if(!partOk(want.type, info.type, true)) return false;
  if(!partOk(want.specialty, info.specialty, false)) return false;
  if(!partOk(want.unit, info.unit, false)) return false;
  return true;
}

function legacyQuickMatch(p, name){
  if(!name) return true;
  var info = parsePatientDept(p);
  var text = [p.department, p.location, p.visitType].map(function(x){ return String(x||'').toLowerCase(); }).join(' ');
  if(name==='icu') return info.unit==='icu' || /\bicu\b/.test(text);
  if(name==='hcu') return info.unit==='hcu' || /\bhcu\b/.test(text);
  if(name==='opd' || name==='outpatient') return info.setting==='outpatient' || /\bopd\b|\boutpatient\b|\bgeneral\b/.test(text);
  if(name==='inpatient') return info.setting==='inpatient' || /\binpatient\b|\badmitted\b/.test(text);
  if(name==='emergency') return /\bemergency\b/.test(text);
  if(name==='maternity') return info.specialty==='gynecology' || /\bmaternity\b/.test(text);
  if(name==='general') return info.specialty==='general-medicine' || /\bgeneral\b/.test(text);
  var sp = findSpecialty(name);
  if(sp) return info.specialty===sp.id;
  return info.path.toLowerCase().indexOf(name)!==-1 || text.indexOf(name)!==-1;
}

/* ─── GROUPED FILTER SELECTS ─── */
function fillDeptFilter(el){
  if(!el) return;
  var placeholderText='All depts', placeholderValue='';
  if(el.options && el.options.length){
    placeholderText = el.options[0].textContent;
    placeholderValue = el.options[0].value;
  }
  el.replaceChildren();
  var ph = document.createElement('option');
  ph.value = placeholderValue;
  ph.textContent = placeholderText;
  el.appendChild(ph);

  var groups = [
    ['outpatient','non-surgical','OPD — Non-surgical'],
    ['outpatient','surgical','OPD — Surgical'],
    ['inpatient','non-surgical','Inpatient — Non-surgical'],
    ['inpatient','surgical','Inpatient — Surgical']
  ];
  groups.forEach(function(g){
    var og = document.createElement('optgroup');
    og.label = g[2];
    (TAXONOMY.specialties[g[1]]||[]).forEach(function(s){
      var o = document.createElement('option');
      o.value = deptKey(g[0], g[1], s.id, '');
      o.textContent = s.label;
      og.appendChild(o);
    });
    el.appendChild(og);
  });

  var lg = document.createElement('optgroup');
  lg.label = 'Legacy / other records';
  [['ICU','ICU'],['HCU','HCU (High Care)'],['Maternity','Maternity'],['Emergency','Emergency'],
   ['OPD','OPD (all)'],['Inpatient','Inpatient (all)'],['General','General (old records)']]
  .forEach(function(pair){
    var o = document.createElement('option');
    o.value = pair[0];
    o.textContent = pair[1];
    lg.appendChild(o);
  });
  el.appendChild(lg);
}

function refreshDeptFilters(){
  ['qFDept','histDeptFilter','repDeptFilter'].forEach(function(id){
    fillDeptFilter(document.getElementById(id));
  });
}

/* ─── REGISTRATION FORM (Setting / Service / Specialty / Unit) ─── */
function fillSimpleSelect(el, list, selected){
  el.replaceChildren();
  list.forEach(function(item){
    var o = document.createElement('option');
    o.value = item.id;
    o.textContent = item.label;
    el.appendChild(o);
  });
  if(selected!=null && findInList(list, selected)) el.value = selected;
}

function fillSpecialtyOptions(el, typeId, selectedId){
  var list = TAXONOMY.specialties[typeId] || TAXONOMY.specialties['non-surgical'];
  el.replaceChildren();
  list.forEach(function(item){
    var o = document.createElement('option');
    o.value = item.id;
    o.textContent = item.label;
    el.appendChild(o);
  });
  if(selectedId && findInList(list, selectedId)) el.value = selectedId;
}

function syncDeptForm(){
  var setting = document.getElementById('bSetting');
  var type = document.getElementById('bServiceType');
  var spec = document.getElementById('bSpecialty');
  var unit = document.getElementById('bUnit');
  if(!setting || !type || !spec) return;
  var list = TAXONOMY.specialties[type.value] || TAXONOMY.specialties['non-surgical'];
  if(!findInList(list, spec.value)) spec.value = list.length ? list[0].id : '';
  var path = deptPath(setting.value, type.value, spec.value, unit ? unit.value : '');
  var hidden = document.getElementById('bDept');
  if(hidden) hidden.value = path;
  var prev = document.getElementById('bDeptPreview');
  if(prev) prev.textContent = path ? 'Saved as: ' + path : '';
}

function deptTypeChanged(){
  var type = document.getElementById('bServiceType');
  var spec = document.getElementById('bSpecialty');
  if(type && spec) fillSpecialtyOptions(spec, type.value, '');
  syncDeptForm();
}

function initDeptRegistrationForm(){
  var setting = document.getElementById('bSetting');
  var type = document.getElementById('bServiceType');
  var spec = document.getElementById('bSpecialty');
  var unit = document.getElementById('bUnit');
  if(!setting || !type || !spec || !unit) return;
  fillSimpleSelect(setting, TAXONOMY.settings, 'outpatient');
  fillSimpleSelect(type, TAXONOMY.serviceTypes, 'non-surgical');
  fillSpecialtyOptions(spec, type.value, 'general-medicine');
  fillSimpleSelect(unit, TAXONOMY.units, '');
  syncDeptForm();
}

function resetDeptForm(){
  var setting = document.getElementById('bSetting');
  var type = document.getElementById('bServiceType');
  var spec = document.getElementById('bSpecialty');
  var unit = document.getElementById('bUnit');
  if(!setting || !type || !spec || !unit) return;
  setting.value = 'outpatient';
  type.value = 'non-surgical';
  fillSpecialtyOptions(spec, 'non-surgical', 'general-medicine');
  unit.value = '';
  syncDeptForm();
}

/* Populate the registration form from an existing patient (edit mode). */
function applyDeptToForm(p){
  var setting = document.getElementById('bSetting');
  var type = document.getElementById('bServiceType');
  var spec = document.getElementById('bSpecialty');
  var unit = document.getElementById('bUnit');
  if(!setting || !type || !spec || !unit) return;
  var info = parsePatientDept(p || {});
  setting.value = info.setting || 'outpatient';
  type.value = info.type || 'non-surgical';
  fillSpecialtyOptions(spec, type.value, info.specialty || (type.value==='surgical' ? '' : 'general-medicine'));
  unit.value = info.unit || '';
  syncDeptForm();
}

/* Parse a free-text location (e.g. "in patient - surgery - cardiothoracis - icu",
 * "out patient-surgery-orthopedics", "ICU") into structured parts.
 * Returns null when nothing recognizable is found. */
function parseDeptInput(text){
  var t = String(text==null?'':text).trim();
  if(!t) return null;
  var norm = t.toLowerCase().replace(/\bin\s+patient\b/g,'inpatient').replace(/\bout\s+patient\b/g,'outpatient');
  var info = parsePatientDept({ department: norm, location: norm });
  if(!info.setting && !info.type && !info.specialty && !info.unit) return null;
  var setting = info.setting || 'outpatient';
  var type = info.type || '';
  if(!type && info.specialty){
    type = (TAXONOMY.specialties['surgical']||[]).some(function(x){ return x.id===info.specialty; }) ? 'surgical' : 'non-surgical';
  }
  var path = deptPath(setting, type, info.specialty, info.unit);
  return { setting: setting, type: type, specialty: info.specialty, unit: info.unit, path: path || t };
}

window.PCLINIC_DEPTS = {
  TAXONOMY: TAXONOMY,
  deptKey: deptKey,
  deptPath: deptPath,
  findSpecialty: findSpecialty,
  parsePatientDept: parsePatientDept,
  parseDeptInput: parseDeptInput,
  deptLabel: deptLabel,
  deptMatches: deptMatches,
  fillDeptFilter: fillDeptFilter,
  refreshDeptFilters: refreshDeptFilters,
  initDeptRegistrationForm: initDeptRegistrationForm,
  resetDeptForm: resetDeptForm,
  syncDeptForm: syncDeptForm,
  deptTypeChanged: deptTypeChanged,
  applyDeptToForm: applyDeptToForm
};
})();
