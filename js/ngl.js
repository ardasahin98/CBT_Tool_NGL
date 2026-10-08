/* CBT Tool – NGL database connection.
   Sign in with an NGL account (the API issues a 2-hour token), browse the
   direct simple shear test stages, filter them, and load the selected stages
   straight into the tool. The password is sent only to obtain the token and is
   never stored; the token is kept in sessionStorage (this browser tab only). */
"use strict";
(() => {
const CFG = Object.assign({ base: "https://nextgenerationliquefaction.org", proxy: "" }, window.NGL_CONFIG || {});
const TOKEN_LIFE = 2 * 3600 * 1000;
const STORE = "cbt_ngl_session_v1";
const PAGE = 5000, IN_CHUNK = 150, LOAD_CHUNK = 10, MAX_ROWS_DRAWN = 3000;
const NGL_UNITS = { time: "s", stress: "kPa", strain: "%" };   // units of DSSS_DATA in NGL
const EP = {
  token: "/users/api-token",
  stages: "/direct-simple-shear-test-stages/api-index",
  tests: "/direct-simple-shear-tests/api-index",
  specs: "/specimens/api-index",
  samps: "/samples/api-index",
  progSamp: "/lab-programs-samples/api-index",
  progs: "/lab-programs/api-index",
  progCit: "/lab-program-citations/api-index",
  labs: "/labs/api-index",
    plas: "/plasticity-tests/api-index",
};
const CORS_HELP = "The browser could not reach the NGL API from this page. This usually means NGL does not yet " +
  "allow requests from this website (CORS). On Vercel, make sure vercel.json is deployed; locally, run serve.py; " +
  "elsewhere, set a proxy in js/config.js (see README, \"NGL database connection\").";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const has = (v) => v !== null && v !== undefined && v !== "";
const S = {
  token: null, exp: 0, user: "", base: null,
  rows: null, typeKey: null, colFilter: {}, cyclicKnown: false, rawKeys: [], extraCols: [], warnings: [],
  sel: new Set(), sort: { k: "prog", dir: 1 }, unrev: true, busy: false,
};

/* ------------------------------------------------------------------ */
/*  Session                                                            */
/* ------------------------------------------------------------------ */
function saveSession() {
  try { sessionStorage.setItem(STORE, JSON.stringify({ token: S.token, exp: S.exp, user: S.user, base: S.base })); } catch (e) { /* storage unavailable */ }
}
function loadSession() {
  try {
    const o = JSON.parse(sessionStorage.getItem(STORE) || "null");
    if (o && o.token && o.exp > Date.now() + 30000) Object.assign(S, o);
  } catch (e) { /* storage unavailable */ }
}
function clearSession() {
  S.token = null; S.exp = 0; S.rows = null; S.sel.clear();
  try { sessionStorage.removeItem(STORE); } catch (e) { /* storage unavailable */ }
}
const signedIn = () => !!S.token && Date.now() < S.exp;
const b64 = (s) => { let t = ""; new TextEncoder().encode(s).forEach(x => { t += String.fromCharCode(x); }); return btoa(t); };
function tokenExpiry(tok) {
  // NGL tokens are valid for 2 hours; use the JWT "exp" claim if the token has one.
  try {
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p.exp) return Math.min(p.exp * 1000, Date.now() + TOKEN_LIFE);
  } catch (e) { /* not a JWT */ }
  return Date.now() + TOKEN_LIFE;
}
function candidates() {
  const c = [];
  // Same-address relay first: vercel.json (Vercel) or serve.py (local) forward /ngl/... to NGL,
  // so the browser never makes a cross-origin request.
  if (/^https?:$/.test(location.protocol)) c.push({ base: location.origin + "/ngl", name: "relay on this site (/ngl)" });
  if (CFG.base) c.push({ base: CFG.base.replace(/\/+$/, ""), name: "NGL directly" });
  if (CFG.proxy) c.push({ base: CFG.proxy.replace(/\/+$/, ""), name: "proxy in config.js" });
  return c;
}
async function readJSON(r) {
  const t = await r.text();
  try { return { j: JSON.parse(t), t }; } catch (e) { return { j: null, t }; }
}
function errMsg(j, t, status) {
  let m = j && typeof j === "object" ? (j.errorMessage || j.message || j.error) : (typeof j === "string" ? j : null);
  if (!m) m = `HTTP ${status}`;
  return String(m).replace(/<br\s*\/?>/gi, "; ");
}

async function signIn(user, pass) {
  const auth = "Basic " + b64(user + ":" + pass);
  const tried = [];
  for (const { base, name } of candidates()) {
    let r;
    try {
      r = await fetch(base + EP.token, { headers: { Accept: "application/json", Authorization: auth }, cache: "no-store", credentials: "omit" });
    } catch (e) { tried.push(`${name}: blocked by the browser (CORS) or unreachable`); continue; }
    const { j, t } = await readJSON(r);
    if (j && j.token) {
      S.token = j.token; S.exp = tokenExpiry(j.token); S.user = user; S.base = base; S.rows = null;
      saveSession(); return;
    }
    if (j === null) {   // not a JSON answer: no relay at this address, or an HTML error page
      tried.push(`${name}: HTTP ${r.status}, not an NGL API response`); continue;
    }
    if (r.status === 401 || r.status === 403) throw new Error("Sign-in failed. Check your NGL email and password.");
    throw new Error("Sign-in failed: " + errMsg(j, t, r.status));
  }
  throw new Error(CORS_HELP + " Tried: " + tried.join("; ") + ".");
}

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */
class AuthError extends Error {}
async function api(ep, params = {}) {
  if (!signedIn()) { expired(); throw new AuthError("Your NGL session has ended. Please sign in again."); }
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (has(v)) p.set(k, v);
  if (S.unrev) p.set("includeUnreviewed", "1");
  const qs = p.toString();
  const headers = { Accept: "application/json", Authorization: "Bearer " + S.token };
  let r;
  try {
    r = qs.length > 1500   // long where=/select= values go in a POST body (same parameters)
      ? await fetch(S.base + ep, { method: "POST", headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded" }, headers), body: qs, cache: "no-store", credentials: "omit" })
      : await fetch(S.base + ep + (qs ? "?" + qs : ""), { headers, cache: "no-store", credentials: "omit" });
  } catch (e) { throw new Error("Could not reach the NGL API. " + CORS_HELP); }
  const { j, t } = await readJSON(r);
  if (!r.ok || !Array.isArray(j)) {
    const m = errMsg(j, t, r.status);
    if (/token|expired|authori[sz]/i.test(m)) { expired(); throw new AuthError("Your NGL session has expired. Please sign in again."); }
    throw new Error(`NGL API ${ep.split("/")[1]}: ${m}`);
  }
  return j;
}
async function apiAll(ep, params = {}) {
  const out = [];
  for (let page = 1; ; page++) {
    const rows = await api(ep, Object.assign({}, params, { limit: PAGE, page }));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
async function apiIn(ep, key, ids, params = {}) {
  const u = [...new Set(ids.filter(has))];
  const out = [];
  for (let i = 0; i < u.length; i += IN_CHUNK) {
    out.push(...await apiAll(ep, Object.assign({}, params, { where: `${key} IN (${u.slice(i, i + IN_CHUNK).join(",")})` })));
  }
  return out;
}
// Related tables only add labels; if one cannot be read the list still works.
async function opt(label, fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof AuthError) throw e;
    S.warnings.push(`${label}: ${e.message}`); return [];
  }
}
const byKey = (arr, k) => { const m = new Map(); for (const r of arr) if (has(r[k]) && !m.has(String(r[k]))) m.set(String(r[k]), r); return m; };
const groupBy = (arr, k) => { const m = new Map(); for (const r of arr) { const key = String(r[k]); if (!m.has(key)) m.set(key, []); m.get(key).push(r); } return m; };
const pick = (o, keys) => { if (!o) return ""; for (const k of keys) if (has(o[k])) return o[k]; return ""; };
const LOADING_TYPE = { 0: "consolidation", 1: "monotonic", 2: "cyclic" };
// MySQL BIT/INT values may arrive as 1, "1", true, "\u0001" or "b'1'"
function bitOrInt(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v.length === 1 && v.charCodeAt(0) < 32) return v.charCodeAt(0);
    const m = v.match(/-?\d+/);
    return m ? +m[0] : null;
  }
  return null;
}
const firstKey = (o, re) => o ? Object.keys(o).find(k => re.test(k)) : undefined;

/* ------------------------------------------------------------------ */
/*  List of DSS test stages                                            */
/* ------------------------------------------------------------------ */
async function loadList() {
  S.warnings = [];
  status("Reading direct simple shear test stages…");
  const probe = await api(EP.stages, { limit: 1 });
  if (!probe.length) { S.rows = []; return; }
  // never download the time series for the list (they are large)
  const select = Object.keys(probe[0]).filter(k => !/_DATA$/i.test(k));
  const stages = await apiAll(EP.stages, { select: select.join(",") });
  status(`Found ${stages.length} stages. Reading test, specimen, sample and lab program details…`);

  const tests = await opt("DSS tests", () => apiIn(EP.tests, "DSSG_ID", stages.map(s => s.DSSG_ID)));
  const tMap = byKey(tests, "DSSG_ID");
  const specIds = stages.map(s => s.SPEC_ID ?? (tMap.get(String(s.DSSG_ID)) || {}).SPEC_ID);
  const specs = await opt("Specimens", () => apiIn(EP.specs, "SPEC_ID", specIds));
  const spMap = byKey(specs, "SPEC_ID");
  const samps = await opt("Samples", () => apiIn(EP.samps, "SAMP_ID", specs.map(s => s.SAMP_ID)));
  const saMap = byKey(samps, "SAMP_ID");
  const sampIds = samps.map(s => s.SAMP_ID);

  const [progSamp, progs, labs, plas] = await Promise.all([
    opt("Lab programs ↔ samples", () => apiIn(EP.progSamp, "SAMP_ID", sampIds)),
    opt("Lab programs", () => apiAll(EP.progs)),
    opt("Labs", () => apiAll(EP.labs)),
    opt("Plasticity tests", async () => {
      const p = await api(EP.plas, { limit: 1 });
      if (!p.length) return [];
      const k = "SAMP_ID" in p[0] ? "SAMP_ID" : ("SPEC_ID" in p[0] ? "SPEC_ID" : null);
      if (!k) return [];
      const rows = await apiIn(EP.plas, k, k === "SAMP_ID" ? sampIds : specs.map(s => s.SPEC_ID));
      rows._key = k; return rows;
    }),
  ]);
  const psMap = groupBy(progSamp, "SAMP_ID"), pMap = byKey(progs, "LAB_PROGRAM_ID"), lMap = byKey(labs, "LAB_ID");
  const plKey = plas._key, plMap = plKey ? byKey(plas, plKey) : new Map();
  const llKey = "PLAS_LL", piKey = null;
  const labName = (l) => pick(l, ["LAB_NAME", "LAB_DESC", "LAB_ABBR", "LAB_INST"]) || (l ? String(l.LAB_ID) : "");

  // Codes from the NGL schema (tables/DSSS.html):
  //   DSSS_TY  type of stage: 0 = consolidation, 1 = monotonic loading, 2 = cyclic loading
  //   DSSS_DR  drained (0) or undrained (1)
  S.typeKey = "DSSS_TY";
  S.cyclicKnown = stages.some(st => has(st.DSSS_TY));
  const e0Key = "DSSG_E0", w0Key = "DSSG_W0";
  const plPlKey = "PLAS_PL";
  // citation IDs of each lab program (Lab programs <-> Citations junction)
  const progCit = await opt("Lab program citations", () => apiIn(EP.progCit, "LAB_PROGRAM_ID", progSamp.map(x => x.LAB_PROGRAM_ID)));
  const citKey = firstKey(progCit[0], /CIT.*_ID$/i);
  const pcMap = groupBy(progCit, "LAB_PROGRAM_ID");

  const keys = new Set();
  S.rows = stages.map(st => {
    const t = tMap.get(String(st.DSSG_ID)) || {};
    const sp = spMap.get(String(st.SPEC_ID ?? t.SPEC_ID)) || {};
    const sa = saMap.get(String(sp.SAMP_ID)) || {};
    const plist = (psMap.get(String(sa.SAMP_ID)) || []).map(x => pMap.get(String(x.LAB_PROGRAM_ID))).filter(Boolean);
    const progsTxt = [...new Set(plist.map(p => pick(p, ["LAB_PROGRAM_DESC", "LAB_PROGRAM_NAME"]) || `Program ${p.LAB_PROGRAM_ID}`))];
    const labsTxt = [...new Set(plist.map(p => labName(lMap.get(String(p.LAB_ID)))).filter(has))];
    const pl = plMap.get(String(plKey === "SPEC_ID" ? sp.SPEC_ID : sa.SAMP_ID)) || {};
    const raw = Object.assign({}, sa, sp, t, st);
    Object.keys(raw).forEach(k => keys.add(k));
    const typeCode = bitOrInt(st.DSSS_TY), drCode = bitOrInt(st.DSSS_DR);
    const typeVal = LOADING_TYPE[typeCode] ?? (has(st.DSSS_TY) ? `type ${st.DSSS_TY}` : "");
    const drain = drCode === 1 ? "undrained" : drCode === 0 ? "drained" : "";
    const fromAny = (k) => (k ? (t[k] ?? sp[k] ?? st[k] ?? "") : "");
    const cits = citKey ? [...new Set(plist.flatMap(p => (pcMap.get(String(p.LAB_PROGRAM_ID)) || []).map(c => c[citKey])).filter(has))] : [];
    const row = {
      id: st.DSSS_ID, stage: st.DSSS_ST ?? "", test: st.DSSG_ID ?? "",
      prog: progsTxt.join("; "), progs: progsTxt, lab: labsTxt.join("; "), labs: labsTxt,
      samp: pick(sa, ["SAMP_NAME"]), spec: pick(sp, ["SPEC_REF", "SPEC_NAME"]),
      type: typeVal, cyclic: S.cyclicKnown ? typeCode === 2 : true, drain,
      cit: cits.join(", "), e0: fromAny(e0Key), w0: fromAny(w0Key),
      ll: llKey ? (pl[llKey] ?? "") : "", pl: plPlKey ? (pl[plPlKey] ?? "") : "", pi: piKey ? (pl[piKey] ?? "") : "", raw,
    };
    row._txt = [row.prog, row.lab, row.samp, row.spec, row.type, row.id, row.test,
      ...Object.values(raw).filter(v => typeof v === "string" && v.length < 200)].join(" ").toLowerCase();
    return row;
  });
  S.rawKeys = [...keys].sort();
  // keep the selection only for stages still listed
  const ids = new Set(S.rows.map(r => String(r.id)));
  [...S.sel].forEach(id => { if (!ids.has(id)) S.sel.delete(id); });
}

/* ------------------------------------------------------------------ */
/*  Stage time series -> CSV in the tool's template layout             */
/* ------------------------------------------------------------------ */
const decodeHtml = (s) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function parseStageData(v) {
  if (!has(v)) throw new Error("NGL has no time-series data for this stage");
  let d = v;
  for (let k = 0; k < 3 && typeof d === "string"; k++) {
    // same clean-up as Data_Int in ngl_def_v2.py (HTML-escaped quotes, empty list entries)
    const s = decodeHtml(d).trim().replace(/,(\s*,)+/g, ",").replace(/,\s*([\]}])/g, "$1").replace(/([[{])\s*,/g, "$1");
    try { d = JSON.parse(s); } catch (e) { d = JSON.parse(s.slice(1, -1)); }
  }
  if (Array.isArray(d)) {
    if (d.length === 1 && d[0] && typeof d[0] === "object" && Object.values(d[0]).some(Array.isArray)) d = d[0];
    else {   // list of records -> columns
      const cols = {};
      d.forEach(rec => Object.entries(rec || {}).forEach(([k, x]) => { (cols[k] = cols[k] || []).push(x); }));
      d = cols;
    }
  }
  if (!d || typeof d !== "object") throw new Error("unrecognized time-series format");
  return d;
}
function stageToCSV(rec, row) {
  const dataKey = firstKey(rec, /_DATA$/i);
  const d = parseStageData(rec && rec[dataKey]);
  const col = (re) => { const k = Object.keys(d).find(x => re.test(x)); return k ? d[k] : null; };
  const time = col(/(^|_)TIME$/i), tau = col(/(^|_)TAU$/i), sv = col(/(^|_)SIGV$/i), g = col(/(^|_)(YHV|GAMMA)$/i), ev = col(/(^|_)EPSV$/i);
  const missing = [["time", time], ["shear stress", tau], ["vertical stress", sv], ["shear strain", g]].filter(x => !Array.isArray(x[1])).map(x => x[0]);
  if (missing.length) throw new Error("time series without " + missing.join(", "));
  const n = Math.min(time.length, tau.length, sv.length, g.length);
  const cell = (x) => (has(x) ? x : "");
  const lines = [
    `# NGL database | DSSS_ID ${row.id} | DSSG_ID ${row.test} | sample ${row.samp} | specimen ${row.spec} | stage ${row.stage} | ${row.prog}`.replace(/[\r\n]+/g, " "),
    "DSSS_TIME (Time),DSSS_TAU (Shear stress),DSSS_SIGV (Vertical effective stress),DSSS_YHV (Shear strain),DSSS_EPSV (Vertical strain)",
  ];
  for (let i = 0; i < n; i++) lines.push([time[i], tau[i], sv[i], g[i], ev ? ev[i] : ""].map(cell).join(","));
  return lines.join("\n");
}
const fileName = (r) => ("NGL_" + [r.samp, r.spec, has(r.stage) ? "St" + r.stage : "", "DSSS" + r.id].filter(has).join("_"))
  .replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 90) + ".csv";

