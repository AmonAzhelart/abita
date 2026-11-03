"use client";
// La pianta in scala da stampare o salvare in PDF: un foglio per piano, con cartiglio, superfici e scala grafica.
// Le misure sul foglio sono vere: a 1:50 un metro è 2 cm di carta. Le scritte hanno misure da carta (in mm),
// i nomi si adattano alla stanza e nessuna scritta ne copre un'altra. Tutti i piani escono nella stessa scala.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { leggi, type ModelloInfo } from "@/lib/lingua";
import { CHIARO, contenuto, disegnaPianta, riquadro } from "@/lib/pianta";
import { riepilogo } from "@/lib/verifiche";

const FOGLI = { A4: [297, 210], A3: [420, 297] } as const;     // lato lungo, lato corto in mm
const SCALE = [50, 100, 200, 500];
const MARGINE = 10, CARTIGLIO = 22;                          // mm
const m2 = (v: number) => v.toFixed(1).replace(".", ",");
type Verso = "verticale" | "orizzontale";
type Scelte = { foglio: keyof typeof FOGLI; verso: Verso | "auto"; scala: number | "auto"; quote: boolean; arredi: boolean; esterni: boolean; bn: boolean };
const DI_SERIE: Scelte = { foglio: "A4", verso: "auto", scala: "auto", quote: true, arredi: true, esterni: false, bn: false };

type Props = { id: string; nome: string; cliente: string; testo: string; modelli: Record<string, ModelloInfo>; piano?: string };

