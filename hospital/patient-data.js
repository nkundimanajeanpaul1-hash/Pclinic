// ============================================================
// PATIENT DATA MANAGEMENT — FIREBASE + LOCALSTORAGE HYBRID
// Real-time sync across all users
// ============================================================

console.log('📋 Loading patient-data.js (Firebase Edition)...');

// ─── CONSTANTS ───
const STORAGE_KEY = 'pclinic_patients';
const COLLECTION_NAME = 'patients';

// ─── STATE ───
let isFirebaseReady = false;
let realtimeUnsubscribe = null;

// ============================================================
// WAIT FOR FIREBASE TO BE READY
// ============================================================

function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.firebaseReady && window.firebaseDB) {
            isFirebaseReady = true;
            // BUGFIX: this early-return path previously resolved WITHOUT ever
            // calling startRealtimeSync(). It is taken whenever Firebase
            // finishes initialising before this file runs — common on a warm
            // cache, and guaranteed on pages that load patient-data.js without
            // `defer`. The result was a page that silently fell back to
            // localStorage: no live updates, no cross-device sync, no error.
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
        
        // Timeout after 5 seconds → use localStorage only
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

    // Guard against subscribing twice. startRealtimeSync() is now reachable
    // from both branches of waitForFirebase(), and a duplicate onSnapshot
    // listener would double every sync callback and leak the first one.
    if (realtimeUnsubscribe) {
        console.log('🔄 Real-time sync already active — skipping duplicate listener');
        return;
    }

    const { collection, onSnapshot, query, orderBy } = window.firebaseFunctions;
    
    try {
        const patientsRef = collection(window.firebaseDB, COLLECTION_NAME);
        const q = query(patientsRef, orderBy('id', 'asc'));
        
        realtimeUnsubscribe = onSnapshot(q, (snapshot) => {
            const patients = [];
            snapshot.forEach((doc) => {
                patients.push(doc.data());
            });
            
            // Save to localStorage as backup
            localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
            
            console.log('☁️ Synced', patients.length, 'patients from cloud');
            
            // Notify all pages
            window.dispatchEvent(new Event('storage'));
            window.dispatchEvent(new CustomEvent('patientsUpdated', { 
                detail: { count: patients.length } 
            }));
        }, (error) => {
            console.error('❌ Firebase sync error:', error);
        });
        
        console.log('🔄 Real-time sync active');
    } catch (e) {
        console.error('Error starting sync:', e);
    }
}

// ============================================================
// CORE CRUD OPERATIONS
// ============================================================

// ─── GET ALL PATIENTS (from localStorage cache) ───
function getPatients() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            return JSON.parse(data);
        }
        return [];
    } catch (e) {
        console.error('Error loading patients:', e);
        return [];
    }
}

// ─── SAVE PATIENTS (to Firebase + localStorage) ───
async function savePatients(patients) {
    try {
        // Always save to localStorage first (instant)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
        
        // Then save to Firebase (background)
        if (isFirebaseReady && window.firebaseDB) {
            await savePatientsToFirebase(patients);
        }
        
        window.dispatchEvent(new Event('storage'));
        return true;
    } catch (e) {
        console.error('Error saving patients:', e);
        return false;
    }
}

// ─── SAVE SINGLE PATIENT TO FIREBASE ───
async function savePatientToFirebase(patient) {
    if (!isFirebaseReady || !window.firebaseDB) return false;
    
    try {
        const { doc, setDoc } = window.firebaseFunctions;
        const patientRef = doc(window.firebaseDB, COLLECTION_NAME, String(patient.id));
        await setDoc(patientRef, patient);
        console.log('☁️ Patient synced to cloud:', patient.mrn);
        return true;
    } catch (e) {
        console.error('❌ Firebase save error:', e);
        return false;
    }
}

