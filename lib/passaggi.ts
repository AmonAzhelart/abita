// Si passa davvero? Per ogni piano una griglia da 5 cm: pavimenti meno muri, arredi (con la loro sagoma vera) e buchi;
// le porte aprono il muro per la loro luce. Si cammina dove restano almeno 60 cm, partendo dalle porte verso l'esterno
// e salendo o scendendo per le scale, quelle disegnate e quelle importate col loro buco nel solaio.
// Poi una cosa per volta: a ogni stanza ci si arriva? Davanti a ogni mobile resta lo spazio per usarlo?
// Ogni porta si apre senza urtare? Alle scale si arriva in fondo e si esce in cima?
import { CATALOGO } from "./arredi.ts";
import { dentro, etichetta, locale, sagoma, segmenti, vani, type Apertura, type Arredo, type Modello, type Pt } from "./lingua.ts";

export type Problema = { msg: string; riga: number; p: Pt };
/** I triangoli dei modelli importati (cm locali, per materiale): se ci sono, contano solo le parti sotto i 150 cm. */
export type Triangoli = Record<string, Record<string, Float32Array>>;
export type Esito = { problemi: Problema[]; x0: number; y0: number; cella: number; W: number; H: number; raggiunto: Uint8Array };

const PASSA = new Set(["porta", "portafinestra", "varco"]);
const SERVITI = new Set(["tavolo", "scrivania", "isola"]), SEDUTE = new Set(["sedia", "sgabello", "poltrona", "pouf"]);
const SCALA = /^scala\b|stair/i;                          // gli oggetti importati che sono scale
const CELLA = 5, PASSAGGIO = 60, DI_FIANCO = 45;            // cm: per camminare; per infilarsi di fianco accanto a un mobile
/** Lo spazio libero che serve davanti (o ai lati, o intorno) per usare un mobile, in cm. */
const SPAZIO: Record<string, number> = {
  wc: 55, bidet: 55, lavabo: 55, doccia: 60, vasca: 60, lavatrice: 60, letto: 50, letto_singolo: 50, armadio: 60, cassettiera: 50, madia: 50,
  mobile_tv: 40, comodino: 40, cucina: 80, frigo: 70, isola: 80, divano: 40, poltrona: 40, scrivania: 70, libreria: 50, camino: 50,
  tavolo: 60, sedia: 40, sgabello: 40, pouf: 30,
};

/** La pianta di un arredo: le sagome vere degli oggetti importati, la sagoma della scala, il rettangolo per il resto. */
function forme(M: Modello, a: Arredo): Pt[][] {
  const pg = a.cosa === "modello" ? M.modelli[a.nome]?.pianta : undefined;
  return pg?.length ? pg.map(poly => poly.map(([x, y]) => locale(a, x, y))) : [sagoma(a)];
}
const blocca = (a: Arredo) => a.quota < 100 && !a.copertura && (a.cosa === "modello" ? a.H >= 25 && !a.calpestabile : CATALOGO[a.cosa]?.ostacolo !== false);
const centro = (p: Pt[]) => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });
/** Punti tutto intorno a un poligono, a d cm dal bordo verso fuori. */
function intorno(p: Pt[], d = 40): Pt[] {
  const c = centro(p), out: Pt[] = [];
  p.forEach((a, i) => {
    const b = p[(i + 1) % p.length], L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) return;
    let n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((m.x + n.x - c.x) ** 2 + (m.y + n.y - c.y) ** 2 < (m.x - c.x) ** 2 + (m.y - c.y) ** 2) n = { x: -n.x, y: -n.y };
    for (let s = 0; s <= L; s += 25) out.push({ x: a.x + ((b.x - a.x) * s) / L + n.x * d, y: a.y + ((b.y - a.y) * s) / L + n.y * d });
  });
  return out;
}
/** In fondo e in cima a una scala disegnata: 40 cm prima del primo gradino e dopo l'ultimo, nella direzione di marcia. */
function capi(s: Arredo): [Pt, Pt] {
  const pp = s.scala!.percorso, oltre = (a: Pt, b: Pt) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return locale(s, b.x + ((b.x - a.x) / L) * 40, b.y + ((b.y - a.y) / L) * 40); };
  return [oltre(pp[1], pp[0]), oltre(pp[pp.length - 2], pp[pp.length - 1])];
}

