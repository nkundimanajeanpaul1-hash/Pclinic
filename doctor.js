/* ============================================================
   PCLINIC — DOCTOR DASHBOARD LOGIC
   Extracted from doctor-dashboard.html (was 292 KB of inline
   <script>). Behaviour is unchanged - this is a pure move so the
   file becomes reviewable and future edits are safer.

   Load order matters:
     firebase-config.js → auth-guard.js → pclinic-state.js
     → patient-data.js → pclinic-orders.js → doctor.js
   ============================================================ */

/* ── extracted from doctor-dashboard.html, inline block 1 ── */
// ─── UPDATE EXAM OPTIONS ───
function updateExamOptions() {
    const category = document.getElementById('imgCategory').value;
    const examSelect = document.getElementById('imgExam');
    const customContainer = document.getElementById('customExamContainer');
    
    // Show/hide custom container for 'other'
    if (category === 'other') {
        customContainer.style.display = 'block';
        document.getElementById('customExamInput').focus();
    } else {
        customContainer.style.display = 'none';
    }
    
    if (!category || category === 'other') {
        examSelect.innerHTML = '<option value="">-- Select Category First --</option>';
        return;
    }
    
    const examData = imagingExams[category];
    if (!examData) {
        examSelect.innerHTML = '<option value="">-- No exams available --</option>';
        return;
    }
    
    let html = `<option value="">-- Select ${examData.label} Exam --</option>`;
    examData.exams.forEach(exam => {
        html += `<option value="${exam}">${exam}</option>`;
    });
    
    // Add custom exams that were previously added
    const customExams = JSON.parse(localStorage.getItem('customImagingExams') || '[]');
    const categoryCustom = customExams.filter(e => e.category === category);
    if (categoryCustom.length > 0) {
        html += `<option value="" disabled style="background:var(--s3);color:var(--tm);">── Custom ──</option>`;
        categoryCustom.forEach(e => {
            html += `<option value="${e.name}">📌 ${e.name}</option>`;
        });
    }
    
    examSelect.innerHTML = html;
}

// ─── ADD CUSTOM EXAM ───
function addCustomExam() {
    const category = document.getElementById('imgCategory').value;
    const customName = document.getElementById('customExamInput').value.trim();
    
    if (!category || category === 'other') {
        showToast('⚠️ Please select a category first', 'warning');
        document.getElementById('imgCategory').focus();
        return;
    }
    
    if (!customName) {
        showToast('⚠️ Please enter an exam name', 'warning');
        document.getElementById('customExamInput').focus();
        return;
    }
    
    // Save to localStorage
    let customExams = JSON.parse(localStorage.getItem('customImagingExams') || '[]');
    
    // Check for duplicates
    const exists = customExams.some(e => e.category === category && e.name === customName);
    if (exists) {
        showToast('⚠️ This exam already exists in this category', 'warning');
        return;
    }
    
    customExams.push({ category, name: customName });
    localStorage.setItem('customImagingExams', JSON.stringify(customExams));
    
    document.getElementById('customExamInput').value = '';
    showToast(`✅ Added "${customName}" to ${imagingExams[category].label}`, 'success');
    
    // Update the dropdown
    updateExamOptions();
    document.getElementById('imgExam').value = customName;
}

// ─── TOGGLE CUSTOM EXAM INPUT ───
function toggleCustomExam() {
    const container = document.getElementById('customExamContainer');
    if (container.style.display === 'none') {
        container.style.display = 'block';
        document.getElementById('customExamInput').focus();
    } else {
        container.style.display = 'none';
        document.getElementById('customExamInput').value = '';
    }
}

// ─── SET PRIORITY ───
function setPriority(priority) {
    document.getElementById('imgPriority').value = priority;
    
    // Update button styles
    const buttons = ['Routine', 'Urgent', 'STAT'];
    const ids = ['priorityRoutine', 'priorityUrgent', 'prioritySTAT'];
    const priorityClasses = ['priority-routine', 'priority-urgent', 'priority-stat'];
    
    buttons.forEach((p, i) => {
        const btn = document.getElementById(ids[i]);
        if (btn) {
            btn.classList.remove('priority-active', ...priorityClasses);
            if (p === priority) {
                btn.classList.add('priority-active', priorityClasses[i]);
            }
        }
    });
}



