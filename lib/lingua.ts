// La lingua di Abita: una riga per cosa, misure in centimetri, x verso destra (est), y verso il basso (sud).
// leggi() trasforma il testo in un modello; le funzioni di modifica cambiano solo i pezzi di riga che servono,
// così il testo resta come l'hanno scritto Claude o la persona.
import { CATALOGO, COLORI, coloreValido } from "./arredi.ts";
import { FORME, progettaScala, type Scala, type Scelte } from "./scala.ts";

export type Pt = { x: number; y: number };
export type Piano = { id: string; nome: string; quota: number; altezza: number; solaio: number; riga: number };
type Base = { riga: number; piano: string };
export type Muro = Base & { tipo: "muro"; punti: Pt[]; chiuso: boolean; spessore: number; altezza: number; fino: number; colore: string };   // fino: altezza alla fine (muri sotto la falda)
export type Stanza = Base & { tipo: "stanza"; nome: string; punti: Pt[]; colore: string; area: number; centro: Pt };
export type Area = Base & { tipo: "area"; nome: string; punti: Pt[]; colore: string };
export type Aggancio = { muro: number; seg: number; s: number; L: number; p: Pt; u: Pt; n: Pt; spessore: number; lato: 1 | -1 };
export type Apertura = Base & {
  tipo: "apertura"; cosa: "porta" | "finestra" | "portafinestra" | "varco"; a: Pt; larga: number; alta: number; davanzale: number;
  scorrevole: boolean; cardine: "sx" | "dx"; verso: string; aggancio?: Aggancio;
};
export type Arredo = Base & { tipo: "arredo"; cosa: string; nome: string; a: Pt; L: number; P: number; H: number; ruota: number; colore: string; quota: number; copertura?: boolean; calpestabile?: boolean; scala?: Scala };
export type Tetto = Base & { tipo: "tetto"; punti: Pt[]; falde: number; altezza: number; sporto: number; colore: string; colmo: "x" | "y" };
export type Misura = Base & { tipo: "misura"; punti: Pt[] };
export type Foro = Base & { tipo: "foro"; punti: Pt[] };
export type Elemento = Muro | Stanza | Area | Apertura | Arredo | Tetto | Misura | Foro;
/** Un oggetto 3D importato (scale, tetti, mobili su misura): misure e sagoma in pianta, coordinate locali come gli arredi. */
export type ModelloInfo = { L: number; P: number; H: number; pianta: number[][][] };
export type Errore = { riga: number; msg: string };
export type Modello = { titolo: string; cliente: string; piani: Piano[]; el: Elemento[]; errori: Errore[]; righe: string[]; modelli: Record<string, ModelloInfo> };

export type Tok = { t: string; s: number; e: number; q?: true };
const HEX = /^#[0-9a-f]{6}$/i;
const NUM = /^-?\d+(?:\.\d+)?$/;
const PT = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
const PASSO = /^([<>^v])(\d+(?:\.\d+)?)$/;
const MIS = /^\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?){0,2}$/;

const PAR_NUM: Record<string, string> = { spessore: "spessore", altezza: "altezza", alto: "altezza", alta: "altezza", quota: "quota", solaio: "solaio", ruota: "ruota", davanzale: "davanzale", sporto: "sporto", falde: "falde", fino: "fino",
  larga: "larga", larghezza: "larga", alzata: "alzata", pedata: "pedata", prima: "prima", pozzo: "pozzo" };
const PAR_PAROLA: Record<string, string> = { colore: "colore", materiale: "colore", pavimento: "colore", verso: "verso", cardine: "cardine", colmo: "colmo", forma: "forma", giro: "giro" };
const FLAG = new Set(["chiudi", "chiuso", "scorrevole", "piano", "copertura", "calpestabile", "ventaglio", "pianerottolo"]);
export const APERTURE: Record<string, [number, number, number]> = { porta: [80, 210, 0], finestra: [120, 140, 90], portafinestra: [140, 240, 0], varco: [90, 210, 0] };
const ALIAS: Record<string, string> = {
  livello: "piano", locale: "stanza", vano: "stanza", terrazza: "area", prato: "giardino", apertura: "varco",
  lettino: "letto_singolo", "letto-singolo": "letto_singolo", "mobile-tv": "mobile_tv", frigorifero: "frigo", water: "wc", vaso: "wc", scale: "scala",
};
export const PAROLE = ["progetto", "cliente", "piano", "muro", "stanza", "giardino", "area", "tetto", "misura", "foro", "modello", ...Object.keys(APERTURE), ...Object.keys(CATALOGO)];

