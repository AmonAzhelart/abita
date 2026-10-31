// Pianta in SVG (unità: cm). Stessa funzione per l'editor, la pagina del cliente e l'immagine che vede Claude.
// Ogni elemento cliccabile porta data-r = numero di riga del testo.
import { CATALOGO, hex } from "./arredi.ts";
import { dentro, lati, sagoma, segmenti, vani as vaniDi, type Apertura, type Arredo, type Modello, type Muro, type Pt } from "./lingua.ts";
import type { Esito } from "./passaggi.ts";
import { progettaScala } from "./scala.ts";

export type Colori = { muro: string; sotto: string; linea: string; testo: string; tenue: string; quota: string; fondo: string; bordo: string };
export const CHIARO: Colori = { muro: "#23262B", sotto: "rgba(35,38,43,0.13)", linea: "#23262B", testo: "#23262B", tenue: "#5B6169", quota: "#2557A7", fondo: "#F8F8F5", bordo: "rgba(35,38,43,0.6)" };
export const CSS: Colori = { muro: "var(--p-muro)", sotto: "var(--p-sotto)", linea: "var(--p-linea)", testo: "var(--fg)", tenue: "var(--muted)", quota: "var(--accent)", fondo: "var(--p-fondo)", bordo: "var(--p-bordo)" };
export type Etichetta = { x: number; y: number; testo: string; dim: number; ruota: number; colore: string; peso: number; dy?: number };   // dy: spostamento in em
export type OpzPianta = { piano: string; colori?: Colori; quote?: boolean; nomi?: boolean; sotto?: boolean; passaggi?: Esito | null; testo?: boolean };

const r1 = (v: number) => Math.round(v * 10) / 10;
const P2 = (p: Pt) => `${r1(p.x)},${r1(p.y)}`;
const st = (fill: string, stroke = "none", w = 0, extra = "") => `fill:${fill};stroke:${stroke};stroke-width:${w}${extra}`;
const rect = (x: number, y: number, w: number, h: number, s: string, rx = 0) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"${rx ? ` rx="${rx}"` : ""} style="${s}"/>`;
const linea = (a: Pt, b: Pt, s: string) => `<line x1="${r1(a.x)}" y1="${r1(a.y)}" x2="${r1(b.x)}" y2="${r1(b.y)}" style="${s}"/>`;
const cerchio = (x: number, y: number, r: number, s: string) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" style="${s}"/>`;
const ellisse = (x: number, y: number, rx: number, ry: number, s: string) => `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" style="${s}"/>`;
const poli = (p: Pt[], s: string, extra = "") => `<polygon points="${p.map(P2).join(" ")}" style="${s}"${extra}/>`;
const SALE = "#33373e";                                  // la linea di salita: scura, sui gradini chiari, in tutti e due i temi
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function riquadro(M: Modello, piano?: string) {
  const st = piano ? M.el.flatMap(e => (e.tipo === "stanza" && e.piano === piano ? e.punti : [])) : [];   // le stanze del piano, se ci sono
  const pts = st.length ? st : M.el.flatMap(e => e.tipo === "muro" || e.tipo === "stanza" ? e.punti : e.tipo === "arredo" ? [e.a] : []);
  if (!pts.length) return { x: -100, y: -100, w: 1200, h: 900 };
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), m = 80;
  return { x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: Math.max(...xs) - Math.min(...xs) + 2 * m, h: Math.max(...ys) - Math.min(...ys) + 2 * m };
}