// ─── SUBMIT IMAGING REQUEST ───
function submitImagingRequest() {
    // Validate patient
    if (!currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        openPatientSelectorForImaging();
        return;
    }
    
    // Validate category
    const category = document.getElementById('imgCategory').value;
    if (!category) {
        showToast('⚠️ Please select an exam category', 'warning');
        document.getElementById('imgCategory').focus();
        return;
    }
    
    // Get exam
    let exam = document.getElementById('imgExam').value;
    if (!exam && category !== 'other') {
        showToast('⚠️ Please select a specific exam', 'warning');
        document.getElementById('imgExam').focus();
        return;
    }
    
    // For 'other' category, use custom input
    if (category === 'other') {
        exam = document.getElementById('customExamInput').value.trim();
        if (!exam) {
            showToast('⚠️ Please enter the exam name', 'warning');
            document.getElementById('customExamInput').focus();
            return;
        }
    }
    
    // Validate reason
    let reason = document.getElementById('imgReason').value;
    if (!reason) {
        showToast('⚠️ Please select a reason for the exam', 'warning');
        document.getElementById('imgReason').focus();
        return;
    }
    
    if (reason === 'other') {
        const otherReason = document.getElementById('imgOtherReason').value.trim();
        if (!otherReason) {
            showToast('⚠️ Please specify the reason', 'warning');
            document.getElementById('imgOtherReason').focus();
            return;
        }
        reason = otherReason;
    }
    
    // Get other data
    const notes = document.getElementById('imgClinicalNotes').value.trim();
    const requestingDoctor = document.getElementById('imgRequestingDoctor').value.trim();
    const requestDate = document.getElementById('imgRequestDate').value;
    const priority = document.getElementById('imgPriority').value;
    
    // Validate requesting doctor
    if (!requestingDoctor) {
        showToast('⚠️ Please enter the requesting doctor\'s name', 'warning');
        document.getElementById('imgRequestingDoctor').focus();
        return;
    }
    
    // Build imaging request data
    const imagingData = {
        id: Date.now(),
        patientId: currentPatient.id,
        patientName: (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || ''),
        mrn: currentPatient.mrn || 'N/A',
        category: category,
        categoryLabel: imagingExams[category]?.label || category,
        categoryIcon: imagingExams[category]?.icon || '📋',
        exam: exam,
        reason: reason,
        notes: notes || 'No additional notes',
        requestingDoctor: requestingDoctor,
        requestDate: requestDate || new Date().toISOString().slice(0, 10),
        priority: priority,
        status: 'Pending',
        timestamp: new Date().toISOString()
    };
    
    // Store in patient
    if (!currentPatient.imagingRequests) {
        currentPatient.imagingRequests = [];
    }
    currentPatient.imagingRequests.push(imagingData);
    
    // Also save as clinical note
    const noteData = {
        doctor: requestingDoctor,
        note: `🩻 IMAGING REQUEST\n` +
              `Category: ${imagingData.categoryLabel}\n` +
              `Exam: ${exam}\n` +
              `Reason: ${reason}\n` +
              `Priority: ${priority}\n` +
              `Notes: ${notes || 'N/A'}`,
        type: 'Imaging Request',
        status: 'Pending',
        timestamp: new Date().toISOString(),
        imagingData: imagingData
    };
    
    if (typeof addClinicalNote === 'function') {
        addClinicalNote(currentPatient.id, noteData);
    } else {
        if (!currentPatient.clinicalNotes) currentPatient.clinicalNotes = [];
        currentPatient.clinicalNotes.push({ id: Date.now() + 1, ...noteData });
    }
    
    // Update via patient-data.js
    if (typeof updatePatient === 'function') {
        try {
            updatePatient(currentPatient.id, { 
                imagingRequests: currentPatient.imagingRequests,
                clinicalNotes: currentPatient.clinicalNotes
            });
        } catch(e) {
            console.log('updatePatient not available, using local storage only');
        }
    }
    
    // Show success
    showToast(`✅ Imaging request submitted for ${currentPatient.firstName} ${currentPatient.lastName} - ${exam}`, 'success');
    
    // Clear form
    clearImagingForm();
    
    // Close imaging and return to patient file
   setTimeout(() => {
    window.parent.postMessage({ type: 'CLOSE_LAB' }, '*');
}, 1500);

// ─── CLEAR IMAGING FORM ───
function clearImagingForm() {
    document.getElementById('imgCategory').value = '';
    document.getElementById('imgExam').innerHTML = '<option value="">-- Select Exam Category First --</option>';
    document.getElementById('imgReason').value = '';
    document.getElementById('imgOtherReason').value = '';
    document.getElementById('otherReasonContainer').style.display = 'none';
    document.getElementById('imgClinicalNotes').value = '';
    document.getElementById('imgRequestingDoctor').value = 'Dr. Mutua';
    document.getElementById('imgRequestDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('customExamInput').value = '';
    document.getElementById('customExamContainer').style.display = 'none';
    
    // Reset priority
    setPriority('Routine');
    document.getElementById('imgPriority').value = 'Routine';
}

// ─── IMAGE RESULT ─────────────────────────────────────────────
// The inline list/entry modal previously here has been migrated to a
// full standalone page: imaging-results.html
// Open it via openImagingResultsPage(patient) (defined further down).
// All buttons that used to call openImageResultsModal now call it.
window.closeImageResultEntry = closeImageResultEntry;
window.saveImageResult = saveImageResult;

// ─── CLOSE IMAGING ───
function closeImaging() {
    console.log('🩻 Closing imaging view...');
    
    // 1. Hide the imaging tab content
    const imagingTab = document.getElementById('tab-imaging');
    if (imagingTab) {
        imagingTab.classList.remove('show');
        imagingTab.style.display = 'none';
    }
    
    // 2. Show the patient file container if it exists and a patient is selected
    const patientFileContainer = document.getElementById('patientFileContainer');
    if (patientFileContainer && currentPatient) {
        patientFileContainer.style.display = 'block';
        // Scroll to top of patient file
        patientFileContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        // If no patient file, show patient card
        const patientCard = document.getElementById('patient-card');
        if (patientCard && currentPatient) {
            patientCard.style.display = 'block';
        }
    }
    
    // 3. Show the main panel
    const mainPanel = document.querySelector('.main-panel');
    if (mainPanel) {
        mainPanel.style.display = 'block';
    }
    
    // 4. Find the Overview tab and switch to it
    const overviewTabBtn = document.querySelector('[data-tab="overview"]');
    if (overviewTabBtn) {
        // Update active tab styling
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        overviewTabBtn.classList.add('active');
        
        // Show overview content
        const overviewContent = document.getElementById('tab-overview');
        if (overviewContent) {
            document.querySelectorAll('.mp-body').forEach(b => {
                b.classList.remove('show');
                b.style.display = 'none';
            });
            overviewContent.classList.add('show');
            overviewContent.style.display = 'block';
        }
    }
    
    // 5. Show a toast notification
    showToast('🩻 Returned to patient dashboard', 'info');
    
    console.log('✅ Imaging view closed successfully');
}

// ─── OVERRIDE SWITCH TAB TO HANDLE IMAGING ───
const originalSwitchTab = window.switchTab;
window.switchTab = function(name, btn) {
    if (name === 'imaging') {
        // Check if patient is selected
        if (!currentPatient) {
            showToast('⚠️ Please select a patient first', 'warning');
            // Show patients tab to select
            const patientsTab = document.querySelector('[data-tab="patients"]');
            if (patientsTab) {
                patientsTab.click();
            }
            return;
        }
        
        // Update patient info in imaging form
        updateImagingPatientInfo();
        
        // Set default date
        const dateInput = document.getElementById('imgRequestDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().slice(0, 10);
        }
        
        // Reset priority
        setPriority('Routine');
        
        // Call original switchTab
        originalSwitchTab(name, btn);
        
        // Scroll to top of imaging tab
        setTimeout(() => {
            const imagingContent = document.getElementById('tab-imaging');
            if (imagingContent) {
                imagingContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
        
        return;
    }
    
    // For all other tabs, call original
    originalSwitchTab(name, btn);
};

}

/* ── extracted from doctor-dashboard.html, inline block 2 ── */
// ============================================================
        // DOCTOR DASHBOARD — Integrated with patient-data.js
        // ============================================================

       


// ─── GLOBALS ───
let currentPatient = null;
let patientMedia = { photos: [], videos: [] };
let theaterList = [];
let selectedLabTests = [];
let labRequests = [];

// ─── FALLBACK: addPrescription if not in patient-data.js ───
if (typeof addPrescription !== 'function') {
    window.addPrescription = function(patientId, rxData) {
        try {
            var patients = getPatients();
            var patient = patients.find(p => p.id === patientId);
            if (!patient) return false;
            if (!patient.prescriptions) patient.prescriptions = [];
            rxData.id = Date.now();
            rxData.timestamp = rxData.timestamp || new Date().toISOString();
            patient.prescriptions.push(rxData);
            if (typeof updatePatient === 'function') {
                updatePatient(patientId, { prescriptions: patient.prescriptions });
            }
            return true;
        } catch(e) {
            console.error('addPrescription fallback error:', e);
            return false;
        }
    };
    console.log('ℹ️ addPrescription fallback registered');
}








// ─── SHOW KEYBOARD SHORTCUTS ───
function showShortcuts() {
    // Create modal content
    var shortcutsHTML = `
        <div style="max-width: 500px; margin: 0 auto;">
            <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: var(--tp);">
                ⌨️ Keyboard Shortcuts
            </h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
                <div style="background: var(--s3); padding: 10px 14px; border-radius: 8px;">
                    <span style="font-weight: 700; color: var(--ac);">Ctrl+D</span>
                    <span style="display: block; font-size: 12px; color: var(--tm);">Toggle Dark Mode</span>
                </div>
                <div style="background: var(--s3); padding: 10px 14px; border-radius: 8px;">
                    <span style="font-weight: 700; color: var(--ac);">Ctrl+/</span>
                    <span style="display: block; font-size: 12px; color: var(--tm);">Show Shortcuts</span>
                </div>
                <div style="background: var(--s3); padding: 10px 14px; border-radius: 8px;">
                    <span style="font-weight: 700; color: var(--ac);">Ctrl+F</span>
                    <span style="display: block; font-size: 12px; color: var(--tm);">Focus Search</span>
                </div>
                <div style="background: var(--s3); padding: 10px 14px; border-radius: 8px;">
                    <span style="font-weight: 700; color: var(--ac);">Ctrl+Shift+L</span>
                    <span style="display: block; font-size: 12px; color: var(--tm);">Close Lab</span>
                </div>
                <div style="background: var(--s3); padding: 10px 14px; border-radius: 8px;">
                    <span style="font-weight: 700; color: var(--ac);">Ctrl+Enter</span>
                    <span style="display: block; font-size: 12px; color: var(--tm);">Save Note/Surgery</span>
                </div>
                <div style="background: var(--s3); padding: 10px 14px; border-radius: 8px;">
                    <span style="font-weight: 700; color: var(--ac);">Escape</span>
                    <span style="display: block; font-size: 12px; color: var(--tm);">Close Modals</span>
                </div>
            </div>
            <div style="font-size: 11px; color: var(--tm); text-align: center; border-top: 0.5px solid var(--bd); padding-top: 12px;">
                Click outside or press Escape to close
            </div>
        </div>
    `;

    // Get modal elements
    var modalTitle = document.getElementById('modal-title');
    var modalBody = document.getElementById('modal-body');
    var modal = document.getElementById('stat-modal');
    
    if (!modalBody || !modal) {
        // Fallback: show alert if modal not found
        alert('⌨️ Keyboard Shortcuts:\n\n' +
              'Ctrl+D - Toggle Dark Mode\n' +
              'Ctrl+/ - Show Shortcuts\n' +
              'Ctrl+F - Focus Search\n' +
              'Ctrl+Shift+L - Close Lab\n' +
              'Ctrl+Enter - Save Note/Surgery\n' +
              'Escape - Close Modals');
        return;
    }

    modalTitle.textContent = '⌨️ Keyboard Shortcuts';
    modalBody.innerHTML = shortcutsHTML;
    modal.classList.add('show');
    modal.style.display = 'flex';
}

// ─── PERFORMANCE: DEBOUNCE HELPER ───
function debounce(func, wait) {
    var timeout;
    return function executedFunction() {
        var context = this;
        var args = arguments;
        var later = function() {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ─── DEBOUNCED VERSIONS ───
var debouncedUpdateSchedule = debounce(updateSchedule, 300);
var debouncedRenderPatientTable = debounce(renderPatientTable, 300);

// ─── DIAGNOSIS DATA WITH COLORS AND CATEGORIES ───
var commonDiagnoses = [





    // ============================================================
    // CARDIOVASCULAR (Red/Pink)
    // ============================================================
    { code: 'I10', name: 'Essential (Primary) Hypertension', department: 'Cardiology', color: '#dc3545', category: 'Cardiovascular' },
    { code: 'I11.9', name: 'Hypertensive Heart Disease', department: 'Cardiology', color: '#dc3545', category: 'Cardiovascular' },
    { code: 'I15.9', name: 'Secondary Hypertension', department: 'Cardiology', color: '#dc3545', category: 'Cardiovascular' },
    { code: 'I25.10', name: 'Atherosclerotic Heart Disease', department: 'Cardiology', color: '#dc3545', category: 'Cardiovascular' },
    { code: 'I48.91', name: 'Atrial Fibrillation', department: 'Cardiology', color: '#dc3545', category: 'Cardiovascular' },
    { code: 'I50.9', name: 'Congestive Heart Failure', department: 'Cardiology', color: '#dc3545', category: 'Cardiovascular' },
    { code: 'I20.9', name: 'Angina Pectoris', department: 'Cardiology', color: '#dc3545', category: 'Cardiovascular' },
    { code: 'I21.9', name: 'Acute Myocardial Infarction', department: 'Cardiology', color: '#dc3545', category: 'Cardiovascular' },

    // ============================================================
    // ENDOCRINE (Orange)
    // ============================================================
    { code: 'E11.9', name: 'Type 2 Diabetes Mellitus', department: 'Endocrinology', color: '#fd7e14', category: 'Endocrine' },
    { code: 'E10.9', name: 'Type 1 Diabetes Mellitus', department: 'Endocrinology', color: '#fd7e14', category: 'Endocrine' },
    { code: 'E03.9', name: 'Hypothyroidism', department: 'Endocrinology', color: '#fd7e14', category: 'Endocrine' },
    { code: 'E05.9', name: 'Hyperthyroidism', department: 'Endocrinology', color: '#fd7e14', category: 'Endocrine' },

    // ============================================================
    // RESPIRATORY (Blue)
    // ============================================================
    { code: 'J45.909', name: 'Unspecified Asthma', department: 'Pulmonology', color: '#007bff', category: 'Respiratory' },
    { code: 'J44.9', name: 'COPD', department: 'Pulmonology', color: '#007bff', category: 'Respiratory' },
    { code: 'J15.9', name: 'Bacterial Pneumonia', department: 'Pulmonology', color: '#007bff', category: 'Respiratory' },
    { code: 'J18.9', name: 'Pneumonia, Unspecified', department: 'Pulmonology', color: '#007bff', category: 'Respiratory' },
    { code: 'J06.9', name: 'Acute Upper Respiratory Infection', department: 'Pulmonology', color: '#007bff', category: 'Respiratory' },
    { code: 'J20.9', name: 'Acute Bronchitis', department: 'Pulmonology', color: '#007bff', category: 'Respiratory' },
    { code: 'J40', name: 'Chronic Bronchitis', department: 'Pulmonology', color: '#007bff', category: 'Respiratory' },
    { code: 'U07.1', name: 'COVID-19', department: 'Pulmonology', color: '#007bff', category: 'Respiratory' },

    // ============================================================
    // GASTROINTESTINAL (Green)
    // ============================================================
    { code: 'K21.9', name: 'GERD (Gastroesophageal Reflux Disease)', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },
    { code: 'K29.7', name: 'Chronic Gastritis', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },
    { code: 'K29.5', name: 'Chronic Gastritis, Unspecified', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },
    { code: 'K29.0', name: 'Acute Gastritis', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },
    { code: 'K25.9', name: 'Gastric Ulcer', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },
    { code: 'K26.9', name: 'Duodenal Ulcer', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },
    { code: 'K57.30', name: 'Diverticulitis', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },
    { code: 'K59.0', name: 'Constipation', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },
    { code: 'K58.9', name: 'Irritable Bowel Syndrome (IBS)', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },
    { code: 'K90.0', name: 'Celiac Disease', department: 'Gastroenterology', color: '#28a745', category: 'Gastrointestinal' },

    // ============================================================
    // RENAL / NEPHROLOGY (Teal)
    // ============================================================
    { code: 'N18.9', name: 'Chronic Kidney Disease', department: 'Nephrology', color: '#20c997', category: 'Renal' },
    { code: 'N17.9', name: 'Acute Kidney Injury', department: 'Nephrology', color: '#20c997', category: 'Renal' },
    { code: 'N39.0', name: 'Urinary Tract Infection', department: 'Nephrology', color: '#20c997', category: 'Renal' },
    { code: 'N20.0', name: 'Nephrolithiasis (Kidney Stones)', department: 'Nephrology', color: '#20c997', category: 'Renal' },
    { code: 'N04.9', name: 'Nephrotic Syndrome', department: 'Nephrology', color: '#20c997', category: 'Renal' },
    { code: 'N03.9', name: 'Chronic Glomerulonephritis', department: 'Nephrology', color: '#20c997', category: 'Renal' },

    // ============================================================
    // NEUROLOGICAL (Purple)
    // ============================================================
    { code: 'G40.909', name: 'Epilepsy', department: 'Neurology', color: '#6f42c1', category: 'Neurological' },
    { code: 'G43.909', name: 'Migraine', department: 'Neurology', color: '#6f42c1', category: 'Neurological' },
    { code: 'G44.3', name: 'Tension Headache', department: 'Neurology', color: '#6f42c1', category: 'Neurological' },
    { code: 'I63.9', name: 'Cerebral Infarction (Stroke)', department: 'Neurology', color: '#6f42c1', category: 'Neurological' },
    { code: 'G20', name: 'Parkinson\'s Disease', department: 'Neurology', color: '#6f42c1', category: 'Neurological' },
    { code: 'G35', name: 'Multiple Sclerosis', department: 'Neurology', color: '#6f42c1', category: 'Neurological' },
    { code: 'G90.9', name: 'Autonomic Nervous System Disorder', department: 'Neurology', color: '#6f42c1', category: 'Neurological' },
    { code: 'G47.30', name: 'Sleep Apnea', department: 'Neurology', color: '#6f42c1', category: 'Neurological' },

    // ============================================================
    // PSYCHIATRIC (Pink/Purple)
    // ============================================================
    { code: 'F41.1', name: 'Generalized Anxiety Disorder', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },
    { code: 'F32.9', name: 'Major Depressive Disorder', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },
    { code: 'F31.9', name: 'Bipolar Disorder', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },
    { code: 'F20.9', name: 'Schizophrenia', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },
    { code: 'F43.1', name: 'Post-Traumatic Stress Disorder (PTSD)', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },
    { code: 'F90.9', name: 'ADHD', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },
    { code: 'F10.1', name: 'Alcohol Use Disorder', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },
    { code: 'F15.1', name: 'Substance Use Disorder', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },
    { code: 'F41.0', name: 'Panic Disorder', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },
    { code: 'F42.9', name: 'Obsessive-Compulsive Disorder (OCD)', department: 'Psychiatry', color: '#e83e8c', category: 'Psychiatric' },

    // ============================================================
    // MUSCULOSKELETAL / ORTHOPEDIC (Brown/Orange)
    // ============================================================
    { code: 'M17.9', name: 'Osteoarthritis of Knee', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },
    { code: 'M16.9', name: 'Osteoarthritis of Hip', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },
    { code: 'M54.5', name: 'Low Back Pain', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },
    { code: 'M25.561', name: 'Avascular Necrosis of Hip (AVN)', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },
    { code: 'M80.00', name: 'Osteoporosis with Pathological Fracture', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },
    { code: 'S72.00', name: 'Femoral Neck Fracture', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },
    { code: 'S52.50', name: 'Distal Radius Fracture', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },
    { code: 'M19.90', name: 'Osteoarthritis, Unspecified', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },
    { code: 'Q65.00', name: 'Congenital Hip Dislocation', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },
    { code: 'M79.1', name: 'Myalgia (Muscle Pain)', department: 'Orthopedics', color: '#e67e22', category: 'Musculoskeletal' },

    // ============================================================
    // SURGICAL (Red/Orange)
    // ============================================================
    { code: 'K40.90', name: 'Inguinal Hernia', department: 'General Surgery', color: '#c0392b', category: 'Surgical' },
    { code: 'K42.9', name: 'Umbilical Hernia', department: 'General Surgery', color: '#c0392b', category: 'Surgical' },
    { code: 'K35.80', name: 'Acute Appendicitis', department: 'General Surgery', color: '#c0392b', category: 'Surgical' },
    { code: 'K80.20', name: 'Cholecystitis (Gallstones)', department: 'General Surgery', color: '#c0392b', category: 'Surgical' },
    { code: 'K82.9', name: 'Gallbladder Disease', department: 'General Surgery', color: '#c0392b', category: 'Surgical' },
    { code: 'K43.0', name: 'Incisional Hernia', department: 'General Surgery', color: '#c0392b', category: 'Surgical' },
    { code: 'K61.1', name: 'Anal Fistula', department: 'General Surgery', color: '#c0392b', category: 'Surgical' },
    { code: 'K64.9', name: 'Hemorrhoids (Piles)', department: 'General Surgery', color: '#c0392b', category: 'Surgical' },

    // ============================================================
    // NEUROSURGICAL (Dark Purple)
    // ============================================================
    { code: 'G93.5', name: 'Brain Compression (Herniation)', department: 'Neurosurgery', color: '#4a148c', category: 'Neurosurgical' },
    { code: 'I62.9', name: 'Intracranial Hemorrhage', department: 'Neurosurgery', color: '#4a148c', category: 'Neurosurgical' },
    { code: 'G95.9', name: 'Spinal Cord Compression', department: 'Neurosurgery', color: '#4a148c', category: 'Neurosurgical' },
    { code: 'M50.00', name: 'Cervical Disc Disorder', department: 'Neurosurgery', color: '#4a148c', category: 'Neurosurgical' },
    { code: 'M51.00', name: 'Lumbar Disc Disorder', department: 'Neurosurgery', color: '#4a148c', category: 'Neurosurgical' },
    { code: 'C71.9', name: 'Brain Tumor (Malignant)', department: 'Neurosurgery', color: '#4a148c', category: 'Neurosurgical' },

    // ============================================================
    // UROLOGICAL (Blue/Teal)
    // ============================================================
    { code: 'N40', name: 'Benign Prostatic Hyperplasia (BPH)', department: 'Urology', color: '#00838f', category: 'Urological' },
    { code: 'N20.0', name: 'Renal Calculi (Kidney Stones)', department: 'Urology', color: '#00838f', category: 'Urological' },
    { code: 'N30.90', name: 'Cystitis', department: 'Urology', color: '#00838f', category: 'Urological' },
    { code: 'N41.9', name: 'Prostatitis', department: 'Urology', color: '#00838f', category: 'Urological' },
    { code: 'N39.0', name: 'Urinary Tract Infection', department: 'Urology', color: '#00838f', category: 'Urological' },
    { code: 'C61', name: 'Prostate Cancer', department: 'Urology', color: '#00838f', category: 'Urological' },

    // ============================================================
    // PEDIATRIC (Yellow/Orange)
    // ============================================================
    { code: 'J45.909', name: 'Pediatric Asthma', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },
    { code: 'J30.9', name: 'Allergic Rhinitis (Hay Fever)', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },
    { code: 'B34.9', name: 'Viral Infection, Unspecified', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },
    { code: 'P23.9', name: 'Neonatal Pneumonia', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },
    { code: 'P59.9', name: 'Neonatal Jaundice', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },
    { code: 'K29.7', name: 'Pediatric Gastritis', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },
    { code: 'A09', name: 'Pediatric Diarrhea', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },
    { code: 'J06.9', name: 'Pediatric URI (Upper Respiratory Infection)', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },
    { code: 'B05.9', name: 'Measles', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },
    { code: 'B01.9', name: 'Chickenpox (Varicella)', department: 'Pediatrics', color: '#f39c12', category: 'Pediatric' },

    // ============================================================
    // GERIATRIC (Gray/Silver)
    // ============================================================
    { code: 'R54', name: 'Senile Debility (Frailty)', department: 'Geriatrics', color: '#6c757d', category: 'Geriatric' },
    { code: 'F03', name: 'Dementia, Unspecified', department: 'Geriatrics', color: '#6c757d', category: 'Geriatric' },
    { code: 'G30.9', name: 'Alzheimer\'s Disease', department: 'Geriatrics', color: '#6c757d', category: 'Geriatric' },
    { code: 'N18.9', name: 'Chronic Kidney Disease in Elderly', department: 'Geriatrics', color: '#6c757d', category: 'Geriatric' },
    { code: 'I10', name: 'Geriatric Hypertension', department: 'Geriatrics', color: '#6c757d', category: 'Geriatric' },
    { code: 'R41.0', name: 'Cognitive Decline', department: 'Geriatrics', color: '#6c757d', category: 'Geriatric' },
    { code: 'M80.00', name: 'Osteoporosis', department: 'Geriatrics', color: '#6c757d', category: 'Geriatric' },
    { code: 'N39.0', name: 'Elderly UTI', department: 'Geriatrics', color: '#6c757d', category: 'Geriatric' },

    // ============================================================
    // INFECTIOUS DISEASE (Red/Burgundy)
    // ============================================================
    { code: 'A41.9', name: 'Sepsis, Unspecified', department: 'Infectious Disease', color: '#800000', category: 'Infectious' },
    { code: 'R65.20', name: 'Severe Sepsis with Septic Shock', department: 'Infectious Disease', color: '#800000', category: 'Infectious' },
    { code: 'A02.9', name: 'Salmonella Infection', department: 'Infectious Disease', color: '#800000', category: 'Infectious' },
    { code: 'A09', name: 'Infectious Diarrhea', department: 'Infectious Disease', color: '#800000', category: 'Infectious' },
    { code: 'B34.9', name: 'Viral Infection', department: 'Infectious Disease', color: '#800000', category: 'Infectious' },
    { code: 'A01.0', name: 'Typhoid Fever', department: 'Infectious Disease', color: '#800000', category: 'Infectious' },
    { code: 'B50.9', name: 'Malaria', department: 'Infectious Disease', color: '#800000', category: 'Infectious' },
    { code: 'U07.1', name: 'COVID-19', department: 'Infectious Disease', color: '#800000', category: 'Infectious' },

    // ============================================================
    // DERMATOLOGICAL (Pink/Peach)
    // ============================================================
    { code: 'L30.9', name: 'Dermatitis, Unspecified', department: 'Dermatology', color: '#f8a5c2', category: 'Dermatological' },
    { code: 'L40.9', name: 'Psoriasis', department: 'Dermatology', color: '#f8a5c2', category: 'Dermatological' },
    { code: 'L20.9', name: 'Atopic Dermatitis (Eczema)', department: 'Dermatology', color: '#f8a5c2', category: 'Dermatological' },
    { code: 'B02.9', name: 'Herpes Zoster (Shingles)', department: 'Dermatology', color: '#f8a5c2', category: 'Dermatological' },
    { code: 'L70.9', name: 'Acne Vulgaris', department: 'Dermatology', color: '#f8a5c2', category: 'Dermatological' },
    { code: 'L25.9', name: 'Contact Dermatitis', department: 'Dermatology', color: '#f8a5c2', category: 'Dermatological' },

    // ============================================================
    // OPHTHALMOLOGICAL (Sky Blue)
    // ============================================================
    { code: 'H25.9', name: 'Cataract', department: 'Ophthalmology', color: '#74b9ff', category: 'Ophthalmological' },
    { code: 'H40.9', name: 'Glaucoma', department: 'Ophthalmology', color: '#74b9ff', category: 'Ophthalmological' },
    { code: 'H35.30', name: 'Macular Degeneration', department: 'Ophthalmology', color: '#74b9ff', category: 'Ophthalmological' },
    { code: 'H10.9', name: 'Conjunctivitis', department: 'Ophthalmology', color: '#74b9ff', category: 'Ophthalmological' },

    // ============================================================
    // ENT (Olive/Green)
    // ============================================================
    { code: 'H66.9', name: 'Otitis Media', department: 'ENT', color: '#6ab04c', category: 'ENT' },
    { code: 'J30.9', name: 'Allergic Rhinitis', department: 'ENT', color: '#6ab04c', category: 'ENT' },
    { code: 'J34.89', name: 'Chronic Sinusitis', department: 'ENT', color: '#6ab04c', category: 'ENT' },
    { code: 'J03.90', name: 'Tonsillitis', department: 'ENT', color: '#6ab04c', category: 'ENT' },

    // ============================================================
    // RHEUMATOLOGICAL (Light Purple)
    // ============================================================
    { code: 'M06.9', name: 'Rheumatoid Arthritis', department: 'Rheumatology', color: '#a29bfe', category: 'Rheumatological' },
    { code: 'M10.9', name: 'Gout', department: 'Rheumatology', color: '#a29bfe', category: 'Rheumatological' },
    { code: 'M32.9', name: 'Systemic Lupus Erythematosus (SLE)', department: 'Rheumatology', color: '#a29bfe', category: 'Rheumatological' },
    { code: 'M35.9', name: 'Connective Tissue Disease', department: 'Rheumatology', color: '#a29bfe', category: 'Rheumatological' },

    // ============================================================
    // OBSTETRICS & GYNECOLOGY (Pink/Rose)
    // ============================================================
    { code: 'O26.9', name: 'Pregnancy Complication', department: 'Obstetrics & Gynecology', color: '#fd79a8', category: 'OB/GYN' },
    { code: 'O99.0', name: 'Maternal Anemia', department: 'Obstetrics & Gynecology', color: '#fd79a8', category: 'OB/GYN' },
    { code: 'N92.0', name: 'Menorrhagia (Heavy Menstrual Bleeding)', department: 'Obstetrics & Gynecology', color: '#fd79a8', category: 'OB/GYN' },
    { code: 'N95.1', name: 'Menopause', department: 'Obstetrics & Gynecology', color: '#fd79a8', category: 'OB/GYN' },
    { code: 'N70.9', name: 'Pelvic Inflammatory Disease (PID)', department: 'Obstetrics & Gynecology', color: '#fd79a8', category: 'OB/GYN' },
    { code: 'N91.0', name: 'Amenorrhea', department: 'Obstetrics & Gynecology', color: '#fd79a8', category: 'OB/GYN' },
    { code: 'N80.9', name: 'Endometriosis', department: 'Obstetrics & Gynecology', color: '#fd79a8', category: 'OB/GYN' },
    { code: 'D25.9', name: 'Uterine Fibroids', department: 'Obstetrics & Gynecology', color: '#fd79a8', category: 'OB/GYN' },

    // ============================================================
    // HEMATOLOGICAL (Red/Blood)
    // ============================================================
    { code: 'D50.9', name: 'Iron Deficiency Anemia', department: 'Hematology', color: '#e74c3c', category: 'Hematological' },
    { code: 'D64.9', name: 'Anemia, Unspecified', department: 'Hematology', color: '#e74c3c', category: 'Hematological' },
    { code: 'D69.3', name: 'Immune Thrombocytopenia (ITP)', department: 'Hematology', color: '#e74c3c', category: 'Hematological' },
    { code: 'C95.9', name: 'Leukemia', department: 'Hematology', color: '#e74c3c', category: 'Hematological' }
];


// ─── CATEGORY COLORS FOR DIAGNOSES ───
var categoryColors = {
    'Cardiovascular': { bg: '#fce4ec', text: '#c62828', icon: '❤️' },
    'Endocrine': { bg: '#fff3e0', text: '#e65100', icon: '🧬' },
    'Respiratory': { bg: '#e3f2fd', text: '#0d47a1', icon: '🫁' },
    'Gastrointestinal': { bg: '#e8f5e9', text: '#2e7d32', icon: '🍽️' },
    'Renal': { bg: '#e0f2f1', text: '#004d40', icon: '🧫' },
    'Neurological': { bg: '#f3e5f5', text: '#4a148c', icon: '🧠' },
    'Psychiatric': { bg: '#fce4ec', text: '#880e4f', icon: '🧠' },
    'Musculoskeletal': { bg: '#fff3e0', text: '#bf360c', icon: '🦴' },
    'Surgical': { bg: '#ffebee', text: '#b71c1c', icon: '🔪' },
    'Neurosurgical': { bg: '#f3e5f5', text: '#4a148c', icon: '🧠' },
    'Urological': { bg: '#e0f7fa', text: '#00695c', icon: '💧' },
    'Pediatric': { bg: '#fff8e1', text: '#f57f17', icon: '👶' },
    'Geriatric': { bg: '#f5f5f5', text: '#424242', icon: '👴' },
    'Infectious': { bg: '#ffebee', text: '#b71c1c', icon: '🦠' },
    'Dermatological': { bg: '#fce4ec', text: '#880e4f', icon: '🧴' },
    'Ophthalmological': { bg: '#e3f2fd', text: '#0d47a1', icon: '👁️' },
    'ENT': { bg: '#f1f8e9', text: '#33691e', icon: '👂' },
    'Rheumatological': { bg: '#f3e5f5', text: '#4a148c', icon: '🧬' },
    'OB/GYN': { bg: '#fce4ec', text: '#880e4f', icon: '👩‍⚕️' },
    'Hematological': { bg: '#ffebee', text: '#b71c1c', icon: '🩸' },
    'General': { bg: '#f5f5f5', text: '#424242', icon: '📋' }
};



var customDiagnoses = [];





// ─── ENHANCED DIAGNOSIS OPTIONS WITH SEARCH ───
function getDiagnosisOptions(existingDiagnoses) {
    var allDiagnoses = [...commonDiagnoses];
    
    // Add custom diagnoses if any
    if (typeof customDiagnoses !== 'undefined' && customDiagnoses.length > 0) {
        customDiagnoses.forEach(function(d) {
            if (!allDiagnoses.some(function(c) { return c.code === d.code; })) {
                allDiagnoses.push(d);
            }
        });
    }
    
    // Add existing patient diagnoses if not in list
    if (existingDiagnoses && existingDiagnoses.length > 0) {
        existingDiagnoses.forEach(function(d) {
            if (!allDiagnoses.some(function(c) { return c.code === d.code; })) {
                allDiagnoses.push({ 
                    code: d.code, 
                    name: d.name, 
                    department: d.department || 'General',
                    color: d.color || '#6c757d',
                    category: d.category || 'General'
                });
            }
        });
    }
    
    // Group by category
    var grouped = {};
    allDiagnoses.forEach(function(d) {
        var cat = d.category || 'General';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(d);
    });
    
    // Sort categories
    var sortedCategories = Object.keys(grouped).sort();
    
    // Build HTML with optgroups and colors
    var html = '';
    html += '<option value="">-- Select a diagnosis --</option>';
    
    sortedCategories.forEach(function(cat) {
        var color = categoryColors[cat];
        var bgColor = color ? color.bg : '#f5f5f5';
        var textColor = color ? color.text : '#424242';
        var icon = color ? color.icon : '📋';
        
        html += `<optgroup label="${icon} ${cat}" style="background:${bgColor}; color:${textColor};">`;
        
        // Sort diagnoses by code within category
        grouped[cat].sort(function(a, b) { return a.code.localeCompare(b.code); });
        
        grouped[cat].forEach(function(d) {
            var colorStyle = d.color ? `style="color:${d.color}; font-weight:500;"` : '';
            html += `<option value="${d.code}|${d.name}" ${colorStyle}>${d.code} - ${d.name}</option>`;
        });
        html += '</optgroup>';
    });
    
    return html;
}





// ─── ENHANCED ADD DIAGNOSIS ───
function addDiagnosis() {
    var select = document.getElementById('diagnosisSelect');
    var value = select.value;
    if (!value) {
        showToast('⚠️ Please select a diagnosis', 'warning');
        return;
    }
    
    var parts = value.split('|');
    var code = parts[0];
    var name = parts[1];
    
    // Find the diagnosis data for color/category
    var diagnosisData = commonDiagnoses.find(function(d) { return d.code === code; });
    if (!diagnosisData && typeof customDiagnoses !== 'undefined') {
        diagnosisData = customDiagnoses.find(function(d) { return d.code === code; });
    }
    
    if (currentPatient.diagnoses && currentPatient.diagnoses.some(function(d) { return d.code === code; })) {
        showToast('⚠️ Diagnosis already added', 'warning');
        return;
    }
    
    if (!currentPatient.diagnoses) currentPatient.diagnoses = [];
    currentPatient.diagnoses.push({ 
        code: code, 
        name: name,
        category: diagnosisData ? diagnosisData.category : 'General',
        color: diagnosisData ? diagnosisData.color : '#6c757d',
        department: diagnosisData ? diagnosisData.department : 'General'
    });
    currentPatient.diagnosisUpdated = new Date().toISOString();
    
    // Update UI
    displayPatientFile(currentPatient);
    showToast('✅ Diagnosis added: ' + code + ' - ' + name, 'success');
}



// ─── ENHANCED DISPLAY DIAGNOSES WITH COLORS ───
function displayDiagnoses(patient) {
    var container = document.getElementById('diagnosisList');
    if (!container) return;
    
    var diagnoses = patient?.diagnoses || [];
    
    if (diagnoses.length === 0) {
        container.innerHTML = `<span style="color: var(--tm); font-size: 13px; padding: 8px 0;">No diagnoses added. Select from the list below.</span>`;
        return;
    }
    
    var html = '';
    diagnoses.forEach(function(d) {
        var color = d.color || '#6c757d';
        var bgColor = color + '20'; // 20% opacity
        html += `<span style="background: ${bgColor}; color: ${color}; padding: 6px 14px; border-radius: 20px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; border: 0.5px solid ${color};">
            <strong>${d.code}</strong> ${d.name}
            <span onclick="removeDiagnosis('${d.code}')" style="cursor:pointer;font-size:14px;color:${color};">&times;</span>
        </span>`;
    });
    
    container.innerHTML = html;
}





function addCustomDiagnosis() {
    var code = document.getElementById('customDiagnosisCode').value.trim();
    var name = document.getElementById('customDiagnosisName').value.trim();
    if (!code) {
        showToast('⚠️ Please enter an ICD code', 'warning');
        document.getElementById('customDiagnosisCode').focus();
        return;
    }
    if (!name) {
        showToast('⚠️ Please enter a diagnosis name', 'warning');
        document.getElementById('customDiagnosisName').focus();
        return;
    }
    var exists = commonDiagnoses.some(function(d) { return d.code === code; });
    if (exists) {
        showToast('⚠️ Diagnosis already exists in the list', 'warning');
        return;
    }
    if (currentPatient.diagnoses && currentPatient.diagnoses.some(function(d) { return d.code === code; })) {
        showToast('⚠️ Diagnosis already added', 'warning');
        return;
    }
    customDiagnoses.push({ code: code, name: name });
    if (!currentPatient.diagnoses) currentPatient.diagnoses = [];
    currentPatient.diagnoses.push({ code: code, name: name });
    currentPatient.diagnosisUpdated = new Date().toISOString();
    document.getElementById('customDiagnosisCode').value = '';
    document.getElementById('customDiagnosisName').value = '';
    document.getElementById('customDiagnosisInput').style.display = 'none';
    displayPatientFile(currentPatient);
    showToast('✅ Custom diagnosis added: ' + code + ' - ' + name, 'success');
}

function removeDiagnosis(code) {
    if (!currentPatient.diagnoses) return;
    currentPatient.diagnoses = currentPatient.diagnoses.filter(function(d) { return d.code !== code; });
    currentPatient.diagnosisUpdated = new Date().toISOString();
    if (typeof updatePatient === 'function') {
        updatePatient(currentPatient.id, {
            diagnoses: currentPatient.diagnoses,
            diagnosisUpdated: currentPatient.diagnosisUpdated
        });
    }
    displayPatientFile(currentPatient);
    showToast('🗑️ Diagnosis removed', 'info');
}

function clearAllDiagnoses() {
    if (!currentPatient.diagnoses || currentPatient.diagnoses.length === 0) {
        showToast('⚠️ No diagnoses to clear', 'warning');
        return;
    }
    if (!confirm('⚠️ Are you sure you want to clear all diagnoses?')) return;
    currentPatient.diagnoses = [];
    currentPatient.diagnosisUpdated = new Date().toISOString();
    if (typeof updatePatient === 'function') {
        updatePatient(currentPatient.id, {
            diagnoses: currentPatient.diagnoses,
            diagnosisUpdated: currentPatient.diagnosisUpdated
        });
    }
    displayPatientFile(currentPatient);
    showToast('🗑️ All diagnoses cleared', 'info');
}

function saveDiagnosis() {
    if (!currentPatient) {
        showToast('❌ No patient selected', 'error');
        return;
    }
    var select = document.getElementById('diagnosisSelect');
    if (select && select.value) {
        addDiagnosis();
    }
    if (typeof updatePatient === 'function') {
        updatePatient(currentPatient.id, {
            diagnoses: currentPatient.diagnoses || [],
            diagnosisUpdated: new Date().toISOString()
        });
    }
    if (currentPatient.diagnoses && currentPatient.diagnoses.length > 0) {
        var diagnosisText = currentPatient.diagnoses.map(function(d) {
            return d.code + ' - ' + d.name;
        }).join('\n');
        var noteData = {
            doctor: 'Dr. Mutua',
            note: 'Diagnoses:\n' + diagnosisText,
            type: 'Diagnosis',
            status: 'Active',
            timestamp: new Date().toISOString()
        };
        if (typeof addClinicalNote === 'function') {
            addClinicalNote(currentPatient.id, noteData);
        } else {
            if (!currentPatient.clinicalNotes) currentPatient.clinicalNotes = [];
            currentPatient.clinicalNotes.push({ id: Date.now(), ...noteData });
        }
    }
    displayPatientFile(currentPatient);
    showToast('✅ Diagnosis saved successfully!', 'success');
}

// ─── SAVE CLINICAL SECTIONS (MOVED HERE - OUTSIDE displayPatientFile) ───
function saveClinicalSections() {
    if (!currentPatient) {
        showToast('❌ No patient selected', 'error');
        return;
    }
    var chiefComplaint = document.getElementById('editChiefComplaint').value.trim();
    var medicalHistory = document.getElementById('editMedicalHistory').value.trim();
    var physicalExam = document.getElementById('editPhysicalExam').value.trim();
    currentPatient.chiefComplaint = chiefComplaint;
    currentPatient.medicalHistory = medicalHistory;
    currentPatient.physicalExam = physicalExam;
    currentPatient.clinicalSectionsUpdated = new Date().toISOString();
    var notes = [];
    if (chiefComplaint) notes.push('Chief Complaint: ' + chiefComplaint);
    if (medicalHistory) notes.push('Medical History: ' + medicalHistory);
    if (physicalExam) notes.push('Physical Examination: ' + physicalExam);
    if (notes.length > 0) {
        var noteData = {
            doctor: 'Dr. Mutua',
            note: notes.join('\n\n'),
            type: 'Clinical Summary',
            status: 'Active',
            timestamp: new Date().toISOString()
        };
        if (typeof addClinicalNote === 'function') {
            addClinicalNote(currentPatient.id, noteData);
        } else {
            if (!currentPatient.clinicalNotes) currentPatient.clinicalNotes = [];
            currentPatient.clinicalNotes.push({ id: Date.now(), ...noteData });
        }
    }
    if (typeof updatePatient === 'function') {
        updatePatient(currentPatient.id, {
            chiefComplaint: chiefComplaint,
            medicalHistory: medicalHistory,
            physicalExam: physicalExam,
            clinicalSectionsUpdated: currentPatient.clinicalSectionsUpdated
        });
    }
    displayPatientFile(currentPatient);
    showToast('✅ Clinical information saved successfully!', 'success');
}

// ─── MEDICATION DATA ───
var medicationList = [
    { name: 'Paracetamol', category: 'Analgesic', defaultDosage: '500mg' },
    { name: 'Amoxicillin', category: 'Antibiotic', defaultDosage: '500mg' },
    { name: 'Ceftriaxone', category: 'Antibiotic', defaultDosage: '1g' },
    { name: 'Metformin', category: 'Antidiabetic', defaultDosage: '500mg' },
    { name: 'Salbutamol', category: 'Respiratory', defaultDosage: '100mcg' },
    { name: 'Omeprazole', category: 'Gastrointestinal', defaultDosage: '20mg' },
    { name: 'Losartan', category: 'Antihypertensive', defaultDosage: '50mg' },
    { name: 'Atorvastatin', category: 'Cardiovascular', defaultDosage: '40mg' },
    { name: 'Ibuprofen', category: 'Analgesic', defaultDosage: '400mg' },
    { name: 'Azithromycin', category: 'Antibiotic', defaultDosage: '500mg' },
    { name: 'Doxycycline', category: 'Antibiotic', defaultDosage: '100mg' },
    { name: 'Fluconazole', category: 'Antifungal', defaultDosage: '150mg' },
    { name: 'Acyclovir', category: 'Antiviral', defaultDosage: '400mg' },
    { name: 'Captopril', category: 'Antihypertensive', defaultDosage: '25mg' },
    { name: 'Furosemide', category: 'Cardiovascular', defaultDosage: '40mg' },
    { name: 'Prednisolone', category: 'Hormonal', defaultDosage: '5mg' },
    { name: 'Levothyroxine', category: 'Hormonal', defaultDosage: '50mcg' },
    { name: 'Insulin', category: 'Antidiabetic', defaultDosage: '10 units' },
    { name: 'Diazepam', category: 'Neurological', defaultDosage: '5mg' },
    { name: 'Sertraline', category: 'Psychiatric', defaultDosage: '50mg' }
];

var customMedications = [];

// ─── MEDICATION COLOR GROUPS ───
function getMedicationColor(category) {
    var colors = {
        'Antibiotic': { bg: '#fce4ec', text: '#c62828', border: '#ef9a9a' },
        'Analgesic': { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
        'Antihypertensive': { bg: '#e8eaf6', text: '#283593', border: '#9fa8da' },
        'Antidiabetic': { bg: '#e0f7fa', text: '#00695c', border: '#80deea' },
        'Antifungal': { bg: '#f3e5f5', text: '#6a1b9a', border: '#ce93d8' },
        'Antiviral': { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
        'Cardiovascular': { bg: '#ffebee', text: '#b71c1c', border: '#ef9a9a' },
        'Respiratory': { bg: '#e1f5fe', text: '#01579b', border: '#81d4fa' },
        'Gastrointestinal': { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
        'Neurological': { bg: '#f3e5f5', text: '#4a148c', border: '#ce93d8' },
        'Psychiatric': { bg: '#e8eaf6', text: '#1a237e', border: '#9fa8da' },
        'Dermatological': { bg: '#fce4ec', text: '#880e4f', border: '#f48fb1' },
        'Hormonal': { bg: '#fff8e1', text: '#f57f17', border: '#ffe082' },
        'Vaccine': { bg: '#e0f2f1', text: '#004d40', border: '#80cbc4' },
        'General': { bg: '#f5f5f5', text: '#424242', border: '#bdbdbd' }
    };
    return colors[category] || colors['General'];
}

// ─── GET MEDICATION OPTIONS ───
function getMedicationOptions(existingPrescriptions) {
    var allMeds = [...medicationList];
    
    // Add custom medications
    if (typeof customMedications !== 'undefined' && customMedications.length > 0) {
        customMedications.forEach(function(m) {
            if (!allMeds.some(function(c) { return c.name === m.name; })) {
                allMeds.push(m);
            }
        });
    }
    
    // Sort by name
    allMeds.sort(function(a, b) { return a.name.localeCompare(b.name); });
    
    // Group by category for better display
    var grouped = {};
    allMeds.forEach(function(m) {
        if (!grouped[m.category]) grouped[m.category] = [];
        grouped[m.category].push(m);
    });
    
    var html = '';
    for (var cat in grouped) {
        var color = getMedicationColor(cat);
        html += `<optgroup label="${cat}" style="background:${color.bg};">`;
        grouped[cat].forEach(function(m) {
            html += `<option value="${m.name}|${m.category}|${m.defaultDosage || ''}">${m.name} (${m.defaultDosage || ''})</option>`;
        });
        html += '</optgroup>';
    }
    return html;
}

// ─── TOGGLE CUSTOM MEDICATION INPUT ───
function toggleCustomMedication() {
    var inputDiv = document.getElementById('customMedicationInput');
    if (inputDiv.style.display === 'none') {
        inputDiv.style.display = 'block';
        document.getElementById('customMedicationName').focus();
    } else {
        inputDiv.style.display = 'none';
        document.getElementById('customMedicationName').value = '';
        document.getElementById('customMedicationDosage').value = '';
    }
}

// ─── ADD CUSTOM MEDICATION ───
function addCustomMedication() {
    var name = document.getElementById('customMedicationName').value.trim();
    var category = document.getElementById('customMedicationCategory').value;
    var dosage = document.getElementById('customMedicationDosage').value.trim();
    
    if (!name) {
        showToast('⚠️ Please enter a medication name', 'warning');
        document.getElementById('customMedicationName').focus();
        return;
    }
    
    if (!dosage) {
        showToast('⚠️ Please enter dosage', 'warning');
        document.getElementById('customMedicationDosage').focus();
        return;
    }
    
    // Check if already exists
    var exists = medicationList.some(function(m) { return m.name === name; });
    if (exists) {
        showToast('⚠️ Medication already exists in the list', 'warning');
        return;
    }
    
    var newMed = { name: name, category: category, defaultDosage: dosage };
    customMedications.push(newMed);
    
    document.getElementById('customMedicationName').value = '';
    document.getElementById('customMedicationDosage').value = '';
    document.getElementById('customMedicationInput').style.display = 'none';
    
    // Also add to patient
    addPrescriptionToPatient(name, category, dosage);
    
    showToast('✅ Custom medication added: ' + name, 'success');
}

// ─── ADD PRESCRIPTION ───
function addPrescription() {
    var select = document.getElementById('medicationSelect');
    var value = select.value;
    var dosage = document.getElementById('prescriptionDosage').value.trim();
    var frequency = document.getElementById('prescriptionFrequency').value;
    
    if (!value) {
        showToast('⚠️ Please select a medication', 'warning');
        return;
    }
    
    var parts = value.split('|');
    var name = parts[0];
    var category = parts[1] || 'General';
    var defaultDosage = parts[2] || '';
    
    if (!dosage) {
        dosage = defaultDosage;
        if (!dosage) {
            showToast('⚠️ Please enter dosage', 'warning');
            document.getElementById('prescriptionDosage').focus();
            return;
        }
    }
    
    addPrescriptionToPatient(name, category, dosage, frequency);
}

// ─── ADD PRESCRIPTION TO PATIENT ───
function addPrescriptionToPatient(name, category, dosage, frequency) {
    if (!currentPatient) {
        showToast('❌ No patient selected', 'error');
        return;
    }
    
    frequency = frequency || document.getElementById('prescriptionFrequency').value || 'OD';
    
    if (!currentPatient.prescriptions) currentPatient.prescriptions = [];
    
    // Check if already added
    if (currentPatient.prescriptions.some(function(r) { return r.medication === name && r.dosage === dosage; })) {
        showToast('⚠️ Prescription already added', 'warning');
        return;
    }
    
    var rx = {
        id: Date.now(),
        medication: name,
        category: category || 'General',
        dosage: dosage,
        frequency: frequency,
        status: 'Pending',
        timestamp: new Date().toISOString()
    };
    
    currentPatient.prescriptions.push(rx);
    currentPatient.prescriptionUpdated = new Date().toISOString();
    
    document.getElementById('prescriptionDosage').value = '';
    document.getElementById('medicationSelect').value = '';
    
    displayPatientFile(currentPatient);
    showToast('✅ Prescription added: ' + name + ' ' + dosage, 'success');
}

// ─── REMOVE PRESCRIPTION ───
function removePrescription(id) {
    if (!currentPatient || !currentPatient.prescriptions) return;
    
    currentPatient.prescriptions = currentPatient.prescriptions.filter(function(rx) {
        return String(rx.id) !== String(id) && rx.medication !== id;
    });
    currentPatient.prescriptionUpdated = new Date().toISOString();
    
    if (typeof updatePatient === 'function') {
        updatePatient(currentPatient.id, {
            prescriptions: currentPatient.prescriptions,
            prescriptionUpdated: currentPatient.prescriptionUpdated
        });
    }
    
    displayPatientFile(currentPatient);
    showToast('🗑️ Prescription removed', 'info');
}

// ─── CLEAR ALL PRESCRIPTIONS ───
function clearAllPrescriptions() {
    if (!currentPatient || !currentPatient.prescriptions || currentPatient.prescriptions.length === 0) {
        showToast('⚠️ No prescriptions to clear', 'warning');
        return;
    }
    
    if (!confirm('⚠️ Are you sure you want to clear all prescriptions?')) return;
    
    currentPatient.prescriptions = [];
    currentPatient.prescriptionUpdated = new Date().toISOString();
    
    if (typeof updatePatient === 'function') {
        updatePatient(currentPatient.id, {
            prescriptions: currentPatient.prescriptions,
            prescriptionUpdated: currentPatient.prescriptionUpdated
        });
    }
    
    displayPatientFile(currentPatient);
    showToast('🗑️ All prescriptions cleared', 'info');
}

// ─── SAVE PRESCRIPTION ───
function savePrescription() {
    if (!currentPatient) {
        showToast('❌ No patient selected', 'error');
        return;
    }
    
    // First add any selected medication
    var select = document.getElementById('medicationSelect');
    if (select && select.value) {
        addPrescription();
    }
    
    if (typeof updatePatient === 'function') {
        updatePatient(currentPatient.id, {
            prescriptions: currentPatient.prescriptions || [],
            prescriptionUpdated: new Date().toISOString()
        });
    }
    
    // Save as clinical note
    if (currentPatient.prescriptions && currentPatient.prescriptions.length > 0) {
        var rxText = currentPatient.prescriptions.map(function(rx) {
            var color = getMedicationColor(rx.category || 'General');
            return rx.medication + ' ' + rx.dosage + ' (' + rx.frequency + ')';
        }).join('\n');
        
        var noteData = {
            doctor: 'Dr. Mutua',
            note: 'Prescriptions:\n' + rxText,
            type: 'Prescription',
            status: 'Active',
            timestamp: new Date().toISOString()
        };
        
        if (typeof addClinicalNote === 'function') {
            addClinicalNote(currentPatient.id, noteData);
        } else {
            if (!currentPatient.clinicalNotes) currentPatient.clinicalNotes = [];
            currentPatient.clinicalNotes.push({ id: Date.now(), ...noteData });
        }
    }
    
    displayPatientFile(currentPatient);
    showToast('✅ Prescriptions saved successfully!', 'success');
}

// ─── TOGGLE CUSTOM DIAGNOSIS INPUT ───
function addNewDiagnosis() {
    var inputDiv = document.getElementById('customDiagnosisInput');
    if (!inputDiv) return;
    
    if (inputDiv.style.display === 'none' || inputDiv.style.display === '') {
        inputDiv.style.display = 'block';
        var codeField = document.getElementById('customDiagnosisCode');
        if (codeField) codeField.focus();
    } else {
        inputDiv.style.display = 'none';
        var codeField = document.getElementById('customDiagnosisCode');
        var nameField = document.getElementById('customDiagnosisName');
        if (codeField) codeField.value = '';
        if (nameField) nameField.value = '';
    }
}

// ─── DISPLAY PATIENT FILE (HEADER ONLY) ───
function displayPatientFile(patient) {
    if (!patient) {
        showToast('❌ No patient selected', 'error');
        return;
    }

    // ─── HIDE MAIN PANEL ───
    var mainPanel = document.querySelector('.main-panel');
    if (mainPanel) {
        mainPanel.style.display = 'none';
    }

    var contentArea = document.querySelector('.content-area');
    if (!contentArea) return;

    function calcAge(dob) {
        if (!dob) return '--';
        var birth = new Date(dob);
        var today = new Date();
        var age = today.getFullYear() - birth.getFullYear();
        var m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age;
    }

    var age = calcAge(patient.dob);
    var initials = (patient.firstName ? patient.firstName[0] : '') + (patient.lastName ? patient.lastName[0] : '') || '??';

    var colors = [
        {bg:'#1a2a4a', txt:'#ffffff'},
        {bg:'#1a3a2a', txt:'#ffffff'},
        {bg:'#3a2a1a', txt:'#ffffff'},
        {bg:'#2a1a3a', txt:'#ffffff'},
        {bg:'#3a1a1a', txt:'#ffffff'},
        {bg:'#0a3a3a', txt:'#ffffff'}
    ];
    var c = colors[patient.id % colors.length] || colors[0];

    // ─── BUILD ONLY THE HEADER ───
    var html = `
        <div class="patient-file-container" style="animation: fadeIn 0.4s ease;">
            <!-- ─── HEADER WITH PATIENT INFO ─── -->
            <div style="background: linear-gradient(135deg, var(--s1), var(--s3)); border-radius: 16px; padding: 24px; margin-bottom: 20px; border: 0.5px solid var(--bd); box-shadow: var(--shadow);">
                <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                    <!-- Avatar -->
                    <div style="width: 72px; height: 72px; border-radius: 50%; background: ${c.bg}; color: ${c.txt}; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; flex-shrink: 0; box-shadow: 0 4px 16px ${c.bg}50;">
                        ${patient.photo ? `<img src="${patient.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>` : initials}
                    </div>
                    
                    <!-- Patient Details -->
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                            <h2 style="font-size: 22px; font-weight: 700; color: var(--tp); margin: 0; letter-spacing: -0.3px;">${patient.firstName || ''} ${patient.lastName || ''}</h2>
                            <span class="badge b-stable" style="font-size: 11px;">● Active</span>
                            <span class="badge b-info" style="font-size: 11px;">${patient.mrn || 'N/A'}</span>
                        </div>
                        <div style="display: flex; gap: 16px; margin-top: 6px; flex-wrap: wrap; font-size: 13px; color: var(--tm);">
                            <span><i class="ti ti-calendar"></i> ${patient.dob || '--'} (${age} yrs)</span>
                            <span><i class="ti ti-gender-male"></i> ${patient.gender || '--'}</span>
                            <span><i class="ti ti-phone"></i> ${patient.phone || '--'}</span>
                            <span><i class="ti ti-building-hospital"></i> ${patient.department || 'General'}</span>
                        </div>
                    </div>

                    <!-- ─── QUICK ACTIONS (each button tagged with data-color for distinct color) ─── -->
                    <div class="quick-actions" style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; flex-shrink: 0;">
                        <button class="btn-apple" data-color="opd"        onclick="event.stopPropagation();openOpdFileModal(currentPatient);"><i class="ti ti-folder-open"></i> OPD File</button>




                        <button class="btn-apple" data-color="transfer"   onclick="event.stopPropagation();openTransferModal();"><i class="ti ti-arrows-exchange"></i> Transfer</button>
                       
                      <button class="btn-apple" data-color="lab" onclick="event.stopPropagation();openLabRequestPage(currentPatient)"><i class="ti ti-test-pipe"></i> Lab Request</button>

                       

                     <button class="btn-apple" data-color="result"     onclick="event.stopPropagation();openLabResultsPage(currentPatient)"><i class="ti ti-chart-bar"></i> Lab Result</button>
                       


                        <button class="btn-apple" data-color="imaging"    onclick="event.stopPropagation();openImagingPageModal(currentPatient)"><i class="ti ti-radio"></i> Imaging Request</button>
                        <button class="btn-apple" data-color="result"     onclick="event.stopPropagation();openImagingResultsPage(currentPatient)"><i class="ti ti-photo-scan"></i> Image Result</button>
                        <button class="btn-apple" data-color="vitals"     onclick="event.stopPropagation();viewAllVitals();"><i class="ti ti-heart"></i> Vitals</button>
                        <button class="btn-apple" data-color="surgery"    onclick="event.stopPropagation();switchTab('surgery', document.querySelector('[data-tab=&quot;surgery&quot;]'))"><i class="ti ti-scalpel"></i> Surgery</button>
                        <button class="btn-apple" data-color="prescription" onclick="event.stopPropagation();openPrescriptionModal(currentPatient)"><i class="ti ti-pill"></i> Prescription</button>
                        <button class="btn-apple" data-color="physio"       onclick="event.stopPropagation();openPhysioRequestModal(currentPatient)"><i class="ti ti-accessible"></i> Physio Request</button>
                        <button class="btn-apple" data-color="ward"       onclick="event.stopPropagation();openWardRoundModal(currentPatient)"><i class="ti ti-bed"></i> Ward Round</button>
                        <button class="btn-apple" data-color="photos"     onclick="document.getElementById('patientPhotoInput').click()"><i class="ti ti-photo"></i> Photos</button>
                        <button class="btn-apple" data-color="video"      onclick="document.getElementById('patientVideoInput').click()"><i class="ti ti-video"></i> Video</button>
                        <button class="btn-apple" data-color="print"      onclick="window.print()"><i class="ti ti-printer"></i> Print</button>
                        <button class="btn-apple" data-color="close"      onclick="closePatientFile()"><i class="ti ti-x"></i> Close</button>
                        <input type="file" id="patientPhotoInput" accept="image/*" capture="environment" style="display:none" onchange="handlePatientMedia(event)"/>
                        <input type="file" id="patientVideoInput" accept="video/*" style="display:none" onchange="handlePatientVideo(event)"/>
                    </div>
                </div>
            </div>
        </div>
    `;

    // ─── INSERT INTO CONTENT AREA ───
    var existingContainer = document.getElementById('patientFileContainer');
    if (existingContainer) {
        existingContainer.innerHTML = html;
        existingContainer.style.display = 'block';
    } else {
        var container = document.createElement('div');
        container.id = 'patientFileContainer';
        container.innerHTML = html;
        contentArea.prepend(container);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}












// ─── CLOSE PATIENT FILE ───
function closePatientFile() {
    var container = document.getElementById('patientFileContainer');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
    
    // ─── SHOW MAIN PANEL ───
    var mainPanel = document.querySelector('.main-panel');
    if (mainPanel) {
        mainPanel.style.display = 'block';
    }
}









// ─── LAB DROPDOWN FUNCTIONS ───
function toggleLabDropdown() {
    var dropdown = document.getElementById('labDropdown');
    if (dropdown.style.display === 'none' || dropdown.style.display === '') {
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}

function closeLabDropdown() {
    document.getElementById('labDropdown').style.display = 'none';
}

// ─── // ─── NAVIGATE TO LAB REQUEST ───
function navigateToLabRequest() {
    // 1. Find the Lab tab button in the navigation
    var labTab = document.querySelector('[data-tab="lab"]');
    
    // 2. Switch to Lab tab using the tab click
    if (labTab) {
        labTab.click();
    }
    
    // 3. Highlight the lab request form section
    setTimeout(function() {
        var labForm = document.querySelector('#tab-lab .fg');
        if (labForm) {
            labForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            labForm.style.animation = 'highlightPulse 1s ease 2';
            setTimeout(function() {
                labForm.style.animation = '';
            }, 2000);
        }
    }, 500);
    
    showToast('🧪 Opening Lab Request Form', 'info');
}



// ─── NAVIGATE TO LAB REQUESTS HISTORY ───
function navigateToLabRequestsHistory() {
    // 1. Find the Lab tab button in the navigation
    var labTab = document.querySelector('[data-tab="lab"]');
    
    // 2. Switch to Lab tab using the tab click
    if (labTab) {
        labTab.click();
    }
    
    // 3. Scroll to the lab requests history section
    setTimeout(function() {
        var labHistory = document.getElementById('labRequestsList');
        if (labHistory) {
            labHistory.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 500);
    
    showToast('📋 Opening Lab Request History', 'info');
}











// ─── CLOSE DROPDOWN ON CLICK OUTSIDE ───
document.addEventListener('click', function(event) {
    var dropdown = document.getElementById('labDropdown');
    var button = document.querySelector('[onclick="toggleLabDropdown()"]');
    if (dropdown && button) {
        if (!button.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    }
});




       // ─── LOAD PATIENTS FROM SHARED DATA ───
function loadPatients() {
    try {
        if (typeof getPatients !== 'function') {
            console.warn('⚠️ getPatients not available. Using sample data.');
            return loadSamplePatients();
        }
        const allPatients = getPatients();
        console.log('📊 Loaded', allPatients.length, 'patients from shared data');
        debouncedRenderPatientTable(allPatients);  // <-- CHANGE THIS
        updateKPIs(allPatients);
        return allPatients;
    } catch (e) {
        console.error('Error loading patients:', e);
        return loadSamplePatients();
    }
}









        // ─── QUICK ACTION HELPER ───
function quickAction(tabName, subTabId) {
    if (tabName === 'physio' || subTabId === 'tab-physio') {
        openPhysioRequestModal(currentPatient);
        return;
    }
    // 1. Find the nav tab by data-tab attribute
    const navTab = document.querySelector(`[data-tab="${tabName}"]`);
    
    // 2. If nav tab exists, switch to it
    if (navTab) {
        switchTab(tabName, navTab);
    }
    
    // 3. Find the sub-tab by onclick attribute
    const subTab = document.querySelector(`[onclick*="${subTabId}"]`);
    if (subTab) {
        switchSubTab(subTab, subTabId);
    }
    
    // 4. If a patient is selected, refresh content
    if (currentPatient) {
        if (tabName === 'lab') {
            displayLabRequests(currentPatient);
           
        } else if (tabName === 'patients') {
            renderPatientTable();
        } else if (tabName === 'theater') {
            renderTheaterList();
        }
    }
}


function toggleInsurancePanel() {
    const panel = document.getElementById('pc-insurance-panel');
    const btn = document.querySelector('.pc-insurance-toggle');
    panel.hidden = !panel.hidden;
    btn.classList.toggle('open', !panel.hidden);
}


        // ─── SAMPLE PATIENTS (fallback) ───
        function loadSamplePatients() {
            const sample = [
                { id: 1001, firstName: 'John', lastName: 'Kamau', mrn: 'MRN 1001', dob: '1968-03-14', gender: 'Male',
                    phone: '+254 712 345 678', status: 'active', department: 'Cardiology' },
                { id: 1002, firstName: 'Grace', lastName: 'Wanjiru', mrn: 'MRN 1002', dob: '1972-08-03', gender: 'Female',
                    phone: '+254 722 987 654', status: 'active', department: 'Cardiology' },
                { id: 1003, firstName: 'Samuel', lastName: 'Otieno', mrn: 'MRN 1003', dob: '1965-02-22', gender: 'Male',
                    phone: '+254 710 654 321', status: 'active', department: 'Cardiology' }
            ];
            renderPatientTable(sample);
            updateKPIs(sample);
            return sample;
        }

        



// ─── OPTIMIZED RENDER PATIENT TABLE ───
var patientTableCache = null;
var patientTableFilterKey = '';

function renderPatientTable(patients) {
    const tbody = document.getElementById('patientTableBody');
    if (!tbody) return;

    const filter = document.getElementById('ptSearch')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';

    // Create cache key
    const cacheKey = filter + '|' + statusFilter + '|' + (patients ? patients.length : 0);
    
    // Only re-render if filter changed
    if (patientTableCache && patientTableFilterKey === cacheKey) {
        // Just update the count
        const data = patients || getPatients() || [];
        document.getElementById('patientCount').textContent = data.length;
        return;
    }

    let data = patients || getPatients() || [];

    // Apply filters
    if (filter) {
        data = data.filter(p =>
            (p.firstName + ' ' + p.lastName).toLowerCase().includes(filter) ||
            (p.mrn || '').toLowerCase().includes(filter)
        );
    }

    if (statusFilter !== 'all') {
        data = data.filter(p => (p.status || 'active') === statusFilter);
    }

    document.getElementById('patientCount').textContent = data.length;

    if (data.length === 0) {
        const emptyHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--tm);">No patients found.</td></tr>`;
        tbody.innerHTML = emptyHTML;
        patientTableCache = emptyHTML;
        patientTableFilterKey = cacheKey;
        return;
    }

    // Build HTML efficiently using for loop (faster than map for large datasets)
    var html = '';
    for (var i = 0; i < data.length; i++) {
        var p = data[i];
        html += `<tr onclick="selectPatient(${p.id})" style="cursor:pointer;">
            <td><strong>${p.firstName || ''} ${p.lastName || ''}</strong></td>
            <td><span class="badge b-info">${p.mrn || 'N/A'}</span></td>
            <td>${p.dob || 'N/A'} (${getAge(p.dob)})</td>
            <td>${p.gender || 'N/A'}</td>
            <td>${p.phone || 'N/A'}</td>
            <td><span class="badge ${(p.status || 'active') === 'active' ? 'b-stable' : 'b-warn'}">${p.status || 'active'}</span></td>
            <td>
                <button class="btn-s" style="padding:2px 10px;font-size:10px;" onclick="event.stopPropagation();selectPatient(${p.id})"><i class="ti ti-eye"></i> View</button>
                <button class="btn-s" style="padding:2px 10px;font-size:10px;background:var(--acb);color:var(--ac);" onclick="event.stopPropagation();addNoteForPatient(${p.id})"><i class="ti ti-notes"></i> Note</button>
            </td>
        </tr>`;
    }
    
    tbody.innerHTML = html;
    patientTableCache = html;
    patientTableFilterKey = cacheKey;
}













        // ─── DISPLAY PRESCRIPTION HISTORY ───
        function displayPrescriptionHistory(patient) {
            var container = document.getElementById('rxHistoryList');
            var count = document.getElementById('rxHistoryCount');
            
            if (!container) return;

            var prescriptions = patient?.prescriptions || [];
            
            if (count) {
                count.textContent = prescriptions.length + ' prescription' + (prescriptions.length !== 1 ? 's' : '');
            }

            if (prescriptions.length === 0) {
                container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--tm);font-size:12px;">No prescriptions found for this patient.</p>';
                return;
            }

            var sorted = [...prescriptions].reverse();

            container.innerHTML = sorted.map(function(rx) {
                var statusClass = rx.status === 'Pending' ? 'pending' : rx.status === 'Dispensed' ? 'dispensed' : 'cancelled';
                var statusLabel = rx.status || 'Pending';
                var date = rx.timestamp ? new Date(rx.timestamp).toLocaleString() : 'No date';
                
                var actions = '';
                if (rx.status === 'Pending') {
                    actions = '<button class="btn-void" onclick="voidPrescription(' + patient.id + ', ' + rx.id + ')"><i class="ti ti-x"></i> Void</button>';
                }
                actions += '<button class="btn-print-rx" onclick="printPrescription(' + patient.id + ', ' + rx.id + ')"><i class="ti ti-printer"></i> Print</button>';
                
                return '<div class="rx-history-item">' +
                    '<div class="rx-header">' +
                        '<span class="rx-time">🕐 ' + date + '</span>' +
                        '<span class="rx-doctor">👨‍⚕️ ' + (rx.prescribedBy || 'Unknown') + '</span>' +
                        '<span class="rx-status-badge ' + statusClass + '">' + statusLabel + '</span>' +
                    '</div>' +
                    '<div class="rx-content">' +
                        '<strong>Medication:</strong> ' + rx.medication + '<br>' +
                        '<strong>Dosage:</strong> ' + rx.dosage + '<br>' +
                        '<strong>Frequency:</strong> ' + rx.frequency + '<br>' +
                        (rx.duration ? '<strong>Duration:</strong> ' + rx.duration + '<br>' : '') +
                        (rx.instructions ? '<strong>Instructions:</strong> ' + rx.instructions + '<br>' : '') +
                        (rx.department ? '<strong>Department:</strong> ' + rx.department : '') +
                        (rx.dispensedBy ? '<br><strong>Dispensed By:</strong> ' + rx.dispensedBy : '') +
                        (rx.dispensedDate ? '<br><strong>Dispensed On:</strong> ' + new Date(rx.dispensedDate).toLocaleString() : '') +
                    '</div>' +
                    '<div class="rx-actions">' +
                        actions +
                    '</div>' +
                '</div>';
            }).join('');
        }






// ─── SELECT PATIENT ───
function selectPatient(id) {
    const patients = getPatients() || [];
    const p = patients.find(pt => pt.id === id);
    if (!p) {
        showToast('❌ Patient not found', 'error');
        return;
    }
    currentPatient = p;
    displayClinicalNotes(p);
    fillForms(p);
    displayPrescriptionHistory(p);
    renderVitalsHistory(p);
    displayLabRequests(p);

    
    // ─── SHOW PATIENT FILE ───
    displayPatientFile(p);
    
    showToast('👤 Loaded patient: ' + p.firstName + ' ' + p.lastName, 'success');
    document.getElementById('suggestions').classList.remove('show');
}





        // ─── VOID PRESCRIPTION ───
        function voidPrescription(patientId, rxId) {
            if (!confirm('Are you sure you want to void this prescription?')) return;
            
            try {
                var patients = getPatients();
                var patient = patients.find(function(p) { return p.id === patientId; });
                if (patient && patient.prescriptions) {
                    var rx = patient.prescriptions.find(function(p) { return p.id === rxId; });
                    if (rx) {
                        rx.status = 'Cancelled';
                        rx.voidedBy = 'Doctor';
                        rx.voidedDate = new Date().toISOString();
                        updatePatient(patientId, { prescriptions: patient.prescriptions });
                        showToast('✅ Prescription voided successfully!', 'success');
                        displayPrescriptionHistory(patient);
                    } else {
                        showToast('❌ Prescription not found', 'error');
                    }
                } else {
                    showToast('❌ Patient not found', 'error');
                }
            } catch(e) {
                console.error('Error voiding prescription:', e);
                showToast('❌ Error voiding prescription', 'error');
            }
        }

        // ─── PRINT PRESCRIPTION ───
        function printPrescription(patientId, rxId) {
            try {
                var patients = getPatients();
                var patient = patients.find(function(p) { return p.id === patientId; });
                if (patient && patient.prescriptions) {
                    var rx = patient.prescriptions.find(function(p) { return p.id === rxId; });
                    if (rx) {
                        var printContent = 
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            '              PCLINIC PRESCRIPTION\n' +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                            'Patient: ' + (patient.firstName || '') + ' ' + (patient.lastName || '') + '\n' +
                            'MRN: ' + (patient.mrn || 'N/A') + '\n' +
                            'Date: ' + new Date(rx.timestamp).toLocaleDateString() + '\n\n' +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            'Medication: ' + rx.medication + '\n' +
                            'Dosage: ' + rx.dosage + '\n' +
                            'Frequency: ' + rx.frequency + '\n' +
                            (rx.duration ? 'Duration: ' + rx.duration + '\n' : '') +
                            (rx.instructions ? 'Instructions: ' + rx.instructions + '\n' : '') +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            'Prescribed By: ' + (rx.prescribedBy || 'Unknown') + '\n' +
                            'Department: ' + (rx.department || 'General') + '\n' +
                            'Status: ' + rx.status + '\n' +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            '            PClinic - Quality Healthcare\n' +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
                        
                        var printWindow = window.open('', '_blank', 'width=600,height=400');
                        printWindow.document.write('<pre style="font-family:monospace;padding:20px;font-size:14px;">' + printContent + '</pre>');
                        printWindow.document.close();
                        printWindow.print();
                        showToast('🖨️ Prescription sent to printer', 'success');
                    } else {
                        showToast('❌ Prescription not found', 'error');
                    }
                } else {
                    showToast('❌ Patient not found', 'error');
                }
            } catch(e) {
                console.error('Error printing prescription:', e);
                showToast('❌ Error printing prescription', 'error');
            }
        }

        // ─── UPDATE KPIs ───
        function updateKPIs(patients) {
            const data = patients || getPatients() || [];
            const active = data.filter(p => (p.status || 'active') === 'active');
            const critical = data.filter(p => p.priority === 'critical' || (p.vitals && p.vitals.some(v => v.painScore && parseInt(v.painScore) > 7)));
            const review = data.filter(p => p.status === 'pending_review');
            const discharge = data.filter(p => p.status === 'ready_discharge');

            document.getElementById('kpiAdmitted').textContent = active.length;
            document.getElementById('kpiReview').textContent = review.length || 0;
            document.getElementById('kpiCritical').textContent = critical.length || 0;
            document.getElementById('kpiDischarge').textContent = discharge.length || 0;
        }

        // ─── GET AGE ───
        function getAge(dob) {
            if (!dob) return 'N/A';
            const birth = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
            return age + ' yrs';
        }
// ─── UPDATE DOCTOR VITALS DISPLAY (Strip) ───
function updateDoctorVitals(patient) {
    // Update vitals count first
    const countEl = document.getElementById('vitalsCount');
    if (countEl) {
        const count = patient?.vitals?.length || 0;
        countEl.textContent = count + ' records';
    }
    
    if (!patient || !patient.vitals || patient.vitals.length === 0) {
        document.getElementById('docVitalHR').innerHTML = '--<span class="vital-unit"> bpm</span>';
        document.getElementById('docVitalHRStatus').textContent = '--';
        document.getElementById('docVitalBP').innerHTML = '--<span class="vital-unit">/--</span>';
        document.getElementById('docVitalBPStatus').textContent = '--';
        document.getElementById('docVitalSpO2').innerHTML = '--<span class="vital-unit">%</span>';
        document.getElementById('docVitalSpO2Status').textContent = '--';
        document.getElementById('docVitalTemp').innerHTML = '--<span class="vital-unit">°C</span>';
        document.getElementById('docVitalTempStatus').textContent = '--';
        return;
    }

    const lastVital = patient.vitals[patient.vitals.length - 1];
    
    // HR
    const hr = lastVital.pulse || lastVital.hr || '--';
    document.getElementById('docVitalHR').innerHTML = hr + '<span class="vital-unit"> bpm</span>';
    const hrStatus = document.getElementById('docVitalHRStatus');
    if (hr !== '--') {
        if (hr > 100) { hrStatus.textContent = 'Elevated'; hrStatus.className = 'vital-status vs-hi'; }
        else if (hr < 60) { hrStatus.textContent = 'Low'; hrStatus.className = 'vital-status vs-hi'; }
        else { hrStatus.textContent = 'Normal'; hrStatus.className = 'vital-status vs-ok'; }
    } else { hrStatus.textContent = '--'; hrStatus.className = 'vital-status'; }

    // BP
    const sys = lastVital.bpSystolic || lastVital.systolic || '--';
    const dia = lastVital.bpDiastolic || lastVital.diastolic || '--';
    document.getElementById('docVitalBP').innerHTML = sys + '<span class="vital-unit">/' + dia + '</span>';
    const bpStatus = document.getElementById('docVitalBPStatus');
    if (sys !== '--' && dia !== '--') {
        if (sys > 140 || dia > 90) { bpStatus.textContent = 'High'; bpStatus.className = 'vital-status vs-hi'; }
        else if (sys < 90 || dia < 60) { bpStatus.textContent = 'Low'; bpStatus.className = 'vital-status vs-hi'; }
        else { bpStatus.textContent = 'Normal'; bpStatus.className = 'vital-status vs-ok'; }
    } else { bpStatus.textContent = '--'; bpStatus.className = 'vital-status'; }

    // SpO2
    const spo2 = lastVital.spo2 || lastVital.spO2 || '--';
    document.getElementById('docVitalSpO2').innerHTML = spo2 + '<span class="vital-unit">%</span>';
    const spo2Status = document.getElementById('docVitalSpO2Status');
    if (spo2 !== '--') {
        if (spo2 < 95) { spo2Status.textContent = 'Low'; spo2Status.className = 'vital-status vs-hi'; }
        else { spo2Status.textContent = 'Normal'; spo2Status.className = 'vital-status vs-ok'; }
    } else { spo2Status.textContent = '--'; spo2Status.className = 'vital-status'; }

    // Temperature
    const temp = lastVital.temperature || lastVital.temp || '--';
    document.getElementById('docVitalTemp').innerHTML = temp + '<span class="vital-unit">°C</span>';
    const tempStatus = document.getElementById('docVitalTempStatus');
    if (temp !== '--') {
        if (temp > 37.5) { tempStatus.textContent = 'Elevated'; tempStatus.className = 'vital-status vs-hi'; }
        else if (temp < 36.0) { tempStatus.textContent = 'Low'; tempStatus.className = 'vital-status vs-hi'; }
        else { tempStatus.textContent = 'Normal'; tempStatus.className = 'vital-status vs-ok'; }
    } else { tempStatus.textContent = '--'; tempStatus.className = 'vital-status'; }


}
            
        // ─── ENHANCED VITALS DISPLAY (Grid) ───
        function displayEnhancedVitals(patient) {
            const grid = document.getElementById('vitalsGrid');
            const timestamp = document.getElementById('vitalsTimestamp');
            
            if (!grid) return;

            if (!patient || !patient.vitals || patient.vitals.length === 0) {
                grid.innerHTML = `<div class="no-vitals">📋 No vitals recorded yet</div>`;
                if (timestamp) timestamp.textContent = '';
                return;
            }

            const lastVital = patient.vitals[patient.vitals.length - 1];
            
            const vitalsConfig = [
                { key: 'pulse', label: 'Heart Rate', icon: '❤️', unit: 'bpm', 
                  value: lastVital.pulse || lastVital.hr || '--', normalRange: { min: 60, max: 100 } },
                { key: 'bp', label: 'Blood Pressure', icon: '🫀', unit: 'mmHg', 
                  value: (lastVital.bpSystolic || lastVital.systolic || '--') + '/' + (lastVital.bpDiastolic || lastVital.diastolic || '--'),
                  normalRange: { min: 90, max: 140 } },
                { key: 'spo2', label: 'SpO₂', icon: '💨', unit: '%', 
                  value: lastVital.spo2 || lastVital.spO2 || '--', normalRange: { min: 95, max: 100 } },
                { key: 'temperature', label: 'Temperature', icon: '🌡️', unit: '°C', 
                  value: lastVital.temperature || lastVital.temp || '--', normalRange: { min: 36.0, max: 37.5 } },
                { key: 'respiratory', label: 'Respiratory Rate', icon: '🫁', unit: '/min', 
                  value: lastVital.respiratoryRate || lastVital.respiratory || '--', normalRange: { min: 12, max: 20 } },
                { key: 'pain', label: 'Pain Score', icon: '😣', unit: '/10', 
                  value: lastVital.painScore || lastVital.pain || '--', normalRange: { min: 0, max: 3 } }
            ];

            let vitalsHTML = '';
            vitalsConfig.forEach(vital => {
                const status = getVitalStatus(vital.key, vital.value, vital.normalRange);
                vitalsHTML += `
                    <div class="vital-item">
                        <span class="vital-label">${vital.icon} ${vital.label}</span>
                        <span class="vital-value">${vital.value} <span class="vital-unit">${vital.unit}</span></span>
                        <span class="vital-status-badge ${status.class}">${status.label}</span>
                    </div>
                `;
            });

            grid.innerHTML = vitalsHTML;

            if (timestamp && lastVital.timestamp) {
                const date = new Date(lastVital.timestamp);
                timestamp.textContent = '🕐 Last updated: ' + date.toLocaleString();
            }
        }

        // ─── GET VITAL STATUS ───
        function getVitalStatus(key, value, range) {
            if (value === '--' || value === null || value === undefined) {
                return { class: 'vs-normal', label: 'N/A' };
            }

            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
                return { class: 'vs-normal', label: 'N/A' };
            }

            if (key === 'bp') {
                const parts = String(value).split('/');
                if (parts.length === 2) {
                    const sys = parseInt(parts[0]);
                    const dia = parseInt(parts[1]);
                    if (sys > 180 || dia > 120) return { class: 'vs-critical', label: '⚠️ Critical' };
                    if (sys > 140 || dia > 90) return { class: 'vs-high', label: '⬆️ High' };
                    if (sys < 90 || dia < 60) return { class: 'vs-low', label: '⬇️ Low' };
                    return { class: 'vs-normal', label: '✅ Normal' };
                }
                return { class: 'vs-normal', label: '✅ Normal' };
            }

            if (key === 'pain') {
                if (numValue > 7) return { class: 'vs-critical', label: '⚠️ Severe' };
                if (numValue > 4) return { class: 'vs-elevated', label: '⬆️ Moderate' };
                if (numValue > 0) return { class: 'vs-normal', label: '✅ Mild' };
                return { class: 'vs-normal', label: '✅ None' };
            }

            if (range) {
                if (numValue > range.max * 1.5) return { class: 'vs-critical', label: '⚠️ Critical' };
                if (numValue > range.max) return { class: 'vs-high', label: '⬆️ High' };
                if (numValue < range.min) return { class: 'vs-low', label: '⬇️ Low' };
                return { class: 'vs-normal', label: '✅ Normal' };
            }

            return { class: 'vs-normal', label: '✅ Normal' };
        }

        // ─── VIEW ALL VITALS HISTORY ───
        function viewAllVitals() {
    if (!currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }

    const vitals = currentPatient.vitals || [];
    if (vitals.length === 0) {
        showToast('📋 No vitals recorded for this patient', 'info');
        return;
    }

    let historyHTML = `
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
                <strong style="font-size: 16px;">${currentPatient.firstName || ''} ${currentPatient.lastName || ''}</strong>
                <span style="color: var(--tm); font-size: 12px; margin-left: 8px;">${currentPatient.mrn || ''}</span>
            </div>
            <span style="font-size: 12px; color: var(--tm); background: var(--acb); padding: 4px 12px; border-radius: 20px;">${vitals.length} records</span>
        </div>
        <div style="max-height: 400px; overflow-y: auto; margin-top: 8px;">
    `;

    const sortedVitals = [...vitals].reverse();
    if (sortedVitals.length === 0) {
        historyHTML += `<p style="text-align:center;padding:20px;color:var(--tm);">No vitals recorded</p>`;
    } else {
        sortedVitals.forEach(v => {
            const date = v.timestamp ? new Date(v.timestamp).toLocaleString() : 'No date';
            const pulse = v.pulse || v.hr || '--';
            const bp = (v.bpSystolic || v.systolic || '--') + '/' + (v.bpDiastolic || v.diastolic || '--');
            const spo2 = v.spo2 || v.spO2 || '--';
            const temp = v.temperature || v.temp || '--';
            const pain = v.painScore || v.pain || '--';

            historyHTML += `
                <div class="vitals-history-item" style="display: grid; grid-template-columns: 140px repeat(5, 1fr); gap: 8px; padding: 10px 12px; border-bottom: 0.5px solid var(--bd); align-items: center;">
                    <span class="vh-time" style="font-weight: 500; color: var(--ts); font-size: 11px;">${date}</span>
                    <span class="vh-value" style="font-weight: 600;">${pulse} <span class="vh-unit" style="font-weight: 400; color: var(--tm); font-size: 10px;">bpm</span></span>
                    <span class="vh-value" style="font-weight: 600;">${bp} <span class="vh-unit" style="font-weight: 400; color: var(--tm); font-size: 10px;">mmHg</span></span>
                    <span class="vh-value" style="font-weight: 600;">${spo2} <span class="vh-unit" style="font-weight: 400; color: var(--tm); font-size: 10px;">%</span></span>
                    <span class="vh-value" style="font-weight: 600;">${temp} <span class="vh-unit" style="font-weight: 400; color: var(--tm); font-size: 10px;">°C</span></span>
                    <span class="vh-value" style="font-weight: 600;">${pain} <span class="vh-unit" style="font-weight: 400; color: var(--tm); font-size: 10px;">/10</span></span>
                </div>
            `;
        });
    }
    historyHTML += '</div>';

    // Get the modal elements
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modal = document.getElementById('stat-modal');
    
    if (modalTitle) modalTitle.textContent = '📊 Vitals History';
    if (modalBody) modalBody.innerHTML = historyHTML;
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    } else {
        // Fallback: show alert if modal not found
        showToast('📊 Vitals History:\n' + historyHTML.replace(/<[^>]*>/g, ''), 'info');
    }
}
        // ─── UPDATE ALL VITALS DISPLAYS ───
        function updateAllVitalsDisplays() {
            if (currentPatient) {
                updateDoctorVitals(currentPatient);
                displayEnhancedVitals(currentPatient);
                renderVitalsHistory(currentPatient);
            }
        }

        // ─── SYNC VITALS FROM PATIENT DATA ───
        function syncVitalsFromPatientData() {
            if (currentPatient) {
                try {
                    const patients = getPatients();
                    const updated = patients.find(p => p.id === currentPatient.id);
                    if (updated) {
                        currentPatient = updated;
                        updateAllVitalsDisplays();
                    }
                } catch (e) {
                    console.log('Sync skipped - patient-data.js not loaded');
                }
            }
        }

        // ─── SYNC MEDICATION SELECT ───
        function syncMedication() {
            var other = document.getElementById('rxMedicationOther').value.trim();
            var select = document.getElementById('rxMedicationSelect');
            if (other) {
                var exists = false;
                for (var i = 0; i < select.options.length; i++) {
                    if (select.options[i].value === other) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    var opt = document.createElement('option');
                    opt.value = other;
                    opt.textContent = other + ' (custom)';
                    select.appendChild(opt);
                }
                select.value = other;
            }
        }

        // ─── ENHANCED PRESCRIPTION SUBMIT ───
        function submitPrescriptionEnhanced() {
            if (!currentPatient) {
                showToast('⚠️ Please select a patient first', 'warning');
                return;
            }

            var medSelect = document.getElementById('rxMedicationSelect').value;
            var medOther = document.getElementById('rxMedicationOther').value.trim();
            var medication = medOther || medSelect;

            var dosage = document.getElementById('rxDosage').value.trim();
            var frequency = document.getElementById('rxFrequency').value;
            var duration = document.getElementById('rxDuration').value.trim();
            var quantity = document.getElementById('rxQuantity').value.trim();
            var instructions = document.getElementById('rxInstructions').value.trim();
            var department = document.getElementById('rxDepartment').value;
            var doctor = document.getElementById('rxDoctor').value.trim() || 'Dr. Unknown';

            if (!medication || medication === '') {
                showToast('⚠️ Please enter or select a medication', 'warning');
                return;
            }

            if (!dosage) {
                showToast('⚠️ Please enter dosage', 'warning');
                return;
            }

            var prescriptionData = {
                medication: medication,
                dosage: dosage,
                frequency: frequency,
                duration: duration || '7 days',
                quantity: quantity || 'As prescribed',
                instructions: instructions || '',
                prescribedBy: doctor,
                department: department || 'General',
                status: 'Pending',
                notes: 'Prescribed on ' + new Date().toLocaleDateString()
            };

            if (typeof addPrescription === 'function') {
                var result = addPrescription(currentPatient.id, prescriptionData);
                if (result) {
                    showToast('✅ Prescription saved for ' + (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || '') + ' - ' + medication, 'success');
                    clearPrescriptionForm();
                } else {
                    showToast('❌ Failed to save prescription', 'error');
                }
            } else {
                var note = '💊 Prescription\n' +
                    'Medication: ' + medication + '\n' +
                    'Dosage: ' + dosage + '\n' +
                    'Frequency: ' + frequency + '\n' +
                    'Duration: ' + duration + '\n' +
                    'Quantity: ' + (quantity || 'As prescribed') + '\n' +
                    'Instructions: ' + instructions + '\n' +
                    'Department: ' + department + '\n' +
                    'Doctor: ' + doctor;
                
                if (typeof addClinicalNote === 'function') {
                    addClinicalNote(currentPatient.id, {
                        doctor: doctor,
                        note: note,
                        type: 'Prescription',
                        status: 'Pending'
                    });
                    showToast('✅ Prescription saved (as clinical note)', 'success');
                    clearPrescriptionForm();
                } else {
                    showToast('⚠️ Prescription saving requires addPrescription function', 'warning');
                }
            }
        }

        function clearPrescriptionForm() {
            document.getElementById('rxMedicationSelect').value = '';
            document.getElementById('rxMedicationOther').value = '';
            document.getElementById('rxDosage').value = '';
            document.getElementById('rxDuration').value = '';
            document.getElementById('rxQuantity').value = '';
            document.getElementById('rxInstructions').value = '';
        }








        // ─── DISPLAY PATIENT CARD ───
function displayPatientCard(p) {
    if (!p) {
        console.warn('No patient provided to displayPatientCard');
        return;
    }
    
    const card = document.getElementById('patient-card');
    if (!card) {
        console.warn('Patient card element not found');
        return;
    }
    
    const name = (p.firstName || '') + ' ' + (p.lastName || '');
    const initials = (p.firstName ? p.firstName[0] : '') + (p.lastName ? p.lastName[0] : '');

    // Update all elements with null checks
    const nameEl = document.getElementById('pc-name');
    if (nameEl) nameEl.textContent = name || 'Unknown Patient';
    
    const photoTextEl = document.getElementById('pc-photo-text');
    if (photoTextEl) photoTextEl.textContent = initials || '--';
    
    const mrnEl = document.getElementById('pc-mrn');
    if (mrnEl) mrnEl.textContent = p.mrn || 'MRN ----';
    
    const dobEl = document.getElementById('pc-dob');
    if (dobEl) dobEl.textContent = 'DOB: ' + (p.dob || '--') + ' (' + getAge(p.dob) + ')';
    
    const sexEl = document.getElementById('pc-sex');
    if (sexEl) sexEl.textContent = p.gender || '--';
    
    const phoneEl = document.getElementById('pc-phone');
    if (phoneEl) phoneEl.textContent = p.phone || '--';
    
    const wardEl = document.getElementById('pc-ward');
    if (wardEl) wardEl.textContent = 'Ward: ' + (p.department || 'General');

    // Blood group
    const bloodEl = document.getElementById('pc-bloodgroup');
    if (bloodEl) bloodEl.textContent = 'Blood: ' + (p.bloodGroup || '--');
    
    // Allergies
    const allergyEl = document.getElementById('pc-allergies');
    if (allergyEl) allergyEl.textContent = 'Allergies: ' + (p.allergies || '--');
    
    // Next of kin
    const kinEl = document.getElementById('pc-kin');
    if (kinEl) kinEl.textContent = 'Kin: ' + (p.nextOfKin || '--');
    
    // Insurance
    const insurerEl = document.getElementById('pc-insurer');
    if (insurerEl) insurerEl.textContent = p.insurer || '--';
    
    const schemeEl = document.getElementById('pc-scheme');
    if (schemeEl) schemeEl.textContent = p.scheme || '--';
    
    const policyEl = document.getElementById('pc-policy');
    if (policyEl) policyEl.textContent = p.policyNo || '--';
    
    const validityEl = document.getElementById('pc-validity');
    if (validityEl) validityEl.textContent = p.validity || '--';

    // Status badge
    const status = p.status || 'active';
    const statusClass = status === 'active' ? 'b-stable' : status === 'critical' ? 'b-critical' : 'b-warn';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const sb = document.getElementById('pc-status-badge');
    if (sb) {
        sb.textContent = '● ' + statusLabel;
        sb.className = 'badge ' + statusClass;
    }

    card.classList.add('show');

    // Photo
    if (p.photo) {
        const photoEl = document.getElementById('pc-photo');
        if (photoEl) {
            photoEl.innerHTML = `<img src="${p.photo}" alt=""><div class="upload-badge">📷</div>`;
        }
    }

    // Update vitals
    updateDoctorVitals(p);
    displayEnhancedVitals(p);
    renderVitalsHistory(p);
    displayLabRequests(p);
  
}







        // ─── FILL FORMS ───
        function fillForms(p) {
            const name = (p.firstName || '') + ' ' + (p.lastName || '');
            const nameMrn = name + ' — ' + (p.mrn || '');
            const ward = p.department || 'General';

            const fields = [
    { id: 'wardPatient', val: nameMrn },
    { id: 'wardLocation', val: ward },
    { id: 'imgPatient', val: nameMrn },
    { id: 'labPatient', val: nameMrn },
    { id: 'notesPatient', val: nameMrn },
    { id: 'rxPatient', val: nameMrn },
    { id: 'surgPatient', val: nameMrn },
    { id: 'physioPatient', val: nameMrn }
];





            fields.forEach(f => {
                const el = document.getElementById(f.id);
                if (el) el.value = f.val;
            });
            document.getElementById('theaterPatient').value = name;
            document.getElementById('theaterMRN').value = p.mrn ? p.mrn.replace('MRN ', '') : '';

            const wardDateEl = document.getElementById('wardDate');
            if (wardDateEl) wardDateEl.value = new Date().toISOString().split('T')[0];
            const wardDoctorEl = document.getElementById('wardDoctor');
            if (wardDoctorEl && !wardDoctorEl.value) wardDoctorEl.value = 'Dr. Mutua';
            const wardBedEl = document.getElementById('wardBed');
            if (wardBedEl && p.bed) wardBedEl.value = p.bed;

            updateWardVitalsSnapshot(p);
            displayWardRoundHistory(p);
        }

        // ─── SMART SEARCH ───
        function handleSmartSearch(query) {
            const q = query.toLowerCase().trim();
            const container = document.getElementById('suggestions');

            // Single search box now also drives the All Patients table filter
            if (typeof renderPatientTable === 'function') renderPatientTable();

            if (!q) { container.classList.remove('show'); return; }

            const patients = getPatients() || [];
            const matches = patients.filter(p =>
                (p.firstName + ' ' + p.lastName).toLowerCase().includes(q) ||
                (p.mrn || '').toLowerCase().includes(q)
            );

            if (matches.length === 0) { container.classList.remove('show'); return; }

            container.innerHTML = matches.slice(0, 8).map(p =>
                `<div class="suggestion-item" onclick="selectPatient(${p.id})">
                    <span>👤</span>
                    <span><span class="highlight">${p.firstName || ''} ${p.lastName || ''}</span> — ${p.mrn || 'N/A'}</span>
                </div>`
            ).join('');
            container.classList.add('show');
        }

        function lookupPatient() {
            const v = document.getElementById('ptSearch').value.trim().toLowerCase();
            if (!v) return;
            const patients = getPatients() || [];
            const p = patients.find(pt =>
                (pt.firstName + ' ' + pt.lastName).toLowerCase() === v ||
                (pt.mrn || '').toLowerCase() === v
            );
            if (p) {
                selectPatient(p.id);
            } else {
                showToast('❌ Patient not found', 'error');
            }
        }

        // ─── PATIENT MEDIA ───
        function handlePatientMedia(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                showToast('⚠️ Please select an image file.', 'warning');
                return;
            }
            const reader = new FileReader();
            reader.onload = function(ev) {
                patientMedia.photos.push(ev.target.result);
                document.getElementById('photoCount').textContent = patientMedia.photos.length;
                if (currentPatient) {
                    try { updatePatient(currentPatient.id, { photo: ev.target.result }); } catch(e) {}
                    displayPatientCard(currentPatient);
                }
                showToast('📸 Patient photo uploaded', 'success');
                e.target.value = '';
            };
            reader.readAsDataURL(file);
        }

        function handlePatientVideo(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('video/')) {
                showToast('⚠️ Please select a video file.', 'warning');
                return;
            }
            const reader = new FileReader();
            reader.onload = function(ev) {
                patientMedia.videos.push(ev.target.result);
                document.getElementById('videoCount').textContent = patientMedia.videos.length;
                showToast('🎥 Patient video uploaded', 'success');
                e.target.value = '';
            };
            reader.readAsDataURL(file);
        }




/// ─── VIEW SWITCHING (SIMPLIFIED) ───
function switchTab(name, btn) {
    closeModal();
    
    var patientCard = document.getElementById('patient-card');
    var patientFileContainer = document.getElementById('patientFileContainer');
    var mainPanel = document.querySelector('.main-panel');
    
    // ─── SPECIAL HANDLING FOR WARD ROUND (MODAL) ───
    if (name === 'ward') {
        if (currentPatient) {
            openWardRoundModal(currentPatient);
        } else {
            showToast('⚠️ Please select a patient first', 'warning');
        }
        return; // Exit early, don't try to show a tab
    }

    // ─── SPECIAL HANDLING FOR PHYSIO (BILLING-STYLE REQUEST PAGE) ───
    if (name === 'physio') {
        openPhysioRequestModal(currentPatient);
        return; // Exit early, launch billing-style Physio Request page
    }

    // ─── HIDE/SHOW PATIENT CARD BASED ON TAB ───
    if (name === 'lab') {
        if (patientFileContainer) patientFileContainer.style.display = 'none';
        if (patientCard) patientCard.style.display = 'none';
        if (mainPanel) mainPanel.style.display = 'block';
    } else if (name === 'patients') {
        if (patientFileContainer) patientFileContainer.style.display = 'none';
        if (patientCard) patientCard.style.display = 'none';
        if (mainPanel) mainPanel.style.display = 'block';
    } else if (name === 'lab-results') {
        if (patientFileContainer) patientFileContainer.style.display = 'none';
        if (patientCard) patientCard.style.display = 'none';
        if (mainPanel) mainPanel.style.display = 'block';
    } else {
        if (patientFileContainer && currentPatient) patientFileContainer.style.display = 'block';
        if (patientCard && currentPatient) patientCard.style.display = 'block';
        else if (patientCard && !currentPatient) patientCard.style.display = 'none';
        if (mainPanel) mainPanel.style.display = 'block';
    }
    
    // ─── ADD BOUNCE ANIMATION ───
    if (btn) {
        btn.classList.remove('bounce');
        void btn.offsetWidth;
        btn.classList.add('bounce');
    }
    
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // Map tab names to content IDs
    // ─── REMOVED 'ward' FROM HERE ───
    const tabMap = {
        overview: 'tab-overview',
        patients: 'tab-patients',
        admission: 'tab-admission',
        theater: 'tab-theater',
        imaging: 'tab-imaging',
        lab: 'tab-lab', 
        'lab-results': 'tab-lab-results',
        notes: 'tab-notes', 
        rx: 'tab-rx',
        surgery: 'tab-surgery', 
        physio: 'tab-physio'
    };

    // ─── HIDE ALL TAB CONTENT ───
    document.querySelectorAll('.mp-body').forEach(function(b) {
        b.classList.remove('show');
        b.style.display = 'none';
    });

    // ─── SHOW SELECTED TAB CONTENT ───
    const targetId = tabMap[name];
    if (targetId) {
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            targetEl.classList.add('show');
            targetEl.style.display = 'block';
        }
    }

    // ─── SHOW MAIN PANEL ───
    if (mainPanel) mainPanel.style.display = 'block';

    // Refresh content for specific tabs
    if (name === 'patients') {
        debouncedRenderPatientTable();
        if (patientCard) patientCard.style.display = 'none';
    }
    if (name === 'schedule') updateSchedule();
    if (name === 'theater') renderTheaterList();
    if (name === 'lab') {
        if (currentPatient) fillForms(currentPatient);
        showToast('🧪 Opening Lab Request Form', 'info');
    }
    


    
    // ─── REMOVED THE OLD 'ward' BLOCK ───
    if (name === 'overview') updateSchedule();

    localStorage.setItem('pclinic_active_tab', name);
}






                    // ─── REFRESH SCHEDULE ───
        function refreshSchedule() {
            updateSchedule();
            showToast('📅 Schedule refreshed', 'success');
        }
// ─── REFRESH PAGE ───
function refreshPage() {
    showToast('🔄 Refreshing...', 'info');
    setTimeout(function() {
        location.reload();
    }, 500);
}

        // ─── SWITCH SUB TAB (KEPT FOR COMPATIBILITY) ───
        function switchSubTab(el, targetId) {
            closeModal();
            // Just show the tab content directly
            document.querySelectorAll('.mp-body').forEach(b => b.classList.remove('show'));
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.classList.add('show');
            }
        }
   






        // ─── OPTIMIZED UPDATE SCHEDULE ───
var scheduleCache = null;
var scheduleCacheKey = '';

function updateSchedule() {
    // Cache DOM references
    const todayDateEl = document.getElementById('todayDate');
    const scheduleBody = document.getElementById('scheduleBody');
    
    if (!todayDateEl || !scheduleBody) return;

    // Update date (lightweight)
    todayDateEl.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Get patients once
    const patients = getPatients() || [];
    
    // Create cache key based on patient IDs and statuses
    const cacheKey = patients.map(p => p.id + '|' + p.status).join(',');
    if (scheduleCacheKey === cacheKey && scheduleCache) {
        scheduleBody.innerHTML = scheduleCache;
        return;
    }
    
    // ─── GET ALL ACTIVE PATIENTS FOR SCHEDULE ───
    const allActivePatients = patients.filter(p => p.status === 'active' || p.status === 'in-progress');
    
    // Create schedule from all active patients
    const schedule = allActivePatients.map((p, i) => ({
        patientId: p.id,
        time: ['08:00', '09:30', '11:00', '13:30', '15:00', '16:30'][i % 6] || '--:--',
        patient: (p.firstName || '') + ' ' + (p.lastName || ''),
        patientMrn: p.mrn || 'N/A',
        type: ['Ward round', 'Consultation', 'Follow-up', 'Review', 'Procedure', 'Examination'][i % 6] || 'Visit',
        location: p.department || 'General',
        status: i === 0 ? 'In progress' : i % 3 === 0 ? 'Upcoming' : 'Scheduled'
    }));

    const tbody = document.getElementById('scheduleBody');
    
    if (schedule.length === 0) {
        const emptyHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--tm);font-size:13px;">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
                <span style="font-size:32px;">📅</span>
                <span>No schedule for today</span>
                <span style="font-size:11px;color:var(--tm);">Check back later for appointments</span>
            </div>
        </td></tr>`;
        scheduleBody.innerHTML = emptyHTML;
        scheduleCache = emptyHTML;
        scheduleCacheKey = cacheKey;
        return;
    }
    
    // ─── APPLE-STYLE SCHEDULE ROWS ───
    var pageBg = '#8a8a9a';
    var cardBg = pageBg + '30';
    var cardBorder = '#8a8a9a';
    var cardShadow = 'rgba(0,0,0,0.04)';
    
    // ─── COLORS FOR AVATARS ───
    var colors = [
        {bg:'#1a2a4a', txt:'#ffffff'},
        {bg:'#1a3a2a', txt:'#ffffff'},
        {bg:'#3a2a1a', txt:'#ffffff'},
        {bg:'#2a1a3a', txt:'#ffffff'},
        {bg:'#3a1a1a', txt:'#ffffff'},
        {bg:'#0a3a3a', txt:'#ffffff'}
    ];
    
    function getInitials(name) {
        if (!name) return '??';
        var parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    
    var html = '';
    schedule.forEach(function(s, i) {
        var statusClass = s.status === 'In progress' ? 'b-info' : 'b-warn';
        var c = colors[s.patientId % colors.length] || colors[0];
        var avatar = '<div class="patient-avatar" style="width:36px;height:36px;font-size:12px;background:'+c.bg+';color:'+c.txt+';border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;box-shadow:0 2px 8px '+c.bg+'40;">' + getInitials(s.patient) + '</div>';
        
        html += '<tr style="background:'+cardBg+';border-left:4px solid '+cardBorder+';border-radius:16px;display:table-row;box-shadow:0 1px 4px '+cardShadow+';backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);cursor:pointer;">'
            + '<td style="font-weight:600;color:'+cardBorder+';padding:14px 18px;border-radius:16px 0 0 16px;font-size:14px;letter-spacing:-0.3px;">'+s.time+'</td>'
            + '<td style="padding:12px 18px;font-weight:500;color:var(--tp);">'
                + '<div style="display:flex;align-items:center;gap:12px;">'
                    + avatar
                    + '<div>'
                        + '<div style="font-weight:600;font-size:14px;letter-spacing:-0.2px;">'+s.patient+'</div>'
                        + '<div class="patient-meta" style="font-size:11px;color:var(--tm);margin-top:2px;display:flex;gap:8px;">'
                            + '<span><strong>MRN:</strong> '+s.patientMrn+'</span>'
                            + '<span style="opacity:0.4;">|</span>'
                            + '<span><strong>ID:</strong> '+s.patientId+'</span>'
                        + '</div>'
                    + '</div>'
                + '</div>'
            + '</td>'
            + '<td style="padding:14px 18px;color:var(--ts);font-weight:400;"><span style="background:var(--s3);padding:4px 12px;border-radius:20px;font-weight:500;font-size:11px;">'+s.type+'</span></td>'
            + '<td style="padding:14px 18px;color:var(--ts);"><span style="background:var(--s3);padding:4px 12px;border-radius:20px;font-weight:500;font-size:11px;">'+s.location+'</span></td>'
            + '<td style="padding:14px 18px;"><span class="badge '+statusClass+'" style="padding:4px 14px;border-radius:20px;font-size:10px;font-weight:600;">'+s.status+'</span></td>'
            + '<td style="padding:10px 18px;border-radius:0 16px 16px 0;">'
                + '<button class="btn-s" onclick="event.stopPropagation();selectPatient('+s.patientId+')" style="padding:6px 14px;font-size:11px;background:var(--acb);color:var(--ac);border:0.5px solid var(--ac);border-radius:8px;cursor:pointer;transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);white-space:nowrap;font-weight:600;">'
                    + '<i class="ti ti-eye"></i> Open Patient File'
                + '</button>'
            + '</td>'
            + '</tr>';
        
        if(i < schedule.length - 1){
            html += '<tr style="background:transparent;display:table-row;height:4px;">'
                + '<td colspan="6" style="padding:0;height:4px;background:transparent;border:none;">'
                + '<div style="height:2px;background:rgba(255,255,255,0.5);border-radius:2px;margin:0 10px;"></div>'
                + '</td>'
                + '</tr>';
        }
    });
    
    // Cache and set
    scheduleCache = html;
    scheduleCacheKey = cacheKey;
    scheduleBody.innerHTML = html;
}











        // ─── THEATER FUNCTIONS ───
        function renderTheaterList() {
            const filterDate = document.getElementById('theaterDateFilter').value || new Date().toISOString().slice(0, 10);
            const filtered = theaterList.filter(t => t.date === filterDate);
            const tbody = document.getElementById('theaterTbody');

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--tm);">No procedures on this date.</td></tr>`;
                document.getElementById('theaterCountToday').textContent = `📅 0 procedures on ${filterDate}`;
                return;
            }

            tbody.innerHTML = filtered.map((t, i) => `
                <tr>
                    <td><strong>${t.patient}</strong><br><span style="font-size:10px;color:var(--tm)">${t.mrn}</span></td>
                    <td>${t.procedure}</td>
                    <td>${t.date}</td>
                    <td>${t.time || '--:--'}</td>
                    <td>${t.surgeon}</td>
                    <td><span class="badge ${t.priority === 'Emergency' ? 'b-critical' : t.priority === 'Urgent' ? 'b-warn' : 'b-info'}">${t.priority}</span></td>
                    <td><span class="badge b-info">${t.status}</span></td>
                    <td><button class="btn-s" style="padding:2px 8px;font-size:11px;" onclick="removeTheaterEntry(${i})"><i class="ti ti-x"></i></button></td>
                </tr>
            `).join('');
            document.getElementById('theaterCountToday').textContent = `📅 ${filtered.length} procedure${filtered.length > 1 ? 's' : ''} on ${filterDate}`;
        }

        function showTheaterForm() {
            document.getElementById('theater-modal').classList.add('show');
            if (currentPatient) {
                document.getElementById('theaterPatient').value = (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || '');
                document.getElementById('theaterMRN').value = currentPatient.mrn ? currentPatient.mrn.replace('MRN ', '') : '';
            }
            document.getElementById('theaterDate').value = new Date().toISOString().slice(0, 10);
        }

        function closeTheaterModal() {
            document.getElementById('theater-modal').classList.remove('show');
        }

        function addTheaterEntry() {
            const patient = document.getElementById('theaterPatient').value.trim();
            const mrn = document.getElementById('theaterMRN').value.trim();
            const procedure = document.getElementById('theaterProcedure').value.trim();
            const date = document.getElementById('theaterDate').value;
            const time = document.getElementById('theaterTime').value;
            const surgeon = document.getElementById('theaterSurgeon').value.trim();
            const priority = document.getElementById('theaterPriority').value;
            const status = document.getElementById('theaterStatus').value;
            const notes = document.getElementById('theaterNotes').value.trim();

            if (!patient || !mrn || !procedure || !date || !surgeon) {
                showToast('⚠️ Please fill in all required fields.', 'warning');
                return;
            }

            theaterList.push({ patient, mrn, procedure, date, time, surgeon, priority, status, notes });
            renderTheaterList();
            closeTheaterModal();
            showToast(`✅ ${patient} added to theater list`, 'success');

            document.getElementById('theaterPatient').value = '';
            document.getElementById('theaterMRN').value = '';
            document.getElementById('theaterProcedure').value = '';
            document.getElementById('theaterNotes').value = '';
        }

        function removeTheaterEntry(index) {
            const entry = theaterList[index];
            if (confirm(`Remove ${entry.patient} - ${entry.procedure} from the list?`)) {
                theaterList.splice(index, 1);
                renderTheaterList();
                showToast(`🗑️ Removed ${entry.patient}`, 'info');
            }
        }

        // ─── SUBMIT FUNCTIONS ───
        
        function submitWardRound() {
            if (!currentPatient) {
                showToast('⚠️ Please select a patient first', 'warning');
                return;
            }

            const examination = document.getElementById('wardExamination').value.trim();
            const plan = document.getElementById('wardPlan').value.trim();
            if (!examination && !plan) {
                showToast('⚠️ Please enter examination findings or management plan', 'warning');
                return;
            }

            const saveBtn = document.querySelector('#tab-ward .btn-p');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Saving...';
            saveBtn.disabled = true;

            try {
                const roundData = {
                    doctor: document.getElementById('wardDoctor').value.trim() || 'Dr. Mutua',
                    location: document.getElementById('wardLocation').value.trim() || (currentPatient.department || 'General'),
                    bed: document.getElementById('wardBed').value.trim() || '',
                    roundDate: document.getElementById('wardDate').value || new Date().toISOString().split('T')[0],
                    condition: document.getElementById('wardCondition').value || 'Stable',
                    overnight: document.getElementById('wardOvernight').value.trim() || '',
                    examination: examination,
                    assessment: document.getElementById('wardAssessment').value.trim() || '',
                    plan: plan,
                    discharge: document.getElementById('wardDischarge').value.trim() || ''
                };

                let saved = false;
                if (typeof addWardRound === 'function') {
                    const result = addWardRound(currentPatient.id, roundData);
                    saved = !!result;
                } else {
                    if (!currentPatient.wardRounds) currentPatient.wardRounds = [];
                    currentPatient.wardRounds.push({ id: Date.now(), timestamp: new Date().toISOString(), ...roundData });
                    if (typeof updatePatient === 'function') {
                        updatePatient(currentPatient.id, { wardRounds: currentPatient.wardRounds });
                    }
                    saved = true;
                }

                if (saved) {
                    const noteText = 'Ward Round — Condition: ' + roundData.condition +
                        '\nOvernight: ' + (roundData.overnight || 'N/A') +
                        '\nExamination: ' + (roundData.examination || 'N/A') +
                        '\nAssessment: ' + (roundData.assessment || 'N/A') +
                        '\nPlan: ' + (roundData.plan || 'N/A') +
                        (roundData.discharge ? '\nDischarge: ' + roundData.discharge : '');

                    if (typeof addClinicalNote === 'function') {
                        addClinicalNote(currentPatient.id, {
                            doctor: roundData.doctor,
                            note: noteText,
                            type: 'Ward Round',
                            status: roundData.condition
                        });
                    }

                    currentPatient = getPatient(currentPatient.id) || currentPatient;
                    showToast('✅ Ward round saved for ' + currentPatient.firstName + ' ' + currentPatient.lastName, 'success');
                    clearWardRoundForm(true);
                    displayWardRoundHistory(currentPatient);
                } else {
                    showToast('❌ Failed to save ward round', 'error');
                }
            } catch (e) {
                console.error('Error saving ward round:', e);
                showToast('❌ Error saving ward round', 'error');
            } finally {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }
        }

        function clearWardRoundForm(keepPatient) {
            if (!keepPatient) {
                const patientEl = document.getElementById('wardPatient');
                const locationEl = document.getElementById('wardLocation');
                if (patientEl) patientEl.value = '';
                if (locationEl) locationEl.value = '';
            }
            const fields = ['wardBed', 'wardOvernight', 'wardExamination', 'wardAssessment', 'wardPlan', 'wardDischarge'];
            fields.forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const conditionEl = document.getElementById('wardCondition');
            if (conditionEl) conditionEl.value = 'Stable';
            const dateEl = document.getElementById('wardDate');
            if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
            const doctorEl = document.getElementById('wardDoctor');
            if (doctorEl) doctorEl.value = 'Dr. Mutua';
        }

        function updateWardVitalsSnapshot(patient) {
            const grid = document.getElementById('wardVitalsGrid');
            if (!grid) return;

            if (!patient || !patient.vitals || patient.vitals.length === 0) {
                grid.innerHTML = '<span style="color:var(--tm);">No vitals recorded</span>';
                return;
            }

            const v = patient.vitals[patient.vitals.length - 1];
            const hr = v.pulse || v.hr || '--';
            const sys = v.bpSystolic || v.systolic || '--';
            const dia = v.bpDiastolic || v.diastolic || '--';
            const spo2 = v.spo2 || v.spO2 || '--';
            const temp = v.temperature || v.temp || '--';
            const time = v.timestamp ? new Date(v.timestamp).toLocaleString() : '';

            grid.innerHTML =
                '<div><span style="color:var(--tm);">HR</span><br><strong>' + hr + ' bpm</strong></div>' +
                '<div><span style="color:var(--tm);">BP</span><br><strong>' + sys + '/' + dia + '</strong></div>' +
                '<div><span style="color:var(--tm);">SpO₂</span><br><strong>' + spo2 + '%</strong></div>' +
                '<div><span style="color:var(--tm);">Temp</span><br><strong>' + temp + '°C</strong></div>' +
                (time ? '<div style="grid-column:1/-1;font-size:10px;color:var(--tm);margin-top:4px;">Recorded: ' + time + '</div>' : '');
        }

        function displayWardRoundHistory(patient) {
            const container = document.getElementById('wardHistoryList');
            const count = document.getElementById('wardHistoryCount');
            if (!container) return;

            const rounds = patient?.wardRounds || [];
            if (count) count.textContent = rounds.length + ' round' + (rounds.length !== 1 ? 's' : '');

            if (rounds.length === 0) {
                container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--tm);font-size:12px;">No ward rounds recorded yet.</p>';
                return;
            }

            const conditionColors = {
                Stable: 'var(--greend)',
                Improving: 'var(--greend)',
                Unchanged: 'var(--tm)',
                Deteriorating: 'var(--oranged)',
                Critical: 'var(--redd)'
            };

            const sorted = [...rounds].reverse();
            container.innerHTML = sorted.map(function(round) {
                const date = round.timestamp ? new Date(round.timestamp).toLocaleString() : (round.date || 'No date');
                const doctor = round.doctor || 'Dr. Unknown';
                const condition = round.condition || 'Stable';
                const color = conditionColors[condition] || 'var(--tm)';

                return '<div class="notes-history-item">' +
                    '<div class="note-header">' +
                        '<span class="note-type" style="background:' + color + '22;color:' + color + ';">' + condition + '</span>' +
                        '<span class="note-time">🕐 ' + date + '</span>' +
                    '</div>' +
                    '<div class="note-content">' +
                        (round.location ? '<strong>Ward:</strong> ' + round.location + (round.bed ? ' · Bed ' + round.bed : '') + '<br>' : '') +
                        (round.overnight ? '<strong>Overnight:</strong> ' + round.overnight + '<br>' : '') +
                        (round.examination ? '<strong>Examination:</strong> ' + round.examination + '<br>' : '') +
                        (round.assessment ? '<strong>Assessment:</strong> ' + round.assessment + '<br>' : '') +
                        (round.plan ? '<strong>Plan:</strong> ' + round.plan + '<br>' : '') +
                        (round.discharge ? '<strong>Discharge:</strong> ' + round.discharge : '') +
                    '</div>' +
                    '<div class="note-doctor"><i class="ti ti-user"></i> ' + doctor + '</div>' +
                    '<div class="note-actions">' +
                        '<button class="btn-print-note" onclick="printWardRound(' + patient.id + ', ' + round.id + ')"><i class="ti ti-printer"></i> Print</button>' +
                        '<button class="btn-delete-note" onclick="deleteWardRound(' + patient.id + ', ' + round.id + ')"><i class="ti ti-trash"></i> Delete</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function deleteWardRound(patientId, roundId) {
            if (!confirm('Delete this ward round record?')) return;
            const patients = getPatients();
            const patient = patients.find(function(p) { return p.id === patientId; });
            if (!patient || !patient.wardRounds) return;

            patient.wardRounds = patient.wardRounds.filter(function(r) { return r.id !== roundId; });
            if (typeof updatePatient === 'function') {
                updatePatient(patientId, { wardRounds: patient.wardRounds });
            }
            if (currentPatient && currentPatient.id === patientId) {
                currentPatient = getPatient(patientId) || patient;
                displayWardRoundHistory(currentPatient);
            }
            showToast('🗑️ Ward round deleted', 'info');
        }

        function printWardRound(patientId, roundId) {
            const patients = getPatients();
            const patient = patients.find(function(p) { return p.id === patientId; });
            if (!patient) return;
            const round = (patient.wardRounds || []).find(function(r) { return r.id === roundId; });
            if (!round) return;

            const printContent =
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                '           PCLINIC WARD ROUND NOTE\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                'Patient: ' + (patient.firstName || '') + ' ' + (patient.lastName || '') + '\n' +
                'MRN: ' + (patient.mrn || 'N/A') + '\n' +
                'Ward: ' + (round.location || 'N/A') + (round.bed ? ' · Bed ' + round.bed : '') + '\n' +
                'Date: ' + (round.timestamp ? new Date(round.timestamp).toLocaleString() : round.date) + '\n' +
                'Doctor: ' + (round.doctor || 'Unknown') + '\n' +
                'Condition: ' + (round.condition || 'Stable') + '\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                (round.overnight ? 'OVERNIGHT EVENTS:\n' + round.overnight + '\n\n' : '') +
                (round.examination ? 'EXAMINATION:\n' + round.examination + '\n\n' : '') +
                (round.assessment ? 'ASSESSMENT:\n' + round.assessment + '\n\n' : '') +
                (round.plan ? 'PLAN:\n' + round.plan + '\n\n' : '') +
                (round.discharge ? 'DISCHARGE PLANNING:\n' + round.discharge + '\n\n' : '') +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                '            PClinic - Quality Healthcare\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

            const win = window.open('', '_blank', 'width=600,height=500');
            win.document.write('<pre style="font-family:monospace;padding:20px;font-size:14px;">' + printContent + '</pre>');
            win.document.close();
        }

        

        // ─── SUBMIT CLINICAL NOTE ───
        function submitNote() {
            const subjective = document.getElementById('notesSubjective').value.trim();
            const objective = document.getElementById('notesObjective').value.trim();
            const plan = document.getElementById('notesPlan').value.trim();

            if (!subjective && !objective && !plan) {
                showToast('⚠️ Please fill in at least one section', 'warning');
                return;
            }

            if (!currentPatient) {
                showToast('⚠️ Please select a patient first', 'warning');
                return;
            }

            const saveBtn = document.querySelector('#tab-notes .btn-p');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Saving...';
            saveBtn.disabled = true;

            try {
                const noteData = {
                    doctor: 'Dr. Mutua',
                    note: 'Subjective: ' + (subjective || 'N/A') + '\nObjective: ' + (objective || 'N/A') + '\nPlan: ' + (plan || 'N/A'),
                    type: document.getElementById('notesType').value,
                    status: 'Active',
                    timestamp: new Date().toISOString()
                };

                if (typeof addClinicalNote === 'function') {
                    const result = addClinicalNote(currentPatient.id, noteData);
                    if (result) {
                        showToast('✅ Clinical note saved successfully!', 'success');
                        document.getElementById('notesSubjective').value = '';
                        document.getElementById('notesObjective').value = '';
                        document.getElementById('notesPlan').value = '';
                        displayClinicalNotes(currentPatient);
                    } else {
                        showToast('❌ Failed to save clinical note', 'error');
                    }
                } else {
                    if (!currentPatient.clinicalNotes) currentPatient.clinicalNotes = [];
                    currentPatient.clinicalNotes.push({
                        id: Date.now(),
                        ...noteData
                    });
                    if (typeof updatePatient === 'function') {
                        updatePatient(currentPatient.id, { clinicalNotes: currentPatient.clinicalNotes });
                    }
                    showToast('✅ Clinical note saved successfully!', 'success');
                    document.getElementById('notesSubjective').value = '';
                    document.getElementById('notesObjective').value = '';
                    document.getElementById('notesPlan').value = '';
                    displayClinicalNotes(currentPatient);
                }
            } catch (e) {
                console.error('Error saving clinical note:', e);
                showToast('❌ Error saving clinical note', 'error');
            } finally {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }
        }    
    
    


        // ─── SUBMIT SURGICAL NOTE ───
        function submitSurgery() {
            const procedure = document.getElementById('surgProcedure').value.trim();
            const surgeon = document.getElementById('surgSurgeon').value.trim();

            if (!procedure || !surgeon) {
                showToast('⚠️ Please enter procedure and surgeon', 'warning');
                return;
            }

            if (!currentPatient) {
                showToast('⚠️ Please select a patient first', 'warning');
                return;
            }

            const saveBtn = document.querySelector('#tab-surgery .btn-p');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Saving...';
            saveBtn.disabled = true;

            try {
                const findings = document.getElementById('surgFindings').value.trim();
                const notes = document.getElementById('surgNotes').value.trim();

                const surgicalNote = {
                    doctor: surgeon,
                    note: 'Procedure: ' + procedure + '\nSurgeon: ' + surgeon + 
                          '\nFindings: ' + (findings || 'N/A') + 
                          '\nNotes: ' + (notes || 'N/A'),
                    type: 'Surgical Note',
                    status: 'Post-op',
                    procedure: procedure,
                    surgeon: surgeon,
                    findings: findings,
                    complications: notes,
                    timestamp: new Date().toISOString()
                };

                if (typeof addClinicalNote === 'function') {
                    const result = addClinicalNote(currentPatient.id, surgicalNote);
                    if (result) {
                        showToast('✅ Surgical note saved successfully!', 'success');
                        document.getElementById('surgProcedure').value = '';
                        document.getElementById('surgSurgeon').value = '';
                        document.getElementById('surgFindings').value = '';
                        document.getElementById('surgNotes').value = '';
    
                    } else {
                        showToast('❌ Failed to save surgical note', 'error');
                    }
                } else {
                    if (!currentPatient.clinicalNotes) currentPatient.clinicalNotes = [];
                    currentPatient.clinicalNotes.push({
                        id: Date.now(),
                        ...surgicalNote
                    });
                    if (typeof updatePatient === 'function') {
                        updatePatient(currentPatient.id, { clinicalNotes: currentPatient.clinicalNotes });
                    }
                    showToast('✅ Surgical note saved successfully!', 'success');
                    document.getElementById('surgProcedure').value = '';
                    document.getElementById('surgSurgeon').value = '';
                    document.getElementById('surgFindings').value = '';
                    document.getElementById('surgNotes').value = '';
                 
                }
            } catch (e) {
                console.error('Error saving surgical note:', e);
                showToast('❌ Error saving surgical note', 'error');
            } finally {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }
        }



// ─── DISPLAY CLINICAL NOTES HISTORY ───
function displayClinicalNotes(patient) {
    var container = document.getElementById('notesHistoryList');
    var count = document.getElementById('notesHistoryCount');
    if (!container) return;
    
    var notes = patient?.clinicalNotes || [];
    if (count) count.textContent = notes.length + ' note' + (notes.length !== 1 ? 's' : '');
    
    if (notes.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--tm);font-size:12px;">No notes recorded yet.</p>';
        return;
    }
    
    var sorted = [...notes].reverse();
    container.innerHTML = sorted.map(function(note) {
        var date = note.timestamp ? new Date(note.timestamp).toLocaleString() : 'No date';
        var type = note.type || 'Consultation';
        var content = (note.note || '').substring(0, 200) + ((note.note || '').length > 200 ? '...' : '');
        var doctor = note.doctor || 'Dr. Unknown';
        
        return `<div class="notes-history-item">
            <div class="note-header">
                <span class="note-type">${type}</span>
                <span class="note-time">🕐 ${date}</span>
            </div>
            <div class="note-content">${content}</div>
            <div class="note-doctor"><i class="ti ti-user"></i> ${doctor}</div>
            <div class="note-actions">
                <button class="btn-print-note" onclick="printNote(${patient.id}, '${note.id || Date.now()}')"><i class="ti ti-printer"></i> Print</button>
                <button class="btn-delete-note" onclick="deleteNote(${patient.id}, '${note.id || Date.now()}')"><i class="ti ti-trash"></i> Delete</button>
            </div>
        </div>`;
    }).join('');
}

// ─── PRINT NOTE ───
function printNote(patientId, noteId) {
    var patients = getPatients();
    var patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    var note = (patient.clinicalNotes || []).find(n => String(n.id) === String(noteId));
    if (!note) return;
    var printContent = 
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '           PCLINIC CLINICAL NOTE\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        'Patient: ' + (patient.firstName || '') + ' ' + (patient.lastName || '') + '\n' +
        'MRN: ' + (patient.mrn || 'N/A') + '\n' +
        'Date: ' + new Date(note.timestamp).toLocaleString() + '\n' +
        'Type: ' + (note.type || 'Consultation') + '\n' +
        'Doctor: ' + (note.doctor || 'Unknown') + '\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        'NOTE:\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        note.note + '\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '            PClinic - Quality Healthcare\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    var win = window.open('', '_blank', 'width=600,height=400');
    win.document.write('<pre style="font-family:monospace;padding:20px;font-size:14px;">' + printContent + '</pre>');
    win.document.close();
    win.print();
}

// ─── DELETE NOTE ───
function deleteNote(patientId, noteId) {
    if (!confirm('Are you sure you want to delete this note?')) return;
    var patients = getPatients();
    var patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    patient.clinicalNotes = (patient.clinicalNotes || []).filter(n => String(n.id) !== String(noteId));
    if (typeof updatePatient === 'function') {
        updatePatient(patientId, { clinicalNotes: patient.clinicalNotes });
    }
    displayClinicalNotes(patient);
    showToast('🗑️ Note deleted', 'info');
}





        // ─── OLD PRESCRIPTION (kept for compatibility) ───
        function submitPrescription() {
            showToast('⚠️ Please use the enhanced prescription form above.', 'warning');
        }

        function sendToPharmacy() {
            showToast('💊 Prescription sent to Pharmacy department.', 'success');
        }

        function submitPhysio() {
            const goals = document.getElementById('physioGoals').value.trim();
            if (!goals) { showToast('⚠️ Please enter goals', 'warning'); return; }

            if (currentPatient) {
                try { addClinicalNote(currentPatient.id, {
                    doctor: 'Dr. Unknown',
                    note: 'Physiotherapy Order\nType: ' + document.getElementById('physioType').value +
                        '\nFrequency: ' + document.getElementById('physioFreq').value +
                        '\nGoals: ' + goals,
                    type: 'Physiotherapy',
                    status: 'Active'
                }); } catch(e) {}
                showToast(`✅ Physiotherapy ordered for ${currentPatient.firstName} ${currentPatient.lastName}`, 'success');
            } else {
                showToast('✅ Physiotherapy ordered', 'success');
            }
            document.getElementById('physioGoals').value = '';
        }

        // ─── ADD NOTE FOR PATIENT ───
        function addNoteForPatient(id) {
            selectPatient(id);
            switchTab('notes', document.querySelector('[data-tab="notes"]'));
            switchSubTab(document.querySelector('[onclick*="tab-notes"]'), 'tab-notes');
            document.getElementById('notesSubjective').focus();
        }




  // ─── OPEN PATIENT FILE VIEW ───
function openAddPatientFile() {
    // Get the first active patient or any patient
    var patients = getPatients() || [];
    var patient = patients.find(function(p) { return p.status === 'active'; }) || patients[0];
    
    if (!patient) {
        // ─── NO PATIENT FOUND - Show Today's Schedule ───
        showToast('📅 No patients found. Showing Today\'s Schedule.', 'info');
        
        // Switch to Overview tab (which shows Today's Schedule)
        var overviewTab = document.querySelector('[data-tab="overview"]');
        if (overviewTab) {
            switchTab('overview', overviewTab);
        }
        
        // Refresh the schedule
        updateSchedule();
        
        // Highlight the schedule section
        var scheduleSection = document.querySelector('#tab-overview .section-title');
        if (scheduleSection) {
            scheduleSection.style.animation = 'highlightPulse 1s ease 2';
            setTimeout(function() {
                scheduleSection.style.animation = '';
            }, 2000);
        }
        
        return;
    }
    
    // ─── PATIENT FOUND - Load the patient ───
    selectPatient(patient.id);
}



// ─── OPEN LAB HISTORY MODAL ───
function openLabHistoryModal() {
    if (!currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }

    var requests = currentPatient.labRequests || [];
    
    if (requests.length === 0) {
        showToast('📋 No lab requests found for this patient', 'info');
        return;
    }

    // Get modal elements
    var modalTitle = document.getElementById('modal-title');
    var modalBody = document.getElementById('modal-body');
    var modal = document.getElementById('stat-modal');
    
    if (!modalBody || !modal) {
        showToast('❌ Modal not found', 'error');
        return;
    }

    modalTitle.textContent = '📋 Lab Request History - ' + (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || '');

    // ─── BUILD HISTORY LIST ───
    var historyHTML = `
        <div style="max-height:500px;overflow-y:auto;padding:4px 0;">
            <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:0 4px;">
                <span style="font-size:13px;font-weight:600;color:var(--tm);">Total: <strong style="color:var(--tp);">${requests.length}</strong> requests</span>
                <div style="display:flex;gap:8px;">
                    <button class="btn-s" onclick="closeModal()" style="padding:4px 14px;font-size:11px;"><i class="ti ti-x"></i> Close</button>
                </div>
            </div>
            <div style="border:0.5px solid var(--bd);border-radius:10px;overflow:hidden;">
    `;

    // Sort by date (newest first)
    var sortedRequests = [...requests].reverse();

    sortedRequests.forEach(function(req, index) {
        var date = req.timestamp ? new Date(req.timestamp).toLocaleString() : 'No date';
        var statusColor = req.status === 'Pending' ? 'var(--oranged)' : req.status === 'Completed' ? 'var(--greend)' : 'var(--redd)';
        var statusBg = req.status === 'Pending' ? 'var(--orangeb)' : req.status === 'Completed' ? 'var(--greenb)' : 'var(--redb)';
        var tests = req.tests ? req.tests.join(', ') : 'No tests';
        var isEven = index % 2 === 0;

        historyHTML += `
            <div style="padding:12px 16px;${isEven ? 'background:var(--s3)' : 'background:var(--s1)'};border-bottom:${index < sortedRequests.length - 1 ? '0.5px solid var(--bd)' : 'none'};transition:background 0.2s ease;" onmouseover="this.style.background='var(--acb)'" onmouseout="this.style.background='${isEven ? 'var(--s3)' : 'var(--s1)'}'">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="font-weight:600;font-size:13px;color:var(--tp);">#${index + 1}</span>
                        <span style="font-size:12px;color:var(--tm);">${date}</span>
                        <span style="background:${statusBg};color:${statusColor};padding:2px 12px;border-radius:12px;font-size:10px;font-weight:600;">${req.status || 'Pending'}</span>
                    </div>
                    <span style="font-size:11px;color:var(--tm);">👨‍⚕️ ${req.requestedBy || 'Unknown'}</span>
                </div>
                <div style="margin-top:6px;font-size:12px;color:var(--tp);">
                    <strong>Tests:</strong> ${tests}
                </div>
                <div style="display:flex;gap:12px;margin-top:4px;font-size:11px;color:var(--tm);flex-wrap:wrap;">
                    <span>📌 ${req.priority || 'Routine'}</span>
                    <span>🧪 ${req.sampleType || 'N/A'}</span>
                    ${req.clinicalDetails ? `<span>📝 ${req.clinicalDetails}</span>` : ''}
                </div>
            </div>
        `;
    });

    historyHTML += `
            </div>
        </div>
    `;

    modalBody.innerHTML = historyHTML;

    modal.classList.add('show');
    modal.style.display = 'flex';
}  // <-- This closes openLabHistoryModal()


// ─── NAVIGATE TO LAB RESULTS ───
function navigateToLabResults() {
    // Find the Lab tab button
    var labTab = document.querySelector('[data-tab="lab"]');
    
    // Show main panel
    var mainPanel = document.querySelector('.main-panel');
    if (mainPanel) {
        mainPanel.style.display = 'block';
    }
    
    // Click the lab tab
    if (labTab) {
        labTab.click();
    }
    
    // Scroll to results
    setTimeout(function() {
        var labResults = document.querySelector('#tab-lab .lab-result-table');
        if (labResults) {
            labResults.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 500);
    
    if (currentPatient) {
        refreshLabResults();
    }
    
    showToast('📊 Opening Lab Results', 'info');
}






// ─── OPEN LAB RESULTS BELOW PATIENT CARD ───
function openLabResultsPage(patient) {
    if (!patient && !currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }
    
    const selectedPatient = patient || currentPatient;
    
    // ─── SAVE PATIENT DATA TO LOCALSTORAGE ───
    try {
        const cleanData = {
            id: selectedPatient.id,
            firstName: selectedPatient.firstName || '',
            lastName: selectedPatient.lastName || '',
            mrn: selectedPatient.mrn || '',
            labRequests: Array.isArray(selectedPatient.labRequests) ? selectedPatient.labRequests : [],
            labResults: Array.isArray(selectedPatient.labResults) ? selectedPatient.labResults : []
        };
        localStorage.setItem('pclinic_lab_patient_data', JSON.stringify(cleanData));
        console.log('✅ Patient data saved to localStorage:', cleanData.firstName, cleanData.lastName);
    } catch (e) {
        console.error('❌ Error saving to localStorage:', e);
    }
    
    // Remove any existing container
    const existingContainer = document.getElementById('labResultsContainer');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    let container = document.createElement('div');
    container.id = 'labResultsContainer';
    container.style.cssText = `
        margin-top: 16px;
        padding: 0;
        background: var(--s1);
        border-radius: 12px;
        border: 0.5px solid var(--bd);
        box-shadow: var(--shadow);
        overflow: hidden;
        display: block;
        height: 700px;
    `;
    
    const patientCard = document.getElementById('patient-card');
    if (patientCard) {
        patientCard.parentNode.insertBefore(container, patientCard.nextSibling);
    } else {
        document.querySelector('.content-area').appendChild(container);
    }
    
    container.innerHTML = `
       <iframe id="labResultsIframe" src="lab-results.html?t=${Date.now()}" style="
            width: 100%;
            height: 700px;
            border: none;
            margin: 0;
            padding: 0;
        "></iframe>
        <div style="padding:8px 16px;background:var(--s3);border-top:0.5px solid var(--bd);display:flex;justify-content:flex-end;">
            <button onclick="closeLabResultsPage()" class="btn-s" style="font-size:11px;">
                <i class="ti ti-x"></i> Close Lab Results
            </button>
        </div>
    `;
    
    // ─── SEND VIA POSTMESSAGE AFTER LOAD ───
    const iframe = document.getElementById('labResultsIframe');
    if (iframe) {
        iframe.onload = function() {
            console.log('🔄 Lab Results iframe loaded, sending patient data...');
            try {
                const patientData = JSON.parse(localStorage.getItem('pclinic_lab_patient_data'));
                if (patientData) {
                    iframe.contentWindow.postMessage({
                        type: 'LOAD_PATIENT',
                        patient: patientData
                    }, '*');
                    console.log('✅ Patient data sent to lab results:', patientData.firstName, patientData.lastName);
                }
            } catch (e) {
                console.log('❌ Error sending data:', e);
            }
        };
    }
    
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`📊 Opening Lab Results for ${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`, 'info');
}







// ─── CLOSE LAB RESULTS PAGE (Dashboard) ───
function closeLabResultsPage() {
    const container = document.getElementById('labResultsContainer');
    if (container) {
        container.remove();
        showToast('📊 Lab results closed', 'info');
    }
}







// ─── LISTEN FOR LAB REQUEST SUBMISSIONS ───
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'LAB_REQUEST_SUBMITTED') {
        const patientId = event.data.patientId;
        console.log('📨 Lab request submitted notification received for patient:', patientId);
        
        // Refresh the current patient from localStorage
        try {
            const freshPatients = JSON.parse(localStorage.getItem('pclinic_patients') || '[]');
            const freshPatient = freshPatients.find(p => p.id === patientId);
            if (freshPatient && currentPatient && currentPatient.id === patientId) {
                currentPatient = freshPatient;
                console.log('🔄 Patient data refreshed after lab submission:', currentPatient.firstName, currentPatient.lastName);
                console.log('📊 Lab requests now:', currentPatient.labRequests?.length || 0);
                showToast('✅ Lab request submitted and patient data refreshed!', 'success');
            }
        } catch (e) {
            console.error('❌ Error refreshing patient data after lab submission:', e);
        }
    }
});