// ─── SAVE ALL PATIENTS TO FIREBASE ───
async function savePatientsToFirebase(patients) {
    if (!isFirebaseReady || !window.firebaseDB) return false;
    
    try {
        const { doc, setDoc } = window.firebaseFunctions;
        
        // Save each patient in parallel
        const promises = patients.map(patient => {
            const patientRef = doc(window.firebaseDB, COLLECTION_NAME, String(patient.id));
            return setDoc(patientRef, patient);
        });
        
        await Promise.all(promises);
        console.log('☁️ Synced', patients.length, 'patients to cloud');
        return true;
    } catch (e) {
        console.error('❌ Firebase bulk save error:', e);
        return false;
    }
}

// ─── DELETE FROM FIREBASE ───
async function deletePatientFromFirebase(patientId) {
    if (!isFirebaseReady || !window.firebaseDB) return false;
    
    try {
        const { doc, deleteDoc } = window.firebaseFunctions;
        const patientRef = doc(window.firebaseDB, COLLECTION_NAME, String(patientId));
        await deleteDoc(patientRef);
        console.log('☁️ Patient deleted from cloud:', patientId);
        return true;
    } catch (e) {
        console.error('❌ Firebase delete error:', e);
        return false;
    }
}

// ─── GET NEXT PATIENT ID ───
function getNextPatientId() {
    const patients = getPatients();
    if (patients.length === 0) return 1001;
    const maxId = Math.max(...patients.map(p => p.id));
    return maxId + 1;
}

// ─── GET PATIENT BY ID ───
function getPatient(id) {
    const patients = getPatients();
    return patients.find(p => p.id === id) || null;
}

// ─── GET PATIENT BY MRN ───
function getPatientByMRN(mrn) {
    const patients = getPatients();
    return patients.find(p => p.mrn === mrn) || null;
}

// ─── SEARCH PATIENTS ───
function searchPatients(query, opts) {
    const patients = getPatients();
    const q = String(query || '').toLowerCase().trim();
    opts = opts || {};

    // Field-scoped search: searchPatients('doe', {field:'lastName'})
    // lets the UI offer separate First name / Family name boxes instead
    // of one blob that matches anything.
    if (opts.field) {
        if (!q) return patients;
        return patients.filter(p => String(p[opts.field] || '').toLowerCase().includes(q));
    }

    if (!q) return patients;

    // Multi-word queries match across first AND family name in either
    // order, so "doe john" finds the same person as "john doe".
    const words = q.split(/\s+/).filter(Boolean);
    return patients.filter(p => {
        const first = String(p.firstName || '').toLowerCase();
        const last  = String(p.lastName  || '').toLowerCase();
        const full  = String(p.name || (first + ' ' + last)).toLowerCase();
        const hay   = [full, first, last,
                       String(p.mrn || '').toLowerCase(),
                       String(p.phone || ''),
                       String(p.district || '').toLowerCase(),
                       String(p.location || '').toLowerCase()].join(' ');
        return words.every(w => hay.includes(w));
    });
}

// ─── FILTER BY LOCATION (OPD / Ward / Theatre / …) ───
function getPatientsByLocation(loc) {
    const all = getPatients();
    if (!loc || loc === 'all') return all;
    const want = String(loc).toLowerCase();
    return all.filter(p =>
        String(p.location || p.department || '').toLowerCase() === want
    ).sort((a, b) => {
        // newest arrival at that location first
        const ad = a.locationSince || a.registered || '';
        const bd = b.locationSince || b.registered || '';
        return String(bd).localeCompare(String(ad));
    });
}

// ─── MOVE A PATIENT TO A LOCATION (records when, and by whom) ───
async function setPatientLocation(id, location, note) {
    const p = getPatient(id);
    if (!p) return null;
    const staff = (window.currentStaff || {}).name || 'Unknown';
    const history = p.locationHistory || [];
    history.push({
        from: p.location || p.department || '',
        to: location,
        at: new Date().toISOString(),
        by: staff,
        note: note || ''
    });
    return await updatePatient(id, {
        location: location,
        locationSince: new Date().toISOString(),
        locationHistory: history
    });
}

