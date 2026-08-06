// ============================================================
// PATIENT DATA MANAGEMENT — FIREBASE + LOCALSTORAGE HYBRID
// v2: Field-level updates with arrayUnion / updateDoc
// Fixes whole-document overwrite race that caused lost updates
// ============================================================

console.log('📋 Loading patient-data.js v2 (field-transform edition)...');

// ─── CONSTANTS ───
const STORAGE_KEY = 'pclinic_patients';
const COLLECTION_NAME = 'patients';
const COUNTER_DOC_PATH = 'config/patientCounter'; // stores { lastId: number }

// ─── STATE ───
let isFirebaseReady = false;
let realtimeUnsubscribe = null;

// ─── HELPERS ───
function getCurrentStaff() {
    return window.currentStaff || { name: 'Unknown', staffId: '', id: '' };
}
function getCurrentStaffName() {
    return (getCurrentStaff().name || 'Unknown').trim();
}
function getCurrentStaffId() {
    const s = getCurrentStaff();
    return s.staffId || s.id || '';
}
function getPatientRef(id) {
    if (!window.firebaseDB || !window.firebaseFunctions) return null;
    const { doc } = window.firebaseFunctions;
    return doc(window.firebaseDB, COLLECTION_NAME, String(id));
}
function parseCounterDocPath() {
    const [col, docId] = COUNTER_DOC_PATH.split('/');
    return { col, docId };
}

// ============================================================
// WAIT FOR FIREBASE TO BE READY
// ============================================================
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.firebaseReady && window.firebaseDB) {
            isFirebaseReady = true;
            console.log('✅ Firebase already ready! Starting real-time sync...');
            startRealtimeSync();
            resolve(true);
            return;
        }
        window.addEventListener('firebaseReady', () => {
            isFirebaseReady = true;
            console.log('✅ Firebase ready! Starting real-time sync...');
            startRealtimeSync();
            resolve(true);
        }, { once: true });
        setTimeout(() => {
            if (!isFirebaseReady) {
                console.warn('⚠️ Firebase not ready, using localStorage only');
                resolve(false);
            }
        }, 5000);
    });
}

// ============================================================
// REAL-TIME SYNC (Firebase → localStorage)
// ============================================================
function startRealtimeSync() {
    if (!window.firebaseDB || !window.firebaseFunctions) return;
    if (realtimeUnsubscribe) {
        console.log('🔄 Real-time sync already active — skipping duplicate');
        return;
    }
    const { collection, onSnapshot, query, orderBy } = window.firebaseFunctions;
    try {
        const patientsRef = collection(window.firebaseDB, COLLECTION_NAME);
        const q = query(patientsRef, orderBy('id', 'asc'));
        realtimeUnsubscribe = onSnapshot(q, (snapshot) => {
            const cloudPatients = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (!data.id) data.id = parseInt(doc.id, 10) || doc.id;
                cloudPatients.push(data);
            });
            // FIX: Don't overwrite local with empty cloud if local has data not yet synced
            // This was causing reception page to show no patients after registration when Firestore was empty/blocked
            var localRaw = localStorage.getItem(STORAGE_KEY);
            var localPatients = [];
            try { localPatients = localRaw ? JSON.parse(localRaw) : []; } catch(e){ localPatients=[]; }
            
            var finalPatients = cloudPatients;
            if (cloudPatients.length === 0 && localPatients.length > 0) {
                console.warn('⚠️ Cloud empty but local has ' + localPatients.length + ' patients - keeping local and will try to upload');
                finalPatients = localPatients;
                // Try to upload local patients that are not in cloud (best effort)
                try {
                    var existingIds = new Set(cloudPatients.map(function(p){ return String(p.id); }));
                    var toUpload = localPatients.filter(function(p){ return !existingIds.has(String(p.id)); });
                    if (toUpload.length > 0) {
                        console.log('☁️ Uploading ' + toUpload.length + ' local patients to cloud...');
                        var fns = window.firebaseFunctions;
                        var db = window.firebaseDB;
                        toUpload.forEach(function(pat){
                            try {
                                var ref = fns.doc(db, COLLECTION_NAME, String(pat.id));
                                fns.setDoc(ref, pat).catch(function(err){ console.warn('Upload failed for', pat.id, err.message); });
                            } catch(e){}
                        });
                    }
                } catch(e){ console.warn('Upload local to cloud failed', e); }
            } else if (cloudPatients.length > 0 && localPatients.length > 0) {
                // Merge: keep cloud as source of truth but preserve any local-only that aren't in cloud yet (for offline)
                var cloudIds = new Set(cloudPatients.map(function(p){ return String(p.id); }));
                var localOnly = localPatients.filter(function(p){ return !cloudIds.has(String(p.id)); });
                if (localOnly.length > 0) {
                    console.log('🔄 Merging ' + localOnly.length + ' local-only patients with ' + cloudPatients.length + ' cloud patients');
                    finalPatients = cloudPatients.concat(localOnly);
                }
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(finalPatients));
            console.log('☁️ Synced', finalPatients.length, 'patients (cloud:' + cloudPatients.length + ' local:' + localPatients.length + ')');
            window.dispatchEvent(new Event('storage'));
            window.dispatchEvent(new CustomEvent('patientsUpdated', { detail: { count: finalPatients.length } }));
        }, (error) => {
            console.error('❌ Firebase sync error:', error);
            // On error, keep local data - don't clear
            console.warn('Keeping local data due to sync error, local count:', getPatients().length);
        });
        console.log('🔄 Real-time sync active (with anti-blank fix)');
    } catch (e) {
        console.error('Error starting sync:', e);
    }
}

