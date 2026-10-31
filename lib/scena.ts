// Dal modello alla scena three.js: un gruppo per piano più uno per i tetti. Metri, y in alto, z = y della pianta.
import * as THREE from "three";
import { pezzi, rgb } from "./arredi.ts";
import { dentro, locale, sagoma, segmenti, vani as vaniDi, type Apertura, type Arredo, type Modello, type Pt } from "./lingua.ts";

type Buf = Map<string, number[]>;
const add = (b: Buf, m: string, ...v: number[][]) => { let a = b.get(m); if (!a) b.set(m, (a = [])); for (const p of v) a.push(p[0], p[1], p[2]); };
const W = (x: number, y: number, z: number) => [x / 100, z / 100, y / 100];   // cm pianta -> metri scena

/** Scatola: centro (cx, cy) in pianta, z = base, assi ruotati di (c, s). sz2: altezza all'estremo +x (muri sotto la falda). */
function scatola(b: Buf, m: string, cx: number, cy: number, z: number, sx: number, sy: number, sz: number, c = 1, s = 0, sz2 = sz) {
  const q = (x: number, y: number, h: number) => W(cx + x * c - y * s, cy + x * s + y * c, z + h);
  const X = sx / 2, Y = sy / 2;
  const v = [q(-X, -Y, 0), q(X, -Y, 0), q(X, Y, 0), q(-X, Y, 0), q(-X, -Y, sz), q(X, -Y, sz2), q(X, Y, sz2), q(-X, Y, sz)];
  for (const [i, j, k, l] of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]])
    add(b, m, v[i], v[j], v[k], v[i], v[k], v[l]);
}
function cilindro(b: Buf, m: string, cx: number, cy: number, z: number, d: number, h: number, n = 18) {
  const r = d / 2, P = (i: number, hh: number) => W(cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI), z + hh);
  for (let i = 0; i < n; i++) {
    add(b, m, P(i, 0), P(i + 1, 0), P(i + 1, h), P(i, 0), P(i + 1, h), P(i, h));
    add(b, m, W(cx, cy, z + h), P(i, h), P(i + 1, h), W(cx, cy, z), P(i + 1, 0), P(i, 0));
  }
}

/** Prisma dritto su un poligono convesso della pianta, da z0 a z1 (i gradini delle scale). */
function prisma(b: Buf, m: string, pts: Pt[], z0: number, z1: number) {
  if (z1 - z0 < 0.1) return;
  for (let i = 1; i + 1 < pts.length; i++) {
    add(b, m, W(pts[0].x, pts[0].y, z1), W(pts[i].x, pts[i].y, z1), W(pts[i + 1].x, pts[i + 1].y, z1));
    add(b, m, W(pts[0].x, pts[0].y, z0), W(pts[i + 1].x, pts[i + 1].y, z0), W(pts[i].x, pts[i].y, z0));
  }
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    add(b, m, W(p.x, p.y, z0), W(q.x, q.y, z0), W(q.x, q.y, z1), W(p.x, p.y, z0), W(q.x, q.y, z1), W(p.x, p.y, z1));
  });
}

function forma(pts: Pt[], buchi: Pt[][] = []) {
  const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x / 100, p.y / 100)));
  for (const h of buchi) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p.x / 100, p.y / 100))));
  return s;
}
export function lastra(pts: Pt[], top: number, spessore: number, buchi: Pt[][] = []) {
  const g = new THREE.ExtrudeGeometry(forma(pts, buchi), { depth: spessore / 100, bevelEnabled: false });
  g.rotateX(Math.PI / 2);                                // (x, y, z) -> (x, -z, y): la pianta sta in orizzontale, spessore verso il basso
  g.translate(0, top / 100, 0);
  return g;
}
/** I triangoli di un elemento dentro una mesh unita (vertici da..a): servono a sceglierlo e a spostarlo in 3D. */
export type Parte = { mesh: THREE.Mesh; da: number; a: number };
export type Scena = {
  piani: Map<string, THREE.Group>; tetti: THREE.Group; parti: Map<number, Parte[]>;
  stanze: { nome: string; area: number; piano: string; pos: THREE.Vector3; riga: number }[];
  centro: THREE.Vector3; raggio: number; dispose: () => void;
};

/** Le mesh dei modelli importati: per materiale, triangoli in cm locali (x, y in pianta centrati, z da terra). */
export type Mesh = Record<string, Float32Array>;