async function loadSelected() {
  const rowsById = new Map(S.rows.map(r => [String(r.id), r]));
  const ids = [...S.sel].filter(id => rowsById.has(id));
  if (!ids.length) return;
  busy(true);
  let ok = 0, skipped = 0; const fail = [];
  try {
    for (let i = 0; i < ids.length; i += LOAD_CHUNK) {
      const chunk = ids.slice(i, i + LOAD_CHUNK);
      status(`Downloading test data ${i + 1}–${i + chunk.length} of ${ids.length}…`);
      const recs = await apiAll(EP.stages, { where: `DSSS_ID IN (${chunk.join(",")})` });
      const recMap = byKey(recs, "DSSS_ID");
      for (const id of chunk) {
        const row = rowsById.get(id), name = fileName(row);
        if (window.cbtHasTest && window.cbtHasTest(name)) { skipped++; continue; }
        try {
          const csv = stageToCSV(recMap.get(id), row);
          window.cbtAddTest(name, csv, NGL_UNITS, ok === 0);
          ok++;
        } catch (e) { fail.push(`${name}: ${e.message}`); }
      }
    }
  } catch (e) {
    fail.push(e.message);
  } finally { busy(false); }
  const msg = [`Loaded ${ok} stage${ok === 1 ? "" : "s"} into the tool.`];
  if (skipped) msg.push(`${skipped} already loaded.`);
  if (fail.length) {
    status(msg.join(" ") + ` ${fail.length} could not be loaded: ` + fail.map(esc).join(" · "), true, true);
  } else {
    status(msg.join(" "));
    $("nglDlg").close();
  }
}