// ============================================================
// CORE CRUD — LOCAL CACHE
// ============================================================
function getPatients() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Error loading patients:', e);
        return [];
    }
}

// ============================================================
// SAFE ID GENERATION — TRANSACTIONAL COUNTER
// ============================================================
async function getNextPatientIdSafe() {
    // Try Firestore transaction first
    if (isFirebaseReady && window.firebaseDB && window.firebaseFunctions) {
        try {
            const { doc, runTransaction, getDoc, setDoc } = window.firebaseFunctions;
            const { col, docId } = parseCounterDocPath();
            const counterRef = doc(window.firebaseDB, col, docId);
            const newId = await runTransaction(window.firebaseDB, async (tx) => {
                const snap = await tx.get(counterRef);
                let last = 1000;
                if (snap.exists()) {
                    last = snap.data().lastId || 1000;
                }
                const next = last + 1;
                // If doc doesn't exist yet, set it, else update
                if (!snap.exists()) {
                    tx.set(counterRef, { lastId: next, updatedAt: new Date().toISOString() });
                } else {
                    tx.update(counterRef, { lastId: next, updatedAt: new Date().toISOString() });
                }
                return next;
            });
            return newId;
        } catch (e) {
            console.warn('⚠️ Counter transaction failed, fallback to local max:', e.message);
        }
    }
    // Fallback: local max + 1
    const patients = getPatients();
    if (patients.length === 0) return 1001;
    const maxId = Math.max(...patients.map(p => parseInt(p.id, 10) || 0));
    return (isNaN(maxId) ? 1000 : maxId) + 1;
}

function getNextPatientId() {
    // Kept for backward compat (sync version) but warns
    const patients = getPatients();
    if (patients.length === 0) return 1001;
    const maxId = Math.max(...patients.map(p => parseInt(p.id, 10) || 0));
    return maxId + 1;
}