// ─── MESSAGE HANDLER (LAB RESULTS) ───
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CLOSE_LAB_RESULTS') {
        closeLabResultsPage();
    }
});


// ─────────────────────────────────────────────────────────────
// IMAGING RESULTS PAGE (iframe opener + handlers)
// Opens imaging-results.html for the selected patient.
// Mirrors openLabResultsPage (Pattern A: iframe + localStorage
// snapshot + postMessage after onload).
// ─────────────────────────────────────────────────────────────
function openImagingResultsPage(patient) {
    if (!patient && !currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }

    const selectedPatient = patient || currentPatient;

    // ─── SAVE PATIENT SNAPSHOT TO LOCALSTORAGE ───
    try {
        const cleanData = {
            id: selectedPatient.id,
            firstName: selectedPatient.firstName || '',
            lastName: selectedPatient.lastName || '',
            mrn: selectedPatient.mrn || '',
            imagingRequests: Array.isArray(selectedPatient.imagingRequests) ? selectedPatient.imagingRequests : [],
            imagingResults: Array.isArray(selectedPatient.imagingResults) ? selectedPatient.imagingResults : []
        };
        localStorage.setItem('pclinic_imaging_patient_data', JSON.stringify(cleanData));
        console.log('✅ Imaging patient data saved to localStorage:', cleanData.firstName, cleanData.lastName);
    } catch (e) {
        console.error('❌ Error saving imaging patient data:', e);
    }

    // Remove any existing container
    const existingContainer = document.getElementById('imagingResultsContainer');
    if (existingContainer) {
        existingContainer.remove();
    }

    let container = document.createElement('div');
    container.id = 'imagingResultsContainer';
    container.style.cssText = `
        margin-top: 16px;
        padding: 0;
        background: var(--s1);
        border-radius: 12px;
        border: 0.5px solid var(--bd);
        box-shadow: var(--shadow);
        overflow: hidden;
        display: block;
        height: 760px;
    `;

    const patientCard = document.getElementById('patient-card');
    if (patientCard) {
        patientCard.parentNode.insertBefore(container, patientCard.nextSibling);
    } else {
        document.querySelector('.content-area').appendChild(container);
    }

    container.innerHTML = `
       <iframe id="imagingResultsIframe" src="imaging-results.html?t=${Date.now()}" style="
            width: 100%;
            height: 760px;
            border: none;
            margin: 0;
            padding: 0;
        "></iframe>
        <div style="padding:8px 16px;background:var(--s3);border-top:0.5px solid var(--bd);display:flex;justify-content:flex-end;">
            <button onclick="closeImagingResultsPage()" class="btn-s" style="font-size:11px;">
                <i class="ti ti-x"></i> Close Imaging Results
            </button>
        </div>
    `;

    // ─── SEND PATIENT VIA POSTMESSAGE AFTER IFRAME LOADS ───
    const iframe = document.getElementById('imagingResultsIframe');
    if (iframe) {
        iframe.onload = function() {
            console.log('🔄 Imaging Results iframe loaded, sending patient data...');
            try {
                const patientData = JSON.parse(localStorage.getItem('pclinic_imaging_patient_data'));
                if (patientData) {
                    iframe.contentWindow.postMessage({
                        type: 'LOAD_PATIENT',
                        patient: patientData
                    }, '*');
                    console.log('✅ Patient data sent to imaging results:', patientData.firstName, patientData.lastName);
                }
            } catch (e) {
                console.log('❌ Error sending imaging data:', e);
            }
        };
    }

    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`🩻 Opening Imaging Results for ${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`, 'info');
}