export function tokenizza(r: string): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < r.length;) {
    const ch = r[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === '"' || ch === "“" || ch === "”") {       // anche le virgolette “curve” della tastiera del telefono
      let j = i + 1;
      while (j < r.length && !'"“”'.includes(r[j])) j++;
      out.push({ t: r.slice(i + 1, j), s: i, e: Math.min(j + 1, r.length), q: true });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < r.length && r[j] !== " " && r[j] !== "\t") j++;
    const t = r.slice(i, j);
    if (t.startsWith("#") && !HEX.test(t)) break;        // commento fino a fine riga (ma #a1b2c3 è un colore)
    out.push({ t, s: i, e: j });
    i = j;
  }
  return out;
}

function lev(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
function forse(w: string, lista: string[]) {
  let best = "", bd = Math.min(3, Math.ceil(w.length / 2));
  for (const p of lista) { const d = lev(w, p); if (d < bd) { bd = d; best = p; } }
  return best ? ` (forse "${best}"?)` : "";
}

type Args = { nome?: string; punti: Pt[]; mis?: number[]; a?: Pt; n: Record<string, number>; w: Record<string, string>; f: Set<string> };

function argomenti(toks: Tok[], riga: number, err: Errore[]): Args {
  const A: Args = { punti: [], n: {}, w: {}, f: new Set() };
  for (let i = 1; i < toks.length; i++) {
    const { t, q } = toks[i], l = t.toLowerCase(), dopo = toks[i + 1];
    let m: RegExpExecArray | null;
    if (q) { if (A.nome === undefined) A.nome = t; else err.push({ riga, msg: `"${t}": il nome c'è già` }); continue; }
    if (l === "a" && dopo && PT.test(dopo.t)) { m = PT.exec(dopo.t)!; A.a = { x: +m[1], y: +m[2] }; i++; continue; }
    if (PAR_NUM[l]) {
      if (dopo && NUM.test(dopo.t)) { A.n[PAR_NUM[l]] = +dopo.t; i++; } else err.push({ riga, msg: `dopo "${t}" ci vuole un numero` });
      continue;
    }
    if (PAR_PAROLA[l]) {
      if (dopo) { A.w[PAR_PAROLA[l]] = dopo.q ? dopo.t : dopo.t.toLowerCase(); i++; } else err.push({ riga, msg: `dopo "${t}" ci vuole una parola` });
      continue;
    }
    if (FLAG.has(l)) { A.f.add(l === "chiuso" ? "chiudi" : l); continue; }
    if ((m = PT.exec(t))) { A.punti.push({ x: +m[1], y: +m[2] }); continue; }
    if ((m = PASSO.exec(t))) {
      const p = A.punti[A.punti.length - 1], d = +m[2];
      if (!p) { err.push({ riga, msg: `"${t}": un passo va scritto dopo un punto x,y da cui partire` }); continue; }
      A.punti.push({ x: p.x + (m[1] === ">" ? d : m[1] === "<" ? -d : 0), y: p.y + (m[1] === "v" ? d : m[1] === "^" ? -d : 0) });
      continue;
    }
    if (MIS.test(t) && !A.mis) { A.mis = t.split("x").map(Number); continue; }
    if (A.nome === undefined && /^\p{L}[\p{L}\d_'-]*$/u.test(t)) { A.nome = t; continue; }
    err.push({ riga, msg: `non capisco "${t}"` + forse(l, [...Object.keys(PAR_NUM), ...Object.keys(PAR_PAROLA), ...FLAG, "a"]) });
  }
  return A;
}

export const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "piano";
const rett = (p: Pt[]) => p.length === 2 ? [p[0], { x: p[1].x, y: p[0].y }, p[1], { x: p[0].x, y: p[1].y }] : p;

export function leggi(testo: string, modelli: Record<string, ModelloInfo> = {}): Modello {
  const righe = testo.split(/\r?\n/);
  const M: Modello = { titolo: "", cliente: "", piani: [], el: [], errori: [], righe, modelli };
  const err = M.errori;
  let cur: Piano | null = null;
  const piano = () => {
    if (!cur) { cur = { id: "terra", nome: "Terra", quota: 0, altezza: 270, solaio: 30, riga: -1 }; M.piani.push(cur); }
    return cur;
  };
  const colore = (A: Args, riga: number, def: string) => {
    const c = A.w.colore ?? def;
    if (coloreValido(c)) return c;
    err.push({ riga, msg: `colore "${c}" sconosciuto` + forse(c, Object.keys(COLORI)) });
    return def;
  };
  const scaleAuto: Arredo[] = [], scelte = new Map<Arredo, Omit<Scelte, "H">>();

  righe.forEach((r, i) => {
    const toks = tokenizza(r);
    if (!toks.length) return;
    const k0 = toks[0].t.toLowerCase(), k = ALIAS[k0] ?? k0;
    if (k === "progetto" || k === "cliente") {
      const v = toks.slice(1).map(t => t.t).join(" ");
      if (k === "progetto") M.titolo = v; else M.cliente = v;
      return;
    }
    const A = argomenti(toks, i, err), pt = (min: number, cosa: string) => {
      if (A.punti.length >= min) return true;
      err.push({ riga: i, msg: `${cosa}: servono almeno ${min} punti x,y` });
      return false;
    };
    const pos = () => A.a ?? (A.punti.length === 1 ? A.punti[0] : undefined);
    switch (k) {
      case "piano": {
        const prev = M.piani[M.piani.length - 1], solaio = A.n.solaio ?? 30, altezza = A.n.altezza ?? 270;
        const nome = A.nome ?? `Piano ${M.piani.length + 1}`;
        let id = slug(nome);
        if (M.piani.some(p => p.id === id)) { err.push({ riga: i, msg: `il piano "${nome}" c'è già` }); id += "_" + i; }
        cur = { id, nome, quota: A.n.quota ?? (prev ? prev.quota + prev.altezza + solaio : 0), altezza, solaio, riga: i };
        M.piani.push(cur);
        return;
      }
      case "muro": {
        const p = piano();
        const h = A.n.altezza ?? p.altezza;
        if (pt(2, "muro")) M.el.push({ tipo: "muro", riga: i, piano: p.id, punti: A.punti, chiuso: A.f.has("chiudi"), spessore: A.n.spessore ?? 20, altezza: h, fino: A.n.fino ?? h, colore: colore(A, i, "muro") });
        return;
      }
      case "stanza": {
        const p = piano();
        if (!pt(2, "stanza")) return;
        const punti = rett(A.punti);
        M.el.push({ tipo: "stanza", riga: i, piano: p.id, nome: A.nome ?? "Stanza", punti, colore: colore(A, i, "gres"), area: Math.round(Math.abs(area2(punti)) / 1e3) / 10, centro: puntoInterno(punti) });
        return;
      }
      case "giardino": case "area": {
        const p = piano();
        if (pt(2, k)) M.el.push({ tipo: "area", riga: i, piano: p.id, nome: A.nome ?? "", punti: rett(A.punti), colore: colore(A, i, k === "giardino" ? "prato" : "pietra") });
        return;
      }
      case "tetto": {
        const p = piano();
        if (!pt(2, "tetto")) return;
        const [a, b] = A.punti, x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        const falde = A.f.has("piano") ? 0 : Math.max(0, Math.min(2, Math.round(A.n.falde ?? 2)));
        const colmo = A.w.colmo === "x" || A.w.colmo === "y" ? A.w.colmo : x1 - x0 >= y1 - y0 ? "x" : "y";
        M.el.push({ tipo: "tetto", riga: i, piano: p.id, punti: [{ x: x0, y: y0 }, { x: x1, y: y1 }], falde, altezza: A.n.altezza ?? (falde ? 150 : 20), sporto: A.n.sporto ?? 40, colore: colore(A, i, "tegola"), colmo });
        return;
      }
      case "misura": {
        const p = piano();
        if (pt(2, "misura")) M.el.push({ tipo: "misura", riga: i, piano: p.id, punti: A.punti.slice(0, 2) });
        return;
      }
      case "foro": {
        const p = piano();
        if (pt(2, "foro")) M.el.push({ tipo: "foro", riga: i, piano: p.id, punti: rett(A.punti) });
        return;
      }
      case "modello": {
        const p = piano(), a = pos(), m = A.nome ? modelli[A.nome] : undefined;
        if (!A.nome || !a) { err.push({ riga: i, msg: `modello: scrivi il nome tra virgolette e dove sta, per esempio modello "Scala a U" a 300,200` }); return; }
        if (!m) err.push({ riga: i, msg: `modello "${A.nome}": non c'è tra i modelli importati` + forse(A.nome, Object.keys(modelli)) });
        M.el.push({ tipo: "arredo", riga: i, piano: p.id, cosa: "modello", nome: A.nome, a, L: m?.L ?? 50, P: m?.P ?? 50, H: m?.H ?? 50, ruota: (((A.n.ruota ?? 0) % 360) + 360) % 360, colore: "bianco", quota: A.n.quota ?? 0, copertura: A.f.has("copertura"), calpestabile: A.f.has("calpestabile") });
        return;
      }
    }
    if (APERTURE[k]) {
      const p = piano(), a = pos(), [L, H, dav] = APERTURE[k];
      if (!a) { err.push({ riga: i, msg: `${k}: scrivi dove sta, per esempio "a 300,0"` }); return; }
      M.el.push({ tipo: "apertura", riga: i, piano: p.id, cosa: k as Apertura["cosa"], a, larga: A.mis?.[0] ?? L, alta: A.mis?.[1] ?? A.n.altezza ?? H, davanzale: A.n.davanzale ?? dav, scorrevole: A.f.has("scorrevole"), cardine: A.w.cardine === "dx" ? "dx" : "sx", verso: A.w.verso ?? "" });
      return;
    }
    const v = CATALOGO[k];
    if (v) {
      const p = piano(), a = pos();
      if (!a) { err.push({ riga: i, msg: `${k}: scrivi dove sta il centro, per esempio "a 200,150"` }); return; }
      const ar: Arredo = { tipo: "arredo", riga: i, piano: p.id, cosa: k, nome: A.nome ?? "", a, L: A.mis?.[0] ?? v.L, P: A.mis?.[1] ?? v.P, H: A.mis?.[2] ?? A.n.altezza ?? v.H, ruota: (((A.n.ruota ?? 0) % 360) + 360) % 360, colore: colore(A, i, v.colore), quota: A.n.quota ?? 0 };
      if (k === "scala") {
        let forma = A.w.forma;
        if (!forma && A.nome && /^(dritta|l|u|chiocciola)$/i.test(A.nome) && !toks.some(t => t.q)) { forma = A.nome.toLowerCase(); ar.nome = ""; }   // "scala U a …"
        if (forma && !(forma in FORME)) err.push({ riga: i, msg: `forma "${forma}": scrivi dritta, L, U o chiocciola` });
        if (A.w.giro && A.w.giro !== "sx" && A.w.giro !== "dx") err.push({ riga: i, msg: `giro "${A.w.giro}": scrivi sx o dx` });
        scelte.set(ar, { forma, giro: A.w.giro, larga: A.n.larga, alzata: A.n.alzata, pedata: A.n.pedata, prima: A.n.prima, pozzo: A.n.pozzo, ventaglio: A.f.has("ventaglio"), pianerottolo: A.f.has("pianerottolo"), L: A.mis?.[0], P: A.mis?.[1] });
        if (!ar.H) scaleAuto.push(ar);
      }
      M.el.push(ar);
      return;
    }
    err.push({ riga: i, msg: `non conosco "${toks[0].t}"` + forse(k, PAROLE) });
  });

  for (const s of scaleAuto) {                         // la scala sale fino al piano di sopra
    const p = M.piani.find(q => q.id === s.piano)!, su = M.piani.filter(q => q.quota > p.quota).sort((a, b) => a.quota - b.quota)[0];
    s.H = su ? su.quota - p.quota : p.altezza + p.solaio;
  }
  for (const [s, o] of scelte) {                       // i gradini veri: l'ingombro viene da forma, larghezza e pedata
    s.scala = progettaScala({ ...o, H: s.H });
    s.L = s.scala.L;
    s.P = s.scala.P;
  }
  aggancia(M);
  return M;
}

// --- geometria
export const area2 = (p: Pt[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
export function dentro(q: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > q.y) !== (b.y > q.y) && q.x < a.x + ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y)) c = !c;
  }
  return c;
}
export function distSeg(q: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy);
}
export function segmenti(m: Muro): [Pt, Pt][] {
  const s: [Pt, Pt][] = m.punti.slice(1).map((p, i) => [m.punti[i], p]);
  if (m.chiuso && m.punti.length > 2) s.push([m.punti[m.punti.length - 1], m.punti[0]]);
  return s;
}
export function lati(poly: Pt[]): [Pt, Pt][] { return poly.map((p, i) => [p, poly[(i + 1) % poly.length]]); }
function puntoInterno(poly: Pt[]): Pt {
  const A = area2(poly);
  if (Math.abs(A) > 1e-6) {
    let cx = 0, cy = 0;
    lati(poly).forEach(([a, b]) => { const f = a.x * b.y - b.x * a.y; cx += (a.x + b.x) * f; cy += (a.y + b.y) * f; });
    const c = { x: cx / (6 * A), y: cy / (6 * A) };
    if (dentro(c, poly)) return c;
  }
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  let best = poly[0], bd = -1;                         // stanze a L: il punto interno più lontano dai bordi
  for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
    const q = { x: x0 + (w * i) / 12, y: y0 + (h * j) / 12 };
    if (!dentro(q, poly)) continue;
    const d = Math.min(...lati(poly).map(([a, b]) => distSeg(q, a, b)));
    if (d > bd) { bd = d; best = q; }
  }
  return best;
}
export function angoli(a: Arredo, margine = 0): Pt[] {
  const c = Math.cos((a.ruota * Math.PI) / 180), s = Math.sin((a.ruota * Math.PI) / 180), L = a.L / 2 + margine, P = a.P / 2 + margine;
  return [[-L, -P], [L, -P], [L, P], [-L, P]].map(([x, y]) => ({ x: a.a.x + x * c - y * s, y: a.a.y + x * s + y * c }));
}
export const locale = (a: Arredo, x: number, y: number): Pt => {
  const c = Math.cos((a.ruota * Math.PI) / 180), s = Math.sin((a.ruota * Math.PI) / 180);
  return { x: a.a.x + x * c - y * s, y: a.a.y + x * s + y * c };
};
/** Quello che occupa in pianta: la sagoma vera per le scale (a L, a U, chiocciola), il rettangolo per il resto. */
export const sagoma = (a: Arredo): Pt[] => (a.scala ? a.scala.sagoma.map(p => locale(a, p.x, p.y)) : angoli(a));

