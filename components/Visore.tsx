"use client";
// La pagina del cliente: la casa in 3D o in pianta, le stanze, e un commento toccando la pianta.
import { useEffect, useMemo, useRef, useState } from "react";
import { leggi, type ModelloInfo, type Pt } from "@/lib/lingua";
import type { Appunto } from "@/lib/progetti";
import Pianta from "./Pianta";
import Vista3D, { useMesh, type Volo } from "./Vista3D";

type Commento = { id: string; piano: string; a: Pt; testo: string; stato: Appunto["stato"] };
type Dati = { nome: string; cliente: string; testo: string; versione: number; quando: number; nota?: string; modelli: Record<string, ModelloInfo & { chiave: string }>; commenti: Commento[] };

export default function Visore({ share, iniziale }: { share: string; iniziale: Dati }) {
  const [d, setD] = useState(iniziale);
  const M = useMemo(() => leggi(d.testo, d.modelli), [d.testo, d.modelli]);
  const mesh = useMesh(`/api/v/${share}?modelli=1`, Object.values(d.modelli).map(m => m.chiave).join());
  const [piano, setPiano] = useState("tutti");
  const [vista, setVista] = useState<"3d" | "pianta">("3d");
  const [nomi, setNomi] = useState(true), [tetto, setTetto] = useState(true), [chiuso, setChiuso] = useState(false);
  const [volo, setVolo] = useState<Volo>({ tipo: "panoramica", n: 0 });
  const [stanze, setStanze] = useState(false), [commenta, setCommenta] = useState(false);
  const [bozza, setBozza] = useState<{ piano: string; a: Pt } | null>(null);
  const [testo, setTesto] = useState(""), [nome, setNome] = useState(""), [avviso, setAvviso] = useState("");
  const [centra, setCentra] = useState<{ p: Pt; n: number }>();

  useEffect(() => { try { setNome(localStorage.getItem("abita-nome") ?? ""); } catch {} }, []);
  const mostra = (t: string) => { setAvviso(t); setTimeout(() => setAvviso(a => (a === t ? "" : a)), 4000); };
  const stato = useRef<string | null>(null);                  // versione e commenti visti: se non cambiano non si riscarica niente
  const ricarica = async (annuncia: boolean) => {
    if (annuncia && stato.current) {
      const c = await fetch(`/api/v/${share}?stato=${encodeURIComponent(stato.current)}`).catch(() => null);
      if (c?.status !== 200) return;
    }
    const r = await fetch(`/api/v/${share}`).catch(() => null);
    if (!r?.ok) return;
    const n: Dati & { stato?: string } = await r.json();
    stato.current = n.stato ?? null;
    setD(old => { if (annuncia && n.versione !== old.versione) mostra(`È arrivata la versione ${n.versione}`); return n; });
  };
  useEffect(() => { const t = setInterval(() => !document.hidden && ricarica(true), 20000); return () => clearInterval(t); });

  const pianoPianta = piano === "tutti" ? M.piani[0]?.id ?? "terra" : piano;
  const tutteStanze = M.el.flatMap(e => (e.tipo === "stanza" ? [e] : []));
  const area = tutteStanze.reduce((s, x) => s + x.area, 0);
  const data = new Date(d.quando).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const commenti = d.commenti.map((c, i) => ({ ...c, tipo: "punto" as const, da: "cliente" as const, quando: 0, n: i + 1 }));

  async function invia() {
    if (!bozza || !testo.trim()) return;
    try { localStorage.setItem("abita-nome", nome); } catch {}
    const r = await fetch(`/api/v/${share}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...bozza, testo, nome }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { mostra(j.errore ?? "Il commento non è partito. Riprova."); return; }
    setBozza(null); setTesto(""); setCommenta(false);
    mostra("Commento inviato: il progettista lo vede subito");
    ricarica(false);
  }

  return (
    <div className="visore">
      {vista === "3d"
        ? <Vista3D modello={M} mesh={mesh} piano={piano} tetto={tetto} nomi={nomi} volo={volo} onStanza={r => setVolo({ tipo: "entra", riga: r, n: Date.now() })} />
        : <div className="vista carta"><Pianta modello={M} piano={pianoPianta} quote appunti={commenti} centra={centra} strumento={commenta ? "commento" : "sposta"}
            onDisegna={(_, [a]) => setBozza({ piano: pianoPianta, a })} /></div>}

      <header className="scheda vetro">
        <h1>{d.nome}</h1>
        <p>{d.cliente ? `${d.cliente}, ` : ""}versione {d.versione} del {data}{area ? `, ${area.toFixed(0)} m² di stanze` : ""}</p>
        {d.nota && <p style={{ color: "var(--fg)" }}>{d.nota}</p>}
      </header>

      {stanze && <div className="foglio vetro" style={{ bottom: chiuso ? 84 : 250 }}>
        <ul>{tutteStanze.map(s => (
          <li key={s.riga}><button onClick={() => {
            setStanze(false);
            setPiano(s.piano);
            if (vista === "3d") setVolo({ tipo: "entra", riga: s.riga, n: Date.now() }); else setCentra({ p: s.centro, n: Date.now() });
          }}><span>{s.nome}{M.piani.length > 1 && <span className="tenue"> · {M.piani.find(p => p.id === s.piano)?.nome}</span>}</span><span>{s.area.toFixed(1).replace(".", ",")} m²</span></button></li>
        ))}</ul>
      </div>}

      {bozza && <div className="foglio vetro" style={{ bottom: chiuso ? 84 : 250 }}>
        <strong style={{ fontWeight: 600 }}>Il tuo commento</strong>
        <textarea autoFocus rows={3} maxLength={1500} value={testo} onChange={e => setTesto(e.target.value)} placeholder="Qui vorrei una finestra più grande" style={{ fontSize: 16 }} />
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Il tuo nome" aria-label="Il tuo nome" maxLength={60} style={{ fontSize: 16 }} />
        <div style={{ display: "flex", gap: 8 }}><button className="btn primario" onClick={invia}>Invia commento</button><button className="btn" onClick={() => setBozza(null)}>Annulla</button></div>
      </div>}

      <nav className="dock vetro" aria-label="Comandi">
        <div className="fila">
          <div className="segmenti" role="group" aria-label="Piano">
            {M.piani.map(p => <button key={p.id} aria-pressed={(vista === "pianta" ? pianoPianta : piano) === p.id} onClick={() => setPiano(p.id)}>{p.nome}</button>)}
            {vista === "3d" && M.piani.length > 1 && <button aria-pressed={piano === "tutti"} onClick={() => setPiano("tutti")}>Tutta</button>}
          </div>
          <button className="btn" aria-expanded={!chiuso} aria-label={chiuso ? "Mostra i comandi" : "Nascondi i comandi"} onClick={() => setChiuso(!chiuso)} style={{ minWidth: 44 }}>{chiuso ? "▴" : "▾"}</button>
        </div>
        {!chiuso && <>
          <div className="griglia">
            <button className="btn" aria-pressed={vista === "3d"} onClick={() => { setVista("3d"); setCommenta(false); setVolo({ tipo: "panoramica", n: Date.now() }); }}>Panoramica</button>
            <button className="btn" onClick={() => { setVista("3d"); setCommenta(false); setVolo({ tipo: "alto", n: Date.now() }); }}>Dall&apos;alto</button>
            <button className="btn" aria-pressed={vista === "pianta"} onClick={() => setVista("pianta")}>Pianta</button>
            <button className="btn" aria-pressed={stanze} onClick={() => { setStanze(!stanze); setBozza(null); }}>Stanze</button>
            <button className="btn" aria-pressed={nomi} onClick={() => setNomi(!nomi)}>Nomi</button>
            <button className="btn" aria-pressed={tetto} onClick={() => setTetto(!tetto)}>Tetto</button>
          </div>
          <button className={"btn commenta"} aria-pressed={commenta} style={{ minHeight: 42 }} onClick={() => { const on = !commenta; setCommenta(on); setVista("pianta"); setStanze(false); if (!on) setBozza(null); }}>
            {commenta ? "Tocca la pianta dove vuoi commentare" : "Lascia un commento"}
          </button>
          <div className="aiuto" aria-live="polite">{avviso || (vista === "3d" ? "Un dito ruota, due dita zoom e spostano. Tocca il nome di una stanza per entrarci." : "Trascina per spostarti, due dita per lo zoom.")}</div>
        </>}
      </nav>
    </div>
  );
}