/* ------------------------------------------------------------------ */
/*  UI                                                                 */
/* ------------------------------------------------------------------ */
// Same columns as the NGL lab test viewer's metadata table
const COLS = [
  { k: "lab", t: "Lab", ph: "labs" }, { k: "prog", t: "Lab Program", ph: "lab programs" },
  { k: "cit", t: "Citation ID", ph: "citation IDs" }, { k: "samp", t: "Sample", ph: "samples" },
  { k: "spec", t: "Specimen", ph: "specimens" }, { k: "e0", t: "e<sub>0</sub>", num: true },
  { k: "w0", t: "w<sub>0</sub>", num: true }, { k: "ll", t: "LL", num: true }, { k: "pl", t: "PL", num: true },
  { k: "stage", t: "Stage", ph: "stages", num: true }, { k: "type", t: "Loading Type", ph: "types" },
  { k: "drain", t: "Drainage", ph: "drainage" },
];
const visibleCols = () => COLS.concat(S.extraCols.map(k => ({ k: "raw:" + k, t: esc(k), raw: k, ph: "values" })));
const cellVal = (r, c) => (c.raw ? r.raw[c.raw] : r[c.k]);

function status(msg, isErr = false, html = false) {
  const el = $("nglStatus");
  el.classList.toggle("err", !!isErr);
  el[html ? "innerHTML" : "textContent"] = msg || "";
}
function busy(b) {
  S.busy = b;
  ["nglLoad", "nglRefresh", "nglUnrev"].forEach(id => { $(id).disabled = b || (id === "nglLoad" && !S.sel.size); });
  $("nglDlg").classList.toggle("busy", b);
}
function showLogin(msg) {
  $("nglLogin").hidden = false; $("nglBrowse").hidden = true;
  const e = $("nglLoginErr");
  e.hidden = !msg; e.textContent = msg || "";
  updateSessionText();
  setTimeout(() => (S.user && !$("nglUser").value ? $("nglPass") : $("nglUser")).focus(), 30);
}
function showBrowse() {
  $("nglLogin").hidden = true; $("nglBrowse").hidden = false;
  updateSessionText();
  if (!S.rows && !S.busy) refresh(); else render();
}
async function refresh() {
  busy(true);
  $("nglTable").innerHTML = "";
  $("nglUnrev").checked = S.unrev;
  try {
    await loadList();
    fillFilters();
    render(true);
    const n = S.rows.length;
    let msg = n ? "" : "No direct simple shear test stages were returned. Try \"Include unreviewed data\".";
    if (n && !S.cyclicKnown) msg = "Cyclic stages could not be identified from the NGL fields, so all DSS stages are listed. Use the column search boxes to narrow the list.";
    if (S.warnings.length) msg += (msg ? " " : "") + "Some details could not be read (" + S.warnings.join("; ") + ").";
    status(msg);
  } catch (e) {
    if (!(e instanceof AuthError)) status(e.message, true);
  } finally { busy(false); }
}
function expired(msg) {
  const user = S.user;
  clearSession(); S.user = user;
  updateSessionText();
  if ($("nglDlg").open) showLogin(msg || "Your 2-hour NGL session has ended. Please sign in again.");
}
function fmtLeft(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}
function updateSessionText() {
  const on = signedIn();
  if (!on && S.token) { expired(); return; }
  $("nglSession").innerHTML = on ? `Signed in as <b>${esc(S.user)}</b> · token valid ${fmtLeft(S.exp - Date.now())} · <a href="#" data-ngl-out>Sign out</a>` : "";
  $("nglLine").innerHTML = on
    ? `NGL: <b>${esc(S.user)}</b> · ${fmtLeft(S.exp - Date.now())} left · <a href="#" data-ngl-out>Sign out</a>`
    : "Sign in with your NGL account to load CDSS tests.";
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-ngl-out]")) {
    e.preventDefault(); const u = S.user; clearSession(); S.user = u;
    updateSessionText(); if ($("nglDlg").open) showLogin();
  }
});