/** Le aperture che tagliano un tratto di muro a→b: anche quelle agganciate a un tratto vicino sulla stessa linea
 *  (muri spezzati, per esempio al colmo). s0, s1 sono misurati lungo a→b. */
export function vani(M: Modello, piano: string, a: Pt, b: Pt, spessore = 0) {
  const L = Math.hypot(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / (L || 1), y: (b.y - a.y) / (L || 1) };
  return M.el.flatMap(o => {
    if (o.tipo !== "apertura" || o.piano !== piano || !o.aggancio) return [];
    const g = o.aggancio;
    if (Math.abs(u.x * g.u.y - u.y * g.u.x) > 0.02 || Math.abs((g.p.x - a.x) * u.y - (g.p.y - a.y) * u.x) > Math.max(2, (g.spessore + spessore) / 2 + 1)) return [];
    const s = (g.p.x - a.x) * u.x + (g.p.y - a.y) * u.y, s0 = s - o.larga / 2, s1 = s + o.larga / 2;
    return s1 > 0.5 && s0 < L - 0.5 ? [{ o, s0, s1 }] : [];
  });
}

/** Il tratto [-w/2, w/2] intorno a g.p è tutto coperto da muri sulla stessa linea? */
function coperto(M: Modello, piano: string, g: Aggancio, w: number) {
  const tratti: [number, number][] = [];
  for (const m of M.el) if (m.tipo === "muro" && m.piano === piano) for (const [a, b] of segmenti(m)) {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1 || Math.abs(((b.x - a.x) / L) * g.u.y - ((b.y - a.y) / L) * g.u.x) > 0.02 || Math.abs((g.p.x - a.x) * g.u.y - (g.p.y - a.y) * g.u.x) > 2) continue;
    const ta = (a.x - g.p.x) * g.u.x + (a.y - g.p.y) * g.u.y, tb = (b.x - g.p.x) * g.u.x + (b.y - g.p.y) * g.u.y;
    tratti.push([Math.min(ta, tb) - m.spessore / 2 - 1, Math.max(ta, tb) + m.spessore / 2 + 1]);
  }
  let fin = -w / 2;
  for (const [x0, x1] of tratti.sort((p, q) => p[0] - q[0])) if (x0 <= fin) fin = Math.max(fin, x1);
  return fin >= w / 2;
}