type Griglia = NonNullable<ReturnType<typeof griglia>>;

function griglia(M: Modello, piano: string, mesh: Triangoli) {
  const P = M.piani.find(p => p.id === piano)!, el = M.el.filter(e => e.piano === piano);
  const arredi = el.filter((e): e is Arredo => e.tipo === "arredo");
  const pav = [...el.flatMap(e => (e.tipo === "stanza" || e.tipo === "area" ? [e.punti] : [])), ...arredi.filter(a => a.calpestabile && a.quota < 100).flatMap(a => forme(M, a))];
  if (!pav.length) return null;
  const xs = pav.flat().map(p => p.x), ys = pav.flat().map(p => p.y);
  const x0 = Math.floor((Math.min(...xs) - 60) / CELLA) * CELLA, y0 = Math.floor((Math.min(...ys) - 60) / CELLA) * CELLA;
  const W = Math.ceil((Math.max(...xs) + 60 - x0) / CELLA), H = Math.ceil((Math.max(...ys) + 60 - y0) / CELLA), N = W * H;
  const c = (i: number): Pt => ({ x: x0 + ((i % W) + 0.5) * CELLA, y: y0 + (Math.floor(i / W) + 0.5) * CELLA });
  const cellaDi = (p: Pt) => { const gx = Math.floor((p.x - x0) / CELLA), gy = Math.floor((p.y - y0) / CELLA); return gx < 0 || gy < 0 || gx >= W || gy >= H ? -1 : gy * W + gx; };
  const libero = new Uint8Array(N), muro = new Uint8Array(N), forza = new Uint8Array(N);
  const riempi = (pts: Pt[], fa: (i: number) => void) => {     // ogni cella col centro dentro il poligono
    const bx = pts.map(p => p.x), by = pts.map(p => p.y);
    for (let gy = Math.max(0, Math.floor((Math.min(...by) - y0) / CELLA)); gy < Math.min(H, Math.ceil((Math.max(...by) - y0) / CELLA)); gy++)
      for (let gx = Math.max(0, Math.floor((Math.min(...bx) - x0) / CELLA)); gx < Math.min(W, Math.ceil((Math.max(...bx) - x0) / CELLA)); gx++)
        if (dentro(c(gy * W + gx), pts)) fa(gy * W + gx);
  };
  for (const p of pav) riempi(p, i => { libero[i] = 1; });
  const aperture = el.filter((e): e is Apertura => e.tipo === "apertura" && !!e.aggancio);
  for (const m of el) {
    if (m.tipo !== "muro") continue;
    for (const [a, b] of segmenti(m)) {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 1) continue;
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y, y: u.x }, t = m.spessore / 2;
      const q = (s: number, w: number) => ({ x: a.x + u.x * s + n.x * w, y: a.y + u.y * s + n.y * w });
      riempi([q(-t, -t), q(L + t, -t), q(L + t, t), q(-t, t)], i => { libero[i] = 0; muro[i] = 1; });
      for (const v of vani(M, piano, a, b, m.spessore)) if (PASSA.has(v.o.cosa)) {   // la luce della porta: il telaio si mangia qualche cm
        const luce = v.o.cosa === "varco" ? v.o.larga : v.o.larga - 6, sm = (v.s0 + v.s1) / 2;
        if (luce < 45) continue;                              // di fianco non ci si passa: il muro resta chiuso
        riempi([q(sm - luce / 2, -t - 15), q(sm + luce / 2, -t - 15), q(sm + luce / 2, t + 15), q(sm - luce / 2, t + 15)], i => { libero[i] = 1; muro[i] = 0; forza[i] = 1; });
      }
    }
  }
  const chi = new Int32Array(N).fill(-1);                  // di quale arredo è l'ostacolo in ogni cella
  arredi.forEach((a, k) => {
    if (!blocca(a)) return;
    const occupa = (i: number) => { libero[i] = 0; forza[i] = 0; chi[i] = k; };
    const tri = a.cosa === "modello" ? mesh[a.nome] : undefined;
    if (!tri || !Object.keys(tri).length) { for (const pts of forme(M, a)) riempi(pts, occupa); return; }
    for (const v of Object.values(tri)) for (let t = 0; t + 8 < v.length; t += 9) {   // sotto le travi e le chiome si passa
      if (Math.min(v[t + 2], v[t + 5], v[t + 8]) + a.quota >= 150) continue;
      const q = [0, 3, 6].map(o => locale(a, v[t + o], v[t + o + 1]));
      for (let e = 0; e < 3; e++) {                          // i bordi (anche le facce in verticale, che in pianta sono linee)
        const A = q[e], B = q[(e + 1) % 3], n = Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / (CELLA / 2));
        for (let j = 0; j <= n; j++) { const i = cellaDi({ x: A.x + ((B.x - A.x) * j) / Math.max(1, n), y: A.y + ((B.y - A.y) * j) / Math.max(1, n) }); if (i >= 0) occupa(i); }
      }
      riempi(q, occupa);
    }
  });
  for (const f of el) if (f.tipo === "foro") riempi(f.punti, i => { libero[i] = 0; forza[i] = 0; });
  for (const s of M.el) if (s.tipo === "arredo" && s.cosa === "scala" && s.piano !== piano &&
    Math.abs((M.piani.find(p => p.id === s.piano)?.quota ?? 0) + s.H - P.quota) < 40) riempi(sagoma(s), i => { libero[i] = 0; forza[i] = 0; });   // il buco della scala che arriva qui

  // distanza (smussata 3-4, in terzi di cella) da ogni cella libera al primo ostacolo
  const D = new Int32Array(N);
  for (let i = 0; i < N; i++) D[i] = libero[i] ? 1 << 29 : 0;
  const g = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : D[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (D[i]) D[i] = Math.min(D[i], g(x - 1, y) + 3, g(x, y - 1) + 3, g(x - 1, y - 1) + 4, g(x + 1, y - 1) + 4); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (D[i]) D[i] = Math.min(D[i], g(x + 1, y) + 3, g(x, y + 1) + 3, g(x + 1, y + 1) + 4, g(x - 1, y + 1) + 4); }
  const largo = (i: number, w: number) => libero[i] === 1 && (forza[i] === 1 || (D[i] * CELLA) / 3 >= w / 2 - CELLA / 2);
  const cammina = (i: number) => largo(i, PASSAGGIO), fianco = (i: number) => largo(i, DI_FIANCO);
  const raggiunto = new Uint8Array(N);
  const vicina = (p: Pt, r: number, ok: (i: number) => boolean) => {   // la cella buona più vicina entro r celle
    const i0 = cellaDi(p);
    if (i0 < 0) return -1;
    for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const x = (i0 % W) + dx, y = Math.floor(i0 / W) + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && ok(y * W + x)) return y * W + x;
    }
    return -1;
  };
  const espandi = (coda: number[], livello: number, ok: (i: number) => boolean) => {
    while (coda.length) {
      const i = coda.pop()!, x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W])
        if (j >= 0 && j < N && !raggiunto[j] && ok(j)) { raggiunto[j] = livello; coda.push(j); }
    }
  };
  const allaga = (semi: Pt[], r = 8) => {                  // da questi punti, ovunque ci si passa (60 cm)
    const coda: number[] = [];
    for (const s of semi) { const i = vicina(s, r, cammina); if (i >= 0 && !raggiunto[i]) { raggiunto[i] = 1; coda.push(i); } }
    const nuovi = coda.length > 0;
    espandi(coda, 1, cammina);
    return nuovi;
  };
  const allarga = () => {                                  // e da lì, dove ci si infila di fianco (45 cm)
    const coda: number[] = [];
    for (let i = 0; i < N; i++) if (raggiunto[i] === 1) coda.push(i);
    espandi(coda, 2, fianco);
  };
  const tocca = (pts: Pt[]) => pts.some(p => vicina(p, 8, i => raggiunto[i] === 1) >= 0);
  return { P, el, arredi, aperture, pav, chi, x0, y0, W, H, N, c, cellaDi, libero, muro, raggiunto, cammina, fianco, vicina, allaga, allarga, tocca };
}

