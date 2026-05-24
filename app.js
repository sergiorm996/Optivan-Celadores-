// ═══════════════════════════════════════════════════
//  OPTIVAN CELADORES — App de gestión para celadores FTTH
//  Firebase Realtime Database · ES Module
// ═══════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getDatabase, ref, set, push, get, remove, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

// ─── FIREBASE INIT ────────────────────────────────
const db = getDatabase(initializeApp({
    apiKey: "AIzaSyB5-_AkwMiGibT5tsA-epGULCDznnz8ICE",
    authDomain: "optivan-745c9.firebaseapp.com",
    databaseURL: "https://optivan-745c9-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "optivan-745c9",
    storageBucket: "optivan-745c9.firebasestorage.app",
    messagingSenderId: "147359920451",
    appId: "1:147359920451:web:c2ddd3d0ab86a8992a7ff6"
}));

// ─── CONFIG VAN ───────────────────────────────────
const VAN = {
    get id() { return localStorage.getItem('cel_van_id') || 'celador_1'; },
    get matricula() { return localStorage.getItem('cel_matricula') || '0000-XXX'; },
    get equipo() { return localStorage.getItem('cel_equipo') || ''; }
};

// ─── ESTADO ───────────────────────────────────────
let E = {
    pantalla: 'inicio',
    bobinas: [],       // bobinas individuales físicas
    stockMods: [],
    instalaciones: [],
    calDias: [], calAnio: new Date().getFullYear(), calMes: new Date().getMonth() + 1,
    diaSel: null, instDia: [],

    // Formulario tendido cable (2 pasos) + raiser (tab)
    fTend: {
        modo: 'cable',       // 'cable' | 'raiser'
        paso: 1,
        // Cable paso 1
        tipoOrigen: 'cto', tipoDestino: 'cto',
        origen: '', destino: '', pon: '',
        // Cable paso 2: tramos array
        tramos: [],          // [{tipo, metros, bobinaId, bobinaRef}]
        tramoCurrent: { tipo: 'fachada', metros: '', bobinaId: '' },
        // Raiser
        ctoRaiser: '',
        raisers: [],         // [{bobinaId, bobinaRef, metros, nombre}]
        raiserCurrent: { bobinaId: '', metros: '', nombre: '' }
    },

    // Formulario malla
    fMalla: { puntoA: '', puntoB: '', metros: '' },

    // Formulario módulos
    fModulos: {
        pon: '', tipoPunto: 'cto', punto: '',
        modulos: [],         // módulos añadidos a esta sesión
        modCurrent: { tipo: '', conCDs: false, cds: [{ cantidad: '', modelo: '' }] }
    },

    // Editar material
    fMat: { seccion: 'bobinas', nuevaRef: '', nuevaTipo: '12kp', nuevaTotal: '', modulo: '', cantidad: '' },

    // Avisos / límites (solo módulos)
    fLim: { item: '', limite: '' }
};

// ─── CATÁLOGOS ────────────────────────────────────
const CABLES = [
    { id: '12kp',      l: 'Cable 12KP',    desc: 'Interconexión exterior entre CTOs' },
    { id: '12kt',      l: 'Cable 12KT',    desc: 'Interconexión interior CTO' },
    { id: 'raiser_16', l: 'Raiser 16FO',   desc: 'Vertical edificio' },
    { id: 'raiser_24', l: 'Raiser 24FO',   desc: 'Vertical edificio' },
    { id: 'raiser_32', l: 'Raiser 32FO',   desc: 'Vertical edificio' },
    { id: 'raiser_48', l: 'Raiser 48FO',   desc: 'Vertical edificio' }
];

const MODS = [
    { id:'Z24',      l:'Z24' }, { id:'MOD32', l:'MOD32' }, { id:'MOD48', l:'MOD48' },
    { id:'EMB001',   l:'EMB 001' }, { id:'EMB002', l:'EMB 002' },
    { id:'OTG08',    l:'OTG-08' }, { id:'OTG16', l:'OTG-16' },
    { id:'HTCS206',  l:'HTCS 206' }
];

const MODELOS_CD = [
    { id: 'HTTB002',  l: 'HTTB002' },
    { id: 'HTTB001',  l: 'HTTB001' },
    { id: 'HTTB002B', l: 'HTTB002 Blanca' },
    { id: 'MINI_CD',  l: 'Mini CD' }
];

const TIPOS_TRAMO = [
    { id: 'fachada',    l: 'Fachada' },
    { id: 'canalizado', l: 'Canalizado' },
    { id: 'interior',   l: 'Interior' },
    { id: 'poste',      l: 'Poste' }
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DSEM  = ['L','M','X','J','V','S','D'];
const VAN_IDS = ['celador_1','celador_2','celador_3','celador_4','celador_5','celador_6','celador_7','celador_8'];

const lc = id => (CABLES.find(c => c.id === id) || {}).l || id;
const lm = id => (MODS.find(m => m.id === id) || (MODELOS_CD.find(m => m.id === id)) || {}).l || id;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

function toast(msg, tipo) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast mostrar ' + (tipo || '');
    setTimeout(() => t.className = 'toast', 2800);
}

// ─── FIREBASE: BOBINAS ────────────────────────────
async function loadBobinas() {
    try {
        const snap = await get(ref(db, `bobinas/${VAN.id}`));
        E.bobinas = snap.exists()
            ? Object.entries(snap.val()).map(([id, v]) => ({ id, ...v }))
            : [];
    } catch(e) { E.bobinas = []; }
}

async function addBobina(refBob, tipo, total) {
    const r = push(ref(db, `bobinas/${VAN.id}`));
    await set(r, { ref: refBob, tipo, total: parseInt(total), usada: 0 });
}

async function updBobinaUsada(bobinaId, delta) {
    await runTransaction(ref(db, `bobinas/${VAN.id}/${bobinaId}`), b => {
        if (!b) return b;
        b.usada = (b.usada || 0) + delta;
        return b;
    });
}

async function removeBobina(bobinaId) {
    await remove(ref(db, `bobinas/${VAN.id}/${bobinaId}`));
}

// ─── FIREBASE: MÓDULOS (stock clásico) ────────────
async function loadMods() {
    try {
        const snap = await get(ref(db, `stock_cel/${VAN.id}`));
        const data = snap.exists() ? snap.val() : {};
        E.stockMods = MODS.map(m => {
            const i = data[m.id] || { cargada: 0, usada: 0, min: 1 };
            const actual = (i.cargada || 0) - (i.usada || 0);
            return {
                tipo: m.id, cat: 'mod',
                cargada: i.cargada || 0, usada: i.usada || 0, actual,
                min: i.min || 1,
                alerta: actual <= 0 ? 'SIN STOCK' : actual <= (i.min || 1) ? 'STOCK BAJO' : 'OK'
            };
        });
    } catch(e) { console.warn('loadMods:', e); E.stockMods = []; } // BUG#8 fix: error silencioso en lecturas
}

async function addStock(tipo, cant) {
    await runTransaction(ref(db, `stock_cel/${VAN.id}/${tipo}`), i => {
        i = i || { cargada: 0, usada: 0, min: 1 };
        i.cargada = (i.cargada || 0) + cant;
        return i;
    });
}

async function updStockMod(tipo, deltaUsada) {
    await runTransaction(ref(db, `stock_cel/${VAN.id}/${tipo}`), i => {
        i = i || { cargada: 0, usada: 0, min: 1 };
        i.usada = (i.usada || 0) + deltaUsada;
        return i;
    });
}

async function setMin(tipo, min) {
    await runTransaction(ref(db, `stock_cel/${VAN.id}/${tipo}`), i => {
        i = i || { cargada: 0, usada: 0, min: 0 };
        i.min = min;
        return i;
    });
}

// ─── FIREBASE: REGISTROS ──────────────────────────
async function saveTend(datos) {
    const f = new Date().toISOString().split('T')[0];
    await push(ref(db, `tend/${VAN.id}/${f}`), { ...datos, ts: Date.now() });
}

async function loadHoy() {
    const hoy = new Date().toISOString().split('T')[0];
    try {
        const s = await get(ref(db, `tend/${VAN.id}/${hoy}`));
        E.instalaciones = s.exists()
            ? Object.entries(s.val()).map(([id, v]) => ({ id, ...v }))
            : [];
    } catch(e) { E.instalaciones = []; }
}

async function loadDia(fecha) {
    try {
        const s = await get(ref(db, `tend/${VAN.id}/${fecha}`));
        E.instDia = s.exists() ? Object.entries(s.val()).map(([id, v]) => ({ id, ...v })) : [];
    } catch(e) { E.instDia = []; }
}

async function loadCal() {
    try {
        const s = await get(ref(db, `tend/${VAN.id}`));
        E.calDias = [];
        if (s.exists()) {
            const d = s.val(), m = String(E.calMes).padStart(2, '0');
            Object.keys(d).forEach(f => {
                if (f.startsWith(`${E.calAnio}-${m}`)) {
                    const regs = Object.values(d[f]);
                    const metros = regs.reduce((a, x) => {
                        if (Array.isArray(x.tramos)) return a + x.tramos.reduce((b, t) => b + (t.metros || 0), 0);
                        if (x.tramos && typeof x.tramos === 'object') return a + Object.values(x.tramos).reduce((b, v) => b + (parseInt(v)||0), 0);
                        if (x.metros) return a + x.metros;
                        return a;
                    }, 0);
                    E.calDias.push({ fecha: f, total: regs.length, metros });
                }
            });
        }
    } catch(e) { E.calDias = []; }
}

// ─── HELPERS ──────────────────────────────────────
function metrosRegistro(inst) {
    if (Array.isArray(inst.tramos)) return inst.tramos.reduce((a, t) => a + (t.metros || 0), 0);
    if (inst.tramos && typeof inst.tramos === 'object') return Object.values(inst.tramos).reduce((a, v) => a + (parseInt(v)||0), 0);
    if (inst.raisers) return inst.raisers.reduce((a, r) => a + (r.metros || 0), 0);
    return inst.metros || 0;
}

function labelPunto(tipo, codigo) {
    return `${tipo === 'cto' ? 'CTO' : 'EMP'} ${esc(codigo || '')}`;
}