function getPatient(id) {
    const patients = getPatients();
    return patients.find(p => String(p.id) === String(id)) || null;
}
function getPatientByMRN(mrn) {
    return getPatients().find(p => p.mrn === mrn) || null;
}
function searchPatients(query, opts) {
    const patients = getPatients();
    const q = String(query || '').toLowerCase().trim();
    opts = opts || {};
    if (opts.field) {
        if (!q) return patients;
        return patients.filter(p => String(p[opts.field] || '').toLowerCase().includes(q));
    }
    if (!q) return patients;
    const words = q.split(/\s+/).filter(Boolean);
    return patients.filter(p => {
        const first = String(p.firstName || '').toLowerCase();
        const last = String(p.lastName || '').toLowerCase();
        const full = String(p.name || (first + ' ' + last)).toLowerCase();
        const hay = [full, first, last, String(p.mrn || '').toLowerCase(), String(p.phone || ''), String(p.district || '').toLowerCase(), String(p.location || '').toLowerCase()].join(' ');
        return words.every(w => hay.includes(w));
    });
}
function getPatientsByLocation(loc) {
    const all = getPatients();
    if (!loc || loc === 'all') return all;
    const want = String(loc).toLowerCase();
    return all.filter(p => String(p.location || p.department || '').toLowerCase() === want)
        .sort((a, b) => String(b.locationSince || b.registered || '').localeCompare(String(a.locationSince || a.registered || '')));
}

// ============================================================
// FIRESTORE FIELD-LEVEL OPERATIONS (THE FIX)
// ============================================================
// OLD CODE: setDoc(patientRef, entirePatient) → overwrites everything, loses concurrent edits
// NEW CODE: updateDoc(patientRef, { onlyChangedFields }) + arrayUnion for lists

async function savePatientToFirebase_FIELD_ONLY(patientId, fieldPatch) {
    if (!isFirebaseReady || !window.firebaseDB) return false;
    try {
        const { updateDoc, serverTimestamp } = window.firebaseFunctions;
        const ref = getPatientRef(patientId);
        if (!ref) return false;
        await updateDoc(ref, {
            ...fieldPatch,
            updatedAt: serverTimestamp(),
            updatedBy: getCurrentStaffName(),
            updatedById: getCurrentStaffId()
        });
        return true;
    } catch (e) {
        console.error('❌ Firebase field update error:', e);
        // If document does not exist yet, fallback to setDoc merge
        if (e.code === 'not-found' || String(e.message).includes('No document')) {
            try {
                const { doc, setDoc, serverTimestamp } = window.firebaseFunctions;
                const ref2 = doc(window.firebaseDB, COLLECTION_NAME, String(patientId));
                await setDoc(ref2, {
                    ...fieldPatch,
                    updatedAt: serverTimestamp(),
                    updatedBy: getCurrentStaffName()
                }, { merge: true });
                return true;
            } catch (e2) {
                console.error('Fallback setDoc merge failed:', e2);
            }
        }
        return false;
    }
}

async function savePatientArrayField(patientId, fieldName, newEntry) {
    if (!isFirebaseReady || !window.firebaseDB) return false;
    try {
        const { updateDoc, arrayUnion, serverTimestamp } = window.firebaseFunctions;
        const ref = getPatientRef(patientId);
        await updateDoc(ref, {
            [fieldName]: arrayUnion(newEntry),
            updatedAt: serverTimestamp(),
            updatedBy: getCurrentStaffName(),
            updatedById: getCurrentStaffId()
        });
        return true;
    } catch (e) {
        console.error(`❌ Firebase arrayUnion ${fieldName} error:`, e);
        return false;
    }
}

// ============================================================
// PUBLIC API — NOW SAFE
// ============================================================

