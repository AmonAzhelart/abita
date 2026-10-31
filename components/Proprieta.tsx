"use client";
// Il pannello Proprietà: campi veri per ogni tipo di elemento. Ogni campo riscrive solo il suo pezzo di riga.
import { useEffect, useRef, useState } from "react";
import { CATALOGO, COLORI, hex } from "@/lib/arredi";
import { angoli, area2, cambiaRiga, dentro, imposta, impostaPunti, lati, segmenti, segna, type Arredo, type Elemento, type Modello } from "@/lib/lingua";

type Props = {
  M: Modello; el: Elemento; testo: () => string; cambia: (t: string, scrivendo?: boolean) => void;
  onChiudi: () => void; onElimina: () => void; onDuplica: () => void; onAppunto: () => void; onBuco?: (a: Arredo) => void;
};

/** Il piano subito sopra (per quota), se c'è. */
export const pianoSopra = (M: Modello, piano: string) => {
  const q = M.piani.find(p => p.id === piano)?.quota ?? 0;
  return M.piani.filter(p => p.quota > q).sort((a, b) => a.quota - b.quota)[0];
};
const SCALA = /^scala\b|stair/i;                                       // "Scala a U…" sì, "Ripostiglio sottoscala" no
/** Per una scala: al piano di sopra il pavimento è già aperto? (da solo, con un foro, o perché lì non c'è pavimento) */
function bucoSopra(M: Modello, a: Arredo) {
  const su = pianoSopra(M, a.piano), qui = M.piani.find(p => p.id === a.piano);
  if (!su || !qui) return null;
  if (a.cosa === "scala" && Math.abs(qui.quota + a.H - su.quota) < 40) return { su, come: "da solo" as const };
  const q = angoli(a), c = q.reduce((s, v) => ({ x: s.x + v.x / 4, y: s.y + v.y / 4 }), { x: 0, y: 0 });
  if (M.el.some(f => f.tipo === "foro" && f.piano === su.id && ([...q, c].some(v => dentro(v, f.punti)) || f.punti.some(v => dentro(v, q))))) return { su, come: "foro" as const };
  if (!M.el.some(s => s.tipo === "stanza" && s.piano === su.id && dentro(c, s.punti))) return { su, come: "vuoto" as const };
  return { su, come: "chiuso" as const };
}

/** Numero con unità: si conferma dopo una breve pausa, con Invio o uscendo dal campo. */
function Numero({ nome, valore, unita = "cm", min = 0, passo = 1, segnaposto, onCambia }: { nome: string; valore: number | ""; unita?: string; min?: number; passo?: number; segnaposto?: string; onCambia: (v: number) => void }) {
  const [bozza, setBozza] = useState<string | null>(null), t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const conferma = (s: string) => { clearTimeout(t.current); const v = parseFloat(s.replace(",", ".")); if (Number.isFinite(v) && v >= min) onCambia(Math.round(v * 10) / 10); setBozza(null); };
  return (
    <label className="campo">
      <span>{nome}</span>
      <span className="campo-num">
        <input inputMode="decimal" value={bozza ?? (valore === "" ? "" : String(valore))} placeholder={segnaposto} aria-label={nome}
          onChange={e => { const s = e.target.value; setBozza(s); clearTimeout(t.current); t.current = setTimeout(() => conferma(s), 600); }}
          onBlur={e => bozza !== null && conferma(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") conferma(e.currentTarget.value);
            if (e.key === "Escape") { clearTimeout(t.current); setBozza(null); }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); const v = (parseFloat(e.currentTarget.value) || 0) + (e.key === "ArrowUp" ? passo : -passo) * (e.shiftKey ? 10 : 1); onCambia(Math.max(min, v)); setBozza(null); }
          }} />
        {unita && <i>{unita}</i>}
      </span>
    </label>
  );
}