function bobinaResto(b, tramosActuales = []) {
    const yaUsado = tramosActuales.filter(t => t.bobinaId === b.id).reduce((a, t) => a + (t.metros || 0), 0);
    return Math.max(0, b.total - (b.usada || 0) - yaUsado); // BUG#5 fix: nunca negativo
}

// ─── ICONOS SVG ───────────────────────────────────
const I = {
    back:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
    arrow:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
    arrowS: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
    box:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/></svg>',
    doc:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/></svg>',
    alert:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    check:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
    plus:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    bell:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    cal:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    cable:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="5" r="3"/><path d="M12 8v13"/><path d="M5 3l7 5 7-5"/></svg>',
    tool:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    trash:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
    gear:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    route:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
    malla:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
    mod:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>',
    raiser: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="20" x2="12" y2="4"/><polyline points="6 10 12 4 18 10"/></svg>',
    micBtn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F1720" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
};

// ─── HELPERS UI ───────────────────────────────────
function taBtnStyle(activo) {
    return activo
        ? 'background:var(--amarillo);color:var(--negro);border:none;border-radius:9px;padding:10px;flex:1;font-family:Poppins,sans-serif;font-size:14px;font-weight:600;cursor:pointer;'
        : 'background:transparent;color:var(--gris-texto);border:none;border-radius:9px;padding:10px;flex:1;font-family:Poppins,sans-serif;font-size:14px;font-weight:500;cursor:pointer;';
}
function tabWrap(html) {
    return `<div style="display:flex;gap:3px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:3px;margin-bottom:20px;">${html}</div>`;
}
function btnSel(activo) {
    return activo
        ? 'background:var(--amarillo);color:var(--negro);border:none;border-radius:8px;padding:10px 14px;font-family:Poppins,sans-serif;font-size:14px;font-weight:600;cursor:pointer;flex:1;'
        : 'background:transparent;color:var(--gris-texto);border:none;border-radius:8px;padding:10px 14px;font-family:Poppins,sans-serif;font-size:14px;font-weight:500;cursor:pointer;flex:1;';
}
function btnPrimary(ok, label, onclick, icon = '') {
    return `<button onclick="${onclick}" ${ok ? '' : 'disabled'}
        style="background:${ok ? 'var(--amarillo)' : 'rgba(255,255,255,0.05)'};color:${ok ? 'var(--negro)' : 'rgba(255,255,255,0.2)'};border:none;border-radius:16px;padding:20px;font-family:Poppins,sans-serif;font-size:16px;font-weight:600;width:100%;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:${ok ? 'var(--sombra-amarillo)' : 'none'};margin-bottom:20px;">
        ${icon}${label}
    </button>`;
}

// ─── WINDOW ACTIONS ───────────────────────────────
const W = window;
W.ir = ir;
W.render = render;

// — Tendido cable —
W.anadirTramo = function() {
    const f = E.fTend;
    const tc = f.tramoCurrent;
    const bobina = E.bobinas.find(b => b.id === tc.bobinaId);
    const metros = parseInt(tc.metros);

    if (!bobina) { toast('Selecciona una bobina', 'error'); return; }
    if (!metros || metros <= 0) { toast('Introduce los metros', 'error'); return; }

    const resto = bobinaResto(bobina, f.tramos);
    if (metros > resto) { toast(`Solo quedan ${resto}m en esta bobina`, 'error'); return; }

    f.tramos.push({ tipo: tc.tipo, metros, bobinaId: tc.bobinaId, bobinaRef: bobina.ref });
    f.tramoCurrent = { tipo: tc.tipo, metros: '', bobinaId: tc.bobinaId };
    render();
};

W.quitarTramo = function(idx) { E.fTend.tramos.splice(idx, 1); render(); };