export function costruisci(M: Modello, mesh: Record<string, Mesh> = {}): Scena {
  const mats = new Map<string, THREE.Material>();
  const mat = (k: string) => {
    let m = mats.get(k);
    if (!m) {
      const c = rgb(k), lm = new THREE.MeshLambertMaterial({ color: new THREE.Color(c[0], c[1], c[2]), side: THREE.DoubleSide });
      if (c.length > 3 && c[3] < 1) Object.assign(lm, { transparent: true, opacity: c[3], depthWrite: false });
      mats.set(k, (m = lm));
    }
    return m;
  };
  const piani = new Map<string, THREE.Group>(), tetti = new THREE.Group(), geoms: THREE.BufferGeometry[] = [];
  const minQ = Math.min(...M.piani.map(p => p.quota));
  const stanze: Scena["stanze"] = [];
  const parti = new Map<number, Parte[]>();
  const misure = (buf: Buf) => new Map([...buf].map(([k, v]) => [k, v.length]));

  for (const P of M.piani) {
    const grp = new THREE.Group(), b: Buf = new Map(), bt: Buf = new Map(), el = M.el.filter(e => e.piano === P.id);
    grp.name = P.id;
    const piede = P.quota === minQ ? 4 : P.solaio;
    const segnati: { riga: number; buf: Buf; k: string; da: number; a: number }[] = [];
    const registra = (riga: number, buf: Buf, prima: Map<string, number>) => {
      for (const [k, v] of buf) { const da = prima.get(k) ?? 0; if (v.length > da) segnati.push({ riga, buf, k, da: da / 3, a: v.length / 3 }); }
    };

    for (const m of el) {
      if (m.tipo !== "muro") continue;
      const prima = misure(b), segs = segmenti(m), lun = segs.map(([a, c]) => Math.hypot(c.x - a.x, c.y - a.y));
      const tot = lun.reduce((x, y) => x + y, 0) || 1;
      let inizio = 0;
      segs.forEach(([a, c], seg) => {
        const L = lun[seg], da = inizio;
        inizio += L;
        if (L < 1) return;
        const cima = (s: number) => m.altezza + (m.fino - m.altezza) * Math.min(1, Math.max(0, (da + s) / tot));
        const u = { x: (c.x - a.x) / L, y: (c.y - a.y) / L }, t = m.spessore;
        const vani = vaniDi(M, P.id, a, c, m.spessore);
        const tagli = [...new Set([-t / 2, L + t / 2, ...vani.flatMap(v => [v.s0, v.s1])])].sort((x, y) => x - y);
        for (let i = 0; i + 1 < tagli.length; i++) {
          const s0 = Math.max(-t / 2, tagli[i]), s1 = Math.min(L + t / 2, tagli[i + 1]);
          if (s1 - s0 < 0.5) continue;
          const sm = (s0 + s1) / 2, cx = a.x + u.x * sm, cy = a.y + u.y * sm;
          const o = vani.find(v => v.s0 <= s0 + 0.01 && s1 <= v.s1 + 0.01)?.o;
          const h0 = cima(s0), h1 = cima(s1);
          if (o) {
            if (o.davanzale + piede > 0.5) scatola(b, m.colore, cx, cy, P.quota - piede, s1 - s0, t, o.davanzale + piede, u.x, u.y);
            const z = o.davanzale + o.alta;
            if (Math.max(h0, h1) - z > 0.5) scatola(b, m.colore, cx, cy, P.quota + z, s1 - s0, t, Math.max(0, h0 - z), u.x, u.y, Math.max(0, h1 - z));
          } else scatola(b, m.colore, cx, cy, P.quota - piede, s1 - s0, t, h0 + piede, u.x, u.y, h1 + piede);
          if (o && (o.cosa === "finestra" || o.cosa === "portafinestra")) {
            scatola(b, "vetro", cx, cy, P.quota + o.davanzale, s1 - s0, 2, o.alta, u.x, u.y);
            scatola(b, "antracite", cx, cy, P.quota + o.davanzale, s1 - s0, t + 1, 4, u.x, u.y);
          }
        }
      });
      registra(m.riga, b, prima);
    }

    for (const a of el) {
      if (a.tipo !== "arredo") continue;
      const c = Math.cos((a.ruota * Math.PI) / 180), s = Math.sin((a.ruota * Math.PI) / 180);
      const dove = a.cosa === "modello" && a.copertura ? bt : b, prima = misure(dove);   // le coperture vanno con i tetti: si nascondono guardando dentro
      if (a.cosa === "modello") {
        for (const [k, v] of Object.entries(mesh[a.nome] ?? {})) {
          const out: number[] = [];
          for (let i = 0; i < v.length; i += 3) out.push(...W(a.a.x + v[i] * c - v[i + 1] * s, a.a.y + v[i] * s + v[i + 1] * c, P.quota + a.quota + v[i + 2]));
          let arr = dove.get(k);
          if (!arr) dove.set(k, (arr = []));
          for (const x of out) arr.push(x);
        }
      } else if (a.scala) {                                // pieni fino a terra con la pedata sopra; la chiocciola ha solo le pedate e il palo
        const z0 = P.quota + a.quota, elica = a.scala.forma === "chiocciola";
        for (const g of a.scala.gradini) {
          const pts = g.poli.map(q => locale(a, q.x, q.y));
          if (!elica) prisma(b, "intonaco", pts, z0, z0 + g.z - 3);
          prisma(b, a.colore, pts, z0 + g.z - (elica ? 5 : 3), z0 + g.z);
        }
        if (elica) cilindro(b, "acciaio", a.a.x, a.a.y, z0, 14, a.H + 95);
      } else for (const p of pezzi(a.cosa, a.L, a.P, a.H, a.colore)) {
        const x = a.a.x + p.x * c - p.y * s, y = a.a.y + p.x * s + p.y * c, z = P.quota + a.quota + p.z;
        if (p.cil) cilindro(b, p.m, x, y, z, p.sx, p.sz);
        else scatola(b, p.m, x, y, z, p.sx, p.sy, p.sz, c, s);
      }
      registra(a.riga, dove, prima);
    }

    const fatte = new Map<Buf, Map<string, THREE.Mesh>>([[b, new Map()], [bt, new Map()]]);
    for (const [buf, dest] of [[b, grp], [bt, tetti]] as const) for (const [k, v] of buf) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      geoms.push(g);
      const m3 = new THREE.Mesh(g, mat(k));
      if ((mat(k) as THREE.MeshLambertMaterial).transparent) m3.renderOrder = 2;
      dest.add(m3);
      fatte.get(buf)!.set(k, m3);
    }
    for (const t of segnati) {                                   // ogni mesh sa di chi sono i suoi triangoli
      const m3 = fatte.get(t.buf)!.get(t.k)!;
      ((m3.userData.righe ??= []) as { da: number; a: number; riga: number }[]).push({ da: t.da, a: t.a, riga: t.riga });
      parti.set(t.riga, [...(parti.get(t.riga) ?? []), { mesh: m3, da: t.da, a: t.a }]);
    }

    const scale = M.el.filter((s): s is Arredo => s.tipo === "arredo" && s.cosa === "scala" && s.piano !== P.id &&
      Math.abs((M.piani.find(p => p.id === s.piano)?.quota ?? 0) + s.H - P.quota) < 40).map(sagoma)
      .concat(el.flatMap(f => (f.tipo === "foro" ? [f.punti] : [])));
    for (const e of el) {
      if (e.tipo === "stanza" || e.tipo === "area") {
        const buchi = e.tipo === "stanza" ? scale.filter(h => {          // un buco conta se sta dentro la stanza (tolleranza 1 cm sui bordi)
          const cx = h.reduce((x, q) => x + q.x, 0) / h.length, cy = h.reduce((y, q) => y + q.y, 0) / h.length;
          return h.every(q => { const d = Math.hypot(cx - q.x, cy - q.y) || 1; return dentro({ x: q.x + ((cx - q.x) / d) * 1.5, y: q.y + ((cy - q.y) / d) * 1.5 }, e.punti); });
        }) : [];
        const g = lastra(e.punti, P.quota + (e.tipo === "area" && e.colore === "prato" ? -1 : 0), e.tipo === "stanza" ? 4 : 3, buchi);
        geoms.push(g);
        const pav = new THREE.Mesh(g, mat(e.colore));
        pav.userData.riga = e.riga;
        grp.add(pav);
        if (e.tipo === "stanza") stanze.push({ nome: e.nome, area: e.area, piano: P.id, riga: e.riga, pos: new THREE.Vector3(e.centro.x / 100, (P.quota + 90) / 100, e.centro.y / 100) });
      }
      if (e.tipo === "tetto") { const t = tetto(e, P.quota + P.altezza, mat, geoms); t.traverse(o => { o.userData.riga = e.riga; }); tetti.add(t); }
    }
    piani.set(P.id, grp);
  }

  const box = new THREE.Box3();
  for (const g of piani.values()) box.expandByObject(g);
  const centro = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const raggio = box.isEmpty() ? 8 : Math.max(4, box.getSize(new THREE.Vector3()).length() / 2);
  return { piani, tetti, parti, stanze, centro, raggio, dispose: () => { geoms.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); } };
}