/** I pezzi pieni di un muro (tolti i vani di porte e finestre), come poligoni. */
export function pezziMuro(M: Modello, m: Muro, conVani = true) {
  const mi = M.el.indexOf(m), out: { pts: Pt[]; seg: number }[] = [];
  segmenti(m).forEach(([a, b], seg) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) return;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y, y: u.x }, t = m.spessore / 2;
    const vani = conVani ? vaniDi(M, m.piano, a, b, m.spessore).map(v => [v.s0, v.s1]).sort((x, y) => x[0] - y[0]) : [];
    let s0 = -t;
    for (const [v0, v1] of [...vani, [L + t, L + t]]) {
      if (v0 - s0 > 0.5) {
        const q = (s: number, w: number) => ({ x: a.x + u.x * s + n.x * w, y: a.y + u.y * s + n.y * w });
        out.push({ pts: [q(s0, -t), q(v0, -t), q(v0, t), q(s0, t)], seg });
      }
      s0 = Math.max(s0, v1);
    }
  });
  return out;
}

function simbolo(a: Arredo, C: Colori, M: Modello) {
  if (a.cosa === "modello") {                            // sagoma dell'oggetto importato: in alto solo il contorno, a terra appena velato
    const info = M.modelli[a.nome], alto = a.quota >= 150 || !!a.copertura, basso = a.H < 25 || !!a.calpestabile;
    const S = alto ? st("none", C.tenue, 0.8, ";stroke-dasharray:6 4") : basso ? st("rgba(120,120,110,0.12)", C.bordo, 0.4) : st("rgba(120,120,110,0.28)", C.bordo, 0.8);
    if (!info?.pianta.length) return rect(-a.L / 2, -a.P / 2, a.L, a.P, S);
    return info.pianta.map(pg => `<polygon points="${pg.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ")}" style="${S}"/>`).join("");
  }
  const { L, P } = a, F = st(hex(a.colore, 0.5), C.bordo, 1.2), S = st(hex(a.colore, 0.25), C.bordo, 0.8), D = st("none", C.bordo, 0.8);
  const base = rect(-L / 2, -P / 2, L, P, F, 3), m = Math.min(L, P);
  switch (a.cosa) {
    case "divano": case "poltrona": {
      const br = Math.min(18, L * 0.12), sc = Math.min(22, P * 0.25);
      return base + rect(-L / 2, -P / 2, L, sc, S, 3) + rect(-L / 2, -P / 2, br, P, S, 3) + rect(L / 2 - br, -P / 2, br, P, S, 3);
    }
    case "letto": case "letto_singolo": {
      const c = L >= 140 ? [-L / 4 + 2, L / 4 - 2] : [0], w = L >= 140 ? L / 2 - 16 : L - 24;
      return rect(-L / 2, -P / 2, L, P, st(hex("rovere", 0.45), C.bordo, 1.2), 3) + rect(-L / 2 + 2, -P / 2 + 7, L - 4, P - 9, st("#fbfbf8", C.bordo, 0.6), 2)
        + c.map(x => rect(x - w / 2, -P / 2 + 12, w, 32, st("#ffffff", C.bordo, 0.8), 6)).join("") + rect(-L / 2 + 1, -P / 2 + P * 0.27, L - 2, P * 0.73 - 1, F, 3);
    }
    case "sedia": return base + rect(-L / 2, -P / 2, L, 6, S, 2);
    case "armadio": return base + linea({ x: -L / 2 + 5, y: 0 }, { x: L / 2 - 5, y: 0 }, D + ";stroke-dasharray:4 3") + linea({ x: -L / 2, y: P / 2 - 3 }, { x: L / 2, y: P / 2 - 3 }, D);
    case "cucina": {
      let s = base + rect(-L / 2, -P / 2, L, 35, st("none", C.bordo, 0.6, ";stroke-dasharray:5 4"));
      if (L >= 120) s += [[-12, -9], [12, -9], [-12, 13], [12, 13]].map(([x, y]) => cerchio(L / 4 + x, y, 7, D)).join("") + rect(-L / 4 - 22, -14, 44, 30, st(hex("acciaio", 0.3), C.bordo, 0.8), 5);
      return s;
    }
    case "frigo": return base + linea({ x: -L / 2, y: -P / 2 }, { x: L / 2, y: P / 2 }, D);
    case "lavatrice": return base + cerchio(0, 0, m * 0.32, D);
    case "lavabo": return base + ellisse(0, 3, L * 0.33, P * 0.3, st("#ffffff", C.bordo, 0.8));
    case "wc": return rect(-L / 2, -P / 2, L, 18, F, 3) + ellisse(0, 9, L * 0.45, (P - 18) / 2, F);
    case "bidet": return ellisse(0, 0, L / 2, P / 2, F) + cerchio(0, 0, 3, D);
    case "doccia": return base + linea({ x: -L / 2, y: -P / 2 }, { x: L / 2, y: P / 2 }, D) + linea({ x: L / 2, y: -P / 2 }, { x: -L / 2, y: P / 2 }, D) + cerchio(0, 0, 4, st("#ffffff", C.bordo, 0.8));
    case "vasca": return base + rect(-L / 2 + 7, -P / 2 + 7, L - 14, P - 14, st(hex("acqua", 0.4), C.bordo, 0.8), Math.min(25, P * 0.3));
    case "tappeto": return rect(-L / 2, -P / 2, L, P, st(hex(a.colore, 0.55), C.bordo, 0.8, ";stroke-dasharray:6 4;opacity:.75"), 2);
    case "pianta": return cerchio(0, 0, m / 2, st(hex("verde", 0.45), C.bordo, 0.8)) + cerchio(0, 0, m / 4, st(hex("verde", 0.25), C.bordo, 0.6));
    case "lampada": return cerchio(0, 0, m / 2, F) + linea({ x: -m / 2, y: 0 }, { x: m / 2, y: 0 }, D) + linea({ x: 0, y: -m / 2 }, { x: 0, y: m / 2 }, D);
    case "pouf": case "sgabello": return cerchio(0, 0, m / 2, F);
    case "camino": return base + rect(-L * 0.3, P / 2 - 14, L * 0.6, 14, st(hex("nero", 0.3), C.bordo, 0.8));
    case "libreria": return base + linea({ x: -L / 2 + 2, y: P / 2 - 4 }, { x: L / 2 - 2, y: P / 2 - 4 }, D);
    case "scala": {                                       // i gradini veri e la linea di salita, dal pallino alla freccia
      const sc = a.scala ?? progettaScala({ L, P, H: a.H || 300 }), pp = sc.percorso, z = pp[pp.length - 1], y = pp[pp.length - 2];
      const d = Math.hypot(z.x - y.x, z.y - y.y) || 1, u = { x: (z.x - y.x) / d, y: (z.y - y.y) / d }, k = Math.min(14, sc.larga * 0.2);
      return sc.gradini.map(g => poli(g.poli, g.tipo === "pianerottolo" ? S : F)).join("")
        + (sc.forma === "chiocciola" ? cerchio(0, 0, 7, st(hex("acciaio", 0.2), C.bordo, 0.8)) : "")
        + `<polyline points="${pp.map(P2).join(" ")}" style="${st("none", SALE, 1.6, ";stroke-linejoin:round")}"/>` + cerchio(pp[0].x, pp[0].y, 4, st(SALE))
        + poli([{ x: z.x - u.x * k - u.y * k * 0.5, y: z.y - u.y * k + u.x * k * 0.5 }, z, { x: z.x - u.x * k + u.y * k * 0.5, y: z.y - u.y * k - u.x * k * 0.5 }], st(SALE));
    }
    default: return base + (["madia", "mobile_tv", "cassettiera", "comodino"].includes(a.cosa) ? linea({ x: -L / 2 + 3, y: P / 2 - 4 }, { x: L / 2 - 3, y: P / 2 - 4 }, D) : "");
  }
}

