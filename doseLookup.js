/* PClinic doseLookup — emergency shutdown.
   Deploy this function to replace any previously deployed clinical dosing
   endpoint until formal clinical validation and role-based authorization are
   complete. */
const functions = require('firebase-functions');

exports.doseLookup = functions.https.onCall(async () => {
    throw new functions.https.HttpsError(
        'failed-precondition',
        'Clinical dose lookup is disabled pending formal clinical and pharmacy validation.'
    );
});
