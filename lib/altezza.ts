// Quanto spazio c'è sopra un punto della pianta: da dove si poggiano i piedi (pavimento, gradino, pavimento rialzato,
// il piano di un mobile) fino alla prima cosa sopra la testa: il solaio del piano di sopra se lì non c'è un buco,
// un tetto, un oggetto importato (coperture, ballatoi, travi), un pensile. Quote in cm dal pavimento del piano.
import { CATALOGO } from "./arredi.ts";
import { bucoScala, dentro, etichetta, locale, sagoma, type Arredo, type Modello, type Pt, type Tetto } from "./lingua.ts";
import type { Triangoli } from "./passaggi.ts";

const SCALA = /^scala\b|stair/i;
export type Altezza = { base: number; cima: number | null; libera: number | null; sotto: string; sopra: string; buco?: true };

/** La quota del triangolo t di w (x, y in pianta e z, tre vertici di fila) sopra il punto p, se p ci cade dentro. */
function zIn(w: Float64Array, t: number, p: Pt): number | null {
  const ax = w[t], ay = w[t + 1], bx = w[t + 3], by = w[t + 4], cx = w[t + 6], cy = w[t + 7];
  if (p.x < Math.min(ax, bx, cx) - 0.01 || p.x > Math.max(ax, bx, cx) + 0.01 || p.y < Math.min(ay, by, cy) - 0.01 || p.y > Math.max(ay, by, cy) + 0.01) return null;
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(d) < 1e-6) return null;                       // faccia in verticale: in pianta è una linea
  const l1 = ((by - cy) * (p.x - cx) + (cx - bx) * (p.y - cy)) / d, l2 = ((cy - ay) * (p.x - cx) + (ax - cx) * (p.y - cy)) / d, l3 = 1 - l1 - l2;
  return l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4 ? null : l1 * w[t + 2] + l2 * w[t + 5] + l3 * w[t + 8];
}
/** I triangoli di un modello già portati in pianta e in quota da terra: si calcolano una volta per ogni lettura del testo. */
const MONDO = new WeakMap<Arredo, Float64Array[]>();
function nelMondo(M: Modello, a: Arredo, tri: Record<string, Float32Array>) {
  let w = MONDO.get(a);
  if (w) return w;
  const q0 = (M.piani.find(q => q.id === a.piano)?.quota ?? 0) + a.quota, c = Math.cos((a.ruota * Math.PI) / 180), s = Math.sin((a.ruota * Math.PI) / 180);
  w = Object.values(tri).map(v => {
    const o = new Float64Array(v.length);
    for (let i = 0; i + 2 < v.length; i += 3) { o[i] = a.a.x + v[i] * c - v[i + 1] * s; o[i + 1] = a.a.y + v[i] * s + v[i + 1] * c; o[i + 2] = q0 + v[i + 2]; }
    return o;
  });
  MONDO.set(a, w);
  return w;
}
/** Il sotto di un tetto sopra il punto, se il punto è sotto il tetto (sporto compreso). */
export function sottoTetto(t: Tetto, base: number, p: Pt): number | null {
  const [a, b] = t.punti, s = t.sporto, h = t.altezza;
  if (p.x < a.x - s || p.x > b.x + s || p.y < a.y - s || p.y > b.y + s) return null;
  if (!t.falde) return base;
  const sw = t.colmo === "y", v = sw ? p.x : p.y, v0 = sw ? a.x : a.y, v1 = sw ? b.x : b.y;
  if (t.falde === 2) { const vm = (v0 + v1) / 2; return base + h * (1 - Math.abs(v - vm) / (vm - v0)); }
  return base + h - (h / (v1 - v0)) * (v - v0);
}