function aggancia(M: Modello) {
  M.el.forEach(e => {
    if (e.tipo !== "apertura") return;
    let best: Aggancio | undefined, bd = Infinity;
    M.el.forEach((m, mi) => {
      if (m.tipo !== "muro" || m.piano !== e.piano) return;
      segmenti(m).forEach(([a, b], seg) => {
        const d = distSeg(e.a, a, b);
        if (d >= bd || d > m.spessore / 2 + 40) return;
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 1) return;
        const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, s = Math.max(0, Math.min(L, (e.a.x - a.x) * u.x + (e.a.y - a.y) * u.y));
        bd = d;
        best = { muro: mi, seg, s, L, p: { x: a.x + u.x * s, y: a.y + u.y * s }, u, n: { x: -u.y, y: u.x }, spessore: m.spessore, lato: 1 };
      });
    });
    if (!best) { M.errori.push({ riga: e.riga, msg: `${e.cosa}: nessun muro vicino a ${e.a.x},${e.a.y} (deve stare sulla linea di un muro)` }); return; }
    const g: Aggancio = best;
    if ((g.s - e.larga / 2 < -g.spessore / 2 - 1 || g.s + e.larga / 2 > g.L + g.spessore / 2 + 1) && !coperto(M, e.piano, g, e.larga))
      M.errori.push({ riga: e.riga, msg: `${e.cosa} larga ${e.larga}: non entra nel tratto di muro lungo ${Math.round(g.L)}` });
    const stanze = M.el.filter((s): s is Stanza => s.tipo === "stanza" && s.piano === e.piano);
    const prova = (k: number) => ({ x: g.p.x + g.n.x * k * (g.spessore / 2 + 25), y: g.p.y + g.n.y * k * (g.spessore / 2 + 25) });
    if (e.verso) {
      const st = stanze.find(s => s.nome.toLowerCase() === e.verso.toLowerCase());
      if (!st) M.errori.push({ riga: e.riga, msg: `verso "${e.verso}": su questo piano non c'è una stanza con questo nome` + forse(e.verso.toLowerCase(), stanze.map(s => s.nome.toLowerCase())) });
      else if (dentro(prova(1), st.punti)) g.lato = 1;
      else if (dentro(prova(-1), st.punti)) g.lato = -1;
      else M.errori.push({ riga: e.riga, msg: `verso "${e.verso}": la stanza non tocca questa ${e.cosa}` });
    } else if (!stanze.some(s => dentro(prova(1), s.punti)) && stanze.some(s => dentro(prova(-1), s.punti))) g.lato = -1;
    e.aggancio = g;
  });
}

