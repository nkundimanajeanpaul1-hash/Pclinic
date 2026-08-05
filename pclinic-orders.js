/* ============================================================
   PCLINIC — ORDERS, BILLING, TARIFF & MESSAGING
   Load AFTER patient-data.js on every page:

     <script src="pclinic-orders.js" defer></script>

   This is the shared spine that makes departments talk to each other.
   Before this, a doctor's lab request was written into the patient
   object and never read by anyone — the lab dashboard never looked.

   ONE order stream, every department watches the slice it cares about:

     patients/{id}/orders/{orderId}
        type    lab | imaging | prescription | procedure | referral
        dept    lab | radiology | pharmacy | theatre | physio | nursing
        status  pending -> in-progress -> completed | cancelled
   ============================================================ */
(function () {
    'use strict';

    var ORDERS_KEY  = 'pclinic_orders';
    var BILLS_KEY   = 'pclinic_bills';
    var MSGS_KEY    = 'pclinic_messages';
    var TARIFF_KEY  = 'pclinic_tariff';

    /* ══════════════════════════════════════════
       LOCAL STORE (mirrors Firestore, works offline)
       ══════════════════════════════════════════ */
    function read(k, fb) {
        try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
        catch (e) { return fb; }
    }
    function write(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); return true; }
        catch (e) { console.warn('[pclinic] storage failed:', e); return false; }
    }
    function uid(p) {
        return (p || 'id') + '-' + Date.now().toString(36) + '-' +
               Math.random().toString(36).slice(2, 7);
    }
    function who() {
        var s = window.currentStaff || {};
        return { id: s.staffId || '', name: s.name || 'Unknown', role: s.role || '' };
    }
    function emit(name, detail) {
        window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    }
    // Push to Firestore when available. Never blocks the UI — the local
    // write already happened, so an offline doctor keeps working.
    function sync(coll, id, data) {
        try {
            if (!window.firebaseDB || !window.firebaseFunctions) return;
            var f = window.firebaseFunctions;
            f.setDoc(f.doc(window.firebaseDB, coll, id), data)
             .catch(function (e) { console.warn('[pclinic] sync deferred:', e.message); });
        } catch (e) {}
    }


    /* ══════════════════════════════════════════
       1. TARIFF — editable service price list (RWF)
       ══════════════════════════════════════════
       Placeholder prices. Admin can edit them in the app; nothing here
       is hard-coded into logic, so changing a number never breaks code.
    */
    var DEFAULT_TARIFF = [
        // Consultations
        { code:'CONS-GEN',  name:'General Consultation',       dept:'consultation', price:5000  },
        { code:'CONS-SPEC', name:'Specialist Consultation',    dept:'consultation', price:15000 },
        { code:'CONS-FU',   name:'Follow-up Visit',            dept:'consultation', price:3000  },
        { code:'CONS-EMG',  name:'Emergency Consultation',     dept:'consultation', price:10000 },
        // Procedures
        { code:'PROC-DRESS',name:'Wound Dressing',             dept:'procedure', price:4000  },
        { code:'PROC-SUT',  name:'Suturing (simple)',          dept:'procedure', price:12000 },
        { code:'PROC-SUTC', name:'Suturing (complex)',         dept:'procedure', price:25000 },
        { code:'PROC-INJ',  name:'Injection (IM/IV)',          dept:'procedure', price:2000  },
        { code:'PROC-CANN', name:'IV Cannulation',             dept:'procedure', price:3000  },
        { code:'PROC-NEB',  name:'Nebulisation',               dept:'procedure', price:5000  },
        { code:'PROC-CATH', name:'Urinary Catheterisation',    dept:'procedure', price:8000  },
        { code:'PROC-ECG',  name:'ECG',                        dept:'procedure', price:10000 },
        { code:'PROC-PLAS', name:'Plaster / Cast Application', dept:'procedure', price:20000 },
        { code:'PROC-INC',  name:'Incision & Drainage',        dept:'procedure', price:15000 },
        { code:'PROC-CIRC', name:'Circumcision',               dept:'procedure', price:35000 },
        { code:'PROC-BIOP', name:'Biopsy',                     dept:'procedure', price:30000 },
        // Laboratory
        { code:'LAB-CBC',   name:'Complete Blood Count',       dept:'lab', price:6000  },
        { code:'LAB-MAL',   name:'Malaria RDT',                dept:'lab', price:3000  },
        { code:'LAB-GLU',   name:'Blood Glucose',              dept:'lab', price:2500  },
        { code:'LAB-UA',    name:'Urinalysis',                 dept:'lab', price:3500  },
        { code:'LAB-LFT',   name:'Liver Function Test',        dept:'lab', price:12000 },
        { code:'LAB-RFT',   name:'Renal Function Test',        dept:'lab', price:12000 },
        { code:'LAB-LIP',   name:'Lipid Profile',              dept:'lab', price:10000 },
        { code:'LAB-HIV',   name:'HIV Test',                   dept:'lab', price:5000  },
        { code:'LAB-PREG',  name:'Pregnancy Test',             dept:'lab', price:3000  },
        { code:'LAB-STOOL', name:'Stool Analysis',             dept:'lab', price:3500  },
        { code:'LAB-HB',    name:'Haemoglobin',                dept:'lab', price:2500  },
        { code:'LAB-CULT',  name:'Culture & Sensitivity',      dept:'lab', price:18000 },
        // Imaging
        { code:'IMG-XR',    name:'X-Ray (single view)',        dept:'radiology', price:15000 },
        { code:'IMG-XR2',   name:'X-Ray (two views)',          dept:'radiology', price:22000 },
        { code:'IMG-US',    name:'Ultrasound (abdominal)',     dept:'radiology', price:20000 },
        { code:'IMG-USOB',  name:'Ultrasound (obstetric)',     dept:'radiology', price:20000 },
        { code:'IMG-CT',    name:'CT Scan',                    dept:'radiology', price:120000 },
        { code:'IMG-MRI',   name:'MRI',                        dept:'radiology', price:250000 },
        // Other
        { code:'ADM-BED',   name:'Bed / Day (General Ward)',   dept:'admission', price:15000 },
        { code:'ADM-PRIV',  name:'Bed / Day (Private Room)',   dept:'admission', price:40000 },
        { code:'PHY-SESS',  name:'Physiotherapy Session',      dept:'physio', price:10000 },
        { code:'THE-MIN',   name:'Theatre — Minor Surgery',    dept:'theatre', price:80000 },
        { code:'THE-MAJ',   name:'Theatre — Major Surgery',    dept:'theatre', price:250000 }
    ];

    function getTariff() {
        var t = read(TARIFF_KEY, null);
        if (!t || !t.length) { write(TARIFF_KEY, DEFAULT_TARIFF); return DEFAULT_TARIFF.slice(); }
        return t;
    }
    function saveTariff(list) {
        write(TARIFF_KEY, list);
        sync('config', 'tariff', { items: list, updatedAt: new Date().toISOString() });
        emit('tariffUpdated', { count: list.length });
        return list;
    }
    function getPrice(code) {
        var i = getTariff().filter(function (x) { return x.code === code; })[0];
        return i ? i.price : 0;
    }
    function tariffByDept(dept) {
        return getTariff().filter(function (x) { return x.dept === dept; });
    }
    function money(n) {
        return 'RWF ' + (Number(n) || 0).toLocaleString('en-US');
    }


    /* ══════════════════════════════════════════
       2. ORDERS
       ══════════════════════════════════════════ */
    var DEPT_OF = {
        lab: 'lab', imaging: 'radiology', prescription: 'pharmacy',
        procedure: 'nursing', referral: 'reception', admission: 'nursing',
        physio: 'physio', surgery: 'theatre'
    };

    function getOrders(filter) {
        var all = read(ORDERS_KEY, []);
        if (!filter) return all;
        return all.filter(function (o) {
            if (filter.dept    && o.dept    !== filter.dept)    return false;
            if (filter.type    && o.type    !== filter.type)    return false;
            if (filter.status  && o.status  !== filter.status)  return false;
            if (filter.patientId != null && String(o.patientId) !== String(filter.patientId)) return false;
            return true;
        });
    }

    /* createOrder({ patientId, patientName, type, items:[{code,name,price,qty}],
                     priority, notes, bill:true })                            */
    function createOrder(o) {
        if (!o || !o.patientId || !o.type) {
            console.warn('[pclinic] createOrder needs patientId and type'); return null;
        }
        var staff = who();
        // Resolve name AND price from the tariff when only a code is given,
        // so a department board shows "Complete Blood Count", not "LAB-CBC".
        var items = (o.items || []).map(function (it) {
            var ref = it.code ? getTariff().filter(function (x) { return x.code === it.code; })[0] : null;
            return {
                code:  it.code || '',
                name:  it.name || (ref && ref.name) || it.code || 'Item',
                qty:   it.qty  || 1,
                price: it.price != null ? it.price : (ref ? ref.price : 0)
            };
        });
        var total = items.reduce(function (s, i) { return s + (i.price * i.qty); }, 0);

        var order = {
            id: uid('ord'),
            patientId: o.patientId,
            patientName: o.patientName || '',
            type: o.type,
            dept: o.dept || DEPT_OF[o.type] || 'general',
            items: items,
            priority: o.priority || 'routine',       // routine | urgent | stat
            notes: o.notes || '',
            status: 'pending',
            total: total,
            billed: false,
            billId: null,
            orderedBy: staff.name,
            orderedById: staff.id,
            orderedAt: new Date().toISOString(),
            history: [{ at: new Date().toISOString(), by: staff.name, action: 'created' }]
        };

        var all = read(ORDERS_KEY, []);
        all.unshift(order);
        write(ORDERS_KEY, all);
        sync('orders', order.id, order);

        // Auto-bill unless explicitly told not to
        if (o.bill !== false && total > 0) {
            var b = createBill({
                patientId: order.patientId,
                patientName: order.patientName,
                items: items,
                source: order.type,
                orderId: order.id
            });
            if (b) {
                order.billed = true;
                order.billId = b.id;
                updateOrder(order.id, { billed: true, billId: b.id }, true);
            }
        }

        emit('ordersUpdated', { order: order });
        notifyDept(order.dept, order);
        return order;
    }

    function updateOrder(id, patch, quiet) {
        var all = read(ORDERS_KEY, []);
        var i = all.findIndex(function (o) { return o.id === id; });
        if (i === -1) return null;
        var staff = who();
        if (patch.status && patch.status !== all[i].status) {
            all[i].history = all[i].history || [];
            all[i].history.push({
                at: new Date().toISOString(), by: staff.name,
                action: 'status → ' + patch.status
            });
        }
        Object.keys(patch).forEach(function (k) { all[i][k] = patch[k]; });
        write(ORDERS_KEY, all);
        sync('orders', id, all[i]);
        if (!quiet) emit('ordersUpdated', { order: all[i] });
        return all[i];
    }

    // Cancel, never delete — clinical records must stay auditable.
    function cancelOrder(id, reason) {
        return updateOrder(id, {
            status: 'cancelled',
            cancelReason: reason || '',
            cancelledBy: who().name,
            cancelledAt: new Date().toISOString()
        });
    }

    function completeOrder(id, result) {
        return updateOrder(id, {
            status: 'completed',
            result: result || null,
            completedBy: who().name,
            completedAt: new Date().toISOString()
        });
    }

    function pendingCount(dept) {
        return getOrders({ dept: dept, status: 'pending' }).length;
    }


    /* ══════════════════════════════════════════
       3. BILLING
       ══════════════════════════════════════════ */
    function getBills(filter) {
        var all = read(BILLS_KEY, []);
        if (!filter) return all;
        return all.filter(function (b) {
            if (filter.status && b.status !== filter.status) return false;
            if (filter.patientId != null && String(b.patientId) !== String(filter.patientId)) return false;
            return true;
        });
    }

    function createBill(b) {
        if (!b || !b.patientId) return null;
        var items = (b.items || []).map(function (it) {
            var ref = it.code ? getTariff().filter(function (x) { return x.code === it.code; })[0] : null;
            return {
                code: it.code || '',
                name: it.name || (ref && ref.name) || 'Item',
                qty: it.qty || 1,
                price: it.price != null ? it.price : (ref ? ref.price : 0)
            };
        });
        if (!items.length) return null;
        var staff = who();
        var subtotal = items.reduce(function (s, i) { return s + i.price * i.qty; }, 0);

        var bill = {
            id: uid('bill'),
            number: 'INV-' + Date.now().toString().slice(-8),
            patientId: b.patientId,
            patientName: b.patientName || '',
            items: items,
            subtotal: subtotal,
            discount: b.discount || 0,
            total: subtotal - (b.discount || 0),
            paid: 0,
            balance: subtotal - (b.discount || 0),
            status: 'pending',                 // pending | partial | paid | cancelled
            source: b.source || 'manual',
            orderId: b.orderId || null,
            insurance: b.insurance || null,
            createdBy: staff.name,
            createdById: staff.id,
            createdAt: new Date().toISOString(),
            payments: []
        };
        var all = read(BILLS_KEY, []);
        all.unshift(bill);
        write(BILLS_KEY, all);
        sync('bills', bill.id, bill);
        emit('billsUpdated', { bill: bill });
        notifyRole('cashier', 'New bill ' + bill.number + ' — ' + money(bill.total) +
                              ' for ' + (bill.patientName || 'patient'), 'billing');
        return bill;
    }

    /* payBill(id, { amount, method, ref }) → returns a receipt */
    function payBill(id, payment) {
        var all = read(BILLS_KEY, []);
        var i = all.findIndex(function (b) { return b.id === id; });
        if (i === -1) return null;
        var bill = all[i];
        var staff = who();
        var amt = Number(payment.amount) || 0;
        if (amt <= 0) return null;

        var rec = {
            id: uid('pay'),
            amount: amt,
            method: payment.method || 'cash',   // cash | mobile | card | insurance
            ref: payment.ref || '',
            at: new Date().toISOString(),
            by: staff.name
        };
        bill.payments.push(rec);
        bill.paid = bill.payments.reduce(function (s, p) { return s + p.amount; }, 0);
        bill.balance = Math.max(0, bill.total - bill.paid);
        bill.status = bill.balance === 0 ? 'paid' : 'partial';
        if (bill.status === 'paid') {
            bill.paidAt = new Date().toISOString();
            bill.paidBy = staff.name;
        }
        write(BILLS_KEY, all);
        sync('bills', bill.id, bill);
        emit('billsUpdated', { bill: bill });

        return {
            receiptNo: 'RCT-' + rec.id.slice(-8).toUpperCase(),
            bill: bill, payment: rec,
            issuedBy: staff.name, issuedAt: rec.at
        };
    }

    function cancelBill(id, reason) {
        var all = read(BILLS_KEY, []);
        var i = all.findIndex(function (b) { return b.id === id; });
        if (i === -1) return null;
        all[i].status = 'cancelled';
        all[i].cancelReason = reason || '';
        all[i].cancelledBy = who().name;
        all[i].cancelledAt = new Date().toISOString();
        write(BILLS_KEY, all);
        sync('bills', id, all[i]);
        emit('billsUpdated', { bill: all[i] });
        return all[i];
    }

    // Finance roll-up
    function revenueSummary(fromISO, toISO) {
        var bills = getBills().filter(function (b) {
            if (b.status === 'cancelled') return false;
            if (fromISO && b.createdAt < fromISO) return false;
            if (toISO   && b.createdAt > toISO)   return false;
            return true;
        });
        var billed = bills.reduce(function (s, b) { return s + b.total; }, 0);
        var collected = bills.reduce(function (s, b) { return s + b.paid; }, 0);
        var byMethod = {};
        bills.forEach(function (b) {
            b.payments.forEach(function (p) {
                byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
            });
        });
        return {
            count: bills.length, billed: billed, collected: collected,
            outstanding: billed - collected, byMethod: byMethod
        };
    }


    /* ══════════════════════════════════════════
       4. MESSAGING / NOTIFICATIONS
       ══════════════════════════════════════════ */
    var ROLES = ['doctor','nurse','lab','pharmacy','radio','reception','cashier',
                 'finance','hr','inventory','theater','physio','admin','beds'];

    function getMessages(forRole) {
        var all = read(MSGS_KEY, []);
        var me = who();
        var role = forRole || me.role;
        return all.filter(function (m) {
            if (m.toStaffId && m.toStaffId === me.id) return true;
            return (m.toRoles || []).indexOf(role) !== -1;
        });
    }

    /* sendMessage({ text, toRoles:['lab','reception'], toStaffId, priority, patientId }) */
    function sendMessage(msg) {
        if (!msg || !msg.text) return null;
        var staff = who();
        var m = {
            id: uid('msg'),
            text: String(msg.text),
            toRoles: msg.toRoles || [],
            toStaffId: msg.toStaffId || null,
            priority: msg.priority || 'normal',      // normal | urgent
            patientId: msg.patientId || null,
            patientName: msg.patientName || '',
            category: msg.category || 'message',
            fromName: staff.name,
            fromId: staff.id,
            fromRole: staff.role,
            at: new Date().toISOString(),
            readBy: []
        };
        var all = read(MSGS_KEY, []);
        all.unshift(m);
        write(MSGS_KEY, all.slice(0, 500));          // keep the log bounded
        sync('messages', m.id, m);
        emit('messagesUpdated', { message: m });
        return m;
    }

    function markRead(id) {
        var all = read(MSGS_KEY, []);
        var i = all.findIndex(function (m) { return m.id === id; });
        if (i === -1) return;
        var me = who();
        all[i].readBy = all[i].readBy || [];
        if (all[i].readBy.indexOf(me.id) === -1) all[i].readBy.push(me.id);
        write(MSGS_KEY, all);
        sync('messages', id, all[i]);
        emit('messagesUpdated', {});
    }

    function markAllRead() {
        var me = who();
        var all = read(MSGS_KEY, []);
        all.forEach(function (m) {
            var mine = (m.toStaffId === me.id) || (m.toRoles || []).indexOf(me.role) !== -1;
            if (mine) {
                m.readBy = m.readBy || [];
                if (m.readBy.indexOf(me.id) === -1) m.readBy.push(me.id);
            }
        });
        write(MSGS_KEY, all);
        emit('messagesUpdated', {});
    }

    function unreadCount() {
        var me = who();
        return getMessages().filter(function (m) {
            return (m.readBy || []).indexOf(me.id) === -1;
        }).length;
    }

    // System notifications raised by the order/billing flow
    function notifyRole(role, text, category) {
        return sendMessage({ text: text, toRoles: [role], category: category || 'system' });
    }
    function notifyDept(dept, order) {
        var label = { lab:'Lab', radiology:'Imaging', pharmacy:'Prescription',
                      theatre:'Surgery', physio:'Physio', nursing:'Procedure' }[dept] || 'Order';
        var names = (order.items || []).map(function (i) { return i.name; }).join(', ');
        return sendMessage({
            text: (order.priority === 'stat' ? '🔴 STAT — ' : order.priority === 'urgent' ? '🟠 Urgent — ' : '') +
                  'New ' + label + ' request for ' + (order.patientName || 'patient') +
                  (names ? ': ' + names : ''),
            toRoles: [dept === 'radiology' ? 'radio' : dept === 'theatre' ? 'theater' : dept],
            category: 'order',
            priority: order.priority === 'routine' ? 'normal' : 'urgent',
            patientId: order.patientId,
            patientName: order.patientName
        });
    }


    /* ══════════════════════════════════════════
       5. ALLERGY / SAFETY CHECK
       ══════════════════════════════════════════
       Not a full interaction database — a practical guard that catches
       the common, dangerous cases at the point of prescribing.
    */
    var DRUG_CLASS = {
        penicillin: ['amoxicillin','ampicillin','penicillin','augmentin','cloxacillin','flucloxacillin','piperacillin'],
        sulfa:      ['cotrimoxazole','sulfamethoxazole','sulfadiazine','septrin','bactrim'],
        nsaid:      ['ibuprofen','diclofenac','aspirin','naproxen','indomethacin','piroxicam'],
        cephalosporin: ['ceftriaxone','cefixime','cefuroxime','cephalexin','ceftazidime'],
        macrolide:  ['azithromycin','erythromycin','clarithromycin'],
        quinolone:  ['ciprofloxacin','levofloxacin','ofloxacin','norfloxacin'],
        opioid:     ['morphine','pethidine','tramadol','codeine','fentanyl']
    };

    var INTERACTIONS = [
        { a:'warfarin',   b:'aspirin',      severity:'high',     note:'Greatly increased bleeding risk' },
        { a:'warfarin',   b:'diclofenac',   severity:'high',     note:'Greatly increased bleeding risk' },
        { a:'warfarin',   b:'ibuprofen',    severity:'high',     note:'Greatly increased bleeding risk' },
        { a:'metformin',  b:'contrast',     severity:'high',     note:'Risk of lactic acidosis — hold before contrast imaging' },
        { a:'ciprofloxacin', b:'tizanidine',severity:'high',     note:'Severe hypotension / sedation' },
        { a:'ace',        b:'spironolactone',severity:'moderate',note:'Hyperkalaemia risk — monitor potassium' },
        { a:'nsaid',      b:'ace',          severity:'moderate', note:'Reduced renal function, blunted BP control' },
        { a:'tramadol',   b:'fluoxetine',   severity:'moderate', note:'Serotonin syndrome risk' },
        { a:'tramadol',   b:'sertraline',   severity:'moderate', note:'Serotonin syndrome risk' },
        { a:'digoxin',    b:'furosemide',   severity:'moderate', note:'Hypokalaemia raises digoxin toxicity' },
        { a:'statin',     b:'clarithromycin',severity:'moderate',note:'Increased myopathy / rhabdomyolysis risk' }
    ];

    function norm(s) { return String(s || '').toLowerCase().trim(); }

    function classOf(drug) {
        var d = norm(drug), out = [];
        Object.keys(DRUG_CLASS).forEach(function (c) {
            if (DRUG_CLASS[c].some(function (m) { return d.indexOf(m) !== -1; })) out.push(c);
        });
        return out;
    }

    /* checkPrescription(patient, ['Amoxicillin 500mg', ...]) → [warnings] */
    function checkPrescription(patient, drugs) {
        var warnings = [];
        if (!patient || !drugs || !drugs.length) return warnings;

        var allergies = patient.allergies || [];
        if (typeof allergies === 'string') {
            allergies = allergies.split(/[,;]/).map(function (a) { return a.trim(); }).filter(Boolean);
        }

        // 1. Direct + class-level allergy match
        drugs.forEach(function (d) {
            var dn = norm(d), cls = classOf(d);
            allergies.forEach(function (a) {
                var an = norm(a);
                if (!an) return;
                if (dn.indexOf(an) !== -1 || an.indexOf(dn.split(' ')[0]) !== -1) {
                    warnings.push({ level:'danger', kind:'allergy', drug:d,
                        text:'⛔ ALLERGY: patient is allergic to "' + a + '"' });
                } else if (cls.some(function (c) { return an.indexOf(c) !== -1; })) {
                    warnings.push({ level:'danger', kind:'allergy', drug:d,
                        text:'⛔ ALLERGY: "' + a + '" — ' + d + ' is in the same drug class' });
                } else if (DRUG_CLASS[an] &&
                           DRUG_CLASS[an].some(function (m) { return dn.indexOf(m) !== -1; })) {
                    warnings.push({ level:'danger', kind:'allergy', drug:d,
                        text:'⛔ ALLERGY: patient reacts to ' + a + ' class' });
                }
            });
        });

        // 2. Pairwise interactions (new drugs + anything already active)
        var active = (patient.prescriptions || [])
            .filter(function (p) { return p.status !== 'void' && p.status !== 'completed'; })
            .reduce(function (acc, p) {
                (p.medications || p.items || []).forEach(function (m) {
                    acc.push(m.name || m.drug || m);
                });
                return acc;
            }, []);
        var all = drugs.concat(active);

        INTERACTIONS.forEach(function (ix) {
            var hitA = all.filter(function (d) {
                return norm(d).indexOf(ix.a) !== -1 || classOf(d).indexOf(ix.a) !== -1; });
            var hitB = all.filter(function (d) {
                return norm(d).indexOf(ix.b) !== -1 || classOf(d).indexOf(ix.b) !== -1; });
            if (hitA.length && hitB.length && norm(hitA[0]) !== norm(hitB[0])) {
                warnings.push({
                    level: ix.severity === 'high' ? 'danger' : 'warn',
                    kind: 'interaction',
                    text: (ix.severity === 'high' ? '⛔' : '⚠️') + ' INTERACTION: ' +
                          hitA[0] + ' + ' + hitB[0] + ' — ' + ix.note
                });
            }
        });

        // 3. Duplicate therapy
        var seen = {};
        drugs.forEach(function (d) {
            classOf(d).forEach(function (c) {
                if (seen[c]) {
                    warnings.push({ level:'warn', kind:'duplicate',
                        text:'⚠️ DUPLICATE: ' + seen[c] + ' and ' + d + ' are both ' + c + 's' });
                }
                seen[c] = d;
            });
        });

        // de-duplicate
        var uniq = {}, out = [];
        warnings.forEach(function (w) { if (!uniq[w.text]) { uniq[w.text] = 1; out.push(w); } });
        return out;
    }


    /* ══════════════════════════════════════════
       EXPORTS
       ══════════════════════════════════════════ */
    window.pcOrders = {
        create: createOrder, update: updateOrder, cancel: cancelOrder,
        complete: completeOrder, list: getOrders, pending: pendingCount, DEPT_OF: DEPT_OF
    };
    window.pcBilling = {
        create: createBill, pay: payBill, cancel: cancelBill,
        list: getBills, revenue: revenueSummary, money: money
    };
    window.pcTariff = {
        all: getTariff, save: saveTariff, price: getPrice,
        byDept: tariffByDept, defaults: DEFAULT_TARIFF
    };
    window.pcMessages = {
        send: sendMessage, list: getMessages, markRead: markRead,
        markAllRead: markAllRead, unread: unreadCount,
        notifyRole: notifyRole, ROLES: ROLES
    };
    window.pcSafety = {
        check: checkPrescription, classOf: classOf,
        DRUG_CLASS: DRUG_CLASS, INTERACTIONS: INTERACTIONS
    };
    window.pcMoney = money;

    getTariff();   // seed defaults on first run
    console.log('🧾 PClinic orders/billing/messaging ready');
})();
