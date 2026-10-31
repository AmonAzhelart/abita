// La casa tagliata in piedi lungo una linea della pianta, guardata con A a sinistra e B a destra: solai (tolti i buchi),
// muri con porte e finestre, scale, arredi, tetti, i modelli importati tagliati triangolo per triangolo, e l'altezza libera
// in mezzo a ogni stanza e nel punto più basso di ogni scala. s: cm lungo la linea da A; z: cm da terra.
import { altezzaLibera, sottoTetto } from "./altezza.ts";
import { bucoScala, lati, sagoma, segmenti, vani, locale, type Modello, type Piano, type Pt } from "./lingua.ts";
import type { Triangoli } from "./passaggi.ts";

type Tratto = [number, number];
type V = [number, number];                                       // s, z
export type Pezzo = { cosa: "solaio" | "muro" | "vetro" | "scala" | "arredo" | "tetto"; p: V[] };
export type Quota = { s: number; z0: number; z1: number; libera: number; scala: boolean };
export type Sezione = {
  L: number; pezzi: Pezzo[]; /** segmenti dei modelli tagliati: s0, z0, s1, z1, ... */ tagli: number[];
  piani: { nome: string; z: number }[]; nomi: { s: number; z: number; testo: string }[]; quote: Quota[]; z0: number; z1: number;
};

const SCALA = /^scala\b|stair/i;
const rett = (cosa: Pezzo["cosa"], s0: number, s1: number, z0: number, z1: number): Pezzo => ({ cosa, p: [[s0, z0], [s1, z0], [s1, z1], [s0, z1]] });
const unisci = (t: Tratto[]) => t.slice().sort((a, b) => a[0] - b[0]).reduce<Tratto[]>((o, [a, b]) => {
  const l = o[o.length - 1];
  if (l && a <= l[1] + 0.5) l[1] = Math.max(l[1], b); else o.push([a, b]);
  return o;
}, []);
const togli = (t: Tratto[], via: Tratto[]) => t.flatMap(([a, b]) => {
  const out: Tratto[] = [];
  let c = a;
  for (const [x, y] of unisci(via)) { if (y <= c || x >= b) continue; if (x > c) out.push([c, x]); c = Math.max(c, y); }
  if (b - c > 0.5) out.push([c, b]);
  return out.filter(([x, y]) => y - x > 0.5);
});