// ─── ADD NEW PATIENT ───
async function addPatient(patientData) {
    console.log('🔵 addPatient called with:', patientData);
    
    const patients = getPatients();
    const newId = getNextPatientId();
    
    let firstName = patientData.firstName || '';
    let lastName = patientData.lastName || '';
    let fullName = patientData.name || '';
    
    if (fullName && !firstName && !lastName) {
        const nameParts = fullName.trim().split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
    }
    
    if (!fullName && (firstName || lastName)) {
        fullName = (firstName + ' ' + lastName).trim();
    }
    
    let emergencyContact = patientData.emergencyContact || {};
    if (typeof emergencyContact === 'string') {
        const parts = emergencyContact.split('-').map(s => s.trim());
        emergencyContact = {
            name: parts[0] || '',
            relationship: parts[1] || '',
            phone: parts[2] || ''
        };
    }
    
    const newPatient = {
        id: newId,
        mrn: 'MRN ' + newId,
        name: fullName || (firstName + ' ' + lastName).trim(),
        firstName: firstName,
        lastName: lastName,
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
        locationSince: new Date().toISOString(),
        locationHistory: [],
        registered: new Date().toISOString().slice(0, 10),
        status: 'active',
        department: patientData.department || 'General',
        priority: patientData.priority || 'medium',
        queueStatus: patientData.queueStatus || 'waiting',
        queueAdded: patientData.queueAdded || Date.now(),
        photo: patientData.photo || null,
        vitals: [],
        triage: [],
        clinicalNotes: [],
        prescriptions: [],
        billingHistory: [],
        labRequests: [],
        labResults: [],
        appointments: [],
        referrals: [],
        insurance: patientData.insurance || {
            provider: '',
            policyNumber: '',
            scheme: '',
            validity: ''
        },
        emergencyContact: emergencyContact
    };
    
    patients.push(newPatient);
    
    // Save to localStorage first (instant)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    
    // Then save to Firebase (background)
    if (isFirebaseReady) {
        await savePatientToFirebase(newPatient);
    }
    
    window.dispatchEvent(new Event('storage'));
    console.log('✅ Patient saved:', newPatient.mrn, newPatient.name);
    return newPatient;
}

// ─── UPDATE PATIENT ───
async function updatePatient(id, updates) {
    const patients = getPatients();
    const index = patients.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    patients[index] = { ...patients[index], ...updates };
    
    if (updates.firstName || updates.lastName) {
        const fName = updates.firstName || patients[index].firstName || '';
        const lName = updates.lastName || patients[index].lastName || '';
        patients[index].name = (fName + ' ' + lName).trim();
        patients[index].firstName = fName;
        patients[index].lastName = lName;
    }
    
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    
    // Save to Firebase
    if (isFirebaseReady) {
        await savePatientToFirebase(patients[index]);
    }
    
    window.dispatchEvent(new Event('storage'));
    console.log('✅ Patient updated:', patients[index].mrn);
    return patients[index];
}

// ─── DELETE PATIENT ───
async function deletePatient(id) {
    let patients = getPatients();
    const patient = patients.find(p => p.id === id);
    if (!patient) {
        console.warn('⚠️ Patient not found for deletion:', id);
        return false;
    }
    patients = patients.filter(p => p.id !== id);
    
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    
    // Delete from Firebase
    if (isFirebaseReady) {
        await deletePatientFromFirebase(id);
    }
    
    window.dispatchEvent(new Event('storage'));
    console.log('🗑️ Patient deleted:', patient.mrn);
    return true;
}

// ─── UPDATE PATIENT STATUS ───
async function setPatientStatus(id, status) {
    return await updatePatient(id, { status });
}