W.enviarTendidoCable = async function() {
    const f = E.fTend;
    const origen = f.origen.trim(), destino = f.destino.trim();
    if (!origen || !destino) { toast('Indica origen y destino', 'error'); return; }
    if (!f.tramos.length) { toast('Añade al menos un tramo', 'error'); return; }
    try {
        const porBobina = {};
        f.tramos.forEach(t => { porBobina[t.bobinaId] = (porBobina[t.bobinaId] || 0) + t.metros; });
        for (const [bId, m] of Object.entries(porBobina)) await updBobinaUsada(bId, m);

        const datos = {
            tipo: 'tendido',
            tipoOrigen: f.tipoOrigen, tipoDestino: f.tipoDestino,
            origen, destino, pon: f.pon,
            tramos: f.tramos,
            metros: f.tramos.reduce((a, t) => a + t.metros, 0)
        };
        await saveTend(datos);
        E.instalaciones.unshift({ ...datos });
        toast('✓ Tendido registrado', 'exito');
        ir('inicio');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
};

// — Raiser —
W.anadirRaiser = function() {
    const f = E.fTend;
    const rc = f.raiserCurrent;
    const bobina = E.bobinas.find(b => b.id === rc.bobinaId);
    const metros = parseInt(rc.metros);
    if (!bobina) { toast('Selecciona una bobina de raiser', 'error'); return; }
    if (!metros || metros <= 0) { toast('Introduce los metros', 'error'); return; }
    if (!rc.nombre.trim()) { toast('Introduce nombre/nº del raiser', 'error'); return; }
    const resto = bobinaResto(bobina, f.raisers.map(r => ({ bobinaId: r.bobinaId, metros: r.metros })));
    if (metros > resto) { toast(`Solo quedan ${resto}m en esta bobina`, 'error'); return; }
    f.raisers.push({ bobinaId: rc.bobinaId, bobinaRef: bobina.ref, metros, nombre: rc.nombre.trim() });
    f.raiserCurrent = { bobinaId: rc.bobinaId, metros: '', nombre: '' };
    render();
};

W.quitarRaiser = function(idx) { E.fTend.raisers.splice(idx, 1); render(); };

W.enviarRaisers = async function() {
    const f = E.fTend;
    if (!f.ctoRaiser.trim()) { toast('Indica la CTO', 'error'); return; }
    if (!f.raisers.length) { toast('Añade al menos un raiser', 'error'); return; }
    try {
        const porBobina = {};
        f.raisers.forEach(r => { porBobina[r.bobinaId] = (porBobina[r.bobinaId] || 0) + r.metros; });
        for (const [bId, m] of Object.entries(porBobina)) await updBobinaUsada(bId, m);
        await saveTend({ tipo: 'raiser', cto: f.ctoRaiser.trim(), raisers: f.raisers, metros: f.raisers.reduce((a, r) => a + r.metros, 0) });
        toast('✓ Raisers registrados', 'exito');
        ir('inicio');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
};

// — Malla —
W.enviarMalla = async function() {
    const f = E.fMalla;
    const puntoA = f.puntoA.trim(), puntoB = f.puntoB.trim(), metros = parseInt(f.metros);
    if (!puntoA || !puntoB) { toast('Indica ambos puntos', 'error'); return; }
    if (puntoA === puntoB) { toast('El punto A y B no pueden ser iguales', 'error'); return; } // BUG#3 fix
    if (!metros || metros <= 0) { toast('Introduce los metros', 'error'); return; }
    try {
        await saveTend({ tipo: 'malla', puntoA, puntoB, metros });
        toast('✓ Malla registrada', 'exito');
        ir('inicio');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
};

// — Módulos —
W.anadirModulo = function() {
    const mc = E.fModulos.modCurrent;
    if (!mc.tipo) { toast('Selecciona un módulo', 'error'); return; }
    const esMod = mc.tipo === 'MOD32' || mc.tipo === 'MOD48';
    // BUG#1 fix: validar cantidad de CDs como entero positivo
    if (esMod && mc.conCDs) {
        for (const cd of mc.cds) {
            if (!cd.modelo) { toast('Selecciona el modelo de CD', 'error'); return; }
            const c = parseInt(cd.cantidad);
            if (!cd.cantidad || !Number.isFinite(c) || c <= 0) { toast('Cantidad de CDs debe ser un número positivo', 'error'); return; }
        }
    }
    const cdsValidos = esMod && mc.conCDs
        ? mc.cds.filter(cd => cd.modelo && parseInt(cd.cantidad) > 0).map(cd => ({ cantidad: parseInt(cd.cantidad), modelo: cd.modelo }))
        : [];
    E.fModulos.modulos.push({ tipo: mc.tipo, cds: cdsValidos });
    E.fModulos.modCurrent = { tipo: '', conCDs: false, cds: [{ cantidad: '', modelo: '' }] };
    render();
};

W.quitarModulo = function(idx) { E.fModulos.modulos.splice(idx, 1); render(); };

W.anadirFilaCD = function() {
    E.fModulos.modCurrent.cds.push({ cantidad: '', modelo: '' });
    render();
};

W.enviarModulos = async function() {
    const f = E.fModulos;
    if (!f.punto.trim()) { toast('Indica CTO o Empalme', 'error'); return; }
    if (!f.modulos.length) { toast('Añade al menos un módulo', 'error'); return; }
    try {
        const porMod = {};
        f.modulos.forEach(m => { porMod[m.tipo] = (porMod[m.tipo] || 0) + 1; });
        for (const [modId, cant] of Object.entries(porMod)) await updStockMod(modId, cant);
        await saveTend({ tipo: 'modulo', pon: f.pon, tipoPunto: f.tipoPunto, punto: f.punto.trim(), modulos: f.modulos });
        toast('✓ Módulos registrados', 'exito');
        ir('inicio');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
};

// — Material: bobinas —
W.crearBobina = async function() {
    const f = E.fMat;
    const refBob = f.nuevaRef.trim(), total = parseInt(f.nuevaTotal);
    if (!refBob || !total || total <= 0) { toast('Rellena todos los campos', 'error'); return; }
    // BUG#10 fix: validar referencia duplicada
    if (E.bobinas.some(b => b.ref.trim().toLowerCase() === refBob.toLowerCase())) {
        toast('Ya existe una bobina con esa referencia', 'error'); return;
    }
    try {
        await addBobina(refBob, f.nuevaTipo, total);
        E.fMat = { seccion: 'bobinas', nuevaRef: '', nuevaTipo: '12kp', nuevaTotal: '', modulo: '', cantidad: '' };
        await loadBobinas();
        toast('✓ Bobina añadida', 'exito');
        render();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
};

W.borrarBobina = async function(id) {
    if (!confirm('¿Eliminar esta bobina?')) return;
    try {
        await removeBobina(id);
        await loadBobinas();
        toast('✓ Bobina eliminada', 'exito');
        render();
    } catch(e) { toast('Error', 'error'); }
};

// — Material: módulos —
W.sumarMod = async function() {
    const id = E.fMat.modulo, c = parseInt(E.fMat.cantidad);
    if (!id || !c || c <= 0) { toast('Rellena los campos', 'error'); return; }
    try {
        await addStock(id, c);
        E.fMat = { ...E.fMat, cantidad: '' };
        await loadMods(); toast(`✓ +${c} uds`, 'exito'); render();
    } catch(e) { toast('Error', 'error'); }
};

W.elimMod = async function() {
    const id = E.fMat.modulo, c = parseInt(E.fMat.cantidad);
    if (!id || !c || c <= 0) { toast('Rellena los campos', 'error'); return; }
    const item = E.stockMods.find(s => s.tipo === id);
    if (item && c > item.cargada) { toast(`Máximo ${item.cargada} uds`, 'error'); return; }
    try {
        await addStock(id, -c);
        E.fMat = { ...E.fMat, cantidad: '' };
        await loadMods(); toast(`✓ −${c} uds`, 'exito'); render();
    } catch(e) { toast('Error', 'error'); }
};

// — Avisos —
W.guardarLim = async function() {
    const item = E.fLim.item;
    const inp = document.getElementById('inp-lim');
    const lim = inp?.value ?? E.fLim.limite;
    if (!item || lim === '' || lim == null) { toast('Rellena los campos', 'error'); return; }
    const n = parseInt(lim);
    if (!Number.isFinite(n) || n < 0) { toast('Límite inválido', 'error'); return; }
    try {
        await setMin(item, n);
        E.fLim = { item: '', limite: '' };
        await loadMods(); toast('✓ Límite guardado', 'exito'); render();
    } catch(e) { toast('Error', 'error'); }
};

// — Config —
W.setVan = function(id) { localStorage.setItem('cel_van_id', id); render(); };
W.guardarConfig = function() {
    const clean = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 40);
    const eq = clean(document.getElementById('inp-eq').value);
    const mat = clean(document.getElementById('inp-mat').value);
    if (!mat) { toast('La matrícula no puede estar vacía', 'error'); return; }
    localStorage.setItem('cel_equipo', eq);
    localStorage.setItem('cel_matricula', mat);
    toast('✓ Configuración guardada', 'exito'); ir('inicio');
};

// — Calendario —
W.cambiarMes = async function(d) {
    E.calMes += d;
    if (E.calMes > 12) { E.calMes = 1; E.calAnio++; }
    if (E.calMes < 1)  { E.calMes = 12; E.calAnio--; }
    await loadCal(); render();
};
W.selDia = async function(f) {
    E.diaSel = f;
    await loadDia(f); E.pantalla = 'dia'; render();
};

// — Eliminar registro —
W.delInst = async function(id) {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
        const inst = E.instDia.find(i => i.id === id);
        await remove(ref(db, `tend/${VAN.id}/${E.diaSel}/${id}`));
        if (inst) {
            if (inst.tipo === 'tendido' || !inst.tipo) {
                // BUG#2 fix: compatibilidad con tramos en formato nuevo (array) y antiguo (objeto)
                const porBobina = {};
                if (Array.isArray(inst.tramos)) {
                    inst.tramos.forEach(t => {
                        if (t.bobinaId) porBobina[t.bobinaId] = (porBobina[t.bobinaId]||0) + (t.metros||0);
                    });
                } else if (inst.tramos && typeof inst.tramos === 'object') {
                    // Formato legacy: {fachada:'15', canalizado:'35'} — sin bobinaId, no se puede revertir
                    // No hacemos nada para evitar corrupción
                }
                for (const [bId, m] of Object.entries(porBobina)) if (bId && m > 0) await updBobinaUsada(bId, -m);
            }
            if (inst.tipo === 'raiser' && Array.isArray(inst.raisers)) {
                const porBobina = {};
                inst.raisers.forEach(r => { porBobina[r.bobinaId] = (porBobina[r.bobinaId]||0) + (r.metros||0); });
                for (const [bId, m] of Object.entries(porBobina)) await updBobinaUsada(bId, -m);
            }
            if (inst.tipo === 'modulo' && Array.isArray(inst.modulos)) {
                const porMod = {};
                inst.modulos.forEach(m => { porMod[m.tipo] = (porMod[m.tipo]||0) + 1; });
                for (const [modId, cant] of Object.entries(porMod)) await updStockMod(modId, -cant);
            }
        }
        toast('✓ Eliminado', 'exito');
        await loadDia(E.diaSel); render();
    } catch(e) { toast('Error', 'error'); }
};

// — Compartir informe del día — BUG#4 fix
W.compartirInforme = function() {
    const items = E.instalaciones;
    if (!items.length) { toast('No hay registros hoy', 'error'); return; }
    const fecha = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const totalM = items.reduce((a, i) => a + metrosRegistro(i), 0);
    const lineas = items.map(i => {
        if (i.tipo === 'raiser') {
            const rs = (i.raisers||[]).map(r => `${r.nombre} ${r.metros}m`).join(', ');
            return `• RAISER — CTO ${i.cto}: ${rs}`;
        }
        if (i.tipo === 'malla') return `• MALLA: ${i.puntoA} → ${i.puntoB} · ${i.metros}m`;
        if (i.tipo === 'modulo') {
            const ms = (i.modulos||[]).map(m => lm(m.tipo)).join(', ');
            return `• MÓDULOS — ${i.tipoPunto === 'cto' ? 'CTO' : 'EMP'} ${i.punto}: ${ms}`;
        }
        const m = metrosRegistro(i);
        return `• TENDIDO: ${labelPunto(i.tipoOrigen, i.origen)} → ${labelPunto(i.tipoDestino, i.destino)} · ${m}m`;
    }).join('\n');
    const txt = `INFORME CELADORES — ${VAN.matricula}\n${VAN.equipo ? VAN.equipo + '\n' : ''}${fecha}\n\n${lineas}\n\nTotal: ${totalM}m · ${items.length} registros`;
    if (navigator.share) navigator.share({ title: 'Informe del día', text: txt }).catch(()=>{});
    else if (navigator.clipboard) { navigator.clipboard.writeText(txt); toast('Copiado al portapapeles', 'exito'); }
    else toast('No se puede compartir', 'error');
};

// — Compartir pedido —
W.compartirPedido = function() {
    const bajo = E.stockMods.filter(s => s.alerta !== 'OK');
    if (!bajo.length) { toast('No hay material bajo mínimo', 'error'); return; }
    const txt = `PEDIDO CELADORES — ${VAN.matricula}\n${new Date().toLocaleDateString('es-ES')}\n\n` +
        bajo.map(s => `• ${lm(s.tipo)}\n  Stock: ${s.actual} uds · Mín: ${s.min} uds · Pedir: ${Math.max(0, s.min - s.actual)} uds`).join('\n');
    if (navigator.share) navigator.share({ title: 'Pedido Celadores', text: txt }).catch(()=>{});
    else if (navigator.clipboard) { navigator.clipboard.writeText(txt); toast('Copiado', 'exito'); }
    else toast('No se puede compartir', 'error');
};

// ═══════════════════════════════════════════════════
//  RENDERS
// ═══════════════════════════════════════════════════

function rInicio() {
    const tendidos = E.instalaciones.filter(i => i.tipo === 'tendido' || !i.tipo);
    const raisersHoy = E.instalaciones.filter(i => i.tipo === 'raiser');
    const mallasHoy  = E.instalaciones.filter(i => i.tipo === 'malla');
    const modsHoy    = E.instalaciones.filter(i => i.tipo === 'modulo');

    const totalMetros = [
        ...tendidos.flatMap(i => Array.isArray(i.tramos) ? i.tramos.map(t => t.metros||0) : [i.metros||0]),
        ...raisersHoy.map(i => i.metros||0)
    ].reduce((a, v) => a + v, 0);

    const bajo = E.stockMods.filter(s => s.alerta !== 'OK').length +
                 E.bobinas.filter(b => (b.total - (b.usada||0)) <= 0).length;
    const fecha = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });

    return `
    <div style="padding:16px 20px 10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <img src="logo.png?v=7" alt="Optivan" style="width:calc(100% - 56px);object-fit:contain;object-position:left;">
            <button class="btn-notificaciones" onclick="ir('avisos')" style="flex-shrink:0;">${I.bell}${bajo > 0 ? '<span class="notif-badge"></span>' : ''}</button>
        </div>
        <div style="display:inline-block;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:20px;padding:4px 14px;margin-bottom:10px;">
            <span style="font-size:11px;font-weight:700;color:#a5b4fc;text-transform:uppercase;letter-spacing:1px;">CELADORES</span>
        </div>
        ${VAN.equipo ? `<p style="font-size:32px;font-weight:700;color:var(--amarillo);font-family:'Poppins',sans-serif;margin:0 0 2px;line-height:1.1;">${esc(VAN.equipo)}</p>` : ''}
        <p class="saludo-nombre">${esc(VAN.matricula)}</p>
        <p class="saludo-fecha">${esc(fecha)}</p>
    </div>
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-icon-wrap ${tendidos.length ? 'amarillo' : 'verde'}">${I.route}</div>
            <p class="stat-label">Tendidos</p>
            <p class="stat-valor">${tendidos.length}</p>
            <p class="stat-subtexto gris">${tendidos.length === 0 ? 'Sin tendidos' : tendidos.length + ' hoy'}</p>
        </div>
        <div class="stat-card">
            <div class="stat-icon-wrap amarillo">${I.cable}</div>
            <p class="stat-label">Metros hoy</p>
            <p class="stat-valor">${totalMetros}</p>
            <p class="stat-subtexto gris">${totalMetros > 0 ? totalMetros + 'm' : 'Sin metros'}</p>
        </div>
    </div>
    <div class="stats-grid" style="padding-top:0;">
        <div class="stat-card">
            <div class="stat-icon-wrap ${raisersHoy.length ? 'amarillo' : 'verde'}">${I.raiser}</div>
            <p class="stat-label">Raisers</p>
            <p class="stat-valor">${raisersHoy.length}</p>
            <p class="stat-subtexto gris">${raisersHoy.length ? raisersHoy.length + ' hoy' : 'Sin raisers'}</p>
        </div>
        <div class="stat-card">
            <div class="stat-icon-wrap ${bajo > 0 ? 'rojo' : 'verde'}">${I.box}</div>
            <p class="stat-label">Stock bajo</p>
            <p class="stat-valor ${bajo > 0 ? 'rojo' : ''}">${bajo}</p>
            <p class="stat-subtexto ${bajo > 0 ? 'rojo' : 'verde'}">${bajo === 0 ? 'Todo OK' : bajo + ' alertas'}</p>
        </div>
    </div>
    <div class="btn-principal-wrap">
        <button class="btn-principal" onclick="ir('registrar')">
            <span class="btn-contenido"><div class="btn-principal-icon">${I.micBtn}</div><span>Registrar tendido</span></span>${I.arrow}
        </button>
    </div>
    <div class="menu-cards">
        ${menuCard('modulos', I.mod,    'Registrar módulos', 'MOD32, MOD48, Z24...')}
        ${menuCard('malla',   I.malla,  'Malla',             'Tramo canalizado')}
        ${menuCard('stock',   I.box,    'Ver stock',         'Bobinas y módulos')}
        ${menuCard('calendario', I.cal, 'Historial',         'Ver días anteriores')}
        ${menuCard('material',I.plus,   'Editar material',   'Bobinas y stock')}
        ${menuCard('avisos',  I.bell,   'Avisos y límites',  'Mínimos de módulos')}
        ${menuCard('informe', I.doc,    'Informe del día',   'Resumen para compartir')}
        ${menuCard('config',  I.gear,   'Configuración',     'Equipo y matrícula')}
    </div>
    ${bajo > 0 ? `<div class="alerta-stock"><button onclick="ir('pedido')"><span class="contenido">${I.alert}<span>${bajo} con stock bajo</span></span><span style="font-size:13px;">Ver pedido</span></button></div>` : ''}`;
}

function menuCard(pag, icon, titulo, sub) {
    return `<button class="menu-card" onclick="ir('${pag}')"><div class="menu-card-icon">${icon}</div><div class="menu-card-content"><p class="menu-card-titulo">${titulo}</p><p class="menu-card-subtitulo">${sub}</p></div><span class="menu-card-flecha">${I.arrowS}</span></button>`;
}

// ─── REGISTRAR TENDIDO (paso 1 + tabs) ────────────
function rRegistrar() {
    const f = E.fTend;
    if (f.modo === 'raiser') return rRegistrarRaiser();
    if (f.paso === 2) return rRegistrarCablePaso2();

    const tabs = tabWrap(`
        <button style="${taBtnStyle(true)}" onclick="E.fTend.modo='cable';render()">Cable</button>
        <button style="${taBtnStyle(false)}" onclick="E.fTend.modo='raiser';render()">Raiser</button>`);

    const bt = (campo, val, label) =>
        `<button style="${btnSel(f[campo] === val)}" onclick="E.fTend.${campo}='${val}';render()">${label}</button>`;

    const okSig = f.origen.trim() && f.destino.trim();

    return `
    <div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Registrar tendido</h2></div>
    <div class="form">
        ${tabs}

        <div class="campo">
            <label class="campo-label">PON <span style="color:rgba(255,255,255,0.3);font-weight:500;text-transform:none;">(opcional)</span></label>
            <input type="text" class="campo-input" placeholder="Ej: A1B2C3"
                value="${esc(f.pon)}" oninput="E.fTend.pon=this.value.toUpperCase()">
        </div>

        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radio-sm);padding:14px;margin-bottom:14px;">
            <p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px;font-weight:600;">Origen</p>
            <div style="display:flex;gap:3px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:3px;margin-bottom:10px;">
                ${bt('tipoOrigen','cto','CTO')}${bt('tipoOrigen','empalme','Empalme')}
            </div>
            <input type="text" class="campo-input" placeholder="${f.tipoOrigen==='cto' ? 'Código CTO' : 'Ref. empalme'}" style="margin:0;"
                value="${esc(f.origen)}" oninput="E.fTend.origen=this.value">
        </div>

        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radio-sm);padding:14px;margin-bottom:20px;">
            <p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px;font-weight:600;">Destino</p>
            <div style="display:flex;gap:3px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:3px;margin-bottom:10px;">
                ${bt('tipoDestino','cto','CTO')}${bt('tipoDestino','empalme','Empalme')}
            </div>
            <input type="text" class="campo-input" placeholder="${f.tipoDestino==='cto' ? 'Código CTO' : 'Ref. empalme'}" style="margin:0;"
                value="${esc(f.destino)}" oninput="E.fTend.destino=this.value">
        </div>

        <button onclick="E.fTend.paso=2;render()" ${okSig ? '' : 'disabled'}
            style="background:${okSig ? 'var(--amarillo)' : 'rgba(255,255,255,0.05)'};color:${okSig ? 'var(--negro)' : 'rgba(255,255,255,0.2)'};border:none;border-radius:16px;padding:20px;font-family:Poppins,sans-serif;font-size:16px;font-weight:600;width:100%;cursor:pointer;display:flex;align-items:center;justify-content:space-between;box-shadow:${okSig ? 'var(--sombra-amarillo)' : 'none'};margin-bottom:20px;">
            <span>Siguiente — Registrar cable</span>${I.arrow}
        </button>
    </div>`;
}

function rRegistrarCablePaso2() {
    const f = E.fTend;
    const tc = f.tramoCurrent;
    const bobinasCable = E.bobinas.filter(b => b.tipo === '12kp' || b.tipo === '12kt');
    const totalM = f.tramos.reduce((a, t) => a + t.metros, 0);

    const bobOpts = bobinasCable.length
        ? bobinasCable.map(b => {
            const r = bobinaResto(b, f.tramos);
            const tl = lc(b.tipo);
            const agotada = r === 0;
            // BUG#9 fix: deshabilitar bobinas sin metros restantes
            return `<option value="${b.id}" ${tc.bobinaId === b.id ? 'selected' : ''} ${agotada ? 'disabled' : ''}>${esc(b.ref)} · ${tl} · ${agotada ? 'AGOTADA' : r+'m'}</option>`;
          }).join('')
        : '<option value="">Sin bobinas</option>';

    const tiposHTML = TIPOS_TRAMO.map(t =>
        `<button onclick="E.fTend.tramoCurrent.tipo='${t.id}';render()"
            style="${btnSel(tc.tipo === t.id)}border-radius:10px;padding:10px 0;">${t.l}</button>`
    ).join('');

    const lista = f.tramos.map((t, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;margin-bottom:6px;">
            <div>
                <span style="font-size:13px;font-weight:700;color:#fff;">${TIPOS_TRAMO.find(tt=>tt.id===t.tipo)?.l || t.tipo}</span>
                <span style="font-size:15px;font-weight:700;color:var(--amarillo);margin-left:10px;">${t.metros}m</span>
                <p style="font-size:11px;color:var(--gris-texto);margin:2px 0 0;">${esc(t.bobinaRef)}</p>
            </div>
            <button onclick="quitarTramo(${i})" style="background:var(--rojo-bg);border:none;border-radius:8px;padding:6px 10px;color:var(--rojo);font-size:13px;font-weight:700;cursor:pointer;">✕</button>
        </div>`).join('');

    // BUG#11 fix: labelPunto ya aplica esc() internamente; no volver a escapar tit
    const tit = `${labelPunto(f.tipoOrigen, f.origen)} → ${labelPunto(f.tipoDestino, f.destino)}`;

    return `
    <div class="header"><button class="btn-atras" onclick="E.fTend.paso=1;render()">${I.back}</button>
        <h2 class="titulo-pantalla" style="font-size:14px;">${tit}</h2></div>
    <div class="form">

        <div class="campo">
            <label class="campo-label">Bobina</label>
            <select class="campo-select" onchange="E.fTend.tramoCurrent.bobinaId=this.value;render()">
                <option value="">Seleccionar bobina</option>${bobOpts}
            </select>
            ${bobinasCable.length === 0 ? `<div style="background:var(--rojo-bg);border:1px solid rgba(239,68,68,0.15);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:12px;color:var(--rojo);font-weight:600;">Sin bobinas — añade en Editar material</div>` : ''}
        </div>

        <div class="campo">
            <label class="campo-label">Tipo de tramo</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">${tiposHTML}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin-bottom:16px;">
            <div class="campo" style="margin:0;">
                <label class="campo-label">Metros</label>
                <div style="position:relative;">
                    <input type="number" inputmode="numeric" class="campo-input" placeholder="0" min="1"
                        value="${esc(tc.metros)}" oninput="E.fTend.tramoCurrent.metros=this.value" style="padding-right:32px;">
                    <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--gris-texto);pointer-events:none;">m</span>
                </div>
            </div>
            <button onclick="anadirTramo()"
                style="background:var(--verde);color:#fff;border:none;border-radius:var(--radio-sm);padding:16px 18px;font-family:Poppins,sans-serif;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">${I.plus} Añadir</button>
        </div>

        ${lista}
        ${totalM > 0 ? `<div style="text-align:right;margin-bottom:12px;"><span style="font-size:20px;font-weight:700;color:var(--amarillo);font-family:Poppins,sans-serif;">${totalM}m total</span></div>` : ''}

        ${btnPrimary(f.tramos.length > 0, 'Guardar tendido', 'enviarTendidoCable()', I.check)}
    </div>`;
}

function rRegistrarRaiser() {
    const f = E.fTend;
    const rc = f.raiserCurrent;
    const tabs = tabWrap(`
        <button style="${taBtnStyle(false)}" onclick="E.fTend.modo='cable';render()">Cable</button>
        <button style="${taBtnStyle(true)}" onclick="E.fTend.modo='raiser';render()">Raiser</button>`);

    const bRaiser = E.bobinas.filter(b => b.tipo.startsWith('raiser_'));
    const bobOpts = bRaiser.length
        ? bRaiser.map(b => {
            const r = bobinaResto(b, f.raisers.map(r => ({ bobinaId: r.bobinaId, metros: r.metros })));
            const agotada = r === 0;
            // BUG#9 fix: deshabilitar bobinas de raiser sin metros restantes
            return `<option value="${b.id}" ${rc.bobinaId === b.id ? 'selected' : ''} ${agotada ? 'disabled' : ''}>${esc(b.ref)} · ${lc(b.tipo)} · ${agotada ? 'AGOTADA' : r+'m'}</option>`;
          }).join('')
        : '<option value="">Sin bobinas de raiser</option>';

    const lista = f.raisers.map((r, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;margin-bottom:6px;">
            <div>
                <span style="font-size:13px;font-weight:700;color:#fff;">${esc(r.nombre)}</span>
                <span style="font-size:15px;font-weight:700;color:var(--amarillo);margin-left:10px;">${r.metros}m</span>
                <p style="font-size:11px;color:var(--gris-texto);margin:2px 0 0;">${esc(r.bobinaRef)}</p>
            </div>
            <button onclick="quitarRaiser(${i})" style="background:var(--rojo-bg);border:none;border-radius:8px;padding:6px 10px;color:var(--rojo);font-size:13px;font-weight:700;cursor:pointer;">✕</button>
        </div>`).join('');

    const okEnviar = f.ctoRaiser.trim() && f.raisers.length > 0;

    return `
    <div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Registrar tendido</h2></div>
    <div class="form">
        ${tabs}

        <div class="campo">
            <label class="campo-label">CTO donde se instala</label>
            <input type="text" class="campo-input" placeholder="Código CTO"
                value="${esc(f.ctoRaiser)}" oninput="E.fTend.ctoRaiser=this.value">
        </div>

        <div class="campo">
            <label class="campo-label">Bobina de raiser</label>
            <select class="campo-select" onchange="E.fTend.raiserCurrent.bobinaId=this.value;render()">
                <option value="">Seleccionar bobina</option>${bobOpts}
            </select>
            ${bRaiser.length === 0 ? `<div style="background:var(--rojo-bg);border:1px solid rgba(239,68,68,0.15);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:12px;color:var(--rojo);font-weight:600;">Sin bobinas de raiser — añade en Editar material</div>` : ''}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;">
            <div class="campo" style="margin:0;">
                <label class="campo-label">Metros</label>
                <div style="position:relative;">
                    <input type="number" inputmode="numeric" class="campo-input" placeholder="0" min="1"
                        value="${esc(rc.metros)}" oninput="E.fTend.raiserCurrent.metros=this.value" style="padding-right:32px;">
                    <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--gris-texto);pointer-events:none;">m</span>
                </div>
            </div>
            <div class="campo" style="margin:0;">
                <label class="campo-label">Nombre / nº raiser</label>
                <input type="text" class="campo-input" placeholder="Ej: R-01"
                    value="${esc(rc.nombre)}" oninput="E.fTend.raiserCurrent.nombre=this.value">
            </div>
        </div>

        <button onclick="anadirRaiser()"
            style="background:var(--verde);color:#fff;border:none;border-radius:var(--radio-sm);padding:14px;font-family:Poppins,sans-serif;font-size:14px;font-weight:700;cursor:pointer;width:100%;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:8px;">${I.plus} Añadir raiser</button>

        ${lista}
        ${btnPrimary(okEnviar, 'Guardar raisers', 'enviarRaisers()', I.check)}
    </div>`;
}

// ─── MALLA ────────────────────────────────────────
function rMalla() {
    const f = E.fMalla;
    const ok = f.puntoA.trim() && f.puntoB.trim() && parseInt(f.metros) > 0;
    return `
    <div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Registrar malla</h2></div>
    <div class="form">
        <div style="background:rgba(255,193,7,0.06);border:1px solid rgba(255,193,7,0.12);border-radius:12px;padding:12px 14px;margin-bottom:20px;">
            <p style="font-size:12px;color:var(--amarillo);font-weight:600;margin:0;">Tramo canalizado donde va la malla antes del cable</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 24px 1fr;gap:8px;align-items:end;margin-bottom:14px;">
            <div>
                <label class="campo-label">Punto A</label>
                <input type="text" class="campo-input" placeholder="Ej: Pozo 1" style="margin:0;"
                    value="${esc(f.puntoA)}" oninput="E.fMalla.puntoA=this.value">
            </div>
            <div style="padding-bottom:16px;color:var(--gris-texto);font-size:18px;text-align:center;line-height:1;">→</div>
            <div>
                <label class="campo-label">Punto B</label>
                <input type="text" class="campo-input" placeholder="Ej: Pozo 2" style="margin:0;"
                    value="${esc(f.puntoB)}" oninput="E.fMalla.puntoB=this.value">
            </div>
        </div>

        <div class="campo">
            <label class="campo-label">Metros de malla</label>
            <div style="position:relative;">
                <input type="number" inputmode="numeric" class="campo-input" placeholder="0" min="1"
                    value="${esc(f.metros)}" oninput="E.fMalla.metros=this.value" style="padding-right:32px;">
                <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--gris-texto);pointer-events:none;">m</span>
            </div>
        </div>

        ${btnPrimary(ok, 'Registrar malla', 'enviarMalla()', I.malla)}
    </div>`;
}

// ─── MÓDULOS ──────────────────────────────────────
function rModulos() {
    const f = E.fModulos;
    const mc = f.modCurrent;
    const esMod = mc.tipo === 'MOD32' || mc.tipo === 'MOD48';

    const bt = (val, label) =>
        `<button onclick="E.fModulos.tipoPunto='${val}';render()"
            style="${btnSel(f.tipoPunto===val)}">${label}</button>`;

    const modOpts = MODS.map(m => `<option value="${m.id}" ${mc.tipo===m.id ? 'selected':''}>${esc(m.l)}</option>`).join('');

    const cdsHTML = esMod && mc.conCDs
        ? mc.cds.map((cd, i) => `
            <div style="display:grid;grid-template-columns:80px 1fr ${mc.cds.length > 1 ? '36px' : ''};gap:8px;margin-bottom:8px;align-items:end;">
                <div>
                    <label class="campo-label" style="font-size:9px;">Cant.</label>
                    <input type="number" inputmode="numeric" class="campo-input" placeholder="1" min="1"
                        style="padding:12px 8px;text-align:center;"
                        value="${esc(cd.cantidad)}" oninput="E.fModulos.modCurrent.cds[${i}].cantidad=this.value">
                </div>
                <div>
                    <label class="campo-label" style="font-size:9px;">Modelo</label>
                    <select class="campo-select" style="padding:12px 10px;" onchange="E.fModulos.modCurrent.cds[${i}].modelo=this.value;render()">
                        <option value="">Modelo</option>
                        ${MODELOS_CD.map(m => `<option value="${m.id}" ${cd.modelo===m.id ? 'selected':''}>${m.l}</option>`).join('')}
                    </select>
                </div>
                ${mc.cds.length > 1 ? `<button onclick="E.fModulos.modCurrent.cds.splice(${i},1);render()"
                    style="background:var(--rojo-bg);border:none;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--rojo);align-self:end;">✕</button>` : ''}
            </div>`).join('')
        : '';

    const listaModulos = f.modulos.map((m, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;margin-bottom:6px;">
            <div>
                <span style="font-size:14px;font-weight:700;color:#fff;">${esc(lm(m.tipo))}</span>
                ${m.cds && m.cds.length ? m.cds.map(cd =>
                    `<span style="font-size:11px;background:rgba(99,102,241,0.18);color:#a5b4fc;padding:2px 7px;border-radius:5px;margin-left:6px;">${cd.cantidad}×${esc(lm(cd.modelo))}</span>`
                ).join('') : ''}
            </div>
            <button onclick="quitarModulo(${i})" style="background:var(--rojo-bg);border:none;border-radius:8px;padding:6px 10px;color:var(--rojo);font-size:13px;font-weight:700;cursor:pointer;">✕</button>
        </div>`).join('');

    const okEnviar = f.punto.trim() && f.modulos.length > 0;

    return `
    <div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Registrar módulos</h2></div>
    <div class="form">

        <div class="campo">
            <label class="campo-label">PON <span style="color:rgba(255,255,255,0.3);font-weight:500;text-transform:none;">(opcional)</span></label>
            <input type="text" class="campo-input" placeholder="Ej: A1B2C3"
                value="${esc(f.pon)}" oninput="E.fModulos.pon=this.value.toUpperCase()">
        </div>

        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radio-sm);padding:14px;margin-bottom:14px;">
            <p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px;font-weight:600;">Ubicación</p>
            <div style="display:flex;gap:3px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:3px;margin-bottom:10px;">
                ${bt('cto','CTO')}${bt('empalme','Empalme')}
            </div>
            <input type="text" class="campo-input" placeholder="${f.tipoPunto==='cto' ? 'Código CTO' : 'Ref. empalme'}" style="margin:0;"
                value="${esc(f.punto)}" oninput="E.fModulos.punto=this.value">
        </div>

        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radio-sm);padding:14px;margin-bottom:14px;">
            <p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:0 0 12px;font-weight:600;">Módulo a instalar</p>

            <select class="campo-select" style="margin-bottom:12px;"
                onchange="E.fModulos.modCurrent.tipo=this.value;E.fModulos.modCurrent.conCDs=false;E.fModulos.modCurrent.cds=[{cantidad:'',modelo:''}];render()">
                <option value="">Seleccionar módulo</option>${modOpts}
            </select>

            ${esMod ? `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${mc.conCDs ? '12px' : '0'};">
                <p style="font-size:14px;color:#fff;font-weight:600;margin:0;">¿Lleva CDs?</p>
                <button onclick="E.fModulos.modCurrent.conCDs=!E.fModulos.modCurrent.conCDs;render();"
                    style="background:${mc.conCDs ? 'var(--amarillo)' : 'rgba(255,255,255,0.08)'};color:${mc.conCDs ? 'var(--negro)' : '#fff'};border:none;border-radius:20px;padding:8px 18px;font-family:Poppins,sans-serif;font-size:13px;font-weight:600;cursor:pointer;">${mc.conCDs ? 'Sí' : 'No'}</button>
            </div>
            ${mc.conCDs ? `
            ${cdsHTML}
            <button onclick="anadirFilaCD()"
                style="background:rgba(255,255,255,0.06);border:none;border-radius:8px;padding:10px;font-family:Poppins,sans-serif;font-size:13px;font-weight:600;color:var(--gris-texto);cursor:pointer;width:100%;margin-top:4px;">
                + Añadir otro modelo de CD
            </button>` : ''}
            ` : ''}

            <button onclick="anadirModulo()" ${mc.tipo ? '' : 'disabled'}
                style="background:${mc.tipo ? 'var(--verde)' : 'rgba(255,255,255,0.05)'};color:${mc.tipo ? '#fff' : 'rgba(255,255,255,0.2)'};border:none;border-radius:var(--radio-sm);padding:14px;font-family:Poppins,sans-serif;font-size:14px;font-weight:700;cursor:pointer;width:100%;margin-top:14px;display:flex;align-items:center;justify-content:center;gap:8px;">
                ${I.plus} Añadir módulo
            </button>
        </div>

        ${listaModulos}
        ${btnPrimary(okEnviar, 'Guardar módulos', 'enviarModulos()', I.check)}
    </div>`;
}

// ─── STOCK ────────────────────────────────────────
function rStock() {
    const bobCards = E.bobinas.length
        ? E.bobinas.map(b => {
            const resto = b.total - (b.usada || 0);
            const pct = b.total > 0 ? (resto / b.total) : 1;
            const cls = resto <= 0 ? 'sin-stock' : pct <= 0.2 ? 'alerta' : '';
            return `<div class="tarjeta-stock ${cls}">
                <div>
                    <p class="stock-tipo">${esc(b.ref)}</p>
                    <p class="stock-detalle">${esc(lc(b.tipo))} · ${b.usada||0}m usado de ${b.total}m</p>
                    ${cls ? `<span class="badge-alerta">${cls === 'sin-stock' ? 'SIN STOCK' : 'BAJO'}</span>` : ''}
                </div>
                <p class="stock-numero">${resto}<span style="font-size:12px;font-weight:500;color:var(--gris-texto);margin-left:2px;">m</span></p>
            </div>`;
          }).join('')
        : `<div class="vacio">${I.box}<p>Sin bobinas — añade en Editar material</p></div>`;

    const modCards = E.stockMods.map(s => {
        const cls = s.alerta === 'SIN STOCK' ? 'sin-stock' : s.alerta === 'STOCK BAJO' ? 'alerta' : '';
        return `<div class="tarjeta-stock ${cls}">
            <div>
                <p class="stock-tipo">${esc(lm(s.tipo))}</p>
                <p class="stock-detalle">Mín: ${s.min} uds · Usado: ${s.usada} uds</p>
                ${s.alerta !== 'OK' ? `<span class="badge-alerta">${esc(s.alerta)}</span>` : ''}
            </div>
            <p class="stock-numero">${s.actual}<span style="font-size:12px;font-weight:500;color:var(--gris-texto);margin-left:2px;"> uds</span></p>
        </div>`;
    }).join('');

    return `
    <div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Stock</h2></div>
    <div style="padding:0 20px;"><p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:16px 0 10px;font-weight:600;">Bobinas de cable</p></div>
    <div class="lista-stock">${bobCards}</div>
    <div style="padding:0 20px;"><p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:20px 0 10px;font-weight:600;">Módulos</p></div>
    <div class="lista-stock">${modCards}</div>`;
}

// ─── MATERIAL ─────────────────────────────────────
function rMaterial() {
    const f = E.fMat;
    const esBob = f.seccion === 'bobinas';
    const tabA = taBtnStyle(esBob), tabI = taBtnStyle(!esBob);

    const tabs = `<div style="padding:8px 20px 14px;">
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:3px;display:flex;gap:3px;">
            <button style="${tabA}" onclick="E.fMat={seccion:'bobinas',nuevaRef:'',nuevaTipo:'12kp',nuevaTotal:'',modulo:'',cantidad:''};render()">Bobinas</button>
            <button style="${tabI}" onclick="E.fMat={seccion:'modulos',nuevaRef:'',nuevaTipo:'12kp',nuevaTotal:'',modulo:'',cantidad:''};render()">Módulos</button>
        </div></div>`;

    const header = `<div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Editar material</h2></div>${tabs}`;

    if (esBob) {
        const tipoOpts = CABLES.map(c => `<option value="${c.id}" ${f.nuevaTipo===c.id ? 'selected':''}>${esc(c.l)}</option>`).join('');
        const okAdd = f.nuevaRef.trim() && parseInt(f.nuevaTotal) > 0;

        const lista = E.bobinas.length
            ? E.bobinas.map(b => {
                const resto = b.total - (b.usada || 0);
                return `<div class="tarjeta-stock">
                    <div>
                        <p class="stock-tipo">${esc(b.ref)}</p>
                        <p class="stock-detalle">${esc(lc(b.tipo))} · ${resto}m restantes de ${b.total}m</p>
                    </div>
                    <button onclick="borrarBobina('${esc(b.id)}')"
                        style="background:var(--rojo-bg);border:none;border-radius:8px;padding:8px 12px;color:var(--rojo);cursor:pointer;">${I.trash}</button>
                </div>`;
              }).join('')
            : `<div class="vacio">${I.box}<p>Sin bobinas</p></div>`;

        return `${header}
        <div class="form">
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radio-sm);padding:14px;margin-bottom:14px;">
                <p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:0 0 12px;font-weight:600;">Nueva bobina</p>
                <div class="campo" style="margin-bottom:10px;">
                    <label class="campo-label">Referencia</label>
                    <input type="text" class="campo-input" placeholder="Ej: 12KP-RTO" style="margin:0;"
                        value="${esc(f.nuevaRef)}" oninput="E.fMat.nuevaRef=this.value.toUpperCase()">
                </div>
                <div class="campo" style="margin-bottom:10px;">
                    <label class="campo-label">Tipo de cable</label>
                    <select class="campo-select" style="margin:0;" onchange="E.fMat.nuevaTipo=this.value">${tipoOpts}</select>
                </div>
                <div class="campo" style="margin-bottom:12px;">
                    <label class="campo-label">Metros totales</label>
                    <div style="position:relative;">
                        <input type="number" inputmode="numeric" class="campo-input" placeholder="Ej: 2000"
                            style="margin:0;padding-right:32px;"
                            value="${esc(f.nuevaTotal)}" oninput="E.fMat.nuevaTotal=this.value">
                        <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--gris-texto);pointer-events:none;">m</span>
                    </div>
                </div>
                <button onclick="crearBobina()" ${okAdd ? '' : 'disabled'}
                    style="background:${okAdd ? 'var(--verde)' : 'rgba(255,255,255,0.05)'};color:${okAdd ? '#fff' : 'rgba(255,255,255,0.2)'};border:none;border-radius:var(--radio-sm);padding:14px;font-family:Poppins,sans-serif;font-size:14px;font-weight:600;width:100%;cursor:pointer;">
                    + Añadir bobina
                </button>
            </div>
        </div>
        <div style="padding:0 20px 8px;"><p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px;font-weight:600;">Bobinas actuales</p></div>
        <div class="lista-stock">${lista}</div>`;
    }

    // Módulos
    const optsMod = MODS.map(m => `<option value="${m.id}" ${f.modulo===m.id ? 'selected':''}>${esc(m.l)}</option>`).join('');
    const sa = f.modulo ? E.stockMods.find(s => s.tipo === f.modulo) : null;
    const ok = f.modulo && parseInt(f.cantidad) > 0;

    return `${header}
    <div class="form">
        <div class="campo"><label class="campo-label">Módulo</label>
            <select class="campo-select" onchange="E.fMat.modulo=this.value;render()">
                <option value="">Seleccionar</option>${optsMod}
            </select>
        </div>
        ${sa ? `<div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radio-sm);padding:14px 16px;margin-bottom:14px;display:flex;justify-content:space-between;"><span style="font-size:14px;color:var(--gris-texto);">Stock actual</span><span style="font-size:16px;font-weight:600;font-family:Poppins,sans-serif;color:#fff;">${sa.actual} uds</span></div>` : ''}
        <div class="campo"><label class="campo-label">Cantidad</label>
            <input type="number" inputmode="numeric" class="campo-input" placeholder="Ej: 5" min="1"
                value="${esc(f.cantidad)}" oninput="E.fMat.cantidad=this.value;">
        </div>
        <button class="btn-enviar" ${ok ? '' : 'disabled'} onclick="sumarMod()" style="background:var(--verde);margin:8px 0 0;">+ Añadir al stock</button>
        <button class="btn-enviar" ${ok ? '' : 'disabled'} onclick="elimMod()" style="background:var(--rojo);margin:8px 0 0;">− Eliminar del stock</button>
    </div>
    <div style="padding:16px 20px 8px;"><p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px;font-weight:600;">Stock actual</p></div>
    <div class="lista-stock">${E.stockMods.map(s => `<div class="tarjeta-stock ${s.alerta!=='OK' ? 'alerta' : ''}"><div><p class="stock-tipo">${esc(lm(s.tipo))}</p><p class="stock-detalle">Carg: ${s.cargada} uds · Usado: ${s.usada} uds</p></div><p class="stock-numero">${s.actual}<span style="font-size:11px;color:var(--gris-texto);"> uds</span></p></div>`).join('')}</div>`;
}

// ─── AVISOS ───────────────────────────────────────
function rAvisos() {
    const opts = MODS.map(m => `<option value="${m.id}" ${E.fLim.item===m.id ? 'selected':''}>${esc(m.l)}</option>`).join('');
    const sel = E.fLim.item ? E.stockMods.find(s => s.tipo === E.fLim.item) : null;
    const ok = E.fLim.item && E.fLim.limite !== '' && E.fLim.limite != null;
    const bajo = E.stockMods.filter(s => s.alerta !== 'OK');

    return `
    <div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Avisos y límites</h2></div>
    <div class="form">
        <div class="campo"><label class="campo-label">Módulo</label>
            <select class="campo-select" onchange="E.fLim.item=this.value;render()">
                <option value="">Seleccionar</option>${opts}
            </select>
        </div>
        ${sel ? `<div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radio-sm);padding:14px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
            <div><p style="font-size:10px;color:var(--gris-texto);margin:0 0 2px;font-weight:600;text-transform:uppercase;">Límite actual</p><p style="font-size:18px;font-weight:600;margin:0;font-family:Poppins,sans-serif;color:#fff;">${sel.min} uds</p></div>
            <div style="text-align:right;"><p style="font-size:10px;color:var(--gris-texto);margin:0 0 2px;font-weight:600;text-transform:uppercase;">Stock</p><p style="font-size:18px;font-weight:600;margin:0;font-family:Poppins,sans-serif;color:${sel.alerta!=='OK' ? 'var(--rojo)' : '#fff'};">${sel.actual} uds</p></div>
        </div>` : ''}
        <div class="campo"><label class="campo-label">Nuevo límite (uds)</label>
            <input type="number" inputmode="numeric" class="campo-input" id="inp-lim" placeholder="Ej: 2" min="0"
                value="${esc(E.fLim.limite||'')}" oninput="E.fLim.limite=this.value;">
        </div>
        <button class="btn-enviar" ${ok ? '' : 'disabled'} onclick="guardarLim()">Guardar límite</button>
    </div>
    <div class="lista-stock" style="margin-top:8px;">
        ${E.stockMods.map(s => `<div class="tarjeta-stock ${s.alerta!=='OK' ? 'alerta' : ''}"><div><p class="stock-tipo">${esc(lm(s.tipo))}</p><p class="stock-detalle">Aviso si < ${s.min} uds</p>${s.alerta!=='OK' ? `<span class="badge-alerta">${esc(s.alerta)}</span>` : ''}</div><div style="text-align:right;"><p style="font-size:22px;font-weight:700;margin:0;font-family:Poppins,sans-serif;color:#fff;">${s.min}<span style="font-size:11px;"> uds</span></p></div></div>`).join('')}
    </div>
    ${bajo.length > 0 ? `<div style="padding:16px 20px;"><div style="background:var(--rojo-bg);border:1px solid rgba(239,68,68,0.15);border-radius:12px;padding:16px;"><p style="font-size:13px;font-weight:700;color:var(--rojo);margin:0 0 10px;">${I.alert} Material bajo límite</p>${bajo.map(s => `<p style="font-size:14px;margin:4px 0;color:#ccc;">· ${esc(lm(s.tipo))} — ${s.actual} uds (mín: ${s.min})</p>`).join('')}<button class="btn-enviar" style="margin-top:14px;margin-bottom:0;" onclick="ir('pedido')">Ver pedido</button></div></div>` : ''}`;
}

// ─── PEDIDO ───────────────────────────────────────
function rPedido() {
    const bajo = E.stockMods.filter(s => s.alerta !== 'OK');
    const card = s => `<div class="informe-item">
        <div class="informe-item-top">
            <p class="informe-item-material">${esc(lm(s.tipo))}</p>
            <span class="badge-alerta">${esc(s.alerta)}</span>
        </div>
        <p class="informe-item-cto">Stock: ${s.actual} uds · Mín: ${s.min} uds · Pedir: <strong>${Math.max(0,s.min-s.actual)} uds</strong></p>
    </div>`;
    return `
    <div class="header"><button class="btn-atras" onclick="ir('avisos')">${I.back}</button><h2 class="titulo-pantalla">Pedido almacén</h2></div>
    <p class="informe-fecha">Material bajo stock mínimo</p>
    <div class="informe-lista">${bajo.length === 0 ? `<div class="vacio">${I.check}<p>Nada que pedir</p></div>` : bajo.map(card).join('')}</div>
    ${bajo.length ? `<div style="padding:20px;"><button class="btn-principal" onclick="compartirPedido()" style="justify-content:center;">Compartir lista</button></div>` : ''}`;
}

// ─── INFORME ──────────────────────────────────────
// BUG#7 fix: el locale es-ES puede devolver "De Mayo De" con mayúsculas en algunos SO
// → forzar lowercase total y luego capitalizar solo el primer carácter
function capFirst(s) {
    if (!s) return s;
    const lc = s.toLowerCase();
    return lc.charAt(0).toUpperCase() + lc.slice(1);
}

function rInforme() {
    const hoy = capFirst(new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' }));
    const items = E.instalaciones;
    const totalM = items.reduce((a, i) => a + metrosRegistro(i), 0);

    const cardItem = i => {
        if (i.tipo === 'raiser') {
            return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:11px 12px;">
                <div style="font-size:11px;font-weight:700;color:rgba(99,102,241,0.9);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Raiser — CTO ${esc(i.cto)}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${(i.raisers||[]).map(r => `<span style="font-size:11px;font-weight:600;background:rgba(255,255,255,0.06);color:#fff;padding:3px 8px;border-radius:8px;">${esc(r.nombre)} ${r.metros}m</span>`).join('')}
                </div>
            </div>`;
        }
        if (i.tipo === 'malla') {
            return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:11px 12px;">
                <div style="font-size:11px;font-weight:700;color:rgba(16,185,129,0.9);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Malla</div>
                <div style="font-size:13px;font-weight:700;color:#fff;">${esc(i.puntoA)} → ${esc(i.puntoB)}</div>
                <div style="font-size:12px;color:var(--amarillo);font-weight:600;">${i.metros}m</div>
            </div>`;
        }
        if (i.tipo === 'modulo') {
            return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:11px 12px;">
                <div style="font-size:11px;font-weight:700;color:rgba(255,193,7,0.9);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${i.tipoPunto==='cto' ? 'CTO' : 'EMP'} ${esc(i.punto)}${i.pon ? ' · PON '+esc(i.pon) : ''}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${(i.modulos||[]).map(m => `<span style="font-size:11px;font-weight:600;background:rgba(99,102,241,0.15);color:#a5b4fc;padding:3px 8px;border-radius:8px;">${esc(lm(m.tipo))}</span>`).join('')}
                </div>
            </div>`;
        }
        // Tendido
        const tramosArr = Array.isArray(i.tramos)
            ? i.tramos
            : Object.entries(i.tramos || {}).filter(([,v]) => parseInt(v)>0).map(([k,v]) => ({ tipo:k, metros:parseInt(v) }));
        return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:11px 12px;">
            <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;">${esc(labelPunto(i.tipoOrigen,i.origen))} → ${esc(labelPunto(i.tipoDestino,i.destino))}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${tramosArr.map(t => `<span style="font-size:10px;font-weight:600;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.8);padding:3px 7px;border-radius:5px;">${TIPOS_TRAMO.find(tt=>tt.id===t.tipo)?.l||t.tipo}: ${t.metros}m</span>`).join('')}
                <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:rgba(16,185,129,0.15);color:var(--verde);">${metrosRegistro(i)}m</span>
            </div>
        </div>`;
    };

    const grid = items.length === 0
        ? `<div class="vacio">${I.doc}<p>No hay registros hoy</p></div>`
        : `<div style="margin:0 20px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">${items.map(cardItem).join('')}</div>`;

    return `
    <div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Informe del día</h2></div>
    <div class="informe-cab">
        <div class="informe-cab-fila"><div class="informe-cab-equipo">${esc(VAN.equipo||'Equipo')}</div><div class="informe-cab-mat">${esc(VAN.matricula)}</div></div>
        <div class="informe-cab-fecha">${esc(hoy)}</div>
    </div>
    <div class="informe-resumen">
        ${items.length ? `<div class="resumen-card"><span class="resumen-num">${items.length}</span><span class="resumen-lbl">Registros</span></div>` : ''}
        ${totalM ? `<div class="resumen-card"><span class="resumen-num">${totalM}m</span><span class="resumen-lbl">Total metros</span></div>` : ''}
    </div>
    <div style="padding:0 20px 12px;">
        <p style="font-size:10px;color:var(--gris-texto);text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px;font-weight:600;">Registros de hoy</p>
    </div>
    ${grid}
    ${items.length ? `<div style="padding:20px 20px 8px;">${btnPrimary(true,'Compartir informe','compartirInforme()',I.doc)}</div>` : ''}`;
}

// ─── HISTORIAL: CALENDARIO ────────────────────────
function rCalendario() {
    const { calAnio:a, calMes:m } = E;
    const nm = MESES[m-1], p1 = new Date(a,m-1,1).getDay(), off = p1===0 ? 6 : p1-1, dm = new Date(a,m,0).getDate();
    const hoy = new Date();
    const dc = {}; E.calDias.forEach(d => { dc[parseInt(d.fecha.split('-')[2])] = d; });
    let c = ''; for (let i = 0; i < off; i++) c += '<div></div>';
    for (let d = 1; d <= dm; d++) {
        const f = `${a}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, td = dc[d];
        const fu = new Date(a,m-1,d) > hoy;
        const esHoy = d===hoy.getDate() && m===hoy.getMonth()+1 && a===hoy.getFullYear();
        c += `<div class="cal-dia ${esHoy ? 'cal-hoy' : ''} ${td ? 'cal-con-datos' : ''} ${fu ? 'cal-futuro' : ''}" onclick="${!fu ? `selDia('${f}')` : ''}"><span>${d}</span>${td ? '<span class="cal-punto"></span>' : ''}</div>`;
    }
    return `
    <div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Historial</h2></div>
    <div style="padding:8px 20px 16px;"><div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radio);padding:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <button onclick="cambiarMes(-1)" style="background:rgba(255,255,255,0.06);border:none;border-radius:10px;padding:8px 14px;font-size:18px;cursor:pointer;color:#fff;">‹</button>
            <p style="font-size:17px;font-weight:600;margin:0;font-family:Poppins,sans-serif;text-transform:capitalize;color:#fff;">${nm} ${a}</p>
            <button onclick="cambiarMes(1)" style="background:rgba(255,255,255,0.06);border:none;border-radius:10px;padding:8px 14px;font-size:18px;cursor:pointer;color:#fff;">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;">${DSEM.map(d => `<div class="cal-label-dia">${d}</div>`).join('')}</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">${c}</div>
    </div></div>
    ${E.calDias.length === 0 ? `<div class="vacio">${I.cal}<p>Sin registros este mes</p></div>` :
        `<div style="padding:0 20px;">${E.calDias.map(d => {
            const l = capFirst(new Date(d.fecha+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})); // BUG#7 fix
            return `<div class="informe-item" style="cursor:pointer;" onclick="selDia('${d.fecha}')">
                <div class="informe-item-top"><p class="informe-item-material">${l}</p>${I.arrowS}</div>
                <p class="informe-item-cto">${d.total} registros · ${d.metros}m</p>
            </div>`;
        }).join('')}</div>`}`;
}