function apertura(o: Apertura, C: Colori) {
  const g = o.aggancio!, t = g.spessore / 2, w = o.larga;
  const q = (s: number, k: number) => ({ x: g.p.x + g.u.x * s + g.n.x * k, y: g.p.y + g.u.y * s + g.n.y * k });
  const L1 = st("none", C.linea, 1), out: string[] = [];
  if (o.cosa === "finestra" || o.cosa === "portafinestra") {
    out.push(poli([q(-w / 2, -t), q(w / 2, -t), q(w / 2, t), q(-w / 2, t)], st(C.fondo, C.linea, 0.8)));
    for (const k of o.cosa === "finestra" ? [-t / 3, t / 3] : [-t / 3, 0, t / 3]) out.push(linea(q(-w / 2, k), q(w / 2, k), L1));
  } else if (o.cosa === "varco") {
    for (const k of [-t, t]) out.push(linea(q(-w / 2, k), q(w / 2, k), st("none", C.tenue, 0.8, ";stroke-dasharray:4 4")));
  } else if (o.scorrevole) {
    out.push(poli([q(-w / 2, -2.5), q(w * 0.05, -2.5), q(w * 0.05, 0.5), q(-w / 2, 0.5)], st(C.fondo, C.linea, 1)) + poli([q(-w * 0.05, -0.5), q(w / 2, -0.5), q(w / 2, 2.5), q(-w * 0.05, 2.5)], st(C.fondo, C.linea, 1)));
  } else {
    const k = g.lato * t, h = o.cardine === "sx" ? -w / 2 : w / 2, altro = -h;
    const H = q(h, k), fine = { x: H.x + g.n.x * g.lato * w, y: H.y + g.n.y * g.lato * w }, B = q(altro, k);
    const v1 = { x: fine.x - H.x, y: fine.y - H.y }, v2 = { x: B.x - H.x, y: B.y - H.y }, sweep = v1.x * v2.y - v1.y * v2.x > 0 ? 1 : 0;
    out.push(`<path d="M${P2(fine)} A${w} ${w} 0 0 ${sweep} ${P2(B)}" style="${st("none", C.tenue, 0.8, ";stroke-dasharray:3 3")}"/>`, linea(H, fine, st("none", C.linea, 2.4)));
  }
  return out.join("");
}