async function addPatient(patientData) {
    console.log('🔵 addPatient (safe) called:', patientData);
    const newId = await getNextPatientIdSafe();
    let firstName = patientData.firstName || '';
    let lastName = patientData.lastName || '';
    let fullName = patientData.name || '';
    if (fullName && !firstName && !lastName) {
        const parts = fullName.trim().split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
    }
    if (!fullName && (firstName || lastName)) fullName = (firstName + ' ' + lastName).trim();

    let emergencyContact = patientData.emergencyContact || {};
    if (typeof emergencyContact === 'string') {
        const parts = emergencyContact.split('-').map(s => s.trim());
        emergencyContact = { name: parts[0] || '', relationship: parts[1] || '', phone: parts[2] || '' };
    }

    const nowIso = new Date().toISOString();
    const newPatient = {
        id: newId,
        mrn: String(newId),
        name: fullName || (firstName + ' ' + lastName).trim(),
        firstName, lastName,
        dob: patientData.dob || '',
        gender: patientData.gender || '',
        phone: patientData.phone || '',
        email: patientData.email || '',
        address: patientData.address || '',
        district: patientData.district || '',
        sector: patientData.sector || '',
        cell: patientData.cell || '',
        nationalId: patientData.nationalId || '',
        location: patientData.location || patientData.department || 'OPD',
        locationSince: nowIso,
        locationHistory: [],
        registered: nowIso.slice(0, 10),
        status: 'active',
        department: patientData.department || 'General',
        priority: patientData.priority || 'medium',
        queueStatus: patientData.queueStatus || 'waiting',
        queueAdded: patientData.queueAdded || Date.now(),
        photo: patientData.photo || null,
        vitals: [], triage: [], clinicalNotes: [], prescriptions: [], billingHistory: [],
        labRequests: [], labResults: [], appointments: [], referrals: [], wardRounds: [],
        insurance: patientData.insurance || { provider: '', policyNumber: '', scheme: '', validity: '' },
        emergencyContact,
        createdAt: nowIso,
        createdBy: getCurrentStaffName(),
        createdById: getCurrentStaffId(),
        updatedAt: nowIso,
        updatedBy: getCurrentStaffName()
    };

    // Optimistic local
    const patients = getPatients();
    patients.push(newPatient);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));

    // Firestore: create only this doc (not whole collection)
    if (isFirebaseReady && window.firebaseDB) {
        try {
            const { doc, setDoc, serverTimestamp } = window.firebaseFunctions;
            const ref = doc(window.firebaseDB, COLLECTION_NAME, String(newId));
            await setDoc(ref, {
                ...newPatient,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            console.log('☁️ Patient created in cloud:', newPatient.mrn);
        } catch (e) {
            console.error('❌ Firebase create error:', e);
        }
    }
    return newPatient;
}

async function updatePatient(id, updates) {
    const patients = getPatients();
    const idx = patients.findIndex(p => String(p.id) === String(id));
    if (idx === -1) return null;

    // Merge locally for instant UI
    const merged = {
        ...patients[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: getCurrentStaffName()
    };
    // Keep name in sync if first/last changed
    if (updates.firstName || updates.lastName) {
        const f = updates.firstName || merged.firstName || '';
        const l = updates.lastName || merged.lastName || '';
        merged.name = (f + ' ' + l).trim();
    }
    patients[idx] = merged;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));

    // Firebase: ONLY changed fields
    await savePatientToFirebase_FIELD_ONLY(id, updates);
    console.log('✅ Patient updated (field-level):', merged.mrn, Object.keys(updates));
    return merged;
}

async function setPatientLocation(id, location, note) {
    const p = getPatient(id);
    if (!p) return null;
    const entry = {
        from: p.location || p.department || '',
        to: location,
        at: new Date().toISOString(),
        by: getCurrentStaffName(),
        note: note || ''
    };
    // Local optimistic
    const history = [...(p.locationHistory || []), entry];
    await updatePatient(id, {
        location,
        locationSince: new Date().toISOString(),
        locationHistory: history,
        // also keep single history entry as atomic arrayUnion
    });
    // Firebase: also push single history entry via arrayUnion to avoid overwriting concurrent history
    if (isFirebaseReady) {
        const { updateDoc, arrayUnion, serverTimestamp } = window.firebaseFunctions;
        const ref = getPatientRef(id);
        try {
            await updateDoc(ref, {
                location,
                locationSince: serverTimestamp(),
                locationHistory: arrayUnion(entry),
                updatedAt: serverTimestamp(),
                updatedBy: getCurrentStaffName()
            });
        } catch (e) { console.error(e); }
    }
    return getPatient(id);
}

