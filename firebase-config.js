// ============================================================
// FIREBASE CONFIGURATION — PClinic (Auth Edition)
// ============================================================

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
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
    enableIndexedDbPersistence,
    arrayUnion,
    arrayRemove,
    increment,
    runTransaction,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

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

setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('⚠️ Could not set auth persistence:', err);
});

// ─── ENABLE OFFLINE MODE (works without internet!) ───
try {
    await enableIndexedDbPersistence(db);
    console.log('✅ Firebase offline mode enabled');
} catch (err) {
    if (err.code === 'failed-precondition') {
        console.warn('⚠️ Multiple tabs open, offline mode limited to one tab');
    } else if (err.code === 'unimplemented') {
        console.warn('⚠️ Browser does not support offline mode');
    }
}

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
    arrayUnion,
    arrayRemove,
    increment,
    runTransaction,
    writeBatch
};

window.firebaseAuthFunctions = {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
};

// Needed by the admin tool to spin up a throwaway secondary Firebase
// app instance when creating new staff accounts, so creating a new
// user doesn't kick the admin out of their own session.
window.firebaseAppFactory = {
    initializeApp,
    deleteApp,
    getAuth,
    firebaseConfig
};

window.pclinicStaffIdToEmail = staffIdToEmail;

console.log('🔥 Firebase initialized successfully');
console.log('📦 Project:', firebaseConfig.projectId);

// ─── SIGNAL THAT FIREBASE IS READY ───
window.firebaseReady = true;
window.dispatchEvent(new Event('firebaseReady'));
