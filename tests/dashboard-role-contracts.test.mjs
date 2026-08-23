import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const contracts={
 'reception-dashboard.html':'reception',
 'doctor-dashboard.html':'doctor',
 'cashier-dashboard.html':'cashier',
 'nurse-dashboard.html':'nurse',
 'beds-dashboard.html':'beds',
 'theater-dashboard.html':'theater'
};
for(const [file,role] of Object.entries(contracts)){
 test(`${file} requires ${role} authentication`,async()=>{
  const html=await readFile(resolve(root,file),'utf8');
  assert.match(html,new RegExp(`requireAuth\\(\\[['\"]${role}['\"]`));
  assert.match(html,/firebase-config\.js/);
  assert.match(html,/auth-guard\.js/);
 });
}
test('new patient registration preserves the complete approved schema',async()=>{
 const source=await readFile(resolve(root,'patient-data.js'),'utf8');
 assert.match(source,/safeRegistrationData\s*=\s*\{\s*\.\.\.\(patientData/);
 for(const field of ['visitType','patientType','referralSource','arrivalMode','archiveCode','personId','bloodGroup','allergies','consent','guardianNationalId','birthCertificate','caretakerName']){
  const reception=await readFile(resolve(root,'reception-dashboard.html'),'utf8');
  assert.match(reception,new RegExp(`\\b${field}\\b`));
 }
});

test('cross-role server integrations are loaded by consumers',async()=>{
 const doctor=await readFile(resolve(root,'doctor-dashboard.html'),'utf8');
 const theater=await readFile(resolve(root,'theater-dashboard.html'),'utf8');
 const cashier=await readFile(resolve(root,'cashier-dashboard.html'),'utf8');
 assert.match(doctor,/pclinic-notifications\.js/);
 assert.match(theater,/pclinic-notifications\.js/);
 assert.match(cashier,/pclinic-notifications\.js/);
 assert.match(cashier,/billing-patient-directory\.js/);
});