const memo = new WeakMap<Modello, { mesh: Triangoli; out: Map<string, Esito> }>();

/** Tutti i piani insieme: le scale passano da uno all'altro. */
const NIENTE: Triangoli = {};
export function passaggiTutti(M: Modello, mesh: Triangoli = NIENTE): Map<string, Esito> {
  const fatto = memo.get(M);
  if (fatto?.mesh === mesh) return fatto.out;
  const G = new Map<string, Griglia>(), problemi = new Map<string, Problema[]>();
  for (const P of M.piani) { const g = griglia(M, P.id, mesh); if (g) { G.set(P.id, g); problemi.set(P.id, []); } }
  const segnala = (piano: string, p: Problema) => problemi.get(piano)?.push(p);
  const quota = (id: string) => M.piani.find(p => p.id === id)?.quota ?? 0;
  const sopra = (id: string) => M.piani.filter(p => p.quota > quota(id)).sort((a, b) => a.quota - b.quota)[0];

  // le scale: chi sta in fondo e chi in cima, e su che piani
  type Scala = { a: Arredo; giu: Pt[]; su?: { piano: string; pts: Pt[] } };
  const scale: Scala[] = [];
  for (const a of M.el) {
    if (a.tipo !== "arredo") continue;
    if (a.cosa === "scala" && a.scala) {
      const su = M.piani.find(p => Math.abs(p.quota - quota(a.piano) - a.quota - a.H) < 40), [giu, cima] = capi(a);
      scale.push({ a, giu: [giu], su: su && su.id !== a.piano ? { piano: su.id, pts: [cima] } : undefined });
    } else if (a.cosa === "modello" && SCALA.test(a.nome)) {   // importata: in cima si esce dal buco nel solaio sopra di lei
      const su = sopra(a.piano), b = sagoma(a);
      const buchi = su ? M.el.filter(f => f.tipo === "foro" && f.piano === su.id && (f.punti.some(q => dentro(q, b)) || b.some(q => dentro(q, f.punti)))) : [];
      scale.push({ a, giu: intorno(b), su: su && (buchi.length || Math.abs(su.quota - quota(a.piano) - a.quota - a.H) < 60) ? { piano: su.id, pts: buchi.length ? buchi.flatMap(f => intorno((f as { punti: Pt[] }).punti)) : intorno(b) } : undefined });
    }
  }

  // si entra dalle porte verso fuori; non da quelle sulle terrazze sopra altre stanze
  const ingressi = (g: Griglia) => {
    const stanze = g.el.flatMap(e => (e.tipo === "stanza" ? [e.punti] : [])), aree = g.el.flatMap(e => (e.tipo === "area" ? [e.punti] : []));
    const sotto = (q: Pt) => M.el.some(s => s.tipo === "stanza" && quota(s.piano) < g.P.quota && dentro(q, s.punti));
    return g.aperture.filter(o => PASSA.has(o.cosa)).flatMap(o => {
      const a = o.aggancio!, k = a.spessore / 2 + 40, lati = [1, -1].map(s => ({ x: a.p.x + a.n.x * s * k, y: a.p.y + a.n.y * s * k }));
      const fuori = lati.filter(q => !stanze.some(p => dentro(q, p)));
      return fuori.length && !fuori.some(q => aree.some(p => dentro(q, p)) && sotto(q)) ? lati : [];
    });
  };
  let entrate = 0;
  for (const g of G.values()) if (g.allaga(ingressi(g))) entrate++;
  if (!entrate) {                                          // nessuna porta verso fuori: si controlla stanza per stanza
    const primo = [...G.values()][0];
    if (primo) segnala(primo.P.id, { msg: "non trovo una porta verso l'esterno: controllo i piani stanza per stanza", riga: primo.P.riga, p: primo.pav[0][0] });
  }
  for (let giro = 0, nuovo = true; nuovo && giro < 2 * M.piani.length + 2; giro++) {   // su e giù per le scale finché si scopre qualcosa
    nuovo = false;
    for (const s of scale) {
      const A = G.get(s.a.piano), B = s.su && G.get(s.su.piano);
      if (!A || !B || !s.su) continue;
      if (A.tocca(s.giu) && B.allaga(s.su.pts, 6)) nuovo = true;
      if (B.tocca(s.su.pts) && A.allaga(s.giu, 6)) nuovo = true;
    }
  }
  const porteDentro = (g: Griglia) => g.aperture.filter(o => PASSA.has(o.cosa)).flatMap(o => { const a = o.aggancio!, k = a.spessore / 2 + 40; return [1, -1].map(s => ({ x: a.p.x + a.n.x * s * k, y: a.p.y + a.n.y * s * k })); });
  for (const g of G.values()) if (!g.raggiunto.some(v => v === 1)) {
    if (entrate) segnala(g.P.id, { msg: `${g.P.nome}: non ci si arriva, nessuna porta d'ingresso e nessuna scala porta qui`, riga: g.P.riga, p: g.pav[0][0] });
    g.allaga(porteDentro(g));
  }

  const out = new Map<string, Esito>();
  for (const g of G.values()) {
    const pr = problemi.get(g.P.id)!, su = (p: Problema) => pr.push(p);
    const giaTutto = new Uint8Array(g.raggiunto);           // i passaggi da 60, prima di aggiungere quelli di fianco
    g.allarga();

    // le stanze
    for (const s of g.el) if (s.tipo === "stanza") {
      let piena = false, fianco = false;
      for (let i = 0; i < g.N && !piena; i++) if (giaTutto[i] === 1 && dentro(g.c(i), s.punti)) piena = true;
      if (!piena) for (let i = 0; i < g.N && !fianco; i++) if (g.raggiunto[i] === 2 && dentro(g.c(i), s.punti)) fianco = true;
      if (!piena) su({ msg: fianco ? `${s.nome} (riga ${s.riga + 1}): ci si arriva solo di fianco, il passaggio è sotto i 60 cm` : `${s.nome} (riga ${s.riga + 1}): non ci si arriva`, riga: s.riga, p: s.centro });
    }

    // le porte: larghe abbastanza e libere di aprirsi
    for (const o of g.aperture) {
      if (!PASSA.has(o.cosa)) continue;
      if (o.larga < 60) su({ msg: `${o.cosa} larga ${o.larga} (riga ${o.riga + 1}): ${o.larga - 6 < 45 ? "non ci si passa" : "si passa a fatica"}, servono almeno 60 cm (comoda da 80)`, riga: o.riga, p: o.a });
      if (o.cosa !== "porta" || o.scorrevole) continue;
      const a = o.aggancio!, w = o.larga, h = o.cardine === "sx" ? -w / 2 : w / 2, apre = { x: a.n.x * a.lato, y: a.n.y * a.lato }, chiude = { x: -a.u.x * Math.sign(h), y: -a.u.y * Math.sign(h) };
      const cerniera = { x: a.p.x + a.u.x * h + apre.x * (a.spessore / 2), y: a.p.y + a.u.y * h + apre.y * (a.spessore / 2) };
      let urta = "";
      for (let f = 8; f <= 80 && !urta; f += 8) for (let r = 15; r <= w - 5 && !urta; r += 8) {   // fino a 80°: quello che sta a filo dell'anta aperta non conta
        const t = (f * Math.PI) / 180, q = { x: cerniera.x + (chiude.x * Math.cos(t) + apre.x * Math.sin(t)) * r, y: cerniera.y + (chiude.y * Math.cos(t) + apre.y * Math.sin(t)) * r };
        const i = g.cellaDi(q), ob = i >= 0 && g.chi[i] >= 0 ? g.arredi[g.chi[i]] : undefined;
        if (ob && ob.quota < o.alta && ob.H > 2) urta = `${etichetta(ob)} (riga ${ob.riga + 1})`;
        else if (r * Math.sin(t) > 8 && i >= 0 && g.muro[i]) urta = "un muro";
      }
      if (urta) su({ msg: `porta (riga ${o.riga + 1}): aprendosi urta ${urta}${urta === "un muro" ? ", cambia cerniera o verso" : ""}`, riga: o.riga, p: o.a });
    }

    // le scale disegnate: in fondo ci si arriva, in cima si esce sul pavimento
    for (const s of scale) {
      if (s.a.cosa !== "scala") continue;
      if (s.a.piano === g.P.id && g.vicina(s.giu[0], 6, i => g.raggiunto[i] > 0) < 0)
        su({ msg: `scala (riga ${s.a.riga + 1}): alla partenza non ci si arriva`, riga: s.a.riga, p: s.giu[0] });
      if (s.su?.piano === g.P.id && g.vicina(s.su.pts[0], 6, g.fianco) < 0)
        su({ msg: `scala (riga ${s.a.riga + 1}): in cima esce contro un muro o fuori dal pavimento`, riga: s.a.riga, p: s.su.pts[0] });
    }

    // davanti a ogni mobile lo spazio per usarlo, e ci si arriva
    const sedute = g.arredi.filter(a => SEDUTE.has(a.cosa));
    for (const a of g.arredi) {
      const acc = CATALOGO[a.cosa]?.accesso ?? "no";
      if (acc === "no" || a.cosa === "scala" || a.quota >= 100 || !g.pav.some(p => dentro(a.a, p))) continue;
      const serve = SPAZIO[a.cosa] ?? 60, L = a.L / 2, P = a.P / 2;
      const facce: [Pt, Pt, Pt][] = [[{ x: -L, y: P }, { x: L, y: P }, { x: 0, y: 1 }]];            // fronte: da, a, verso fuori
      if (acc !== "fronte") facce.push([{ x: -L, y: -P }, { x: -L, y: P }, { x: -1, y: 0 }], [{ x: L, y: -P }, { x: L, y: P }, { x: 1, y: 0 }]);
      if (acc === "lati") facce.shift();
      if (acc === "tutti") facce.push([{ x: -L, y: -P }, { x: L, y: -P }, { x: 0, y: -1 }]);
      if (SERVITI.has(a.cosa) && facce.some(([p, q, n]) => sedute.some(s => { const m = locale(a, (p.x + q.x) / 2 + n.x * 20, (p.y + q.y) / 2 + n.y * 20); return Math.hypot(s.a.x - m.x, s.a.y - m.y) < 50; }))) continue;   // ci si siede: conta la sedia
      let meglio = 0, largo = 0, ok = false;
      for (const [p, q, n] of facce) {
        const lun = Math.hypot(q.x - p.x, q.y - p.y);
        let buone = 0, prove = 0;
        for (let s = Math.min(10, lun / 2); s <= lun - Math.min(10, lun / 2) + 0.01 && !ok; s += 10) {
          const b = { x: p.x + ((q.x - p.x) * s) / lun, y: p.y + ((q.y - p.y) * s) / lun };
          prove++;
          let libera = 0, arriva = false;
          for (let d = CELLA * 1.5; d <= serve + CELLA / 2; d += CELLA) {   // la prima cella fuori dal mobile (la griglia non è allineata)
            const i = g.cellaDi(locale(a, b.x + n.x * d, b.y + n.y * d));
            if (i < 0 || !g.libero[i]) break;
            libera = d + CELLA / 2;
            if (g.raggiunto[i]) arriva = true;
          }
          meglio = Math.max(meglio, Math.min(libera, serve));
          if (libera >= serve - CELLA / 2) { buone++; if (arriva) ok = true; }
        }
        largo = Math.max(largo, buone === prove ? lun : Math.min(lun, buone * 10));
      }
      if (ok) continue;
      const dove = acc === "fronte" ? "davanti" : acc === "lati" ? "ai lati" : "intorno";
      const nome = `${etichetta(a)} (riga ${a.riga + 1})`;
      su({ msg: meglio < serve - CELLA / 2 ? `${nome}: ${dove} restano ${Math.round(meglio)} cm, ne servono ${serve}`
        : largo < Math.min(45, a.cosa === "letto" || a.cosa === "letto_singolo" ? a.P : a.L) ? `${nome}: ${dove} è libero solo un tratto di ${Math.round(largo)} cm`
        : `${nome}: lo spazio ${dove} c'è ma non ci si arriva`, riga: a.riga, p: a.a });
    }
    out.set(g.P.id, { problemi: pr, x0: g.x0, y0: g.y0, cella: CELLA, W: g.W, H: g.H, raggiunto: g.raggiunto });
  }
  memo.set(M, { mesh, out });
  return out;
}

export function passaggi(M: Modello, piano: string, mesh?: Triangoli): Esito | null {
  return passaggiTutti(M, mesh).get(piano) ?? null;
}

export function testoPassaggi(M: Modello, piano: string, mesh?: Triangoli) {
  const e = passaggi(M, piano, mesh), nome = M.piani.find(p => p.id === piano)?.nome ?? piano;
  if (!e) return `${nome}: niente pavimenti da controllare`;
  return e.problemi.length ? `${nome}, passaggi da sistemare:\n` + e.problemi.map(p => "- " + p.msg).join("\n") : `${nome}: si passa ovunque (60 cm) e davanti a ogni mobile c'è lo spazio per usarlo`;
}