function etichetteStanze(M: Modello, o: OpzPianta, C: Colori, out: Etichetta[]) {
  for (const e of M.el) {
    if (e.piano !== o.piano) continue;
    if ((e.tipo === "stanza" || (e.tipo === "area" && e.nome)) && o.nomi !== false) {
      const c = e.tipo === "stanza" ? e.centro : { x: e.punti.reduce((s, p) => s + p.x, 0) / e.punti.length, y: e.punti.reduce((s, p) => s + p.y, 0) / e.punti.length };
      out.push({ x: c.x, y: c.y, dy: -0.45, testo: e.nome, dim: 20, ruota: 0, colore: C.testo, peso: 600 });
      if (e.tipo === "stanza") out.push({ x: c.x, y: c.y, dy: 0.95, testo: `${e.area.toFixed(1).replace(".", ",")} m²`, dim: 14, ruota: 0, colore: C.tenue, peso: 400 });
    }
    if (e.tipo === "stanza" && o.quote) for (const [a, b] of lati(e.punti)) {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 50) continue;
      let n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!dentro({ x: mid.x + n.x * 5, y: mid.y + n.y * 5 }, e.punti)) n = { x: -n.x, y: -n.y };
      let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
      out.push({ x: mid.x + n.x * 13, y: mid.y + n.y * 13, testo: String(Math.round(L)), dim: 12, ruota: ang, colore: C.quota, peso: 600 });
    }
    if (e.tipo === "misura") {
      const [a, b] = e.punti, L = Math.hypot(b.x - a.x, b.y - a.y);
      let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
      const n = { x: -(b.y - a.y) / (L || 1), y: (b.x - a.x) / (L || 1) };
      out.push({ x: (a.x + b.x) / 2 - n.x * 12, y: (a.y + b.y) / 2 - n.y * 12, testo: String(Math.round(L)), dim: 14, ruota: ang, colore: C.quota, peso: 600 });
    }
  }
}