// ─── CLOSE IMAGING RESULTS PAGE ───
function closeImagingResultsPage() {
    const container = document.getElementById('imagingResultsContainer');
    if (container) {
        container.remove();
        showToast('🩻 Imaging results closed', 'info');
    }
}

// ─── LISTEN: CLOSE_IMAGING_RESULTS ───
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CLOSE_IMAGING_RESULTS') {
        closeImagingResultsPage();
    }
});

// ─── LISTEN: IMAGING_RESULT_SAVED (refresh currentPatient) ───
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'IMAGING_RESULT_SAVED') {
        const patientId = event.data.patientId;
        console.log('📨 Imaging result saved notification for patient:', patientId);
        try {
            const freshPatients = JSON.parse(localStorage.getItem('pclinic_patients') || '[]');
            const freshPatient = freshPatients.find(p => String(p.id) === String(patientId));
            if (freshPatient && currentPatient && String(currentPatient.id) === String(patientId)) {
                currentPatient = freshPatient;
                console.log('🔄 Patient data refreshed after imaging result saved:', currentPatient.imagingResults?.length || 0, 'results');
                showToast('✅ Imaging report saved and patient data refreshed!', 'success');
            }
        } catch (e) {
            console.log('❌ Error refreshing after imaging result:', e);
        }
    }
});