// --- descrizioni (per Claude e per l'editor)
export function etichetta(e: Elemento) {
  switch (e.tipo) {
    case "muro": return `muro sp. ${e.spessore}`;
    case "stanza": return `stanza ${e.nome}`;
    case "area": return e.nome || (e.colore === "prato" ? "giardino" : "area");
    case "apertura": return `${e.cosa} ${e.larga}`;
    case "arredo": return e.cosa === "modello" ? `"${e.nome}"` : e.nome ? `${e.cosa} "${e.nome}"` : e.scala ? `scala ${FORME[e.scala.forma]}` : e.cosa.replace("_", " ");
    case "tetto": return e.falde ? `tetto a ${e.falde} falde` : "tetto piano";
    case "misura": return "misura";
    case "foro": return "foro nel solaio";
  }
}

export function distanza(e: Elemento, q: Pt): number {
  switch (e.tipo) {
    case "muro": return Math.min(...segmenti(e).map(([a, b]) => distSeg(q, a, b))) - e.spessore / 2;
    case "stanza": case "area": return dentro(q, e.punti) ? 0 : Math.min(...lati(e.punti).map(([a, b]) => distSeg(q, a, b)));
    case "apertura": return Math.max(0, Math.hypot(q.x - e.a.x, q.y - e.a.y) - e.larga / 2);
    case "arredo": { const c = angoli(e); return dentro(q, c) ? 0 : Math.min(...lati(c).map(([a, b]) => distSeg(q, a, b))); }
    case "tetto": case "misura": return distSeg(q, e.punti[0], e.punti[1]);
    case "foro": return dentro(q, e.punti) ? 0 : Math.min(...lati(e.punti).map(([a, b]) => distSeg(q, a, b)));
  }
}