// ─── REINDEX PATIENTS ───
async function reindexPatients() {
    const patients = getPatients();
    let currentId = 1001;
    patients.forEach(p => {
        p.id = currentId;
        p.mrn = 'MRN ' + currentId;
        currentId++;
    });
    await savePatients(patients);
    return patients;
}

// ============================================================
// CLINICAL DATA FUNCTIONS
// ============================================================

// ─── ADD VITALS ───
async function addVitals(patientId, vitalsData) {
    console.log('🔵 addVitals called for patient:', patientId);
    
    const patients = getPatients();
    const patient = patients.find(p => p.id === patientId);
    
    if (!patient) {
        console.warn('⚠️ Patient not found:', patientId);
        return null;
    }
    
    // BUG (found by testing): callers pass BP as one string ("128/82"),
    // which this function silently dropped — it only stored bpSystolic /
    // bpDiastolic, so the reading vanished. Accept both shapes and keep
    // them in sync, and store a combined `bp` that readers can use.
    let sys = vitalsData.bpSystolic || vitalsData.systolic || null;
    let dia = vitalsData.bpDiastolic || vitalsData.diastolic || null;
    const bpRaw = vitalsData.bp || vitalsData.bloodPressure || '';
    if ((!sys || !dia) && bpRaw) {
        const m = String(bpRaw).match(/(\d+)\s*\/\s*(\d+)/);
        if (m) { sys = sys || m[1]; dia = dia || m[2]; }
    }

    const vitalsEntry = {
        id: Date.now(),
        date: new Date().toISOString(),
        at: new Date().toISOString(),
        temperature: vitalsData.temperature || vitalsData.temp || null,
        temp: vitalsData.temp || vitalsData.temperature || null,
        pulse: vitalsData.pulse || null,
        bpSystolic: sys,
        bpDiastolic: dia,
        bp: bpRaw || ((sys && dia) ? (sys + '/' + dia) : ''),
        spo2: vitalsData.spo2 || vitalsData.spO2 || null,
        weight: vitalsData.weight || null,
        height: vitalsData.height || null,
        respiratoryRate: vitalsData.respiratoryRate || vitalsData.resp || vitalsData.rr || null,
        rr: vitalsData.rr || vitalsData.respiratoryRate || vitalsData.resp || null,
        bloodGlucose: vitalsData.bloodGlucose || vitalsData.glucose || null,
        painScore: vitalsData.painScore || vitalsData.pain || 0,
        recordedBy: vitalsData.recordedBy || 'Nurse',
        notes: vitalsData.notes || ''
    };
    
    if (!patient.vitals) patient.vitals = [];
    patient.vitals.push(vitalsEntry);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    if (isFirebaseReady) await savePatientToFirebase(patient);
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Vitals saved for patient:', patientId);
    return vitalsEntry;
}

// ─── ADD TRIAGE ───
async function addTriage(patientId, triageData) {
    console.log('🔵 addTriage called for patient:', patientId);
    
    const patients = getPatients();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;
    
    const triageEntry = {
        id: Date.now(),
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
        triagedBy: triageData.triagedBy || 'Unknown',
        notes: triageData.notes || ''
    };
    
    patient.triage.push(triageEntry);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    if (isFirebaseReady) await savePatientToFirebase(patient);
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Triage saved for patient:', patientId);
    return triageEntry;
}

// ─── ADD CLINICAL NOTE ───
async function addClinicalNote(patientId, noteData) {
    console.log('🔵 addClinicalNote called for patient:', patientId);
    
    const patients = getPatients();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;
    
    const noteEntry = {
        id: Date.now(),
        date: new Date().toISOString(),
        type: noteData.type || 'Consultation',
        subjective: noteData.subjective || '',
        objective: noteData.objective || '',
        assessment: noteData.assessment || '',
        plan: noteData.plan || '',
        doctor: noteData.doctor || 'Unknown',
        note: noteData.note || '',
        status: noteData.status || 'Stable'
    };
    
    patient.clinicalNotes.push(noteEntry);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    if (isFirebaseReady) await savePatientToFirebase(patient);
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Clinical note saved for patient:', patientId);
    return noteEntry;
}