async function deletePatient(id) {
    const patients = getPatients();
    const patient = patients.find(p => String(p.id) === String(id));
    if (!patient) return false;
    const remaining = patients.filter(p => String(p.id) !== String(id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    window.dispatchEvent(new Event('storage'));

    if (isFirebaseReady && window.firebaseDB) {
        try {
            const { doc, deleteDoc } = window.firebaseFunctions;
            const ref = doc(window.firebaseDB, COLLECTION_NAME, String(id));
            await deleteDoc(ref);
            console.log('☁️ Patient deleted from cloud:', id);
        } catch (e) {
            console.error('❌ Firebase delete error:', e);
            return false;
        }
    }
    console.log('🗑️ Patient deleted:', patient.mrn);
    return true;
}

async function setPatientStatus(id, status) {
    return await updatePatient(id, { status });
}

async function reindexPatients() {
    // Deprecated: with transactional IDs we should not reindex live data
    // Keep for offline-only admin tool, but make it safe
    console.warn('⚠️ reindexPatients is deprecated — IDs are now transactional');
    const patients = getPatients();
    let cur = 1001;
    for (const p of patients) {
        p.id = cur;
        p.mrn = String(cur);
        cur++;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    // Do NOT bulk overwrite Firestore — warn
    console.warn('reindex only updated localStorage. Use migration script to update Firestore if needed.');
    return patients;
}

// ============================================================
// CLINICAL DATA — ALL NOW USE arrayUnion
// ============================================================

async function addVitals(patientId, vitalsData) {
    console.log('🔵 addVitals safe for', patientId);
    let sys = vitalsData.bpSystolic || vitalsData.systolic || null;
    let dia = vitalsData.bpDiastolic || vitalsData.diastolic || null;
    const bpRaw = vitalsData.bp || vitalsData.bloodPressure || '';
    if ((!sys || !dia) && bpRaw) {
        const m = String(bpRaw).match(/(\d+)\s*\/\s*(\d+)/);
        if (m) { sys = sys || m[1]; dia = dia || m[2]; }
    }
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date: new Date().toISOString(),
        at: new Date().toISOString(),
        temperature: vitalsData.temperature || vitalsData.temp || null,
        temp: vitalsData.temp || vitalsData.temperature || null,
        pulse: vitalsData.pulse || null,
        bpSystolic: sys, bpDiastolic: dia,
        bp: bpRaw || ((sys && dia) ? (sys + '/' + dia) : ''),
        spo2: vitalsData.spo2 || vitalsData.spO2 || null,
        weight: vitalsData.weight || null, height: vitalsData.height || null,
        respiratoryRate: vitalsData.respiratoryRate || vitalsData.resp || vitalsData.rr || null,
        rr: vitalsData.rr || vitalsData.respiratoryRate || vitalsData.resp || null,
        bloodGlucose: vitalsData.bloodGlucose || vitalsData.glucose || null,
        painScore: vitalsData.painScore || vitalsData.pain || 0,
        recordedBy: vitalsData.recordedBy || getCurrentStaffName(),
        recordedById: getCurrentStaffId(),
        notes: vitalsData.notes || ''
    };

    // Local
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat) return null;
    if (!pat.vitals) pat.vitals = [];
    pat.vitals.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));

    await savePatientArrayField(patientId, 'vitals', entry);
    return entry;
}

async function addTriage(patientId, triageData) {
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date: new Date().toISOString(),
        level: triageData.level || 4,
        chiefComplaint: triageData.chiefComplaint || '',
        airway: triageData.airway || 'Patent',
        breathing: triageData.breathing || 'Normal',
        circulation: triageData.circulation || 'Normal',
        gcs: triageData.gcs || '15',
        painScore: triageData.painScore || 0,
        disposition: triageData.disposition || 'OPD queue',
        allocatedTo: triageData.allocatedTo || '',
        triagedBy: triageData.triagedBy || getCurrentStaffName(),
        triagedById: getCurrentStaffId(),
        notes: triageData.notes || ''
    };
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat) return null;
    if (!pat.triage) pat.triage = [];
    pat.triage.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    await savePatientArrayField(patientId, 'triage', entry);
    return entry;
}