export function disegnaPianta(M: Modello, o: OpzPianta) {
  const C = o.colori ?? CSS, sv: string[] = [], et: Etichetta[] = [];
  const P = M.piani.find(p => p.id === o.piano), qui = M.el.filter(e => e.piano === o.piano);
  const g = (r: number, s: string, cls = "") => `<g data-r="${r}"${cls ? ` class="${cls}"` : ""}>${s}</g>`;

  if (o.sotto !== false && P) {                          // il piano di sotto, in trasparenza, per allineare i muri
    const giu = M.piani.filter(p => p.quota < P.quota).sort((a, b) => b.quota - a.quota)[0];
    if (giu) for (const m of M.el) if (m.tipo === "muro" && m.piano === giu.id)
      for (const pz of pezziMuro(M, m, false)) sv.push(poli(pz.pts, st(C.sotto)));
  }
  for (const e of qui) if (e.tipo === "area") sv.push(g(e.riga, poli(e.punti, st(hex(e.colore, 0.45))), "area"));
  for (const e of qui) if (e.tipo === "stanza") sv.push(g(e.riga, poli(e.punti, st(hex(e.colore, 0.62), C.bordo, 0.6)), "stanza"));
  for (const e of qui) if (e.tipo === "foro") sv.push(g(e.riga, poli(e.punti, st(C.fondo, C.tenue, 1, ";stroke-dasharray:6 4")), "foro"));
  if (o.passaggi) {
    const { x0, y0, cella, W, H, raggiunto } = o.passaggi;
    let d = "";
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!raggiunto[y * W + x]) continue;
      let k = x;
      while (k < W && raggiunto[y * W + k]) k++;
      d += `M${x0 + x * cella} ${y0 + y * cella}h${(k - x) * cella}v${cella}h${-(k - x) * cella}z`;
      x = k;
    }
    sv.push(`<path d="${d}" style="fill:rgba(47,158,68,0.2)"/>`);
  }
  for (const s of M.el) if (s.tipo === "arredo" && s.cosa === "scala" && s.piano !== o.piano && P &&
    Math.abs((M.piani.find(p => p.id === s.piano)?.quota ?? 0) + s.H - P.quota) < 40)    // il vuoto della scala che sale fin qui
    sv.push(poli(sagoma(s), st(C.fondo, C.tenue, 1, ";stroke-dasharray:6 4")) + (s.scala ? `<g transform="translate(${r1(s.a.x)} ${r1(s.a.y)}) rotate(${s.ruota})">${s.scala.gradini.map(d => poli(d.poli, st("none", C.tenue, 0.6))).join("")}</g>` : ""));
  for (const e of qui) if (e.tipo === "arredo")
    sv.push(g(e.riga, `<g transform="translate(${r1(e.a.x)} ${r1(e.a.y)}) rotate(${e.ruota})">${simbolo(e, C, M)}</g>`, "arredo"));
  for (const e of qui) if (e.tipo === "muro")
    sv.push(g(e.riga, pezziMuro(M, e).map(pz => poli(pz.pts, st(e.altezza < 150 ? hex(e.colore, 0.1) : C.muro, e.altezza < 150 ? C.muro : "none", e.altezza < 150 ? 1 : 0))).join(""), "muro"));
  for (const e of qui) if (e.tipo === "apertura" && e.aggancio) sv.push(g(e.riga, apertura(e, C), "apertura"));
  for (const e of qui) if (e.tipo === "misura") {
    const [a, b] = e.punti, L = Math.hypot(b.x - a.x, b.y - a.y) || 1, n = { x: (-(b.y - a.y) / L) * 6, y: ((b.x - a.x) / L) * 6 };
    const S = st("none", C.quota, 1);
    sv.push(g(e.riga, linea(a, b, S) + linea({ x: a.x - n.x, y: a.y - n.y }, { x: a.x + n.x, y: a.y + n.y }, S) + linea({ x: b.x - n.x, y: b.y - n.y }, { x: b.x + n.x, y: b.y + n.y }, S), "misura"));
  }
  for (const e of qui) if (e.tipo === "tetto") {
    const [a, b] = e.punti, s = e.sporto, D = st("none", C.tenue, 1, ";stroke-dasharray:10 6");
    sv.push(g(e.riga, rect(a.x - s, a.y - s, b.x - a.x + 2 * s, b.y - a.y + 2 * s, D) + (e.falde === 2 ? (e.colmo === "x"
      ? linea({ x: a.x - s, y: (a.y + b.y) / 2 }, { x: b.x + s, y: (a.y + b.y) / 2 }, D) : linea({ x: (a.x + b.x) / 2, y: a.y - s }, { x: (a.x + b.x) / 2, y: b.y + s }, D)) : ""), "tetto"));
  }
  etichetteStanze(M, o, C, et);
  if (o.passaggi) for (const p of o.passaggi.problemi) {
    const R = st("none", "#D9480F", 3);
    sv.push(cerchio(p.p.x, p.p.y, 18, st("rgba(217,72,15,0.15)", "#D9480F", 2.5)) + linea({ x: p.p.x - 9, y: p.p.y - 9 }, { x: p.p.x + 9, y: p.p.y + 9 }, R) + linea({ x: p.p.x + 9, y: p.p.y - 9 }, { x: p.p.x - 9, y: p.p.y + 9 }, R));
  }
  if (o.testo !== false) for (const t of et)
    sv.push(`<text x="${r1(t.x)}" y="${r1(t.y + (t.dy ?? 0) * t.dim)}" font-size="${t.dim}" text-anchor="middle" dominant-baseline="central" style="fill:${t.colore};font-weight:${t.peso};paint-order:stroke;stroke:${C.fondo};stroke-width:${t.dim / 5}px;stroke-linejoin:round"${t.ruota ? ` transform="rotate(${r1(t.ruota)} ${r1(t.x)} ${r1(t.y)})"` : ""}>${esc(t.testo)}</text>`);
  return { svg: sv.join(""), etichette: et };
}

