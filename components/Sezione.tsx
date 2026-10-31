"use client";
// La sezione verticale: la casa tagliata lungo la linea tracciata in pianta, A a sinistra e B a destra.
// Pieno scuro quello che il taglio attraversa (solai, muri, scale, tetti), chiaro gli arredi, in blu l'altezza libera.
import { useEffect, useRef, useState } from "react";
import type { Sezione } from "@/lib/sezione";

const metri = (cm: number) => (cm / 100).toFixed(2).replace(".", ",");
const r = (n: number) => Math.round(n * 10) / 10;

export default function VistaSezione({ s, onInverti, onChiudi }: { s: Sezione; onInverti: () => void; onChiudi: () => void }) {
  const svg = useRef<SVGSVGElement>(null), [dim, setDim] = useState({ w: 880, h: 400 });
  useEffect(() => {
    const el = svg.current!, ro = new ResizeObserver(() => setDim({ w: el.clientWidth || 880, h: el.clientHeight || 400 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = s.L, H = s.z1 - s.z0, fs = 11 * Math.max((W * 1.25) / dim.w, (H * 1.3) / dim.h);   // 11 px sullo schermo, più o meno
  const sx = fs * 6.5, dx = fs * 1.5, sopra = fs * 2.6, sotto = fs * 1.2;
  const vb = `${r(-sx)} ${r(-(s.z1 + sopra))} ${r(W + sx + dx)} ${r(H + sopra + sotto)}`;
  let d = "";
  for (let i = 0; i + 3 < s.tagli.length; i += 4) d += `M${r(s.tagli[i])} ${r(-s.tagli[i + 1])}L${r(s.tagli[i + 2])} ${r(-s.tagli[i + 3])}`;
  const min = s.quote.filter(q => q.scala).sort((a, b) => a.libera - b.libera)[0];
  // la quota di una stanza che cade addosso a quella di una scala si toglie: conta la scala
  const quote = s.quote.filter(q => q.scala || !s.quote.some(o => o.scala && Math.abs(o.s - q.s) < fs * 5 && o.z0 < q.z1 && q.z0 < o.z1));
  return (
    <div className="sezione-scheda vetro" role="region" aria-label="Sezione verticale">
      <header>
        <span><span className="etichetta">Sezione A–B</span> <span className="tenue piccolo">lunga {metri(s.L)} m{min ? `, sulla scala restano ${metri(min.libera)} m sopra la testa` : ""}</span></span>
        <span style={{ display: "flex", gap: 6 }}>
          <button className="btn piccolo" onClick={onInverti} title="Guarda dall'altra parte">Inverti</button>
          <button className="btn piccolo" onClick={onChiudi} aria-label="Chiudi">✕</button>
        </span>
      </header>
      <svg ref={svg} className="sezione-svg" viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Sezione lunga ${metri(s.L)} m`}>
        {s.piani.map(p => <g key={p.nome} className="sez-piano">
          <line x1={-fs * 0.6} x2={W} y1={-p.z} y2={-p.z} />
          <text x={-fs} y={-p.z} fontSize={fs} textAnchor="end" dominantBaseline="central">{p.nome} {p.z > 0 ? "+" : p.z < 0 ? "−" : "±"}{Math.abs(p.z)}</text>
        </g>)}
        {s.pezzi.map((p, i) => <polygon key={i} className={"sez-" + p.cosa} points={p.p.map(([x, z]) => `${r(x)},${r(-z)}`).join(" ")} />)}
        {d && <path className="sez-taglio" d={d} />}
        {s.nomi.map((n, i) => <text key={i} className="sez-nome" x={r(n.s)} y={r(-(n.z + fs * 0.9))} fontSize={fs * 0.95} textAnchor="middle">{n.testo}</text>)}
        {quote.map((q, i) => {
          const cls = "sez-quota" + (q.libera < 200 ? " basso" : q.libera < 210 ? " giusto" : ""), y = -(q.z0 + q.z1) / 2, t = `${metri(q.libera)} m`, w = fs * (t.length * 0.62 + 0.8);
          return <g key={i} className={cls}>
            <line x1={q.s} x2={q.s} y1={-q.z0} y2={-q.z1} />
            <line x1={q.s - fs * 0.4} x2={q.s + fs * 0.4} y1={-q.z0} y2={-q.z0} /><line x1={q.s - fs * 0.4} x2={q.s + fs * 0.4} y1={-q.z1} y2={-q.z1} />
            <rect x={q.s - w / 2} y={y - fs * 0.8} width={w} height={fs * 1.6} rx={fs * 0.8} />
            <text x={q.s} y={y} fontSize={fs} textAnchor="middle" dominantBaseline="central">{t}</text>
          </g>;
        })}
        {[["A", 0], ["B", W]].map(([t, x]) => <text key={t} className="sez-capo" x={x} y={-(s.z1 + sopra * 0.45)} fontSize={fs * 1.1} textAnchor="middle">{t}</text>)}
      </svg>
    </div>
  );
}
