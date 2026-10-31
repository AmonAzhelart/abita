// Le scale: dalle poche scelte di chi progetta (forma, larghezza, alzata, pedata, svolta) ai gradini veri.
// Coordinate locali come gli arredi: x lungo la larghezza, y in profondità; si parte dal fronte (+y) e si sale verso il retro (-y).
// Centimetri, origine al centro dell'ingombro. z di un gradino = altezza della sua pedata dal piede della scala.
import type { Pt } from "./lingua.ts";

export type Forma = "dritta" | "l" | "u" | "chiocciola";
export type Gradino = { poli: Pt[]; z: number; tipo: "gradino" | "pianerottolo" | "ventaglio"; sotto?: number };   // sotto: dove finisce la soletta (di serie piena fino a terra)
export type Scala = {
  forma: Forma; giro: "sx" | "dx"; larga: number; alzate: number; alzata: number; pedata: number;
  seconda?: number;               // a L e a U: la seconda rampa, se è larga diversa dalla prima
  soletta?: boolean;              // una soletta a gradoni: sotto resta il vuoto
  rampe: number[];                // alzate di ogni rampa, nell'ordine in cui si sale
  prima: number;                  // pedate prima della svolta (o del pianerottolo), -1 se non c'è
  pozzo?: number;                 // a U: il vuoto tra le due rampe
  passo?: number;                 // pedata sulla linea di passo, dove la scala gira a ventaglio (o della chiocciola)
  gradini: Gradino[]; sagoma: Pt[]; percorso: Pt[]; L: number; P: number; avvisi: string[];
};
/** forma e giro come scritti nel testo; L, P: le misure "LxP" della riga (larghezza e lunghezza per la dritta, diametro per la chiocciola). */
export type Scelte = { forma?: string; giro?: string; larga?: number; seconda?: number; alzata?: number; pedata?: number; prima?: number; pozzo?: number; ventaglio?: boolean; pianerottolo?: boolean; soletta?: boolean; L?: number; P?: number; H: number };

export const FORME: Record<Forma, string> = { dritta: "dritta", l: "a L", u: "a U", chiocciola: "a chiocciola" };
const PALO = 7;                                            // raggio del palo della chiocciola
const SOLETTA = 20;                                        // spessore della soletta sotto i gradini e il pianerottolo
const r1 = (v: number) => Math.round(v * 10) / 10;
const rett = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const tra = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const cm = (v: number) => String(r1(v)).replace(".", ",");

/** I gradini a ventaglio: la parte del rettangolo R tra i raggi da C (angoli da t0 a t1, crescenti) in k spicchi uguali. */
function ventaglio(R: Pt[], C: Pt, t0: number, t1: number, k: number): Pt[][] {
  const xs = R.map(p => p.x), ys = R.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const esce = (t: number): Pt => {                        // dove il raggio esce dal rettangolo
    const dx = Math.cos(t), dy = Math.sin(t);
    let s = Infinity;
    if (dx > 1e-9) s = Math.min(s, (x1 - C.x) / dx); else if (dx < -1e-9) s = Math.min(s, (x0 - C.x) / dx);
    if (dy > 1e-9) s = Math.min(s, (y1 - C.y) / dy); else if (dy < -1e-9) s = Math.min(s, (y0 - C.y) / dy);
    return { x: C.x + dx * s, y: C.y + dy * s };
  };
  const spigoli = R.filter(p => Math.hypot(p.x - C.x, p.y - C.y) > 0.5).map(p => {
    let t = Math.atan2(p.y - C.y, p.x - C.x);
    while (t < t0 - 1e-6) t += 2 * Math.PI;
    return { p, t };
  });
  return Array.from({ length: k }, (_, i) => {
    const a = t0 + ((t1 - t0) * i) / k, b = t0 + ((t1 - t0) * (i + 1)) / k;
    return [C, esce(a), ...spigoli.filter(s => s.t > a + 1e-6 && s.t < b - 1e-6).sort((p, q) => p.t - q.t).map(s => s.p), esce(b)];
  });
}