// ─── ADD APPOINTMENT ───
async function addAppointment(patientId, apptData) {
    console.log('🔵 addAppointment called for patient:', patientId);
    
    const patients = getPatients();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;
    
    const apptEntry = {
        id: Date.now(),
        date: apptData.date || '',
        time: apptData.time || '',
        department: apptData.department || '',
        doctor: apptData.doctor || '',
        priority: apptData.priority || 'Routine',
        type: apptData.type || 'Referral',
        status: apptData.status || 'scheduled',
        notes: apptData.notes || ''
    };
    
    patient.appointments.push(apptEntry);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    if (isFirebaseReady) await savePatientToFirebase(patient);
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Appointment saved for patient:', patientId);
    return apptEntry;
}

// ─── ADD WARD ROUND ───
async function addWardRound(patientId, roundData) {
    console.log('🔵 addWardRound called for patient:', patientId);
    const patients = getPatients();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;
    if (!patient.wardRounds) patient.wardRounds = [];

    const roundEntry = {
        id: Date.now(),
        date: roundData.date || new Date().toISOString().slice(0,10),
        ward: roundData.ward || '',
        bed: roundData.bed || '',
        attendingDoctor: roundData.attendingDoctor || '',
        condition: roundData.condition || 'Stable',
        overnightEvents: roundData.overnightEvents || '',
        findings: roundData.findings || '',
        assessment: roundData.assessment || '',
        plan: roundData.plan || '',
        dischargePlanning: roundData.dischargePlanning || ''
    };

    patient.wardRounds.push(roundEntry);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    if (isFirebaseReady) await savePatientToFirebase(patient);
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Ward round saved for patient:', patientId);
    return roundEntry;
}

// ─── GET WARD ROUNDS ───
function getWardRounds(patientId) {
    const patient = getPatient(patientId);
    return patient ? (patient.wardRounds || []) : [];
}

// ============================================================
// PRESCRIPTION SYSTEM
// ============================================================

// ─── ADD PRESCRIPTION ───
async function addPrescription(patientId, prescriptionData) {
    console.log('🔵 addPrescription called for patient:', patientId);
    
    const patients = getPatients();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return false;
    
    if (!patient.prescriptions) patient.prescriptions = [];
    
    const prescription = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        medication: prescriptionData.medication || '',
        dosage: prescriptionData.dosage || '',
        frequency: prescriptionData.frequency || '',
        duration: prescriptionData.duration || '',
        instructions: prescriptionData.instructions || '',
        prescribedBy: prescriptionData.prescribedBy || 'Unknown',
        department: prescriptionData.department || 'General',
        status: 'Pending',
        dispensedDate: null,
        dispensedBy: null,
        notes: prescriptionData.notes || ''
    };
    
    patient.prescriptions.push(prescription);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    if (isFirebaseReady) await savePatientToFirebase(patient);
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Prescription saved for patient:', patientId);
    return true;
}

// ─── GET PRESCRIPTIONS ───
function getPrescriptions(patientId) {
    const patient = getPatient(patientId);
    if (!patient) return [];
    return patient.prescriptions || [];
}

// ─── GET PENDING PRESCRIPTIONS ───
function getPendingPrescriptions(patientId) {
    const prescriptions = getPrescriptions(patientId);
    return prescriptions.filter(p => p.status === 'Pending');
}

// ─── DISPENSE PRESCRIPTION ───
async function dispensePrescription(patientId, prescriptionId, dispensedBy) {
    const patients = getPatients();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.prescriptions) return false;
    
    const prescription = patient.prescriptions.find(p => p.id === prescriptionId);
    if (!prescription) return false;
    
    prescription.status = 'Dispensed';
    prescription.dispensedDate = new Date().toISOString();
    prescription.dispensedBy = dispensedBy || 'Pharmacy';
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    if (isFirebaseReady) await savePatientToFirebase(patient);
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Prescription dispensed for patient:', patientId);
    return true;
}