// ─── OPEN LAB RESULTS (For Green Button & Laboratory Section) ───
function openLabResults() {
    // Check if a patient is selected
    if (!currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        // Highlight the patient search to guide user
        document.getElementById('ptSearch').focus();
        document.getElementById('ptSearch').style.borderColor = 'var(--red)';
        setTimeout(function() {
            document.getElementById('ptSearch').style.borderColor = '';
        }, 3000);
        return;
    }
    
    // Check if the patient has any lab requests or results
    const hasRequests = currentPatient.labRequests && currentPatient.labRequests.length > 0;
    const hasResults = currentPatient.labResults && currentPatient.labResults.length > 0;
    
    if (!hasRequests && !hasResults) {
        showToast('📋 No lab requests found for this patient. Create one first.', 'info');
        // Open lab request instead
        if (confirm('No lab requests found. Would you like to create a lab request for this patient?')) {
            openLabRequestPage(currentPatient);
        }
        return;
    }
    
    // Open the lab results page with patient data
    openLabResultsPage(currentPatient);
}






// ─── OPEN LAB REQUEST BELOW PATIENT CARD ───
function openLabRequestPage(patient) {
    // ─── DEBUG: Log what we received ───
    console.log('🔍 openLabRequestPage called with patient:', patient);
    console.log('🔍 currentPatient is:', currentPatient);

    // ─── Try to get patient from argument or global ───
    let selectedPatient = patient || currentPatient;

    // ─── If still no patient, try to recover from localStorage ───
    if (!selectedPatient || !selectedPatient.id) {
        console.log('⚠️ No patient provided, checking localStorage...');
        try {
            const patients = JSON.parse(localStorage.getItem('pclinic_patients') || '[]');
            // Try to find the patient that was most recently viewed
            const lastViewed = localStorage.getItem('pclinic_last_patient_id');
            if (lastViewed) {
                const found = patients.find(p => String(p.id) === String(lastViewed));
                if (found) {
                    selectedPatient = found;
                    currentPatient = found;
                    console.log('✅ Recovered patient from last viewed ID:', found.firstName, found.lastName);
                }
            }
            // If still not found, take the first patient with lab data or the first patient
            if (!selectedPatient && patients.length > 0) {
                selectedPatient = patients[0];
                currentPatient = selectedPatient;
                console.log('✅ Defaulted to first patient:', selectedPatient.firstName, selectedPatient.lastName);
            }
        } catch (e) {
            console.log('❌ Error loading from localStorage:', e);
        }
    }

    // ─── Final check ───
    if (!selectedPatient || !selectedPatient.id) {
        showToast('⚠️ Please select a patient first', 'warning');
        // Switch to patients tab to help user select
        const patientsTab = document.querySelector('[data-tab="patients"]');
        if (patientsTab) {
            switchTab('patients', patientsTab);
        }
        return;
    }

    // ─── Ensure currentPatient is set ───
    if (!currentPatient || currentPatient.id !== selectedPatient.id) {
        currentPatient = selectedPatient;
        console.log('🔄 Updated currentPatient to:', currentPatient.firstName, currentPatient.lastName);
    }

    console.log('🧪 Opening Lab Request for:', selectedPatient.firstName, selectedPatient.lastName);

    // ─── Continue with the existing container logic ───
    let container = document.getElementById('labRequestContainer');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'labRequestContainer';
        container.style.cssText = `
            margin-top: 16px;
            padding: 0;
            background: var(--s1);
            border-radius: 12px;
            border: 0.5px solid var(--bd);
            box-shadow: var(--shadow);
            overflow: hidden;
            display: none;
            height: 800px;
        `;
        const patientCard = document.getElementById('patient-card');
        if (patientCard) {
            patientCard.parentNode.insertBefore(container, patientCard.nextSibling);
        } else {
            document.querySelector('.content-area').appendChild(container);
        }
    }
    
    container.style.display = 'block';
    
    // ─── SAVE PATIENT DATA TO LOCALSTORAGE FOR IFRAME ───
    try {
        const cleanData = {
            id: selectedPatient.id,
            firstName: selectedPatient.firstName || '',
            lastName: selectedPatient.lastName || '',
            mrn: selectedPatient.mrn || '',
            labRequests: Array.isArray(selectedPatient.labRequests) ? selectedPatient.labRequests : [],
            labResults: Array.isArray(selectedPatient.labResults) ? selectedPatient.labResults : []
        };
        localStorage.setItem('pclinic_lab_patient_data', JSON.stringify(cleanData));
        console.log('✅ Patient data saved to localStorage for lab request');
    } catch (e) {
        console.error('❌ Error saving to localStorage:', e);
    }
    
    container.innerHTML = `
        <iframe id="labRequestIframe" src="lab-request.html" style="
            width: 100%;
            height: 800px;
            border: none;
            margin: 0;
            padding: 0;
        "></iframe>
        <div style="padding:8px 16px;background:var(--s3);border-top:0.5px solid var(--bd);display:flex;justify-content:flex-end;">
            <button onclick="closeLabRequestPage()" class="btn-s" style="font-size:11px;">
                <i class="ti ti-x"></i> Close Lab Request
            </button>
        </div>
    `;
    
    // ─── SEND PATIENT DATA VIA postMessage ───
    const iframe = document.getElementById('labRequestIframe');
    if (iframe) {
        iframe.onload = function() {
            console.log('🔄 Lab Request iframe loaded, sending patient data...');
            setTimeout(function() {
                try {
                    const patientData = JSON.parse(localStorage.getItem('pclinic_lab_patient_data'));
                    if (patientData) {
                        iframe.contentWindow.postMessage({
                            type: 'LOAD_PATIENT',
                            patient: patientData
                        }, '*');
                        console.log('✅ Patient data sent to lab request:', patientData.firstName, patientData.lastName);
                    }
                } catch (e) {
                    console.log('❌ Error sending data to iframe:', e);
                }
            }, 500);
        };
    }
    
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`🧪 Opening Lab Request for ${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`, 'info');
}












// ─── CLOSE LAB REQUEST PAGE ───
function closeLabRequestPage() {
    const container = document.getElementById('labRequestContainer');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
        showToast('📋 Lab request closed', 'info');
    }
}





// ─── MESSAGE HANDLER (LAB REQUEST) ───
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CLOSE_LAB') {
        closeLabRequestPage();
    }
});



// ─── MESSAGE HANDLER (LAB RESULTS) ───
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CLOSE_LAB_RESULTS') {
        closeLabResultsPage();
    }
});









// ─── OPEN LAB REQUEST MODAL ───
function openLabRequestModal() {
    if (!currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }

    // Get modal elements
    var modalTitle = document.getElementById('modal-title');
    var modalBody = document.getElementById('modal-body');
    var modal = document.getElementById('stat-modal');
    
    if (!modalBody || !modal) {
        showToast('❌ Modal not found', 'error');
        return;
    }

    modalTitle.textContent = '🧪 Lab Request - ' + (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || '');

    // ─── BUILD THE LAB REQUEST FORM ───
    var formHTML = `
        <div style="max-height:500px;overflow-y:auto;padding:4px 0;">
            <!-- Patient info -->
            <div style="margin-bottom:12px;padding:10px;background:var(--acb);border-radius:8px;">
                <div style="font-size:13px;font-weight:600;color:var(--tp);">
                    👤 ${currentPatient.firstName || ''} ${currentPatient.lastName || ''}
                    <span style="font-size:12px;color:var(--tm);font-weight:400;margin-left:8px;">${currentPatient.mrn || 'N/A'}</span>
                </div>
            </div>

            <!-- Test Selection -->
            <div style="margin-bottom:12px;">
                <label style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.3px;display:block;margin-bottom:4px;">
                    <i class="ti ti-list"></i> Select Tests *
                </label>
                <div style="border:0.5px solid var(--bd);border-radius:8px;padding:10px;background:rgba(255,255,255,0.3);max-height:200px;overflow-y:auto;" id="modalLabTests">
                    <!-- Common Lab Tests -->
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
                        <div>
                            <div class="lab-test-item" onclick="toggleModalLabTest(this)" style="padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" value="CBC - Complete Blood Count">
                                <span style="font-size:11px;">CBC</span>
                            </div>
                            <div class="lab-test-item" onclick="toggleModalLabTest(this)" style="padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" value="FBS - Fasting Blood Sugar">
                                <span style="font-size:11px;">FBS</span>
                            </div>
                            <div class="lab-test-item" onclick="toggleModalLabTest(this)" style="padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" value="Lipid Profile">
                                <span style="font-size:11px;">Lipid Profile</span>
                            </div>
                        </div>
                        <div>
                            <div class="lab-test-item" onclick="toggleModalLabTest(this)" style="padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" value="LFT - Liver Function Test">
                                <span style="font-size:11px;">LFT</span>
                            </div>
                            <div class="lab-test-item" onclick="toggleModalLabTest(this)" style="padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" value="RFT - Renal Function Test">
                                <span style="font-size:11px;">RFT</span>
                            </div>
                            <div class="lab-test-item" onclick="toggleModalLabTest(this)" style="padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" value="HbA1c">
                                <span style="font-size:11px;">HbA1c</span>
                            </div>
                        </div>
                        <div>
                            <div class="lab-test-item" onclick="toggleModalLabTest(this)" style="padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" value="Urinalysis">
                                <span style="font-size:11px;">Urinalysis</span>
                            </div>
                            <div class="lab-test-item" onclick="toggleModalLabTest(this)" style="padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" value="Malaria Test">
                                <span style="font-size:11px;">Malaria</span>
                            </div>
                            <div class="lab-test-item" onclick="toggleModalLabTest(this)" style="padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" value="HIV Test">
                                <span style="font-size:11px;">HIV</span>
                            </div>
                        </div>
                    </div>
                    <!-- Custom Test Input -->
                    <div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--bd);display:flex;gap:6px;">
                        <input type="text" id="modalCustomLabTest" placeholder="Custom test name..." style="flex:1;padding:4px 8px;border:0.5px solid var(--bd);border-radius:4px;font-size:11px;font-family:inherit;">
                        <button onclick="addModalCustomTest()" style="padding:4px 12px;background:var(--acb);color:var(--ac);border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">Add</button>
                    </div>
                    <div id="modalCustomTestsList" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;"></div>
                </div>
                <div style="font-size:10px;color:var(--tm);margin-top:4px;">
                    <span id="modalSelectedCount">0 tests selected</span>
                </div>
            </div>

            <!-- Priority & Sample Type -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                <div>
                    <label style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.3px;display:block;margin-bottom:4px;">Priority</label>
                    <select id="modalLabPriority" style="width:100%;padding:6px 8px;border:0.5px solid var(--bd);border-radius:6px;font-size:11px;font-family:inherit;background:var(--s3);">
                        <option value="Routine">Routine</option>
                        <option value="Urgent">Urgent</option>
                        <option value="STAT">STAT (Immediate)</option>
                    </select>
                </div>
                <div>
                    <label style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.3px;display:block;margin-bottom:4px;">Sample Type</label>
                    <select id="modalLabSampleType" style="width:100%;padding:6px 8px;border:0.5px solid var(--bd);border-radius:6px;font-size:11px;font-family:inherit;background:var(--s3);">
                        <option>Blood</option>
                        <option>Urine</option>
                        <option>Stool</option>
                        <option>Sputum</option>
                        <option>CSF</option>
                        <option>Swab</option>
                        <option>Other</option>
                    </select>
                </div>
            </div>

            <!-- Notes -->
            <div style="margin-bottom:12px;">
                <label style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.3px;display:block;margin-bottom:4px;">Clinical Notes</label>
                <textarea id="modalLabNotes" rows="2" style="width:100%;padding:6px 8px;border:0.5px solid var(--bd);border-radius:6px;font-size:11px;font-family:inherit;background:var(--s3);resize:vertical;" placeholder="Any additional clinical notes..."></textarea>
            </div>

            <!-- Actions -->
            <div style="display:flex;gap:8px;">
                <button class="btn-p" onclick="submitModalLabRequest()" style="flex:1;padding:8px 16px;font-size:12px;">
                    <i class="ti ti-send"></i> Submit Request
                </button>
                <button class="btn-s" onclick="closeModal()" style="padding:8px 16px;font-size:12px;">
                    Cancel
                </button>
            </div>
        </div>
    `;

    modalBody.innerHTML = formHTML;
    modal.classList.add('show');
    modal.style.display = 'flex';
}