export function vicini(M: Modello, piano: string, q: Pt, raggio = 80) {
  return M.el.filter(e => e.piano === piano && e.tipo !== "tetto" && e.tipo !== "stanza" && e.tipo !== "area" && e.tipo !== "foro")
    .map(e => ({ e, d: Math.max(0, distanza(e, q)) }))
    .filter(v => v.d <= raggio)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
}

export const stanzaDi = (M: Modello, piano: string, q: Pt) =>
  M.el.find((e): e is Stanza | Area => (e.tipo === "stanza" || e.tipo === "area") && e.piano === piano && e.colore !== "prato" && dentro(q, e.punti));

export function riassunto(M: Modello) {
  return M.piani.map(p => {
    const st = M.el.filter((e): e is Stanza => e.tipo === "stanza" && e.piano === p.id);
    const n = M.el.filter(e => e.tipo === "arredo" && e.piano === p.id).length;
    const tot = st.reduce((s, x) => s + x.area, 0);
    return `${p.nome} (quota ${p.quota}, altezza ${p.altezza}): ` + (st.length ? st.map(s => `${s.nome} ${s.area.toFixed(1).replace(".", ",")} m²`).join(", ") + ` · totale ${tot.toFixed(1).replace(".", ",")} m²` : "nessuna stanza") + ` · ${n} arredi`;
  }).join("\n");
}