export function sezione(M: Modello, A: Pt, B: Pt, mesh: Triangoli = {}): Sezione {
  const L = Math.hypot(B.x - A.x, B.y - A.y) || 1, u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
  const lato = (q: Pt) => u.x * (q.y - A.y) - u.y * (q.x - A.x);     // da che parte della linea, in cm
  const lungo = (q: Pt) => (q.x - A.x) * u.x + (q.y - A.y) * u.y;
  const punto = (s: number): Pt => ({ x: A.x + u.x * s, y: A.y + u.y * s });
  /** I tratti della linea dentro un poligono (anche concavo), tra 0 e L. */
  const dentroA = (poly: Pt[]): Tratto[] => {
    const ss: number[] = [];
    for (const [p, q] of lati(poly)) {
      const a = lato(p), b = lato(q);
      if ((a > 0) === (b > 0)) continue;
      const t = a / (a - b);
      ss.push(lungo({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }));
    }
    ss.sort((x, y) => x - y);
    const out: Tratto[] = [];
    for (let i = 0; i + 1 < ss.length; i += 2) { const s0 = Math.max(0, ss[i]), s1 = Math.min(L, ss[i + 1]); if (s1 - s0 > 0.5) out.push([s0, s1]); }
    return out;
  };
  /** L'altezza libera in s su quel piano, se lì si sta in piedi (non sopra un mobile, non in un buco). */
  const alto = (P: Piano, s: number) => {
    const r = altezzaLibera(M, P.id, punto(s), mesh);
    return r.libera === null || r.cima === null || r.sotto.startsWith("sopra ") ? null : { s, z0: P.quota + r.base, z1: P.quota + r.cima, libera: r.libera };
  };
  const pezzi: Pezzo[] = [], tagli: number[] = [], nomi: Sezione["nomi"] = [], quote: Quota[] = [];
  const piuBasso = (q: Quota | null, n: ReturnType<typeof alto>) => (n && (!q || n.libera < q.libera) ? { ...n, scala: true } : q);

  for (const P of M.piani) {
    const el = M.el.filter(e => e.piano === P.id), giu = P.quota - P.solaio;
    const pav = unisci(el.flatMap(e => (e.tipo === "stanza" || e.tipo === "area" ? dentroA(e.punti) : [])));
    const buchi = M.el.flatMap(e => { const h = e.tipo === "foro" ? (e.piano === P.id ? e.punti : null) : bucoScala(M, e, P.id); return h ? dentroA(h) : []; });
    for (const [s0, s1] of togli(pav, buchi)) pezzi.push(rett("solaio", s0, s1, giu, P.quota));

    for (const e of el) if (e.tipo === "stanza") {
      const t = dentroA(e.punti).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
      if (!t) continue;
      const s = (t[0] + t[1]) / 2, q = alto(P, s);
      nomi.push({ s, z: P.quota, testo: e.nome });
      if (q) quote.push({ ...q, scala: false });
    }

    for (const m of el) {
      if (m.tipo !== "muro") continue;
      const segs = segmenti(m), lun = segs.map(([a, c]) => Math.hypot(c.x - a.x, c.y - a.y)), tot = lun.reduce((x, y) => x + y, 0) || 1;
      let da = 0;
      segs.forEach(([a, c], i) => {
        const Ls = lun[i], d0 = da;
        da += Ls;
        if (Ls < 1) return;
        const w = { x: (c.x - a.x) / Ls, y: (c.y - a.y) / Ls }, t = m.spessore / 2, n = { x: -w.y * t, y: w.x * t };
        const a0 = { x: a.x - w.x * t, y: a.y - w.y * t }, c0 = { x: c.x + w.x * t, y: c.y + w.y * t };
        const nastro = [{ x: a0.x + n.x, y: a0.y + n.y }, { x: c0.x + n.x, y: c0.y + n.y }, { x: c0.x - n.x, y: c0.y - n.y }, { x: a0.x - n.x, y: a0.y - n.y }];
        const sw = (s: number) => { const q = punto(s); return (q.x - a.x) * w.x + (q.y - a.y) * w.y; };   // dove cade lungo il muro
        const h = (s: number) => P.quota + m.altezza + (m.fino - m.altezza) * Math.min(1, Math.max(0, (d0 + sw(s)) / tot));
        const vv = vani(M, P.id, a, c, m.spessore), k = u.x * w.x + u.y * w.y, sw0 = sw(0);
        for (const [s0, s1] of dentroA(nastro)) {
          // se la linea corre dentro il muro passa anche da porte e finestre: lo divido dove cominciano e finiscono
          const cuts = [s0, s1, ...(Math.abs(k) > 1e-6 ? vv.flatMap(v => [(v.s0 - sw0) / k, (v.s1 - sw0) / k]) : [])].filter(x => x >= s0 && x <= s1).sort((x, y) => x - y);
          for (let j = 0; j + 1 < cuts.length; j++) {
            const x0 = cuts[j], x1 = cuts[j + 1], mid = sw((x0 + x1) / 2);
            if (x1 - x0 < 0.5) continue;
            const o = vv.find(v => v.s0 <= mid && mid <= v.s1)?.o;
            if (!o) { pezzi.push({ cosa: "muro", p: [[x0, giu], [x1, giu], [x1, h(x1)], [x0, h(x0)]] }); continue; }
            const z = P.quota + o.davanzale + o.alta;
            pezzi.push(rett("muro", x0, x1, giu, P.quota + o.davanzale));
            if (o.cosa === "finestra" || o.cosa === "portafinestra") pezzi.push(rett("vetro", x0, x1, P.quota + o.davanzale, z));
            if (Math.max(h(x0), h(x1)) > z + 0.5) pezzi.push({ cosa: "muro", p: [[x0, z], [x1, z], [x1, Math.max(z, h(x1))], [x0, Math.max(z, h(x0))]] });
          }
        }
      });
    }

    for (const a of el) {
      if (a.tipo !== "arredo") continue;
      const z0 = P.quota + a.quota;
      if (a.scala) {                                             // pieni fino a terra (o fino alla soletta) come in 3D; la chiocciola ha solo le pedate
        const elica = a.scala.forma === "chiocciola";
        let min: Quota | null = null;
        for (const g of a.scala.gradini) for (const [s0, s1] of dentroA(g.poli.map(q => locale(a, q.x, q.y)))) {
          pezzi.push(rett("scala", s0, s1, elica ? z0 + g.z - 5 : z0 + (g.sotto ?? 0), z0 + g.z));
          min = piuBasso(min, alto(P, (s0 + s1) / 2));
        }
        if (min) quote.push(min);
      } else if (a.cosa === "modello") {
        const c = Math.cos((a.ruota * Math.PI) / 180), sn = Math.sin((a.ruota * Math.PI) / 180);
        for (const v of Object.values(mesh[a.nome] ?? {})) for (let t = 0; t + 8 < v.length; t += 9) {
          const g = [0, 3, 6].map(o => { const q = { x: a.a.x + v[t + o] * c - v[t + o + 1] * sn, y: a.a.y + v[t + o] * sn + v[t + o + 1] * c }; return { q, z: z0 + v[t + o + 2], d: lato(q) }; });
          const x: V[] = [];
          for (let i = 0; i < 3; i++) {
            const p = g[i], q = g[(i + 1) % 3];
            if ((p.d > 0) === (q.d > 0)) continue;
            const f = p.d / (p.d - q.d);
            x.push([lungo({ x: p.q.x + (q.q.x - p.q.x) * f, y: p.q.y + (q.q.y - p.q.y) * f }), p.z + (q.z - p.z) * f]);
          }
          if (x.length !== 2) continue;
          let [[sa, za], [sb, zb]] = x[0][0] <= x[1][0] ? x : [x[1], x[0]];
          if (sb < 0 || sa > L) continue;
          const zs = (s: number) => (sb - sa < 1e-6 ? za : za + ((zb - za) * (s - sa)) / (sb - sa));
          if (sa < 0) { za = zs(0); sa = 0; }
          if (sb > L) { zb = zs(L); sb = L; }
          tagli.push(sa, za, sb, zb);
        }
        if (SCALA.test(a.nome) && mesh[a.nome]) {                // una scala importata: l'altezza libera ogni 15 cm
          let min: Quota | null = null;
          for (const [s0, s1] of dentroA(sagoma(a))) for (let s = s0 + 5; s < s1; s += 15) min = piuBasso(min, alto(P, s));
          if (min) quote.push(min);
        }
      } else for (const [s0, s1] of dentroA(sagoma(a))) pezzi.push(rett("arredo", s0, s1, z0, z0 + a.H));
    }

    for (const t of el) if (t.tipo === "tetto") {                // il sotto del tetto, a passi; sopra lo spessore
      const base = P.quota + P.altezza, passo = Math.max(4, L / 200), sp = t.falde ? 20 : t.altezza;
      let run: V[] = [];
      const chiudi = () => { if (run.length > 1) pezzi.push({ cosa: "tetto", p: [...run, ...run.slice().reverse().map(([s, z]): V => [s, z + sp])] }); run = []; };
      for (let s = 0; s < L + passo; s += passo) {
        const x = Math.min(s, L), z = sottoTetto(t, base, punto(x));
        if (z === null) chiudi(); else run.push([x, z]);
      }
      chiudi();
    }
  }

  const zz = [...pezzi.flatMap(p => p.p.map(v => v[1])), ...tagli.filter((_, i) => i % 2), ...M.piani.flatMap(P => [P.quota - P.solaio, P.quota + P.altezza])];
  return {
    L, pezzi, tagli, nomi, quote, piani: M.piani.map(P => ({ nome: P.nome, z: P.quota })),
    z0: Math.min(...zz), z1: Math.max(...zz),
  };
}