// ─── GET ALL PENDING PRESCRIPTIONS ───
function getAllPendingPrescriptions() {
    const allPatients = getPatients();
    const result = [];
    allPatients.forEach(patient => {
        (patient.prescriptions || []).forEach(prescription => {
            if (prescription.status === 'Pending') {
                result.push({
                    patientId: patient.id,
                    patientName: (patient.firstName || '') + ' ' + (patient.lastName || ''),
                    patientMrn: patient.mrn || 'N/A',
                    prescription: prescription
                });
            }
        });
    });
    return result;
}

// ─── GET ALL PRESCRIPTIONS ───
function getAllPrescriptions() {
    const allPatients = getPatients();
    const result = [];
    allPatients.forEach(patient => {
        (patient.prescriptions || []).forEach(prescription => {
            result.push({
                patientId: patient.id,
                patientName: (patient.firstName || '') + ' ' + (patient.lastName || ''),
                patientMrn: patient.mrn || 'N/A',
                prescription: prescription
            });
        });
    });
    return result;
}

// ============================================================
// BILLING SYSTEM
// ============================================================

function getPatientBills(patientId) {
    const patient = getPatient(patientId);
    return patient ? (patient.billingHistory || []) : [];
}

function getPendingBills(patientId) {
    return getPatientBills(patientId).filter(b => 
        b.status === 'Posted' || b.status === 'Pending Payment'
    );
}

function getPaidBills(patientId) {
    return getPatientBills(patientId).filter(b => 
        b.status === 'Paid' || b.status === 'Completed'
    );
}

async function markBillAsPaid(patientId, billId, paymentMethod) {
    const patient = getPatient(patientId);
    if (!patient || !patient.billingHistory) return false;
    
    const bill = patient.billingHistory.find(b => b.id === billId);
    if (!bill) return false;
    
    bill.status = 'Paid';
    bill.paymentDate = new Date().toISOString();
    bill.paymentMethod = paymentMethod || 'Cash';
    
    await updatePatient(patientId, { billingHistory: patient.billingHistory });
    return true;
}

function getAllBills() {
    const allPatients = getPatients();
    const result = [];
    allPatients.forEach(patient => {
        (patient.billingHistory || []).forEach(bill => {
            result.push({
                patientId: patient.id,
                patientName: (patient.firstName || '') + ' ' + (patient.lastName || ''),
                patientMrn: patient.mrn || 'N/A',
                bill: bill
            });
        });
    });
    result.sort((a, b) => new Date(b.bill.timestamp) - new Date(a.bill.timestamp));
    return result;
}

function getUnpaidBills() {
    return getAllBills().filter(entry => 
        entry.bill.status === 'Posted' || entry.bill.status === 'Pending Payment'
    );
}

// ============================================================
// LAB SYSTEM
// ============================================================

async function addLabRequest(patientId, requestData) {
    const patients = getPatients();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;
    
    const requestEntry = {
        id: Date.now(),
        date: new Date().toISOString(),
        tests: requestData.tests || [],
        panel: requestData.panel || '',
        priority: requestData.priority || 'Routine',
        requestedBy: requestData.requestedBy || 'Unknown',
        clinicalDetails: requestData.clinicalDetails || '',
        status: 'pending'
    };
    
    patient.labRequests.push(requestEntry);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    if (isFirebaseReady) await savePatientToFirebase(patient);
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Lab request saved for patient:', patientId);
    return requestEntry;
}