function fillFilters() {
  $("nglCyclic").disabled = !S.cyclicKnown;
  $("nglCyclic").closest("label").title = S.cyclicKnown ? "Stages with DSSS_TY = 2 (cyclic loading)" : "Cyclic stages could not be identified";
  $("nglAddCol").innerHTML = `<option value="">Add column…</option>` +
    S.rawKeys.filter(k => !S.extraCols.includes(k)).map(k => `<option>${esc(k)}</option>`).join("");
}
function filtered() {
  const cyc = $("nglCyclic").checked && S.cyclicKnown;
  const cols = visibleCols();
  const fl = cols.map(c => [c, (S.colFilter[c.k] || "").trim().toLowerCase()]).filter(x => x[1]);
  const out = S.rows.filter(r => (!cyc || r.cyclic) &&
    fl.every(([c, q]) => String(cellVal(r, c) ?? "").toLowerCase().includes(q)));
  const c = cols.find(x => x.k === S.sort.k) || COLS[0];
  const num = (v) => (has(v) && isFinite(+v) ? +v : null);
  out.sort((a, b) => {
    const x = cellVal(a, c), y = cellVal(b, c), nx = num(x), ny = num(y);
    let d = (nx !== null && ny !== null) ? nx - ny : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true });
    if (!d) d = String(a.spec).localeCompare(String(b.spec), undefined, { numeric: true }) || (num(a.stage) || 0) - (num(b.stage) || 0);
    return d * S.sort.dir;
  });
  return out;
}
// Header (titles + one search box per column) is drawn only when columns or sorting change,
// so typing in a search box never loses focus; the body is redrawn on every keystroke.
function renderHead() {
  const cols = visibleCols();
  const titles = cols.map(c => `<th data-k="${esc(c.k)}" title="Sort">${c.t}${S.sort.k === c.k ? (S.sort.dir > 0 ? " ▲" : " ▼") : ""}` +
    `${c.raw ? ` <button class="x" data-rmcol="${esc(c.raw)}" title="Remove column">×</button>` : ""}</th>`).join("");
  const boxes = cols.map(c => c.ph
    ? `<td><input type="search" class="ngl-colq" data-q="${esc(c.k)}" placeholder="Search for ${c.ph}…" value="${esc(S.colFilter[c.k] || "")}"></td>`
    : "<td></td>").join("");
  $("nglTable").innerHTML = `<thead><tr class="ngl-titles"><th><input type="checkbox" id="nglAllBox" title="Select all shown"></th>${titles}</tr>` +
    `<tr class="ngl-qrow"><td></td>${boxes}</tr></thead><tbody id="nglBody"></tbody>`;
}
function render(head = false) {
  if (!S.rows) return;
  if (head || !$("nglBody")) renderHead();
  const cols = visibleCols(), rows = filtered();
  const shown = rows.slice(0, MAX_ROWS_DRAWN);
  $("nglAllBox").checked = shown.length > 0 && shown.every(r => S.sel.has(String(r.id)));
  $("nglBody").innerHTML = shown.map(r => {
    const id = String(r.id), on = S.sel.has(id);
    return `<tr data-id="${esc(id)}" class="${on ? "sel" : ""}${r.cyclic ? "" : " noncyc"}"><td><input type="checkbox" ${on ? "checked" : ""}></td>` +
      cols.map(c => `<td class="${c.num ? "num" : ""}" title="${esc(cellVal(r, c))}">${esc(cellVal(r, c))}</td>`).join("") + "</tr>";
  }).join("");
  const more = rows.length > shown.length ? ` (first ${MAX_ROWS_DRAWN} drawn; narrow the search)` : "";
  $("nglCount").textContent = `${rows.length} of ${S.rows.length} stages shown${more} · ${S.sel.size} selected`;
  $("nglLoad").disabled = S.busy || !S.sel.size;
  $("nglLoad").textContent = S.sel.size ? `Load ${S.sel.size} selected into the tool` : "Load selected into the tool";
}

