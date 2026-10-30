"use client";
// La pianta interattiva: zoom con la rotella o due dita, trascina per spostarti, clic per scegliere,
// trascina un elemento per spostarlo. Gli attrezzi di disegno restituiscono punti in cm al genitore.
// Muro: clic per gli angoli, scrivi una misura e Invio per un tratto esatto, Backspace o tasto destro toglie l'ultimo punto.
import { useEffect, useMemo, useRef, useState } from "react";
import { distSeg, segmenti, type Arredo, type Modello, type Muro, type Pt } from "@/lib/lingua";
import type { Esito } from "@/lib/passaggi";
import { contorno, disegnaPianta, riquadro } from "@/lib/pianta";
import type { Appunto, Foto } from "@/lib/progetti";

export type Strumento = "sposta" | "muro" | "stanza" | "porta" | "finestra" | "arredo" | "misura" | "appunto" | "calibra" | "foto" | "commento";
export type OpzMuro = { spessore: number; a: number; b: number };
type Props = {
  modello: Modello; piano: string; quote?: boolean; passaggi?: Esito | null; modifica?: boolean;
  strumento?: Strumento; modoAppunto?: "punto" | "linea" | "zona"; muro?: OpzMuro;
  sel?: number | null; evid?: number[]; appunti?: (Appunto & { n: number })[]; notaSel?: string | null;
  foto?: Foto[]; fotoAttiva?: string | null; centra?: { p: Pt; n: number }; adatta?: number;
  onSel?: (riga: number | null) => void; onSposta?: (riga: number, dx: number, dy: number) => void;
  onVertici?: (riga: number, punti: Pt[]) => void; onDisegna?: (cosa: Strumento, punti: Pt[]) => void;
  onRuota?: (riga: number, gradi: number) => void; onBozza?: (attiva: boolean) => void;
  onNota?: (id: string) => void; onFoto?: (fid: string, campi: Partial<Foto>) => void;
};
type Vista = { cx: number; cy: number; k: number };
type Presa = { p: Pt; tipo: "vertice" | "linea" | "griglia"; gx?: Pt; gy?: Pt };
const COL = (a: Appunto) => (a.stato === "fatta" ? "var(--fatta)" : a.da === "cliente" ? "var(--cliente)" : a.da === "claude" ? "var(--claude)" : "var(--nota)");
const SCALE = [10, 20, 50, 100, 200, 500, 1000, 2000];
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nastro di un tratto di muro con il suo spessore (allungato di mezzo spessore ai capi, come in pianta). */
function nastro(a: Pt, b: Pt, t: number): Pt[] {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y * t / 2, y: u.x * t / 2 };
  const A = { x: a.x - u.x * t / 2, y: a.y - u.y * t / 2 }, B = { x: b.x + u.x * t / 2, y: b.y + u.y * t / 2 };
  return [{ x: A.x + n.x, y: A.y + n.y }, { x: B.x + n.x, y: B.y + n.y }, { x: B.x - n.x, y: B.y - n.y }, { x: A.x - n.x, y: A.y - n.y }];
}

