// ============================================================
// FIREBASE CONFIGURATION — PClinic (Auth Edition)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    serverTimestamp,
    clearIndexedDbPersistence,
    terminate,
    deleteField,
    arrayUnion,
    arrayRemove,
    increment,
    runTransaction,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";

// ─── YOUR FIREBASE CONFIG ───
const firebaseConfig = {
    apiKey: "AIzaSyAcfSN-Z1FRnZC6bASy3b08abPDYJr-Ku0",
    authDomain: "pclinic-20d81.firebaseapp.com",
    projectId: "pclinic-20d81",
    storageBucket: "pclinic-20d81.firebasestorage.app",
    messagingSenderId: "267628417218",
    appId: "1:267628417218:web:60d92a26a27cad17802b5b"
};

// Staff log in with a plain numeric ID (e.g. 41054), not an email.
// Firebase Auth still needs an email format internally, so we build a
// fake, fixed-domain address behind the scenes: 41054@pclinic.local
// Users never see or type this — only the number.
const STAFF_EMAIL_DOMAIN = "pclinic.local";
function staffIdToEmail(staffId) {
    return `${String(staffId).trim()}@${STAFF_EMAIL_DOMAIN}`;
}

// ─── INITIALIZE FIREBASE ───
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const cloudFunctions = getFunctions(app, 'africa-south1');

// Session-only auth is safer on shared clinic devices: closing the tab/browser
// does not intentionally retain the staff session across a new work session.
try {
    await setPersistence(auth, browserSessionPersistence);
} catch (err) {
    console.warn('⚠️ Could not set session-only auth persistence:', err);
}

// ─── EMERGENCY PRIVACY MODE ───
// Persistent Firestore caching is intentionally disabled for clinical data.
// The default Firestore cache is memory-only. A future offline mode must use
// an encrypted, user-bound store with expiry, revocation and conflict handling.
async function clearClinicalFirebaseCache() {
    try {
        // clearIndexedDbPersistence requires the instance to be terminated.
        // This helper is used only while signing out, immediately before the
        // browser leaves the page; the next page creates a fresh instance.
        await terminate(db);
        await clearIndexedDbPersistence(db);
        return true;
    } catch (err) {
        console.warn('Could not clear old Firestore persistence. Close other PClinic tabs and clear site data.', err);
        return false;
    }
}
window.pclinicClearFirebaseCache = clearClinicalFirebaseCache;

// ─── EXPOSE FIREBASE GLOBALLY ───
window.firebaseApp = app;
window.firebaseDB = db;
window.firebaseAuth = auth;

window.firebaseFunctions = {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    serverTimestamp,
    deleteField,
    arrayUnion,
    arrayRemove,
    increment,
    runTransaction,
    writeBatch
};

window.firebaseAuthFunctions = {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
};

window.pclinicCloudFunctions = {
    region: 'africa-south1',
    call: async function (name, data) {
        const callable = httpsCallable(cloudFunctions, name);
        const response = await callable(data || {});
        return response.data;
    }
};

window.pclinicStaffIdToEmail = staffIdToEmail;

console.log('🔥 Firebase initialized successfully');
console.log('📦 Project:', firebaseConfig.projectId);

// ─── SIGNAL THAT FIREBASE IS READY ───
window.firebaseReady = true;
window.dispatchEvent(new Event('firebaseReady'));
