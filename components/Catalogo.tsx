"use client";
// Il catalogo degli arredi, diviso per stanza, con il simbolo che compare in pianta.
import { useState } from "react";
import { CATALOGO } from "@/lib/arredi";
import { anteprima } from "@/lib/pianta";

const GRUPPI: [string, string[]][] = [
  ["Soggiorno", ["divano", "poltrona", "pouf", "tavolino", "mobile_tv", "madia", "libreria", "camino", "tappeto", "lampada", "pianta"]],
  ["Cucina e pranzo", ["cucina", "isola", "frigo", "tavolo", "sedia", "sgabello"]],
  ["Camera e studio", ["letto", "letto_singolo", "comodino", "armadio", "cassettiera", "scrivania"]],
  ["Bagno", ["lavabo", "wc", "bidet", "doccia", "vasca", "lavatrice"]],
  ["Struttura", ["scala", "blocco"]],
];

export default function Catalogo({ scelto, onScegli }: { scelto: string; onScegli: (k: string) => void }) {
  const [cerca, setCerca] = useState(""), q = cerca.trim().toLowerCase();
  const va = (k: string) => k in CATALOGO && (!q || k.replace("_", " ").includes(q) || CATALOGO[k].desc.toLowerCase().includes(q));
  const gruppi = GRUPPI.map(([n, v]) => [n, v.filter(va)] as const).filter(([, v]) => v.length);
  return (
    <div className="catalogo vetro" role="listbox" aria-label="Arredi">
      <input className="catalogo-cerca" type="search" autoFocus placeholder="Cerca: letto, doccia, scala…" value={cerca} aria-label="Cerca nel catalogo"
        onChange={e => setCerca(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && gruppi[0]) onScegli(gruppi[0][1][0]); }} />
      {!gruppi.length && <p className="piccolo tenue" style={{ margin: 0 }}>Niente con &quot;{cerca}&quot; nel catalogo.</p>}
      {gruppi.map(([nome, voci]) => (
        <section key={nome}>
          <h3>{nome}</h3>
          <div className="voci">
            {voci.map(k => {
              const a = anteprima(k), v = CATALOGO[k];
              return (
                <button key={k} type="button" role="option" aria-selected={scelto === k} onClick={() => onScegli(k)} title={v.desc}>
                  <svg viewBox={a.box} aria-hidden="true" dangerouslySetInnerHTML={{ __html: a.svg }} />
                  <span>{k.replace("_", " ")}</span>
                  <small>{v.L}×{v.P}</small>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
