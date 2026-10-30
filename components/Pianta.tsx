"use client";
// La pianta interattiva: zoom con la rotella o due dita, trascina per spostarti, clic per scegliere,
// trascina un elemento per spostarlo. Gli attrezzi di disegno restituiscono punti in cm al genitore.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Modello, Pt } from "@/lib/lingua";
import type { Esito } from "@/lib/passaggi";
import { contorno, disegnaPianta, riquadro } from "@/lib/pianta";
import type { Appunto, Foto } from "@/lib/progetti";

export type Strumento = "sposta" | "muro" | "stanza" | "porta" | "finestra" | "arredo" | "misura" | "appunto" | "calibra" | "foto" | "commento";
type Props = {
  modello: Modello; piano: string; quote?: boolean; passaggi?: Esito | null; modifica?: boolean;
  strumento?: Strumento; modoAppunto?: "punto" | "linea" | "zona";
  sel?: number | null; evid?: number[]; appunti?: (Appunto & { n: number })[]; notaSel?: string | null;
  foto?: Foto[]; fotoAttiva?: string | null; centra?: { p: Pt; n: number }; adatta?: number;
  onSel?: (riga: number | null) => void; onSposta?: (riga: number, dx: number, dy: number) => void;
  onVertici?: (riga: number, punti: Pt[]) => void; onDisegna?: (cosa: Strumento, punti: Pt[]) => void;
  onNota?: (id: string) => void; onFoto?: (fid: string, campi: Partial<Foto>) => void;
};
type Vista = { cx: number; cy: number; k: number };
const COL = (a: Appunto) => (a.stato === "fatta" ? "var(--fatta)" : a.da === "cliente" ? "var(--cliente)" : a.da === "claude" ? "var(--claude)" : "var(--nota)");