// ─── TOGGLE MODAL LAB TEST ───
function toggleModalLabTest(element) {
    var checkbox = element.querySelector('input[type="checkbox"]');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        element.style.background = checkbox.checked ? 'var(--acb)' : 'transparent';
        updateModalSelectedCount();
    }
}

// ─── ADD MODAL CUSTOM TEST ───
function addModalCustomTest() {
    var input = document.getElementById('modalCustomLabTest');
    var list = document.getElementById('modalCustomTestsList');
    var testName = input.value.trim();
    
    if (!testName) {
        showToast('⚠️ Please enter a test name', 'warning');
        return;
    }
    
    // Check for duplicates
    var existing = list.querySelectorAll('.modal-custom-test');
    for (var i = 0; i < existing.length; i++) {
        var cb = existing[i].querySelector('input[type="checkbox"]');
        if (cb && cb.value === testName) {
            showToast('⚠️ Test already added', 'warning');
            return;
        }
    }
    
    var div = document.createElement('div');
    div.className = 'modal-custom-test';
    div.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:var(--acb);padding:2px 8px;border-radius:12px;margin:2px;';
    div.innerHTML = `
        <input type="checkbox" checked value="${testName}" style="accent-color:var(--ac);">
        <span style="font-size:10px;">${testName}</span>
        <span onclick="this.parentElement.remove();updateModalSelectedCount();" style="cursor:pointer;color:var(--red);font-size:12px;">×</span>
    `;
    list.appendChild(div);
    input.value = '';
    updateModalSelectedCount();
    showToast('✅ Added: ' + testName, 'success');
}

// ─── UPDATE MODAL SELECTED COUNT ───
function updateModalSelectedCount() {
    var count = 0;
    document.querySelectorAll('#modalLabTests input[type="checkbox"]:checked').forEach(function() { count++; });
    document.querySelectorAll('#modalCustomTestsList input[type="checkbox"]:checked').forEach(function() { count++; });
    var el = document.getElementById('modalSelectedCount');
    if (el) el.textContent = count + ' test' + (count !== 1 ? 's' : '') + ' selected';
}

// ─── SUBMIT MODAL LAB REQUEST ───
function submitModalLabRequest() {
    var selectedTests = [];
    
    // Get checked tests from the main list
    document.querySelectorAll('#modalLabTests input[type="checkbox"]:checked').forEach(function(cb) {
        selectedTests.push(cb.value);
    });
    
    // Get checked tests from custom list
    document.querySelectorAll('#modalCustomTestsList input[type="checkbox"]:checked').forEach(function(cb) {
        selectedTests.push(cb.value);
    });
    
    if (selectedTests.length === 0) {
        showToast('⚠️ Please select at least one test', 'warning');
        return;
    }
    
    var priority = document.getElementById('modalLabPriority').value;
    var sampleType = document.getElementById('modalLabSampleType').value;
    var notes = document.getElementById('modalLabNotes').value.trim();
    
    // Save to patient
    if (!currentPatient.labRequests) currentPatient.labRequests = [];
    
    var labRequest = {
        id: Date.now(),
        patientId: currentPatient.id,
        patientName: (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || ''),
        mrn: currentPatient.mrn || 'N/A',
        tests: selectedTests,
        priority: priority,
        sampleType: sampleType,
        clinicalDetails: notes || 'Lab tests requested',
        requestedBy: 'Dr. Mutua',
        status: 'Pending',
        timestamp: new Date().toISOString()
    };
    
    currentPatient.labRequests.push(labRequest);
    
    // Update via patient-data.js if available
    if (typeof updatePatient === 'function') {
        try {
            updatePatient(currentPatient.id, { labRequests: currentPatient.labRequests });
        } catch(e) {
            console.log('updatePatient not available, using local storage only');
        }
    }
    
    showToast('✅ Lab request submitted! ' + selectedTests.length + ' test(s) requested.', 'success');
    
    // Close modal
    closeModal();
    
    // Refresh the patient file to update the lab count
    displayPatientFile(currentPatient);
    displayLabRequests(currentPatient);
 
}



        // ─── STATS MODAL ───
        const modalData = {
            admitted: { title: '📋 Admitted Patients', rows: getAdmittedPatients },
            review: { title: '🔍 Needs Review', rows: getReviewPatients },
            critical: { title: '🚨 Critical Patients', rows: getCriticalPatients },
            discharge: { title: '✅ Pending Discharge', rows: getDischargePatients }
        };

        function getAdmittedPatients() {
            const patients = getPatients() || [];
            return patients.filter(p => p.status === 'active').map(p => [
                (p.firstName || '') + ' ' + (p.lastName || ''),
                p.department || 'General',
                p.diagnosis || 'Under observation',
                p.status || 'Active'
            ]);
        }

        function getReviewPatients() {
            const patients = getPatients() || [];
            return patients.filter(p => p.status === 'pending_review').map(p => [
                (p.firstName || '') + ' ' + (p.lastName || ''),
                p.department || 'General',
                'Needs review',
                'Pending'
            ]);
        }

        function getCriticalPatients() {
            const patients = getPatients() || [];
            return patients.filter(p => p.priority === 'critical' || (p.vitals && p.vitals.some(v => v.painScore && parseInt(v.painScore) > 7))).map(p => [
                (p.firstName || '') + ' ' + (p.lastName || ''),
                p.department || 'General',
                p.diagnosis || 'Critical condition',
                '⚠️ Critical'
            ]);
        }

        function getDischargePatients() {
            const patients = getPatients() || [];
            return patients.filter(p => p.status === 'ready_discharge').map(p => [
                (p.firstName || '') + ' ' + (p.lastName || ''),
                p.department || 'General',
                p.diagnosis || 'Ready for discharge',
                'Ready'
            ]);
        }

        function openStatModal(type) {
            const d = modalData[type];
            if (!d) return;
            const rows = typeof d.rows === 'function' ? d.rows() : d.rows;
            document.getElementById('modal-title').textContent = d.title;

            if (rows.length === 0) {
                document.getElementById('modal-body').innerHTML = `<p style="text-align:center;padding:20px;color:var(--tm);">No patients in this category.</p>`;
            } else {
                let html = '<table class="wtbl"><thead><tr><th>Patient</th><th>Location</th><th>Details</th><th>Status</th></tr></thead><tbody>';
                rows.forEach(r => {
                    html += '<tr>' + r.map(c => '<td style="font-size:12px;">' + c + '</td>').join('') + '</tr>';
                });
                html += '</tbody></table>';
                document.getElementById('modal-body').innerHTML = html;
            }
            document.getElementById('stat-modal').classList.add('show');
        }

        function closeModal() {
            document.getElementById('stat-modal').classList.remove('show');
        }





        // ─── VITAL OPERATIONS ───
        function deleteVital(patientId, vitalIndex) {
            if (!confirm('⚠️ Are you sure you want to delete this vital record?')) return;
            try {
                const patients = getPatients();
                const patient = patients.find(p => p.id === patientId);
                if (!patient || !patient.vitals || vitalIndex < 0 || vitalIndex >= patient.vitals.length) {
                    showToast('❌ Vital record not found', 'error');
                    return;
                }
                patient.vitals.splice(vitalIndex, 1);
                if (typeof updatePatient === 'function') {
                    updatePatient(patientId, { vitals: patient.vitals });
                }
                if (currentPatient && currentPatient.id === patientId) {
                    currentPatient.vitals = patient.vitals;
                    updateAllVitalsDisplays();
                }
                showToast('🗑️ Vital deleted', 'info');
                renderVitalsHistory(currentPatient || patient);
            } catch(e) {
                showToast('❌ Error deleting vital', 'error');
            }
        }

        function editVital(patientId, vitalIndex) {
            try {
                const patients = getPatients();
                const patient = patients.find(p => p.id === patientId);
                if (!patient || !patient.vitals || vitalIndex < 0 || vitalIndex >= patient.vitals.length) {
                    showToast('❌ Vital not found', 'error');
                    return;
                }
                const v = patient.vitals[vitalIndex];
                document.getElementById('editVitalIndex').value = vitalIndex;
                document.getElementById('editHR').value = v.pulse || v.hr || '';
                document.getElementById('editBP').value = (v.bpSystolic || v.systolic || '') + '/' + (v.bpDiastolic || v.diastolic || '');
                document.getElementById('editSpO2').value = v.spo2 || v.spO2 || '';
                document.getElementById('editTemp').value = v.temperature || v.temp || '';
                document.getElementById('editRR').value = v.respiratoryRate || v.respiratory || '';
                document.getElementById('editPain').value = v.painScore || v.pain || '';
                document.getElementById('vital-edit-modal').classList.add('show');
            } catch(e) {
                showToast('❌ Error loading vital', 'error');
            }
        }





        


// ─── TOGGLE VITALS HISTORY ───
function toggleVitalsHistory() {
    const container = document.getElementById('vitalsHistoryContainer');
    const toggleText = document.getElementById('historyToggleText');
    
    if (!container) return;
    
    // Toggle the hidden class
    container.classList.toggle('hidden');
    
    // Update the button text
    if (container.classList.contains('hidden')) {
        if (toggleText) toggleText.textContent = 'Show';
    } else {
        if (toggleText) toggleText.textContent = 'Hide';
    }
    
    // If showing, update the vitals history content
    if (!container.classList.contains('hidden')) {
        renderVitalsHistory(currentPatient);
    }
}


        function saveEditedVital(event) {
            event.preventDefault();
            const patientId = currentPatient ? currentPatient.id : null;
            if (!patientId) { showToast('❌ No patient selected', 'error'); return; }
            const vitalIndex = parseInt(document.getElementById('editVitalIndex').value);
            try {
                const patients = getPatients();
                const patient = patients.find(p => p.id === patientId);
                if (!patient || !patient.vitals || vitalIndex >= patient.vitals.length) {
                    showToast('❌ Vital not found', 'error');
                    return;
                }
                const bpValue = document.getElementById('editBP').value.trim();
                let systolic = null, diastolic = null;
                if (bpValue) {
                    const parts = bpValue.split('/');
                    if (parts.length === 2) {
                        systolic = parseInt(parts[0].trim());
                        diastolic = parseInt(parts[1].trim());
                    }
                }
                patient.vitals[vitalIndex] = {
                    ...patient.vitals[vitalIndex],
                    pulse: parseInt(document.getElementById('editHR').value) || null,
                    hr: parseInt(document.getElementById('editHR').value) || null,
                    bpSystolic: systolic, systolic: systolic,
                    bpDiastolic: diastolic, diastolic: diastolic,
                    spo2: parseInt(document.getElementById('editSpO2').value) || null,
                    spO2: parseInt(document.getElementById('editSpO2').value) || null,
                    temperature: parseFloat(document.getElementById('editTemp').value) || null,
                    temp: parseFloat(document.getElementById('editTemp').value) || null,
                    respiratoryRate: parseInt(document.getElementById('editRR').value) || null,
                    respiratory: parseInt(document.getElementById('editRR').value) || null,
                    painScore: parseInt(document.getElementById('editPain').value) || null,
                    pain: parseInt(document.getElementById('editPain').value) || null,
                    updatedAt: new Date().toISOString()
                };
                if (typeof updatePatient === 'function') {
                    updatePatient(patientId, { vitals: patient.vitals });
                }
                if (currentPatient && currentPatient.id === patientId) {
                    currentPatient.vitals = patient.vitals;
                    updateAllVitalsDisplays();
                }
                closeVitalEditModal();
                showToast('✅ Vitals updated', 'success');
                renderVitalsHistory(currentPatient || patient);
            } catch(e) {
                showToast('❌ Error saving vital', 'error');
            }
        }

        function closeVitalEditModal() {
            document.getElementById('vital-edit-modal').classList.remove('show');
        }

        function renderVitalsHistory(patient) {
            const container = document.getElementById('vitalsHistoryList');
            const count = document.getElementById('vitalsHistoryCount');
            if (!container) return;
            if (!patient || !patient.vitals || patient.vitals.length === 0) {
                container.innerHTML = '<div class="no-vitals-history">No vitals recorded yet</div>';
                if (count) count.textContent = '0 records';
                return;
            }
            const vitals = patient.vitals;
            if (count) count.textContent = vitals.length + ' record' + (vitals.length !== 1 ? 's' : '');
            const sorted = [...vitals].reverse();
            container.innerHTML = sorted.map((v, index) => {
                const originalIndex = vitals.length - 1 - index;
                const date = v.timestamp ? new Date(v.timestamp).toLocaleString() : 
                             v.updatedAt ? new Date(v.updatedAt).toLocaleString() : 'No date';
                const hr = v.pulse || v.hr || '--';
                const bp = (v.bpSystolic || v.systolic || '--') + '/' + (v.bpDiastolic || v.diastolic || '--');
                const spo2 = v.spo2 || v.spO2 || '--';
                const temp = v.temperature || v.temp || '--';
                return `<div class="vitals-history-item">
                    <span class="vh-time">${date}</span>
                    <span class="vh-value">${hr} <span class="vh-unit">bpm</span></span>
                    <span class="vh-value">${bp} <span class="vh-unit">mmHg</span></span>
                    <span class="vh-value">${spo2} <span class="vh-unit">%</span></span>
                    <span class="vh-value">${temp} <span class="vh-unit">°C</span></span>
                    <span class="vh-actions">
                        <button class="vh-btn vh-btn-edit" onclick="editVital(${patient.id}, ${originalIndex})">✏️</button>
                        <button class="vh-btn vh-btn-delete" onclick="deleteVital(${patient.id}, ${originalIndex})">🗑️</button>
                    </span>
                </div>`;
            }).join('');
        }


               // ─── LAB OPERATIONS ───

                /**
         * Toggle lab test selection
         */
        function toggleLabTest(element) {
            const checkbox = element.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                element.classList.toggle('selected', checkbox.checked);
                updateSelectedTests();
            }
        }

             
        /**
         * Clear lab selection - FIXED (ADD THIS FUNCTION)
         */
        function clearLabSelection() {
            // Uncheck all checkboxes in the lab tab
            document.querySelectorAll('#tab-lab .lab-test-item input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
                cb.closest('.lab-test-item').classList.remove('selected');
            });
            
            // Clear custom tests list
            const customList = document.getElementById('customTestsList');
            if (customList) customList.innerHTML = '';
            
            const customInput = document.getElementById('customLabTest');
            if (customInput) customInput.value = '';
            
            // Reset selected tests array
            selectedLabTests = [];
            
            showToast('🧹 Selection cleared', 'info');
        }




        /**
         * Submit Lab Request - FIXED
         */
       function submitLabRequest() {
    if (!currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }

    // Make sure selectedLabTests is an array
    if (!selectedLabTests) selectedLabTests = [];
    
    // Update selected tests from checkboxes
    updateSelectedTests();
    
    // Check if any tests are selected
    if (selectedLabTests.length === 0) {
        showToast('⚠️ Please select at least one test', 'warning');
        return;
    }

    const saveBtn = document.querySelector('#tab-lab .btn-p');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Submitting...';
    saveBtn.disabled = true;

    try {
        const labRequest = {
            id: Date.now(),
            patientId: currentPatient.id,
            patientName: (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || ''),
            mrn: currentPatient.mrn || 'N/A',
            tests: [...selectedLabTests],
            priority: document.getElementById('labPriority').value,
            sampleType: document.getElementById('labSampleType').value,
            clinicalDetails: 'Lab tests requested',  // Default text instead of details
            requestedBy: document.getElementById('labDoctor').value || 'Dr. Unknown',
            status: 'Pending',
            timestamp: new Date().toISOString()
        };

        // Store directly in currentPatient
        if (!currentPatient.labRequests) {
            currentPatient.labRequests = [];
        }
        currentPatient.labRequests.push(labRequest);
        
        // Also try to update via patient-data.js if available
        if (typeof updatePatient === 'function') {
            try {
                updatePatient(currentPatient.id, { labRequests: currentPatient.labRequests });
            } catch(e) {
                console.log('updatePatient not available, using local storage only');
            }
        }

        showToast(`✅ Lab request submitted! ${selectedLabTests.length} test(s) requested.`, 'success');
        
        clearLabSelection();
        
        displayLabRequests(currentPatient);
        displayLabResults(currentPatient);

    } catch (e) {
        console.error('Error submitting lab request:', e);
        showToast('❌ Failed to submit lab request: ' + e.message, 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
    displayClinicalNotes(currentPatient); 
}

        /**
         * Display Lab Requests with status filter
         */
        function displayLabRequests(patient) {
            const container = document.getElementById('labRequestsList');
            const count = document.getElementById('labRequestCount');
            
            if (!container) return;

            const requests = patient?.labRequests || [];
            const filter = document.getElementById('labRequestStatusFilter')?.value || 'all';
            
            const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
            
            if (count) {
                count.textContent = filtered.length + ' request' + (filtered.length !== 1 ? 's' : '');
            }

            if (filtered.length === 0) {
                container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--tm);font-size:12px;">No lab requests found.</p>';
                return;
            }

            const sorted = [...filtered].reverse();

            container.innerHTML = sorted.map(function(req) {
                const date = req.timestamp ? new Date(req.timestamp).toLocaleString() : 'No date';
                const isPending = req.status === 'Pending';
                const isCompleted = req.status === 'Completed';
                const isCancelled = req.status === 'Cancelled';
                
                let statusBadge = '';
                if (isPending) {
                    statusBadge = `<span class="lr-status-pending">❓ Pending</span>`;
                } else if (isCompleted) {
                    statusBadge = `<span class="lr-status-completed">✅ Completed</span>`;
                } else if (isCancelled) {
                    statusBadge = `<span class="lr-status-cancelled">❌ Cancelled</span>`;
                } else {
                    statusBadge = `<span class="lr-status-pending">❓ Pending</span>`;
                }
                
          const tests = req.tests ? req.tests.join(', ') : 'No tests selected';
                
               let actions = '';
if (isPending) {
    actions = `
        <button class="btn-add-result" onclick="openResultEntryModal('${req.id}')"><i class="ti ti-edit"></i> Add Result</button>
        <button class="btn-cancel-request" onclick="cancelLabRequest('${req.id}')"><i class="ti ti-x"></i></button>
        <button class="btn-delete-request" onclick="deleteLabRequest('${req.id}')" style="background:var(--redb);color:var(--redd);padding:2px 10px;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;transition:all 0.2s var(--spring);font-family:inherit;">
            <i class="ti ti-trash"></i> Delete
        </button>
    `;
} else if (isCompleted) {
    actions = `<button class="btn-s" style="padding:2px 8px;font-size:9px;" onclick="printLabRequest('${req.id}')"><i class="ti ti-printer"></i></button>`;
}
                return `<div class="lab-request-item">
                    <div>
                        <div class="req-test-name">${tests}</div>
                        <div class="req-details">${req.priority || 'Routine'} • ${req.sampleType || 'N/A'}</div>
                    </div>
                    <div class="req-details">
                        <div>${date}</div>
                    </div>
                    <div>${statusBadge}</div>
                    <div class="req-details">👨‍⚕️ ${req.requestedBy || 'Unknown'}</div>
                    <div class="req-actions">${actions}</div>
                </div>`;
            }).join('');
        }

        /**
         * Cancel Lab Request
         */
        function cancelLabRequest(requestId) {
            if (!confirm('⚠️ Are you sure you want to cancel this lab request?')) return;
            
            try {
                if (currentPatient && currentPatient.labRequests) {
                    const req = currentPatient.labRequests.find(r => String(r.id) === String(requestId));
                    if (req) {
                        req.status = 'Cancelled';
                        
                        if (typeof updatePatient === 'function') {
                            try {
                                updatePatient(currentPatient.id, { labRequests: currentPatient.labRequests });
                            } catch(e) {}
                        }
                        
                        showToast('✅ Lab request cancelled', 'info');
                        displayLabRequests(currentPatient);
                        displayLabResults(currentPatient);
                    }
                }
            } catch(e) {
                showToast('❌ Error cancelling request', 'error');
            }
        }

        /**
 * Delete Lab Request (for pending requests only)
 */
function deleteLabRequest(requestId) {
    if (!confirm('⚠️ Are you sure you want to DELETE this lab request? This action cannot be undone!')) return;
    
    try {
        if (!currentPatient || !currentPatient.labRequests) {
            showToast('❌ No lab requests found', 'error');
            return;
        }
        
        // Find the request index
        const reqIndex = currentPatient.labRequests.findIndex(r => String(r.id) === String(requestId));
        if (reqIndex === -1) {
            showToast('❌ Request not found', 'error');
            return;
        }
        
        const req = currentPatient.labRequests[reqIndex];
        
        // Only allow deletion of Pending requests
        if (req.status !== 'Pending') {
            showToast('⚠️ Only PENDING requests can be deleted. Completed or Cancelled requests must be kept for records.', 'warning');
            return;
        }
        
        // Remove the request
        currentPatient.labRequests.splice(reqIndex, 1);
        
        // Also remove from labResults if it exists
        if (currentPatient.labResults) {
            const resultIndex = currentPatient.labResults.findIndex(r => r.requestId === String(requestId));
            if (resultIndex !== -1) {
                currentPatient.labResults.splice(resultIndex, 1);
            }
        }
        
        // Update via patient-data.js if available
        if (typeof updatePatient === 'function') {
            try {
                updatePatient(currentPatient.id, { 
                    labRequests: currentPatient.labRequests,
                    labResults: currentPatient.labResults || []
                });
            } catch(e) {
                console.log('updatePatient not available, using local storage only');
            }
        }
        
        showToast(`🗑️ Lab request deleted successfully!`, 'success');
        
        // Refresh displays
        displayLabRequests(currentPatient);
        displayLabResults(currentPatient);
        updateAllVitalsDisplays();
        
    } catch(e) {
        console.error('Error deleting lab request:', e);
        showToast('❌ Error deleting lab request: ' + e.message, 'error');
    }
}

        /**
         * Open Result Entry Modal
         */
        function openResultEntryModal(requestId) {
            // Ensure modal exists
            if (!document.getElementById('result-entry-modal')) {
                createResultEntryModal();
            }
            
            const modal = document.getElementById('result-entry-modal');
            if (!modal) {
                showToast('❌ Modal not found', 'error');
                return;
            }
            
            document.getElementById('resultRequestId').value = requestId;
            
            // Find the request to get test names
            if (currentPatient && currentPatient.labRequests) {
                const req = currentPatient.labRequests.find(r => String(r.id) === String(requestId));
                if (req) {
                    document.getElementById('resultTestName').textContent = req.tests.join(', ');
                    document.getElementById('resultPatientName').textContent = req.patientName || 'Unknown';
                }
            }
            
            modal.classList.add('show');
        }

        /**
         * Create Result Entry Modal
         */
        function createResultEntryModal() {
            if (document.getElementById('result-entry-modal')) return;
            
            const modalHTML = `
                <div class="modal-overlay result-entry-modal" id="result-entry-modal">
                    <div class="modal">
                        <div class="modal-header">
                            <div class="modal-title">🧪 Enter Lab Results</div>
                            <button class="modal-close" onclick="closeResultEntryModal()"><i class="ti ti-x"></i></button>
                        </div>
                        <div class="modal-body">
                            <form class="result-entry-form" id="resultEntryForm">
                                <input type="hidden" id="resultRequestId" value="">
                                
                                <div style="margin-bottom:12px;padding:10px;background:var(--acb);border-radius:8px;">
                                    <div style="font-size:12px;font-weight:600;color:var(--ac);">Patient: <span id="resultPatientName">--</span></div>
                                    <div style="font-size:12px;color:var(--tm);">Test: <span id="resultTestName">--</span></div>
                                </div>
                                
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Result Value *</label>
                                        <input type="text" id="resultValue" placeholder="e.g. 13.2" required/>
                                    </div>
                                    <div class="form-group">
                                        <label>Unit</label>
                                        <input type="text" id="resultUnit" placeholder="e.g. g/dL"/>
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Reference Range *</label>
                                        <input type="text" id="resultRange" placeholder="e.g. 12.0-16.0" required/>
                                    </div>
                                    <div class="form-group">
                                        <label>Status</label>
                                        <select id="resultStatus">
                                            <option value="normal">✅ Normal</option>
                                            <option value="high">⬆️ High</option>
                                            <option value="low">⬇️ Low</option>
                                            <option value="critical">⚠️ Critical</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Notes (Optional)</label>
                                    <input type="text" id="resultNotes" placeholder="Any additional notes..."/>
                                </div>
                                <div class="form-actions">
                                    <button type="button" class="btn-p" onclick="saveLabResult()" style="flex:1;"><i class="ti ti-check"></i> Save Result</button>
                                    <button type="button" class="btn-s" onclick="closeResultEntryModal()">Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            `;
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = modalHTML;
            document.body.appendChild(tempDiv.firstElementChild);
            
            document.getElementById('result-entry-modal').addEventListener('click', function(e) {
                if (e.target === this) closeResultEntryModal();
            });
        }


      

        /**
         * Close Result Entry Modal
         */
        function closeResultEntryModal() {
            const modal = document.getElementById('result-entry-modal');
            if (modal) modal.classList.remove('show');
            const form = document.getElementById('resultEntryForm');
            if (form) form.reset();
        }

        /**
         * Save Lab Result
         */
        function saveLabResult() {
    const requestId = document.getElementById('resultRequestId').value;
    const value = document.getElementById('resultValue').value.trim();
    const unit = document.getElementById('resultUnit').value.trim();
    const range = document.getElementById('resultRange').value.trim();
    const status = document.getElementById('resultStatus').value;
    const notes = document.getElementById('resultNotes').value.trim();
    
    if (!value) {
        showToast('⚠️ Please enter a result value', 'warning');
        return;
    }
    
    if (!range) {
        showToast('⚠️ Please enter reference range', 'warning');
        return;
    }
    
    try {
        if (!currentPatient || !currentPatient.labRequests) {
            showToast('❌ Request not found', 'error');
            return;
        }
        
        const req = currentPatient.labRequests.find(r => String(r.id) === String(requestId));
        if (!req) {
            showToast('❌ Request not found', 'error');
            return;
        }
        
        const labResult = {
            test: req.tests.join(', '),
            value: value,
            unit: unit || '',
            range: range,
            status: status,
            notes: notes,
            requestId: requestId,
            date: new Date().toISOString()
        };
        
        req.status = 'Completed';
        req.result = labResult;
        
        if (!currentPatient.labResults) currentPatient.labResults = [];
        currentPatient.labResults.push(labResult);
        
        if (typeof updatePatient === 'function') {
            try {
                updatePatient(currentPatient.id, { 
                    labRequests: currentPatient.labRequests,
                    labResults: currentPatient.labResults
                });
            } catch(e) {}
        }
        
        showToast('✅ Lab result saved successfully!', 'success');
        closeResultEntryModal();
        
        displayLabRequests(currentPatient);
        displayLabResults(currentPatient);
        
    } catch(e) {
        console.error('Error saving lab result:', e);
        showToast('❌ Error saving lab result', 'error');
    }
}

        /**
         * Print Lab Request
         */
        function printLabRequest(requestId) {
            try {
                if (currentPatient && currentPatient.labRequests) {
                    const req = currentPatient.labRequests.find(r => String(r.id) === String(requestId));
                    if (req) {
                        let resultStr = 'Pending';
                        if (req.status === 'Completed' && req.result) {
                            resultStr = `${req.result.value} ${req.result.unit} (${req.result.status})`;
                        }
                        
                        const printContent = 
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            '           PCLINIC LAB REQUEST\n' +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                            'Patient: ' + req.patientName + '\n' +
                            'MRN: ' + req.mrn + '\n' +
                            'Date: ' + new Date(req.timestamp).toLocaleString() + '\n' +
                            'Priority: ' + req.priority + '\n' +
                            'Sample Type: ' + req.sampleType + '\n' +
                            'Requested By: ' + req.requestedBy + '\n\n' +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            'TESTS REQUESTED:\n' +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            req.tests.map((t, i) => `  ${i+1}. ${t}`).join('\n') + '\n\n' +
                            'Clinical Details:\n' + req.clinicalDetails + '\n\n' +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            'Status: ' + req.status + '\n' +
                            (req.status === 'Completed' ? 'Result: ' + resultStr + '\n' : '') +
                            '            PClinic - Quality Healthcare\n' +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
                        
                        const printWindow = window.open('', '_blank', 'width=600,height=500');
                        printWindow.document.write('<pre style="font-family:monospace;padding:20px;font-size:14px;">' + printContent + '</pre>');
                        printWindow.document.close();
                        printWindow.print();
                        showToast('🖨️ Lab request sent to printer', 'success');
                    }
                }
            } catch(e) {
                showToast('❌ Error printing request', 'error');
            }
        }

       
// ─── CUSTOM LAB TESTS ───
function addCustomLabTest() {
    const input = document.getElementById('customLabTest');
    const list = document.getElementById('customTestsList');
    const testName = input.value.trim();
    
    if (!testName) {
        showToast('⚠️ Please enter a test name', 'warning');
        return;
    }
    
    // Check for duplicates
    const existing = list.querySelectorAll('.custom-test-item');
    for (let item of existing) {
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && cb.value === testName) {
            showToast('⚠️ Test already added', 'warning');
            return;
        }
    }
    
    const div = document.createElement('div');
    div.className = 'lab-test-item custom-test-item selected';
    div.innerHTML = `
        <input type="checkbox" checked value="${testName}">
        <span class="test-name">${testName}</span>
        <span class="test-code" style="cursor:pointer;color:var(--red);font-size:10px;" onclick="removeCustomTest('${testName}')">✕</span>
    `;
    div.onclick = function(e) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SPAN') {
            const cb = this.querySelector('input[type="checkbox"]');
            cb.checked = !cb.checked;
            this.classList.toggle('selected', cb.checked);
            updateSelectedTests();
        }
    };
    
    list.appendChild(div);
    input.value = '';
    updateSelectedTests();
    showToast(`✅ Added "${testName}"`, 'success');
}

function removeCustomTest(testName) {
    const list = document.getElementById('customTestsList');
    const items = list.querySelectorAll('.custom-test-item');
    for (let item of items) {
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && cb.value === testName) {
            item.remove();
            updateSelectedTests();
            showToast(`🗑️ Removed "${testName}"`, 'info');
            break;
        }
    }
}