export default function Pianta(p: Props) {
  const { modello: M, piano, strumento = "sposta", modifica = false } = p;
  const svg = useRef<SVGSVGElement>(null), [dim, setDim] = useState({ w: 800, h: 600 });
  const [v, setV] = useState<Vista | null>(null);
  const [cur, setCur] = useState<Presa | null>(null);
  const [pos, setPos] = useState<Pt | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);                         // punti del disegno in corso
  const [dig, setDig] = useState("");                               // misura scritta a tastiera mentre tiri un muro
  const [drag, setDrag] = useState<{ riga: number; dx: number; dy: number } | null>(null);
  const [vert, setVert] = useState<{ riga: number; i: number; punti: Pt[] } | null>(null);
  const [giro, setGiro] = useState<{ riga: number; gradi: number } | null>(null);
  const [fotoDrag, setFotoDrag] = useState<{ fid: string; x: number; y: number } | null>(null);
  const g = useRef<{ tipo: string; x0: number; y0: number; p0: Pt; v0?: Vista; mosso: boolean; riga?: number; el?: Element | null; pinch?: number; fx?: number; fy?: number } | null>(null);
  const dita = useRef(new Map<number, { x: number; y: number }>());
  const ultimo = useRef({ t: 0, x: 0, y: 0 });

  const { svg: disegno, etichette } = useMemo(() => disegnaPianta(M, { piano, quote: p.quote, passaggi: p.passaggi, testo: false }), [M, piano, p.quote, p.passaggi]);
  const muri = useMemo(() => M.el.filter((e): e is Muro => e.tipo === "muro" && e.piano === piano), [M, piano]);
  const tratti = useMemo(() => muri.flatMap(m => segmenti(m).map(s => ({ s, t: m.spessore }))), [muri]);
  const vertici = useMemo(() => M.el.filter(e => e.piano === piano).flatMap(e => e.tipo === "muro" || e.tipo === "stanza" || e.tipo === "area" ? e.punti : []), [M, piano]);

  useEffect(() => {
    const el = svg.current!;
    const ro = new ResizeObserver(() => setDim({ w: el.clientWidth || 800, h: el.clientHeight || 600 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const adatta = () => {
    const b = riquadro(M, M.el.some(e => e.tipo === "stanza" && e.piano === piano) ? piano : undefined), k = Math.min(dim.w / b.w, (dim.h - 110) / b.h);
    setV({ cx: b.x + b.w / 2, cy: b.y + b.h / 2 + 30 / k, k });
  };
  const primo = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { adatta(); }, [p.adatta]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (primo.current && dim.w > 100) { primo.current = false; adatta(); } }, [dim]);
  useEffect(() => { if (p.centra?.n) setV(x => x && { ...x, cx: p.centra!.p.x, cy: p.centra!.p.y }); }, [p.centra]);
  useEffect(() => { setPts([]); setDig(""); }, [strumento, piano]);
  const { onBozza } = p;
  useEffect(() => { onBozza?.(pts.length > 0); }, [pts.length, onBozza]);

  const vista = v ?? { cx: 500, cy: 400, k: 0.8 };
  const vb = { x: vista.cx - dim.w / 2 / vista.k, y: vista.cy - dim.h / 2 / vista.k, w: dim.w / vista.k, h: dim.h / vista.k };
  const inPianta = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return { x: vb.x + ((e.clientX - r.left) / r.width) * vb.w, y: vb.y + ((e.clientY - r.top) / r.height) * vb.h };
  };
  const zoom = (f: number) => setV(x => x && { ...x, k: Math.min(20, Math.max(0.05, x.k * f)) });

  /** Dove cade il punto: su un angolo, sulla linea di un muro, oppure sulla griglia (dritto e allineato agli angoli vicini). */
  const aggancia = (q: Pt, fine: boolean, prima?: Pt): Presa => {
    const r = 12 / vista.k;
    let best: Pt | null = null, bd = r;
    for (const w of vertici) { const d = Math.hypot(w.x - q.x, w.y - q.y); if (d < bd) { bd = d; best = w; } }
    if (best) return { p: best, tipo: "vertice" };
    bd = r * 0.8;
    for (const { s: [a, b] } of tratti) {
      const d = distSeg(q, a, b);
      if (d >= bd) continue;
      const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2, t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / L2));
      bd = d;
      best = { x: r1(a.x + t * (b.x - a.x)), y: r1(a.y + t * (b.y - a.y)) };
    }
    if (best) return { p: best, tipo: "linea" };
    const passo = fine ? 1 : 5;
    const s = { x: Math.round(q.x / passo) * passo, y: Math.round(q.y / passo) * passo };
    let fx = false, fy = false, gx: Pt | undefined, gy: Pt | undefined;
    if (prima) {                                                        // quasi in squadra: dritto
      const dx = s.x - prima.x, dy = s.y - prima.y;
      if (Math.abs(dx) < Math.abs(dy) * 0.18) { s.x = prima.x; fx = true; } else if (Math.abs(dy) < Math.abs(dx) * 0.18) { s.y = prima.y; fy = true; }
    }
    for (const w of vertici) {                                          // allineato a un angolo esistente
      if (!fx && Math.abs(w.x - q.x) < r * 0.7 && (!gx || Math.abs(w.y - q.y) < Math.abs(gx.y - q.y))) { s.x = w.x; gx = w; }
      if (!fy && Math.abs(w.y - q.y) < r * 0.7 && (!gy || Math.abs(w.x - q.x) < Math.abs(gy.x - q.x))) { s.y = w.y; gy = w; }
    }
    return { p: s, tipo: "griglia", gx, gy };
  };

  // tastiera durante il disegno del muro: misure, Invio, Backspace, Esc
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select") || !pts.length || (strumento !== "muro" && strumento !== "misura")) return;
      if (/^[0-9.,]$/.test(e.key) && strumento === "muro") { e.preventDefault(); setDig(d => (d + (e.key === "," ? "." : e.key)).slice(0, 7)); return; }
      if (e.key === "Backspace") { e.preventDefault(); if (dig) setDig(d => d.slice(0, -1)); else setPts(x => x.slice(0, -1)); return; }
      if (e.key === "Escape") { e.preventDefault(); if (dig) setDig(""); else setPts([]); return; }
      if (e.key !== "Enter") return;
      e.preventDefault();
      const L = parseFloat(dig);
      if (dig && L > 0) {                                                // un tratto lungo esattamente L verso il cursore
        const a = pts[pts.length - 1], b = cur?.p ?? (pts.length > 1 ? { x: 2 * a.x - pts[pts.length - 2].x, y: 2 * a.y - pts[pts.length - 2].y } : { x: a.x + 1, y: a.y });
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        setPts([...pts, { x: r1(a.x + ((b.x - a.x) / d) * L), y: r1(a.y + ((b.y - a.y) / d) * L) }]);
        setDig("");
      } else if (strumento === "muro") { if (pts.length >= 2) p.onDisegna?.("muro", pts); setPts([]); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const selEl = p.sel != null ? M.el.find(x => x.riga === p.sel) : undefined;
  const arredoSel = selEl?.tipo === "arredo" ? (selEl as Arredo) : undefined;

  function giu(e: React.PointerEvent<SVGSVGElement>) {
    if (strumento === "muro" && e.button === 2 && pts.length) { setPts(x => x.slice(0, -1)); setDig(""); return; }   // tasto destro: indietro di un punto
    try { svg.current!.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
    dita.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const q = inPianta(e), t = e.target as Element;
    if (dita.current.size === 2) {
      const [a, b] = [...dita.current.values()];
      g.current = { tipo: "pinch", x0: (a.x + b.x) / 2, y0: (a.y + b.y) / 2, p0: q, v0: vista, mosso: true, pinch: Math.hypot(a.x - b.x, a.y - b.y) };
      setDrag(null);
      return;
    }
    const base = { x0: e.clientX, y0: e.clientY, p0: q, v0: vista, mosso: false };
    const spillo = t.closest("[data-nota]");
    if (spillo) { g.current = { ...base, tipo: "nota" }; p.onNota?.(spillo.getAttribute("data-nota")!); return; }
    if (t.closest("[data-giro]") && arredoSel) { g.current = { ...base, tipo: "giro", riga: arredoSel.riga }; setGiro({ riga: arredoSel.riga, gradi: arredoSel.ruota }); return; }
    const man = t.closest("[data-v]");
    if (man && vert === null && p.sel != null) {
      const e0 = M.el.find(x => x.riga === p.sel);
      if (e0 && "punti" in e0) { g.current = { ...base, tipo: "vertice" }; setVert({ riga: p.sel, i: +man.getAttribute("data-v")!, punti: e0.punti }); return; }
    }
    if (e.button === 1 || e.button === 2 || (strumento === "sposta" && !modifica)) { g.current = { ...base, tipo: "pan" }; return; }
    if (strumento === "foto" && t.closest("[data-foto]")) {
      const f = p.foto?.find(x => x.id === t.closest("[data-foto]")!.getAttribute("data-foto"));
      if (f) { g.current = { ...base, tipo: "foto", fx: f.x, fy: f.y }; setFotoDrag({ fid: f.id, x: f.x, y: f.y }); return; }
    }
    if (strumento === "sposta") {
      const el = t.closest("[data-r]");
      if (el) { const riga = +el.getAttribute("data-r")!; g.current = { ...base, tipo: "elemento", riga, el }; p.onSel?.(riga); return; }
      g.current = { ...base, tipo: "pan" };
      return;
    }
    const s = aggancia(q, e.altKey, strumento === "muro" ? pts[pts.length - 1] : undefined).p;
    if (strumento === "stanza" || (strumento === "appunto" && p.modoAppunto !== "punto")) { g.current = { ...base, tipo: "rettangolo" }; setPts([s, s]); return; }
    g.current = { ...base, tipo: "clic" };
  }

  function muovi(e: React.PointerEvent<SVGSVGElement>) {
    const q = inPianta(e);
    setPos(q);
    if (dita.current.has(e.pointerId)) dita.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const G = g.current;
    if (strumento !== "sposta" && strumento !== "foto") setCur(aggancia(q, e.altKey, strumento === "muro" ? pts[pts.length - 1] : undefined));
    if (!G) return;
    if (Math.hypot(e.clientX - G.x0, e.clientY - G.y0) > 4) G.mosso = true;
    if (G.tipo === "pinch" && dita.current.size === 2) {
      const [a, b] = [...dita.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y), k = Math.min(20, Math.max(0.05, G.v0!.k * (d / G.pinch!)));
      const r = svg.current!.getBoundingClientRect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      setV({ k, cx: G.p0.x - (mx - dim.w / 2) / k, cy: G.p0.y - (my - dim.h / 2) / k });
      return;
    }
    if (G.tipo === "pan") { setV({ ...G.v0!, cx: G.v0!.cx - (e.clientX - G.x0) / G.v0!.k, cy: G.v0!.cy - (e.clientY - G.y0) / G.v0!.k }); return; }
    if (G.tipo === "giro" && arredoSel) {                              // il retro guarda verso il cursore: scatti di 15°, Alt per 1°
      const a = (Math.atan2(q.x - arredoSel.a.x, -(q.y - arredoSel.a.y)) * 180) / Math.PI, passo = e.altKey ? 1 : 15;
      setGiro({ riga: arredoSel.riga, gradi: ((Math.round(a / passo) * passo) % 360 + 360) % 360 });
      return;
    }
    if (!G.mosso || !modifica && G.tipo !== "foto") return;
    const passo = e.altKey ? 1 : 5, dx = Math.round((q.x - G.p0.x) / passo) * passo, dy = Math.round((q.y - G.p0.y) / passo) * passo;
    if (G.tipo === "elemento") { G.el?.setAttribute("transform", `translate(${dx} ${dy})`); setDrag({ riga: G.riga!, dx, dy }); }
    if (G.tipo === "vertice" && vert) { const pu = [...vert.punti]; pu[vert.i] = aggancia(q, e.altKey).p; setVert({ ...vert, punti: pu }); }
    if (G.tipo === "foto" && fotoDrag) setFotoDrag({ ...fotoDrag, x: G.fx! + dx, y: G.fy! + dy });
    if (G.tipo === "rettangolo") setPts([pts[0], aggancia(q, e.altKey).p]);
  }

  function su(e: React.PointerEvent<SVGSVGElement>) {
    dita.current.delete(e.pointerId);
    const G = g.current;
    if (!G || (G.tipo === "pinch" && dita.current.size)) return;
    g.current = null;
    const q = inPianta(e);
    if (G.tipo === "pan" && !G.mosso && strumento === "sposta") p.onSel?.(null);
    if (G.tipo === "giro" && giro) { if (giro.gradi !== arredoSel?.ruota) p.onRuota?.(giro.riga, giro.gradi); setGiro(null); }
    if (G.tipo === "elemento") {
      G.el?.removeAttribute("transform");
      if (drag && (drag.dx || drag.dy)) p.onSposta?.(drag.riga, drag.dx, drag.dy);
      setDrag(null);
    }
    if (G.tipo === "vertice" && vert) { if (G.mosso) p.onVertici?.(vert.riga, vert.punti); setVert(null); }
    if (G.tipo === "foto" && fotoDrag) { if (G.mosso) p.onFoto?.(fotoDrag.fid, { x: fotoDrag.x, y: fotoDrag.y }); setFotoDrag(null); }
    if (G.tipo === "rettangolo") {
      const [a, b] = pts;
      setPts([]);
      if (a && b && (Math.abs(b.x - a.x) > 10 || Math.abs(b.y - a.y) > 10) || (p.modoAppunto === "linea" && a && b && Math.hypot(b.x - a.x, b.y - a.y) > 10))
        p.onDisegna?.(strumento, [a, b]);
    }
    if (G.tipo === "clic" && !G.mosso) {
      const s = aggancia(q, e.altKey, strumento === "muro" ? pts[pts.length - 1] : undefined).p;
      const doppio = e.timeStamp - ultimo.current.t < 350 && Math.hypot(e.clientX - ultimo.current.x, e.clientY - ultimo.current.y) < 8;
      ultimo.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      if (strumento === "muro") {
        setDig("");
        const chiude = pts.length >= 2 && Math.hypot(s.x - pts[0].x, s.y - pts[0].y) < 1;
        if (doppio || chiude) {
          const fin = [...pts, ...(Math.hypot(s.x - pts[pts.length - 1].x, s.y - pts[pts.length - 1].y) > 1 ? [s] : [])];
          if (fin.length >= 2) p.onDisegna?.("muro", fin);
          setPts([]);
        } else setPts([...pts, s]);
      } else if (strumento === "misura" || strumento === "calibra") {
        if (pts.length) { p.onDisegna?.(strumento, [pts[0], s]); setPts([]); } else setPts([s]);
      } else p.onDisegna?.(strumento, [strumento === "commento" || strumento === "appunto" ? q : s]);
    }
  }

  function rotella(e: React.WheelEvent<SVGSVGElement>) {
    const q = inPianta(e), k = Math.min(20, Math.max(0.05, vista.k * Math.exp(-e.deltaY * 0.0015)));
    const r = svg.current!.getBoundingClientRect();
    setV({ k, cx: q.x - (e.clientX - r.left - dim.w / 2) / k, cy: q.y - (e.clientY - r.top - dim.h / 2) / k });
  }

  const px = (n: number) => n / vista.k;
  const sel = p.sel != null ? contorno(M, p.sel) : [];
  const maniglie = modifica && strumento === "sposta" && selEl && "punti" in selEl && selEl.tipo !== "tetto" ? (vert?.punti ?? selEl.punti) : [];
  const disegnando = strumento !== "sposta" && strumento !== "foto";
  const poly = (a: Pt[]) => a.map(q => `${q.x},${q.y}`).join(" ");
  const ultimoP = pts[pts.length - 1];
  const t = p.muro?.spessore ?? 20;

  /** Distanze dai muri nelle quattro direzioni, per un arredo dritto (0, 90, 180, 270 gradi). */
  function distanze(a: Arredo, dx: number, dy: number) {
    if (a.ruota % 90) return [];
    const c = { x: a.a.x + dx, y: a.a.y + dy }, giro90 = a.ruota % 180 !== 0, hx = (giro90 ? a.P : a.L) / 2, hy = (giro90 ? a.L : a.P) / 2;
    const out: { a: Pt; b: Pt; v: number }[] = [];
    for (const [ux, uy, h] of [[1, 0, hx], [-1, 0, hx], [0, 1, hy], [0, -1, hy]]) {
      const o = { x: c.x + ux * h, y: c.y + uy * h };
      let best = Infinity;
      for (const { s: [p1, p2], t: sp } of tratti) {
        const ex = p2.x - p1.x, ey = p2.y - p1.y, det = -ux * ey + ex * uy;
        if (Math.abs(det) < 1e-9) continue;
        const qx = p1.x - o.x, qy = p1.y - o.y, tt = (-qx * ey + ex * qy) / det, ss = (ux * qy - uy * qx) / det;
        if (ss < -0.001 || ss > 1.001 || tt <= 0) continue;
        const f = tt - sp / 2;                                          // fino alla faccia del muro
        if (f > -1 && f < best) best = Math.max(0, f);
      }
      if (best >= 1 && best < 1500) out.push({ a: o, b: { x: o.x + ux * best, y: o.y + uy * best }, v: Math.round(best) });
    }
    return out;
  }
  const quote = modifica && arredoSel && strumento === "sposta" && !giro ? distanze(arredoSel, drag?.riga === arredoSel.riga ? drag.dx : 0, drag?.riga === arredoSel.riga ? drag.dy : 0) : [];
  const ruotaPresa = arredoSel && modifica && strumento === "sposta" && !drag ? (() => {
    const gr = ((giro?.gradi ?? arredoSel.ruota) * Math.PI) / 180, d = arredoSel.P / 2 + px(30);
    return { b: { x: arredoSel.a.x + Math.sin(gr) * (arredoSel.P / 2), y: arredoSel.a.y - Math.cos(gr) * (arredoSel.P / 2) }, h: { x: arredoSel.a.x + Math.sin(gr) * d, y: arredoSel.a.y - Math.cos(gr) * d } };
  })() : null;
  const scala = SCALE.find(s => s * vista.k >= 70) ?? 2000;
  const muroSel = selEl?.tipo === "muro" ? (selEl as Muro) : undefined;

  const etichettaPx = (x: number, y: number, testo: string, colore = "var(--accent)") => {
    const w = px(testo.length * 7.2 + 10), h = px(18);
    return <g pointerEvents="none"><rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} style={{ fill: colore }} /><text x={x} y={y} fontSize={px(11.5)} textAnchor="middle" dominantBaseline="central" style={{ fill: "var(--accent-ink)", fontWeight: 600 }}>{testo}</text></g>;
  };

  return (
    <div className="pianta-box">
      <svg ref={svg} className={"pianta" + (disegnando ? " disegno" : "")} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="none"
        onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su} onWheel={rotella} onContextMenu={e => e.preventDefault()}
        onPointerLeave={() => { setCur(null); setPos(null); }} role="img" aria-label={`Pianta, ${M.piani.find(x => x.id === piano)?.nome ?? ""}`}>
        <defs>
          <pattern id="griglia" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" style={{ stroke: "var(--griglia)" }} strokeWidth={px(1)} /></pattern>
        </defs>
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#griglia)" />
        {p.foto?.filter(f => f.visibile && f.piano === piano).map(f => {
          const fx = fotoDrag?.fid === f.id ? fotoDrag.x : f.x, fy = fotoDrag?.fid === f.id ? fotoDrag.y : f.y;
          return <image key={f.id} data-foto={f.id} href={`/api/foto/${f.id}`} x={0} y={0} width={f.w * f.scala} height={f.h * f.scala} opacity={f.opacita}
            transform={`translate(${fx} ${fy}) rotate(${f.rot})`} style={{ cursor: strumento === "foto" ? "move" : undefined, pointerEvents: strumento === "foto" ? "auto" : "none" }} />;
        })}
        <g dangerouslySetInnerHTML={{ __html: disegno }} />
        <g pointerEvents="none">{etichette.map((e, i) => {            // scritte mai più piccole di 11-13 px sullo schermo
          const f = Math.max(e.dim, px(e.dim >= 18 ? 13 : 11));
          const r2 = (n: number) => Math.round(n * 100) / 100;      // stesse cifre sul server e nel browser
          return <text key={i} x={r2(e.x)} y={r2(e.y + (e.dy ?? 0) * f)} fontSize={r2(f)} textAnchor="middle" dominantBaseline="central"
            transform={e.ruota ? `rotate(${r2(e.ruota)} ${r2(e.x)} ${r2(e.y)})` : undefined}
            style={{ fill: e.colore, fontWeight: e.peso, paintOrder: "stroke", stroke: "var(--p-fondo)", strokeWidth: f / 5, strokeLinejoin: "round" }}>{e.testo}</text>;
        })}</g>
        {p.evid?.flatMap(r => contorno(M, r)).map((c, i) => <polygon key={"e" + i} points={poly(c)} className="contorno claude" />)}
        {sel.map((c, i) => <polygon key={"s" + i} points={poly(c)} className="contorno"
          transform={drag ? `translate(${drag.dx} ${drag.dy})` : giro && arredoSel ? `rotate(${giro.gradi - arredoSel.ruota} ${arredoSel.a.x} ${arredoSel.a.y})` : undefined} />)}
        {vert && <polyline points={poly(selEl?.tipo === "muro" ? vert.punti : [...vert.punti, vert.punti[0]])} className="bozza" />}
        {maniglie.map((q, i) => <rect key={i} data-v={i} x={q.x - px(7)} y={q.y - px(7)} width={px(14)} height={px(14)} rx={px(3)} className="maniglia" />)}
        {muroSel && muroSel.fino !== muroSel.altezza && <>
          {etichettaPx(muroSel.punti[0].x, muroSel.punti[0].y - px(20), `A ${muroSel.altezza}`)}
          {etichettaPx(muroSel.punti[muroSel.punti.length - 1].x, muroSel.punti[muroSel.punti.length - 1].y - px(20), `B ${muroSel.fino}`)}
        </>}
        {quote.map((d, i) => {
          const mx = (d.a.x + d.b.x) / 2, my = (d.a.y + d.b.y) / 2;
          return <g key={"q" + i} pointerEvents="none"><line x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} className="quota-viva" />{etichettaPx(mx, my, String(d.v))}</g>;
        })}
        {ruotaPresa && <g data-giro="1" className="giro">
          <line x1={ruotaPresa.b.x} y1={ruotaPresa.b.y} x2={ruotaPresa.h.x} y2={ruotaPresa.h.y} />
          <circle cx={ruotaPresa.h.x} cy={ruotaPresa.h.y} r={px(8)} />
          {giro && etichettaPx(ruotaPresa.h.x, ruotaPresa.h.y - px(22), `${giro.gradi}°`)}
        </g>}
        {p.appunti?.filter(a => a.piano === piano).map(a => (
          <g key={a.id} data-nota={a.id} className="spillo">
            {a.tipo === "linea" && a.b && <line x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} style={{ stroke: COL(a), strokeWidth: 3, vectorEffect: "non-scaling-stroke" }} />}
            {a.tipo === "zona" && a.b && <rect x={Math.min(a.a.x, a.b.x)} y={Math.min(a.a.y, a.b.y)} width={Math.abs(a.b.x - a.a.x)} height={Math.abs(a.b.y - a.a.y)}
              style={{ fill: COL(a), fillOpacity: 0.1, stroke: COL(a), strokeWidth: 2, strokeDasharray: "8 5", vectorEffect: "non-scaling-stroke" }} />}
            <circle cx={a.a.x} cy={a.a.y} r={px(a.id === p.notaSel ? 16 : 13)} style={{ fill: COL(a), stroke: "var(--panel)", strokeWidth: 2, vectorEffect: "non-scaling-stroke" }} />
            <text x={a.a.x} y={a.a.y} fontSize={px(13)} textAnchor="middle" dominantBaseline="central">{a.n}</text>
          </g>
        ))}
        {strumento === "muro" && ultimoP && (() => {                    // il muro che stai tirando, con il suo spessore
          const fine = cur && !dig ? cur.p : null, catena = [...pts, ...(fine ? [fine] : [])];
          return <g pointerEvents="none">
            {catena.slice(1).map((b, i) => <polygon key={i} points={poly(nastro(catena[i], b, t))} className="nastro" />)}
            <polyline points={poly(catena)} className="asse" />
            {pts.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={px(4)} className="nodo" />)}
            {p.muro && p.muro.a !== p.muro.b && <>
              {etichettaPx(pts[0].x, pts[0].y - px(22), `A ${p.muro.a}`)}
              {etichettaPx((fine ?? ultimoP).x, (fine ?? ultimoP).y + px(26), `B ${p.muro.b}`)}
            </>}
          </g>;
        })()}
        {pts.length > 0 && strumento !== "muro" && (strumento === "misura" || strumento === "calibra" || p.modoAppunto === "linea" ? <polyline points={poly([pts[0], pts[1] ?? cur?.p ?? pts[0]])} className="bozza" />
          : pts[1] && <rect x={Math.min(pts[0].x, pts[1].x)} y={Math.min(pts[0].y, pts[1].y)} width={Math.abs(pts[1].x - pts[0].x)} height={Math.abs(pts[1].y - pts[0].y)} className="bozza" />)}
        {pts.length > 0 && pts[1] && strumento === "stanza" && etichettaPx((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, `${Math.abs(pts[1].x - pts[0].x)} × ${Math.abs(pts[1].y - pts[0].y)}`)}
        {disegnando && cur && <g pointerEvents="none">
          {cur.gx && <line x1={cur.gx.x} y1={cur.gx.y} x2={cur.p.x} y2={cur.p.y} className="guida" />}
          {cur.gy && <line x1={cur.gy.x} y1={cur.gy.y} x2={cur.p.x} y2={cur.p.y} className="guida" />}
          {cur.tipo === "vertice" ? <rect x={cur.p.x - px(6)} y={cur.p.y - px(6)} width={px(12)} height={px(12)} className="presa" />
            : cur.tipo === "linea" ? <rect x={cur.p.x - px(5)} y={cur.p.y - px(5)} width={px(10)} height={px(10)} className="presa" transform={`rotate(45 ${cur.p.x} ${cur.p.y})`} />
              : <circle cx={cur.p.x} cy={cur.p.y} r={px(4)} style={{ fill: "var(--accent)" }} />}
        </g>}
        {disegnando && ultimoP && (strumento === "muro" || strumento === "misura" || strumento === "calibra") && (dig || cur) &&
          etichettaPx((cur?.p ?? ultimoP).x + px(dig ? 0 : 34), (cur?.p ?? ultimoP).y - px(dig ? 26 : 16), dig ? `${dig}▍ cm` : `${Math.round(Math.hypot(cur!.p.x - ultimoP.x, cur!.p.y - ultimoP.y))} cm`, dig ? "var(--claude)" : "var(--accent)")}
      </svg>
      <div className="pianta-zoom vetro" role="group" aria-label="Zoom">
        <button type="button" aria-label="Avvicina" onClick={() => zoom(1.3)}>+</button>
        <button type="button" aria-label="Allontana" onClick={() => zoom(1 / 1.3)}>−</button>
        <button type="button" aria-label="Inquadra tutto" onClick={adatta} title="Inquadra tutto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </div>
      <div className="pianta-scala" aria-hidden="true">
        <span className="barra" style={{ width: scala * vista.k }} />
        <span>{scala >= 100 ? `${scala / 100} m` : `${scala} cm`}</span>
        {modifica && pos && <span className="coord">x {Math.round(pos.x)} · y {Math.round(pos.y)}</span>}
      </div>
    </div>
  );
}