// ─── HISTORIAL: DÍA ───────────────────────────────
function rDia() {
    const f = E.diaSel, lab = capFirst(new Date(f+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})); // BUG#7 fix
    const inst = E.instDia;
    const totalM = inst.reduce((a, i) => a + metrosRegistro(i), 0);

    const cardDia = i => {
        const idEsc = esc(i.id);
        const delBtn = `<button onclick="delInst('${idEsc}')" style="background:var(--rojo-bg);border:none;border-radius:8px;padding:8px 10px;font-size:12px;color:var(--rojo);font-weight:600;cursor:pointer;flex-shrink:0;">Eliminar</button>`;

        if (i.tipo === 'raiser') {
            return `<div class="informe-item">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                    <div><div style="font-size:11px;font-weight:700;color:#a5b4fc;text-transform:uppercase;margin-bottom:4px;">Raiser</div>
                    <span style="font-size:16px;font-weight:700;color:#fff;">CTO ${esc(i.cto)}</span></div>${delBtn}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${(i.raisers||[]).map(r => `<span style="font-size:11px;font-weight:600;background:rgba(99,102,241,0.15);color:#a5b4fc;padding:3px 8px;border-radius:8px;">${esc(r.nombre)} · ${esc(r.bobinaRef)} · ${r.metros}m</span>`).join('')}
                </div>
            </div>`;
        }
        if (i.tipo === 'malla') {
            return `<div class="informe-item">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                    <div><div style="font-size:11px;font-weight:700;color:var(--verde);text-transform:uppercase;margin-bottom:4px;">Malla canalizado</div>
                    <span style="font-size:16px;font-weight:700;color:#fff;">${esc(i.puntoA)} → ${esc(i.puntoB)}</span></div>${delBtn}
                </div>
                <span style="font-size:14px;font-weight:700;color:var(--amarillo);">${i.metros}m</span>
            </div>`;
        }
        if (i.tipo === 'modulo') {
            return `<div class="informe-item">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                    <div><div style="font-size:11px;font-weight:700;color:var(--amarillo);text-transform:uppercase;margin-bottom:4px;">Módulos — ${i.tipoPunto==='cto'?'CTO':'EMP'} ${esc(i.punto)}</div>
                    ${i.pon ? `<span style="font-size:10px;font-weight:700;color:var(--amarillo);background:rgba(255,193,7,0.1);padding:2px 8px;border-radius:10px;">PON ${esc(i.pon)}</span>` : ''}</div>${delBtn}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${(i.modulos||[]).map(m => `<span style="font-size:11px;font-weight:600;background:rgba(99,102,241,0.15);color:#a5b4fc;padding:3px 8px;border-radius:8px;">${esc(lm(m.tipo))}${m.cds&&m.cds.length ? ' + '+m.cds.map(cd=>cd.cantidad+'×'+lm(cd.modelo)).join(', ') : ''}</span>`).join('')}
                </div>
            </div>`;
        }
        // Tendido (nuevo o antiguo)
        const tramosArr = Array.isArray(i.tramos)
            ? i.tramos
            : Object.entries(i.tramos||{}).filter(([,v])=>parseInt(v)>0).map(([k,v])=>({tipo:k,metros:parseInt(v),bobinaRef:''}));
        return `<div class="informe-item">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                <div>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                        <span style="font-size:16px;font-weight:700;font-family:Poppins,sans-serif;color:#fff;">${esc(labelPunto(i.tipoOrigen,i.origen))}</span>
                        <span style="font-size:11px;color:var(--gris-texto);">→</span>
                        <span style="font-size:16px;font-weight:700;font-family:Poppins,sans-serif;color:#fff;">${esc(labelPunto(i.tipoDestino,i.destino))}</span>
                    </div>
                    ${i.pon ? `<span style="font-size:10px;font-weight:700;color:var(--amarillo);background:rgba(255,193,7,0.1);padding:2px 8px;border-radius:10px;">PON ${esc(i.pon)}</span>` : ''}
                </div>${delBtn}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">
                <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:rgba(16,185,129,0.15);color:var(--verde);">${metrosRegistro(i)}m total</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${tramosArr.map(t => `<span style="font-size:10px;font-weight:600;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.8);padding:3px 7px;border-radius:5px;border:1px solid rgba(255,255,255,0.08);">${TIPOS_TRAMO.find(tt=>tt.id===t.tipo)?.l||t.tipo}: ${t.metros}m${t.bobinaRef ? ' ('+esc(t.bobinaRef)+')' : ''}</span>`).join('')}
            </div>
        </div>`;
    };

    return `
    <div class="header"><button class="btn-atras" onclick="ir('calendario')">${I.back}</button>
        <h2 class="titulo-pantalla" style="font-size:16px;">${esc(lab)}</h2></div>
    <div style="padding:0 20px 8px;">
        <p style="font-size:13px;color:var(--gris-texto);margin:0;">${inst.length} registro${inst.length!==1?'s':''} · ${totalM}m</p>
    </div>
    <div class="informe-lista">${inst.length === 0 ? `<div class="vacio">${I.doc}<p>Sin registros</p></div>` : inst.map(cardDia).join('')}</div>`;
}