// --- modifiche al testo
const fmt = (v: number) => String(Math.round(v * 10) / 10);
const dividi = (t: string) => t.split(/\r?\n/);

export function cambiaRiga(testo: string, riga: number, nuova: string) {
  const r = dividi(testo);
  r[riga] = nuova;
  return r.join("\n");
}

export function togli(testo: string, riga: number) {
  const r = dividi(testo);
  r.splice(riga, 1);
  return r.join("\n");
}

/** Sposta tutto quello che sta su una riga: cambia solo i punti assoluti x,y (i passi >300 restano uguali). */
export function sposta(testo: string, riga: number, dx: number, dy: number) {
  const r = dividi(testo);
  let s = r[riga];
  for (const t of tokenizza(s).reverse()) {
    const m = !t.q && PT.exec(t.t);
    if (m) s = s.slice(0, t.s) + fmt(+m[1] + dx) + "," + fmt(+m[2] + dy) + s.slice(t.e);
  }
  r[riga] = s;
  return r.join("\n");
}

/** Riscrive tutti i punti della riga (muro, stanza…) come punti assoluti. */
export function impostaPunti(testo: string, riga: number, punti: Pt[]) {
  const r = dividi(testo);
  let s = r[riga];
  const toks = tokenizza(s), pts = toks.filter((t, k) => !t.q && (PT.test(t.t) || PASSO.test(t.t)) && toks[k - 1]?.t.toLowerCase() !== "a");
  if (!pts.length) return testo;
  for (const t of pts.slice(1).reverse()) s = s.slice(0, t.s).replace(/[ \t]+$/, "") + s.slice(t.e);
  s = s.slice(0, pts[0].s) + punti.map(p => fmt(p.x) + "," + fmt(p.y)).join(" ") + s.slice(pts[0].e);
  r[riga] = s;
  return r.join("\n");
}

