/* ============================================================
   PCLINIC — FULL LABORATORY CATALOG (CHUK / OpenClinic quicklist)
   Single source of truth for laboratory exams and their result
   parameters. Extracted from the official quicklist (codes as
   photographed 2026-07-06); items with provisional/uncertain
   codes or names carry "verify":true so they are easy to find
   and correct later.

   Used by:
     • lab-request.html   (selection grid — merged with the tariff)
     • lab-results.html   (flow-sheet rows — OC_CATEGORIES builder)
     • pclinic-lab.js     (result-entry parameter resolution)

   Prices are placeholders (3000 RWF). When the same exam exists in
   the admin tariff (Admin → Lab Exams) the tariff price wins.
   ============================================================ */
(function () {
    'use strict';

    var PLACEHOLDER_PRICE = 3000;

    // Ordered category ids and display labels (also reused by
    // lab-results.html and lab-request.html).
    var CATEGORY_LABELS = {
        hematology:    'Hematology',
        bloodbank:     'Blood Bank',
        biochemistry:  'Biochemistry',
        immunology:    'Immunology',
        serology:      'Serology & Virology',
        hormones:      'Hormones',
        tumor:         'Tumor Markers',
        microbiology:  'Microbiology',
        parasitology:  'Parasitology',
        vitamins:      'Vitamins',
        genetics:      'Genetics',
        cytology:      'Cytology & Pathology',
        fluids:        'Body Fluids'
    };

    var CATEGORY_ORDER = [
        'hematology', 'bloodbank', 'biochemistry', 'immunology', 'serology',
        'hormones', 'tumor', 'microbiology', 'parasitology', 'vitamins',
        'genetics', 'cytology', 'fluids'
    ];

    // Each exam: { code, name, category, price?, verify?, parameters: [{code,name,unit,range}] }
    var LAB_CATALOG = [
        /* ═══ HEMATOLOGY ═══ */
        {
            code: '13100', name: 'FULL BLOOD COUNT', category: 'hematology',
            parameters: [
                { code: '31001', name: 'WBC', unit: '10^3/µl', range: '4-10' },
                { code: '31002', name: 'RBC', unit: '10^6/µl', range: '4.5-6.2' },
                { code: '31003', name: 'hemoglobin', unit: 'g/dl', range: '13-17' },
                { code: '31004', name: 'Hct', unit: '%', range: '40-54' },
                { code: '31005', name: 'MCV', unit: 'fL', range: '82-98' },
                { code: '31006', name: 'MCH', unit: 'pg', range: '27-31' },
                { code: '31007', name: 'MCHC', unit: 'g/dl', range: '32-36' },
                { code: '31008', name: 'platelets', unit: '10^3/µl', range: '150-450' },
                { code: '31009', name: 'RDW', unit: '%', range: '11.5-14.5' },
                { code: '31010', name: 'MPV', unit: 'fL', range: '6.9-10.6' },
                { code: '32001', name: 'neutrophiles', unit: '%', range: '40-75' },
                { code: '32002', name: 'lymphocytes', unit: '%', range: '20-40' },
                { code: '32003', name: 'monocytes', unit: '%', range: '2-8' },
                { code: '32004', name: 'eosinophiles', unit: '%', range: '1-4' }
            ]
        },
        {
            code: '13130', name: 'GLYCATED HEMOGLOBIN (HbA1c)', category: 'hematology',
            parameters: [{ code: '13130-1', name: 'HbA1c', unit: '%', range: '4-6' }]
        },
        {
            code: '16210', name: 'ERYTHROCYTE SEDIMENTATION RATE (ESR)', category: 'hematology',
            parameters: [{ code: '16210-1', name: 'ESR', unit: 'mm/h', range: '0-20' }]
        },
        {
            code: '16245', name: 'MANUAL DIFFERENTIAL COUNT', category: 'hematology',
            parameters: [{ code: '16245-1', name: 'Manual differential count', unit: '', range: '' }]
        },
        {
            code: '16215', name: 'RETICULOCYTES', category: 'hematology', verify: true,
            parameters: [{ code: '16215-1', name: 'Reticulocytes', unit: '%', range: '0.5-2.5' }]
        },
        {
            code: '16220', name: 'PERIPHERAL BLOOD FILM (PBF)', category: 'hematology', verify: true,
            parameters: [{ code: '16220-1', name: 'Blood film report', unit: '', range: '' }]
        },
        {
            code: '16300', name: 'COAGULATION TESTS', category: 'hematology',
            parameters: [
                { code: '16300-1', name: 'Prothrombin Time (PT)', unit: 's', range: '11-13.5' },
                { code: '16300-2', name: 'INR', unit: '', range: '0.8-1.2' },
                { code: '16300-3', name: 'aPTT', unit: 's', range: '25-35' }
            ]
        },
        {
            code: '16510', name: 'BLEEDING TIME', category: 'hematology',
            parameters: [{ code: '16510-1', name: 'Bleeding time', unit: 'min', range: '2-7' }]
        },
        {
            code: '16520', name: 'CLOTTING TIME', category: 'hematology',
            parameters: [{ code: '16520-1', name: 'Clotting time', unit: 'min', range: '5-15' }]
        },

        /* ═══ BLOOD BANK ═══ */
        {
            code: '16100', name: 'CROSS MATCHING TEST', category: 'bloodbank',
            parameters: [{ code: '16100-1', name: 'Cross match', unit: '', range: 'Compatible' }]
        },
        {
            code: '16110', name: 'ABO & RHESUS BLOOD GROUP', category: 'bloodbank',
            parameters: [{ code: '16110-1', name: 'Blood group', unit: '', range: '' }]
        },
        {
            code: '16120', name: 'COMPATIBILITY TESTS', category: 'bloodbank',
            parameters: [{ code: '16120-1', name: 'Compatibility', unit: '', range: 'Compatible' }]
        },
        {
            code: '16130', name: 'COOMBS TEST DIRECT', category: 'bloodbank',
            parameters: [{ code: '16130-1', name: 'Coombs direct', unit: '', range: 'Negative' }]
        },
        {
            code: '16131', name: 'COOMBS TEST INDIRECT', category: 'bloodbank',
            parameters: [{ code: '16131-1', name: 'Coombs indirect', unit: '', range: 'Negative' }]
        },

        /* ═══ BIOCHEMISTRY ═══ */
        {
            code: '13510', name: 'UREA', category: 'biochemistry',
            parameters: [{ code: '20001', name: 'UREA/BLOOD', unit: 'mmol/l', range: '3-9.2' }]
        },
        {
            code: '13511', name: 'CREATININE', category: 'biochemistry',
            parameters: [{ code: '20002', name: 'CREATININE/BLOOD', unit: 'µmol/l', range: '63.6-110.5' }]
        },
        {
            code: '13512', name: 'URIC ACID', category: 'biochemistry',
            parameters: [{ code: '13512-1', name: 'URIC ACID/BLOOD', unit: 'µmol/l', range: '200-420' }]
        },
        {
            code: '13513', name: 'SODIUM', category: 'biochemistry',
            parameters: [{ code: '20003', name: 'NA + (SODIUM)/BLOOD', unit: 'mmol/l', range: '135-145' }]
        },
        {
            code: '13514', name: 'POTASSIUM', category: 'biochemistry',
            parameters: [{ code: '20004', name: 'K + (POTASSIUM)/BLOOD', unit: 'mmol/l', range: '3.5-5.0' }]
        },
        {
            code: '13515', name: 'CHLORIDE', category: 'biochemistry',
            parameters: [{ code: '20006', name: 'CL - (CHLORURE)/BLOOD', unit: 'mmol/l', range: '98-107' }]
        },
        {
            code: '13516', name: 'CREATININE (URINE)', category: 'biochemistry',
            parameters: [{ code: '13516-1', name: 'CREATININE/URINE 24h', unit: 'mmol/24h', range: '8.8-17.6' }]
        },
        {
            code: '13520', name: 'URINE ALBUMIN/CREATININE RATIO', category: 'biochemistry',
            parameters: [{ code: '13520-1', name: 'Albumin/Creatinine ratio', unit: 'mg/mmol', range: '0-3' }]
        },
        {
            code: '13613', name: 'TRIGLYCERIDE', category: 'biochemistry',
            parameters: [{ code: '13613-1', name: 'TRIGLYCERIDE', unit: 'mmol/l', range: '0.4-1.7' }]
        },
        {
            code: '13615', name: 'GLUCOSE', category: 'biochemistry',
            parameters: [{ code: '13615-1', name: 'GLUCOSE (RANDOM)', unit: 'mmol/l', range: '3.9-7.8' }]
        },
        {
            code: '13616', name: 'GLUCOSE FASTING', category: 'biochemistry',
            parameters: [{ code: '20007', name: 'FASTING GLUCOSE/BLOOD', unit: 'mmol/l', range: '3.9-5.6' }]
        },
        {
            code: '13710', name: 'CRP QUANTITATIVE', category: 'biochemistry',
            parameters: [{ code: '40005', name: 'CRP (C-REACTIVE PROTEIN)', unit: 'mg/l', range: '0-5' }]
        },
        {
            code: '13711', name: 'RHEUMATOID FACTOR (RF)', category: 'biochemistry',
            parameters: [{ code: '13711-1', name: 'RHEUMATOID FACTOR (RF)', unit: 'IU/ml', range: '0-14' }]
        },
        {
            code: '13712', name: 'ASLO QUANTITATIVE', category: 'biochemistry',
            parameters: [{ code: '13712-1', name: 'ASLO', unit: 'IU/ml', range: '0-200' }]
        },
        {
            code: '13812', name: 'CREATININE KINASE-MB (CK-MB)', category: 'biochemistry',
            parameters: [{ code: '13812-1', name: 'CK-MB', unit: 'U/l', range: '0-25' }]
        },
        {
            code: '13813', name: 'CREATINE KINASE (CK)', category: 'biochemistry',
            parameters: [{ code: '13813-1', name: 'CREATINE KINASE (CK)', unit: 'U/l', range: '30-200' }]
        },
        {
            code: '13814', name: 'LACTATE DEHYDROGENASE (LDH)', category: 'biochemistry',
            parameters: [{ code: '13814-1', name: 'LDH', unit: 'U/l', range: '140-280' }]
        },
        {
            code: '13815', name: 'TROPONIN T', category: 'biochemistry', verify: true,
            parameters: [{ code: '13815-1', name: 'TROPONIN T', unit: 'ng/L', range: '0-14' }]
        },
        {
            code: '13912', name: 'CALCIUM TOTAL', category: 'biochemistry',
            parameters: [{ code: '13912-1', name: 'CALCIUM TOTAL', unit: 'mmol/l', range: '2.2-2.6' }]
        },
        {
            code: '13913', name: 'INORGANIC PHOSPHOROUS', category: 'biochemistry',
            parameters: [{ code: '13913-1', name: 'INORGANIC PHOSPHOROUS', unit: 'mmol/l', range: '0.8-1.45' }]
        },
        {
            code: '13915', name: 'SERUM IRON', category: 'biochemistry',
            parameters: [{ code: '13915-1', name: 'SERUM IRON', unit: 'µmol/l', range: '10.6-28.3' }]
        },
        {
            code: '13420', name: 'FERRITIN', category: 'biochemistry',
            parameters: [{ code: '13420-1', name: 'FERRITIN', unit: 'ng/ml', range: '30-400' }]
        },
        {
            code: '13430', name: 'UIBC', category: 'biochemistry',
            parameters: [{ code: '13430-1', name: 'UIBC', unit: 'µmol/l', range: '24-61' }]
        },
        {
            code: '13440', name: 'TRANSFERRIN', category: 'biochemistry',
            parameters: [{ code: '13440-1', name: 'TRANSFERRIN', unit: 'g/l', range: '2.0-3.6' }]
        },
        {
            code: '13260', name: 'SOLUBLE TRANSFERRIN RECEPTOR (sTfR)', category: 'biochemistry', verify: true,
            parameters: [{ code: '13260-1', name: 'sTfR', unit: 'mg/l', range: '2.2-5.0' }]
        },
        {
            code: '13411', name: 'SGOT/AST', category: 'biochemistry',
            parameters: [{ code: '20009', name: 'LIVER FUNCTION (SGOT/AST)', unit: 'U/l', range: '10-40' }]
        },
        {
            code: '13410', name: 'SGPT/ALT', category: 'biochemistry', verify: true,
            parameters: [{ code: '20008', name: 'LIVER FUNCTION (SGPT/ALT)', unit: 'U/l', range: '7-56' }]
        },
        {
            code: '13350', name: 'ZINC', category: 'biochemistry',
            parameters: [{ code: '13350-1', name: 'ZINC', unit: 'µmol/l', range: '10-18' }]
        },
        {
            code: '13954', name: '24H URINE PROTEIN', category: 'biochemistry',
            parameters: [{ code: '13954-1', name: '24H URINE PROTEIN', unit: 'g/24h', range: '0-0.15' }]
        },
        {
            code: '13955', name: 'SODIUM (24H URINE)', category: 'biochemistry',
            parameters: [{ code: '13955-1', name: 'SODIUM/URINE 24h', unit: 'mmol/24h', range: '40-220' }]
        },
        {
            code: '13956', name: 'POTASSIUM (24H URINE)', category: 'biochemistry',
            parameters: [{ code: '13956-1', name: 'POTASSIUM/URINE 24h', unit: 'mmol/24h', range: '25-125' }]
        },
        {
            code: '13963', name: 'URINE ALBUMIN QUANTITATIVE', category: 'biochemistry',
            parameters: [{ code: '13963-1', name: 'URINE ALBUMIN', unit: 'mg/24h', range: '0-30' }]
        },
        {
            code: '11120', name: 'TOTAL CO2', category: 'biochemistry',
            parameters: [{ code: '11120-1', name: 'TOTAL CO2', unit: 'mmol/l', range: '22-29' }]
        },
        {
            code: '11130', name: 'BICARBONATE (HCO3)', category: 'biochemistry',
            parameters: [{ code: '11130-1', name: 'BICARBONATE (HCO3)', unit: 'mmol/l', range: '22-29' }]
        },
        {
            code: '14200', name: 'CLINICAL CHEMISTRY PANEL', category: 'biochemistry', verify: true,
            parameters: [{ code: '14200-1', name: 'Clinical chemistry panel', unit: '', range: '' }]
        },
        {
            code: '15000', name: 'COMPLEMENTARY STUDIES', category: 'biochemistry', verify: true,
            parameters: [{ code: '15000-1', name: 'Complementary studies', unit: '', range: '' }]
        },
        {
            code: '28000', name: '28000 — NAME TO VERIFY', category: 'biochemistry', verify: true,
            parameters: [{ code: '28000-1', name: 'Result (name to verify)', unit: '', range: '' }]
        },

        /* ═══ IMMUNOLOGY ═══ */
        {
            code: '15100', name: 'SERUM PROTEIN ELECTROPHORESIS (SPEP)', category: 'immunology',
            parameters: [{ code: '15100-1', name: 'SPEP pattern', unit: '', range: 'Normal pattern' }]
        },
        {
            code: '15124', name: 'COMPLEMENT C3', category: 'immunology',
            parameters: [{ code: '15124-1', name: 'C3', unit: 'g/l', range: '0.9-1.8' }]
        },
        {
            code: '15125', name: 'COMPLEMENT C4', category: 'immunology',
            parameters: [{ code: '15125-1', name: 'C4', unit: 'g/l', range: '0.1-0.4' }]
        },
        {
            code: '24300', name: 'SPECIAL PROTEINS', category: 'immunology', verify: true,
            parameters: [{ code: '24300-1', name: 'Special proteins', unit: '', range: '' }]
        },

        /* ═══ SEROLOGY & VIROLOGY ═══ */
        {
            code: '20100', name: 'HEPATITIS MOLECULAR BIOLOGY', category: 'serology',
            parameters: [{ code: '20100-1', name: 'Hepatitis molecular biology', unit: '', range: '' }]
        },
        {
            code: '20110', name: 'HEPATITIS B VIRAL LOAD (HBV-VL)', category: 'serology',
            parameters: [{ code: '20110-1', name: 'HBV viral load', unit: 'IU/ml', range: 'Not detected' }]
        },
        {
            code: '20120', name: 'HEPATITIS C GENOTYPING', category: 'serology',
            parameters: [{ code: '20120-1', name: 'HCV genotype', unit: '', range: '' }]
        },
        {
            code: '20130', name: 'HEPATITIS C VIRAL LOAD (HCV-VL)', category: 'serology',
            parameters: [{ code: '20130-1', name: 'HCV viral load', unit: 'IU/ml', range: 'Not detected' }]
        },
        {
            code: '24105', name: 'CMV IgM', category: 'serology',
            parameters: [{ code: '24105-1', name: 'CMV IgM', unit: '', range: 'Negative' }]
        },
        {
            code: '24109', name: 'HBcAb', category: 'serology',
            parameters: [{ code: '24109-1', name: 'HBcAb', unit: '', range: 'Negative' }]
        },
        {
            code: '24110', name: 'HBeAb', category: 'serology',
            parameters: [{ code: '24110-1', name: 'HBeAb', unit: '', range: 'Negative' }]
        },
        {
            code: '24111', name: 'HBeAg', category: 'serology',
            parameters: [{ code: '24111-1', name: 'HBeAg', unit: '', range: 'Negative' }]
        },
        {
            code: '24112', name: 'HBsAb', category: 'serology',
            parameters: [{ code: '24112-1', name: 'HBsAb', unit: 'IU/l', range: '0-10' }]
        },
        {
            code: '24113', name: 'HBsAg', category: 'serology',
            parameters: [{ code: '40002', name: 'HBsAg (HEPATITIS B)', unit: '', range: 'Negative' }]
        },
        {
            code: '24114', name: 'HCV ANTIBODY', category: 'serology',
            parameters: [{ code: '40003', name: 'HCV ANTIBODY', unit: '', range: 'Negative' }]
        },
        {
            code: '24116', name: 'HIV ELISA', category: 'serology',
            parameters: [{ code: '40001', name: 'HIV 1/2 ANTIBODY/AG', unit: '', range: 'Negative' }]
        },
        {
            code: '24120', name: 'PREGNANCY TEST', category: 'serology',
            parameters: [{ code: '24120-1', name: 'Pregnancy test', unit: '', range: 'Negative' }]
        },
        {
            code: '24122', name: 'RUBELLA IgG QUANTITATIVE', category: 'serology',
            parameters: [{ code: '24122-1', name: 'Rubella IgG', unit: 'IU/ml', range: '0-10' }]
        },
        {
            code: '24123', name: 'RUBELLA IgM', category: 'serology',
            parameters: [{ code: '24123-1', name: 'Rubella IgM', unit: '', range: 'Negative' }]
        },
        {
            code: '24124', name: 'T3', category: 'serology',
            parameters: [{ code: '24124-1', name: 'T3', unit: 'nmol/l', range: '1.3-3.1' }]
        },
        {
            code: '24125', name: 'TOXOPLASMA IgG', category: 'serology',
            parameters: [{ code: '24125-1', name: 'Toxoplasma IgG', unit: 'IU/ml', range: '0-8' }]
        },
        {
            code: '24126', name: 'TOXOPLASMA IgM', category: 'serology', verify: true,
            parameters: [{ code: '24126-1', name: 'Toxoplasma IgM', unit: '', range: 'Negative' }]
        },
        {
            code: '28315', name: 'ANTI-Tg', category: 'serology',
            parameters: [{ code: '28315-1', name: 'Anti-Thyroglobulin (Anti-Tg)', unit: 'IU/ml', range: '0-115' }]
        },
        {
            code: '28316', name: 'ANTI-GAD', category: 'serology',
            parameters: [{ code: '28316-1', name: 'Anti-GAD', unit: 'IU/ml', range: '0-5' }]
        },
        {
            code: '28317', name: 'ANTI-IA2 Ab', category: 'serology',
            parameters: [{ code: '28317-1', name: 'Anti-IA2 Ab', unit: 'IU/ml', range: '0-10' }]
        },
        {
            code: '28318', name: 'EBV VCA IgG', category: 'serology',
            parameters: [{ code: '28318-1', name: 'EBV VCA IgG', unit: '', range: 'Negative' }]
        },
        {
            code: '28319', name: 'EBV VCA IgM', category: 'serology',
            parameters: [{ code: '28319-1', name: 'EBV VCA IgM', unit: '', range: 'Negative' }]
        },
        {
            code: '28320', name: 'SHBG (SEX HORMONE BINDING GLOBULIN)', category: 'serology',
            parameters: [{ code: '28320-1', name: 'SHBG', unit: 'nmol/l', range: '18-144' }]
        },
        {
            code: '28321', name: 'IGF-1', category: 'serology',
            parameters: [{ code: '28321-1', name: 'IGF-1', unit: 'ng/ml', range: '115-420' }]
        },
        {
            code: '28322', name: 'PEPSINOGEN', category: 'serology',
            parameters: [{ code: '28322-1', name: 'Pepsinogen', unit: 'µg/l', range: '30-165' }]
        },

        /* ═══ HORMONES ═══ */
        {
            code: '19101', name: 'ACTH', category: 'hormones',
            parameters: [{ code: '19101-1', name: 'ACTH', unit: 'pmol/l', range: '1.6-13.9' }]
        },
        {
            code: '19107', name: 'CORTISOL EVENING', category: 'hormones',
            parameters: [{ code: '19107-1', name: 'Cortisol (evening)', unit: 'nmol/l', range: '0-140' }]
        },
        {
            code: '19108', name: 'CORTISOL MORNING', category: 'hormones',
            parameters: [{ code: '19108-1', name: 'Cortisol (morning)', unit: 'nmol/l', range: '171-536' }]
        },
        {
            code: '19110', name: 'ESTRADIOL', category: 'hormones',
            parameters: [{ code: '19110-1', name: 'Estradiol', unit: 'pmol/l', range: '28-156' }]
        },
        {
            code: '19111', name: 'ESTROGEN (TOTAL)', category: 'hormones', verify: true,
            parameters: [{ code: '19111-1', name: 'Estrogen (total)', unit: 'pg/ml', range: '50-500' }]
        },
        {
            code: '19112', name: 'FREE T3', category: 'hormones',
            parameters: [{ code: '19112-1', name: 'Free T3', unit: 'pmol/l', range: '3.1-6.8' }]
        },
        {
            code: '19113', name: 'FREE T4', category: 'hormones',
            parameters: [{ code: '19113-1', name: 'Free T4', unit: 'pmol/l', range: '12-22' }]
        },
        {
            code: '19114', name: 'FSH', category: 'hormones',
            parameters: [{ code: '19114-1', name: 'FSH', unit: 'IU/l', range: '1.5-12.4' }]
        },
        {
            code: '19117', name: 'LH', category: 'hormones',
            parameters: [{ code: '19117-1', name: 'LH', unit: 'IU/l', range: '1.7-8.6' }]
        },
        {
            code: '19115', name: 'AMH (ANTI-MULLERIAN HORMONE)', category: 'hormones', verify: true,
            parameters: [{ code: '19115-1', name: 'AMH', unit: 'ng/ml', range: '0.7-9' }]
        },
        {
            code: '19124', name: 'TOTAL THYROXINE (T4)', category: 'hormones',
            parameters: [{ code: '19124-1', name: 'Total T4', unit: 'nmol/l', range: '66-181' }]
        },
        {
            code: '19125', name: 'TSH', category: 'hormones',
            parameters: [{ code: '19125-1', name: 'TSH', unit: 'mIU/l', range: '0.4-4.0' }]
        },
        {
            code: '19132', name: 'ANTI-TSHR RECEPTOR (TRAb)', category: 'hormones',
            parameters: [{ code: '19132-1', name: 'TRAb', unit: 'IU/l', range: '0-1.75' }]
        },

        /* ═══ TUMOR MARKERS ═══ */
        {
            code: '26101', name: 'PROSTATE SPECIFIC ANTIGEN TOTAL (TPSA)', category: 'tumor',
            parameters: [{ code: '26101-1', name: 'PSA TOTAL', unit: 'ng/ml', range: '0-4' }]
        },
        {
            code: '26102', name: 'ALPHA-FETOPROTEIN (AFP)', category: 'tumor',
            parameters: [{ code: '26102-1', name: 'AFP', unit: 'ng/ml', range: '0-7' }]
        },
        {
            code: '26103', name: 'CA-125', category: 'tumor',
            parameters: [{ code: '26103-1', name: 'CA-125', unit: 'U/ml', range: '0-35' }]
        },
        {
            code: '26104', name: 'CA19-9', category: 'tumor',
            parameters: [{ code: '26104-1', name: 'CA19-9', unit: 'U/ml', range: '0-37' }]
        },
        {
            code: '26105', name: 'CA15-3', category: 'tumor',
            parameters: [{ code: '26105-1', name: 'CA15-3', unit: 'U/ml', range: '0-30' }]
        },
        {
            code: '26106', name: 'CEA (CARCINOEMBRYONIC ANTIGEN)', category: 'tumor',
            parameters: [{ code: '26106-1', name: 'CEA', unit: 'ng/ml', range: '0-5' }]
        },
        {
            code: '26107', name: 'PROSTATE SPECIFIC ANTIGEN FREE (FPSA)', category: 'tumor',
            parameters: [{ code: '26107-1', name: 'PSA FREE', unit: 'ng/ml', range: '0-1' }]
        },
        {
            code: '26108', name: 'CA72-4', category: 'tumor',
            parameters: [{ code: '26108-1', name: 'CA72-4', unit: 'U/ml', range: '0-6' }]
        },
        {
            code: '18300', name: 'HER2/NEU', category: 'tumor',
            parameters: [{ code: '18300-1', name: 'HER2/neu', unit: '', range: 'Negative' }]
        },
        {
            code: '18310', name: 'TACROLIMUS (FK506)', category: 'tumor',
            parameters: [{ code: '18310-1', name: 'Tacrolimus (FK506)', unit: 'ng/ml', range: '5-15' }]
        },
        {
            code: '18124', name: '18124 — NAME TO VERIFY', category: 'tumor', verify: true,
            parameters: [{ code: '18124-1', name: 'Result (name to verify)', unit: '', range: '' }]
        },

        /* ═══ CYTOLOGY & PATHOLOGY ═══ */
        {
            code: '18110', name: 'BIOPSY', category: 'cytology',
            parameters: [{ code: '18110-1', name: 'Histopathology report', unit: '', range: '' }]
        },
        {
            code: '18120', name: 'FINE NEEDLE ASPIRATION', category: 'cytology',
            parameters: [{ code: '18120-1', name: 'Cytology report', unit: '', range: '' }]
        },
        {
            code: '31000', name: 'CYTOLOGY OF FLUIDS', category: 'cytology', verify: true,
            parameters: [{ code: '31000-1', name: 'Cytology report', unit: '', range: '' }]
        },
        {
            code: '31200', name: 'PAP SMEAR (CERVICO-VAGINAL)', category: 'cytology',
            parameters: [{ code: '31200-1', name: 'Pap smear report', unit: '', range: '' }]
        },

        /* ═══ MICROBIOLOGY ═══ */
        {
            code: '10310', name: 'CRYPTOCOCCUS AG (CRAG)', category: 'microbiology',
            parameters: [{ code: '10310-1', name: 'Cryptococcus Ag (CRAG)', unit: '', range: 'Negative' }]
        },
        {
            code: '10317', name: 'INDIAN INK (CSF)', category: 'microbiology',
            parameters: [{ code: '10317-1', name: 'Indian ink (CSF)', unit: '', range: 'Negative' }]
        },
        {
            code: '10680', name: 'AURAMINE STAINING (URINE)', category: 'microbiology',
            parameters: [{ code: '10680-1', name: 'Auramine staining', unit: '', range: 'Negative' }]
        },
        {
            code: '10820', name: 'GRAM STAIN', category: 'microbiology',
            parameters: [{ code: '10820-1', name: 'Gram stain', unit: '', range: 'No organisms seen' }]
        },
        {
            code: '10700', name: 'BACTERIOLOGY SWAB (CULTURE & ANTIBIOGRAM)', category: 'microbiology',
            parameters: [
                { code: '10700-1', name: 'Culture', unit: '', range: 'No growth' },
                { code: '10700-2', name: 'Antibiogram', unit: '', range: '' }
            ]
        },
        {
            code: '10701', name: 'CERVICAL SWAB (CULTURE & ANTIBIOGRAM)', category: 'microbiology', verify: true,
            parameters: [{ code: '10701-1', name: 'Culture', unit: '', range: 'No growth' }]
        },
        {
            code: '10702', name: 'EAR SWAB (CULTURE & ANTIBIOGRAM)', category: 'microbiology', verify: true,
            parameters: [{ code: '10702-1', name: 'Culture', unit: '', range: 'No growth' }]
        },
        {
            code: '10703', name: 'EYE SWAB (CULTURE & ANTIBIOGRAM)', category: 'microbiology', verify: true,
            parameters: [{ code: '10703-1', name: 'Culture', unit: '', range: 'No growth' }]
        },
        {
            code: '10704', name: 'THROAT SWAB (CULTURE & ANTIBIOGRAM)', category: 'microbiology', verify: true,
            parameters: [{ code: '10704-1', name: 'Culture', unit: '', range: 'No growth' }]
        },
        {
            code: '21100', name: 'MYCOLOGY (CULTURE & ANTIBIOGRAM)', category: 'microbiology',
            parameters: [{ code: '21100-1', name: 'Culture', unit: '', range: 'No growth' }]
        },
        {
            code: '21110', name: 'DERMAL SKIN CULTURE', category: 'microbiology',
            parameters: [{ code: '21110-1', name: 'Culture', unit: '', range: 'No growth' }]
        },
        {
            code: '21130', name: 'HAIR CULTURE', category: 'microbiology',
            parameters: [{ code: '21130-1', name: 'Culture', unit: '', range: 'No growth' }]
        },
        {
            code: '11110', name: 'NAIL CULTURE', category: 'microbiology',
            parameters: [{ code: '11110-1', name: 'Culture', unit: '', range: 'No growth' }]
        },
        {
            code: '10610', name: 'COMPLEMENTARY MOLECULAR BIOLOGY', category: 'microbiology', verify: true,
            parameters: [{ code: '10610-1', name: 'Molecular biology result', unit: '', range: '' }]
        },
        {
            code: '10650', name: '10650 — NAME TO VERIFY', category: 'microbiology', verify: true,
            parameters: [{ code: '10650-1', name: 'Result (name to verify)', unit: '', range: '' }]
        },
        {
            code: '10824', name: '10824 — NAME TO VERIFY', category: 'microbiology', verify: true,
            parameters: [{ code: '10824-1', name: 'Result (name to verify)', unit: '', range: '' }]
        },
        {
            code: '21150', name: '21150 — NAME TO VERIFY', category: 'microbiology', verify: true,
            parameters: [{ code: '21150-1', name: 'Result (name to verify)', unit: '', range: '' }]
        },
        {
            code: '21260', name: '21260 — NAME TO VERIFY', category: 'microbiology', verify: true,
            parameters: [{ code: '21260-1', name: 'Result (name to verify)', unit: '', range: '' }]
        },
        {
            code: 'GENEXPERT-SP', name: 'GENEXPERT TB (SPUTUM)', category: 'microbiology', verify: true,
            parameters: [{ code: 'GENEXPERT-SP-1', name: 'MTB detected', unit: '', range: 'Not detected' }]
        },
        {
            code: 'GENEXPERT-UR', name: 'GENEXPERT (URINE)', category: 'microbiology', verify: true,
            parameters: [{ code: 'GENEXPERT-UR-1', name: 'MTB detected', unit: '', range: 'Not detected' }]
        },
        {
            code: 'GENEXPERT-FNA', name: 'GENEXPERT (FNA)', category: 'microbiology', verify: true,
            parameters: [{ code: 'GENEXPERT-FNA-1', name: 'MTB detected', unit: '', range: 'Not detected' }]
        },

        /* ═══ BODY FLUIDS ═══ */
        {
            code: '10901', name: 'PLEURAL FLUID (APPEARANCE, MICROSCOPY, CULTURE)', category: 'fluids', verify: true,
            parameters: [
                { code: '10901-1', name: 'Appearance', unit: '', range: '' },
                { code: '10901-2', name: 'Microscopy & Gram stain', unit: '', range: 'No organisms seen' },
                { code: '10901-3', name: 'Culture', unit: '', range: 'No growth' }
            ]
        },
        {
            code: '10902', name: 'PERITONEAL FLUID (APPEARANCE, MICROSCOPY, CULTURE)', category: 'fluids', verify: true,
            parameters: [
                { code: '10902-1', name: 'Appearance', unit: '', range: '' },
                { code: '10902-2', name: 'Microscopy & Gram stain', unit: '', range: 'No organisms seen' },
                { code: '10902-3', name: 'Culture', unit: '', range: 'No growth' }
            ]
        },
        {
            code: '10903', name: 'PERICARDIAL FLUID (APPEARANCE, MICROSCOPY, CULTURE)', category: 'fluids', verify: true,
            parameters: [
                { code: '10903-1', name: 'Appearance', unit: '', range: '' },
                { code: '10903-2', name: 'Microscopy & Gram stain', unit: '', range: 'No organisms seen' },
                { code: '10903-3', name: 'Culture', unit: '', range: 'No growth' }
            ]
        },
        {
            code: '10904', name: 'ARTICULAR FLUID (APPEARANCE, MICROSCOPY, CULTURE)', category: 'fluids', verify: true,
            parameters: [
                { code: '10904-1', name: 'Appearance', unit: '', range: '' },
                { code: '10904-2', name: 'Microscopy & Gram stain', unit: '', range: 'No organisms seen' },
                { code: '10904-3', name: 'Culture', unit: '', range: 'No growth' }
            ]
        },
        {
            code: '10905', name: 'CSF ANALYSIS (APPEARANCE, MICROSCOPY, CULTURE)', category: 'fluids', verify: true,
            parameters: [
                { code: '10905-1', name: 'Appearance', unit: '', range: '' },
                { code: '10905-2', name: 'Microscopy & Gram stain', unit: '', range: 'No organisms seen' },
                { code: '10905-3', name: 'Culture', unit: '', range: 'No growth' }
            ]
        },
        {
            code: '10906', name: 'TRACHEAL ASPIRATE (CULTURE & ANTIBIOGRAM)', category: 'fluids', verify: true,
            parameters: [{ code: '10906-1', name: 'Culture', unit: '', range: 'No growth' }]
        },
        {
            code: '10907', name: 'BRONCHOALVEOLAR LAVAGE (CULTURE & ANTIBIOGRAM)', category: 'fluids', verify: true,
            parameters: [{ code: '10907-1', name: 'Culture', unit: '', range: 'No growth' }]
        },

        /* ═══ PARASITOLOGY ═══ */
        {
            code: '50001', name: 'MALARIA PARASITE (MP)', category: 'parasitology',
            parameters: [{ code: '50001', name: 'MALARIA PARASITE (MP)', unit: '', range: 'Negative' }]
        },
        {
            code: '22121', name: 'BLOOD SMEAR THICK (PARASITEMIA)', category: 'parasitology',
            parameters: [{ code: '22121-1', name: 'Parasitemia', unit: '%', range: '0' }]
        },
        {
            code: '22122', name: 'THIN SMEAR (BORRELIA)', category: 'parasitology',
            parameters: [{ code: '22122-1', name: 'Borrelia (thin smear)', unit: '', range: 'Not seen' }]
        },
        {
            code: '50004', name: 'STOOL EXAM (OVA & PARASITES)', category: 'parasitology',
            parameters: [{ code: '50004', name: 'STOOL OVA & CYSTS', unit: '', range: 'Negative' }]
        },
        {
            code: '22261', name: 'STOOL OCCULT BLOOD', category: 'parasitology', verify: true,
            parameters: [{ code: '22261-1', name: 'Occult blood', unit: '', range: 'Negative' }]
        },
        {
            code: '22123', name: 'MICROFILARIA', category: 'parasitology', verify: true,
            parameters: [{ code: '22123-1', name: 'Microfilaria', unit: '', range: 'Not seen' }]
        },
        {
            code: '16900', name: 'BONE MARROW ASPIRATE', category: 'parasitology', verify: true,
            parameters: [{ code: '16900-1', name: 'Bone marrow report', unit: '', range: '' }]
        },

        /* ═══ URINE & EXISTING CULTURES (kept for compatibility) ═══ */
        {
            code: '50002', name: 'BLOOD CULTURE & SENSITIVITY', category: 'microbiology',
            parameters: [{ code: '50002', name: 'BLOOD CULTURE & SENSITIVITY', unit: '', range: 'No growth' }]
        },
        {
            code: '50003', name: 'URINE CULTURE & SENSITIVITY', category: 'microbiology',
            parameters: [{ code: '50003', name: 'URINE CULTURE & SENSITIVITY', unit: '', range: 'No growth' }]
        },
        {
            code: '40004', name: 'SYPHILIS RPR/VDRL', category: 'serology',
            parameters: [{ code: '40004', name: 'SYPHILIS RPR/VDRL', unit: '', range: 'Negative' }]
        },
        {
            code: '40006', name: 'WIDAL TEST (SALMONELLA)', category: 'serology',
            parameters: [{ code: '40006', name: 'WIDAL TEST (SALMONELLA)', unit: '', range: 'Negative' }]
        },
        {
            code: '40007', name: 'H. PYLORI AG/AB', category: 'serology',
            parameters: [{ code: '40007', name: 'H. PYLORI AG/AB', unit: '', range: 'Negative' }]
        },
        {
            code: '60001', name: 'URINE PROTEIN/ALBUMIN', category: 'biochemistry',
            parameters: [{ code: '60001', name: 'URINE PROTEIN/ALBUMIN', unit: '', range: 'Negative' }]
        },
        {
            code: '60002', name: 'URINE GLUCOSE', category: 'biochemistry',
            parameters: [{ code: '60002', name: 'URINE GLUCOSE', unit: '', range: 'Negative' }]
        },
        {
            code: '60003', name: 'URINE KETONES', category: 'biochemistry',
            parameters: [{ code: '60003', name: 'URINE KETONES', unit: '', range: 'Negative' }]
        },
        {
            code: '60004', name: 'URINE WBC / LEUKOCYTES', category: 'biochemistry',
            parameters: [{ code: '60004', name: 'URINE WBC / LEUKOCYTES', unit: '/HPF', range: '0-5' }]
        },

        /* ═══ VITAMINS ═══ */
        {
            code: '27110', name: 'FOLIC ACID (VIT B9)', category: 'vitamins',
            parameters: [{ code: '27110-1', name: 'Folic acid (Vit B9)', unit: 'ng/ml', range: '3-20' }]
        },
        {
            code: '27140', name: 'VIT B12 (CYANOCOBALAMIN)', category: 'vitamins',
            parameters: [{ code: '27140-1', name: 'Vit B12', unit: 'pg/ml', range: '200-900' }]
        },

        /* ═══ GENETICS & OTHER ═══ */
        {
            code: '25001', name: 'KARYOTYPE', category: 'genetics',
            parameters: [{ code: '25001-1', name: 'Karyotype', unit: '', range: 'Normal 46,XX / 46,XY' }]
        },
        {
            code: '31100', name: 'SEMEN ANALYSIS', category: 'genetics', verify: true,
            parameters: [{ code: '31100-1', name: 'Semen analysis report', unit: '', range: '' }]
        }
    ];

    /* ── public API ── */
    function list() { return LAB_CATALOG.slice(); }

    function byCode(code) {
        var wanted = String(code || '').toUpperCase();
        for (var i = 0; i < LAB_CATALOG.length; i++) {
            if (String(LAB_CATALOG[i].code || '').toUpperCase() === wanted) return LAB_CATALOG[i];
        }
        return null;
    }

    function findByName(name) {
        var wanted = String(name || '').toLowerCase().trim();
        if (!wanted) return null;
        for (var i = 0; i < LAB_CATALOG.length; i++) {
            var n = String(LAB_CATALOG[i].name || '').toLowerCase();
            if (n === wanted) return LAB_CATALOG[i];
        }
        for (var j = 0; j < LAB_CATALOG.length; j++) {
            var n2 = String(LAB_CATALOG[j].name || '').toLowerCase();
            if (n2 && (n2.indexOf(wanted) !== -1 || wanted.indexOf(n2) !== -1)) return LAB_CATALOG[j];
        }
        return null;
    }

    function parameterByCode(code) {
        var wanted = String(code || '').toUpperCase();
        for (var i = 0; i < LAB_CATALOG.length; i++) {
            var params = LAB_CATALOG[i].parameters || [];
            for (var j = 0; j < params.length; j++) {
                if (String(params[j].code || '').toUpperCase() === wanted) return params[j];
            }
        }
        return null;
    }

    function categories() {
        return CATEGORY_ORDER.slice();
    }

    function categoryLabel(id) {
        return CATEGORY_LABELS[id] || String(id || '');
    }

    function defaultPrice(exam) {
        return Number(exam && exam.price) > 0 ? Number(exam.price) : PLACEHOLDER_PRICE;
    }

    function count() { return LAB_CATALOG.length; }

    window.pcLabCatalog = {
        list: list,
        byCode: byCode,
        findByName: findByName,
        parameterByCode: parameterByCode,
        categories: categories,
        categoryLabel: categoryLabel,
        defaultPrice: defaultPrice,
        count: count
    };
})();