async function addLabResult(patientId, resultData) {
    const patients = getPatients();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;
    
    const resultEntry = {
        id: Date.now(),
        date: new Date().toISOString(),
        test: resultData.test || '',
        value: resultData.value || resultData.result || '',
        unit: resultData.unit || '',
        range: resultData.range || resultData.referenceRange || '',
        status: resultData.status || 'normal',
        requestId: resultData.requestId || null,
        flag: resultData.flag || 'normal',
        performedBy: resultData.performedBy || 'Unknown',
        verifiedBy: resultData.verifiedBy || '',
        notes: resultData.notes || ''
    };
    
    patient.labResults.push(resultEntry);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    if (isFirebaseReady) await savePatientToFirebase(patient);
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Lab result saved for patient:', patientId);
    return resultEntry;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getPatientSummary(id) {
    const patient = getPatient(id);
    if (!patient) return null;
    
    return {
        id: patient.id,
        mrn: patient.mrn,
        name: patient.name,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dob: patient.dob,
        gender: patient.gender,
        phone: patient.phone,
        registered: patient.registered,
        status: patient.status,
        vitalsCount: patient.vitals.length,
        triageCount: patient.triage.length,
        notesCount: patient.clinicalNotes.length,
        prescriptionsCount: patient.prescriptions.length,
        labRequestsCount: patient.labRequests.length,
        labResultsCount: patient.labResults.length,
        appointmentsCount: patient.appointments.length,
        lastVital: patient.vitals.length > 0 ? patient.vitals[patient.vitals.length - 1] : null,
        lastTriage: patient.triage.length > 0 ? patient.triage[patient.triage.length - 1] : null,
        lastNote: patient.clinicalNotes.length > 0 ? patient.clinicalNotes[patient.clinicalNotes.length - 1] : null
    };
}

function getPatientsForDepartment(dept) {
    return getPatients();
}

async function seedSamplePatients() {
    const existing = getPatients();
    if (existing.length > 0) {
        console.log('📊 Already have ' + existing.length + ' patients');
        return;
    }
    
    console.log('🌱 Seeding sample patients...');
    
    const samples = [
        {
            firstName: 'John',
            lastName: 'Smith',
            dob: '1985-06-15',
            gender: 'Male',
            phone: '+250 788 111 222',
            email: 'john.smith@email.com',
            address: '123 Main St, Kigali',
            emergencyContact: 'Jane Smith - Wife - +250 788 111 223',
            department: 'Cardiology',
            priority: 'medium'
        },
        {
            firstName: 'Sarah',
            lastName: 'Johnson',
            dob: '1992-11-03',
            gender: 'Female',
            phone: '+250 788 333 444',
            email: 'sarah.j@email.com',
            address: '456 Oak Ave, Kigali',
            emergencyContact: 'Mike Johnson - Brother - +250 788 333 445',
            department: 'Neurology',
            priority: 'high'
        }
    ];
    
    for (const p of samples) {
        await addPatient(p);
    }
    console.log('✅ Seeded ' + samples.length + ' sample patients');
}

// ============================================================
// FIREBASE STATUS INDICATOR
// ============================================================

function getFirebaseStatus() {
    return {
        ready: isFirebaseReady,
        synced: !!realtimeUnsubscribe,
        online: navigator.onLine,
        patients: getPatients().length
    };
}

// ============================================================
// EXPOSE TO GLOBAL SCOPE
// ============================================================

window.getPatients = getPatients;
window.savePatients = savePatients;
window.getNextPatientId = getNextPatientId;
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

// ============================================================
// AUTO-INIT
// ============================================================

console.log('📋 Patient Data System (Firebase Edition) loading...');
console.log('📊 Local patients:', getPatients().length);

// Start Firebase connection
waitForFirebase().then((ready) => {
    if (ready) {
        console.log('✅ Firebase connected! Real-time sync active.');
        console.log('☁️ All changes sync across all devices instantly.');
    } else {
        console.log('⚠️ Using localStorage only (offline mode)');
    }
});

console.log('✅ Patient Data System ready!');