/** Il muro che stai tirando in pianta: stessi conti dei muri veri (altezza da h0 a h1 lungo tutta la linea), senza porte né finestre. */
export function muroInCorso(pts: Pt[], quota: number, t: number, h0: number, h1: number) {
  const b: Buf = new Map(), lun = pts.slice(1).map((c, i) => Math.hypot(c.x - pts[i].x, c.y - pts[i].y));
  const tot = lun.reduce((x, y) => x + y, 0) || 1, cima = (s: number) => h0 + (h1 - h0) * Math.min(1, Math.max(0, s / tot));
  let da = 0;
  lun.forEach((L, i) => {
    const a = pts[i], c = pts[i + 1];
    if (L >= 1) scatola(b, "m", (a.x + c.x) / 2, (a.y + c.y) / 2, quota, L + t, t, cima(da - t / 2), (c.x - a.x) / L, (c.y - a.y) / L, cima(da + L + t / 2));
    da += L;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.get("m") ?? [], 3));
  g.computeVertexNormals();
  return g;
}

function tetto(e: Extract<Modello["el"][number], { tipo: "tetto" }>, base: number, mat: (k: string) => THREE.Material, geoms: THREE.BufferGeometry[]) {
  const grp = new THREE.Group(), [a, b] = e.punti, s = e.sporto, h = e.altezza;
  if (e.falde === 0) {
    const g = lastra([{ x: a.x - s, y: a.y - s }, { x: b.x + s, y: a.y - s }, { x: b.x + s, y: b.y + s }, { x: a.x - s, y: b.y + s }], base + h, h);
    geoms.push(g);
    grp.add(new THREE.Mesh(g, mat(e.colore)));
    return grp;
  }
  // lavoro in coordinate (u lungo il colmo, v di traverso), poi scambio se il colmo va lungo y
  const sw = e.colmo === "y";
  const u0 = sw ? a.y : a.x, u1 = sw ? b.y : b.x, v0 = sw ? a.x : a.y, v1 = sw ? b.x : b.y;
  const P = (u: number, v: number, z: number) => (sw ? W(v, u, z) : W(u, v, z));
  const tegole: number[][] = [], timpani: number[][] = [];
  if (e.falde === 2) {
    const vm = (v0 + v1) / 2, k = h / (vm - v0), gr = base - k * s;
    tegole.push(P(u0 - s, v0 - s, gr), P(u1 + s, v0 - s, gr), P(u1 + s, vm, base + h), P(u0 - s, v0 - s, gr), P(u1 + s, vm, base + h), P(u0 - s, vm, base + h));
    tegole.push(P(u0 - s, v1 + s, gr), P(u0 - s, vm, base + h), P(u1 + s, vm, base + h), P(u0 - s, v1 + s, gr), P(u1 + s, vm, base + h), P(u1 + s, v1 + s, gr));
    for (const u of [u0, u1]) timpani.push(P(u, v0, base), P(u, v1, base), P(u, vm, base + h));
  } else {
    const k = h / (v1 - v0);
    tegole.push(P(u0 - s, v0 - s, base + h + k * s), P(u1 + s, v0 - s, base + h + k * s), P(u1 + s, v1 + s, base - k * s),
      P(u0 - s, v0 - s, base + h + k * s), P(u1 + s, v1 + s, base - k * s), P(u0 - s, v1 + s, base - k * s));
    for (const u of [u0, u1]) timpani.push(P(u, v0, base), P(u, v1, base), P(u, v0, base + h));
  }
  for (const [pts, m] of [[tegole, e.colore], [timpani, "muro"]] as const) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.computeVertexNormals();
    geoms.push(g);
    grp.add(new THREE.Mesh(g, mat(m)));
  }
  return grp;
}