// ─── CONFIG ───────────────────────────────────────
function rConfig() {
    const mat = localStorage.getItem('cel_matricula') || '';
    const eq  = localStorage.getItem('cel_equipo') || '';
    const vanId = localStorage.getItem('cel_van_id') || 'celador_1';
    const vanLabel = id => '🚐 Cuadrilla ' + id.replace('celador_','');
    return `
    <div class="header"><button class="btn-atras" onclick="ir('inicio')">${I.back}</button><h2 class="titulo-pantalla">Configuración</h2></div>
    <div class="form">
        <div class="campo"><label class="campo-label">Tu cuadrilla</label>
            <select class="campo-select" onchange="setVan(this.value)">
                ${VAN_IDS.map(id => `<option value="${id}" ${vanId===id ? 'selected':''}>${esc(vanLabel(id))}</option>`).join('')}
            </select>
        </div>
        <div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.15);border-radius:12px;padding:14px 16px;margin-bottom:16px;">
            <p style="font-size:12px;color:var(--amarillo);font-weight:600;margin:0 0 2px;">Actualmente: ${esc(vanLabel(vanId))}</p>
            <p style="font-size:11px;color:var(--gris-texto);margin:0;">ID: ${esc(vanId)}</p>
        </div>
        <div class="campo"><label class="campo-label">Nombre del equipo / jefe</label>
            <input type="text" id="inp-eq" class="campo-input" placeholder="Ej: Sergio" maxlength="40" value="${esc(eq)}">
        </div>
        <div class="campo"><label class="campo-label">Matrícula / referencia</label>
            <input type="text" id="inp-mat" class="campo-input" placeholder="Ej: 1234-ABC" maxlength="20" value="${esc(mat)}">
        </div>
        <button onclick="guardarConfig()"
            style="background:var(--amarillo);color:var(--negro);border:none;border-radius:16px;padding:20px;font-family:Poppins,sans-serif;font-size:16px;font-weight:600;width:100%;cursor:pointer;margin-top:8px;box-shadow:var(--sombra-amarillo);">
            Guardar configuración
        </button>
    </div>`;
}