export default function Stampa({ id, nome, cliente, testo, modelli, piano }: Props) {
  const M = useMemo(() => leggi(testo, modelli), [testo, modelli]);
  const rie = useMemo(() => riepilogo(M), [M]);
  const [o, setO] = useState<Scelte>(DI_SERIE);
  useEffect(() => {                                            // le scelte dell'ultima volta (solo su questo browser)
    try { const v = JSON.parse(localStorage.getItem("abita-stampa") ?? "null"); if (v) setO({ ...DI_SERIE, ...v }); } catch { /* niente */ }
  }, []);
  const cambia = (c: Partial<Scelte>) => setO(x => { const n = { ...x, ...c }; try { localStorage.setItem("abita-stampa", JSON.stringify(n)); } catch { /* niente */ } return n; });
  const [quali, setQuali] = useState<string[]>(() => (piano && M.piani.some(p => p.id === piano) ? [piano] : M.piani.map(p => p.id)));
  const oggi = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

  const piani = M.piani.filter(p => quali.includes(p.id)).map(P => ({ P, b: contenuto(M, P.id, o.esterni) ?? (() => { const r = riquadro(M, P.id); return { x: r.x + 120, y: r.y + 120, w: r.w - 240, h: r.h - 240 }; })() }));
  const bordo = o.quote ? 17 : 6;                                 // mm intorno alla casa: le quote d'ingombro
  const area = (v: Verso) => { const [L, C] = FOGLI[o.foglio], [W, H] = v === "verticale" ? [C, L] : [L, C]; return { W, H, aw: W - 2 * MARGINE, ah: H - 2 * MARGINE - CARTIGLIO }; };
  const entra = (b: { w: number; h: number }, s: number, v: Verso) => { const { aw, ah } = area(v); return (b.w * 10) / s + 2 * bordo <= aw && (b.h * 10) / s + 2 * bordo <= ah; };
  const migliore = (v: Verso) => Math.max(0, ...piani.map(({ b }) => SCALE.find(s => entra(b, s, v)) ?? 500));   // la scala che va bene per tutti i piani
  const riempie = (v: Verso, s: number) => piani.reduce((t, { b }) => { const { aw, ah } = area(v); return t + Math.min(1, ((b.w * 10) / s) / aw) * Math.min(1, ((b.h * 10) / s) / ah); }, 0);
  const verso: Verso = o.verso !== "auto" ? o.verso : (() => {
    const sv = migliore("verticale"), so = migliore("orizzontale");
    return sv < so || (sv === so && riempie("verticale", sv) > riempie("orizzontale", so)) ? "verticale" : "orizzontale";
  })();
  const scala = o.scala === "auto" ? migliore(verso) || 100 : o.scala, { W, H, aw, ah } = area(verso), K = scala / 10;

  const fogli = piani.map(({ P, b }) => {
    const m = bordo * K, vb = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
    const { svg, etichette } = disegnaPianta(M, { piano: P.id, colori: CHIARO, quote: o.quote, sotto: false, testo: false, mm: K, arredi: o.arredi, pavimenti: o.bn ? 0 : 0.32 });
    return { P, vb, svg, etichette, esce: !entra(b, scala, verso), utile: rie.piani.find(x => x.id === P.id)?.utile ?? 0 };
  });
  const spunta = (k: "quote" | "arredi" | "esterni" | "bn", t: string, titolo: string) =>
    <label title={titolo}><input type="checkbox" checked={o[k]} onChange={e => cambia({ [k]: e.target.checked })} />{t}</label>;

  return (
    <div className="stampa">
      <style>{`@page { size: ${o.foglio} ${verso === "verticale" ? "portrait" : "landscape"}; margin: 0 }`}</style>
      <div className="stampa-barra vetro">
        <Link className="btn piccolo" href={`/studio/${id}`}>← Editor</Link>
        <div className="segmenti" role="group" aria-label="Foglio">{(Object.keys(FOGLI) as (keyof typeof FOGLI)[]).map(f => <button key={f} aria-pressed={o.foglio === f} onClick={() => cambia({ foglio: f })}>{f}</button>)}</div>
        <div className="segmenti" role="group" aria-label="Orientamento del foglio">
          <button aria-pressed={o.verso === "auto"} onClick={() => cambia({ verso: "auto" })} title="Il verso che fa entrare la casa nella scala più grande">Auto</button>
          <button aria-pressed={o.verso === "verticale"} onClick={() => cambia({ verso: "verticale" })} aria-label="Verticale" title="Verticale"><svg className="ico-foglio" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="1.5" width="8" height="13" rx="1" /></svg></button>
          <button aria-pressed={o.verso === "orizzontale"} onClick={() => cambia({ verso: "orizzontale" })} aria-label="Orizzontale" title="Orizzontale"><svg className="ico-foglio" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="4" width="13" height="8" rx="1" /></svg></button>
        </div>
        <div className="segmenti" role="group" aria-label="Scala">
          <button aria-pressed={o.scala === "auto"} onClick={() => cambia({ scala: "auto" })}>Adatta</button>
          {[50, 100, 200].map(s => <button key={s} aria-pressed={o.scala === s} onClick={() => cambia({ scala: s })}>1:{s}</button>)}
        </div>
        <div className="stampa-piani" role="group" aria-label="Cosa mostrare">
          {spunta("quote", "Quote", "Misure delle stanze e ingombro della casa")}
          {spunta("arredi", "Arredi", "Mobili e oggetti (le scale restano)")}
          {spunta("esterni", "Esterni", "Anche giardino, cortili e muri di cinta")}
          {spunta("bn", "Bianco e nero", "Pavimenti bianchi e niente colori: per le stampanti in bianco e nero")}
        </div>
        <div className="stampa-piani" role="group" aria-label="Piani da stampare">
          {M.piani.map(p => <label key={p.id}><input type="checkbox" checked={quali.includes(p.id)} onChange={e => setQuali(q => (e.target.checked ? [...q, p.id] : q.filter(x => x !== p.id)))} />{p.nome}</label>)}
        </div>
        <span className="spazio" />
        <span className="tenue piccolo">{o.foglio} {verso}, 1:{scala}</span>
        <button className="btn primario" onClick={() => window.print()} disabled={!fogli.length}>Stampa o salva PDF</button>
      </div>
      {!fogli.length && <p className="tenue">Scegli almeno un piano.</p>}
      {fogli.map(({ P, vb, svg, etichette, esce, utile }) => {
        const w = (vb.w * 10) / scala, h = (vb.h * 10) / scala, metro = 1000 / scala, passi = scala >= 200 ? [0, 2, 4, 6] : scala >= 100 ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3];
        return (
          <section key={P.id} className="tavola" style={{ width: `${W}mm`, height: `${H}mm` }} aria-label={`Foglio del piano ${P.nome}`}>
            {esce && <p className="tavola-esce">A 1:{scala} il piano non entra nel foglio {o.foglio} {verso}: prova {o.foglio === "A4" ? "A3, " : ""}l&apos;altro verso o una scala più piccola.</p>}
            <svg className={"tavola-pianta" + (o.bn ? " bn" : "")} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
              style={{ width: `${w}mm`, height: `${h}mm`, left: `${MARGINE + (aw - w) / 2}mm`, top: `${MARGINE + Math.max(0, (ah - h) / 2)}mm` }}>
              <g dangerouslySetInnerHTML={{ __html: svg }} />
              {etichette.map((t, i) => (
                <text key={i} x={t.x} y={t.y + (t.dy ?? 0) * t.dim} fontSize={t.dim} textAnchor="middle" dominantBaseline="central" fill={o.bn && t.colore === CHIARO.quota ? "#23262B" : t.colore} fontWeight={t.peso}
                  transform={t.ruota ? `rotate(${t.ruota} ${t.x} ${t.y})` : undefined} style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: t.dim / 4, strokeLinejoin: "round" }}>{t.testo}</text>
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
