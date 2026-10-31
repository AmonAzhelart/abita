// Ancoraggio ai muri: trascinando un arredo vicino a un muro, si appoggia alla sua faccia.
// Divani, armadi, letti (accesso "fronte" o "lati") ci mettono il retro e si girano verso la stanza;
// gli altri ci scivolano contro senza girarsi. Vicino a un angolo si appoggiano anche al muro di fianco.
import { CATALOGO } from "./arredi.ts";
import { segmenti, type Arredo, type Modello, type Pt } from "./lingua.ts";

type Faccia = { p: Pt; u: Pt; n: Pt; L: number };     // n: esce dal muro, verso la stanza da quel lato
export type Ancora = { c: Pt; ruota: number; facce: [Pt, Pt][] };

const r1 = (v: number) => Math.round(v * 10) / 10;
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

function facce(M: Modello, piano: string): Faccia[] {
  return M.el.flatMap(m => m.tipo !== "muro" || m.piano !== piano ? [] : segmenti(m).flatMap(([a, b]) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) return [];
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, h = m.spessore / 2;
    return [1, -1].map(s => { const n = { x: -u.y * s, y: u.x * s }; return { p: { x: a.x + n.x * h, y: a.y + n.y * h }, u, n, L }; });
  }));
}

/** Mezza misura dell'arredo lungo la direzione n, girato di `ruota` gradi. */
function mezzo(a: Arredo, ruota: number, n: Pt) {
  const g = (ruota * Math.PI) / 180, w = { x: Math.cos(g), y: Math.sin(g) }, d = { x: -Math.sin(g), y: Math.cos(g) };
  return (a.L / 2) * Math.abs(dot(w, n)) + (a.P / 2) * Math.abs(dot(d, n));
}

/** Dove va l'arredo se lo lasci con il centro in c. soglia: quanto vicino (cm) deve arrivare al muro per agganciarsi. */
export function ancora(M: Modello, a: Arredo, c: Pt, soglia = 25): Ancora {
  const tutte = facce(M, a.piano), gira = ["fronte", "lati"].includes(CATALOGO[a.cosa]?.accesso ?? "");
  let ruota = a.ruota, centro = c;
  const fatte: Faccia[] = [];
  for (let giro = 0; giro < 2; giro++) {                       // prima il muro dietro, poi quello di fianco
    let best: { f: Faccia; sposta: number; ruota: number } | null = null;
    for (const f of tutte) {
      if (fatte.some(g => Math.abs(dot(g.n, f.n)) > 0.1)) continue;          // il secondo muro deve stare di traverso
      const q = { x: centro.x - f.p.x, y: centro.y - f.p.y }, d = dot(q, f.n), t = dot(q, f.u);
      if (t < -20 || t > f.L + 20 || d < -soglia) continue;
      const r = gira && !giro ? (((Math.atan2(-f.n.x, f.n.y) * 180) / Math.PI) + 360) % 360 : ruota;   // retro verso il muro
      const sposta = mezzo(a, r, f.n) - d;
      if (Math.abs(sposta) < soglia && (!best || Math.abs(sposta) < Math.abs(best.sposta))) best = { f, sposta, ruota: r };
    }
    if (!best) break;
    centro = { x: centro.x + best.f.n.x * best.sposta, y: centro.y + best.f.n.y * best.sposta };
    ruota = r1(best.ruota) % 360;
    fatte.push(best.f);
  }
  return { c: { x: r1(centro.x), y: r1(centro.y) }, ruota, facce: fatte.map(f => [f.p, { x: f.p.x + f.u.x * f.L, y: f.p.y + f.u.y * f.L }]) };
}