function init() {
  if (!$("nglDlg")) return;
  loadSession();
  updateSessionText();
  setInterval(updateSessionText, 30000);
  const dlg = $("nglDlg");
  $("nglOpen").onclick = () => { dlg.showModal(); signedIn() ? showBrowse() : showLogin(); };
  $("nglClose").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  $("nglLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = $("nglUser").value.trim(), pass = $("nglPass").value;
    if (!user || !pass) return;
    $("nglSignIn").disabled = true; $("nglSignIn").textContent = "Signing in…"; $("nglLoginErr").hidden = true;
    try {
      await signIn(user, pass);
      $("nglPass").value = "";
      showBrowse();
    } catch (err) {
      $("nglLoginErr").hidden = false; $("nglLoginErr").textContent = err.message;
    } finally { $("nglSignIn").disabled = false; $("nglSignIn").textContent = "Sign in"; }
  });
  $("nglCyclic").addEventListener("change", () => render());
  $("nglTable").addEventListener("input", (e) => {
    if (e.target.dataset.q) { S.colFilter[e.target.dataset.q] = e.target.value; render(); }
  });
  $("nglUnrev").addEventListener("change", (e) => { S.unrev = e.target.checked; refresh(); });
  $("nglRefresh").onclick = refresh;
  $("nglAddCol").addEventListener("change", (e) => {
    if (e.target.value) { S.extraCols.push(e.target.value); fillFilters(); render(true); }
  });
  $("nglSelAll").onclick = () => { filtered().forEach(r => S.sel.add(String(r.id))); render(); };
  $("nglSelNone").onclick = () => { S.sel.clear(); render(); };
  $("nglLoad").onclick = loadSelected;
  $("nglTable").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rmcol]");
    if (rm) { delete S.colFilter["raw:" + rm.dataset.rmcol]; S.extraCols = S.extraCols.filter(k => k !== rm.dataset.rmcol); fillFilters(); render(true); return; }
    if (e.target.id === "nglAllBox") {
      const rows = filtered().slice(0, MAX_ROWS_DRAWN);
      rows.forEach(r => (e.target.checked ? S.sel.add(String(r.id)) : S.sel.delete(String(r.id))));
      render(); return;
    }
    const thEl = e.target.closest("th[data-k]");
    if (thEl) { const k = thEl.dataset.k; S.sort = { k, dir: S.sort.k === k ? -S.sort.dir : 1 }; render(true); return; }
    if (e.target.closest("thead")) return;   // clicks in the search row
    const tr = e.target.closest("tbody tr");
    if (tr) { const id = tr.dataset.id; S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); render(); }
  });
}
init();
})();
