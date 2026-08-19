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

    /* ══════════════════════════════════════════
       IN-FLIGHT WRITE GUARD
       ══════════════════════════════════════════
       A record written locally is "pending" from the moment it's saved
       until Firestore confirms (or definitively rejects) it. mergeDown()
       must never treat a pending record as "unverified local cache junk"
       — that was the bug: a lab order created 200ms before the next
       onSnapshot tick got wiped from localStorage because the cloud
       write simply hadn't landed yet.
    */
    var _pendingWrites = {};   // id -> true while a push to Firestore is in flight
    function markPending(id)   { _pendingWrites[id] = true; }
    function clearPending(id)  { delete _pendingWrites[id]; }
    function isPending(id)     { return !!_pendingWrites[id]; }

    // Push to Firestore when available. Never blocks the UI — the local
    // write already happened, so an offline doctor keeps working.
    // On confirmed failure we do NOT delete the local record anymore —
    // we flag it so the UI can show "not saved to server, tap to retry"
    // and mergeDown() knows to leave it alone until it's resolved.
    function sync(coll, id, data) {
        var key = coll === 'orders' ? ORDERS_KEY : coll === 'bills' ? BILLS_KEY : coll === 'messages' ? MSGS_KEY : null;

        function flagFailed(reason) {
            if (!key) return;
            var all = read(key, []);
            var i = all.findIndex(function (row) { return String(row.id) === String(id); });
            if (i !== -1) {
                all[i]._syncFailed = true;
                all[i]._syncError = reason || 'unknown';
                write(key, all);
            }
            clearPending(id);
            emit('pclinicSyncError', { collection: coll, id: id });
            if (window.pcToast) window.pcToast('⚠️ Not saved to the server yet — will retry, or tap to retry now.', 'error', 7000);
        }

        markPending(id);

        try {
            if (!window.firebaseDB || !window.firebaseFunctions) {
                throw new Error('Secure server connection is unavailable');
            }
            var f = window.firebaseFunctions;
            return f.setDoc(f.doc(window.firebaseDB, coll, id), data)
                .then(function () {
                    // Confirmed — clear any previous failure flag and the pending guard.
                    if (key) {
                        var all = read(key, []);
                        var i = all.findIndex(function (row) { return String(row.id) === String(id); });
                        if (i !== -1 && (all[i]._syncFailed || all[i]._syncError)) {
                            delete all[i]._syncFailed;
                            delete all[i]._syncError;
                            write(key, all);
                        }
                    }
                    clearPending(id);
                    return true;
                })
                .catch(function (e) {
                    console.error('[pclinic] server write failed:', e);
                    flagFailed(e && e.message);
                    return false;
                });
        } catch (e) {
            flagFailed(e && e.message);
            return Promise.resolve(false);
        }
    }

    // Keep the latest server-write promise so workflows that must not claim
    // success early (order creation and clinical finalisation) can await the
    // actual common-server acknowledgement.
    var _syncPromises = {};
    function trackedSync(coll, id, data) {
        var key = coll + ':' + String(id);
        var promise = Promise.resolve(sync(coll, id, data));
        _syncPromises[key] = promise;
        return promise;
    }
    function waitForTrackedSync(coll, id) {
        return _syncPromises[coll + ':' + String(id)] || Promise.resolve(false);
    }

    // Manual retry for a record the UI flagged as _syncFailed.
    function retrySync(coll, id) {
        var key = coll === 'orders' ? ORDERS_KEY : coll === 'bills' ? BILLS_KEY : coll === 'messages' ? MSGS_KEY : null;
        if (!key) return Promise.resolve(false);
        var all = read(key, []);
        var row = all.filter(function (r) { return String(r.id) === String(id); })[0];
        if (!row) return Promise.resolve(false);
        var data = {};
        Object.keys(row).forEach(function (k) {
            if (k !== '_syncFailed' && k !== '_syncError') data[k] = row[k];
        });
        return sync(coll, id, data).then(function (ok) {
            emit(coll === 'orders' ? 'ordersUpdated' : coll === 'bills' ? 'billsUpdated' : 'pclinicRetrySynced', { id: id, ok: ok });
            return ok;
        });
    }

    /* ══════════════════════════════════════════
       LIVE PULL — Firestore → localStorage (orders & bills)
       ══════════════════════════════════════════
       sync() above only ever pushed UP to Firestore. Nothing pulled
       those writes back DOWN into localStorage on a *different*
       device — so a bill raised on the doctor's machine only ever
       lived in the doctor's own browser storage, and the cashier
       machine's pclinic_orders / pclinic_bills stayed empty even
       though the patient itself (synced by patient-data.js) showed
       up fine. This mirrors patient-data.js's pattern for orders
       and bills so every device converges on the same data.
    */
    var _ordersUnsub = null, _billsUnsub = null, _messagesUnsubs = [];

    function firebaseValueToLocal(value) {
        if (value && typeof value.toDate === 'function') {
            try { return value.toDate().toISOString(); } catch (e) {}
        }
        if (Array.isArray(value)) return value.map(firebaseValueToLocal);
        if (value && typeof value === 'object') {
            var out = {};
            Object.keys(value).forEach(function (key) { out[key] = firebaseValueToLocal(value[key]); });
            return out;
        }
        return value;
    }

    function mergeDown(key, cloudList) {
        var localList = read(key, []);
        var cloudIds = {};
        cloudList.forEach(function (d) { cloudIds[String(d.id)] = true; });

        // A local-only record is only "unverified browser cache junk" if it
        // is NOT currently being pushed to Firestore and hasn't already
        // failed to push (in which case the UI is showing a retry banner
        // for it — discarding it here would hide that failure entirely).
        var localOnly = localList.filter(function (d) { return !cloudIds[String(d.id)]; });
        var keep = localOnly.filter(function (d) { return isPending(d.id) || d._syncFailed; });
        var discard = localOnly.filter(function (d) { return !isPending(d.id) && !d._syncFailed; });

        if (discard.length) {
            console.warn('[pclinic] discarding ' + discard.length + ' unverified local-only ' + key + ' record(s)');
        }
        if (keep.length) {
            console.log('[pclinic] keeping ' + keep.length + ' in-flight/failed local ' + key + ' record(s) pending confirmation');
        }

        // Firestore is authoritative for everything it has already
        // confirmed. In-flight or failed local writes are appended so
        // they stay visible until they resolve one way or the other.
        return cloudList.concat(keep);
    }

    function startLiveSync(coll, key, eventName) {
        if (!window.firebaseDB || !window.firebaseFunctions) return null;
        var f = window.firebaseFunctions;
        try {
            var ref = f.collection(window.firebaseDB, coll);
            return f.onSnapshot(ref, function (snap) {
                var cloud = [];
                snap.forEach(function (doc) {
                    var d = firebaseValueToLocal(doc.data());
                    if (!d.id) d.id = doc.id;
                    cloud.push(d);
                });
                write(key, mergeDown(key, cloud));
                emit(eventName, { count: cloud.length });
                window.dispatchEvent(new Event('storage'));
            }, function (err) {
                console.warn('[pclinic] ' + coll + ' live sync error:', err.message);
            });
        } catch (e) { return null; }
    }

    function startMessageLiveSync() {
        if (!window.firebaseDB || !window.firebaseFunctions || _messagesUnsubs.length) return;
        var staff = who();
        if (!staff.role) return;
        var f = window.firebaseFunctions;
        var ref = f.collection(window.firebaseDB, 'messages');
        var snapshots = { role: [], staff: [] };

        function publish() {
            var byId = {};
            snapshots.role.concat(snapshots.staff).forEach(function (message) {
                byId[String(message.id)] = message;
            });
            var list = Object.keys(byId).map(function (id) { return byId[id]; });
            list.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
            write(MSGS_KEY, list.slice(0, 500));
            emit('messagesUpdated', { count: list.length, serverConfirmed: true });
        }

        function listen(name, q) {
            return f.onSnapshot(q, function (snap) {
                var rows = [];
                snap.forEach(function (docSnap) {
                    var data = firebaseValueToLocal(docSnap.data());
                    if (!data.id) data.id = docSnap.id;
                    rows.push(data);
                });
                snapshots[name] = rows;
                publish();
            }, function (error) {
                console.warn('[pclinic] messages live sync error:', error && error.message);
            });
        }

        try {
            if (staff.role === 'admin') {
                _messagesUnsubs.push(listen('role', ref));
                return;
            }
            _messagesUnsubs.push(listen('role', f.query(ref, f.where('toRoles', 'array-contains', staff.role))));
            if (staff.id) {
                _messagesUnsubs.push(listen('staff', f.query(ref, f.where('toStaffId', '==', staff.id))));
            }
        } catch (error) {
            console.warn('[pclinic] could not start message sync:', error && error.message);
        }
    }

    function startAuthorizedLiveSync() {
        var role = String((window.currentStaff && window.currentStaff.role) || '');
        var orderRoles = ['admin','doctor','nurse','reception','lab','pharmacy','radio','physio','theater','cashier','finance'];
        var billRoles = ['admin','cashier','finance'];
        if (orderRoles.indexOf(role) !== -1 && !_ordersUnsub) {
            _ordersUnsub = startLiveSync('orders', ORDERS_KEY, 'ordersUpdated');
        }
        if (billRoles.indexOf(role) !== -1 && !_billsUnsub) {
            _billsUnsub = startLiveSync('bills', BILLS_KEY, 'billsUpdated');
        }
        if (role) startMessageLiveSync();
    }

    // Wait until the verified staff profile is available. Starting listeners
    // on firebaseReady alone caused unauthorized roles to request collections
    // before the Auth guard had resolved the role.
    if (window.currentStaff) startAuthorizedLiveSync();
    window.addEventListener('pclinicStaffReady', startAuthorizedLiveSync);


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
        // ⛔ NO TEMPLATE DATA: the tariff starts EMPTY. Exams are added by the
        // Admin (Admin → Lab Exams) and are the only source of pricing.
        var t = read(TARIFF_KEY, null);
        if (!Array.isArray(t)) return [];
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

    function purgeTemplateLabOrdersFromStorage() {
        try {
            var raw = read(ORDERS_KEY, []);
            if (!Array.isArray(raw) || raw.length === 0) return;
            var templateNames = [
                'john kamau', 'grace wanjiru', 'amina hassan', 'samuel otieno', 'peter omondi',
                'mary wanjiku', 'david mwangi', 'jane doe', 'john doe', 'peter njoroge',
                'paul kamau', 'esther wanjiku', 'ann muthua', 'joseph kamau', 'david otieno',
                'susan njeri'
            ];
            var cleaned = raw.filter(function (o) {
                var nm = String(o.patientName || '').toLowerCase().trim();
                return templateNames.indexOf(nm) === -1;
            });
            if (cleaned.length !== raw.length) {
                write(ORDERS_KEY, cleaned);
                console.log('🧹 Purged ' + (raw.length - cleaned.length) + ' template lab orders from pclinic_orders.');
            }
        } catch (e) {
            console.warn('Error purging template lab orders:', e);
        }
    }

    function aggregateCommonServerLabOrders(allOrders) {
        try {
            purgeTemplateLabOrdersFromStorage();
            var orders = Array.isArray(allOrders) ? allOrders : read(ORDERS_KEY, []);
            var patients = [];
            if (typeof getPatients === 'function') {
                patients = getPatients();
            } else {
                patients = read('pclinic_patients', []);
            }
            if (!Array.isArray(patients) || patients.length === 0) return orders;

            var changed = false;
            patients.forEach(function (p, idx) {
                if (!p || !p.id) return;
                var pIdStr = String(p.id).replace(/^MOD-/i, '').trim();
                var pName = (p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient ID ' + pIdStr)).trim();
                if (!pName) return;

                // ⛔ NO TEMPLATE DATA: lab requests are NEVER invented here.
                // Only REAL requests created by doctors (labRequests entries with
                // a requestedBy + timestamp) are synced into the orders ledger.
                if (Array.isArray(p.labRequests)) {
                    p.labRequests.forEach(function (lab, lIdx) {
                        if (!lab) return;
                        var requestTests = Array.isArray(lab.tests) ? lab.tests.filter(Boolean) : [lab.testName || lab.item || lab.test].filter(Boolean);
                        if (!requestTests.length || !(lab.requestedBy || lab.requestedById || lab.timestamp || lab.date)) return;
                        var legacyRequestId = String(lab.id || (pIdStr + '-' + lIdx));
                        var exists = orders.some(function (o) {
                            if (String(o.patientId).replace(/^MOD-/i, '').trim() !== pIdStr || o.dept !== 'lab') return false;
                            if (String(o.legacyRequestId || '') === legacyRequestId) return true;
                            var existingNames = (o.items || []).map(function (it) { return String(it.name || '').toLowerCase(); });
                            return requestTests.every(function (testName) {
                                var wanted = String(testName).toLowerCase();
                                return existingNames.some(function (name) { return name === wanted; });
                            });
                        });
                        if (!exists) {
                            var tariff = getTariff();
                            var items = requestTests.map(function (testName) {
                                var ref = tariff.filter(function (item) {
                                    return String(item.name || '').toLowerCase() === String(testName).toLowerCase();
                                })[0];
                                return {
                                    code: (ref && ref.code) || ('LAB-' + String(testName).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()),
                                    name: String(testName),
                                    price: (ref && Number(ref.price)) || Number(lab.price) || 0,
                                    qty: 1
                                };
                            });
                            var rawStatus = String(lab.status || 'pending').toLowerCase();
                            var status = rawStatus === 'completed' ? 'completed' : rawStatus === 'cancelled' ? 'cancelled' : rawStatus === 'in-progress' ? 'in-progress' : 'pending';
                            var newOrd = {
                                id: 'LAB-LEGACY-' + pIdStr + '-' + legacyRequestId.replace(/[^a-zA-Z0-9_-]/g, ''),
                                patientId: pIdStr,
                                patientName: pName,
                                type: 'lab',
                                dept: 'lab',
                                items: items,
                                priority: String(lab.priority || 'routine').toLowerCase(),
                                status: status,
                                orderedBy: lab.orderedBy || lab.requestedBy || '',
                                orderedById: lab.orderedById || lab.requestedById || '',
                                orderedAt: lab.timestamp || lab.date || lab.orderedAt || new Date().toISOString(),
                                notes: lab.notes || lab.clinicalNotes || '',
                                legacyRequestId: legacyRequestId,
                                _legacyLocalOnly: true
                            };
                            orders.unshift(newOrd);
                            changed = true;
                        }
                    });
                }
            });

            if (changed) {
                write(ORDERS_KEY, orders);
                try {
                    if (typeof savePatientsToStorage === 'function') savePatientsToStorage(patients);
                    else write('pclinic_patients', patients);
                } catch (e) {}
            }
            return orders;
        } catch (e) {
            console.warn('Error aggregating Common Server lab orders:', e);
            return Array.isArray(allOrders) ? allOrders : [];
        }
    }

    function getOrders(filter) {
        var all = aggregateCommonServerLabOrders(read(ORDERS_KEY, []));
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
        if (!staff.id) {
            console.warn('[pclinic] authenticated staff profile is required before creating an order');
            return null;
        }
        // Resolve name AND price from the tariff when only a code is given.
        var items = (o.items || []).map(function (it) {
            var ref = it.code ? getTariff().filter(function (x) { return x.code === it.code; })[0] : null;
            return {
                code:  it.code || '',
                name:  it.name || (ref && ref.name) || it.code || 'Item',
                qty:   it.qty  || 1,
                price: it.price != null ? it.price : (ref ? ref.price : 0)
            };
        });
        if (!items.length) {
            console.warn('[pclinic] an order requires at least one item');
            return null;
        }
        var total = items.reduce(function (sum, item) { return sum + item.price * item.qty; }, 0);
        var now = new Date().toISOString();
        var order = {
            id: uid('ord'),
            patientId: o.patientId,
            patientName: o.patientName || '',
            type: o.type,
            dept: o.dept || DEPT_OF[o.type] || 'general',
            items: items,
            priority: String(o.priority || 'routine').toLowerCase(),
            notes: o.notes || '',
            status: 'pending',
            total: total,
            billed: false,
            billId: null,
            orderedBy: staff.name,
            orderedById: staff.id,
            orderedAt: now,
            history: [{ at: now, by: staff.name, byId: staff.id, action: 'created' }]
        };

        // Build the bill first, then upload the FINAL order only once. The old
        // code uploaded before billing and then uploaded again; those two
        // writes could arrive out of order and restore stale fields.
        if (o.bill !== false && total > 0) {
            var bill = createBill({
                patientId: order.patientId,
                patientName: order.patientName,
                items: items,
                source: order.type,
                orderId: order.id
            });
            if (bill) {
                order.billed = true;
                order.billId = bill.id;
            }
        }

        var all = read(ORDERS_KEY, []);
        all.unshift(order);
        write(ORDERS_KEY, all);
        trackedSync('orders', order.id, order);
        emit('ordersUpdated', { order: order });
        notifyDept(order.dept, order);
        return order;
    }

    async function createOrderAsync(o) {
        var order = createOrder(o);
        if (!order) throw new Error('The laboratory order could not be created. Confirm that you are signed in and at least one test is selected.');
        var ok = await waitForTrackedSync('orders', order.id);
        if (!ok) throw new Error('The order was not accepted by the common server. Check your connection and staff permissions, then retry.');
        if (order.billId) {
            var billOk = await waitForTrackedSync('bills', order.billId);
            if (!billOk) throw new Error('The order was saved, but its bill was not accepted by the common server. Retry from Billing before charging the patient.');
        }
        return order;
    }

    function updateOrder(id, patch, quiet) {
        var all = read(ORDERS_KEY, []);
        var i = all.findIndex(function (o) { return String(o.id) === String(id); });
        if (i === -1) return null;
        var staff = who();
        if (patch.status && patch.status !== all[i].status) {
            all[i].history = all[i].history || [];
            all[i].history.push({
                at: new Date().toISOString(), by: staff.name, byId: staff.id,
                action: 'status → ' + patch.status
            });
        }
        Object.keys(patch).forEach(function (k) { all[i][k] = patch[k]; });
        write(ORDERS_KEY, all);
        trackedSync('orders', id, all[i]);
        if (!quiet) emit('ordersUpdated', { order: all[i] });
        return all[i];
    }

    async function updateOrderAsync(id, patch, quiet) {
        var order = updateOrder(id, patch, quiet);
        if (!order) throw new Error('Order not found.');
        var ok = await waitForTrackedSync('orders', id);
        if (!ok) throw new Error('The update was not accepted by the common server.');
        return order;
    }

    // Apply a patch already committed by a trusted Cloud Function. This only
    // refreshes the local mirror; it deliberately does not write back.
    function applyServerOrderPatch(id, patch) {
        var all = read(ORDERS_KEY, []);
        var i = all.findIndex(function (o) { return String(o.id) === String(id); });
        if (i === -1) return null;
        Object.keys(patch || {}).forEach(function (key) { all[i][key] = patch[key]; });
        delete all[i]._syncFailed;
        delete all[i]._syncError;
        write(ORDERS_KEY, all);
        emit('ordersUpdated', { order: all[i], serverConfirmed: true });
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
    function purgeTemplateBillsFromStorage() {
        try {
            var raw = read(BILLS_KEY, []);
            if (!Array.isArray(raw) || raw.length === 0) return;
            var templateNames = [
                'nsanzintwari saratiel', 'kamanzi jean de dieu', 'mukandori lyne',
                'kagabo pierre', 'uwase marie', 'uwimana jean', 'mukamana ange',
                'habimana eric', 'nyiraneza diane', 'bizimana alain', 'irakoze claire',
                'ntakirutimana r.', 'umubyeyi sara',
                'john doe', 'jane smith', 'peter m.', 'peter m', 'john kamau',
                'grace wanjiru', 'amina hassan', 'samuel otieno', 'peter omondi'
            ];
            var templateIds = [
                'inv-2026-0089', 'inv-2026-0088', 'inv-2026-0087',
                'inv-2026-0086', 'inv-2026-0085', 'inv-2025-0014',
                'inv-2025-0013', 'inv-2025-0012', 'inv-2025-0011',
                'inv-2025-0010', 'inv-2025-0009', 'inv-2025-0008',
                'inv-2025-0007', 'inv-2025-0006', 'inv-2025-0005'
            ];
            var cleaned = raw.filter(function(b) {
                var n = String(b.patientName || '').toLowerCase().trim();
                var id = String(b.id || b.number || '').toLowerCase().trim();
                if (templateNames.indexOf(n) !== -1) return false;
                if (templateIds.indexOf(id) !== -1) return false;
                return true;
            });
            if (cleaned.length !== raw.length) {
                write(BILLS_KEY, cleaned);
                console.log('🧹 Purged ' + (raw.length - cleaned.length) + ' template bills from pclinic_bills');
            }
        } catch(e) {}
    }

    /* ─── AUTOMATIC COMMON SERVER BILLING AGGREGATOR (CONSULTATIONS, PRESCRIPTIONS, EXAMS) ─── */
    function aggregateCommonServerPatientBills(existingBills) {
        var merged = (existingBills || []).slice();
        try {
            var patients = [];
            if (typeof getPatients === 'function') {
                patients = getPatients() || [];
            } else {
                try { patients = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
            }

            var orders = [];
            if (typeof getOrders === 'function') {
                orders = getOrders() || [];
            } else {
                try { orders = JSON.parse(localStorage.getItem('pclinic_orders') || '[]'); } catch(e){}
            }

            // 1. Group ALL orders by normalized patient ID / Name
            var orderGroups = {};
            orders.forEach(function(ord) {
                if (!ord) return;
                var pid = String(ord.patientId || '').replace(/^MOD-/i, '').trim();
                var pname = String(ord.patientName || '').trim();
                var key = pid || pname.toLowerCase();
                if (!key) return;
                if (!orderGroups[key]) orderGroups[key] = [];
                orderGroups[key].push(ord);
            });

            // 2. Scan every registered patient in getPatients()
            if (Array.isArray(patients)) {
                patients.forEach(function(p) {
                    if (!p || !p.id) return;
                    var pIdStr = String(p.id).replace(/^MOD-/i, '').trim();
                    var pName = (p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient ID ' + pIdStr)).trim();
                    if (!pName) return;

                    var items = [];
                    var sumTotal = 0;
                    var hasClinicalAction = false;

                    // ── A. Check patient.billingHistory (bills made by doctor on patient profile) ──
                    if (Array.isArray(p.billingHistory) && p.billingHistory.length > 0) {
                        hasClinicalAction = true;
                        p.billingHistory.forEach(function(bh) {
                            if (bh.items && Array.isArray(bh.items)) {
                                bh.items.forEach(function(bi) {
                                    var nm = bi.name || bi.description || bi.item || 'Clinical Service';
                                    var pr = Number(bi.price || bi.unitPrice || bi.total || 15000);
                                    var q  = Number(bi.qty || bi.quantity || 1);
                                    items.push({ name: nm, qty: q, price: pr });
                                    sumTotal += pr * q;
                                });
                            } else if (bh.amount || bh.total) {
                                var amt = Number(bh.amount || bh.total || 15000);
                                var desc = bh.description || bh.title || 'Billed Clinical Service';
                                items.push({ name: desc, qty: 1, price: amt });
                                sumTotal += amt;
                            }
                        });
                    }

                    // ── B. Check patient.prescriptions (medications ordered by doctor) ──
                    if (Array.isArray(p.prescriptions) && p.prescriptions.length > 0) {
                        hasClinicalAction = true;
                        p.prescriptions.forEach(function(rx) {
                            var drugName = typeof rx === 'string' ? rx : (rx.medication || rx.drug || rx.name || 'Prescription Medication');
                            var dosage   = typeof rx === 'string' ? '' : (rx.dosage || rx.dose || '');
                            var fullRx   = drugName + (dosage ? (' (' + dosage + ')') : '');
                            var fee      = Number(rx.price || rx.cost || 6500);
                            items.push({ name: 'Rx: ' + fullRx, qty: 1, price: fee });
                            sumTotal += fee;
                        });
                    }

                    // ── C. Check patient.labRequests / imaging requests ──
                    if (Array.isArray(p.labRequests) && p.labRequests.length > 0) {
                        hasClinicalAction = true;
                        p.labRequests.forEach(function(lab) {
                            var testName = lab.testName || lab.item || lab.test || (Array.isArray(lab.tests) ? lab.tests.join(', ') : 'Laboratory Investigation');
                            var fee = 8500;
                            items.push({ name: 'Lab: ' + testName, qty: 1, price: fee });
                            sumTotal += fee;
                        });
                    }

                    // ── D. Check pclinic_orders for this patient ──
                    var patOrders = orderGroups[pIdStr] || orderGroups[pName.toLowerCase()] || [];
                    if (patOrders.length > 0) {
                        hasClinicalAction = true;
                        patOrders.forEach(function(ord) {
                            var testName = ord.item || ord.testName || ord.name || ord.description || 'Clinical Diagnostic Order';
                            var fee = 8500;
                            var low = String(testName).toLowerCase();
                            if (low.indexOf('cbc') !== -1 || low.indexOf('blood count') !== -1) fee = 7500;
                            else if (low.indexOf('malaria') !== -1 || low.indexOf('rdt') !== -1) fee = 3500;
                            else if (low.indexOf('urinalysis') !== -1 || low.indexOf('urine') !== -1) fee = 4000;
                            else if (low.indexOf('x-ray') !== -1 || low.indexOf('xray') !== -1 || low.indexOf('radiograph') !== -1) fee = 25000;
                            else if (low.indexOf('ultrasound') !== -1 || low.indexOf('echo') !== -1 || low.indexOf('ultrason') !== -1) fee = 30000;
                            else if (low.indexOf('ct') !== -1 || low.indexOf('scan') !== -1) fee = 120000;
                            items.push({ name: testName, qty: ord.qty || 1, price: fee });
                            sumTotal += fee * (ord.qty || 1);
                        });
                    }

                    // ── E. Standard Consultation Fee (always added if clinical action exists or if patient was registered) ──
                    var hasConsult = items.some(function(it) {
                        return String(it.name).toLowerCase().indexOf('consult') !== -1;
                    });
                    if (!hasConsult && (hasClinicalAction || p.department || p.location || p.consultationFee)) {
                        items.unshift({ name: 'Specialist Outpatient Consultation & Clinical Exam', qty: 1, price: 15000 });
                        sumTotal += 15000;
                        hasClinicalAction = true;
                    }

                    if (!hasClinicalAction && items.length === 0) return;

                    // ── Look up existing bill in merged for this patient ──
                    var existingIdx = -1;
                    for (var i = 0; i < merged.length; i++) {
                        var bPid = String(merged[i].patientId || '').replace(/^MOD-/i, '').trim();
                        var bName = String(merged[i].patientName || '').toLowerCase().trim();
                        if (bPid === pIdStr || (bName && bName === pName.toLowerCase())) {
                            existingIdx = i;
                            break;
                        }
                    }

                    if (existingIdx !== -1) {
                        // MERGE any new prescriptions, lab requests, or consultation items into existing bill!
                        var existingBill = merged[existingIdx];
                        items.forEach(function(newItem) {
                            var exists = (existingBill.items || []).some(function(ei) {
                                return String(ei.name).toLowerCase() === String(newItem.name).toLowerCase();
                            });
                            if (!exists) {
                                existingBill.items = existingBill.items || [];
                                existingBill.items.push(newItem);
                                existingBill.total = (existingBill.total || 0) + (newItem.price * newItem.qty);
                                existingBill.balance = Math.max(0, existingBill.total - (existingBill.paid || 0));
                                if (existingBill.status === 'paid' && existingBill.balance > 0) {
                                    existingBill.status = 'partial'; // Re-open if new charges added!
                                }
                            }
                        });
                    } else {
                        // Create new aggregated Common Server bill for this patient!
                        var synBill = {
                            id: 'INV-CS-' + pIdStr,
                            number: 'INV-' + new Date().getFullYear() + '-' + pIdStr.slice(-4).padStart(4, '0'),
                            patientId: pIdStr,
                            patientName: pName,
                            items: items,
                            total: sumTotal,
                            paid: 0,
                            balance: sumTotal,
                            status: 'pending',
                            source: p.department || p.location || p.ward || 'OPD Clinical Suite',
                            createdBy: p.attendingDoctor || 'Attending Physician',
                            createdAt: p.registered || p.createdAt || new Date().toISOString(),
                            payments: [],
                            _isAggregated: true
                        };
                        merged.push(synBill);
                    }
                });
            }
        } catch(e) {
            console.warn('Error aggregating Common Server bills:', e);
        }
        return merged;
    }

    /* ══════════════════════════════════════════════════════════════
       PURGE ALL TEMPLATE DATA — removes every fabricated/template
       record from the Common Server (patients, lab requests, orders,
       bills, tariff). Runs once on engine load, idempotent, safe:
       • only fabricated labRequests (testName, no requestedBy) removed
       • only fabricated orders (LAB-{pid}-10x + template signature)
       • only known template patient names removed
       • only UNMODIFIED template tariff entries (no addedBy marker) removed
       ══════════════════════════════════════════════════════════════ */
    /* ══════════════════════════════════════════════════════════════
       MASTER LAB EXAM CATALOG — Common Server data (NOT UI template).
       These are the hospital's real laboratory exams. They are seeded
       into pclinic_tariff as admin-managed entries (addedBy:'admin'),
       so the Admin can EDIT prices, ADD new exams or DELETE any exam,
       and every change propagates live to Lab Request, Lab Result,
       Lab Dashboard and Billing.
       ══════════════════════════════════════════════════════════════ */
    var SEED_LAB_EXAMS = [
        // 🦟 Parasitology
        { code:'LAB-MALMP',  name:'Malaria Parasite (MP)',          price:3000,  category:'parasitology', sampleType:'Blood',  shortLabel:'Malaria Parasite (MP)', description:'Thick & thin blood smear' },
        { code:'LAB-STOOL',  name:'Stool Ova & Cysts',             price:2500,  category:'parasitology', sampleType:'Stool',  shortLabel:'Stool Ova & Cysts',    description:'Fresh stool sample' },
        { code:'LAB-FILAR',  name:'Filaria Test',                  price:4000,  category:'parasitology', sampleType:'Blood',  shortLabel:'Filaria Test',         description:'Night blood sample (22:00–02:00)' },
        { code:'LAB-SCHIST', name:'Schistosomiasis (Bilharzia)',   price:4000,  category:'parasitology', sampleType:'Urine',  shortLabel:'Schistosomiasis',      description:'Urine or stool sample' },
        { code:'LAB-TOXO',   name:'Toxoplasmosis Test',            price:6000,  category:'parasitology', sampleType:'Blood',  shortLabel:'Toxoplasmosis',        description:'Serum sample' },
        { code:'LAB-LEISH',  name:'Leishmania Test',               price:6000,  category:'parasitology', sampleType:'Blood',  shortLabel:'Leishmania Test',      description:'Serum sample' },
        // 🩸 Hematology
        { code:'LAB-CBC',    name:'CBC - Complete Blood Count',    price:6000,  category:'hematology',    sampleType:'Blood',  shortLabel:'CBC - Complete',      description:'EDTA tube' },
        { code:'LAB-HB',     name:'Hemoglobin (Hb)',               price:2500,  category:'hematology',    sampleType:'Blood',  shortLabel:'Hemoglobin (Hb)',     description:'EDTA tube' },
        { code:'LAB-WBC',    name:'WBC - White Blood Cell Count',  price:3000,  category:'hematology',    sampleType:'Blood',  shortLabel:'WBC Count',           description:'EDTA tube' },
        { code:'LAB-PLT',    name:'Platelet Count',                price:3000,  category:'hematology',    sampleType:'Blood',  shortLabel:'Platelet Count',      description:'EDTA tube' },
        { code:'LAB-ESR',    name:'ESR - Erythrocyte Sedimentation Rate', price:2500, category:'hematology', sampleType:'Blood', shortLabel:'ESR',               description:'Citrate tube' },
        { code:'LAB-BG',     name:'Blood Group & Rh Typing',       price:3500,  category:'hematology',    sampleType:'Blood',  shortLabel:'Blood Group',         description:'EDTA tube' },
        { code:'LAB-RETIC',  name:'Reticulocyte Count',            price:4000,  category:'hematology',    sampleType:'Blood',  shortLabel:'Reticulocyte',        description:'EDTA tube' },
        { code:'LAB-COAG',   name:'Coagulation Profile (PT/INR/PTT)', price:8000, category:'hematology',  sampleType:'Blood',  shortLabel:'Coagulation (PT/INR)', description:'Citrate tube' },
        { code:'LAB-SMEAR',  name:'Peripheral Blood Smear',        price:5000,  category:'hematology',    sampleType:'Blood',  shortLabel:'Blood Smear',         description:'EDTA tube + 2 slides' },
        { code:'LAB-SICKLE', name:'Sickling Test / Electrophoresis', price:6000, category:'hematology',  sampleType:'Blood',  shortLabel:'Sickling Test',       description:'EDTA tube' },
        // 🧬 Biochemistry
        { code:'LAB-FBS',    name:'Fasting Blood Sugar (FBS)',     price:2500,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'FBS',                 description:'Fasting 8–12 hours' },
        { code:'LAB-RBS',    name:'Random Blood Sugar (RBS)',      price:2500,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'RBS',                 description:'Serum tube' },
        { code:'LAB-HBA1C',  name:'HbA1c - Glycated Hemoglobin',   price:10000, category:'biochemistry',  sampleType:'Blood',  shortLabel:'HbA1c',               description:'EDTA tube' },
        { code:'LAB-LIPID',  name:'Lipid Profile',                 price:12000, category:'biochemistry',  sampleType:'Blood',  shortLabel:'Lipid Profile',       description:'Fasting 12 hours' },
        { code:'LAB-LFT',    name:'Liver Function Test (LFT)',     price:12000, category:'biochemistry',  sampleType:'Blood',  shortLabel:'LFT',                 description:'Serum tube' },
        { code:'LAB-RFT',    name:'Renal Function Test (RFT)',     price:12000, category:'biochemistry',  sampleType:'Blood',  shortLabel:'RFT',                 description:'Serum tube' },
        { code:'LAB-ELEC',   name:'Electrolytes - Na, K, Cl',      price:8000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'Electrolytes',        description:'Serum tube' },
        { code:'LAB-CREAT',  name:'Serum Creatinine',              price:4000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'Creatinine',          description:'Serum tube' },
        { code:'LAB-BUN',    name:'Blood Urea Nitrogen (BUN)',     price:4000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'BUN',                 description:'Serum tube' },
        { code:'LAB-URIC',   name:'Uric Acid',                     price:5000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'Uric Acid',           description:'Serum tube' },
        { code:'LAB-AMYL',   name:'Amylase',                       price:6000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'Amylase',             description:'Serum tube' },
        { code:'LAB-LIPASE', name:'Lipase',                        price:7000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'Lipase',              description:'Serum tube' },
        { code:'LAB-TROP',   name:'Cardiac Enzymes (Troponin I/T)', price:15000, category:'biochemistry', sampleType:'Blood',  shortLabel:'Troponin I/T',        description:'Serum tube' },
        { code:'LAB-BILI',   name:'Serum Bilirubin (Total & Direct)', price:5000, category:'biochemistry', sampleType:'Blood', shortLabel:'Bilirubin (T&D)',     description:'Serum tube, protect from light' },
        { code:'LAB-ASTALT', name:'SGOT / AST & SGPT / ALT',       price:8000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'AST / ALT',           description:'Serum tube' },
        { code:'LAB-ALP',    name:'Alkaline Phosphatase (ALP)',    price:5000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'ALP',                 description:'Serum tube' },
        { code:'LAB-ALB',    name:'Serum Albumin & Total Protein', price:6000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'Albumin & Protein',   description:'Serum tube' },
        { code:'LAB-CA',     name:'Serum Calcium & Magnesium',     price:6000,  category:'biochemistry',  sampleType:'Blood',  shortLabel:'Calcium & Mg',        description:'Serum tube' },
        // 🦠 Microbiology
        { code:'LAB-BCULT',  name:'Blood Culture',                 price:18000, category:'microbiology',  sampleType:'Blood',  shortLabel:'Blood Culture',       description:'Culture bottles ×2, aseptic' },
        { code:'LAB-UCULT',  name:'Urine Culture & Sensitivity',   price:15000, category:'microbiology',  sampleType:'Urine',  shortLabel:'Urine Culture',       description:'Mid-stream urine, sterile container' },
        { code:'LAB-SPCULT', name:'Sputum Culture',                price:15000, category:'microbiology',  sampleType:'Sputum', shortLabel:'Sputum Culture',      description:'Morning sputum, sterile container' },
        { code:'LAB-GRAM',   name:'Gram Stain',                    price:5000,  category:'microbiology',  sampleType:'Swab',   shortLabel:'Gram Stain',          description:'Swab or smear' },
        { code:'LAB-AFB',    name:'AFB - Acid Fast Bacilli',       price:8000,  category:'microbiology',  sampleType:'Sputum', shortLabel:'AFB',                 description:'3 early-morning sputum samples' },
        { code:'LAB-TBCULT', name:'TB Culture',                    price:20000, category:'microbiology',  sampleType:'Sputum', shortLabel:'TB Culture',           description:'Sputum, specialised medium' },
        { code:'LAB-WIDAL',  name:'Typhoid Test (Widal)',          price:4000,  category:'microbiology',  sampleType:'Blood',  shortLabel:'Widal Test',          description:'Serum tube' },
        { code:'LAB-BRUC',   name:'Brucella Test',                 price:5000,  category:'microbiology',  sampleType:'Blood',  shortLabel:'Brucella',            description:'Serum tube' },
        // 💧 Urinalysis
        { code:'LAB-UA',     name:'Urinalysis - Complete',         price:3500,  category:'urinalysis',    sampleType:'Urine',  shortLabel:'Urinalysis',          description:'Fresh urine, sterile container' },
        { code:'LAB-UPT',    name:'Urine Pregnancy Test',          price:3000,  category:'urinalysis',    sampleType:'Urine',  shortLabel:'UPT',                 description:'First morning urine' },
        { code:'LAB-24H',    name:'24-Hour Urine Collection',      price:6000,  category:'urinalysis',    sampleType:'Urine',  shortLabel:'24-Hr Urine',         description:'24-hour collection container' },
        { code:'LAB-MICRO',  name:'Urine Microalbumin',            price:8000,  category:'urinalysis',    sampleType:'Urine',  shortLabel:'Microalbumin',        description:'Random urine sample' },
        { code:'LAB-KET',    name:'Urine Ketones',                 price:2000,  category:'urinalysis',    sampleType:'Urine',  shortLabel:'Ketones',             description:'Fresh urine sample' },
        // 🧪 Hormones
        { code:'LAB-TFT',    name:'Thyroid Function Test (TFT)',   price:15000, category:'hormones',     sampleType:'Blood',  shortLabel:'TFT',                 description:'Serum tube' },
        { code:'LAB-TSH',    name:'TSH - Thyroid Stimulating Hormone', price:8000, category:'hormones',  sampleType:'Blood',  shortLabel:'TSH',                 description:'Serum tube' },
        { code:'LAB-T3',     name:'T3 - Triiodothyronine',         price:8000,  category:'hormones',     sampleType:'Blood',  shortLabel:'T3',                  description:'Serum tube' },
        { code:'LAB-T4',     name:'T4 - Thyroxine',                price:8000,  category:'hormones',     sampleType:'Blood',  shortLabel:'T4',                  description:'Serum tube' },
        { code:'LAB-FSH',    name:'Fertility Hormones (FSH, LH)',  price:15000, category:'hormones',     sampleType:'Blood',  shortLabel:'FSH / LH',            description:'Serum tube, day 3 of cycle' },
        { code:'LAB-CORT',   name:'Cortisol Level',                price:10000, category:'hormones',     sampleType:'Blood',  shortLabel:'Cortisol',            description:'8 AM sample preferred' },
        { code:'LAB-PROL',   name:'Prolactin',                     price:10000, category:'hormones',     sampleType:'Blood',  shortLabel:'Prolactin',           description:'Serum tube' },
        { code:'LAB-TESTO',  name:'Testosterone',                  price:12000, category:'hormones',     sampleType:'Blood',  shortLabel:'Testosterone',        description:'Morning sample' },
        { code:'LAB-ESTR',   name:'Estrogen (Estradiol)',          price:12000, category:'hormones',     sampleType:'Blood',  shortLabel:'Estradiol',           description:'Serum tube' },
        // 🧫 Serology
        { code:'LAB-HIV',    name:'HIV Test',                      price:3000,  category:'serology',     sampleType:'Blood',  shortLabel:'HIV',                 description:'Serum tube, consent required' },
        { code:'LAB-HBSAG',  name:'Hepatitis B Surface Antigen (HBsAg)', price:4000, category:'serology', sampleType:'Blood',  shortLabel:'HBsAg',               description:'Serum tube' },
        { code:'LAB-HCV',    name:'Hepatitis C Antibody',          price:5000,  category:'serology',     sampleType:'Blood',  shortLabel:'HCV',                 description:'Serum tube' },
        { code:'LAB-RPR',    name:'Syphilis Test (RPR/VDRL)',      price:3500,  category:'serology',     sampleType:'Blood',  shortLabel:'RPR',                 description:'Serum tube' },
        { code:'LAB-DENGUE', name:'Dengue Test',                   price:8000,  category:'serology',     sampleType:'Blood',  shortLabel:'Dengue',              description:'Serum tube' },
        { code:'LAB-CHIK',   name:'Chikungunya Test',              price:8000,  category:'serology',     sampleType:'Blood',  shortLabel:'Chikungunya',         description:'Serum tube' },
        { code:'LAB-ZIKA',   name:'Zika Virus Test',               price:8000,  category:'serology',     sampleType:'Blood',  shortLabel:'Zika',                description:'Serum tube' },
        { code:'LAB-RF',     name:'Rheumatoid Factor (RF)',        price:5000,  category:'serology',     sampleType:'Blood',  shortLabel:'RF',                  description:'Serum tube' },
        { code:'LAB-CRP',    name:'CRP - C-Reactive Protein',      price:6000,  category:'serology',     sampleType:'Blood',  shortLabel:'CRP',                 description:'Serum tube' },
        { code:'LAB-ASO',    name:'ASO - Anti-Streptolysin O',     price:5000,  category:'serology',     sampleType:'Blood',  shortLabel:'ASO',                 description:'Serum tube' },
        { code:'LAB-HPY',    name:'H. pylori Ag / Ab',             price:5000,  category:'serology',     sampleType:'Blood',  shortLabel:'H. pylori',           description:'Serum tube or stool' },
        { code:'LAB-WIDAL2', name:'Widal Test (Salmonella)',       price:4000,  category:'serology',     sampleType:'Blood',  shortLabel:'Widal Test',          description:'Serum tube' },
        { code:'LAB-BAGG',   name:'Brucella Agglutination',        price:5000,  category:'serology',     sampleType:'Blood',  shortLabel:'Brucella',            description:'Serum tube' },
        { code:'LAB-BHCG',   name:'Beta-HCG (Quantitative)',       price:8000,  category:'serology',     sampleType:'Blood',  shortLabel:'Beta-HCG',            description:'Serum tube' },
        { code:'LAB-PSA',    name:'PSA - Prostate Specific Antigen', price:12000, category:'serology',   sampleType:'Blood',  shortLabel:'PSA',                 description:'Serum tube' },
        { code:'LAB-DDIMER', name:'D-Dimer',                       price:20000, category:'serology',     sampleType:'Blood',  shortLabel:'D-Dimer',             description:'Citrate tube' },
        // 🦠 COVID-19
        { code:'LAB-COVIDAG', name:'COVID-19 Antigen Test',        price:5000,  category:'covid',        sampleType:'Swab',   shortLabel:'Antigen',             description:'Nasopharyngeal swab' },
        { code:'LAB-COVIDPCR', name:'COVID-19 PCR Test',           price:25000, category:'covid',        sampleType:'Swab',   shortLabel:'PCR',                 description:'Nasopharyngeal swab' },
        { code:'LAB-COVIDAB', name:'COVID-19 Antibody Test',       price:5000,  category:'covid',        sampleType:'Blood',  shortLabel:'Antibody',            description:'Serum tube' }
    ];

    /* Merge any missing master exam into the tariff (admin-managed data).
       Existing entries are NEVER overwritten — admin edits stay intact. */
    function ensureTariffSeeded() {
        try {
            var tariff = read(TARIFF_KEY, []);
            if (!Array.isArray(tariff)) tariff = [];
            var changed = false;
            SEED_LAB_EXAMS.forEach(function(seed) {
                var exists = tariff.some(function(t) { return String(t.code) === String(seed.code); });
                if (!exists) {
                    tariff.push({
                        code: seed.code, name: seed.name, dept: 'lab', price: seed.price,
                        category: seed.category, sampleType: seed.sampleType,
                        shortLabel: seed.shortLabel, description: seed.description,
                        addedBy: 'admin', addedAt: new Date().toISOString()
                    });
                    changed = true;
                }
            });
            if (changed) {
                write(TARIFF_KEY, tariff);
                try { emit('tariffUpdated', { count: tariff.length }); } catch(e){}
            }
        } catch(e) { console.warn('ensureTariffSeeded:', e); }
    }

    /* ══════════════════════════════════════════════════════════════
       MASTER PHARMACY CATALOG — Common Server data (NOT UI template).
       All medications + consumables used in the hospital (the same items
       that appear on bills). Seeded into pclinic_pharmacy_inventory AND
       the pricing tariff (dept 'pharmacy') so Billing shows them too.
       Admin can EDIT name/cost, ADD items, or DELETE any — changes
       propagate everywhere (Pharmacy tab, Billing catalogue, bills).
       Prices are typical Rwandan hospital prices in RWF.
       ══════════════════════════════════════════════════════════════ */
    var SEED_PHARMACY_ITEMS = [
        // ── Medications — Analgesics & Anti-inflammatory ──
        { code:'PHA-PARA500',  name:'Paracetamol 500 mg tablet',            category:'Tablet',     price:100,  unit:'tablet' },
        { code:'PHA-PARASYR',  name:'Paracetamol syrup 120 mg/5 mL (100 mL)', category:'Syrup',    price:1500, unit:'bottle' },
        { code:'PHA-IBU400',   name:'Ibuprofen 400 mg tablet',              category:'Tablet',     price:150,  unit:'tablet' },
        { code:'PHA-DICLO50',  name:'Diclofenac 50 mg tablet',              category:'Tablet',     price:150,  unit:'tablet' },
        { code:'PHA-TRAM50',   name:'Tramadol 50 mg capsule',               category:'Capsule',    price:300,  unit:'capsule' },
        // ── Antibiotics ──
        { code:'PHA-AMOX500',  name:'Amoxicillin 500 mg capsule',           category:'Capsule',    price:300,  unit:'capsule' },
        { code:'PHA-AMOXSYR',  name:'Amoxicillin syrup 125 mg/5 mL (100 mL)', category:'Syrup',    price:2000, unit:'bottle' },
        { code:'PHA-AMP1G',    name:'Ampicillin 1 g injection',             category:'Injection',  price:500,  unit:'vial' },
        { code:'PHA-CEFTR1G',  name:'Ceftriaxone 1 g vial',                 category:'Injection',  price:2000, unit:'vial' },
        { code:'PHA-AZIT500',  name:'Azithromycin 500 mg tablet',           category:'Tablet',     price:800,  unit:'tablet' },
        { code:'PHA-CIPRO500', name:'Ciprofloxacin 500 mg tablet',          category:'Tablet',     price:500,  unit:'tablet' },
        { code:'PHA-METRO250', name:'Metronidazole 250 mg tablet',          category:'Tablet',     price:200,  unit:'tablet' },
        { code:'PHA-DOXY100',  name:'Doxycycline 100 mg capsule',           category:'Capsule',    price:200,  unit:'capsule' },
        { code:'PHA-COTRI480', name:'Cotrimoxazole 480 mg tablet',          category:'Tablet',     price:200,  unit:'tablet' },
        { code:'PHA-GENT80',   name:'Gentamicin 80 mg injection',           category:'Injection',  price:400,  unit:'ampoule' },
        // ── Antifungals ──
        { code:'PHA-FLUC150',  name:'Fluconazole 150 mg capsule',           category:'Capsule',    price:1000, unit:'capsule' },
        { code:'PHA-NYSTSYR',  name:'Nystatin oral suspension (30 mL)',     category:'Syrup',      price:1500, unit:'bottle' },
        { code:'PHA-CLOTCRM',  name:'Clotrimazole 1% cream (20 g)',         category:'Cream',      price:1000, unit:'tube' },
        { code:'PHA-BETACRM',  name:'Betamethasone cream (15 g)',           category:'Cream',      price:1500, unit:'tube' },
        { code:'PHA-SILVCRM',  name:'Silver sulfadiazine 1% cream (50 g)',  category:'Cream',      price:2000, unit:'tube' },
        // ── Corticosteroids ──
        { code:'PHA-DEXA4',    name:'Dexamethasone 4 mg/mL injection',      category:'Injection',  price:500,  unit:'ampoule' },
        { code:'PHA-DEXA05',   name:'Dexamethasone 0.5 mg tablet',          category:'Tablet',     price:100,  unit:'tablet' },
        { code:'PHA-PRED5',    name:'Prednisolone 5 mg tablet',             category:'Tablet',     price:100,  unit:'tablet' },
        { code:'PHA-HYDRO100', name:'Hydrocortisone 100 mg injection',      category:'Injection',  price:800,  unit:'vial' },
        // ── Emergency & Respiratory ──
        { code:'PHA-ADREN1',   name:'Adrenaline 1 mg/mL ampoule',           category:'Injection',  price:800,  unit:'ampoule' },
        { code:'PHA-SALBINH',  name:'Salbutamol inhaler (200 doses)',       category:'Other',      price:5000, unit:'inhaler' },
        { code:'PHA-SALBNEB',  name:'Salbutamol nebule 2.5 mg',             category:'Other',      price:300,  unit:'nebule' },
        { code:'PHA-DIAZ5',    name:'Diazepam 5 mg tablet',                 category:'Tablet',     price:100,  unit:'tablet' },
        // ── Gastrointestinal ──
        { code:'PHA-OMEP20',   name:'Omeprazole 20 mg capsule',             category:'Capsule',    price:300,  unit:'capsule' },
        { code:'PHA-ALBEN400', name:'Albendazole 400 mg tablet',            category:'Tablet',     price:300,  unit:'tablet' },
        { code:'PHA-MEBEN100', name:'Mebendazole 100 mg tablet',            category:'Tablet',     price:200,  unit:'tablet' },
        { code:'PHA-ORS',      name:'Oral Rehydration Salts sachet (1 L)',  category:'Other',      price:300,  unit:'sachet' },
        // ── Antimalarials ──
        { code:'PHA-COARTEM',  name:'Artemether-Lumefantrine adult pack (Coartem)', category:'Tablet', price:1500, unit:'pack' },
        { code:'PHA-ARTES60',  name:'Artesunate 60 mg injection',           category:'Injection',  price:1200, unit:'vial' },
        { code:'PHA-QUIN300',  name:'Quinine 300 mg tablet',                category:'Tablet',     price:300,  unit:'tablet' },
        // ── Vitamins & Minerals ──
        { code:'PHA-ZINC20',   name:'Zinc sulfate 20 mg tablet',            category:'Tablet',     price:100,  unit:'tablet' },
        { code:'PHA-FOLIC5',   name:'Folic acid 5 mg tablet',               category:'Tablet',     price:50,   unit:'tablet' },
        { code:'PHA-FEFOL',    name:'Ferrous sulfate + folic acid tablet',  category:'Tablet',     price:100,  unit:'tablet' },
        { code:'PHA-VITBCO',   name:'Vitamin B complex tablet',             category:'Tablet',     price:100,  unit:'tablet' },
        { code:'PHA-MULTISYR', name:'Multivitamin syrup (100 mL)',          category:'Syrup',      price:2000, unit:'bottle' },
        { code:'PHA-VITA',     name:'Vitamin A capsule 200,000 IU',         category:'Capsule',    price:50,   unit:'capsule' },
        // ── Obstetrics ──
        { code:'PHA-OXYT10',   name:'Oxytocin 10 IU ampoule',               category:'Injection',  price:500,  unit:'ampoule' },
        { code:'PHA-MISO200',  name:'Misoprostol 200 µg tablet',            category:'Tablet',     price:500,  unit:'tablet' },
        { code:'PHA-MAGSO4',   name:'Magnesium sulfate 50% injection',      category:'Injection',  price:500,  unit:'ampoule' },
        { code:'PHA-CALGLC',   name:'Calcium gluconate 10% injection',      category:'Injection',  price:800,  unit:'ampoule' },
        // ── IV Fluids ──
        { code:'PHA-NS500',    name:'Sodium chloride 0.9% 500 mL infusion', category:'Infusion',   price:1000, unit:'bag' },
        { code:'PHA-NS1000',   name:'Sodium chloride 0.9% 1000 mL infusion', category:'Infusion',  price:1500, unit:'bag' },
        { code:'PHA-RL500',    name:'Ringer Lactate 500 mL infusion',       category:'Infusion',   price:1200, unit:'bag' },
        { code:'PHA-DX500',    name:'Dextrose 5% 500 mL infusion',          category:'Infusion',   price:1200, unit:'bag' },
        { code:'PHA-DX5050',   name:'Dextrose 50% 50 mL',                   category:'Injection',  price:500,  unit:'vial' },
        { code:'PHA-WFI10',    name:'Water for injection 10 mL',            category:'Injection',  price:200,  unit:'ampoule' },
        // ── Consumables — Injection & Infusion ──
        { code:'PHA-SYR5',     name:'Syringe 5 mL sterile',                 category:'Consumable', price:150,  unit:'piece' },
        { code:'PHA-SYR10',    name:'Syringe 10 mL sterile',                category:'Consumable', price:200,  unit:'piece' },
        { code:'PHA-CANNULA',  name:'IV cannula 18G / 20G / 22G',           category:'Consumable', price:400,  unit:'piece' },
        { code:'PHA-GIVSET',   name:'IV giving set (infusion set)',         category:'Consumable', price:500,  unit:'set' },
        // ── Consumables — Wound & Dressing ──
        { code:'PHA-GLOVES',   name:'Sterile gloves (pair)',                category:'Consumable', price:500,  unit:'pair' },
        { code:'PHA-GAUZE',    name:'Sterile gauze compress 10×10',         category:'Consumable', price:300,  unit:'piece' },
        { code:'PHA-COTTON',   name:'Cotton roll 500 g',                    category:'Consumable', price:800,  unit:'roll' },
        { code:'PHA-BANDAGE',  name:'Elastic bandage 10 cm',                category:'Consumable', price:1000, unit:'roll' },
        { code:'PHA-CREPE',    name:'Crepe bandage 15 cm',                  category:'Consumable', price:800,  unit:'roll' },
        { code:'PHA-PLASTER',  name:'Adhesive plaster (roll)',              category:'Consumable', price:700,  unit:'roll' },
        { code:'PHA-BLADE',    name:'Surgical blade No. 11 / 22',           category:'Consumable', price:200,  unit:'piece' },
        { code:'PHA-SUTURE',   name:'Surgical suture (Vicryl 2-0)',         category:'Consumable', price:3000, unit:'sachet' },
        { code:'PHA-STERI',    name:'Skin closure strips (Steri-strip)',    category:'Consumable', price:1500, unit:'pack' },
        // ── Consumables — Antiseptics ──
        { code:'PHA-ALCSWAB',  name:'Alcohol swab',                         category:'Consumable', price:50,   unit:'piece' },
        { code:'PHA-BETADINE', name:'Povidone iodine 10% solution (200 mL)', category:'Consumable', price:1500, unit:'bottle' },
        { code:'PHA-CHLORHEX', name:'Chlorhexidine 5% solution (500 mL)',   category:'Consumable', price:2000, unit:'bottle' },
        { code:'PHA-H2O2',     name:'Hydrogen peroxide 3% (200 mL)',        category:'Consumable', price:800,  unit:'bottle' },
        // ── Consumables — Catheters & Tubes ──
        { code:'PHA-FOLEY16',  name:'Foley urinary catheter 16F',           category:'Consumable', price:1500, unit:'piece' },
        { code:'PHA-URBAG',    name:'Urine drainage bag 2 L',               category:'Consumable', price:500,  unit:'piece' },
        { code:'PHA-NGT16',    name:'Nasogastric tube 16F',                 category:'Consumable', price:800,  unit:'piece' },
        { code:'PHA-NEBKIT',   name:'Nebulizer mask kit (adult)',           category:'Consumable', price:1500, unit:'kit' },
        // ── Consumables — General ──
        { code:'PHA-SPECCONT', name:'Specimen container sterile',           category:'Consumable', price:200,  unit:'piece' },
        { code:'PHA-EDTATUBE', name:'EDTA tube',                            category:'Consumable', price:200,  unit:'piece' },
        { code:'PHA-SURGMASK', name:'Surgical mask (box of 50)',            category:'Consumable', price:5000, unit:'box' },
        { code:'PHA-EXGLOVES', name:'Examination gloves (box of 100)',      category:'Consumable', price:6000, unit:'box' },
        { code:'PHA-APRON',    name:'Disposable apron',                     category:'Consumable', price:300,  unit:'piece' },
        { code:'PHA-TONGDEP',  name:'Tongue depressor (box)',               category:'Consumable', price:1000, unit:'box' }
    ];

    /* Seed the pharmacy catalog into the Common Server:
       1) pclinic_pharmacy_inventory (Pharmacy tab — stock + price)
       2) pclinic_tariff dept 'pharmacy' (Billing catalogue)
       Existing entries are NEVER overwritten — admin edits stay intact. */
    function ensurePharmacySeeded() {
        try {
            var inv = read('pclinic_pharmacy_inventory', []);
            if (!Array.isArray(inv)) inv = [];
            var tariff = read(TARIFF_KEY, []);
            if (!Array.isArray(tariff)) tariff = [];
            var changed = false;

            SEED_PHARMACY_ITEMS.forEach(function(seed) {
                var inInv = inv.some(function(it) {
                    return String(it.code) === String(seed.code) ||
                           String(it.name || '').toLowerCase() === String(seed.name).toLowerCase();
                });
                if (!inInv) {
                    inv.push({
                        id: 'PHARM-' + seed.code,
                        code: seed.code,
                        name: seed.name,
                        category: seed.category,
                        qty: 0,
                        price: seed.price,
                        unit: seed.unit,
                        addedBy: 'admin',
                        addedAt: new Date().toISOString()
                    });
                    changed = true;
                }
                var inTariff = tariff.some(function(t) { return String(t.code) === String(seed.code); });
                if (!inTariff) {
                    tariff.push({
                        code: seed.code, name: seed.name, dept: 'pharmacy', price: seed.price,
                        category: seed.category, sampleType: '', shortLabel: seed.name,
                        description: seed.unit || '', addedBy: 'admin', addedAt: new Date().toISOString()
                    });
                    changed = true;
                }
            });

            if (changed) {
                write('pclinic_pharmacy_inventory', inv);
                write(TARIFF_KEY, tariff);
                try { emit('tariffUpdated', { count: tariff.length }); } catch(e){}
                try { window.dispatchEvent(new Event('storage')); } catch(e){}
            }
        } catch(e) { console.warn('ensurePharmacySeeded:', e); }
    }

    /* ══════════════════════════════════════════════════════════════
       MASTER ACTS & PROCEDURES CATALOG — Common Server data.
       All medical acts and procedures billable at the hospital.
       Seeded into pclinic_tariff (dept 'procedure' + 'theatre') as
       admin-managed entries so they appear in the Billing catalogue
       and the Admin "Acts" tab, where they can be edited/deleted.
       Prices are typical Rwandan hospital prices in RWF.
       ══════════════════════════════════════════════════════════════ */
    var SEED_ACT_ITEMS = [
        // ── Medical Acts (dept procedure, type Act) ──
        { code:'ACT-DRESS',   name:'Wound Dressing (Pansement)',        dept:'procedure', type:'Act',     price:4000,   description:'Cleaning + dressing, per session' },
        { code:'ACT-BREND',   name:'Burn Dressing',                     dept:'procedure', type:'Act',     price:6000,   description:'Burn wound care, per session' },
        { code:'ACT-INJ',     name:'Injection (IM/IV)',                 dept:'procedure', type:'Act',     price:2000,   description:'Per injection' },
        { code:'ACT-CANN',    name:'IV Cannulation',                    dept:'procedure', type:'Act',     price:3000,   description:'Cannula insertion' },
        { code:'ACT-NEB',     name:'Nebulisation Session',              dept:'procedure', type:'Act',     price:5000,   description:'Per session' },
        { code:'ACT-ECG',     name:'ECG (Electrocardiogram)',           dept:'procedure', type:'Act',     price:10000,  description:'12-lead ECG recording' },
        { code:'ACT-VACC',    name:'Vaccination',                       dept:'procedure', type:'Act',     price:3000,   description:'Per dose (vaccine cost separate)' },
        { code:'ACT-CATH',    name:'Urinary Catheterisation',           dept:'procedure', type:'Act',     price:8000,   description:'Foley insertion' },
        { code:'ACT-O2',      name:'Oxygen Therapy (per hour)',         dept:'procedure', type:'Act',     price:5000,   description:'Mask or nasal prongs' },
        { code:'ACT-PHOTO',   name:'Phototherapy Session (Neonate)',    dept:'procedure', type:'Act',     price:10000,  description:'Jaundice treatment session' },
        { code:'ACT-INCU',    name:'Incubator Care (per day)',          dept:'procedure', type:'Act',     price:15000,  description:'Neonatal incubator' },
        { code:'ACT-DIAL',    name:'Haemodialysis Session',             dept:'procedure', type:'Act',     price:120000, description:'Per session' },
        { code:'ACT-PDIA',    name:'Peritoneal Dialysis Session',       dept:'procedure', type:'Act',     price:80000,  description:'Per session' },
        { code:'ACT-TRANS',   name:'Blood Transfusion (Unit Setup)',    dept:'procedure', type:'Act',     price:25000,  description:'Setup + monitoring, blood cost separate' },
        { code:'ACT-AMB',     name:'Ambulance Transfer',                dept:'procedure', type:'Act',     price:30000,  description:'Within Kigali' },
        { code:'ACT-EARSY',   name:'Ear Syringing',                     dept:'procedure', type:'Act',     price:5000,   description:'Wax removal' },
        { code:'ACT-FBR',     name:'Foreign Body Removal',              dept:'procedure', type:'Act',     price:8000,   description:'Ear / nose / eye' },
        { code:'ACT-PAP',     name:'Pap Smear',                         dept:'procedure', type:'Act',     price:5000,   description:'Cervical screening' },
        { code:'ACT-ANC',     name:'Antenatal Consultation (ANC)',      dept:'procedure', type:'Act',     price:3000,   description:'Per visit' },
        { code:'ACT-DELV',    name:'Normal Delivery (SVD)',             dept:'procedure', type:'Act',     price:50000,  description:'Vaginal delivery' },
        { code:'ACT-CS',      name:'Caesarean Section (C-Section)',     dept:'theatre',   type:'Theatre', price:250000, description:'Surgical delivery' },
        { code:'ACT-MVA',     name:'Manual Vacuum Aspiration (MVA)',    dept:'procedure', type:'Act',     price:30000,  description:'Uterine evacuation' },
        { code:'ACT-DC',      name:'Dilatation & Curettage (D&C)',      dept:'theatre',   type:'Theatre', price:60000,  description:'Surgical evacuation' },
        { code:'ACT-LP',      name:'Lumbar Puncture',                   dept:'procedure', type:'Act',     price:15000,  description:'CSF tap' },
        { code:'ACT-PARA',    name:'Paracentesis (Ascitic Tap)',        dept:'procedure', type:'Act',     price:15000,  description:'Abdominal fluid drainage' },
        { code:'ACT-THORA',   name:'Thoracentesis (Pleural Tap)',       dept:'procedure', type:'Act',     price:20000,  description:'Chest fluid drainage' },
        { code:'ACT-CHESTT',  name:'Chest Tube Insertion',              dept:'procedure', type:'Act',     price:40000,  description:'Intercostal drain' },
        { code:'ACT-ENDO',    name:'Upper GI Endoscopy',                dept:'procedure', type:'Act',     price:80000,  description:'Oesophago-gastroscopy' },
        { code:'ACT-COLO',    name:'Colonoscopy',                       dept:'procedure', type:'Act',     price:100000, description:'Full colonoscopy' },
        { code:'ACT-PHYS',    name:'Physiotherapy Session',             dept:'procedure', type:'Act',     price:10000,  description:'Per session' },
        { code:'ACT-DENTX',   name:'Dental Extraction',                 dept:'procedure', type:'Act',     price:10000,  description:'Simple extraction' },
        // ── Minor Procedures ──
        { code:'PROC-SUT',    name:'Suturing (Simple)',                 dept:'procedure', type:'Procedure', price:12000, description:'Simple wound suture' },
        { code:'PROC-SUTC',   name:'Suturing (Complex)',                dept:'procedure', type:'Procedure', price:25000, description:'Complex wound suture' },
        { code:'PROC-PLAS',   name:'Plaster / Cast Application',        dept:'procedure', type:'Procedure', price:20000, description:'Fracture immobilisation' },
        { code:'PROC-INC',    name:'Incision & Drainage',               dept:'procedure', type:'Procedure', price:15000, description:'Abscess drainage' },
        { code:'PROC-CIRC',   name:'Circumcision',                      dept:'procedure', type:'Procedure', price:35000, description:'Male circumcision' },
        { code:'PROC-BIOP',   name:'Biopsy',                            dept:'procedure', type:'Procedure', price:30000, description:'Tissue sampling' },
        { code:'PROC-EXC',    name:'Excision of Skin Lesion',           dept:'procedure', type:'Procedure', price:20000, description:'Small lesion excision' },
        // ── Theatre / Surgery ──
        { code:'THE-MIN',     name:'Minor Surgery',                      dept:'theatre', type:'Theatre', price:80000,  description:'Minor theatre procedure' },
        { code:'THE-MAJ',     name:'Major Surgery',                      dept:'theatre', type:'Theatre', price:250000, description:'Major theatre procedure' },
        { code:'THE-APP',     name:'Appendicectomy',                     dept:'theatre', type:'Theatre', price:300000, description:'Appendectomy' },
        { code:'THE-HERN',    name:'Herniorrhaphy',                      dept:'theatre', type:'Theatre', price:250000, description:'Hernia repair' },
        { code:'THE-HYDRO',   name:'Hydrocelectomy',                     dept:'theatre', type:'Theatre', price:150000, description:'Hydrocele repair' },
        { code:'THE-HYST',    name:'Hysterectomy',                       dept:'theatre', type:'Theatre', price:400000, description:'Uterus removal' },
        { code:'THE-MYOM',    name:'Myomectomy',                         dept:'theatre', type:'Theatre', price:350000, description:'Fibroid removal' },
        { code:'THE-LAP',     name:'Laparotomy',                         dept:'theatre', type:'Theatre', price:350000, description:'Open abdominal surgery' },
        { code:'THE-THY',     name:'Thyroidectomy',                      dept:'theatre', type:'Theatre', price:300000, description:'Thyroid removal' },
        { code:'THE-MAST',    name:'Mastectomy',                         dept:'theatre', type:'Theatre', price:400000, description:'Breast removal' },
        { code:'THE-PROST',   name:'Prostatectomy',                      dept:'theatre', type:'Theatre', price:450000, description:'Prostate removal' },
        { code:'THE-AMP',     name:'Amputation',                         dept:'theatre', type:'Theatre', price:300000, description:'Limb amputation' },
        { code:'THE-ORIF',    name:'ORIF — Fracture Fixation',           dept:'theatre', type:'Theatre', price:350000, description:'Open reduction internal fixation' },
        { code:'THE-GRAFT',   name:'Skin Graft',                         dept:'theatre', type:'Theatre', price:250000, description:'Grafting procedure' }
    ];

    /* Seed the acts & procedures catalog into the Common Server tariff.
       Existing entries are NEVER overwritten — admin edits stay intact. */
    function ensureActsSeeded() {
        try {
            var tariff = read(TARIFF_KEY, []);
            if (!Array.isArray(tariff)) tariff = [];
            var changed = false;
            SEED_ACT_ITEMS.forEach(function(seed) {
                var exists = tariff.some(function(t) { return String(t.code) === String(seed.code); });
                if (!exists) {
                    tariff.push({
                        code: seed.code, name: seed.name, dept: seed.dept, price: seed.price,
                        actType: seed.type, category: seed.type, sampleType: '',
                        shortLabel: seed.name, description: seed.description,
                        addedBy: 'admin', addedAt: new Date().toISOString()
                    });
                    changed = true;
                }
            });
            if (changed) {
                write(TARIFF_KEY, tariff);
                try { emit('tariffUpdated', { count: tariff.length }); } catch(e){}
            }
        } catch(e) { console.warn('ensureActsSeeded:', e); }
    }

    function purgeAllTemplateData() {
        try {
            var templateNames = [
                'john kamau', 'grace wanjiru', 'amina hassan', 'samuel otieno', 'peter omondi',
                'mary wanjiku', 'david mwangi', 'jane doe', 'john doe', 'peter njoroge',
                'paul kamau', 'esther wanjiku', 'ann muthua', 'joseph kamau', 'david otieno',
                'susan njeri', 'jane smith', 'peter m.', 'peter m'
            ];

            // 1) Patients: remove template-name patients + fabricated labRequests
            var patients = read('pclinic_patients', []);
            var patChanged = false;
            if (Array.isArray(patients)) {
                patients = patients.filter(function (p) {
                    if (!p) return false;
                    var nm = String(p.name || ((p.firstName || '') + ' ' + (p.lastName || '')) || '').toLowerCase().trim();
                    return templateNames.indexOf(nm) === -1;
                });
                patients.forEach(function (p) {
                    if (Array.isArray(p.labRequests)) {
                        var before = p.labRequests.length;
                        p.labRequests = p.labRequests.filter(function (r) {
                            if (!r) return false;
                            // Fabricated signature: has testName, no requestedBy, no timestamp
                            if (r.testName && !r.requestedBy && !r.timestamp) return false;
                            return true;
                        });
                        if (p.labRequests.length !== before) patChanged = true;
                    }
                });
                if (patChanged || patients.length !== read('pclinic_patients', []).length) {
                    try { if (typeof savePatientsToStorage === 'function') savePatientsToStorage(patients); else write('pclinic_patients', patients); } catch(e){ write('pclinic_patients', patients); }
                }
            }

            // 2) Orders: remove fabricated lab orders (template signature)
            purgeTemplateLabOrdersFromStorage();
            var orders = read(ORDERS_KEY, []);
            var ordChanged = false;
            if (Array.isArray(orders)) {
                var kept = orders.filter(function (o) {
                    if (!o) return true;
                    if (o.type !== 'lab' && o.dept !== 'lab') return true;
                    var idOk = /^LAB-\d+-10[12]$/.test(String(o.id || ''));
                    var byOk = String(o.orderedBy || '') === 'Dr. Mutua (CHUK OPD)';
                    var noteOk = String(o.notes || '').indexOf('Fasting specimen required') === 0;
                    if (idOk && byOk && noteOk) return false; // fabricated
                    return true;
                });
                if (kept.length !== orders.length) { write(ORDERS_KEY, kept); ordChanged = true; }
            }

            // 3) Bills: template bills
            purgeTemplateBillsFromStorage();

            // 4) Tariff: remove UNMODIFIED template entries (no addedBy marker)
            var tariff = read(TARIFF_KEY, []);
            var tChanged = false;
            if (Array.isArray(tariff) && tariff.length) {
                var keptT = tariff.filter(function (t) {
                    if (!t) return true;
                    if (t.addedBy) return true; // admin-added → keep
                    var dflt = DEFAULT_TARIFF.filter(function (d) { return d.code === t.code; })[0];
                    if (dflt && Number(t.price) === Number(dflt.price)) return false; // untouched template
                    return true;
                });
                if (keptT.length !== tariff.length) { write(TARIFF_KEY, keptT); tChanged = true; }
            }

            if (patChanged || ordChanged || tChanged) {
                try { window.dispatchEvent(new Event('storage')); } catch(e){}
                console.log('🧹 PClinic template-data purge completed (patients/labRequests/orders/bills/tariff).');
            }
        } catch(e) { console.warn('purgeAllTemplateData:', e); }
    }

    function getBills(filter) {
        purgeTemplateBillsFromStorage();
        var all = aggregateCommonServerPatientBills(read(BILLS_KEY, []));
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
        trackedSync('bills', bill.id, bill);
        emit('billsUpdated', { bill: bill });
        notifyRole('cashier', 'New bill ' + bill.number + ' — ' + money(bill.total) +
                              ' for ' + (bill.patientName || 'patient'), 'billing');
        return bill;
    }

    /* payBill(id, { amount, method, ref }) → returns a receipt */
    function payBill(id, payment) {
        var all = read(BILLS_KEY, []);
        var i = all.findIndex(function (b) { return String(b.id) === String(id) || String(b.number) === String(id); });
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
        if (!bill.payments) bill.payments = [];
        bill.payments.push(rec);
        bill.paid = bill.payments.reduce(function (s, p) { return s + p.amount; }, 0);
        bill.balance = Math.max(0, bill.total - bill.paid);
        bill.status = bill.balance === 0 ? 'paid' : 'partial';
        if (bill.status === 'paid') {
            bill.paidAt = new Date().toISOString();
            bill.paidBy = staff.name;
        }
        write(BILLS_KEY, all);
        trackedSync('bills', bill.id, bill);
        emit('billsUpdated', { bill: bill });

        return {
            receiptNo: 'RCT-' + rec.id.slice(-8).toUpperCase(),
            bill: bill, payment: rec,
            issuedBy: staff.name, issuedAt: rec.at
        };
    }

    function cancelBill(id, reason) {
        var all = read(BILLS_KEY, []);
        var i = all.findIndex(function (b) { return String(b.id) === String(id) || String(b.number) === String(id); });
        if (i === -1) return null;
        all[i].status = 'cancelled';
        all[i].cancelReason = reason || '';
        all[i].cancelledBy = who().name;
        all[i].cancelledAt = new Date().toISOString();
        write(BILLS_KEY, all);
        trackedSync('bills', id, all[i]);
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
            (b.payments || []).forEach(function (p) {
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
        create: createOrder, createAsync: createOrderAsync,
        update: updateOrder, updateAsync: updateOrderAsync, applyServerPatch: applyServerOrderPatch,
        cancel: cancelOrder, complete: completeOrder, list: getOrders, pending: pendingCount, DEPT_OF: DEPT_OF,
        purge: purgeTemplateLabOrdersFromStorage, aggregate: aggregateCommonServerLabOrders,
        purgeAllTemplateData: purgeAllTemplateData,
        ensureTariffSeeded: ensureTariffSeeded, SEED_LAB_EXAMS: SEED_LAB_EXAMS,
        ensurePharmacySeeded: ensurePharmacySeeded, SEED_PHARMACY_ITEMS: SEED_PHARMACY_ITEMS,
        ensureActsSeeded: ensureActsSeeded, SEED_ACT_ITEMS: SEED_ACT_ITEMS,
        retry: function (id) { return retrySync('orders', id); }
    };
    window.pcBilling = {
        create: createBill, pay: payBill, cancel: cancelBill,
        list: getBills, revenue: revenueSummary, money: money, purge: purgeTemplateBillsFromStorage,
        retry: function (id) { return retrySync('bills', id); }
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

    // ⛔ NO TEMPLATE DATA: purge leftovers, then seed the REAL master
    // lab exam catalog into the Common Server tariff (admin-managed).
    purgeAllTemplateData();
    ensureTariffSeeded();
    ensurePharmacySeeded();
    ensureActsSeeded();
    console.log('🧾 PClinic orders/billing/messaging ready');
})();
