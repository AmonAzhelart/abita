"use client";
// Il grafico dell'altezza libera lungo una linea, da A a B: quanto spazio c'è sopra la testa passo dopo passo,
// con le soglie dei 2 m e dei 2,10 m. Con una quota fissa (quella di A, o scritta a mano) l'altezza si misura da lì
// e si vede anche dove il pavimento sale o scende. Passando sopra il grafico il punto si accende in pianta e in 3D.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { daQuota, piuBasso, type Campione } from "@/lib/altezza";

const metri = (cm: number) => (cm / 100).toFixed(2).replace(".", ",");
const segno = (cm: number) => (cm > 0 ? "+" : cm < 0 ? "−" : "±") + Math.abs(Math.round(cm));

export default function ProfiloAltezza({ L, punti, s, onS, onChiudi, quota, onQuota }: {
  L: number; punti: Campione[]; s: number | null; onS: (s: number | null) => void; onChiudi: () => void;
  /** null: dal pavimento di ogni punto; un numero: dalla quota fissa, in cm dal pavimento del piano. */
  quota: number | null; onQuota: (q: number) => void;
}) {
  const svg = useRef<SVGSVGElement>(null), [w, setW] = useState(600);
  useEffect(() => {
    const el = svg.current!, ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [scritta, setScritta] = useState<string | null>(null);   // la quota mentre la scrivi
  const fisso = quota !== null, val = punti.map(c => daQuota(c, quota));
  const tono = (i: number) => { const v = val[i].v!; return !fisso && !punti[i].piedi ? "grigio" : v < 200 ? "basso" : v < 210 ? "giusto" : "ok"; };
  const H = 170, ml = 44, mr = 12, mt = 16, mb = 22;
  const alti = val.flatMap(x => (x.v === null ? [] : [x.v])), bassi = val.map(x => x.f);
  const top = Math.max(260, Math.ceil((Math.max(0, ...alti) + 30) / 50) * 50), fondo = Math.min(0, Math.floor((Math.min(0, ...bassi, ...alti) - 10) / 50) * 50);
  const x = (v: number) => ml + (v / L) * (w - ml - mr), y = (v: number) => H - mb - ((Math.max(fondo, Math.min(v, top)) - fondo) / (top - fondo)) * (H - mt - mb);
  const passoX = L > 1500 ? 200 : 100;
  const min = piuBasso(punti, quota), iMin = min ? punti.indexOf(min) : -1;
  const iQui = s === null ? -1 : punti.reduce((m, c, i) => (Math.abs(c.s - s) < Math.abs(punti[m].s - s) ? i : m), 0);
  const i0 = iQui >= 0 ? iQui : iMin, info = i0 >= 0 ? punti[i0] : null;
  const r = (n: number) => Math.round(n * 10) / 10;

  let area = "";                                               // lo spazio tra il pavimento (o la quota) e il soffitto, a tratti
  for (let i = 0; i < punti.length; i++) {
    if (val[i].v === null) continue;
    let j = i;
    while (j + 1 < punti.length && val[j + 1].v !== null) j++;
    const giu = (k: number) => (fisso ? Math.max(0, val[k].f) : 0);   // con la quota fissa il pieno parte dalla quota o dal pavimento se è più alto
    area += `M${r(x(punti[i].s))} ${r(y(giu(i)))}`;
    for (let k = i; k <= j; k++) area += `L${r(x(punti[k].s))} ${r(y(val[k].v!))}`;
    for (let k = j; k >= i; k--) area += `L${r(x(punti[k].s))} ${r(y(giu(k)))}`;
    area += "Z";
    i = j;
  }
  const pav = fisso ? punti.map((c, i) => `${i ? "L" : "M"}${r(x(c.s))} ${r(y(val[i].f))}`).join("") : "";
  const muovi = (e: PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    onS(Math.max(0, Math.min(L, ((e.clientX - b.left - ml) / (w - ml - mr)) * L)));
  };
  const passoY = top - fondo > 600 ? 100 : 50;
  const tacche = Array.from({ length: Math.floor((top - fondo) / passoY) + 1 }, (_, i) => fondo + i * passoY);
  const vi = info ? val[i0] : null;

  return (
    <div className="sezione-scheda profilo-scheda vetro" role="region" aria-label="Altezza libera lungo la linea">
      <header>
        <span><span className="etichetta">{fisso ? "Altezza dalla quota di A" : "Altezza lungo A–B"}</span> <span className="tenue piccolo">lunga {metri(L)} m{min ? `, la più bassa ${metri(daQuota(min, quota).v!)} m` : ""}</span></span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {fisso && <label className="mini-campo" title="La quota da cui misurare, in cm dal pavimento del piano">Quota A
            <input className="mini" inputMode="numeric" value={scritta ?? String(quota)} aria-label="Quota fissa in cm dal pavimento del piano"
              onChange={e => { setScritta(e.target.value); const v = parseFloat(e.target.value.replace(",", ".")); if (Number.isFinite(v)) onQuota(Math.round(v)); }}
              onBlur={() => setScritta(null)} /> cm</label>}
          <button className="btn piccolo" onClick={onChiudi} aria-label="Chiudi">✕</button>
        </span>
      </header>
      <svg ref={svg} className="profilo-svg" height={H} onPointerMove={muovi} onPointerDown={muovi} onPointerLeave={() => onS(null)}
        role="img" aria-label={`Altezza libera lungo ${metri(L)} m${min ? `, minimo ${metri(daQuota(min, quota).v!)} m` : ""}`}>
        {tacche.map(v => <g key={v}>
          <line className={"pf-griglia" + (v === 0 && fisso ? " zero" : "")} x1={ml} x2={w - mr} y1={y(v)} y2={y(v)} />
          {v % 100 === 0 && <text x={ml - 6} y={y(v)} textAnchor="end" dominantBaseline="central">{fisso && v ? (v > 0 ? "+" : "−") : ""}{Math.abs(v / 100)} m</text>}
        </g>)}
        {punti.map((c, i) => {                                 // dove non c'è soffitto (buco, cielo aperto) resta vuoto
          const d = punti[i + 1];
          return val[i].v === null && d ? <rect key={"v" + i} className="pf-vuoto" x={x(c.s)} y={mt} width={Math.max(0, x(d.s) - x(c.s))} height={H - mt - mb} /> : null;
        })}
        <path className="pf-area" d={area} />
        {fisso && <path className="pf-pavimento" d={pav} />}
        <line className="pf-soglia basso" x1={ml} x2={w - mr} y1={y(200)} y2={y(200)} />
        <line className="pf-soglia giusto" x1={ml} x2={w - mr} y1={y(210)} y2={y(210)} />
        {punti.slice(1).map((d, i) => val[i].v !== null && val[i + 1].v !== null
          ? <line key={i} className={"pf-linea " + tono(i)} x1={x(punti[i].s)} y1={y(val[i].v!)} x2={x(d.s)} y2={y(val[i + 1].v!)} /> : null)}
        {Array.from({ length: Math.floor(L / passoX) + 1 }, (_, i) => i * passoX).map(v => (
          <text key={v} x={x(v)} y={H - 6} textAnchor="middle">{v === 0 ? "A" : `${v / 100} m`}</text>
        ))}
        <text x={x(L)} y={H - 6} textAnchor="end" className="pf-capo">B</text>
        {min && iQui < 0 && <g className={"pf-min " + tono(iMin)}>
          <circle cx={x(min.s)} cy={y(val[iMin].v!)} r={4} />
          <text x={x(min.s)} y={y(val[iMin].v!) - 9} textAnchor="middle">{metri(val[iMin].v!)}</text>
        </g>}
        {iQui >= 0 && <g className="pf-qui">
          <line x1={x(punti[iQui].s)} x2={x(punti[iQui].s)} y1={mt} y2={H - mb} />
          {val[iQui].v !== null && <circle cx={x(punti[iQui].s)} cy={y(val[iQui].v!)} r={4.5} className={tono(iQui)} />}
        </g>}
      </svg>
      {info && vi && <p className="profilo-info">
        <b>{info.buco && !fisso ? "Buco nel pavimento" : vi.v === null ? "Aperto" : `${metri(vi.v)} m`}</b>
        <span className="tenue"> a {metri(info.s)} m da A{iQui >= 0 ? "" : ", il punto più basso"}{fisso && vi.v !== null ? ", sopra la quota di A" : ""}.</span>
        {fisso ? <> Soffitto: {info.sopra || "niente, è aperto"}. {info.buco ? "Sotto c'è il buco del pavimento." : vi.f ? `Il pavimento qui è ${segno(vi.f)} cm rispetto ad A.` : "Il pavimento qui è alla quota di A."}</>
          : !info.buco && <> Sotto: {info.sotto}. Sopra: {info.sopra}.</>}
      </p>}
    </div>
  );
}
