"use client";
// La pianta in scala da stampare o salvare in PDF: un foglio per piano, con cartiglio, superfici e scala grafica.
// Le misure sul foglio sono vere: a 1:50 un metro è 2 cm di carta.
import Link from "next/link";
import { useMemo, useState } from "react";
import { leggi, type ModelloInfo } from "@/lib/lingua";
import { CHIARO, disegnaPianta, riquadro } from "@/lib/pianta";
import { riepilogo } from "@/lib/verifiche";

const FOGLI = { A4: [297, 210], A3: [420, 297] } as const;     // orizzontali, in mm
const SCALE = [20, 50, 100, 200, 500];
const MARGINE = 10, CARTIGLIO = 22;                          // mm
const m2 = (v: number) => v.toFixed(1).replace(".", ",");

type Props = { id: string; nome: string; cliente: string; testo: string; modelli: Record<string, ModelloInfo>; piano?: string };

export default function Stampa({ id, nome, cliente, testo, modelli, piano }: Props) {
  const M = useMemo(() => leggi(testo, modelli), [testo, modelli]);
  const rie = useMemo(() => riepilogo(M), [M]);
  const [foglio, setFoglio] = useState<keyof typeof FOGLI>("A4");
  const [scelta, setScelta] = useState<number | "auto">("auto");
  const [quali, setQuali] = useState<string[]>(() => (piano && M.piani.some(p => p.id === piano) ? [piano] : M.piani.map(p => p.id)));
  const [W, H] = FOGLI[foglio], aw = W - 2 * MARGINE, ah = H - 2 * MARGINE - CARTIGLIO;
  const oggi = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

  const fogli = M.piani.filter(p => quali.includes(p.id)).map(P => {
    const b = riquadro(M, P.id), entra = SCALE.find(s => (b.w * 10) / s <= aw && (b.h * 10) / s <= ah) ?? 500;
    const scala = scelta === "auto" ? entra : scelta, { svg, etichette } = disegnaPianta(M, { piano: P.id, colori: CHIARO, quote: true, sotto: false, testo: false });
    return { P, b, scala, svg, etichette, esce: scala < entra, utile: rie.piani.find(x => x.id === P.id)?.utile ?? 0 };
  });

  return (
    <div className="stampa">
      <style>{`@page { size: ${foglio} landscape; margin: 0 }`}</style>
      <div className="stampa-barra vetro">
        <Link className="btn piccolo" href={`/studio/${id}`}>← Editor</Link>
        <div className="segmenti" role="group" aria-label="Foglio">{(Object.keys(FOGLI) as (keyof typeof FOGLI)[]).map(f => <button key={f} aria-pressed={foglio === f} onClick={() => setFoglio(f)}>{f}</button>)}</div>
        <div className="segmenti" role="group" aria-label="Scala">
          <button aria-pressed={scelta === "auto"} onClick={() => setScelta("auto")}>Adatta</button>
          {[50, 100, 200].map(s => <button key={s} aria-pressed={scelta === s} onClick={() => setScelta(s)}>1:{s}</button>)}
        </div>
        <div className="stampa-piani" role="group" aria-label="Piani da stampare">
          {M.piani.map(p => <label key={p.id}><input type="checkbox" checked={quali.includes(p.id)} onChange={e => setQuali(q => (e.target.checked ? [...q, p.id] : q.filter(x => x !== p.id)))} />{p.nome}</label>)}
        </div>
        <span className="spazio" />
        <button className="btn primario" onClick={() => window.print()} disabled={!fogli.length}>Stampa o salva PDF</button>
      </div>
      {!fogli.length && <p className="tenue">Scegli almeno un piano.</p>}
      {fogli.map(({ P, b, scala, svg, etichette, esce, utile }) => {
        const w = (b.w * 10) / scala, h = (b.h * 10) / scala, f = scala / 50, metro = 1000 / scala, passi = scala >= 200 ? [0, 2, 4, 6] : [0, 1, 2, 3];
        return (
          <section key={P.id} className="tavola" style={{ width: `${W}mm`, height: `${H}mm` }} aria-label={`Foglio del piano ${P.nome}`}>
            {esce && <p className="tavola-esce">A 1:{scala} il piano non entra nel foglio {foglio}: prova {foglio === "A4" ? "A3 o " : ""}una scala più piccola.</p>}
            <svg className="tavola-pianta" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} style={{ width: `${w}mm`, height: `${h}mm`, left: `${MARGINE + (aw - w) / 2}mm`, top: `${MARGINE + (ah - h) / 2}mm` }}>
              <g dangerouslySetInnerHTML={{ __html: svg }} />
              {etichette.map((t, i) => (
                <text key={i} x={t.x} y={t.y + (t.dy ?? 0) * t.dim * f} fontSize={t.dim * f} textAnchor="middle" dominantBaseline="central" fill={t.colore} fontWeight={t.peso}
                  transform={t.ruota ? `rotate(${t.ruota} ${t.x} ${t.y})` : undefined} style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: (t.dim * f) / 5, strokeLinejoin: "round" }}>{t.testo}</text>
              ))}
            </svg>
            <footer className="cartiglio" style={{ left: `${MARGINE}mm`, right: `${MARGINE}mm`, bottom: `${MARGINE}mm`, height: `${CARTIGLIO - 4}mm` }}>
              <div><b className="cartiglio-titolo">{nome}</b><span>{cliente}</span></div>
              <div><b>{P.nome}</b><span>superficie utile {m2(utile)} m²{M.piani.length > 1 ? ` · casa ${m2(rie.utile)} m²` : ""}</span></div>
              <div className="cartiglio-scala">
                <b>Scala 1:{scala}</b>
                <svg width={`${metro * passi[passi.length - 1] + 2}mm`} height="5mm" viewBox={`-1 0 ${metro * passi[passi.length - 1] + 2} 5`} aria-label={`Scala grafica, ogni tratto ${passi[1]} m`}>
                  {passi.slice(1).map((m, i) => <rect key={m} x={metro * passi[i]} y={0.5} width={metro * (m - passi[i])} height={1.6} fill={i % 2 ? "#fff" : "#23262B"} stroke="#23262B" strokeWidth={0.2} />)}
                  {passi.map(m => <text key={m} x={metro * m} y={4.6} fontSize={2.2} textAnchor="middle" fill="#23262B">{m}</text>)}
                </svg>
              </div>
              <div><span>{oggi}</span><span>misure in cm · Abita</span></div>
            </footer>
          </section>
        );
      })}
    </div>
  );
}