/** Il simbolo di un arredo del catalogo con le misure di serie, per le anteprime: markup e viewBox. */
export function anteprima(cosa: string, colori: Colori = CSS) {
  const v = CATALOGO[cosa];
  const a: Arredo = { tipo: "arredo", riga: 0, piano: "", cosa, nome: "", a: { x: 0, y: 0 }, L: v.L, P: v.P, H: v.H || 300, ruota: 0, colore: v.colore, quota: 0 };
  const m = Math.max(v.L, v.P) * 0.08;
  return { svg: simbolo(a, colori, { modelli: {} } as unknown as Modello), box: `${-v.L / 2 - m} ${-v.P / 2 - m} ${v.L + 2 * m} ${v.P + 2 * m}` };
}

/** Il contorno da evidenziare per un elemento (selezione, modifiche di Claude). */
export function contorno(M: Modello, riga: number): Pt[][] {
  const e = M.el.find(x => x.riga === riga);
  if (!e) return [];
  switch (e.tipo) {
    case "stanza": case "area": return [e.punti];
    case "muro": return pezziMuro(M, e, false).map(p => p.pts);
    case "arredo": return [sagoma(e)];
    case "apertura": {
      const g = e.aggancio;
      if (!g) return [[{ x: e.a.x - 20, y: e.a.y - 20 }, { x: e.a.x + 20, y: e.a.y - 20 }, { x: e.a.x + 20, y: e.a.y + 20 }, { x: e.a.x - 20, y: e.a.y + 20 }]];
      const q = (s: number, k: number) => ({ x: g.p.x + g.u.x * s + g.n.x * k, y: g.p.y + g.u.y * s + g.n.y * k }), t = g.spessore / 2 + 6;
      return [[q(-e.larga / 2, -t), q(e.larga / 2, -t), q(e.larga / 2, t), q(-e.larga / 2, t)]];
    }
    case "tetto": { const [a, b] = e.punti; return [[a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]]; }
    case "misura": case "foro": return [e.punti];
  }
}