export function progettaScala(s: Scelte): Scala {
  let forma: Forma = s.forma === "l" || s.forma === "u" || s.forma === "chiocciola" ? s.forma : "dritta";
  const giro = s.giro === "sx" ? "sx" : "dx", H = Math.max(20, s.H), elica = forma === "chiocciola";
  const alzate = Math.max(2, Math.round(H / (s.alzata && s.alzata >= 8 ? s.alzata : elica ? 20 : 17.5))), a = H / alzate;
  const T = alzate - 1;                                    // pedate: l'ultima alzata arriva sul pavimento di sopra
  const z = (i: number) => r1((i + 1) * a);
  const blondel = r1(tra(63 - 2 * a, elica ? 20 : 24, 32));
  const G: Gradino[] = [], avvisi: string[] = [];
  let larga = s.larga ?? s.L ?? 100, pedata = s.pedata ?? blondel, rampe = [alzate], passo: number | undefined, w2 = larga;
  let sagoma: Pt[], percorso: Pt[];
  const wm = (larga + (s.seconda ?? larga)) / 2;            // la larghezza media, per i ventagli
  const kw = forma === "l" ? (s.ventaglio ? Math.max(3, Math.round((Math.PI * wm) / 4 / pedata)) : 1)
    : forma === "u" ? (s.ventaglio ? Math.max(5, Math.round((Math.PI * ((s.pozzo ?? 10) + wm)) / 2 / pedata)) : 1) : 0;
  if (kw && T - kw < 0) forma = "dritta";                   // troppo bassa per girare

  if (forma === "chiocciola") {
    const D = s.L ?? (s.larga ? 2 * (s.larga + PALO) : 160), R = D / 2, rp = PALO + (R - PALO) * 0.6;
    larga = R - PALO;
    pedata = s.pedata ?? blondel;
    const al = tra(pedata / rp, (15 * Math.PI) / 180, (36 * Math.PI) / 180), dir = giro === "dx" ? 1 : -1, t0 = Math.PI / 2;
    passo = r1(al * rp);
    const P = (r: number, t: number) => ({ x: r1(r * Math.cos(t)), y: r1(r * Math.sin(t)) });
    for (let i = 0; i < T; i++) {
      const ta = t0 + dir * i * al, tb = t0 + dir * (i + 1) * al;
      G.push({ poli: [P(PALO, ta), ...[0, 1, 2, 3].map(j => P(R, ta + ((tb - ta) * j) / 3)), P(PALO, tb)], z: z(i), tipo: "gradino" });
    }
    sagoma = Array.from({ length: 32 }, (_, i) => P(R, (i / 32) * 2 * Math.PI));
    const np = Math.max(2, T * 2);
    percorso = Array.from({ length: np + 1 }, (_, i) => P(rp, t0 + (dir * T * al * i) / np));
    const giroAlto = ((2 * Math.PI) / al) * a;
    if (D < 140) avvisi.push(`diametro ${cm(D)} cm: stretta, almeno 140 cm`);
    if (giroAlto < 210) avvisi.push(`un giro sale ${Math.round(giroAlto)} cm: sotto i 210 si batte la testa`);
  } else {
    const w = larga, p = pedata;
    if (forma === "dritta") {
      const sosta = !!s.pianerottolo && T >= 3, tg = T - (sosta ? 1 : 0);
      if (s.pedata === undefined && s.P) pedata = r1(Math.max(10, (s.P - (sosta ? w : 0)) / tg));
      const k = sosta ? tra(s.prima ?? Math.ceil(tg / 2), 1, tg - 1) : tg;
      let y = 0, i = 0;
      for (let j = 0; j < tg; j++) {
        if (sosta && j === k) { G.push({ poli: rett(0, y - w, w, y), z: z(i++), tipo: "pianerottolo" }); y -= w; }
        G.push({ poli: rett(0, y - pedata, w, y), z: z(i++), tipo: "gradino" });
        y -= pedata;
      }
      if (sosta) rampe = [k + 1, tg - k + 1];
      sagoma = rett(0, y, w, 0);
      percorso = [{ x: w / 2, y: 0 }, { x: w / 2, y }];
    } else {
      const u = forma === "u", g = u ? (s.pozzo ?? 10) : 0, tg = T - kw, k = tra(s.prima ?? Math.ceil(tg / 2), 0, tg), m = tg - k, L1 = k * p;
      w2 = s.seconda ?? w;
      const D = u ? Math.max(w, w2) : w2, W = w + g + w2;   // la svolta: profonda quanto la rampa più larga; a U larga quanto tutte e due
      let i = 0;
      for (let j = 0; j < k; j++) G.push({ poli: rett(0, -(j + 1) * p, w, -j * p), z: z(i++), tipo: "gradino" });
      const svolta = rett(0, -L1 - D, u ? W : w, -L1);
      if (!s.ventaglio) G.push({ poli: svolta, z: z(i++), tipo: "pianerottolo" });
      else {
        for (const poli of ventaglio(svolta, { x: u ? w + g / 2 : w, y: -L1 }, Math.PI, u ? 2 * Math.PI : 1.5 * Math.PI, kw)) G.push({ poli, z: z(i++), tipo: "ventaglio" });
        passo = r1((u ? (Math.PI * (g + wm)) / 2 : (Math.PI * wm) / 4) / kw);
      }
      if (u) {
        for (let j = 0; j < m; j++) G.push({ poli: rett(w + g, -L1 + j * p, W, -L1 + (j + 1) * p), z: z(i++), tipo: "gradino" });
        sagoma = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: -L1 }, { x: w + g, y: -L1 }, { x: w + g, y: -L1 + m * p }, { x: W, y: -L1 + m * p }, { x: W, y: -L1 - D }, { x: 0, y: -L1 - D }];
        percorso = [{ x: w / 2, y: 0 }, { x: w / 2, y: -L1 - D / 2 }, { x: w + g + w2 / 2, y: -L1 - D / 2 }, { x: w + g + w2 / 2, y: -L1 + m * p }];
      } else {
        for (let j = 0; j < m; j++) G.push({ poli: rett(w + j * p, -L1 - D, w + (j + 1) * p, -L1), z: z(i++), tipo: "gradino" });
        sagoma = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: -L1 }, { x: w + m * p, y: -L1 }, { x: w + m * p, y: -L1 - D }, { x: 0, y: -L1 - D }];
        percorso = [{ x: w / 2, y: 0 }, { x: w / 2, y: -L1 - D / 2 }, { x: w + m * p, y: -L1 - D / 2 }];
      }
      if (!s.ventaglio) rampe = [k + 1, m + 1];
      if (giro === "sx") {                                  // a sinistra: lo specchio
        const sp = (q: Pt) => ({ x: -q.x, y: q.y });
        for (const d of G) d.poli = d.poli.map(sp).reverse();
        sagoma = sagoma.map(sp).reverse();
        percorso = percorso.map(sp);
      }
    }
    for (const v of new Set([larga, w2])) if (v < 80) avvisi.push(`larga ${cm(v)} cm: stretta, servono almeno 80 cm`);
    if (s.soletta) for (const d of G) d.sotto = r1(Math.max(0, d.z - (d.tipo === "pianerottolo" ? 0 : a) - SOLETTA));
    const lunga = rampe.find(r => r > 15);
    if (lunga) avvisi.push(`una rampa da ${lunga} alzate: oltre 15 meglio un pianerottolo`);
    if (passo !== undefined && passo < 22) avvisi.push(`ventaglio: sulla linea di passo la pedata è ${cm(passo)} cm, comoda da 25`);
  }

  // l'origine al centro dell'ingombro
  const tutti = [...sagoma, ...G.flatMap(d => d.poli)], xs = tutti.map(q => q.x), ys = tutti.map(q => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, sp = (q: Pt) => ({ x: r1(q.x - cx), y: r1(q.y - cy) });
  for (const d of G) d.poli = d.poli.map(sp);

  const pd = forma === "chiocciola" ? passo! : pedata, b = 2 * a + pd;
  if (a > (elica ? 21 : 18.5)) avvisi.unshift(`alzata ${cm(a)} cm: ripida, comoda tra 16 e 18`);
  else if (a < 15) avvisi.unshift(`alzata ${cm(a)} cm: bassa, comoda tra 16 e 18`);
  if (pd < (elica ? 20 : 25)) avvisi.push(`pedata ${cm(pd)} cm: corta, comoda da ${elica ? 22 : 25} in su`);
  if (!elica && (b < 60 || b > 66)) avvisi.push(`2 alzate + pedata = ${cm(b)} cm: fuori dalla regola di Blondel (62–64)`);
  return {
    forma, giro, larga: r1(larga), seconda: w2 !== larga ? r1(w2) : undefined, soletta: forma !== "chiocciola" && !!s.soletta, alzate, alzata: r1(a), pedata: r1(pedata), rampe, prima: G.findIndex(g => g.tipo !== "gradino"), pozzo: forma === "u" ? (s.pozzo ?? 10) : undefined, passo, gradini: G, sagoma: sagoma.map(sp), percorso: percorso.map(sp),
    L: r1(Math.max(...xs) - Math.min(...xs)), P: r1(Math.max(...ys) - Math.min(...ys)), avvisi,
  };
}

/** Una riga per chi legge: quante alzate, di quanto, e la regola di Blondel. */
export function descriviScala(sc: Scala) {
  const pd = sc.forma === "chiocciola" ? sc.passo! : sc.pedata;
  return `scala ${FORME[sc.forma]}${sc.forma !== "dritta" ? ` che gira a ${sc.giro === "dx" ? "destra" : "sinistra"}` : ""}: ${sc.alzate} alzate da ${cm(sc.alzata)} cm, pedata ${cm(pd)} cm`
    + (sc.rampe.length > 1 ? `, rampe da ${sc.rampe.join(" e ")}` : "") + `, larga ${cm(sc.larga)}${sc.seconda ? ` e ${cm(sc.seconda)}` : ""} cm${sc.soletta ? ", a soletta" : ""}, ingombro ${Math.round(sc.L)}×${Math.round(sc.P)} · 2a+p = ${cm(2 * sc.alzata + pd)}`;
}