function Testo({ nome, valore, onCambia }: { nome: string; valore: string; onCambia: (v: string) => void }) {
  const [v, setV] = useState(valore);
  useEffect(() => setV(valore), [valore]);
  return <label className="campo"><span>{nome}</span><input value={v} aria-label={nome} onChange={e => { setV(e.target.value); onCambia(e.target.value); }} /></label>;
}

function Scelta<T extends string>({ nome, valore, opzioni, onCambia }: { nome: string; valore: T; opzioni: [T, string][]; onCambia: (v: T) => void }) {
  return (
    <div className="campo">
      <span>{nome}</span>
      <div className="segmenti" role="group" aria-label={nome}>
        {opzioni.map(([k, l]) => <button key={k} type="button" aria-pressed={valore === k} onClick={() => onCambia(k)}>{l}</button>)}
      </div>
    </div>
  );
}

function Interruttore({ nome, aiuto, on, onCambia }: { nome: string; aiuto?: string; on: boolean; onCambia: (v: boolean) => void }) {
  return (
    <button type="button" className="interruttore" role="switch" aria-checked={on} onClick={() => onCambia(!on)}>
      <span><b>{nome}</b>{aiuto && <small>{aiuto}</small>}</span><i />
    </button>
  );
}

const ORDINE = ["bianco", "laccato", "crema", "lino", "boucle", "intonaco", "marmo", "quarzo", "ceramica", "rovere_chiaro", "rovere", "abete", "noce", "legna",
  "sabbia", "pietra", "gres", "cotto", "terracotta", "mattone", "lavica", "antracite", "nero", "acciaio", "ottone", "salvia", "salvia_scuro", "velluto",
  "verde", "verde_chiaro", "ulivo", "azzurro", "blu", "blu_notte", "lavanda", "viola", "rosa", "rosso", "arancio", "senape", "giallo", "tegola", "prato", "vetro", "acqua", "specchio"];

function Tavolozza({ nome, valore, onCambia }: { nome: string; valore: string; onCambia: (v: string) => void }) {
  const voci = ORDINE.filter(c => c in COLORI);
  return (
    <div className="campo">
      <span>{nome} <em>{valore.replace("_", " ")}</em></span>
      <div className="tavolozza" role="radiogroup" aria-label={nome}>
        {!voci.includes(valore) && <button type="button" role="radio" aria-checked title={valore} style={{ background: hex(valore) }} />}
        {voci.map(c => <button key={c} type="button" role="radio" aria-checked={valore === c} title={c.replace("_", " ")} aria-label={c.replace("_", " ")} style={{ background: hex(c) }} onClick={() => onCambia(c)} />)}
        <label className="su-misura" title="Colore su misura"><input type="color" value={hex(valore)} onChange={e => onCambia(e.target.value)} aria-label="Colore su misura" />+</label>
      </div>
    </div>
  );
}

const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
export function titolo(e: Elemento) {
  switch (e.tipo) {
    case "muro": return e.fino !== e.altezza ? "Muro sotto falda" : "Muro";
    case "stanza": return e.nome;
    case "area": return e.nome || "Area esterna";
    case "apertura": return maiuscola(e.cosa);
    case "arredo": return e.cosa === "modello" ? e.nome : maiuscola(e.cosa);
    case "tetto": return "Tetto";
    case "misura": return "Misura";
    case "foro": return "Buco nel pavimento";
  }
}
const lunghezza = (punti: { x: number; y: number }[], chiuso = false) =>
  (chiuso ? lati(punti) : punti.slice(1).map((p, i) => [punti[i], p] as const)).reduce((s, [a, b]) => s + Math.hypot(b.x - a.x, b.y - a.y), 0);