export default function Pianta(p: Props) {
  const { modello: M, piano, strumento = "sposta", modifica = false } = p;
  const svg = useRef<SVGSVGElement>(null), [dim, setDim] = useState({ w: 800, h: 600 });
  const [v, setV] = useState<Vista | null>(null);
  const [cur, setCur] = useState<Pt | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);                         // punti del disegno in corso
  const [drag, setDrag] = useState<{ riga: number; dx: number; dy: number } | null>(null);
  const [vert, setVert] = useState<{ riga: number; i: number; punti: Pt[] } | null>(null);
  const [fotoDrag, setFotoDrag] = useState<{ fid: string; x: number; y: number } | null>(null);
  const g = useRef<{ tipo: string; x0: number; y0: number; p0: Pt; v0?: Vista; mosso: boolean; riga?: number; el?: Element | null; pinch?: number; fx?: number; fy?: number } | null>(null);
  const dita = useRef(new Map<number, { x: number; y: number }>());
  const ultimo = useRef({ t: 0, x: 0, y: 0 });

  const { svg: disegno, etichette } = useMemo(() => disegnaPianta(M, { piano, quote: p.quote, passaggi: p.passaggi, testo: false }), [M, piano, p.quote, p.passaggi]);

  useEffect(() => {
    const el = svg.current!;
    const ro = new ResizeObserver(() => setDim({ w: el.clientWidth || 800, h: el.clientHeight || 600 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const adatta = () => {
    const b = riquadro(M), k = Math.min(dim.w / b.w, (dim.h - 90) / b.h);
    setV({ cx: b.x + b.w / 2, cy: b.y + b.h / 2 + 30 / k, k });
  };
  const primo = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { adatta(); }, [p.adatta]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (primo.current && dim.w > 100) { primo.current = false; adatta(); } }, [dim]);
  useEffect(() => { if (p.centra?.n) setV(x => x && { ...x, cx: p.centra!.p.x, cy: p.centra!.p.y }); }, [p.centra]);
  useEffect(() => { setPts([]); }, [strumento, piano]);

  const vista = v ?? { cx: 500, cy: 400, k: 0.8 };
  const vb = { x: vista.cx - dim.w / 2 / vista.k, y: vista.cy - dim.h / 2 / vista.k, w: dim.w / vista.k, h: dim.h / vista.k };
  const inPianta = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return { x: vb.x + ((e.clientX - r.left) / r.width) * vb.w, y: vb.y + ((e.clientY - r.top) / r.height) * vb.h };
  };
  const vertici = useMemo(() => M.el.filter(e => e.piano === piano).flatMap(e => e.tipo === "muro" || e.tipo === "stanza" || e.tipo === "area" ? e.punti : []), [M, piano]);
  const aggancia = (q: Pt, fine: boolean, prima?: Pt): Pt => {
    const r = 12 / vista.k;
    let best: Pt | null = null, bd = r;
    for (const w of vertici) { const d = Math.hypot(w.x - q.x, w.y - q.y); if (d < bd) { bd = d; best = w; } }
    if (best) return best;
    const passo = fine ? 1 : 5;
    let s = { x: Math.round(q.x / passo) * passo, y: Math.round(q.y / passo) * passo };
    if (prima) {                                                        // quasi in squadra: dritto
      const dx = s.x - prima.x, dy = s.y - prima.y;
      if (Math.abs(dx) < Math.abs(dy) * 0.18) s = { x: prima.x, y: s.y };
      else if (Math.abs(dy) < Math.abs(dx) * 0.18) s = { x: s.x, y: prima.y };
    }
    return s;
  };

  const finisciMuro = () => {
    if (pts.length >= 2) p.onDisegna?.("muro", pts);
    setPts([]);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!pts.length) return;
      if (e.key === "Enter") { e.preventDefault(); finisciMuro(); }
      if (e.key === "Escape") setPts([]);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  function giu(e: React.PointerEvent<SVGSVGElement>) {
    svg.current!.setPointerCapture(e.pointerId);
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
    const s = aggancia(q, e.altKey, strumento === "muro" ? pts[pts.length - 1] : undefined);
    if (strumento === "stanza" || (strumento === "appunto" && p.modoAppunto !== "punto")) { g.current = { ...base, tipo: "rettangolo" }; setPts([s, s]); return; }
    g.current = { ...base, tipo: "clic" };
  }

  function muovi(e: React.PointerEvent<SVGSVGElement>) {
    const q = inPianta(e);
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
    if (!G.mosso || !modifica && G.tipo !== "foto") return;
    const passo = e.altKey ? 1 : 5, dx = Math.round((q.x - G.p0.x) / passo) * passo, dy = Math.round((q.y - G.p0.y) / passo) * passo;
    if (G.tipo === "elemento") { G.el?.setAttribute("transform", `translate(${dx} ${dy})`); setDrag({ riga: G.riga!, dx, dy }); }
    if (G.tipo === "vertice" && vert) { const pu = [...vert.punti]; pu[vert.i] = aggancia(q, e.altKey); setVert({ ...vert, punti: pu }); }
    if (G.tipo === "foto" && fotoDrag) setFotoDrag({ ...fotoDrag, x: G.fx! + dx, y: G.fy! + dy });
    if (G.tipo === "rettangolo") setPts([pts[0], aggancia(q, e.altKey)]);
  }

  function su(e: React.PointerEvent<SVGSVGElement>) {
    dita.current.delete(e.pointerId);
    const G = g.current;
    if (!G || (G.tipo === "pinch" && dita.current.size)) return;
    g.current = null;
    const q = inPianta(e);
    if (G.tipo === "pan" && !G.mosso && strumento === "sposta") p.onSel?.(null);
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
      const s = aggancia(q, e.altKey, strumento === "muro" ? pts[pts.length - 1] : undefined);
      const doppio = e.timeStamp - ultimo.current.t < 350 && Math.hypot(e.clientX - ultimo.current.x, e.clientY - ultimo.current.y) < 8;
      ultimo.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      if (strumento === "muro") {
        if (doppio || (pts.length >= 2 && Math.hypot(s.x - pts[0].x, s.y - pts[0].y) < 1)) { const fin = [...pts, ...(Math.hypot(s.x - pts[pts.length - 1].x, s.y - pts[pts.length - 1].y) > 1 ? [s] : [])]; if (fin.length >= 2) p.onDisegna?.("muro", fin); setPts([]); }
        else setPts([...pts, s]);
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
  const selEl = p.sel != null ? M.el.find(x => x.riga === p.sel) : undefined;
  const maniglie = modifica && strumento === "sposta" && selEl && "punti" in selEl && selEl.tipo !== "tetto" ? (vert?.punti ?? selEl.punti) : [];
  const disegnando = strumento !== "sposta" && strumento !== "foto";
  const poly = (a: Pt[]) => a.map(q => `${q.x},${q.y}`).join(" ");

  return (
    <svg ref={svg} className={"pianta" + (disegnando ? " disegno" : "")} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="none"
      onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su} onWheel={rotella} onContextMenu={e => e.preventDefault()}
      onPointerLeave={() => setCur(null)} role="img" aria-label={`Pianta, ${M.piani.find(x => x.id === piano)?.nome ?? ""}`}>
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
      <g pointerEvents="none">{etichette.map((t, i) => {            // scritte mai più piccole di 11-13 px sullo schermo
        const f = Math.max(t.dim, px(t.dim >= 18 ? 13 : 11));
        const r2 = (n: number) => Math.round(n * 100) / 100;      // stesse cifre sul server e nel browser
        return <text key={i} x={r2(t.x)} y={r2(t.y + (t.dy ?? 0) * f)} fontSize={r2(f)} textAnchor="middle" dominantBaseline="central"
          transform={t.ruota ? `rotate(${r2(t.ruota)} ${r2(t.x)} ${r2(t.y)})` : undefined}
          style={{ fill: t.colore, fontWeight: t.peso, paintOrder: "stroke", stroke: "var(--p-fondo)", strokeWidth: f / 5, strokeLinejoin: "round" }}>{t.testo}</text>;
      })}</g>
      {p.evid?.flatMap(r => contorno(M, r)).map((c, i) => <polygon key={"e" + i} points={poly(c)} className="contorno claude" />)}
      {sel.map((c, i) => <polygon key={"s" + i} points={poly(c)} className="contorno" transform={drag ? `translate(${drag.dx} ${drag.dy})` : undefined} />)}
      {vert && <polyline points={poly(selEl?.tipo === "muro" ? vert.punti : [...vert.punti, vert.punti[0]])} className="bozza" />}
      {maniglie.map((q, i) => <rect key={i} data-v={i} x={q.x - px(7)} y={q.y - px(7)} width={px(14)} height={px(14)} rx={px(3)} className="maniglia" />)}
      {p.appunti?.filter(a => a.piano === piano).map(a => (
        <g key={a.id} data-nota={a.id} className="spillo">
          {a.tipo === "linea" && a.b && <line x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} style={{ stroke: COL(a), strokeWidth: 3, vectorEffect: "non-scaling-stroke" }} />}
          {a.tipo === "zona" && a.b && <rect x={Math.min(a.a.x, a.b.x)} y={Math.min(a.a.y, a.b.y)} width={Math.abs(a.b.x - a.a.x)} height={Math.abs(a.b.y - a.a.y)}
            style={{ fill: COL(a), fillOpacity: 0.1, stroke: COL(a), strokeWidth: 2, strokeDasharray: "8 5", vectorEffect: "non-scaling-stroke" }} />}
          <circle cx={a.a.x} cy={a.a.y} r={px(a.id === p.notaSel ? 16 : 13)} style={{ fill: COL(a), stroke: "var(--panel)", strokeWidth: 2, vectorEffect: "non-scaling-stroke" }} />
          <text x={a.a.x} y={a.a.y} fontSize={px(13)} textAnchor="middle" dominantBaseline="central">{a.n}</text>
        </g>
      ))}
      {pts.length > 0 && (strumento === "muro" ? <polyline points={poly([...pts, ...(cur ? [cur] : [])])} className="bozza" style={{ fill: "none" }} />
        : strumento === "misura" || strumento === "calibra" || p.modoAppunto === "linea" ? <polyline points={poly([pts[0], pts[1] ?? cur ?? pts[0]])} className="bozza" />
          : pts[1] && <rect x={Math.min(pts[0].x, pts[1].x)} y={Math.min(pts[0].y, pts[1].y)} width={Math.abs(pts[1].x - pts[0].x)} height={Math.abs(pts[1].y - pts[0].y)} className="bozza" />)}
      {pts.length > 0 && pts[1] && strumento === "stanza" && <text x={(pts[0].x + pts[1].x) / 2} y={(pts[0].y + pts[1].y) / 2} fontSize={px(14)} textAnchor="middle" style={{ fill: "var(--accent)", fontWeight: 600 }}>{Math.abs(pts[1].x - pts[0].x)} × {Math.abs(pts[1].y - pts[0].y)}</text>}
      {disegnando && cur && <circle cx={cur.x} cy={cur.y} r={px(4)} style={{ fill: "var(--accent)" }} pointerEvents="none" />}
      {disegnando && cur && pts.length > 0 && (strumento === "muro" || strumento === "misura" || strumento === "calibra") && (
        <text x={cur.x + px(10)} y={cur.y - px(10)} fontSize={px(13)} style={{ fill: "var(--accent)", fontWeight: 600 }} pointerEvents="none">{Math.round(Math.hypot(cur.x - pts[pts.length - 1].x, cur.y - pts[pts.length - 1].y))} cm</text>
      )}
    </svg>
  );
}
