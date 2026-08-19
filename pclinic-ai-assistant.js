/* ============================================================
   PCLINIC CLINICAL DECISION SUPPORT — DISABLED

   Emergency safety control: the previous browser-side engine generated
   diagnosis-specific medication doses and described them as definitive WHO
   protocols without a validated clinical-governance process. It must not be
   used for patient care.

   Keep this compatibility stub so older pages fail closed instead of throwing
   an error or silently inserting a treatment plan.
   ============================================================ */
(function () {
    'use strict';

    var MESSAGE =
        'Clinical AI treatment recommendations are temporarily disabled for patient safety. ' +
        'Use approved hospital guidelines and obtain review from a qualified clinician or pharmacist.';

    function notifyDisabled() {
        if (typeof window.pcToast === 'function') {
            window.pcToast(MESSAGE, 'warning', 7000);
            return;
        }
        if (typeof window.showToast === 'function') {
            window.showToast(MESSAGE, 'warning', 7000);
            return;
        }
        window.alert(MESSAGE);
    }

    function generate() {
        notifyDisabled();
        return '';
    }

    function openModal() {
        notifyDisabled();
        // Deliberately never invoke the approval callback.
        return false;
    }

    function triggerFromForm() {
        notifyDisabled();
        return false;
    }

    window.pcAIAssistant = Object.freeze({
        disabled: true,
        generate: generate,
        openModal: openModal,
        triggerFromForm: triggerFromForm,
        extractPatientContext: function () { return {}; },
        generateDiagnosticQuestions: function () { return []; }
    });

    console.warn('PClinic clinical AI is disabled pending formal clinical validation.');
})();