// ─── ROUTER ───────────────────────────────────────
const PAGES = {
    inicio: rInicio, registrar: rRegistrar,
    malla: rMalla, modulos: rModulos,
    stock: rStock, material: rMaterial,
    avisos: rAvisos, pedido: rPedido, informe: rInforme,
    calendario: rCalendario, dia: rDia, config: rConfig
};

function render() {
    document.getElementById('app').innerHTML = (PAGES[E.pantalla] || rInicio)();
    window.scrollTo(0, 0);
}

async function ir(p) {
    E.pantalla = p;
    const needsBobinas = ['inicio','stock','material','registrar','pedido','avisos'].includes(p);
    const needsMods    = ['inicio','stock','material','avisos','pedido','modulos'].includes(p);
    if (needsBobinas || needsMods) await Promise.all([
        needsBobinas ? loadBobinas() : Promise.resolve(),
        needsMods    ? loadMods()    : Promise.resolve()
    ]);
    if (['inicio','informe'].includes(p)) await loadHoy();
    if (p === 'calendario') await loadCal();
    if (p === 'registrar') {
        E.fTend = {
            modo: 'cable', paso: 1,
            tipoOrigen: 'cto', tipoDestino: 'cto',
            origen: '', destino: '', pon: '',
            tramos: [], tramoCurrent: { tipo: 'fachada', metros: '', bobinaId: '' },
            ctoRaiser: '',
            raisers: [], raiserCurrent: { bobinaId: '', metros: '', nombre: '' }
        };
    }
    if (p === 'malla') E.fMalla = { puntoA: '', puntoB: '', metros: '' };
    if (p === 'modulos') E.fModulos = { pon: '', tipoPunto: 'cto', punto: '', modulos: [], modCurrent: { tipo: '', conCDs: false, cds: [{ cantidad: '', modelo: '' }] } };
    if (p === 'material') E.fMat = { seccion: 'bobinas', nuevaRef: '', nuevaTipo: '12kp', nuevaTotal: '', modulo: '', cantidad: '' };
    if (p === 'avisos') E.fLim = { item: '', limite: '' };
    render();
}

window.E = E;

// ─── SPLASH & BOOT ───────────────────────────────
let prog = 0;
const bar = document.getElementById('splash-bar');
const splashInt = setInterval(() => {
    prog += 5; bar.style.width = prog + '%';
    if (prog >= 100) {
        clearInterval(splashInt);
        setTimeout(() => {
            document.getElementById('splash').classList.add('oculto');
            setTimeout(() => document.getElementById('splash').style.display = 'none', 600);
        }, 200);
    }
}, 30);

await Promise.all([loadBobinas(), loadMods()]);
await loadHoy();
render();
