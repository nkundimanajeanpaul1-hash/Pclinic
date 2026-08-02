/* ============================================================
   PCLINIC — CLINICAL CATALOGUES
   Shared reference data: imaging modalities/exams and the drug
   formulary. Both are seeded once into localStorage and then grow —
   anything a doctor adds is visible to every other doctor, exactly
   like the diagnosis registry.

   Prices are RWF and are PLACEHOLDERS for the admin to correct.
   Imaging is priced per modality (every CT the same, every MRI the
   same) because that is what the existing tariff supported; refining
   individual exams is an admin job, not a code change.
   ============================================================ */
(function () {
    'use strict';

    var IMG_KEY  = 'pclinic_imaging_catalog';
    var DRUG_KEY = 'pclinic_formulary';

    function read(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
    function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function staff() { return window.currentStaff || {}; }

    /* ══════════ IMAGING ══════════
       151 exams across 9 modalities, lifted verbatim from the original
       imaging-request.html so nothing clinical was retyped or lost. */
    var MODALITIES = 
[
        {
            "id": "xray",
            "label": "X-Ray",
            "icon": "ti-radioactive",
            "price": 15000,
            "exams": [
                "Chest X-Ray (CXR)",
                "Abdominal X-Ray (KUB)",
                "Skull X-Ray",
                "Spine X-Ray (Cervical)",
                "Spine X-Ray (Thoracic)",
                "Spine X-Ray (Lumbar)",
                "Pelvis X-Ray",
                "Hip X-Ray",
                "Knee X-Ray",
                "Ankle X-Ray",
                "Foot X-Ray",
                "Hand X-Ray",
                "Wrist X-Ray",
                "Elbow X-Ray",
                "Shoulder X-Ray",
                "Clavicle X-Ray",
                "Rib X-Ray",
                "Sinus X-Ray",
                "Dental X-Ray (Panoramic)",
                "Dental X-Ray (Bitewing)",
                "Mammography (Screening)",
                "Mammography (Diagnostic)",
                "Bone Age X-Ray"
            ]
        },
        {
            "id": "ct",
            "label": "CT Scan",
            "icon": "ti-device-desktop-analytics",
            "price": 120000,
            "exams": [
                "CT Head (Non-Contrast)",
                "CT Head (Contrast)",
                "CT Brain (CTA)",
                "CT Chest (Non-Contrast)",
                "CT Chest (Contrast)",
                "CT Chest (High-Resolution)",
                "CT Abdomen (Non-Contrast)",
                "CT Abdomen (Contrast)",
                "CT Pelvis (Non-Contrast)",
                "CT Pelvis (Contrast)",
                "CT Spine (Cervical)",
                "CT Spine (Thoracic)",
                "CT Spine (Lumbar)",
                "CT Angiography (CTA)",
                "CT Coronary Angiography",
                "CT Pulmonary Embolism (PE)",
                "CT Urogram (CTU)",
                "CT Enterography",
                "CT Colonography (Virtual Colonoscopy)",
                "CT Sinus",
                "CT Temporal Bone",
                "CT Orbit",
                "CT Maxillofacial",
                "CT Mandible",
                "CT Joint (Shoulder, Knee, etc.)"
            ]
        },
        {
            "id": "mri",
            "label": "MRI",
            "icon": "ti-magnet",
            "price": 250000,
            "exams": [
                "MRI Brain (Non-Contrast)",
                "MRI Brain (Contrast)",
                "MRI Brain (Diffusion)",
                "MRI Brain (FLAIR)",
                "MRI Brain (MRA)",
                "MRI Brain (MRV)",
                "MRI Spine (Cervical)",
                "MRI Spine (Thoracic)",
                "MRI Spine (Lumbar)",
                "MRI Shoulder",
                "MRI Knee",
                "MRI Hip",
                "MRI Ankle",
                "MRI Foot",
                "MRI Wrist",
                "MRI Hand",
                "MRI Elbow",
                "MRI Abdomen (Non-Contrast)",
                "MRI Abdomen (Contrast)",
                "MRI Pelvis (Non-Contrast)",
                "MRI Pelvis (Contrast)",
                "MRI Breast",
                "MRI Cardiac",
                "MRI Angiography (MRA)",
                "MRI Venography (MRV)",
                "MRI Enterography",
                "MRI Prostate",
                "MRI Uterus",
                "MRI Orbit",
                "MRI Temporal Bone"
            ]
        },
        {
            "id": "ultrasound",
            "label": "Ultrasound",
            "icon": "ti-wave-saw-tool",
            "price": 20000,
            "exams": [
                "Abdominal Ultrasound",
                "Pelvic Ultrasound (Transabdominal)",
                "Pelvic Ultrasound (Transvaginal)",
                "Obstetric Ultrasound (First Trimester)",
                "Obstetric Ultrasound (Second Trimester)",
                "Obstetric Ultrasound (Third Trimester)",
                "Fetal Anomaly Scan",
                "Fetal Growth Scan",
                "Doppler Ultrasound (Fetal)",
                "Cardiac Ultrasound (Echocardiogram)",
                "Carotid Doppler",
                "Venous Doppler (Legs)",
                "Arterial Doppler (Legs)",
                "Renal Ultrasound",
                "Bladder Ultrasound",
                "Prostate Ultrasound (Transrectal)",
                "Thyroid Ultrasound",
                "Breast Ultrasound",
                "Testicular Ultrasound",
                "Scrotal Ultrasound",
                "Musculoskeletal Ultrasound",
                "Joint Ultrasound (Shoulder, Knee, etc.)",
                "Soft Tissue Ultrasound",
                "Neonatal Head Ultrasound",
                "Hip Ultrasound (Neonatal)"
            ]
        },
        {
            "id": "mammography",
            "label": "Mammography",
            "icon": "ti-gender-female",
            "price": 25000,
            "exams": [
                "Screening Mammogram (Bilateral)",
                "Diagnostic Mammogram (Bilateral)",
                "Diagnostic Mammogram (Unilateral)",
                "Breast Tomosynthesis (3D Mammo)",
                "Breast Ultrasound (Supplemental)",
                "Breast MRI (Supplemental)",
                "Breast Biopsy (Ultrasound-Guided)",
                "Breast Biopsy (Stereotactic)",
                "Breast Biopsy (MRI-Guided)"
            ]
        },
        {
            "id": "fluoroscopy",
            "label": "Fluoroscopy",
            "icon": "ti-live-view",
            "price": 35000,
            "exams": [
                "Barium Swallow (Esophagram)",
                "Barium Meal (Upper GI)",
                "Barium Enema (Lower GI)",
                "Small Bowel Follow-Through",
                "Barium Meal with Small Bowel",
                "IVP (Intravenous Pyelogram)",
                "Cystogram",
                "Voiding Cystourethrogram (VCUG)",
                "Hysterosalpingogram (HSG)",
                "ERCP (Endoscopic Retrograde Cholangiopancreatography)",
                "Myelogram",
                "Arthrogram",
                "Discogram",
                "Fistulogram",
                "Sinogram"
            ]
        },
        {
            "id": "pet",
            "label": "PET Scan",
            "icon": "ti-atom",
            "price": 400000,
            "exams": [
                "PET/CT Whole Body (FDG)",
                "PET/CT Brain (FDG)",
                "PET/CT Cardiac",
                "PET/MRI Fusion",
                "PET/CT for Oncology (Staging)",
                "PET/CT for Oncology (Restaging)",
                "PET/CT for Oncology (Treatment Response)",
                "PET/CT for Infection/Inflammation"
            ]
        },
        {
            "id": "nuclear",
            "label": "Nuclear Medicine",
            "icon": "ti-radioactive-filled",
            "price": 80000,
            "exams": [
                "Bone Scan (Whole Body)",
                "Thyroid Scan (I-123)",
                "Thyroid Uptake Test",
                "Renal Scan (DTPA)",
                "Renal Scan (MAG3)",
                "Cardiac Perfusion (Myocardial)",
                "MUGA Scan (Cardiac)",
                "VQ Scan (Lung)",
                "Gallium Scan",
                "Octreotide Scan",
                "MIBG Scan",
                "HIDA Scan (Gallbladder)",
                "GI Bleed Scan",
                "Meckel\\",
                ",\n                    ",
                ",\n                    "
            ]
        },
        {
            "id": "other",
            "label": "Other / Custom",
            "icon": "ti-dots",
            "price": 0,
            "exams": []
        }
    ]
;

    /* ══════════ DRUG FORMULARY ══════════
       Rwanda essential-medicines shape: generic name, strength, form,
       and the usual adult dose so the doctor picks instead of typing.
       Prices are RWF per unit dispensed and are PLACEHOLDERS.
       Names match the classes pcSafety already knows (penicillins,
       NSAIDs, etc.) so allergy and interaction checking keeps working. */
    var DRUGS = [
        // ── Analgesics / antipyretics ──
        ['Paracetamol', '500mg', 'tablet', '1-2 tabs TDS', 'analgesic', 50],
        ['Paracetamol', '120mg/5ml', 'syrup', '10ml TDS', 'analgesic', 1200],
        ['Paracetamol', '1g/100ml', 'infusion', '1g IV QDS', 'analgesic', 2500],
        ['Ibuprofen', '400mg', 'tablet', '1 tab TDS after food', 'nsaid', 80],
        ['Ibuprofen', '100mg/5ml', 'syrup', '5-10ml TDS', 'nsaid', 1500],
        ['Diclofenac', '50mg', 'tablet', '1 tab BD after food', 'nsaid', 100],
        ['Diclofenac', '75mg/3ml', 'injection', '75mg IM stat', 'nsaid', 900],
        ['Aspirin', '75mg', 'tablet', '1 tab OD', 'nsaid', 40],
        ['Tramadol', '50mg', 'capsule', '1 cap TDS PRN', 'opioid', 250],
        ['Morphine', '10mg/ml', 'injection', '5-10mg IM PRN', 'opioid', 1800],
        ['Pethidine', '50mg/ml', 'injection', '50-100mg IM PRN', 'opioid', 2000],
        // ── Antibiotics ──
        ['Amoxicillin', '500mg', 'capsule', '1 cap TDS x 5 days', 'penicillin', 120],
        ['Amoxicillin', '250mg/5ml', 'suspension', '5ml TDS', 'penicillin', 2200],
        ['Amoxicillin + Clavulanate', '625mg', 'tablet', '1 tab BD x 7 days', 'penicillin', 500],
        ['Ampicillin', '500mg', 'injection', '500mg IV QDS', 'penicillin', 600],
        ['Cloxacillin', '500mg', 'capsule', '1 cap QDS', 'penicillin', 200],
        ['Benzathine Penicillin', '2.4MU', 'injection', '2.4MU IM stat', 'penicillin', 2500],
        ['Ceftriaxone', '1g', 'injection', '1g IV OD', 'cephalosporin', 1500],
        ['Cefixime', '200mg', 'tablet', '1 tab BD', 'cephalosporin', 700],
        ['Cefotaxime', '1g', 'injection', '1g IV TDS', 'cephalosporin', 1600],
        ['Azithromycin', '500mg', 'tablet', '1 tab OD x 3 days', 'macrolide', 800],
        ['Erythromycin', '500mg', 'tablet', '1 tab QDS', 'macrolide', 300],
        ['Ciprofloxacin', '500mg', 'tablet', '1 tab BD x 5 days', 'quinolone', 200],
        ['Levofloxacin', '500mg', 'tablet', '1 tab OD', 'quinolone', 900],
        ['Metronidazole', '400mg', 'tablet', '1 tab TDS x 7 days', 'nitroimidazole', 80],
        ['Metronidazole', '500mg/100ml', 'infusion', '500mg IV TDS', 'nitroimidazole', 1200],
        ['Gentamicin', '80mg', 'injection', '80mg IM BD', 'aminoglycoside', 500],
        ['Doxycycline', '100mg', 'capsule', '1 cap BD x 7 days', 'tetracycline', 150],
        ['Cotrimoxazole', '960mg', 'tablet', '1 tab BD', 'sulfonamide', 90],
        ['Nitrofurantoin', '100mg', 'tablet', '1 tab BD x 5 days', 'other', 200],
        ['Chloramphenicol', '250mg', 'capsule', '1 cap QDS', 'other', 180],
        // ── Antimalarials ──
        ['Artemether + Lumefantrine', '20/120mg', 'tablet', '4 tabs BD x 3 days', 'antimalarial', 1500],
        ['Artesunate', '60mg', 'injection', '2.4mg/kg IV', 'antimalarial', 3500],
        ['Quinine', '300mg', 'tablet', '2 tabs TDS x 7 days', 'antimalarial', 200],
        ['Sulfadoxine + Pyrimethamine', '500/25mg', 'tablet', '3 tabs stat', 'antimalarial', 600],
        // ── TB / HIV ──
        ['Rifampicin + Isoniazid', '150/75mg', 'tablet', 'As per weight band', 'antitb', 400],
        ['Isoniazid', '300mg', 'tablet', '1 tab OD', 'antitb', 150],
        ['Ethambutol', '400mg', 'tablet', 'As per weight band', 'antitb', 200],
        ['Pyrazinamide', '500mg', 'tablet', 'As per weight band', 'antitb', 250],
        ['Tenofovir + Lamivudine + Dolutegravir', 'TLD', 'tablet', '1 tab OD', 'arv', 2000],
        ['Zidovudine + Lamivudine', '300/150mg', 'tablet', '1 tab BD', 'arv', 1800],
        ['Nevirapine', '200mg', 'tablet', '1 tab BD', 'arv', 900],
        // ── Antifungals / antivirals ──
        ['Fluconazole', '150mg', 'capsule', '1 cap stat', 'antifungal', 600],
        ['Nystatin', '100000IU/ml', 'suspension', '1ml QDS', 'antifungal', 1800],
        ['Clotrimazole', '1%', 'cream', 'Apply BD', 'antifungal', 1500],
        ['Griseofulvin', '500mg', 'tablet', '1 tab OD', 'antifungal', 400],
        ['Acyclovir', '400mg', 'tablet', '1 tab 5x daily', 'antiviral', 300],
        // ── Cardiovascular ──
        ['Amlodipine', '5mg', 'tablet', '1 tab OD', 'ccb', 100],
        ['Nifedipine', '20mg', 'tablet', '1 tab BD', 'ccb', 120],
        ['Atenolol', '50mg', 'tablet', '1 tab OD', 'betablocker', 90],
        ['Bisoprolol', '5mg', 'tablet', '1 tab OD', 'betablocker', 250],
        ['Enalapril', '10mg', 'tablet', '1 tab OD', 'acei', 120],
        ['Lisinopril', '10mg', 'tablet', '1 tab OD', 'acei', 150],
        ['Losartan', '50mg', 'tablet', '1 tab OD', 'arb', 300],
        ['Hydrochlorothiazide', '25mg', 'tablet', '1 tab OD', 'diuretic', 60],
        ['Furosemide', '40mg', 'tablet', '1 tab OD', 'diuretic', 70],
        ['Furosemide', '20mg/2ml', 'injection', '20-40mg IV', 'diuretic', 400],
        ['Spironolactone', '25mg', 'tablet', '1 tab OD', 'diuretic', 200],
        ['Atorvastatin', '20mg', 'tablet', '1 tab nocte', 'statin', 350],
        ['Simvastatin', '20mg', 'tablet', '1 tab nocte', 'statin', 300],
        ['Digoxin', '0.25mg', 'tablet', '1 tab OD', 'cardiac', 150],
        ['Warfarin', '5mg', 'tablet', 'As per INR', 'anticoagulant', 200],
        ['Heparin', '5000IU', 'injection', '5000IU SC BD', 'anticoagulant', 1500],
        ['Clopidogrel', '75mg', 'tablet', '1 tab OD', 'antiplatelet', 500],
        // ── Diabetes / endocrine ──
        ['Metformin', '500mg', 'tablet', '1 tab BD with food', 'antidiabetic', 80],
        ['Glibenclamide', '5mg', 'tablet', '1 tab OD', 'antidiabetic', 60],
        ['Gliclazide', '80mg', 'tablet', '1 tab OD', 'antidiabetic', 200],
        ['Insulin (Soluble)', '100IU/ml', 'injection', 'As per sliding scale', 'insulin', 8000],
        ['Insulin (Isophane NPH)', '100IU/ml', 'injection', 'As prescribed', 'insulin', 8500],
        ['Levothyroxine', '50mcg', 'tablet', '1 tab OD before food', 'thyroid', 250],
        ['Carbimazole', '5mg', 'tablet', '1 tab TDS', 'thyroid', 300],
        ['Prednisolone', '5mg', 'tablet', 'As prescribed', 'steroid', 60],
        ['Hydrocortisone', '100mg', 'injection', '100mg IV stat', 'steroid', 1200],
        ['Dexamethasone', '4mg/ml', 'injection', '8mg IV stat', 'steroid', 800],
        // ── Respiratory ──
        ['Salbutamol', '100mcg', 'inhaler', '2 puffs PRN', 'bronchodilator', 4500],
        ['Salbutamol', '2mg/5ml', 'syrup', '5ml TDS', 'bronchodilator', 1500],
        ['Salbutamol', '5mg/ml', 'nebuliser', '2.5-5mg nebulised', 'bronchodilator', 900],
        ['Beclometasone', '200mcg', 'inhaler', '2 puffs BD', 'steroid', 7000],
        ['Aminophylline', '250mg/10ml', 'injection', '250mg slow IV', 'bronchodilator', 800],
        ['Cetirizine', '10mg', 'tablet', '1 tab nocte', 'antihistamine', 80],
        ['Chlorphenamine', '4mg', 'tablet', '1 tab TDS', 'antihistamine', 50],
        ['Loratadine', '10mg', 'tablet', '1 tab OD', 'antihistamine', 120],
        ['Promethazine', '25mg', 'tablet', '1 tab nocte', 'antihistamine', 100],
        // ── Gastrointestinal ──
        ['Omeprazole', '20mg', 'capsule', '1 cap OD before food', 'ppi', 150],
        ['Omeprazole', '40mg', 'injection', '40mg IV OD', 'ppi', 2500],
        ['Ranitidine', '150mg', 'tablet', '1 tab BD', 'h2blocker', 100],
        ['Metoclopramide', '10mg', 'tablet', '1 tab TDS', 'antiemetic', 70],
        ['Metoclopramide', '10mg/2ml', 'injection', '10mg IV TDS', 'antiemetic', 500],
        ['Ondansetron', '4mg', 'tablet', '1 tab TDS', 'antiemetic', 400],
        ['Ondansetron', '4mg/2ml', 'injection', '4mg IV stat', 'antiemetic', 900],
        ['Hyoscine Butylbromide', '10mg', 'tablet', '1 tab TDS', 'antispasmodic', 120],
        ['Oral Rehydration Salts', 'sachet', 'powder', '1 sachet in 1L', 'other', 300],
        ['Zinc Sulphate', '20mg', 'tablet', '1 tab OD x 10 days', 'supplement', 100],
        ['Bisacodyl', '5mg', 'tablet', '1-2 tabs nocte', 'laxative', 80],
        ['Lactulose', '3.35g/5ml', 'syrup', '15ml OD', 'laxative', 3500],
        // ── Neurology / psychiatry ──
        ['Diazepam', '5mg', 'tablet', '1 tab nocte', 'benzodiazepine', 60],
        ['Diazepam', '10mg/2ml', 'injection', '10mg slow IV', 'benzodiazepine', 700],
        ['Phenobarbital', '30mg', 'tablet', '1 tab BD', 'anticonvulsant', 80],
        ['Phenytoin', '100mg', 'capsule', '1 cap TDS', 'anticonvulsant', 150],
        ['Carbamazepine', '200mg', 'tablet', '1 tab BD', 'anticonvulsant', 200],
        ['Sodium Valproate', '200mg', 'tablet', '1 tab BD', 'anticonvulsant', 250],
        ['Amitriptyline', '25mg', 'tablet', '1 tab nocte', 'antidepressant', 90],
        ['Fluoxetine', '20mg', 'capsule', '1 cap OD', 'antidepressant', 300],
        ['Haloperidol', '5mg', 'tablet', '1 tab BD', 'antipsychotic', 150],
        ['Chlorpromazine', '100mg', 'tablet', '1 tab nocte', 'antipsychotic', 120],
        ['Risperidone', '2mg', 'tablet', '1 tab BD', 'antipsychotic', 400],
        // ── Obstetrics ──
        ['Oxytocin', '10IU/ml', 'injection', '10IU IM after delivery', 'uterotonic', 800],
        ['Misoprostol', '200mcg', 'tablet', 'As prescribed', 'uterotonic', 900],
        ['Magnesium Sulphate', '50%', 'injection', 'As per eclampsia protocol', 'other', 1500],
        ['Ferrous Sulphate + Folic Acid', '200mg/0.4mg', 'tablet', '1 tab OD', 'supplement', 50],
        ['Folic Acid', '5mg', 'tablet', '1 tab OD', 'supplement', 40],
        ['Calcium + Vitamin D', '500mg', 'tablet', '1 tab OD', 'supplement', 150],
        // ── Fluids / other ──
        ['Normal Saline 0.9%', '500ml', 'infusion', 'As prescribed', 'fluid', 1200],
        ['Ringer Lactate', '500ml', 'infusion', 'As prescribed', 'fluid', 1300],
        ['Dextrose 5%', '500ml', 'infusion', 'As prescribed', 'fluid', 1200],
        ['Dextrose 50%', '50ml', 'injection', '50ml IV stat', 'fluid', 900],
        ['Vitamin B Complex', '', 'tablet', '1 tab OD', 'supplement', 40],
        ['Vitamin A', '200000IU', 'capsule', '1 cap stat', 'supplement', 200],
        ['Tetanus Toxoid', '0.5ml', 'injection', '0.5ml IM stat', 'vaccine', 1500],
        ['Lidocaine 2%', '20ml', 'injection', 'Local infiltration', 'anaesthetic', 700],
        ['Adrenaline', '1mg/ml', 'injection', '0.5mg IM stat', 'emergency', 1000],
        ['Atropine', '0.6mg/ml', 'injection', '0.6mg IV stat', 'emergency', 800]
    ];

    function seedDrugs() {
        return DRUGS.map(function (d, i) {
            return {
                code: 'DRG-' + (1000 + i),
                name: d[0], strength: d[1], form: d[2],
                dose: d[3], klass: d[4], price: d[5],
                custom: false
            };
        });
    }

    function allDrugs() {
        var list = read(DRUG_KEY, null);
        if (!list || !list.length) { list = seedDrugs(); write(DRUG_KEY, list); }
        return list;
    }

    /* Doctors can add a drug the pharmacy stocks but we did not seed.
       It persists for everyone, exactly like an added diagnosis. */
    function addDrug(d) {
        if (!d || !d.name) return null;
        var list = allDrugs();
        var label = (d.name + ' ' + (d.strength || '')).trim().toLowerCase();
        if (list.some(function (x) {
            return (x.name + ' ' + (x.strength || '')).trim().toLowerCase() === label; })) return null;
        var entry = {
            code: 'DRG-C' + Date.now().toString(36),
            name: d.name, strength: d.strength || '', form: d.form || 'tablet',
            dose: d.dose || '', klass: d.klass || 'other',
            price: Number(d.price) || 0, custom: true,
            by: staff().name || '', at: new Date().toISOString()
        };
        list.push(entry);
        write(DRUG_KEY, list);
        syncConfig('formulary', list);
        return entry;
    }

    function drugLabel(d) {
        return (d.name + (d.strength ? ' ' + d.strength : '')).trim();
    }

    /* ══════════ IMAGING HELPERS ══════════ */
    function allModalities() {
        var list = read(IMG_KEY, null);
        if (!list || !list.length) { list = MODALITIES; write(IMG_KEY, list); }
        return list;
    }
    function modality(id) {
        return allModalities().filter(function (m) { return m.id === id; })[0] || null;
    }
    function examPrice(modId) {
        var m = modality(modId);
        return m ? (m.price || 0) : 0;
    }
    function examCode(modId, examName) {
        // Stable-ish code so a bill line can be traced back to the exam
        var slug = String(examName).replace(/[^A-Za-z0-9]+/g, '').slice(0, 10).toUpperCase();
        return 'IMG-' + String(modId).toUpperCase() + '-' + slug;
    }
    function addExam(modId, name) {
        var list = allModalities();
        var m = list.filter(function (x) { return x.id === modId; })[0];
        if (!m || !name) return null;
        if (m.exams.some(function (e) { return e.toLowerCase() === name.toLowerCase(); })) return null;
        m.exams.push(name);
        write(IMG_KEY, list);
        syncConfig('imaging', list);
        return name;
    }

    function syncConfig(docId, items) {
        try {
            if (window.firebaseDB && window.firebaseFunctions) {
                var f = window.firebaseFunctions;
                f.setDoc(f.doc(window.firebaseDB, 'config', docId),
                         { items: items, updatedAt: new Date().toISOString() }).catch(function () {});
            }
        } catch (e) {}
    }

    window.pcCatalog = {
        modalities: allModalities, modality: modality,
        examPrice: examPrice, examCode: examCode, addExam: addExam,
        drugs: allDrugs, addDrug: addDrug, drugLabel: drugLabel,
        DRUG_KEY: DRUG_KEY, IMG_KEY: IMG_KEY
    };

    console.log('📚 PClinic catalogues: ' +
        allModalities().reduce(function (s, m) { return s + m.exams.length; }, 0) +
        ' imaging exams, ' + allDrugs().length + ' drugs');
})();