async function addClinicalNote(patientId, noteData) {
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date: new Date().toISOString(),
        type: noteData.type || 'Consultation',
        subjective: noteData.subjective || '',
        objective: noteData.objective || '',
        assessment: noteData.assessment || '',
        plan: noteData.plan || '',
        doctor: noteData.doctor || getCurrentStaffName(),
        doctorId: getCurrentStaffId(),
        note: noteData.note || '',
        status: noteData.status || 'Stable'
    };
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat) return null;
    if (!pat.clinicalNotes) pat.clinicalNotes = [];
    pat.clinicalNotes.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    await savePatientArrayField(patientId, 'clinicalNotes', entry);
    return entry;
}

async function addAppointment(patientId, apptData) {
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date: apptData.date || '', time: apptData.time || '',
        department: apptData.department || '', doctor: apptData.doctor || '',
        priority: apptData.priority || 'Routine', type: apptData.type || 'Referral',
        status: apptData.status || 'scheduled', notes: apptData.notes || '',
        createdBy: getCurrentStaffName(), createdById: getCurrentStaffId()
    };
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat) return null;
    if (!pat.appointments) pat.appointments = [];
    pat.appointments.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    await savePatientArrayField(patientId, 'appointments', entry);
    return entry;
}

async function addWardRound(patientId, roundData) {
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date: roundData.date || new Date().toISOString().slice(0, 10),
        ward: roundData.ward || '', bed: roundData.bed || '',
        attendingDoctor: roundData.attendingDoctor || getCurrentStaffName(),
        condition: roundData.condition || 'Stable',
        overnightEvents: roundData.overnightEvents || '',
        findings: roundData.findings || '', assessment: roundData.assessment || '',
        plan: roundData.plan || '', dischargePlanning: roundData.dischargePlanning || '',
        recordedBy: getCurrentStaffName(), recordedById: getCurrentStaffId()
    };
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat) return null;
    if (!pat.wardRounds) pat.wardRounds = [];
    pat.wardRounds.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    await savePatientArrayField(patientId, 'wardRounds', entry);
    return entry;
}

function getWardRounds(patientId) {
    const patient = getPatient(patientId);
    return patient ? (patient.wardRounds || []) : [];
}

// ── PRESCRIPTIONS ──
async function addPrescription(patientId, prescriptionData) {
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        timestamp: new Date().toISOString(),
        medication: prescriptionData.medication || '',
        dosage: prescriptionData.dosage || '',
        frequency: prescriptionData.frequency || '',
        duration: prescriptionData.duration || '',
        instructions: prescriptionData.instructions || '',
        prescribedBy: prescriptionData.prescribedBy || getCurrentStaffName(),
        prescribedById: getCurrentStaffId(),
        department: prescriptionData.department || 'General',
        status: 'Pending', dispensedDate: null, dispensedBy: null,
        notes: prescriptionData.notes || ''
    };
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat) return false;
    if (!pat.prescriptions) pat.prescriptions = [];
    pat.prescriptions.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    await savePatientArrayField(patientId, 'prescriptions', entry);
    console.log('✅ Prescription saved (arrayUnion):', patientId);
    return true;
}

function getPrescriptions(patientId) { const p = getPatient(patientId); return p ? (p.prescriptions || []) : []; }
function getPendingPrescriptions(patientId) { return getPrescriptions(patientId).filter(p => p.status === 'Pending'); }

async function dispensePrescription(patientId, prescriptionId, dispensedBy) {
    // For status change, we cannot use arrayUnion (need to update existing element)
    // So we replace the whole prescriptions array via field update — but inside a transaction read-modify-write would be ideal.
    // For now, use optimistic local + field overwrite of prescriptions array (still better than whole doc)
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat || !pat.prescriptions) return false;
    const idx = pat.prescriptions.findIndex(p => String(p.id) === String(prescriptionId));
    if (idx === -1) return false;
    pat.prescriptions[idx] = {
        ...pat.prescriptions[idx],
        status: 'Dispensed',
        dispensedDate: new Date().toISOString(),
        dispensedBy: dispensedBy || getCurrentStaffName(),
        dispensedById: getCurrentStaffId()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    // Firebase: update only prescriptions field (still whole array but not whole patient)
    await savePatientToFirebase_FIELD_ONLY(patientId, { prescriptions: pat.prescriptions });
    return true;
}

