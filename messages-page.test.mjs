import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('/home/user/repo3/messages.html', 'utf8');
const orders = fs.readFileSync('/home/user/repo3/pclinic-orders.js', 'utf8');

test('Messages page supports specific-staff and role-broadcast compose modes', () => {
  assert.match(html, /Specific Staff/);
  assert.match(html, /Role Broadcast/);
  assert.match(html, /id="msgDirectRole"/);
  assert.match(html, /id="msgDirectStaff"/);
  assert.match(html, /All Doctors/);
  assert.match(html, /All Nurses/);
  assert.match(html, /id="replyBox"/);
  assert.match(html, /reply goes back to the original sender/i);
});

test('Embedded Message Center strips shared patient bars and avoids pclinic-file injection', () => {
  assert.match(html, /q\.get\('embedded'\)==='1'/);
  assert.match(html, /data-embedded/);
  assert.match(html, /#pcMasterHeader/);
  assert.match(html, /#pc_common_demo_bar/);
  assert.match(html, /#dcBar/);
  assert.doesNotMatch(html, /pclinic-file\.js/);
});

test('Messages page loads active staff directory from the common server users collection', () => {
  assert.match(html, /collection\(db,'users'\)/);
  assert.match(html, /where\('active','==',true\)/);
  assert.match(html, /staffRows\.push\(/);
  assert.match(html, /renderDirectStaffOptions\(/);
});

test('Messages page sends direct private staff messages and role broadcasts', () => {
  assert.match(html, /audience:'staff'/);
  assert.match(html, /toRoles:\[\]/);
  assert.match(html, /toStaffId:target\.id/);
  assert.match(html, /toStaffName:target\.name/);
  assert.match(html, /toRole:target\.role/);
  assert.match(html, /audience:'role'/);
  assert.match(html, /toRoles:roles/);
});

test('Messages page can reply directly to the original sender', () => {
  assert.match(html, /window\.replyToMessage=function\(messageId\)/);
  assert.match(html, /replyState=\{/);
  assert.match(html, /toStaffId:String\(m\.fromId\|\|'\'\)/);
  assert.match(html, /toStaffName:String\(m\.fromName\|\|'Staff'\)/);
  assert.match(html, /toRole:String\(m\.fromRole\|\|'\'\)/);
  assert.match(html, /Replying to /);
});

test('Messages page action controls use a simplified Apple palette', () => {
  assert.match(html, /rgba\(10,132,255,.06\)/);
  assert.match(html, /rgba\(94,92,230,.045\)/);
  assert.match(html, /modebtn\.on\{background:linear-gradient\(180deg,rgba\(10,132,255,.12\),rgba\(10,132,255,.07\)\)/);
  assert.match(html, /quick button\{[^}]*background:rgba\(255,255,255,.92\)/);
  assert.match(html, /tabs\{[^}]*background:rgba\(120,120,128,.12\)/);
  assert.match(html, /msg \.actions button\.read\{background:rgba\(120,120,128,.12\);color:#374151\}/);
  assert.doesNotMatch(html, /rgba\(52,199,89,.05\)/);
  assert.doesNotMatch(html, /msg \.actions button\.read\{background:#eefbf2;color:#177a37\}/);
});

test('Shared message engine syncs incoming and sent messages from the common server', () => {
  assert.match(orders, /var snapshots = \{ role: \[\], staff: \[\], sent: \[\] \}/);
  assert.match(orders, /where\('fromId', '==', staff\.id\)/);
  assert.match(orders, /function getSentMessages\(\)/);
  assert.match(orders, /function getAllMessages\(\)/);
  assert.match(orders, /sent: getSentMessages/);
  assert.match(orders, /all: getAllMessages/);
});

test('Shared message engine carries direct-recipient and thread metadata', () => {
  assert.match(orders, /toStaffName: msg\.toStaffName \|\| ''/);
  assert.match(orders, /toRole: msg\.toRole \|\| ''/);
  assert.match(orders, /audience: msg\.audience \|\| \(msg\.toStaffId \? 'staff' : 'role'\)/);
  assert.match(orders, /threadId: msg\.threadId \|\| uid\('thread'\)/);
  assert.match(orders, /replyToId: msg\.replyToId \|\| ''/);
});