function updateSelectedTests() {
    const checkboxes = document.querySelectorAll('#tab-lab .lab-test-item input[type="checkbox"]:checked');
    selectedLabTests = Array.from(checkboxes).map(cb => cb.value);
    
    // Also get custom tests
    document.querySelectorAll('#customTestsList .custom-test-item input[type="checkbox"]:checked').forEach(cb => {
        if (!selectedLabTests.includes(cb.value)) {
            selectedLabTests.push(cb.value);
        }
    });
    
    // Update UI count
    const countEl = document.getElementById('selectedTestCount');
    if (countEl) {
        countEl.textContent = selectedLabTests.length + ' selected';
    }
}

        // ─── MODAL CLOSE ON OVERLAY ───
        document.getElementById('stat-modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
        document.getElementById('theater-modal').addEventListener('click', function(e) { if (e.target === this) closeTheaterModal(); });
        document.getElementById('logout-modal').addEventListener('click', function(e) { if (e.target === this) closeLogoutModal(); });
        document.getElementById('vital-edit-modal').addEventListener('click', function(e) { if (e.target === this) closeVitalEditModal(); });


// ─── OPEN PATIENT HISTORY ───
function openPatientHistory(filterType) {
    if (!currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }

    const modalTitle = document.getElementById('historyModalTitle');
    const modalBody = document.getElementById('historyModalBody');
    const modal = document.getElementById('history-modal');

    if (!modalBody || !modal) {
        showToast('❌ Modal not found', 'error');
        return;
    }

    // ─── GATHER ALL HISTORY DATA ───
    const vitals = currentPatient.vitals || [];
    const prescriptions = currentPatient.prescriptions || [];
    const labRequests = currentPatient.labRequests || [];
    const labResults = currentPatient.labResults || [];
    const clinicalNotes = currentPatient.clinicalNotes || [];
    const surgeryNotes = currentPatient.clinicalNotes ? currentPatient.clinicalNotes.filter(n => n.type === 'Surgical Note' || n.type === 'Surgical') : [];

    // ─── SET TITLE BASED ON FILTER ───
    let title = `📜 Patient History - ${currentPatient.firstName || ''} ${currentPatient.lastName || ''}`;
    let showVitals = true;
    let showPrescriptions = true;
    let showLabRequests = true;
    let showLabResults = true;
    let showClinicalNotes = true;
    let showSurgeryNotes = true;

    if (filterType === 'vitals') {
        title = `❤️ Vitals History - ${currentPatient.firstName || ''} ${currentPatient.lastName || ''}`;
        showPrescriptions = false;
        showLabRequests = false;
        showLabResults = false;
        showClinicalNotes = false;
        showSurgeryNotes = false;
    } else if (filterType === 'prescriptions') {
        title = `💊 Prescriptions History - ${currentPatient.firstName || ''} ${currentPatient.lastName || ''}`;
        showVitals = false;
        showLabRequests = false;
        showLabResults = false;
        showClinicalNotes = false;
        showSurgeryNotes = false;
    } else if (filterType === 'labrequests') {
        title = `🧪 Lab Requests History - ${currentPatient.firstName || ''} ${currentPatient.lastName || ''}`;
        showVitals = false;
        showPrescriptions = false;
        showLabResults = false;
        showClinicalNotes = false;
        showSurgeryNotes = false;
    } else if (filterType === 'labresults') {
        title = `📊 Lab Results History - ${currentPatient.firstName || ''} ${currentPatient.lastName || ''}`;
        showVitals = false;
        showPrescriptions = false;
        showLabRequests = false;
        showClinicalNotes = false;
        showSurgeryNotes = false;
    } else if (filterType === 'clinicalnotes') {
        title = `📝 Clinical Notes History - ${currentPatient.firstName || ''} ${currentPatient.lastName || ''}`;
        showVitals = false;
        showPrescriptions = false;
        showLabRequests = false;
        showLabResults = false;
        showSurgeryNotes = false;
    } else if (filterType === 'surgerynotes') {
        title = `🔪 Surgery Notes History - ${currentPatient.firstName || ''} ${currentPatient.lastName || ''}`;
        showVitals = false;
        showPrescriptions = false;
        showLabRequests = false;
        showLabResults = false;
        showClinicalNotes = false;
    }

    modalTitle.textContent = title;

    // ─── BUILD THE HISTORY HTML ───
    let html = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <!-- Summary Stats (Clickable) -->
            <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 16px;">
                <div onclick="openPatientHistory('vitals')" style="background: var(--acb); border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); border: 2px solid transparent;" onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='var(--ac)';" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='transparent';">
                    <div style="font-size: 20px; font-weight: 700; color: var(--ac);">${vitals.length}</div>
                    <div style="font-size: 10px; color: var(--tm);">❤️ Vitals</div>
                </div>
                <div onclick="openPatientHistory('prescriptions')" style="background: var(--greenb); border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); border: 2px solid transparent;" onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='var(--greend)';" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='transparent';">
                    <div style="font-size: 20px; font-weight: 700; color: var(--greend);">${prescriptions.length}</div>
                    <div style="font-size: 10px; color: var(--tm);">💊 Prescriptions</div>
                </div>
                <div onclick="openPatientHistory('labrequests')" style="background: var(--orangeb); border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); border: 2px solid transparent;" onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='var(--orange)';" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='transparent';">
                    <div style="font-size: 20px; font-weight: 700; color: var(--oranged);">${labRequests.length}</div>
                    <div style="font-size: 10px; color: var(--tm);">🧪 Lab Requests</div>
                </div>
                <div onclick="openPatientHistory('labresults')" style="background: #fce4ec; border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); border: 2px solid transparent;" onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='#c62828';" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='transparent';">
                    <div style="font-size: 20px; font-weight: 700; color: #c62828;">${labResults.length}</div>
                    <div style="font-size: 10px; color: var(--tm);">📊 Lab Results</div>
                </div>
                <div onclick="openPatientHistory('clinicalnotes')" style="background: var(--purpleb); border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); border: 2px solid transparent;" onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='var(--purple)';" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='transparent';">
                    <div style="font-size: 20px; font-weight: 700; color: var(--purpled);">${clinicalNotes.length}</div>
                    <div style="font-size: 10px; color: var(--tm);">📝 Clinical Notes</div>
                </div>
                <div onclick="openPatientHistory('surgerynotes')" style="background: #fff3e0; border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); border: 2px solid transparent;" onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='#e65100';" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='transparent';">
                    <div style="font-size: 20px; font-weight: 700; color: #e65100;">${surgeryNotes.length}</div>
                    <div style="font-size: 10px; color: var(--tm);">🔪 Surgery Notes</div>
                </div>
            </div>
    `;

    // ─── BACK TO ALL HISTORY BUTTON ───
    if (filterType) {
        html += `
            <div style="grid-column: 1 / -1; margin-bottom: 8px;">
                <button onclick="openPatientHistory()" style="background: var(--s3); border: none; border-radius: 8px; padding: 8px 20px; font-size: 13px; cursor: pointer; color: var(--tm); font-family: inherit; transition: all 0.2s; display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='var(--acb)'; this.style.color='var(--ac)';" onmouseout="this.style.background='var(--s3)'; this.style.color='var(--tm)';">
                    <i class="ti ti-arrow-left"></i> Back to All History
                </button>
            </div>
        `;
    }

    // ─── VITALS HISTORY ───
    if (showVitals && vitals.length > 0) {
        html += `
            <div style="background: var(--s1); border-radius: 12px; padding: 16px; border: 0.5px solid var(--bd); grid-column: 1 / -1;">
                <h4 style="font-size: 14px; font-weight: 700; color: var(--ac); margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="ti ti-heart" style="color: var(--ac);"></i> Vitals History (${vitals.length})
                </h4>
                <div style="max-height: 200px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead style="background: var(--s3);">
                            <tr>
                                <th style="padding: 6px 10px; text-align: left;">Date</th>
                                <th style="padding: 6px 10px; text-align: center;">HR</th>
                                <th style="padding: 6px 10px; text-align: center;">BP</th>
                                <th style="padding: 6px 10px; text-align: center;">SpO₂</th>
                                <th style="padding: 6px 10px; text-align: center;">Temp</th>
                                <th style="padding: 6px 10px; text-align: center;">Pain</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        const sortedVitals = [...vitals].reverse();
        sortedVitals.forEach(function(v) {
            const date = v.timestamp ? new Date(v.timestamp).toLocaleString() : 'No date';
            html += `
                <tr style="border-bottom: 0.5px solid var(--bd);">
                    <td style="padding: 6px 10px; font-size: 11px;">${date}</td>
                    <td style="padding: 6px 10px; text-align: center; font-weight: 600;">${v.pulse || v.hr || '--'}</td>
                    <td style="padding: 6px 10px; text-align: center; font-weight: 600;">${(v.bpSystolic || v.systolic || '--')}/${(v.bpDiastolic || v.diastolic || '--')}</td>
                    <td style="padding: 6px 10px; text-align: center; font-weight: 600;">${v.spo2 || v.spO2 || '--'}</td>
                    <td style="padding: 6px 10px; text-align: center; font-weight: 600;">${v.temperature || v.temp || '--'}</td>
                    <td style="padding: 6px 10px; text-align: center; font-weight: 600;">${v.painScore || v.pain || '--'}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div></div>`;
    }

    // ─── PRESCRIPTIONS HISTORY ───
    if (showPrescriptions && prescriptions.length > 0) {
        html += `
            <div style="background: var(--s1); border-radius: 12px; padding: 16px; border: 0.5px solid var(--bd); grid-column: 1 / -1;">
                <h4 style="font-size: 14px; font-weight: 700; color: var(--greend); margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="ti ti-pill" style="color: var(--greend);"></i> Prescriptions (${prescriptions.length})
                </h4>
                <div style="max-height: 200px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead style="background: var(--s3);">
                            <tr>
                                <th style="padding: 6px 10px; text-align: left;">Date</th>
                                <th style="padding: 6px 10px; text-align: left;">Medication</th>
                                <th style="padding: 6px 10px; text-align: center;">Dosage</th>
                                <th style="padding: 6px 10px; text-align: center;">Frequency</th>
                                <th style="padding: 6px 10px; text-align: center;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        const sortedRx = [...prescriptions].reverse();
        sortedRx.forEach(function(rx) {
            const date = rx.timestamp ? new Date(rx.timestamp).toLocaleString() : 'No date';
            const statusColor = rx.status === 'Pending' ? 'var(--oranged)' : rx.status === 'Dispensed' ? 'var(--greend)' : 'var(--redd)';
            html += `
                <tr style="border-bottom: 0.5px solid var(--bd);">
                    <td style="padding: 6px 10px; font-size: 11px;">${date}</td>
                    <td style="padding: 6px 10px; font-weight: 500;">${rx.medication}</td>
                    <td style="padding: 6px 10px; text-align: center;">${rx.dosage}</td>
                    <td style="padding: 6px 10px; text-align: center;">${rx.frequency}</td>
                    <td style="padding: 6px 10px; text-align: center; color: ${statusColor}; font-weight: 600;">${rx.status || 'Pending'}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div></div>`;
    }

    // ─── LAB REQUESTS ───
    if (showLabRequests && labRequests.length > 0) {
        html += `
            <div style="background: var(--s1); border-radius: 12px; padding: 16px; border: 0.5px solid var(--bd); grid-column: 1 / -1;">
                <h4 style="font-size: 14px; font-weight: 700; color: var(--orange); margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="ti ti-test-pipe" style="color: var(--orange);"></i> Lab Requests (${labRequests.length})
                </h4>
                <div style="max-height: 200px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead style="background: var(--s3);">
                            <tr>
                                <th style="padding: 6px 10px; text-align: left;">Date</th>
                                <th style="padding: 6px 10px; text-align: left;">Tests</th>
                                <th style="padding: 6px 10px; text-align: center;">Priority</th>
                                <th style="padding: 6px 10px; text-align: center;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        const sortedLab = [...labRequests].reverse();
        sortedLab.forEach(function(req) {
            const date = req.timestamp ? new Date(req.timestamp).toLocaleString() : 'No date';
            const tests = req.tests ? req.tests.join(', ') : 'N/A';
            const statusColor = req.status === 'Pending' ? 'var(--oranged)' : req.status === 'Completed' ? 'var(--greend)' : 'var(--redd)';
            html += `
                <tr style="border-bottom: 0.5px solid var(--bd);">
                    <td style="padding: 6px 10px; font-size: 11px;">${date}</td>
                    <td style="padding: 6px 10px; font-weight: 500;">${tests}</td>
                    <td style="padding: 6px 10px; text-align: center;">${req.priority || 'Routine'}</td>
                    <td style="padding: 6px 10px; text-align: center; color: ${statusColor}; font-weight: 600;">${req.status || 'Pending'}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div></div>`;
    }

    // ─── LAB RESULTS ───
    if (showLabResults && labResults.length > 0) {
        html += `
            <div style="background: var(--s1); border-radius: 12px; padding: 16px; border: 0.5px solid var(--bd); grid-column: 1 / -1;">
                <h4 style="font-size: 14px; font-weight: 700; color: #c62828; margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="ti ti-chart-bar" style="color: #c62828;"></i> Lab Results (${labResults.length})
                </h4>
                <div style="max-height: 200px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead style="background: var(--s3);">
                            <tr>
                                <th style="padding: 6px 10px; text-align: left;">Date</th>
                                <th style="padding: 6px 10px; text-align: left;">Test</th>
                                <th style="padding: 6px 10px; text-align: center;">Result</th>
                                <th style="padding: 6px 10px; text-align: center;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        const sortedResults = [...labResults].reverse();
        sortedResults.forEach(function(r) {
            const date = r.date || r.timestamp ? new Date(r.date || r.timestamp).toLocaleString() : 'No date';
            const statusColor = r.status === 'normal' ? 'var(--greend)' : r.status === 'high' ? 'var(--redd)' : 'var(--ach)';
            html += `
                <tr style="border-bottom: 0.5px solid var(--bd);">
                    <td style="padding: 6px 10px; font-size: 11px;">${date}</td>
                    <td style="padding: 6px 10px; font-weight: 500;">${r.test || 'N/A'}</td>
                    <td style="padding: 6px 10px; text-align: center; font-weight: 600;">${r.value || '--'} ${r.unit || ''}</td>
                    <td style="padding: 6px 10px; text-align: center; color: ${statusColor}; font-weight: 600;">${r.status || 'normal'}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div></div>`;
    }

    // ─── CLINICAL NOTES ───
    if (showClinicalNotes && clinicalNotes.length > 0) {
        html += `
            <div style="background: var(--s1); border-radius: 12px; padding: 16px; border: 0.5px solid var(--bd); grid-column: 1 / -1;">
                <h4 style="font-size: 14px; font-weight: 700; color: var(--purple); margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="ti ti-notes" style="color: var(--purple);"></i> Clinical Notes (${clinicalNotes.length})
                </h4>
                <div style="max-height: 200px; overflow-y: auto;">
        `;
        const sortedNotes = [...clinicalNotes].reverse();
        sortedNotes.forEach(function(note) {
            const date = note.timestamp ? new Date(note.timestamp).toLocaleString() : 'No date';
            const content = (note.note || note.content || 'No content').substring(0, 100);
            html += `
                <div style="padding: 8px 12px; border-bottom: 0.5px solid var(--bd);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                        <span style="font-weight: 600; font-size: 12px;">${note.type || 'Consultation'}</span>
                        <span style="font-size: 11px; color: var(--tm);">🕐 ${date}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--ts); margin-top: 4px;">${content}</div>
                    <div style="font-size: 10px; color: var(--tm); margin-top: 2px;">👨‍⚕️ ${note.doctor || 'Dr. Unknown'}</div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // ─── SURGERY NOTES ───
    if (showSurgeryNotes && surgeryNotes.length > 0) {
        html += `
            <div style="background: var(--s1); border-radius: 12px; padding: 16px; border: 0.5px solid var(--bd); grid-column: 1 / -1;">
                <h4 style="font-size: 14px; font-weight: 700; color: #e65100; margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="ti ti-scalpel" style="color: #e65100;"></i> Surgery Notes (${surgeryNotes.length})
                </h4>
                <div style="max-height: 200px; overflow-y: auto;">
        `;
        const sortedSurgery = [...surgeryNotes].reverse();
        sortedSurgery.forEach(function(note) {
            const date = note.timestamp ? new Date(note.timestamp).toLocaleString() : 'No date';
            const procedure = note.procedure || 'N/A';
            const surgeon = note.surgeon || 'N/A';
            const findings = (note.findings || '').substring(0, 80);
            html += `
                <div style="padding: 8px 12px; border-bottom: 0.5px solid var(--bd);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                        <span style="font-weight: 600; font-size: 12px;">🔪 ${procedure}</span>
                        <span style="font-size: 11px; color: var(--tm);">🕐 ${date}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--ts); margin-top: 4px;">👨‍⚕️ Surgeon: ${surgeon}</div>
                    <div style="font-size: 11px; color: var(--tm); margin-top: 2px;">Findings: ${findings}</div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // ─── IF NO HISTORY ───
    if (vitals.length === 0 && prescriptions.length === 0 && labRequests.length === 0 && labResults.length === 0 && clinicalNotes.length === 0) {
        html += `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--tm);">
                <i class="ti ti-inbox" style="font-size: 48px; display: block; margin-bottom: 12px;"></i>
                <p style="font-size: 16px;">No history records found for this patient.</p>
            </div>
        `;
    }

    html += `</div>`;

    modalBody.innerHTML = html;
    
    // ─── SHOW MODAL ───
    modal.classList.add('show');
    modal.style.display = 'flex';
    
    // ─── MAKE IT FULL SCREEN ───
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.zIndex = '9999';
    modal.style.background = 'rgba(0, 0, 0, 0.5)';
    modal.style.backdropFilter = 'blur(8px)';
    modal.style.webkitBackdropFilter = 'blur(8px)';
}

// ─── CLOSE HISTORY MODAL ───
function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        // Reset styles when closing
        modal.style.position = '';
        modal.style.top = '';
        modal.style.left = '';
        modal.style.width = '';
        modal.style.height = '';
        modal.style.zIndex = '';
        modal.style.background = '';
        modal.style.backdropFilter = '';
        modal.style.webkitBackdropFilter = '';
    }
}



        // ─── LOGOUT ───
        function toggleLogoutModal() {
            document.getElementById('logout-modal').classList.toggle('show');
        }

        function closeLogoutModal() {
            document.getElementById('logout-modal').classList.remove('show');
        }

        function performLogout() {
            showToast('🚪 Logging out...', 'info');
            setTimeout(() => { window.location.href = 'login.html'; }, 1000);
        }

        // ─── PRINT ───
        function printPatientFile() {
            if (currentPatient) {
                showToast('🖨️ Printing patient file...', 'info');
                setTimeout(() => window.print(), 300);
            } else {
                showToast('⚠️ Select a patient first', 'warning');
            }
        }

        // ─── TOAST WRAPPER ───
        // BUG (found by testing): line ~6671 does `window.showToast = showToast`,
        // so `window.showToast` IS this function. The old guard
        // `if (typeof window.showToast === 'function') window.showToast(...)`
        // therefore called itself forever — "Maximum call stack size exceeded"
        // the first time anything toasted. Delegate to the real shared.js /
        // pclinic-state.js implementation instead, never to ourselves.
        function showToast(message, type) {
            var real = (typeof window.pcToast === 'function' && window.pcToast) ||
                       (typeof window.sharedShowToast === 'function' && window.sharedShowToast) ||
                       null;
            if (real) {
                real(message, type || 'info');
            } else {
                const container = document.getElementById('toastContainer');
                if (container) {
                    const toast = document.createElement('div');
                    toast.className = 'toast ' + (type || 'info');
                    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
                    toast.textContent = (icons[type] || 'ℹ️') + ' ' + message;
                    container.appendChild(toast);
                    setTimeout(() => toast.classList.add('show'), 10);
                    setTimeout(() => {
                        toast.classList.remove('show');
                        setTimeout(() => toast.remove(), 400);
                    }, 3000);
                } else {
                    alert(message);
                }
            }
        }
        // ─── DARK MODE ───
        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
            const icon = document.querySelector('.theme-toggle i');
            const breadcrumbIcon = document.getElementById('breadcrumbThemeIcon');
            
            if (document.body.classList.contains('dark-mode')) {
                // Update both icons to sun
                if (icon) icon.className = 'ti ti-sun';
                if (breadcrumbIcon) breadcrumbIcon.className = 'ti ti-sun';
                
                localStorage.setItem('pclinic-theme', 'dark');
                document.documentElement.style.setProperty('--bg', '#0a0a0f');
                document.documentElement.style.setProperty('--s1', '#1c1c1e');
                document.documentElement.style.setProperty('--s3', '#2c2c2e');
                document.documentElement.style.setProperty('--bd', 'rgba(255,255,255,0.08)');
                document.documentElement.style.setProperty('--tp', '#f5f5f7');
                document.documentElement.style.setProperty('--ts', '#e5e5ea');
                document.documentElement.style.setProperty('--tm', '#98989e');
            } else {
                // Update both icons to moon
                if (icon) icon.className = 'ti ti-moon';
                if (breadcrumbIcon) breadcrumbIcon.className = 'ti ti-moon';
                
                localStorage.setItem('pclinic-theme', 'light');
                document.documentElement.style.setProperty('--bg', '#f2f4f8');
                document.documentElement.style.setProperty('--s1', '#ffffff');
                document.documentElement.style.setProperty('--s3', '#f2f2f4');
                document.documentElement.style.setProperty('--bd', 'rgba(0,0,0,0.06)');
                document.documentElement.style.setProperty('--tp', '#1c1c1e');
                document.documentElement.style.setProperty('--ts', '#3a3a3c');
                document.documentElement.style.setProperty('--tm', '#8e8e93');
            }
            
            // Update the breadcrumb buttons to match dark mode
            updateBreadcrumbButtons();
        }
        
        // ─── UPDATE BREADCRUMB BUTTONS FOR DARK MODE ───
        function updateBreadcrumbButtons() {
            const isDark = document.body.classList.contains('dark-mode');
            const buttons = document.querySelectorAll('.breadcrumb .btn-s');
            
            buttons.forEach(function(btn) {
                if (isDark) {
                    btn.style.background = 'rgba(255,255,255,0.08)';
                    btn.style.color = '#e5e5ea';
                    btn.style.borderColor = 'rgba(255,255,255,0.06)';
                } else {
                    btn.style.background = 'rgba(255,255,255,0.8)';
                    btn.style.color = '#1c1c1e';
                    btn.style.borderColor = 'rgba(0,0,0,0.08)';
                }
            });
        }
        // ─── KEYBOARD SHORTCUTS ───
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); toggleDarkMode(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); showShortcuts(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); document.getElementById('ptSearch').focus(); }
    if (e.key === 'Escape') { closeModal(); closeTheaterModal(); closeLogoutModal(); closeVitalEditModal(); }
    
    // 👇 PASTE THE NEW SHORTCUT HERE 👇
    // Ctrl+Shift+L to close lab
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'l') {
        e.preventDefault();
        const labTab = document.querySelector('[data-tab="lab"]');
        if (labTab && labTab.classList.contains('active')) {
            closeLab();
        }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const activeTab = document.querySelector('.mp-body.show');
        if (activeTab) {
            if (activeTab.id === 'tab-notes') {
                e.preventDefault();
                submitNote();
            } else if (activeTab.id === 'tab-surgery') {
                e.preventDefault();
                submitSurgery();
            }
        }
    }
});

       // ─── HAPTIC FEEDBACK ───
document.addEventListener('click', function(e) {
    if (navigator.vibrate) {
        const target = e.target.closest('.nav-tab, .btn-p, .btn-s, .qa-card, .kpi, .tb-btn, .pc-btn, .mp-tab, .suggestion-item, .vh-btn, .lab-test-item');
        if (target) navigator.vibrate(8);
    }
});

// ─── REAL-TIME CLOCK ───
// (Clock is initialized by shared.js's initClock() on #realtimeClock —
// removed the duplicate here since two competing setInterval timers
// writing different formats to the same element caused it to flicker.)





// ─── AUTO-REFRESH VITALS EVERY 30 SECONDS ───
setInterval(function() {
    if (currentPatient) {
        try {
            const patients = getPatients();
            const updated = patients.find(p => p.id === currentPatient.id);
            if (updated) {
                const oldVitals = currentPatient.vitals || [];
                const newVitals = updated.vitals || [];
                if (oldVitals.length !== newVitals.length ||
                    JSON.stringify(oldVitals[oldVitals.length - 1]) !== JSON.stringify(newVitals[newVitals.length - 1])) {
                    currentPatient = updated;
                    updateAllVitalsDisplays();
                    const ts = document.getElementById('vitalsTimestamp');
                    if (ts) {
                        ts.textContent = '🔄 Vitals updated ' + new Date().toLocaleTimeString();
                        ts.style.color = 'var(--ac)';
                        setTimeout(() => ts.style.color = '', 3000);
                    }
                }
            }
        } catch(e) {}
    }
}, 30000);


        // ─── LOAD DARK MODE PREFERENCE ───
        if ((localStorage.getItem('pclinic-theme') === 'dark' || localStorage.getItem('darkMode') === 'enabled')) {
            document.body.classList.add('dark-mode');
            document.querySelector('.theme-toggle i').className = 'ti ti-sun';
            const breadcrumbIcon = document.getElementById('breadcrumbThemeIcon');
            if (breadcrumbIcon) breadcrumbIcon.className = 'ti ti-sun';
            document.documentElement.style.setProperty('--bg', '#0a0a0f');
            document.documentElement.style.setProperty('--s1', '#1c1c1e');
            document.documentElement.style.setProperty('--s3', '#2c2c2e');
            document.documentElement.style.setProperty('--bd', 'rgba(255,255,255,0.08)');
            document.documentElement.style.setProperty('--tp', '#f5f5f7');
            document.documentElement.style.setProperty('--ts', '#e5e5ea');
            document.documentElement.style.setProperty('--tm', '#98989e');
            
            // Update breadcrumb buttons for dark mode
            updateBreadcrumbButtons();
        } else {
            // Make sure breadcrumb buttons are in light mode
            updateBreadcrumbButtons();
        }






        // ─── INIT ───
        document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().slice(0, 10);
    document.querySelectorAll('input[type="date"]').forEach(el => {
        if (!el.value) el.value = today;
    });
    document.getElementById('theaterDateFilter').value = today;

    loadPatients();
    renderTheaterList();
    debouncedUpdateSchedule(); 

    // ✅ RESTORE LAST SELECTED TAB
    const savedTab = localStorage.getItem('pclinic_active_tab');
    if (savedTab) {
        const tabBtn = document.querySelector('[data-tab="' + savedTab + '"]');
        if (tabBtn) {
            switchTab(savedTab, tabBtn);
        }
    } else {
        // Default to 'overview' if no saved tab
        const defaultTab = document.querySelector('[data-tab="overview"]');
        if (defaultTab) {
            switchTab('overview', defaultTab);
        }
    }

    console.log('🏥 PClinic Doctor Dashboard — Fully Integrated');
    console.log('📌 Patients load from shared patient-data.js');
    console.log('📌 Enhanced Prescription System with Medication Selection');
    console.log('📌 Vitals: Edit/Delete with History');
    console.log('📌 Clinical Notes & Surgical Notes with Save/Print/Delete');
    console.log('📌 Enhanced Lab: All Categories + Custom Tests');
    console.log('📌 Smart Lab Results Table with Filtering & Pagination');
    console.log('📌 Shortcuts: Ctrl+D (Dark), Ctrl+F (Search), Ctrl+1-9 (Tabs), Ctrl+Enter (Save Note)');
});







        // ─── UPDATE BREADCRUMB ───
        if (typeof updateBreadcrumb !== 'undefined') {
            updateBreadcrumb('Doctor Dashboard');
        }


        // ─── TRANSFER FUNCTIONS ───

        // Open Transfer Modal
        function openTransferModal() {
            if (!currentPatient) {
                showToast('⚠️ Please select a patient first', 'warning');
                return;
            }

            // Get modal elements
            const modal = document.getElementById('transfer-modal');
            if (!modal) {
                showToast('❌ Transfer modal not found', 'error');
                return;
            }

            // Auto-fill patient info
            document.getElementById('transferPatientName').textContent = 
                (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || '');
            document.getElementById('transferPatientMRN').textContent = 
                'MRN: ' + (currentPatient.mrn || 'N/A');
            document.getElementById('transferCurrentWard').textContent = 
                '🏥 Current: ' + (currentPatient.department || 'General');

            // Auto-fill doctor name (from logged-in user)
            const doctorName = document.querySelector('.uname')?.textContent || 'Dr. Mutua';
            document.getElementById('transferFromDoctor').value = doctorName;

            // Reset form
            document.getElementById('transferToDoctor').value = '';
            document.getElementById('transferType').value = 'Internal';
            document.getElementById('transferReason').value = '';
            document.getElementById('transferOtherReason').value = '';
            document.getElementById('transferNotes').value = '';
            document.getElementById('transferStatus').value = 'Pending';
            document.getElementById('otherReasonContainer').style.display = 'none';

            // Show modal
            modal.classList.add('show');
            modal.style.display = 'flex';

            // Focus on first input
            setTimeout(() => {
                document.getElementById('transferToDoctor').focus();
            }, 300);
        }

        // Close Transfer Modal
        function closeTransferModal() {
            const modal = document.getElementById('transfer-modal');
            if (modal) {
                modal.classList.remove('show');
                modal.style.display = 'none';
            }
        }

        // Toggle Other Reason Input
        function toggleOtherReason() {
            const reason = document.getElementById('transferReason').value;
            const container = document.getElementById('otherReasonContainer');
            if (reason === 'Other') {
                container.style.display = 'block';
                document.getElementById('transferOtherReason').focus();
            } else {
                container.style.display = 'none';
                document.getElementById('transferOtherReason').value = '';
            }
        }

        // Submit Transfer
        function submitTransfer(event) {
            event.preventDefault();

            if (!currentPatient) {
                showToast('❌ No patient selected', 'error');
                return;
            }

            // Get form values
            const fromDoctor = document.getElementById('transferFromDoctor').value.trim();
            const toDoctor = document.getElementById('transferToDoctor').value.trim();
            const transferType = document.getElementById('transferType').value;
            const reason = document.getElementById('transferReason').value;
            const otherReason = document.getElementById('transferOtherReason').value.trim();
            const notes = document.getElementById('transferNotes').value.trim();
            const status = document.getElementById('transferStatus').value;

            // Validation
            if (!toDoctor) {
                showToast('⚠️ Please enter the receiving doctor or hospital', 'warning');
                document.getElementById('transferToDoctor').focus();
                return;
            }

            if (!reason) {
                showToast('⚠️ Please select a reason for transfer', 'warning');
                document.getElementById('transferReason').focus();
                return;
            }

            if (reason === 'Other' && !otherReason) {
                showToast('⚠️ Please specify the reason', 'warning');
                document.getElementById('transferOtherReason').focus();
                return;
            }

            // Build transfer data
            const transferData = {
                id: Date.now(),
                fromDoctor: fromDoctor,
                toDoctor: toDoctor,
                transferType: transferType,
                reason: reason === 'Other' ? otherReason : reason,
                notes: notes || 'No additional notes',
                status: status,
                timestamp: new Date().toISOString(),
                patientId: currentPatient.id,
                patientName: (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || ''),
                fromWard: currentPatient.department || 'General'
            };

            // Save to patient
            if (!currentPatient.transfers) {
                currentPatient.transfers = [];
            }
            currentPatient.transfers.push(transferData);

            // Update patient status if transfer is completed
            if (status === 'Completed') {
                // Optionally update patient's ward/department
                if (transferType === 'Internal') {
                    // Could prompt for new ward here
                    showToast('ℹ️ Patient\'s ward has been updated', 'info');
                }
            }

            // Save via patient-data.js
            if (typeof updatePatient === 'function') {
                try {
                    updatePatient(currentPatient.id, { 
                        transfers: currentPatient.transfers,
                        department: transferType === 'Internal' && status === 'Completed' ? 
                            'Transferred' : currentPatient.department
                    });
                } catch(e) {
                    console.log('updatePatient not available, using local storage only');
                }
            }

            // Also add as a clinical note
            const noteData = {
                doctor: fromDoctor,
                note: `🔄 PATIENT TRANSFER\n` +
                      `From: ${fromDoctor}\n` +
                      `To: ${toDoctor}\n` +
                      `Type: ${transferType}\n` +
                      `Reason: ${reason === 'Other' ? otherReason : reason}\n` +
                      `Notes: ${notes || 'N/A'}\n` +
                      `Status: ${status}`,
                type: 'Transfer',
                status: status === 'Completed' ? 'Completed' : 'Active',
                timestamp: new Date().toISOString(),
                transferData: transferData
            };

            if (typeof addClinicalNote === 'function') {
                addClinicalNote(currentPatient.id, noteData);
            } else {
                if (!currentPatient.clinicalNotes) currentPatient.clinicalNotes = [];
                currentPatient.clinicalNotes.push({ id: Date.now() + 1, ...noteData });
            }

            // Show success
            const btn = event.target.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="ti ti-check"></i> Transfer Submitted!';
            btn.style.background = 'var(--greend)';
            btn.disabled = true;

            showToast(`✅ ${currentPatient.firstName} ${currentPatient.lastName} transferred to ${toDoctor}`, 'success');

            // Close modal after delay
            setTimeout(() => {
                closeTransferModal();
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.disabled = false;
                
                // Refresh patient file to show transfer in history
                displayPatientFile(currentPatient);
                displayClinicalNotes(currentPatient);
                
                // Show transfer history
                showTransferHistory(currentPatient);
            }, 1500);
        }

        // ─── PRINT TRANSFER FORM (hard copy for patient) ───
        function printTransferForm() {
            try {
                if (!currentPatient) {
                    showToast('❌ No patient selected', 'error');
                    return;
                }

                // Pull whatever is currently in the form
                const fromDoctor = document.getElementById('transferFromDoctor').value.trim() || 'N/A';
                const toDoctor = document.getElementById('transferToDoctor').value.trim();
                const transferType = document.getElementById('transferType').value;
                const reasonSel = document.getElementById('transferReason').value;
                const otherReason = document.getElementById('transferOtherReason').value.trim();
                const notes = document.getElementById('transferNotes').value.trim();
                const status = document.getElementById('transferStatus').value;

                // Basic validation so we don't print a blank form
                if (!toDoctor) {
                    showToast('⚠️ Please enter the receiving doctor or hospital before printing', 'warning');
                    document.getElementById('transferToDoctor').focus();
                    return;
                }
                if (!reasonSel) {
                    showToast('⚠️ Please select a reason for transfer before printing', 'warning');
                    document.getElementById('transferReason').focus();
                    return;
                }
                if (reasonSel === 'Other' && !otherReason) {
                    showToast('⚠️ Please specify the reason before printing', 'warning');
                    document.getElementById('transferOtherReason').focus();
                    return;
                }

                const reason = reasonSel === 'Other' ? otherReason : reasonSel;
                const mrn = currentPatient.mrn || 'N/A';
                const patientName = (currentPatient.firstName || '') + ' ' + (currentPatient.lastName || '');
                const fromWard = currentPatient.department || 'General';
                const now = new Date();

                const printContent =
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                    '            PCLINIC TRANSFER FORM\n' +
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                    'Patient: ' + patientName + '\n' +
                    'MRN: ' + mrn + '\n' +
                    'Current Ward/Dept: ' + fromWard + '\n' +
                    'Date: ' + now.toLocaleString() + '\n\n' +
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                    'Transferring Doctor: ' + fromDoctor + '\n' +
                    'Transfer To: ' + toDoctor + '\n' +
                    'Transfer Type: ' + transferType + '\n' +
                    'Reason: ' + reason + '\n' +
                    'Status: ' + status + '\n' +
                    (notes ? 'Notes: ' + notes + '\n' : 'Notes: N/A\n') +
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                    'Doctor Signature: _____________________\n\n' +
                    'Patient/Guardian Signature: _____________________\n\n' +
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                    '            PClinic - Quality Healthcare\n' +
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

                const printWindow = window.open('', '_blank', 'width=600,height=600');
                if (!printWindow) {
                    showToast('❌ Please allow pop-ups to print', 'error');
                    return;
                }
                printWindow.document.write('<pre style="font-family:monospace;padding:20px;font-size:14px;white-space:pre-wrap;">' + printContent + '</pre>');
                printWindow.document.close();
                printWindow.focus();
                printWindow.print();
                showToast('🖨️ Transfer form sent to printer', 'success');
            } catch (e) {
                console.error('Error printing transfer form:', e);
                showToast('❌ Error printing transfer form', 'error');
            }
        }

        // ─── VIEW TRANSFER HISTORY ───
        function showTransferHistory(patient) {
            if (!patient) {
                showToast('⚠️ No patient selected', 'warning');
                return;
            }
            
            const transfers = patient?.transfers || [];
            if (transfers.length === 0) {
                showToast('📋 No transfer history for this patient', 'info');
                return;
            }

            let historyHTML = `
                <div style="max-height: 400px; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <span style="font-size: 14px; font-weight: 700;">🔄 Transfer History (${transfers.length})</span>
                        <button class="btn-s" onclick="closeModal()" style="padding: 4px 14px; font-size: 11px;">Close</button>
                    </div>
            `;

            const sorted = [...transfers].reverse();
            sorted.forEach(function(t, index) {
                const date = t.timestamp ? new Date(t.timestamp).toLocaleString() : 'No date';
                const typeClass = t.transferType === 'Internal' ? 'internal' : 
                                 t.transferType === 'External' ? 'external' : 
                                 t.transferType === 'Referral' ? 'referral' : 'discharge';
                
                const statusColor = t.status === 'Completed' ? 'var(--greend)' : 
                                   t.status === 'Pending' ? 'var(--oranged)' : 
                                   t.status === 'Cancelled' ? 'var(--redd)' : 'var(--tm)';

                historyHTML += `
                    <div style="background: ${index % 2 === 0 ? 'var(--s3)' : 'var(--s1)'}; 
                                padding: 12px 16px; 
                                border-radius: 8px; 
                                margin-bottom: 8px;
                                border-left: 4px solid var(--ac);
                                transition: all 0.2s ease;"
                         onmouseover="this.style.background='var(--acb)';"
                         onmouseout="this.style.background='${index % 2 === 0 ? 'var(--s3)' : 'var(--s1)'}'">
                        
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <span style="font-weight: 600; font-size: 13px; color: var(--tp);">
                                #${transfers.length - index}
                            </span>
                            <span class="transfer-badge ${typeClass}">
                                ${t.transferType || 'Transfer'}
                            </span>
                            <span style="font-size: 11px; color: var(--tm);">${date}</span>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px;">
                            <div style="font-size: 12px;">
                                <span style="color: var(--tm);">From:</span> 
                                <strong>${t.fromDoctor || 'Unknown'}</strong>
                            </div>
                            <div style="font-size: 12px;">
                                <span style="color: var(--tm);">To:</span> 
                                <strong style="color: var(--ac);">${t.toDoctor || 'N/A'}</strong>
                            </div>
                            <div style="font-size: 12px; grid-column: 1 / -1;">
                                <span style="color: var(--tm);">Reason:</span> 
                                ${t.reason || 'Not specified'}
                            </div>
                            <div style="font-size: 12px; grid-column: 1 / -1;">
                                <span style="color: var(--tm);">Status:</span> 
                                <span style="color: ${statusColor}; font-weight: 600;">${t.status || 'Pending'}</span>
                            </div>
                            ${t.notes ? `<div style="font-size: 11px; color: var(--tm); grid-column: 1 / -1;">📝 ${t.notes}</div>` : ''}
                        </div>
                    </div>
                `;
            });

            historyHTML += '</div>';

            // Show in modal
            const modalTitle = document.getElementById('modal-title');
            const modalBody = document.getElementById('modal-body');
            const modal = document.getElementById('stat-modal');

            if (modalTitle && modalBody && modal) {
                modalTitle.textContent = `🔄 Transfer History - ${patient.firstName || ''} ${patient.lastName || ''}`;
                modalBody.innerHTML = historyHTML;
                modal.classList.add('show');
                modal.style.display = 'flex';
            }
        }




        // ─── OPEN ADMISSION FORM FROM BUTTON FOLDER ───
function openAdmissionFormFromDashboard(patient) {
    // Check if patient is selected
    if (!patient && !currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }
    
    const selectedPatient = patient || currentPatient;
    
    // Check if modal already exists
    let modal = document.getElementById('admissionModalContainer');
    
    if (!modal) {
        // Create modal container
        modal = document.createElement('div');
        modal.id = 'admissionModalContainer';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
        `;
        document.body.appendChild(modal);
    }
    
    // Show modal background
    modal.style.display = 'flex';
    
    // Load the admission form via fetch
    fetch('admission-form.html')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load admission form (Status: ${response.status})`);
            }
            return response.text();
        })
        .then(html => {
            // Insert HTML into modal
            modal.innerHTML = html;
            
            // Extract and execute the script from the loaded HTML
            const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
            if (scriptMatch && scriptMatch[1]) {
                try {
                    // Execute the script in the current context
                    const scriptEl = document.createElement('script');
                    scriptEl.textContent = scriptMatch[1];
                    document.body.appendChild(scriptEl);
                    
                    // Now call the open function from the loaded script
                    setTimeout(() => {
                        if (typeof openAdmissionForm === 'function') {
                            openAdmissionForm(selectedPatient);
                        } else {
                            // Try to find it in the modal's scope
                            const iframe = modal.querySelector('iframe');
                            if (iframe && iframe.contentWindow) {
                                iframe.contentWindow.postMessage({
                                    type: 'OPEN_ADMISSION',
                                    patient: selectedPatient
                                }, '*');
                            } else {
                                // Fallback: try to evaluate the script content
                                try {
                                    eval(scriptMatch[1]);
                                    setTimeout(() => {
                                        if (typeof openAdmissionForm === 'function') {
                                            openAdmissionForm(selectedPatient);
                                        } else {
                                            showToast('⚠️ Error: Admission form loaded but function not found', 'error');
                                            modal.style.display = 'none';
                                        }
                                    }, 100);
                                } catch (e) {
                                    showToast('⚠️ Error initializing admission form', 'error');
                                    modal.style.display = 'none';
                                }
                            }
                        }
                    }, 300);
                } catch (e) {
                    console.error('Error executing admission form script:', e);
                    showToast('❌ Error loading admission form', 'error');
                    modal.style.display = 'none';
                }
            } else {
                showToast('⚠️ No script found in admission form', 'warning');
                modal.style.display = 'none';
            }
        })
        .catch(error => {
            console.error('Error loading admission form:', error);
            showToast('❌ Error loading admission form: ' + error.message, 'error');
            modal.style.display = 'none';
        });
}

// ─── CLOSE ADMISSION FORM FROM DASHBOARD ───
function closeAdmissionFormFromDashboard() {
    const modal = document.getElementById('admissionModalContainer');
    if (modal) {
        modal.style.display = 'none';
        modal.innerHTML = ''; // Clear content
        console.log('📋 Admission form closed from dashboard');
    }
}

// Listen for messages from the admission form (for closing)
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CLOSE_ADMISSION') {
        closeAdmissionFormFromDashboard();
    }
});


// ─── OPEN PHYSIO REQUEST MODAL ───
function openPhysioRequestModal(patient) {
    if (!patient && !currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }
    const p = patient || currentPatient;
    try { localStorage.setItem('pclinic_active_patient', String(p.id)); } catch(e){}
    if (window.pcPatient && typeof window.pcPatient.open === 'function') {
        window.pcPatient.open('physio-request.html');
    } else {
        window.location.href = 'physio-request.html?patient=' + encodeURIComponent(p.id);
    }
}
window.openPhysioRequestModal = openPhysioRequestModal;

// ─── OPEN PRESCRIPTION MODAL ───
function openPrescriptionModal(patient) {
    if (!patient && !currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }
    
    const selectedPatient = patient || currentPatient;
    
    // Check if modal already exists
    let modal = document.getElementById('prescriptionModalContainer');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'prescriptionModalContainer';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
        `;
        document.body.appendChild(modal);
    }
    
    modal.style.display = 'flex';
    modal.innerHTML = '<iframe id="prescriptionFrame" src="prescription.html" style="width:min(900px,95vw);height:90vh;border:none;border-radius:16px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.3);"></iframe>';
    
    const frame = document.getElementById('prescriptionFrame');
    frame.onload = function() {
        frame.contentWindow.postMessage({ type: 'LOAD_PATIENT', patient: selectedPatient }, '*');
    };
}

// Listen for the prescription iframe asking to close, or asking for patient data
window.addEventListener('message', function(event) {
    if (!event.data || !event.data.type) return;
    if (event.data.type === 'CLOSE_PRESCRIPTION') {
        const modal = document.getElementById('prescriptionModalContainer');
        if (modal) modal.style.display = 'none';
    } else if (event.data.type === 'REQUEST_PATIENT_DATA') {
        const frame = document.getElementById('prescriptionFrame');
        if (frame && frame.contentWindow && currentPatient) {
            frame.contentWindow.postMessage({ type: 'LOAD_PATIENT', patient: currentPatient }, '*');
        }
    }
});



// ─── OPEN WARD ROUND MODAL ───
function openWardRoundModal(patient) {
    if (!patient && !currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }
    
    const selectedPatient = patient || currentPatient;
    
    // Create or get container
    let container = document.getElementById('wardRoundModalContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'wardRoundModalContainer';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
        `;
        document.body.appendChild(container);
    }
    
    // Show loading state
    container.style.display = 'flex';
    container.innerHTML = `
        <div style="color: var(--tp); font-size: 16px; text-align: center; padding: 40px; background: var(--s1); border-radius: 16px; box-shadow: var(--shadow2);">
            <i class="ti ti-loader ti-spin" style="font-size: 32px; display: block; margin-bottom: 12px;"></i>
            Loading Ward Round...
        </div>
    `;
    
    // Load the HTML
    fetch('ward-round.html')
        .then(response => {
            if (!response.ok) throw new Error(`Failed to load (Status: ${response.status})`);
            return response.text();
        })
        .then(html => {
            container.innerHTML = html;
            
            // Execute scripts
            const scripts = container.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                newScript.textContent = oldScript.textContent;
                document.body.appendChild(newScript);
                oldScript.remove();
            });
            
            // Open the ward round with patient data
            setTimeout(() => {
                if (typeof openWardRound === 'function') {
                    openWardRound(selectedPatient);
                } else {
                    // Fallback: show modal manually
                    const modal = document.getElementById('wardModal');
                    if (modal) {
                        window.currentWardPatient = selectedPatient;
                        modal.classList.add('show');
                        modal.style.display = 'flex';
                    }
                }
            }, 300);
        })
        .catch(error => {
            console.error('Error loading ward round:', error);
            showToast('❌ Error: ' + error.message, 'error');
            container.style.display = 'none';
        });
}

// ─── CLOSE WARD ROUND MODAL ───
function closeWardRoundModal() {
    const container = document.getElementById('wardRoundModalContainer');
    if (container) {
        container.style.display = 'none';
    }
}








// ─── MESSAGE HANDLER ───
window.addEventListener('message', function(event) {
    if (!event.data || !event.data.type) return;
    
    // Close ward round
    if (event.data.type === 'CLOSE_WARD_ROUND') {
        closeWardRoundModal();
        return;
    }
    
    // Close prescription (ADD THIS)
    if (event.data.type === 'CLOSE_PRESCRIPTION') {
        closePrescriptionModal();
        return;
    }
    
    // Close lab
    if (event.data.type === 'CLOSE_LAB') {
        closeLabRequestPage();
        return;
    }
    
    // Close lab results
    if (event.data.type === 'CLOSE_LAB_RESULTS') {
        closeLabResultsPage();
        return;
    }
    
    // Handle patient data requests from iframes (ADD THIS)
    if (event.data.type === 'REQUEST_PATIENT_DATA') {
        console.log('📤 Received patient data request from child iframe');
        const frame = document.getElementById('prescriptionFrame');
        if (frame && frame.contentWindow && currentPatient) {
            frame.contentWindow.postMessage({ 
                type: 'PATIENT_DATA_RESPONSE', 
                patient: currentPatient 
            }, '*');
            console.log('✅ Sent patient data response:', currentPatient.firstName, currentPatient.lastName);
        } else {
            console.log('❌ Could not send patient data response - no frame or patient');
        }
        return;
    }
});







// ─── OPEN OPD FILE BELOW PATIENT CARD ───
function openOpdFileModal(patient) {
    if (!patient && !currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }
    
    const selectedPatient = patient || currentPatient;
    
    let container = document.getElementById('opdFileContainer');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'opdFileContainer';
        container.style.cssText = `
            margin-top: 16px;
            padding: 0;
            background: var(--s1);
            border-radius: 12px;
            border: 0.5px solid var(--bd);
            box-shadow: var(--shadow);
            overflow: hidden;
            display: none;
            height: 800px;
        `;
        const patientCard = document.getElementById('patient-card');
        if (patientCard) {
            patientCard.parentNode.insertBefore(container, patientCard.nextSibling);
        } else {
            document.querySelector('.content-area').appendChild(container);
        }
    }
    
    try { localStorage.setItem('pclinic_active_patient', String(selectedPatient.id)); } catch(e){}
    container.style.display = 'block';
    
    // ─── USE SIMPLE IFRAME WITH PATIENT ID PARAM ───
    container.innerHTML = `
        <iframe id="opdIframe" src="opd-file.html?patient=${encodeURIComponent(selectedPatient.id)}" style="
            width: 100%;
            height: 800px;
            border: none;
            margin: 0;
            padding: 0;
        "></iframe>
        <div style="padding:8px 16px;background:var(--s3);border-top:0.5px solid var(--bd);display:flex;justify-content:flex-end;">
            <button onclick="closeOpdFileModal()" class="btn-s" style="font-size:11px;">
                <i class="ti ti-x"></i> Close OPD File
            </button>
        </div>
    `;
    
    // ─── SEND PATIENT DATA VIA postMessage ───
    const iframe = document.getElementById('opdIframe');
    if (iframe) {
        iframe.onload = function() {
            console.log('🔄 Iframe loaded, sending patient data...');
            setTimeout(function() {
                try {
                    iframe.contentWindow.postMessage({
                        type: 'LOAD_PATIENT',
                        patient: selectedPatient
                    }, '*');
                    console.log('✅ Patient data sent to iframe:', selectedPatient.firstName, selectedPatient.lastName);
                } catch (e) {
                    console.log('❌ Error sending data to iframe:', e);
                }
            }, 10);
        };
    }
    
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`📋 Opening OPD file for ${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`, 'info');
}





function closeOpdFileModal() {
    const container = document.getElementById('opdFileContainer');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
        showToast('📋 OPD file closed', 'info');
    }
}

// ─── MESSAGE HANDLER (OPD FILE) ───
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CLOSE_OPD_FILE') {
        closeOpdFileModal();
    }
});










function openImagingPageModal(patient) {
    if (!patient && !currentPatient) {
        showToast('⚠️ Please select a patient first', 'warning');
        return;
    }
    
    const selectedPatient = patient || currentPatient;
    
    let modal = document.getElementById('imagingPageModalContainer');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imagingPageModalContainer';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
        `;
        document.body.appendChild(modal);
    }
    
    modal.style.display = 'flex';
    
    fetch('imaging-request.html')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load imaging request page');
            return response.text();
        })
        .then(html => {
            modal.innerHTML = html;
            
            const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
            if (scriptMatch && scriptMatch[1]) {
                const scriptEl = document.createElement('script');
                scriptEl.textContent = scriptMatch[1];
                document.body.appendChild(scriptEl);

                // Poll for readiness instead of a blind fixed delay —
                // opens as soon as the script has actually executed,
                // with a generous cap so we don't wait forever on a slow device.
                let attempts = 0;
                const maxAttempts = 50; // 50 x 20ms = 1s ceiling
                const tryOpen = () => {
                    if (typeof openImagingPage === 'function') {
                        openImagingPage(selectedPatient);
                        return;
                    }
                    attempts++;
                    if (attempts < maxAttempts) {
                        setTimeout(tryOpen, 20);
                    } else {
                        showToast('⚠️ Error loading imaging page', 'error');
                        modal.style.display = 'none';
                    }
                };
                tryOpen();
            }
        })
        .catch(error => {
            showToast('❌ Error: ' + error.message, 'error');
            modal.style.display = 'none';
        });
}










       // ─── EXPOSE FUNCTIONS ───
window.loadPatients = loadPatients;
window.selectPatient = selectPatient;
window.lookupPatient = lookupPatient;
window.handleSmartSearch = handleSmartSearch;
window.switchTab = switchTab;
window.switchSubTab = switchSubTab;
window.renderPatientTable = renderPatientTable;
window.renderTheaterList = renderTheaterList;
window.showTheaterForm = showTheaterForm;
window.closeTheaterModal = closeTheaterModal;
window.addTheaterEntry = addTheaterEntry;
window.removeTheaterEntry = removeTheaterEntry;
// window.submitAdmission = submitAdmission;  ← COMMENTED OUT
window.submitWardRound = submitWardRound;
window.clearWardRoundForm = clearWardRoundForm;
window.displayWardRoundHistory = displayWardRoundHistory;
window.updateWardVitalsSnapshot = updateWardVitalsSnapshot;
window.deleteWardRound = deleteWardRound;
window.printWardRound = printWardRound;
window.submitImaging = submitImagingRequest;
window.submitNote = submitNote;
window.submitPrescription = submitPrescription;
window.submitPrescriptionEnhanced = submitPrescriptionEnhanced;
window.syncMedication = syncMedication;
window.clearPrescriptionForm = clearPrescriptionForm;
window.sendToPharmacy = sendToPharmacy;
window.submitSurgery = submitSurgery;
window.submitPhysio = submitPhysio;
window.addNoteForPatient = addNoteForPatient;
window.openStatModal = openStatModal;
window.closeModal = closeModal;
window.toggleLogoutModal = toggleLogoutModal;
window.closeLogoutModal = closeLogoutModal;
window.performLogout = performLogout;
window.toggleDarkMode = toggleDarkMode;
window.showShortcuts = showShortcuts;
window.showToast = showToast;
window.printPatientFile = printPatientFile;
window.handlePatientMedia = handlePatientMedia;
window.handlePatientVideo = handlePatientVideo;
window.updateSchedule = updateSchedule;
window.updateAllVitalsDisplays = updateAllVitalsDisplays;
window.viewAllVitals = viewAllVitals;
window.displayEnhancedVitals = displayEnhancedVitals;
window.updateDoctorVitals = updateDoctorVitals;
window.syncVitalsFromPatientData = syncVitalsFromPatientData;
window.displayPrescriptionHistory = displayPrescriptionHistory;
window.voidPrescription = voidPrescription;
window.printPrescription = printPrescription;
window.renderVitalsHistory = renderVitalsHistory;
window.editVital = editVital;
window.deleteVital = deleteVital;
window.saveEditedVital = saveEditedVital;
window.closeVitalEditModal = closeVitalEditModal;
window.showShortcuts = showShortcuts;
window.toggleLabTest = toggleLabTest;
window.addCustomLabTest = addCustomLabTest;
window.removeCustomTest = removeCustomTest;
window.clearLabSelection = clearLabSelection;
window.submitLabRequest = submitLabRequest;
window.displayLabRequests = displayLabRequests;
window.cancelLabRequest = cancelLabRequest;
window.printLabRequest = printLabRequest;
window.openAddPatientFile = openAddPatientFile;

// ─── TRANSFER FUNCTIONS ───
window.openTransferModal = openTransferModal;
window.closeTransferModal = closeTransferModal;
window.submitTransfer = submitTransfer;
window.printTransferForm = printTransferForm;
window.toggleOtherReason = toggleOtherReason;
window.showTransferHistory = showTransferHistory;

// ─── ADMISSION FORM FUNCTIONS ───
window.openAdmissionFormFromDashboard = openAdmissionFormFromDashboard;
window.closeAdmissionFormFromDashboard = closeAdmissionFormFromDashboard;
window.openImagingPageModal = openImagingPageModal;
window.openOpdFileModal = openOpdFileModal;
window.closeOpdFileModal = closeOpdFileModal;

// ═══ NOTIFICATION PANEL ═══
(function() {
    const notifBtn = document.getElementById('notifBtn');
    const notifPanel = document.getElementById('notifPanel');
    const notifCountEl = document.getElementById('notifCount');

    if (notifBtn && notifPanel) {
        notifBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            notifPanel.classList.toggle('show');
            // Close settings if open
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) settingsModal.classList.remove('show');
        });

        // Close panel when clicking outside
        document.addEventListener('click', function(e) {
            if (!notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
                notifPanel.classList.remove('show');
            }
        });

        // Close panel on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') notifPanel.classList.remove('show');
        });
    }

    // Mark all notifications as read
    window.markAllNotifsRead = function() {
        const items = notifPanel.querySelectorAll('.notif-item.unread');
        items.forEach(item => item.classList.remove('unread'));
        if (notifCountEl) notifCountEl.style.display = 'none';
        showToast('✅ All notifications marked as read', 'success');
    };

    // Click individual notification to mark as read
    if (notifPanel) {
        notifPanel.querySelectorAll('.notif-item').forEach(item => {
            item.addEventListener('click', function() {
                this.classList.remove('unread');
                updateNotifCount();
            });
        });
    }

    function updateNotifCount() {
        if (!notifPanel || !notifCountEl) return;
        const unreadCount = notifPanel.querySelectorAll('.notif-item.unread').length;
        notifCountEl.textContent = unreadCount;
        notifCountEl.style.display = unreadCount > 0 ? 'block' : 'none';
    }
})();