function getAllPendingPrescriptions() {
    const all = getPatients(); const res = [];
    all.forEach(patient => {
        (patient.prescriptions || []).forEach(pr => {
            if (pr.status === 'Pending') res.push({ patientId: patient.id, patientName: (patient.firstName || '') + ' ' + (patient.lastName || ''), patientMrn: patient.mrn || 'N/A', prescription: pr });
        });
    });
    return res;
}
function getAllPrescriptions() {
    const all = getPatients(); const res = [];
    all.forEach(patient => {
        (patient.prescriptions || []).forEach(pr => {
            res.push({ patientId: patient.id, patientName: (patient.firstName || '') + ' ' + (patient.lastName || ''), patientMrn: patient.mrn || 'N/A', prescription: pr });
        });
    });
    return res;
}

// ── BILLING ──
function getPatientBills(patientId) { const p = getPatient(patientId); return p ? (p.billingHistory || []) : []; }
function getPendingBills(patientId) { return getPatientBills(patientId).filter(b => b.status === 'Posted' || b.status === 'Pending Payment'); }
function getPaidBills(patientId) { return getPatientBills(patientId).filter(b => b.status === 'Paid' || b.status === 'Completed'); }

async function markBillAsPaid(patientId, billId, paymentMethod) {
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat || !pat.billingHistory) return false;
    const idx = pat.billingHistory.findIndex(b => String(b.id) === String(billId));
    if (idx === -1) return false;
    pat.billingHistory[idx] = { ...pat.billingHistory[idx], status: 'Paid', paymentDate: new Date().toISOString(), paymentMethod: paymentMethod || 'Cash', paidBy: getCurrentStaffName() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    await savePatientToFirebase_FIELD_ONLY(patientId, { billingHistory: pat.billingHistory });
    return true;
}
function getAllBills() {
    const all = getPatients(); const res = [];
    all.forEach(patient => {
        (patient.billingHistory || []).forEach(bill => {
            res.push({ patientId: patient.id, patientName: (patient.firstName || '') + ' ' + (patient.lastName || ''), patientMrn: patient.mrn || 'N/A', bill });
        });
    });
    res.sort((a, b) => new Date(b.bill.timestamp) - new Date(a.bill.timestamp));
    return res;
}
function getUnpaidBills() { return getAllBills().filter(e => e.bill.status === 'Posted' || e.bill.status === 'Pending Payment'); }

// ── LAB ──
async function addLabRequest(patientId, requestData) {
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date: new Date().toISOString(),
        tests: requestData.tests || [], panel: requestData.panel || '',
        priority: requestData.priority || 'Routine',
        requestedBy: requestData.requestedBy || getCurrentStaffName(),
        requestedById: getCurrentStaffId(),
        clinicalDetails: requestData.clinicalDetails || '',
        status: 'pending'
    };
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat) return null;
    if (!pat.labRequests) pat.labRequests = [];
    pat.labRequests.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    await savePatientArrayField(patientId, 'labRequests', entry);
    return entry;
}

async function addLabResult(patientId, resultData) {
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date: new Date().toISOString(),
        test: resultData.test || '', value: resultData.value || resultData.result || '',
        unit: resultData.unit || '', range: resultData.range || resultData.referenceRange || '',
        status: resultData.status || 'normal', requestId: resultData.requestId || null,
        flag: resultData.flag || 'normal',
        performedBy: resultData.performedBy || getCurrentStaffName(),
        performedById: getCurrentStaffId(),
        verifiedBy: resultData.verifiedBy || '',
        notes: resultData.notes || ''
    };
    const patients = getPatients();
    const pat = patients.find(p => String(p.id) === String(patientId));
    if (!pat) return null;
    if (!pat.labResults) pat.labResults = [];
    pat.labResults.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    await savePatientArrayField(patientId, 'labResults', entry);
    return entry;
}