const virgolette = (s: string) => (/^[\p{L}][\p{L}\d_'-]*$/u.test(s) ? s : `"${s.replace(/"/g, "'")}"`);

export default function Proprieta({ M, el, testo, cambia, onChiudi, onElimina, onDuplica, onAppunto, onBuco }: Props) {
  const r = el.riga, riga = M.righe[r] ?? "";
  const set = (k: string, v: string | number | null, scrivendo = false) => cambia(imposta(testo(), r, k, v === null ? null : String(v)), scrivendo);
  const flag = (k: string, on: boolean) => cambia(segna(testo(), r, k, on));
  const parola = (nuova: string) => cambia(cambiaRiga(testo(), r, riga.replace(/^(\s*)\S+/, `$1${nuova}`)));
  const altezzaPiano = M.piani.find(p => p.id === el.piano)?.altezza ?? 270;

  let campi: React.ReactNode = null, info: string[] = [];
  const buco = el.tipo === "arredo" && (el.cosa === "scala" || SCALA.test(el.nome)) ? bucoSopra(M, el) : null;
  const scala = buco && <div className="buco-scala">
    {buco.come === "chiuso"
      ? <><span>Al piano <b>{buco.su.nome}</b> il pavimento è ancora chiuso sopra questa scala.</span>
        <button type="button" className="btn piccolo primario" onClick={() => onBuco?.(el as Arredo)}>Apri il buco</button></>
      : <span>{{ "da solo": "Al piano di sopra il pavimento si apre da solo sopra la scala.", foro: `C'è il buco nel pavimento del piano ${buco.su.nome}.`, vuoto: `Al piano ${buco.su.nome} qui non c'è pavimento: si passa.` }[buco.come]}</span>}
  </div>;
  switch (el.tipo) {
    case "muro": {
      const varia = el.fino !== el.altezza;
      info = [`${Math.round(lunghezza(el.punti, el.chiuso))} cm di muro`, `${segmenti(el).length} ${segmenti(el).length === 1 ? "tratto" : "tratti"}`];
      campi = <>
        <Scelta nome="Spessore" valore={String(el.spessore)} opzioni={[["10", "10"], ["20", "20"], ["30", "30"], ["40", "40"]]} onCambia={v => set("spessore", v)} />
        <Numero nome="Spessore su misura" valore={el.spessore} onCambia={v => set("spessore", v)} />
        <div className="campi-2">
          <Numero nome="Altezza punto A" valore={el.altezza} segnaposto={String(altezzaPiano)} onCambia={v => cambia(imposta(imposta(testo(), r, "altezza", String(v)), r, "fino", el.fino === v || !varia ? null : String(el.fino)))} />
          <Numero nome="Altezza punto B" valore={el.fino} onCambia={v => set("fino", v === el.altezza ? null : v)} />
        </div>
        <Profilo a={el.altezza} b={el.fino} />
        {el.punti.length > 2 && <Interruttore nome="Chiuso" aiuto="L'ultimo punto torna al primo" on={el.chiuso} onCambia={on => flag("chiudi", on)} />}
        <button type="button" className="btn piccolo" onClick={() => {
          let t = impostaPunti(testo(), r, [...el.punti].reverse());
          if (varia) t = imposta(imposta(t, r, "altezza", String(el.fino)), r, "fino", String(el.altezza));
          cambia(t);
        }}>Inverti A e B</button>
        <Tavolozza nome="Finitura" valore={el.colore} onCambia={v => set("colore", v)} />
      </>;
      break;
    }
    case "stanza":
      info = [`${el.area.toFixed(1).replace(".", ",")} m²`, `perimetro ${Math.round(lunghezza(el.punti, true))} cm`];
      campi = <>
        <Testo nome="Nome" valore={el.nome} onCambia={v => cambia(cambiaRiga(testo(), r, riga.replace(/^(\s*\S+\s+)("[^"]*"|“[^”]*”|\S+)/, `$1"${v.replace(/"/g, "'")}"`)), true)} />
        <Tavolozza nome="Pavimento" valore={el.colore} onCambia={v => set("pavimento", v)} />
      </>;
      break;
    case "area":
      info = [`${(Math.abs(area2(el.punti)) / 1e4).toFixed(1).replace(".", ",")} m²`];
      campi = <Tavolozza nome="Materiale" valore={el.colore} onCambia={v => set("materiale", v)} />;
      break;
    case "apertura": {
      const stanze = M.el.filter(s => s.tipo === "stanza" && s.piano === el.piano).map(s => (s as { nome: string }).nome);
      campi = <>
        <Scelta nome="Tipo" valore={el.cosa} opzioni={[["porta", "Porta"], ["finestra", "Finestra"], ["portafinestra", "Portafin."], ["varco", "Varco"]]} onCambia={parola} />
        <div className="campi-2">
          <Numero nome="Larghezza" valore={el.larga} min={10} onCambia={v => set("misure", `${v}x${el.alta}`)} />
          <Numero nome="Altezza" valore={el.alta} min={10} onCambia={v => set("misure", `${el.larga}x${v}`)} />
        </div>
        {(el.cosa === "finestra" || el.cosa === "portafinestra") && <Numero nome="Davanzale da terra" valore={el.davanzale} onCambia={v => set("davanzale", v)} />}
        {el.cosa === "porta" && <>
          <label className="campo"><span>Si apre verso</span>
            <select value={el.verso} onChange={e => set("verso", e.target.value ? virgolette(e.target.value) : null)}>
              <option value="">Automatico</option>
              {stanze.map(s => <option key={s} value={s}>{s}</option>)}
            </select></label>
          <Scelta nome="Cerniera" valore={el.cardine} opzioni={[["sx", "Sinistra"], ["dx", "Destra"]]} onCambia={v => set("cardine", v === "dx" ? "dx" : null)} />
          <Interruttore nome="Scorrevole" on={el.scorrevole} onCambia={on => flag("scorrevole", on)} />
        </>}
      </>;
      break;
    }
    case "arredo":
      if (el.cosa === "modello") {
        info = [`${Math.round(el.L)} × ${Math.round(el.P)} × ${Math.round(el.H)} cm`, "oggetto importato"];
        campi = <>
          <Ruota gradi={el.ruota} onCambia={v => set("ruota", v || null)} />
          <Numero nome="Alzato da terra" valore={el.quota} onCambia={v => set("quota", v || null)} />
          <Interruttore nome="Copertura" aiuto="Si nasconde quando guardi dentro" on={!!el.copertura} onCambia={on => flag("copertura", on)} />
          <Interruttore nome="Calpestabile" aiuto="Ci si cammina sopra" on={!!el.calpestabile} onCambia={on => flag("calpestabile", on)} />
          {scala}
        </>;
        break;
      }
      campi = <>
        <label className="campo"><span>Tipo</span>
          <select value={el.cosa} onChange={e => parola(e.target.value)}>
            {Object.keys(CATALOGO).map(k => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
          </select></label>
        <div className="campi-3">
          <Numero nome="Larghezza" valore={Math.round(el.L)} min={1} unita="" onCambia={v => set("misure", `${v}x${Math.round(el.P)}x${Math.round(el.H)}`)} />
          <Numero nome="Profondità" valore={Math.round(el.P)} min={1} unita="" onCambia={v => set("misure", `${Math.round(el.L)}x${v}x${Math.round(el.H)}`)} />
          <Numero nome="Altezza" valore={Math.round(el.H)} min={1} unita="" onCambia={v => set("misure", `${Math.round(el.L)}x${Math.round(el.P)}x${v}`)} />
        </div>
        <Ruota gradi={el.ruota} onCambia={v => set("ruota", v || null)} />
        <Numero nome="Alzato da terra" valore={el.quota} onCambia={v => set("quota", v || null)} />
        <Tavolozza nome="Colore" valore={el.colore} onCambia={v => set("colore", v)} />
        {scala}
      </>;
      break;
    case "tetto":
      campi = <>
        <Scelta nome="Falde" valore={String(el.falde)} opzioni={[["0", "Piano"], ["1", "Una"], ["2", "Due"]]}
          onCambia={v => { let t = segna(testo(), r, "piano", v === "0"); t = imposta(t, r, "falde", v === "0" ? null : v); cambia(t); }} />
        <div className="campi-2">
          <Numero nome={el.falde ? "Altezza al colmo" : "Spessore"} valore={el.altezza} onCambia={v => set("altezza", v)} />
          <Numero nome="Sporto" valore={el.sporto} onCambia={v => set("sporto", v)} />
        </div>
        {el.falde === 2 && <Scelta nome="Colmo lungo" valore={el.colmo} opzioni={[["x", "Orizzontale"], ["y", "Verticale"]]} onCambia={v => set("colmo", v)} />}
        <Tavolozza nome="Manto" valore={el.colore} onCambia={v => set("colore", v)} />
      </>;
      break;
    case "misura":
      info = [`${Math.round(Math.hypot(el.punti[1].x - el.punti[0].x, el.punti[1].y - el.punti[0].y))} cm`];
      break;
    case "foro":
      info = [`${Math.round(Math.max(...el.punti.map(q => q.x)) - Math.min(...el.punti.map(q => q.x)))} × ${Math.round(Math.max(...el.punti.map(q => q.y)) - Math.min(...el.punti.map(q => q.y)))} cm`, "il pavimento qui è aperto"];
      break;
  }

  return (
    <section className="proprieta" aria-label="Proprietà">
      <header>
        <div><b>{titolo(el)}</b>{info.length > 0 && <small>{info.join(" · ")}</small>}</div>
        <button className="btn piccolo" aria-label="Chiudi" onClick={onChiudi}>✕</button>
      </header>
      {campi}
      <div className="azioni">
        <button className="btn piccolo" onClick={onDuplica}>Duplica</button>
        <button className="btn piccolo" onClick={onAppunto}>Appunto qui</button>
        <span className="spazio" />
        <button className="btn piccolo pericolo" onClick={onElimina}>Elimina</button>
      </div>
      <details className="riga-avanzata">
        <summary>Riga {r + 1} nel testo</summary>
        <input className="riga-input" value={riga} onChange={e => cambia(cambiaRiga(testo(), r, e.target.value), true)} aria-label="La riga di questo elemento" spellCheck={false} />
      </details>
    </section>
  );
}