/** Imposta "a x,y", un parametro numerico (ruota 90) o le misure (LxP). valore null = togli il parametro. */
export function imposta(testo: string, riga: number, chiave: string, valore: string | null) {
  const r = dividi(testo);
  let s = r[riga];
  const toks = tokenizza(s), fine = toks.length ? toks[toks.length - 1].e : s.length;
  if (chiave === "misure") {
    const t = toks.find((t, k) => k > 0 && !t.q && MIS.test(t.t) && !(toks[k - 1].t.toLowerCase() in PAR_NUM));
    if (t) s = valore ? s.slice(0, t.s) + valore + s.slice(t.e) : s.slice(0, t.s).replace(/[ \t]+$/, "") + s.slice(t.e);
    else if (valore) s = s.slice(0, toks[0].e) + " " + valore + s.slice(toks[0].e);
  } else {
    const i = toks.findIndex((t, k) => k > 0 && !t.q && t.t.toLowerCase() === chiave && toks[k + 1]);
    if (i > 0) s = valore === null ? s.slice(0, toks[i].s).replace(/[ \t]+$/, "") + s.slice(toks[i + 1].e) : s.slice(0, toks[i + 1].s) + valore + s.slice(toks[i + 1].e);
    else if (valore !== null) s = s.slice(0, fine) + ` ${chiave} ${valore}` + s.slice(fine);
  }
  r[riga] = s;
  return r.join("\n");
}

/** Accende o spegne una parola singola sulla riga (chiudi, scorrevole, copertura, calpestabile, piano). */
export function segna(testo: string, riga: number, parola: string, si: boolean) {
  const r = dividi(testo), toks = tokenizza(r[riga]), simili = parola === "chiudi" ? ["chiudi", "chiuso"] : [parola];
  let s = r[riga];
  const c = toks.filter((t, k) => k > 0 && !t.q && simili.includes(t.t.toLowerCase()));
  if (!si) for (const t of c.reverse()) s = s.slice(0, t.s).replace(/[ \t]+$/, "") + s.slice(t.e);
  else if (!c.length) { const fine = toks.length ? toks[toks.length - 1].e : s.length; s = s.slice(0, fine) + " " + parola + s.slice(fine); }
  r[riga] = s;
  return r.join("\n");
}

/** Aggiunge una riga in fondo al blocco di un piano; restituisce il testo e il numero della riga nuova. */
export function aggiungi(testo: string, M: Modello, piano: string, nuova: string) {
  const r = dividi(testo), pi = M.piani.findIndex(p => p.id === piano);
  if (pi < 0 || M.piani[pi].riga < 0) {
    let fine = r.length;
    while (fine > 0 && !r[fine - 1].trim()) fine--;
    r.splice(fine, 0, nuova);
    return { testo: r.join("\n"), riga: fine };
  }
  const prossimo = M.piani.filter(p => p.riga > M.piani[pi].riga).map(p => p.riga).sort((a, b) => a - b)[0] ?? r.length;
  let fine = prossimo;
  while (fine > M.piani[pi].riga + 1 && !r[fine - 1].trim()) fine--;
  const rientro = (r.slice(M.piani[pi].riga + 1, fine).reverse().find(x => x.trim()) ?? "  x").match(/^[ \t]*/)![0] || "  ";
  r.splice(fine, 0, rientro + nuova);
  return { testo: r.join("\n"), riga: fine };
}

/** Righe del testo nuovo che non c'erano prima (per evidenziare cosa ha cambiato Claude). */
export function righeCambiate(prima: string, dopo: string): number[] {
  const A = dividi(prima), B = dividi(dopo);
  let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length, eb = B.length;
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const a = A.slice(s, ea), b = B.slice(s, eb);
  if (a.length * b.length > 4e6) return b.map((_, i) => i + s);
  const T = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) T[i][j] = a[i] === b[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
  const out: number[] = [];
  for (let i = 0, j = 0; j < b.length;) {
    if (i < a.length && a[i] === b[j]) { i++; j++; } else if (i < a.length && T[i + 1][j] >= T[i][j + 1]) i++; else out.push(s + j++);
  }
  return out.filter(i => B[i].trim());
}