// ── UTILS ──
function getPatientSummary(id) {
    const patient = getPatient(id);
    if (!patient) return null;
    return {
        id: patient.id, mrn: patient.mrn, name: patient.name,
        firstName: patient.firstName, lastName: patient.lastName,
        dob: patient.dob, gender: patient.gender, phone: patient.phone,
        registered: patient.registered, status: patient.status,
        vitalsCount: (patient.vitals || []).length,
        triageCount: (patient.triage || []).length,
        notesCount: (patient.clinicalNotes || []).length,
        prescriptionsCount: (patient.prescriptions || []).length,
        labRequestsCount: (patient.labRequests || []).length,
        labResultsCount: (patient.labResults || []).length,
        appointmentsCount: (patient.appointments || []).length,
        lastVital: (patient.vitals || []).slice(-1)[0] || null,
        lastTriage: (patient.triage || []).slice(-1)[0] || null,
        lastNote: (patient.clinicalNotes || []).slice(-1)[0] || null
    };
}
function getPatientsForDepartment() { return getPatients(); }

async function seedSamplePatients() {
    // REMOVED per user request: no template patients
    console.log('📊 seedSamplePatients disabled — no template patients');
    return;
}

function getFirebaseStatus() {
    return { ready: isFirebaseReady, synced: !!realtimeUnsubscribe, online: navigator.onLine, patients: getPatients().length };
}

// Legacy bulk save — now safe no-op with warning
async function savePatients(patients) {
    console.warn('⚠️ savePatients() bulk whole-doc overwrite is deprecated — use field-level updates');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    window.dispatchEvent(new Event('storage'));
    return true;
}
async function savePatientToFirebase() {
    console.warn('⚠️ savePatientToFirebase() whole-doc is deprecated — use updateDoc');
    return false;
}
async function savePatientsToFirebase() {
    console.warn('⚠️ savePatientsToFirebase() bulk overwrite deprecated');
    return false;
}

// ── EXPOSE ──
window.getPatients = getPatients;
window.savePatients = savePatients;
window.getNextPatientId = getNextPatientId;
window.getNextPatientIdSafe = getNextPatientIdSafe;
window.getPatient = getPatient;
window.getPatientByMRN = getPatientByMRN;
window.searchPatients = searchPatients;
window.getPatientsByLocation = getPatientsByLocation;
window.setPatientLocation = setPatientLocation;
window.addPatient = addPatient;
window.updatePatient = updatePatient;
window.deletePatient = deletePatient;
window.setPatientStatus = setPatientStatus;
window.reindexPatients = reindexPatients;
window.seedSamplePatients = seedSamplePatients;
window.addVitals = addVitals;
window.addTriage = addTriage;
window.addClinicalNote = addClinicalNote;
window.addAppointment = addAppointment;
window.addWardRound = addWardRound;
window.getWardRounds = getWardRounds;
window.addPrescription = addPrescription;
window.getPrescriptions = getPrescriptions;
window.getPendingPrescriptions = getPendingPrescriptions;
window.dispensePrescription = dispensePrescription;
window.getAllPendingPrescriptions = getAllPendingPrescriptions;
window.getAllPrescriptions = getAllPrescriptions;
window.getPatientBills = getPatientBills;
window.getPendingBills = getPendingBills;
window.getPaidBills = getPaidBills;
window.markBillAsPaid = markBillAsPaid;
window.getAllBills = getAllBills;
window.getUnpaidBills = getUnpaidBills;
window.addLabRequest = addLabRequest;
window.addLabResult = addLabResult;
window.getPatientSummary = getPatientSummary;
window.getPatientsForDepartment = getPatientsForDepartment;
window.getFirebaseStatus = getFirebaseStatus;

// ── AUTO-INIT ──
console.log('📋 Patient Data System v2 loading...');
console.log('📊 Local patients:', getPatients().length);
waitForFirebase().then((ready) => {
    if (ready) console.log('✅ Firebase connected! Real-time sync active with field-level updates.');
    else console.log('⚠️ Using localStorage only (offline mode)');
});
console.log('✅ Patient Data System v2 ready — safe updates enabled');