export function altezzaLibera(M: Modello, piano: string, p: Pt, mesh: Triangoli = {}): Altezza {
  const P = M.piani.find(q => q.id === piano)!, z0 = P.quota, cm = (v: number) => Math.round(v - z0);
  const qui = (a: Arredo) => dentro(p, sagoma(a));
  const nelBuco = (id: string) => M.el.some(e => (e.tipo === "foro" && e.piano === id && dentro(p, e.punti)) || (() => { const h = bucoScala(M, e, id); return !!h && dentro(p, h); })());
  if (nelBuco(piano))                                          // il buco nel pavimento: qui sotto c'è la scala
    return { base: 0, cima: null, libera: null, sotto: "buco nel pavimento", sopra: "", buco: true };

  // dove si poggiano i piedi: il punto più alto tra pavimento, gradini, pavimenti rialzati e piani dei mobili bassi
  let base = z0, sotto = `pavimento del piano ${P.nome}`;
  const cime: [number, string][] = [];
  const triangoli = (a: Arredo, fa: (z: number) => void) => {     // le quote dei triangoli del modello sopra il punto
    const tri = mesh[a.nome];
    if (!tri) return;
    for (const w of nelMondo(M, a, tri)) for (let t = 0; t + 8 < w.length; t += 9) { const z = zIn(w, t, p); if (z !== null) fa(z); }
  };
  for (const a of M.el) {
    if (a.tipo !== "arredo" || a.piano !== piano || !qui(a)) continue;
    if (a.scala) {
      const g = a.scala.gradini.find(d => dentro(p, d.poli.map(q => locale(a, q.x, q.y))));
      if (g && z0 + a.quota + g.z > base) { base = z0 + a.quota + g.z; sotto = `gradino della ${etichetta(a)} (riga ${a.riga + 1})`; }
    } else if (a.cosa === "modello") {
      const scala = SCALA.test(a.nome);                        // su una scala importata si sta sul gradino, a qualunque quota
      if (a.calpestabile) triangoli(a, z => { if (z > base && (scala || z < z0 + 250)) { base = z; sotto = `"${a.nome}"`; } });
    } else if (CATALOGO[a.cosa]?.ostacolo !== false && a.quota < 100 && z0 + a.quota + a.H > base) { base = z0 + a.quota + a.H; sotto = `sopra ${etichetta(a)} (riga ${a.riga + 1}), alto ${Math.round(a.quota + a.H)} cm`; }
  }
  for (const a of M.el) {                                      // un oggetto importato che comincia all'altezza del corpo (parapetto, piano di lavoro): ci si sta sopra, come per i mobili
    if (a.tipo !== "arredo" || a.piano !== piano || a.cosa !== "modello" || a.calpestabile || a.copertura || !qui(a)) continue;
    let lo = Infinity, hi = -Infinity;
    triangoli(a, z => { if (z > base - 2) { lo = Math.min(lo, z); hi = Math.max(hi, z); } });   // anche il fondo appoggiato a terra
    if (lo < base + 100 && hi > base + 2) { base = hi; sotto = `sopra "${a.nome}" (riga ${a.riga + 1}), alto ${Math.round(hi - z0)} cm`; }
  }

  // la prima cosa sopra la testa
  for (const a of M.el) {
    if (a.tipo !== "arredo" || !qui(a)) continue;
    const q0 = (M.piani.find(q => q.id === a.piano)?.quota ?? 0) + a.quota;
    if (a.cosa === "modello") triangoli(a, z => { if (z > base + 2) cime.push([z, `"${a.nome}"`]); });
    else if (!a.scala && q0 > base + 2) cime.push([q0, `${etichetta(a)} (riga ${a.riga + 1})`]);
  }
  for (const t of M.el) if (t.tipo === "tetto") {
    const T = M.piani.find(q => q.id === t.piano)!, z = sottoTetto(t, T.quota + T.altezza, p);
    if (z !== null && z > base + 2) cime.push([z, "tetto"]);
  }
  const sopra = M.piani.filter(q => q.quota > P.quota).sort((a, b) => a.quota - b.quota);
  for (const F of sopra) {                                     // il solaio del primo piano sopra che qui ha pavimento e non ha buchi
    const pav = M.el.some(e => e.piano === F.id && ((e.tipo === "stanza" || e.tipo === "area") ? dentro(p, e.punti) : e.tipo === "arredo" && e.calpestabile && qui(e)));
    if (pav && !nelBuco(F.id) && F.quota - F.solaio > base + 2) { cime.push([F.quota - F.solaio, `solaio del piano ${F.nome}`]); break; }   // un solaio sotto i piedi (in cima alla scala) non è un soffitto
  }
  if (!cime.length && !sopra.length) cime.push([z0 + P.altezza, "soffitto (altezza del piano)"]);
  const [cima, chi] = cime.sort((a, b) => a[0] - b[0])[0] ?? [null, ""];
  return { base: cm(base), cima: cima === null ? null : cm(cima), libera: cima === null ? null : Math.round(cima - base), sotto, sopra: chi || "niente, è aperto" };
}

/** Un campione del profilo: a s cm da A lungo la linea; piedi = ci si sta in piedi (non sopra un mobile). */
export type Campione = Altezza & { s: number; piedi: boolean };
/** L'altezza libera lungo la linea da a a b, ogni 5 cm (al massimo 200 campioni). */
export function profiloAltezza(M: Modello, piano: string, a: Pt, b: Pt, mesh: Triangoli = {}): { L: number; punti: Campione[] } {
  const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.min(200, Math.max(2, Math.ceil(L / 5))), punti: Campione[] = [];
  for (let i = 0; i <= n; i++) {
    const r = altezzaLibera(M, piano, { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, mesh);
    punti.push({ ...r, s: (L * i) / n, piedi: !r.sotto.startsWith("sopra ") });
  }
  return { L, punti };
}
