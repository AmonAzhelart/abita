// Si passa ovunque? Griglia da 5 cm: pavimento libero meno muri e arredi, poi conta solo dove c'è almeno
// 35 cm di spazio da ogni parte (passaggio da 70) e si parte dagli ingressi (o dall'arrivo della scala).
import { CATALOGO } from "./arredi.ts";
import { angoli, dentro, etichetta, locale, segmenti, vani, type Apertura, type Arredo, type Modello, type Pt } from "./lingua.ts";

export type Problema = { msg: string; riga: number; p: Pt };
export type Esito = { problemi: Problema[]; x0: number; y0: number; cella: number; W: number; H: number; raggiunto: Uint8Array };

const PASSA = new Set(["porta", "portafinestra", "varco"]);
const SEDUTE = new Set(["sedia", "sgabello", "poltrona", "pouf"]), SERVITI = new Set(["tavolo", "scrivania", "isola"]);

function arrivo(s: Arredo) { return locale(s, 0, -s.P / 2 - 35); }       // in cima alla scala si esce dritti
function partenza(s: Arredo) { return locale(s, 0, s.P / 2 + 35); }

export function passaggi(M: Modello, piano: string, raggio = 35, cella = 5): Esito | null {
  const P = M.piani.find(p => p.id === piano);
  const el = M.el.filter(e => e.piano === piano);
  const pav = el.flatMap(e => (e.tipo === "stanza" || e.tipo === "area" ? [e.punti]
    : e.tipo === "arredo" && e.calpestabile && e.quota < 100 ? [angoli(e)] : []));   // anche gradini e pavimenti importati
  if (!P || !pav.length) return null;
  const xs = pav.flat().map(p => p.x), ys = pav.flat().map(p => p.y);
  const x0 = Math.floor((Math.min(...xs) - 40) / cella) * cella, y0 = Math.floor((Math.min(...ys) - 40) / cella) * cella;
  const W = Math.ceil((Math.max(...xs) + 40 - x0) / cella), H = Math.ceil((Math.max(...ys) + 40 - y0) / cella), N = W * H;
  const c = (i: number): Pt => ({ x: x0 + ((i % W) + 0.5) * cella, y: y0 + (Math.floor(i / W) + 0.5) * cella });
  const libero = new Uint8Array(N), forza = new Uint8Array(N);   // forza: la soglia delle porte strette, si attraversa comunque
  for (let i = 0; i < N; i++) if (pav.some(p => dentro(c(i), p))) libero[i] = 1;

  const nelRett = (pts: Pt[], v: number, forzata = false) => {   // celle dentro il poligono -> v
    const bx = pts.map(p => p.x), by = pts.map(p => p.y);
    for (let gy = Math.max(0, Math.floor((Math.min(...by) - y0) / cella)); gy < Math.min(H, Math.ceil((Math.max(...by) - y0) / cella)); gy++)
      for (let gx = Math.max(0, Math.floor((Math.min(...bx) - x0) / cella)); gx < Math.min(W, Math.ceil((Math.max(...bx) - x0) / cella)); gx++)
        if (dentro(c(gy * W + gx), pts)) { libero[gy * W + gx] = v; forza[gy * W + gx] = forzata ? 1 : 0; }
  };
  const aperture = el.filter((e): e is Apertura => e.tipo === "apertura" && !!e.aggancio);
  el.forEach(m => {
    if (m.tipo !== "muro") return;
    const mi = M.el.indexOf(m);
    segmenti(m).forEach(([a, b], seg) => {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 1) return;
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y, y: u.x }, t = m.spessore / 2;
      const q = (s: number, w: number) => ({ x: a.x + u.x * s + n.x * w, y: a.y + u.y * s + n.y * w });
      nelRett([q(-t, -t), q(L + t, -t), q(L + t, t), q(-t, t)], 0);
      for (const v of vani(M, piano, a, b, m.spessore)) if (PASSA.has(v.o.cosa)) {
        const k = v.o.larga < 2 * raggio ? 40 : 12;          // anche i pochi cm tra muro e pavimento; le porte strette fino a dove la stanza si apre
        nelRett([q(v.s0, -t - k), q(v.s1, -t - k), q(v.s1, t + k), q(v.s0, t + k)], 1, v.o.larga < 2 * raggio);
      }
    });
  });
  const arredi = el.filter((e): e is Arredo => e.tipo === "arredo");
  const blocca = (a: Arredo) => a.quota < 100 && (a.cosa === "modello" ? a.H >= 25 && !a.calpestabile : CATALOGO[a.cosa].ostacolo !== false);
  for (const a of arredi) if (blocca(a)) nelRett(angoli(a), 0);
  for (const f of el) if (f.tipo === "foro") nelRett(f.punti, 0);
  const sotto = M.el.filter((e): e is Arredo => e.tipo === "arredo" && e.cosa === "scala" && e.piano !== piano &&
    Math.abs((M.piani.find(p => p.id === e.piano)?.quota ?? 0) + e.H - P.quota) < 40);
  for (const s of sotto) nelRett(angoli(s), 0);              // il buco della scala che arriva qui

  // distanza (smussata 3-4) da ogni cella al primo ostacolo
  const D = new Int32Array(N);
  for (let i = 0; i < N; i++) D[i] = libero[i] ? 1 << 29 : 0;
  const g = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : D[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (D[i]) D[i] = Math.min(D[i], g(x - 1, y) + 3, g(x, y - 1) + 3, g(x - 1, y - 1) + 4, g(x + 1, y - 1) + 4);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (D[i]) D[i] = Math.min(D[i], g(x + 1, y) + 3, g(x, y + 1) + 3, g(x + 1, y + 1) + 4, g(x - 1, y + 1) + 4);
  }
  const passo = (i: number) => forza[i] === 1 || (D[i] * cella) / 3 >= raggio - 1.5;

  const cellaDi = (p: Pt) => {
    const gx = Math.floor((p.x - x0) / cella), gy = Math.floor((p.y - y0) / cella);
    return gx < 0 || gy < 0 || gx >= W || gy >= H ? -1 : gy * W + gx;
  };
  const vicina = (p: Pt, r: number, ok: (i: number) => boolean) => {   // una cella buona entro r celle
    const i0 = cellaDi(p);
    if (i0 < 0) return -1;
    for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const x = (i0 % W) + dx, y = Math.floor(i0 / W) + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && ok(y * W + x)) return y * W + x;
    }
    return -1;
  };

  // da dove si entra
  const terra = [...M.piani].sort((a, b) => Math.abs(a.quota) - Math.abs(b.quota))[0].id;
  const stanze = el.flatMap(e => (e.tipo === "stanza" ? [e.punti] : []));
  const lati = (o: Apertura) => {                       // i due punti appena oltre la porta, e se cadono in una stanza
    const g = o.aggancio!, k = g.spessore / 2 + 40;
    return [1, -1].map(s => { const q = { x: g.p.x + g.n.x * s * k, y: g.p.y + g.n.y * s * k }; return { q, dentro: stanze.some(p => dentro(q, p)) }; });
  };
  // si entra dalle porte verso l'esterno (dal lato della stanza) e dall'arrivo delle scale
  let semi: Pt[] = [...sotto.map(arrivo)];
  for (const o of aperture) if (PASSA.has(o.cosa)) { const l = lati(o); if (l.some(x => !x.dentro)) semi.push(...l.filter(x => x.dentro).map(x => x.q)); }
  if (P.quota < M.piani.find(p => p.id === terra)!.quota) semi.push(...arredi.filter(a => a.cosa === "scala").map(partenza));
  const problemi: Problema[] = [];
  if (!semi.length) {
    semi = aperture.filter(o => PASSA.has(o.cosa)).flatMap(o => lati(o).filter(x => x.dentro).map(x => x.q));
    if (semi.length) problemi.push({ msg: `${P.nome}: non trovo un ingresso o l'arrivo di una scala, controllo solo gli arredi stanza per stanza`, riga: P.riga, p: semi[0] });
  }

  const raggiunto = new Uint8Array(N), coda: number[] = [];
  for (const s of semi) { const i = vicina(s, 8, passo); if (i >= 0 && !raggiunto[i]) { raggiunto[i] = 1; coda.push(i); } }
  while (coda.length) {
    const i = coda.pop()!, x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W])
      if (j >= 0 && j < N && !raggiunto[j] && passo(j)) { raggiunto[j] = 1; coda.push(j); }
  }

  for (const o of aperture) if (PASSA.has(o.cosa) && o.larga < 2 * raggio)
    problemi.push({ msg: `${o.cosa} larga ${o.larga} (riga ${o.riga + 1}): per passare ne servono almeno ${2 * raggio}`, riga: o.riga, p: o.a });
  const ridotto = problemi.length > 0;
  for (const s of el) if (s.tipo === "stanza" && !ridotto) {
    let ok = false;
    for (let i = 0; i < N && !ok; i++) ok = raggiunto[i] === 1 && dentro(c(i), s.punti);
    if (!ok) problemi.push({ msg: `${s.nome} (riga ${s.riga + 1}): non ci si arriva da nessuna parte`, riga: s.riga, p: s.centro });
  }
  const sedute = arredi.filter(a => SEDUTE.has(a.cosa));
  for (const a of arredi) {
    const acc = CATALOGO[a.cosa]?.accesso ?? "no";
    if (acc === "no" || a.quota >= 100 || !pav.some(p => dentro(a.a, p))) continue;   // all'aperto il pavimento non lo conosciamo
    const f: Pt[] = [[0, a.P / 2 + 35]].concat(acc === "lati" || acc === "tutti" ? [[-a.L / 2 - 35, 0], [a.L / 2 + 35, 0]] : [], acc === "tutti" ? [[0, -a.P / 2 - 35]] : [])
      .map(([x, y]) => locale(a, x, y));
    if (SERVITI.has(a.cosa) && f.some(p => sedute.some(s => Math.hypot(s.a.x - p.x, s.a.y - p.y) < 45))) continue;   // ci si siede: conta la sedia
    if (!f.some(p => vicina(p, 2, i => raggiunto[i] === 1) >= 0))
      problemi.push({ msg: `${etichetta(a)} (riga ${a.riga + 1}): non ci si arriva ${acc === "fronte" ? "davanti" : "da nessun lato"}, servono 70 cm liberi`, riga: a.riga, p: a.a });
  }
  return { problemi, x0, y0, cella, W, H, raggiunto };
}

export function testoPassaggi(M: Modello, piano: string) {
  const e = passaggi(M, piano), nome = M.piani.find(p => p.id === piano)?.nome ?? piano;
  if (!e) return `${nome}: niente pavimenti da controllare`;
  return e.problemi.length ? `${nome}, passaggi da sistemare:\n` + e.problemi.map(p => "- " + p.msg).join("\n") : `${nome}: si passa ovunque (70 cm)`;
}
