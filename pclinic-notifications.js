/* Server-backed role/staff notifications shared by hospital dashboards. */
(function(){
'use strict';
var started=false, items=[];
function staff(){return window.currentStaff||null;}
function renderPanel(){var list=document.getElementById('notifList'),count=document.getElementById('notifCount');if(count)count.textContent=String(items.filter(function(n){return !n.read;}).length);if(!list)return;list.replaceChildren();if(!items.length){var empty=document.createElement('div');empty.style.cssText='padding:24px;text-align:center;color:#8e8e93';empty.textContent='No server notifications';list.appendChild(empty);return;}items.slice(0,50).forEach(function(n){var row=document.createElement('div');row.className='notif-item'+(!n.read?' unread':'');row.dataset.id=n.id;var icon=document.createElement('div');icon.className='notif-icon notif-info';var i=document.createElement('i');i.className='ti '+(n.type==='appointment'?'ti-calendar-event':n.type==='surgery'?'ti-scalpel':'ti-bell');icon.appendChild(i);var body=document.createElement('div');body.className='notif-body';var text=document.createElement('div');text.className='notif-text';text.textContent=String(n.title||n.message||'Notification');var sub=document.createElement('div');sub.className='notif-time';sub.textContent=String(n.message||'');body.appendChild(text);body.appendChild(sub);row.appendChild(icon);row.appendChild(body);list.appendChild(row);});}
function emit(newItems){window.pclinicNotifications=items.slice();renderPanel();window.dispatchEvent(new CustomEvent('pclinicNotificationsUpdated',{detail:{items:items.slice(),newItems:newItems||[]}}));}
function start(){
 if(started||!window.firebaseDB||!window.firebaseFunctions||!staff())return;
 started=true;var f=window.firebaseFunctions,s=staff(),role=String(s.role||'').toLowerCase(),sid=String(s.staffId||s.id||'');
 var seen={};
 function consume(snap){var fresh=[];snap.forEach(function(ds){var d=ds.data()||{};d.id=d.id||ds.id;var target=String(d.targetStaffName||'').trim().toLowerCase(),me=String((staff()&&staff().name)||'').trim().toLowerCase();if(target&&me&&target!==me)return;if(!seen[d.id])fresh.push(d);seen[d.id]=true;});items=Object.keys(seen).map(function(id){var hit=null;snap.forEach(function(ds){if((ds.data().id||ds.id)===id)hit=Object.assign({id:id},ds.data());});return hit;}).filter(Boolean).concat(items.filter(function(x){return !seen[x.id];}));items.sort(function(a,b){return String(b.createdAt&&b.createdAt.toDate?b.createdAt.toDate().toISOString():b.createdAt||'').localeCompare(String(a.createdAt&&a.createdAt.toDate?a.createdAt.toDate().toISOString():a.createdAt||''));});if(fresh.length){fresh.forEach(function(n){if(window.showToast)window.showToast('🔔 '+String(n.title||n.message||'New notification'),'info');});}emit(fresh);}
 try{
  if(role)f.onSnapshot(f.query(f.collection(window.firebaseDB,'notifications'),f.where('toRoles','array-contains',role)),consume,function(e){console.warn('Role notifications:',e);});
  if(sid)f.onSnapshot(f.query(f.collection(window.firebaseDB,'notifications'),f.where('toStaffId','==',sid)),consume,function(e){console.warn('Staff notifications:',e);});
 }catch(e){console.warn('Notifications unavailable:',e);}
}
window.pclinicStartNotifications=start;
window.addEventListener('firebaseReady',function(){setTimeout(start,0);});
window.addEventListener('pclinicStaffReady',start);
setTimeout(start,1200);
})();
