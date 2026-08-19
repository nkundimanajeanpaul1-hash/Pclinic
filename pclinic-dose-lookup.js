/* PClinic WHO dose lookup UI — disabled pending clinical validation. */
(function () {
    'use strict';
    var message = 'Clinical dose lookup is disabled pending formal clinical and pharmacy validation.';
    function disabled() {
        if (window.pcToast) window.pcToast(message, 'warning', 7000);
        else if (window.showToast) window.showToast(message, 'warning', 7000);
        else window.alert(message);
        return Promise.reject(new Error(message));
    }
    window.pcDoseLookup = Object.freeze({ open: disabled, call: disabled, disabled: true });
})();
