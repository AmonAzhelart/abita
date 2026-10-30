"use client";
// Il catalogo degli arredi, diviso per stanza, con il simbolo che compare in pianta.
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
  return (
    <div className="catalogo vetro" role="listbox" aria-label="Arredi">
      {GRUPPI.map(([nome, voci]) => (
        <section key={nome}>
          <h3>{nome}</h3>
          <div className="voci">
            {voci.filter(k => k in CATALOGO).map(k => {
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
