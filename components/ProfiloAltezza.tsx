"use client";
// Il grafico dell'altezza libera lungo una linea, da A a B: quanto spazio c'è sopra la testa passo dopo passo,
// con le soglie dei 2 m e dei 2,10 m. Passando sopra il grafico il punto si accende anche in pianta e in 3D.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Campione } from "@/lib/altezza";

const metri = (cm: number) => (cm / 100).toFixed(2).replace(".", ",");
const tono = (c: Campione) => (!c.piedi ? "grigio" : c.libera! < 200 ? "basso" : c.libera! < 210 ? "giusto" : "ok");

export default function ProfiloAltezza({ L, punti, s, onS, onChiudi }: { L: number; punti: Campione[]; s: number | null; onS: (s: number | null) => void; onChiudi: () => void }) {
  const svg = useRef<SVGSVGElement>(null), [w, setW] = useState(600);
  useEffect(() => {
    const el = svg.current!, ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 170, ml = 40, mr = 12, mt = 16, mb = 22;
  const alte = punti.flatMap(c => (c.libera === null ? [] : [c.libera]));
  const top = Math.max(260, Math.ceil((Math.max(0, ...alte) + 30) / 50) * 50);
  const x = (v: number) => ml + (v / L) * (w - ml - mr), y = (v: number) => H - mb - (Math.min(v, top) / top) * (H - mt - mb);
  const passoX = L > 1500 ? 200 : 100;
  const min = punti.filter(c => c.piedi && c.libera !== null).sort((a, b) => a.libera! - b.libera!)[0];
  const qui = s === null ? null : punti.reduce((m, c) => (Math.abs(c.s - s) < Math.abs(m.s - s) ? c : m), punti[0]);
  const info = qui ?? min;
  const r = (n: number) => Math.round(n * 10) / 10;

  let area = "";                                               // il pieno sotto la linea, a tratti dove c'è un soffitto
  for (let i = 0; i < punti.length; i++) {
    const c = punti[i];
    if (c.libera === null) continue;
    if (i === 0 || punti[i - 1].libera === null) area += `M${r(x(c.s))} ${r(y(0))}`;
    area += `L${r(x(c.s))} ${r(y(c.libera))}`;
    if (i === punti.length - 1 || punti[i + 1].libera === null) area += `L${r(x(c.s))} ${r(y(0))}Z`;
  }
  const muovi = (e: PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    onS(Math.max(0, Math.min(L, ((e.clientX - b.left - ml) / (w - ml - mr)) * L)));
  };

  return (
    <div className="sezione-scheda profilo-scheda vetro" role="region" aria-label="Altezza libera lungo la linea">
      <header>
        <span><span className="etichetta">Altezza lungo A–B</span> <span className="tenue piccolo">lunga {metri(L)} m{min ? `, la più bassa ${metri(min.libera!)} m` : ""}</span></span>
        <button className="btn piccolo" onClick={onChiudi} aria-label="Chiudi">✕</button>
      </header>
      <svg ref={svg} className="profilo-svg" height={H} onPointerMove={muovi} onPointerDown={muovi} onPointerLeave={() => onS(null)}
        role="img" aria-label={`Altezza libera lungo ${metri(L)} m${min ? `, minimo ${metri(min.libera!)} m` : ""}`}>
        {Array.from({ length: Math.floor(top / 50) + 1 }, (_, i) => i * 50).map(v => <g key={v}>
          <line className="pf-griglia" x1={ml} x2={w - mr} y1={y(v)} y2={y(v)} />
          {v % 100 === 0 && <text x={ml - 6} y={y(v)} textAnchor="end" dominantBaseline="central">{v / 100} m</text>}
        </g>)}
        {punti.map((c, i) => {                                 // dove non c'è soffitto (buco, cielo aperto) resta vuoto
          const d = punti[i + 1];
          return c.libera === null && d ? <rect key={"v" + i} className="pf-vuoto" x={x(c.s)} y={mt} width={Math.max(0, x(d.s) - x(c.s))} height={H - mt - mb} /> : null;
        })}
        <path className="pf-area" d={area} />
        <line className="pf-soglia basso" x1={ml} x2={w - mr} y1={y(200)} y2={y(200)} />
        <line className="pf-soglia giusto" x1={ml} x2={w - mr} y1={y(210)} y2={y(210)} />
        {punti.slice(1).map((d, i) => {
          const c = punti[i];
          return c.libera !== null && d.libera !== null ? <line key={i} className={"pf-linea " + tono(c)} x1={x(c.s)} y1={y(c.libera)} x2={x(d.s)} y2={y(d.libera)} /> : null;
        })}
        {Array.from({ length: Math.floor(L / passoX) + 1 }, (_, i) => i * passoX).map(v => (
          <text key={v} x={x(v)} y={H - 6} textAnchor="middle">{v === 0 ? "A" : `${v / 100} m`}</text>
        ))}
        <text x={x(L)} y={H - 6} textAnchor="end" className="pf-capo">B</text>
        {min && !qui && <g className={"pf-min " + tono(min)}>
          <circle cx={x(min.s)} cy={y(min.libera!)} r={4} />
          <text x={x(min.s)} y={y(min.libera!) - 9} textAnchor="middle">{metri(min.libera!)}</text>
        </g>}
        {qui && <g className="pf-qui">
          <line x1={x(qui.s)} x2={x(qui.s)} y1={mt} y2={H - mb} />
          {qui.libera !== null && <circle cx={x(qui.s)} cy={y(qui.libera)} r={4.5} className={tono(qui)} />}
        </g>}
      </svg>
      {info && <p className="profilo-info">
        <b>{info.buco ? "Buco nel pavimento" : info.libera === null ? "Aperto" : `${metri(info.libera)} m`}</b>
        <span className="tenue"> a {metri(info.s)} m da A{qui ? "" : ", il punto più basso"}.</span>
        {!info.buco && <> Sotto: {info.sotto}. Sopra: {info.sopra}.</>}
      </p>}
    </div>
  );
}