function Ruota({ gradi, onCambia }: { gradi: number; onCambia: (v: number) => void }) {
  return (
    <div className="campo">
      <span>Rotazione <em>{gradi}°</em></span>
      <div className="ruota">
        <button type="button" className="btn piccolo" onClick={() => onCambia((gradi + 270) % 360)} aria-label="Ruota a sinistra di 90 gradi">↺ 90°</button>
        <input type="range" min={0} max={345} step={15} value={gradi - (gradi % 15)} onChange={e => onCambia(+e.target.value)} aria-label="Rotazione" />
        <button type="button" className="btn piccolo" onClick={() => onCambia((gradi + 90) % 360)} aria-label="Ruota a destra di 90 gradi">↻ 90°</button>
      </div>
    </div>
  );
}

/** Il profilo del muro visto di fianco: si capisce subito se sale o scende. */
export function Profilo({ a, b, scritte = true }: { a: number; b: number; scritte?: boolean }) {
  const m = Math.max(a, b, 1), h = (v: number) => 54 - (v / m) * (scritte ? 38 : 50);
  return (
    <svg className="profilo" viewBox={scritte ? "0 0 200 58" : "0 0 200 56"} aria-label={`Profilo del muro: ${a} cm all'inizio, ${b} cm alla fine`}>
      <path d={`M10 54 L10 ${h(a)} L190 ${h(b)} L190 54 Z`} />
      {scritte && <text x="16" y={h(a) - 4}>A {a}</text>}
      {scritte && <text x="184" y={h(b) - 4} textAnchor="end">B {b}</text>}
    </svg>
  );
}