// ═══ SETTINGS MODAL ═══
(function() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settings-modal');

    window.openSettingsModal = function() {
        if (settingsModal) {
            settingsModal.classList.add('show');
            settingsModal.style.display = 'flex';
            settingsModal.style.zIndex = '999999';
            const darkCheckbox = document.getElementById('settingDarkMode');
            if (darkCheckbox) {
                darkCheckbox.checked = document.documentElement.getAttribute('data-theme') === 'dark';
            }
            const notifPanel = document.getElementById('notifPanel');
            if (notifPanel) notifPanel.classList.remove('show');
        }
    };

    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            window.openSettingsModal();
        });
    }

    window.closeSettingsModal = function() {
        if (settingsModal) {
            settingsModal.classList.remove('show');
            settingsModal.style.display = 'none';
        }
    };

    // Compact view
    window.toggleCompactView = function(enabled) {
        document.body.classList.toggle('compact', enabled);
        localStorage.setItem('pclinic-compact', enabled ? '1' : '0');
        showToast(enabled ? '📐 Compact view enabled' : '📐 Standard view restored', 'info');
    };

    // Auto-refresh
    let autoRefreshInterval = null;
    window.toggleAutoRefresh = function(enabled) {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
        if (enabled) {
            autoRefreshInterval = setInterval(function() {
                // Trigger a silent refresh
                if (typeof refreshPage === 'function') refreshPage();
            }, 30000);
            showToast('🔄 Auto-refresh enabled (30s)', 'info');
        } else {
            showToast('⏸ Auto-refresh disabled', 'info');
        }
        localStorage.setItem('pclinic-autorefresh', enabled ? '1' : '0');
    };

    // Notification sound
    window.toggleNotifSound = function(enabled) {
        localStorage.setItem('pclinic-sound', enabled ? '1' : '0');
        showToast(enabled ? '🔔 Notification sound on' : '🔕 Notification sound off', 'info');
    };

    // Clock format
    window.setClockFormat = function(format) {
        localStorage.setItem('pclinic-clock-format', format);
        showToast('🕐 Clock set to ' + (format === '24' ? '24-hour' : '12-hour'), 'info');
    };

    // Font size
    window.setFontSize = function(size) {
        document.body.classList.remove('font-small', 'font-default', 'font-large');
        if (size !== 'default') document.body.classList.add('font-' + size);
        localStorage.setItem('pclinic-fontsize', size);
        showToast('🔤 Font size: ' + size, 'info');
    };

    // Restore saved settings on load
    (function restoreSettings() {
        const compact = localStorage.getItem('pclinic-compact') === '1';
        const fontSize = localStorage.getItem('pclinic-fontsize') || 'default';
        const clockFormat = localStorage.getItem('pclinic-clock-format') || '12';
        const sound = localStorage.getItem('pclinic-sound') !== '0';

        if (compact) {
            document.body.classList.add('compact');
            const cb = document.getElementById('settingCompact');
            if (cb) cb.checked = true;
        }
        if (fontSize !== 'default') {
            document.body.classList.add('font-' + fontSize);
            const sel = document.getElementById('settingFontSize');
            if (sel) sel.value = fontSize;
        }
        const clockSel = document.getElementById('settingClockFormat');
        if (clockSel) clockSel.value = clockFormat;
        const soundCb = document.getElementById('settingSound');
        if (soundCb) soundCb.checked = sound;
    })();
})();

window.closeSettingsModal = window.closeSettingsModal || function() {};
window.toggleCompactView = window.toggleCompactView || function() {};
window.toggleAutoRefresh = window.toggleAutoRefresh || function() {};
window.toggleNotifSound = window.toggleNotifSound || function() {};
window.setClockFormat = window.setClockFormat || function() {};
window.setFontSize = window.setFontSize || function() {};
window.markAllNotifsRead = window.markAllNotifsRead || function() {};

/* ── extracted from doctor-dashboard.html, inline block 3 ── */
(function(){
  function openWardPage(){
    if (typeof currentPatient === 'undefined' || !currentPatient){
      (window.showToast ? showToast('⚠️ Select a patient first, then Ward Round.','warning') : alert('Select a patient first.'));
      var pt = document.querySelector('[data-tab="patients"]');
      if (pt) switchTab('patients', pt);
      return;
    }
    switchTab('ward', document.querySelector('[data-tab="ward"]'));
    injectWardChrome();
    var ward = document.getElementById('tab-ward');
    if (ward) ward.scrollIntoView({behavior:'smooth', block:'start'});
  }

  function injectWardChrome(){
    var ward = document.getElementById('tab-ward');
    if(!ward) return;
    if(!document.getElementById('wardPageHeader')){
      var h = document.createElement('div');
      h.id = 'wardPageHeader';
      h.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:16px;padding:14px 18px;background:var(--acb);border-left:4px solid var(--ac);border-radius:12px;';
      h.innerHTML =
        '<div style="display:flex;align-items:center;gap:12px;">'
        +'<i class="ti ti-bed" style="font-size:20px;color:var(--ac);"></i>'
        +'<div><div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;">Selected Patient</div>'
        +'<div id="wardPagePatient" style="font-size:15px;font-weight:700;color:var(--tp);">--</div>'
        +'<div id="wardPageMrn" style="font-size:12px;color:var(--tm);">MRN: --</div></div></div>'
        +'<div style="display:flex;gap:8px;">'
        +'<button onclick="wardGoSelectPatient()" style="padding:6px 16px;font-size:12px;font-weight:600;background:var(--ac);color:#fff;border:none;border-radius:8px;cursor:pointer;"><i class="ti ti-users"></i> Select Patient</button>'
        +'<button onclick="closeWardPage()" style="padding:8px 16px;font-size:13px;font-weight:600;background:var(--s3);color:var(--tm);border:0.5px solid var(--bd);border-radius:10px;cursor:pointer;"><i class="ti ti-arrow-left"></i> Back</button>'
        +'</div>';
      ward.insertBefore(h, ward.firstChild);
    }
    if(currentPatient){
      var n=document.getElementById('wardPagePatient'), m=document.getElementById('wardPageMrn');
      if(n) n.textContent=(currentPatient.firstName||'')+' '+(currentPatient.lastName||'');
      if(m) m.textContent='MRN: '+(currentPatient.mrn||'--');
    }
  }

  window.wardGoSelectPatient = function(){
    var pt = document.querySelector('[data-tab="patients"]');
    if (pt) switchTab('patients', pt);
  };
  window.closeWardPage = function(){
    var ov = document.querySelector('[data-tab="overview"]');
    if (ov) switchTab('overview', ov);
  };

  document.addEventListener('DOMContentLoaded', function(){
    var wardTab = document.querySelector('[data-tab="ward"]');
    if (wardTab) wardTab.onclick = function(e){ e.preventDefault(); openWardPage(); return false; };
    document.querySelectorAll('.qa-card').forEach(function(card){
      if ((card.textContent||'').trim().toLowerCase() === 'ward round')
        card.onclick = function(e){ e.preventDefault(); openWardPage(); return false; };
    });
  });
})();
