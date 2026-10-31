// Superfici e verifiche igienico-sanitarie (DM 5 luglio 1975) stanza per stanza: superficie, finestre che le danno luce,
// rapporto aeroilluminante (almeno 1/8 del pavimento nei locali abitabili), superficie minima e altezza minima.
// L'uso della stanza si capisce dal nome. Le finestre contano per la loro luce (larghezza x altezza del serramento).
import { dentro, distSeg, lati, segmenti, type Modello, type Muro, type Stanza } from "./lingua.ts";

export type Uso = "camera" | "doppia" | "soggiorno" | "cucina" | "studio" | "bagno" | "servizio";
export type Voce = { s: Stanza; uso: Uso; area: number; finestre: number; altezza: number; variabile: boolean; avvisi: string[] };
export type Riepilogo = { piani: { id: string; nome: string; utile: number; stanze: Voce[] }[]; utile: number; pavimenti: [string, number][]; avvisi: number };

const USI: [RegExp, Uso][] = [
  [/matrimonial|doppia|padronale|ragazzi|bambini|figli/i, "doppia"], [/camer|letto/i, "camera"], [/soggiorno|salotto|living|sala|pranzo/i, "soggiorno"],
  [/cucin|cottura/i, "cucina"], [/studio|ufficio/i, "studio"], [/bagno|wc|servizi|doccia/i, "bagno"],
];
export const NOMI_USO: Record<Uso, string> = { camera: "camera singola", doppia: "camera doppia", soggiorno: "soggiorno", cucina: "cucina", studio: "studio", bagno: "bagno", servizio: "locale di servizio" };
const MINIMO: Partial<Record<Uso, number>> = { camera: 9, doppia: 14, soggiorno: 14 };
const abitabile = (u: Uso) => u !== "bagno" && u !== "servizio";
const m2 = (v: number) => v.toFixed(1).replace(".", ",");

export function uso(nome: string): Uso { return USI.find(([re]) => re.test(nome))?.[1] ?? "servizio"; }

export function riepilogo(M: Modello): Riepilogo {
  const pav = new Map<string, number>();
  let avvisi = 0;
  const piani = M.piani.map(P => {
    const stanze = M.el.filter((e): e is Stanza => e.tipo === "stanza" && e.piano === P.id);
    const tocca = (m: Muro) => segmenti(m).some(([a, b]) => stanze.some(s => dentro(a, s.punti) || lati(s.punti).some(([c, d]) => distSeg(c, a, b) <= m.spessore / 2 + 10 || distSeg(d, a, b) <= m.spessore / 2 + 10)));
    const variabile = M.el.some(m => m.tipo === "muro" && m.piano === P.id && m.fino !== m.altezza && tocca(m));   // sottotetto: muri sotto la falda intorno alle stanze
    const luce = new Map<Stanza, number>();
    for (const o of M.el) {
      if (o.tipo !== "apertura" || o.piano !== P.id || !o.aggancio || (o.cosa !== "finestra" && o.cosa !== "portafinestra")) continue;
      const g = o.aggancio, k = g.spessore / 2 + 25;
      for (const s of [1, -1]) {                              // la stanza da cui si vede
        const q = { x: g.p.x + g.n.x * s * k, y: g.p.y + g.n.y * s * k }, st = stanze.find(x => dentro(q, x.punti));
        if (st) luce.set(st, (luce.get(st) ?? 0) + (o.larga * o.alta) / 1e4);
      }
    }
    const voci = stanze.map(s => {
      const u = uso(s.nome), f = luce.get(s) ?? 0, a: string[] = [], min = MINIMO[u];
      if (min && s.area < min) a.push(`${m2(s.area)} m²: per una ${NOMI_USO[u]} ne servono almeno ${min}`);
      if (abitabile(u) && f < s.area / 8) a.push(f ? `finestre ${m2(f)} m²: per la luce ne servono ${m2(s.area / 8)} (1/8 del pavimento)` : `nessuna finestra: ne servono ${m2(s.area / 8)} m² (1/8 del pavimento)`);
      if (!variabile && P.altezza < (abitabile(u) ? 270 : 240)) a.push(`alta ${P.altezza} cm: ${abitabile(u) ? "nei locali abitabili" : "qui"} servono almeno ${abitabile(u) ? 270 : 240} cm`);
      if (u === "bagno" && !f) a.push("senza finestra: serve un aspiratore");
      pav.set(s.colore, (pav.get(s.colore) ?? 0) + s.area);
      avvisi += a.length;
      return { s, uso: u, area: s.area, finestre: Math.round(f * 100) / 100, altezza: P.altezza, variabile, avvisi: a };
    });
    return { id: P.id, nome: P.nome, utile: Math.round(voci.reduce((t, v) => t + v.area, 0) * 10) / 10, stanze: voci };
  });
  return { piani, utile: Math.round(piani.reduce((t, p) => t + p.utile, 0) * 10) / 10, pavimenti: [...pav].map(([c, a]) => [c, Math.round(a * 10) / 10] as [string, number]).sort((x, y) => y[1] - x[1]), avvisi };
}
