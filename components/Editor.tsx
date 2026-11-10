"use client";
// L'editor: testo a sinistra, pianta o 3D al centro, appunti e attività di Claude a destra.
// Ogni modifica (scritta o disegnata) cambia il testo; il testo si salva da solo e Claude lo vede subito.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as TastoReact, type PointerEvent as Puntatore } from "react";
import { aggiungi, angoli, area2, dentro, distSeg, imposta, impostaPunti, lati, leggi, segmenti, slug, sposta, togli, type Arredo, type Modello, type Pt, type Stanza } from "@/lib/lingua";
import { hex } from "@/lib/arredi";
import { passaggi } from "@/lib/passaggi";
import { NOMI_USO, riepilogo } from "@/lib/verifiche";
import { altezzaLibera, daQuota, piuBasso, profiloAltezza, type Altezza, type Campione } from "@/lib/altezza";
import { sezione } from "@/lib/sezione";
import type { Appunto, Foto, Progetto } from "@/lib/progetti";
import Catalogo from "./Catalogo";
import Codice from "./Codice";
import Pianta, { type Strumento } from "./Pianta";
import Proprieta, { pianoSopra, Profilo, titolo } from "./Proprieta";
import VistaSezione from "./Sezione";
import ProfiloAltezza from "./ProfiloAltezza";
import Vista3D, { useMesh, type Colpo, type Disegno3D, type Traccia, type Volo } from "./Vista3D";

const m2 = (v: number) => v.toFixed(1).replace(".", ",");
const metri = (cm: number) => (cm / 100).toFixed(2).replace(".", ",");

/** La scheda dell'altezza libera: quanto spazio c'è, da dove a dove, e se ci si sta in piedi. */
function Alto({ r, onChiudi }: { r: Altezza; onChiudi: () => void }) {
  const piedi = !r.sotto.startsWith("sopra "), L = r.libera;
  return (
    <div className="alto-scheda vetro" role="status">
      <header><span className="etichetta">Altezza libera</span><button className="btn piccolo" onClick={onChiudi} aria-label="Chiudi">✕</button></header>
      {r.buco ? <b className="alto-valore">Buco nel pavimento</b> : <b className="alto-valore">{L === null ? "Aperto" : `${metri(L)} m`}</b>}
      {r.buco ? <p>Qui sotto c&apos;è la scala: misura dal piano di sotto.</p> : <>
        <p><span className="tenue">Sotto:</span> {r.sotto}{r.base ? `, a ${r.base} cm` : ""}</p>
        <p><span className="tenue">Sopra:</span> {r.sopra}{r.cima !== null ? `, a ${r.cima} cm` : ""}</p>
        {piedi && L !== null && <p className={L < 200 ? "alto-basso" : L < 210 ? "alto-giusto" : "alto-ok"}>{L < 200 ? `Sotto i 2 m si batte la testa: mancano ${200 - L} cm` : L < 210 ? "Va bene per i 2 m, non per i 2,10 m chiesti da alcuni regolamenti" : "Ci si sta in piedi comodi"}</p>}
      </>}
    </div>
  );
}
/** La scheda dell'area misurata: superficie e perimetro, e se serve ne fai una stanza. */
function Misurata({ pts, onStanza, onChiudi }: { pts: Pt[]; onStanza: () => void; onChiudi: () => void }) {
  const A = Math.abs(area2(pts)) / 1e4, P = lati(pts).reduce((t, [a, b]) => t + Math.hypot(b.x - a.x, b.y - a.y), 0);
  return (
    <div className="alto-scheda vetro" role="status">
      <header><span className="etichetta">Area misurata</span><button className="btn piccolo" onClick={onChiudi} aria-label="Chiudi">✕</button></header>
      <b className="alto-valore">{A.toFixed(2).replace(".", ",")} m²</b>
      <p><span className="tenue">Perimetro:</span> {metri(P)} m, {pts.length} lati</p>
      <button className="btn piccolo" style={{ justifySelf: "start", marginTop: 4 }} onClick={onStanza}>Fanne una stanza</button>
    </div>
  );
}
type Rpc = { ok: true; doc: Progetto } | { ok: false; stato: number; errore: string };
async function rpc(azione: string, dati: object): Promise<Rpc> {
  const r = await fetch("/api/studio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ azione, ...dati }) });
  const j = await r.json().catch(() => ({ errore: "Risposta non valida dal server" }));
  return r.ok ? { ok: true, doc: j } : { ok: false, stato: r.status, errore: j.errore ?? "Qualcosa non ha funzionato" };
}

const fmt = (v: number) => String(Math.round(v));
function scriviPunti(pts: Pt[]) {                    // 0,0 >400 v300: i tratti dritti come passi, più facili da leggere
  const out = [`${fmt(pts[0].x)},${fmt(pts[0].y)}`];
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.round(pts[i].x - pts[i - 1].x), dy = Math.round(pts[i].y - pts[i - 1].y);
    out.push(dy === 0 ? (dx >= 0 ? ">" : "<") + Math.abs(dx) : dx === 0 ? (dy >= 0 ? "v" : "^") + Math.abs(dy) : `${fmt(pts[i].x)},${fmt(pts[i].y)}`);
  }
  return out.join(" ");
}
function suMuro(M: Modello, piano: string, q: Pt) {
  let best: Pt | null = null, bd = 60;
  for (const m of M.el) if (m.tipo === "muro" && m.piano === piano) for (const [a, b] of segmenti(m)) {
    const d = distSeg(q, a, b);
    if (d >= bd) continue;
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2, t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / L2));
    bd = d;
    best = { x: Math.round(a.x + t * (b.x - a.x)), y: Math.round(a.y + t * (b.y - a.y)) };
  }
  return best;
}
/** Un buco nel pavimento apre il solaio solo se sta dentro una stanza: lo stringo alla stanza che ne contiene il centro. */
function foroIn(M: Modello, piano: string, a: Pt, b: Pt) {
  let x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const st = M.el.find((e): e is Stanza => e.tipo === "stanza" && e.piano === piano && dentro(c, e.punti));
  if (st) {
    const xs = st.punti.map(q => q.x), ys = st.punti.map(q => q.y);
    x0 = Math.max(x0, Math.min(...xs) + 2); y0 = Math.max(y0, Math.min(...ys) + 2);
    x1 = Math.min(x1, Math.max(...xs) - 2); y1 = Math.min(y1, Math.max(...ys) - 2);
  }
  const ok = !st || [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].every(([x, y]) => dentro({ x, y }, st.punti));
  return { riga: `foro ${fmt(x0)},${fmt(y0)} ${fmt(x1)},${fmt(y1)}`, ok, stanza: st?.nome };
}

const quanto = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "adesso" : m < 60 ? `${m} min fa` : m < 1440 ? `${Math.round(m / 60)} h fa` : new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};
const CHI = { io: "Tu", claude: "Claude", cliente: "Cliente" } as const;
const COL_NOTA = (a: Appunto) => (a.stato === "fatta" ? "var(--fatta)" : a.da === "cliente" ? "var(--cliente)" : a.da === "claude" ? "var(--claude)" : "var(--nota)");

const I = {
  sposta: "M5 3l14 8-6 2-2 6z", muro: "M3 8h18v8H3z M9 8v8 M15 8v8", stanza: "M4 4h16v16H4z M4 12h7", porta: "M5 21V4h9v17 M14 4a10 10 0 0 1 5 9",
  finestra: "M4 5h16v14H4z M12 5v14 M4 12h16", arredo: "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3 M3 11h18v6H3z M5 17v2 M19 17v2", misura: "M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2",
  sezione: "M4 20V10l8-6 8 6v10 M2 14h3 M8 14h3 M13 14h3 M19 14h3", area: "M4 7l8-3 8 5-2 11H6z",
  appunto: "M4 4h16v12H8l-4 4z", altezza: "M12 4v15 M8.5 7.5L12 4l3.5 3.5 M4 20h16", foro: "M3 3h18v18H3z M8 8h2.5 M13.5 8H16v2.5 M16 13.5V16h-2.5 M10.5 16H8v-2.5 M8 10.5V8", foto: "M4 6h16v12H4z M8 14l3-3 3 3 2-2 4 4",
};
const Ico = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const ATTREZZI: [Strumento, string, string][] = [["sposta", "Sposta", "V"], ["muro", "Muro", "M"], ["stanza", "Stanza", "S"], ["foro", "Buco", "B"], ["porta", "Porta", "P"], ["finestra", "Finestra", "F"], ["arredo", "Arredo", "A"], ["misura", "Misura", "Q"], ["altezza", "Altezza", "H"], ["sezione", "Sezione", "X"], ["area", "Area", "G"], ["appunto", "Appunto", "N"]];
const AIUTO: Partial<Record<Strumento, string>> = {
  sposta: "Clic per scegliere, trascina per spostare. Canc elimina, R ruota",
  muro: "Clic per ogni angolo · scrivi una misura e Invio per un tratto esatto · doppio clic per finire",
  stanza: "Trascina da un angolo all'altro (misure interne)",
  foro: "Trascina un rettangolo: lì il pavimento si apre, per la scala che sale da sotto",
  porta: "Clic sopra un muro", finestra: "Clic sopra un muro", arredo: "Clic dove va il centro",
  misura: "Clic sul primo punto e sul secondo", altezza: "Clic su un punto: quanto spazio c'è sopra la testa",
  sezione: "Clic su due punti: vedi la casa tagliata in piedi lungo quella linea", area: "Clic per ogni angolo · clic sul primo punto, doppio clic o Invio per chiudere", calibra: "Clic su due punti della foto di cui sai la distanza vera",
  foto: "Trascina la foto per metterla al suo posto",
};

export default function Editor({ iniziale }: { iniziale: Progetto }) {
  const id = iniziale.id;
  const [p, setP] = useState(iniziale);
  const [testo, setTesto] = useState(iniziale.testo);
  const M = useMemo(() => leggi(testo, p.modelli), [testo, p.modelli]);
  const mesh = useMesh(`/api/studio?id=${iniziale.id}&modelli=1`, Object.values(p.modelli ?? {}).map(m => m.chiave).join());
  const [piano, setPiano] = useState(M.piani[0]?.id ?? "terra");
  const [vista, setVista] = useState<"pianta" | "divisa" | "3d">("pianta");
  const [parte, setParte] = useState(0.5);                                   // vista divisa: quanto spazio ha la pianta
  const [strumento, setStrumento] = useState<Strumento>("sposta");
  const [cosa, setCosa] = useState("divano");
  const [modoAppunto, setModoAppunto] = useState<"punto" | "linea" | "zona">("punto");
  const [modoAlto, setModoAlto] = useState<"punto" | "linea" | "quota">("punto");   // in un punto, lungo una linea, o lungo una linea da una quota fissa
  const [quotaA, setQuotaA] = useState(0);                                  // la quota fissa, in cm dal pavimento del piano (di serie: dove poggi i piedi in A)
  const [profilo, setProfilo] = useState<{ piano: string; a: Pt; b: Pt; L: number; punti: Campione[] } | null>(null);
  const [sAlto, setSAlto] = useState<number | null>(null);                 // dove passi sul grafico, in cm da A
  const [sel, setSel] = useState<number | null>(null);
  const [evid, setEvid] = useState<number[]>([]);
  const [sx, setSx] = useState<"codice" | "foto" | "versioni">("codice");
  const [dx, setDx] = useState<"appunti" | "superfici" | "claude">("appunti");
  const [aperto, setAperto] = useState<"" | "sx" | "dx">("");
  const [quote, setQuote] = useState(true), [vediPassaggi, setVediPassaggi] = useState(false), [tetto, setTetto] = useState(true);
  const [filtro, setFiltro] = useState<"da fare" | "tutti">("da fare");
  const [notaSel, setNotaSel] = useState<string | null>(null);
  const [bozza, setBozza] = useState<{ tipo: "appunto"; a: Pt; b?: Pt; forma: "punto" | "linea" | "zona"; piano?: string } | { tipo: "calibra"; a: Pt; b: Pt } | { tipo: "pubblica" } | null>(null);
  const [scritto, setScritto] = useState("");
  const [avviso, setAvviso] = useState<{ t: string; claude?: boolean; azione?: [string, () => void] } | null>(null);
  const [scorciatoie, setScorciatoie] = useState(false);
  const copiato = useRef<string | null>(null);                               // Ctrl+C / Ctrl+V di un elemento
  const [stato, setStato] = useState<"salvato" | "salvo" | "errore">("salvato");
  const [fotoAttiva, setFotoAttiva] = useState<string | null>(null);
  const [centra, setCentra] = useState<{ p: Pt; n: number }>();
  const [adatta, setAdatta] = useState(0);
  const [vai, setVai] = useState<{ riga: number; n: number }>();
  const [volo, setVolo] = useState<Volo>({ tipo: "panoramica", n: 0 });
  const [storia, setStoria] = useState<{ rev: number; chi: string; quando: number; righe: number }[] | null>(null);
  const [catalogo, setCatalogo] = useState(false);
  const [alto, setAlto] = useState<{ p: Pt; piano: string; r: Altezza } | null>(null);   // l'ultima altezza libera misurata
  const [taglio, setTaglio] = useState<[Pt, Pt] | null>(null);              // la linea dell'ultima sezione
  const [misArea, setMisArea] = useState<{ piano: string; pts: Pt[] } | null>(null);
  const [p3, setP3] = useState<{ piano: string; pts: Pt[] } | null>(null);   // i punti già messi in 3D (muro, area, linea, rettangolo)
  const [cur3, setCur3] = useState<Colpo | null>(null);                     // dove punta il mouse in 3D, con un attrezzo in mano
  const [opzMuro, setOpzMuro] = useState({ spessore: 20, a: "", b: "" });   // a, b vuote = altezza del piano
  const [inCorso, setInCorso] = useState(false);                             // un muro a metà: Esc e Backspace sono suoi
  const traccia = useRef<((t: Traccia | null) => void) | null>(null);        // la pianta passa al 3D il muro in corso
  const centro = useRef<HTMLElement>(null);

  const R = useRef({ testo, rev: iniziale.rev, sporco: false, inVolo: false, timer: 0 as unknown as ReturnType<typeof setTimeout>, visto: Math.max(0, ...iniziale.attivita.map(a => a.quando)), passato: [] as string[], futuro: [] as string[], ultimoPush: 0, nuova: false });

  const mostra = useCallback((t: string, claude = false, azione?: [string, () => void]) => { setAvviso({ t, claude, azione }); setTimeout(() => setAvviso(a => (a?.t === t ? null : a)), claude || azione ? 6000 : 3500); }, []);

  const invia = useCallback(async () => {
    const r = R.current;
    if (r.inVolo) { r.timer = setTimeout(() => invia(), 300); return; }
    r.inVolo = true;
    r.sporco = false;
    setStato("salvo");
    const res = await rpc("salva", { id, testo: r.testo, baseRev: r.rev });
    r.inVolo = false;
    if (res.ok) { r.rev = res.doc.rev; setP(res.doc); setStato(r.sporco ? "salvo" : "salvato"); return; }
    if (res.stato === 409) {
      const doc = await fetch(`/api/studio?id=${id}`).then(x => x.json());
      applica(doc, true);
      mostra("Claude ha cambiato il progetto mentre scrivevi: c'è la sua versione. Ctrl+Z per riprendere la tua.", true);
      setStato("salvato");
    } else { setStato("errore"); mostra(res.errore); r.sporco = true; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mostra]);

  /** Il punto da cui passa ogni modifica del testo fatta qui. */
  const cambia = useCallback((nuovo: string, scrivendo = false) => {
    const r = R.current;
    if (nuovo === r.testo) return;
    if (!scrivendo || Date.now() - r.ultimoPush > 900) r.passato.push(r.testo);
    r.passato = r.passato.slice(-200);
    r.ultimoPush = Date.now();
    r.futuro = [];
    r.testo = nuovo;
    setTesto(nuovo);
    r.sporco = true;
    setStato("salvo");
    clearTimeout(r.timer);
    r.timer = setTimeout(() => invia(), 600);
  }, [invia]);

  function applica(doc: Progetto, forza = false) {
    const r = R.current;
    r.rev = doc.rev;
    setP(doc);
    if (doc.testo !== r.testo && (forza || !r.sporco)) { r.passato.push(r.testo); r.testo = doc.testo; setTesto(doc.testo); }
    const nuove = doc.attivita.filter(a => a.quando > r.visto && a.chi !== "io");
    if (!nuove.length) return;
    r.visto = Math.max(...nuove.map(a => a.quando));
    const righe = nuove.flatMap(a => a.righe ?? []);
    if (righe.length) {
      setEvid(righe);
      setTimeout(() => setEvid([]), 8000);
      const M2 = leggi(doc.testo), sul = M2.el.filter(e => righe.includes(e.riga)).map(e => e.piano);
      if (sul.length) setPiano(pp => (sul.includes(pp) ? pp : sul[0]));
    }
    mostra(`${CHI[nuove[0].chi]}: ${nuove[0].cosa}`, nuove[0].chi === "claude");
  }

  useEffect(() => {                                  // guarda se Claude o il cliente hanno cambiato qualcosa
    const t = setInterval(async () => {
      const r = R.current;
      if (r.inVolo || document.hidden) return;
      const res = await fetch(`/api/studio?id=${id}&rev=${r.rev}`).catch(() => null);
      if (res?.status === 200 && !R.current.inVolo) applica(await res.json());
      const v = res?.headers.get("x-versione");
      if (v && process.env.VERSIONE && v !== process.env.VERSIONE && !r.nuova) {   // è uscita una versione nuova: si ricarica dopo aver salvato
        r.nuova = true;
        const ricarica = () => { if (R.current.sporco || R.current.inVolo) setTimeout(ricarica, 300); else location.reload(); };
        setAvviso({ t: "È uscita una versione nuova di Abita", azione: ["Ricarica", ricarica] });
      }
    }, 3000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const annulla = () => { const r = R.current, t = r.passato.pop(); if (t === undefined) return; r.futuro.push(r.testo); r.testo = t; setTesto(t); r.sporco = true; clearTimeout(r.timer); r.timer = setTimeout(() => invia(), 600); };
  const rifai = () => { const r = R.current, t = r.futuro.pop(); if (t === undefined) return; r.passato.push(r.testo); r.testo = t; setTesto(t); r.sporco = true; clearTimeout(r.timer); r.timer = setTimeout(() => invia(), 600); };

  const scegli = (riga: number | null) => { setSel(riga); if (riga != null) setVai({ riga, n: Date.now() }); };
  const elSel = sel != null ? M.el.find(e => e.riga === sel) : undefined;
  const nuovaRiga = (riga: string, pq = piano) => { const r = aggiungi(R.current.testo, M, pq, riga); cambia(r.testo); setSel(r.riga); setVai({ riga: r.riga, n: Date.now() }); };

  const hPiano = M.piani.find(x => x.id === piano)?.altezza ?? 270, qPiano = M.piani.find(x => x.id === piano)?.quota ?? 0;
  const hA = parseFloat(opzMuro.a) > 0 ? parseFloat(opzMuro.a) : hPiano, hB = parseFloat(opzMuro.b) > 0 ? parseFloat(opzMuro.b) : hA;

  const elimina = (riga: number) => {
    const e = M.el.find(x => x.riga === riga);
    cambia(togli(R.current.testo, riga));
    setSel(null);
    mostra(`Eliminato: ${e ? titolo(e) : "elemento"}`, false, ["Annulla", annulla]);
  };
  /** Un arredo lasciato in pianta o in 3D: si sposta e, se l'ancoraggio a un muro l'ha girato, prende la nuova rotazione. */
  const posa = (riga: number, dx: number, dy: number, gr?: number) => {
    let t = sposta(R.current.testo, riga, dx, dy);
    if (gr !== undefined) t = imposta(t, riga, "ruota", gr ? String(gr) : null);
    cambia(t);
  };
  /** Un piano nuovo in cima alla casa con i muri di quello che stai guardando: si parte dal perimetro e dai tramezzi già giusti. */
  const nuovoPiano = () => {
    const P = M.piani.find(x => x.id === piano);
    if (!P) return;
    const righe = R.current.testo.split("\n"), fine = M.piani.filter(x => x.riga > P.riga).map(x => x.riga).sort((a, b) => a - b)[0] ?? righe.length;
    const muri = righe.slice(P.riga + 1, fine).filter(r => /^\s*muro\b/.test(r)).map(r => "  " + r.trim());
    let nome = `${P.nome} copia`;
    for (let k = 2; M.piani.some(x => x.nome === nome); k++) nome = `${P.nome} copia ${k}`;
    cambia(R.current.testo.replace(/\s*$/, "") + `\n\npiano "${nome}" altezza ${P.altezza}\n` + (muri.length ? `  # muri copiati da ${P.nome}\n${muri.join("\n")}\n` : ""));
    setPiano(slug(nome));
    mostra(`Nuovo piano con ${muri.length} muri di ${P.nome}: rinominalo nel testo`, false, ["Annulla", annulla]);
  };
  const duplica = (riga: number) => nuovaRiga(sposta(M.righe[riga].trim(), 0, 30, 30));
  const incolla = () => { if (!copiato.current) return; const r = sposta(copiato.current, 0, 30, 30); copiato.current = r; nuovaRiga(r); };
  const bucoScala = (a: Arredo) => {
    const su = pianoSopra(M, a.piano);
    if (!su) return;
    const q = angoli(a), f = foroIn(M, su.id, { x: Math.min(...q.map(v => v.x)), y: Math.min(...q.map(v => v.y)) }, { x: Math.max(...q.map(v => v.x)), y: Math.max(...q.map(v => v.y)) });
    cambia(aggiungi(R.current.testo, M, su.id, f.riga).testo);
    mostra(f.ok ? `Buco aperto nel pavimento del piano ${su.nome}` : `Buco aperto al piano ${su.nome}, ma esce dalla stanza ${f.stanza}: stringilo`, false, ["Guarda", () => setPiano(su.id)]);
  };

  function disegnato(c: Strumento, pts: Pt[], pq = piano) {
    const [a, b] = pts, aggiungiQui = (t: string) => nuovaRiga(t, pq);
    switch (c) {
      case "muro": {
        const chiuso = pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1;
        aggiungiQui(`muro ${scriviPunti(chiuso ? pts.slice(0, -1) : pts)}${chiuso ? " chiudi" : ""} spessore ${opzMuro.spessore}`
          + (hA !== hPiano || hB !== hA ? ` altezza ${hA}` : "") + (hB !== hA ? ` fino ${hB}` : ""));
        return;
      }
      case "stanza": {
        const n = M.el.filter(e => e.tipo === "stanza").length + 1;
        aggiungiQui(`stanza "Stanza ${n}" ${fmt(Math.min(a.x, b.x))},${fmt(Math.min(a.y, b.y))} ${fmt(Math.max(a.x, b.x))},${fmt(Math.max(a.y, b.y))} pavimento gres`);
        return;
      }
      case "foro": {
        const f = foroIn(M, pq, a, b);
        aggiungiQui(f.riga);
        if (!f.ok) mostra(`Il buco esce dalla stanza ${f.stanza}: stringilo, se no il pavimento non si apre`);
        return;
      }
      case "porta": case "finestra": {
        const q = suMuro(M, pq, a);
        if (!q) { mostra("Clicca sopra un muro"); return; }
        aggiungiQui(`${c} ${c === "porta" ? 80 : 120} a ${q.x},${q.y}`);
        return;
      }
      case "arredo": aggiungiQui(`${cosa} a ${fmt(a.x)},${fmt(a.y)}`); return;
      case "misura": aggiungiQui(`misura ${fmt(a.x)},${fmt(a.y)} ${fmt(b.x)},${fmt(b.y)}`); return;
      case "altezza":
        if (b) { if (Math.hypot(b.x - a.x, b.y - a.y) > 10) { const pr = profiloAltezza(M, pq, a, b, mesh); setProfilo({ piano: pq, a, b, ...pr }); setQuotaA(pr.punti[0].base); setSAlto(null); } }
        else setAlto({ p: a, piano: pq, r: altezzaLibera(M, pq, a, mesh) });
        return;
      case "sezione": if (Math.hypot(b.x - a.x, b.y - a.y) > 20) setTaglio([a, b]); return;
      case "area": setMisArea({ piano: pq, pts: pts.length > 3 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1 ? pts.slice(0, -1) : pts }); return;
      case "appunto": setBozza({ tipo: "appunto", a, b, forma: modoAppunto, piano: pq }); setScritto(""); return;
      case "calibra": setBozza({ tipo: "calibra", a, b }); setScritto(""); return;
    }
  }

  // in 3D gli attrezzi funzionano come in pianta: il clic cade sul pavimento, sul muro o sul gradino che tocchi
  const DUE: Strumento[] = ["misura", "sezione", "stanza", "foro"];
  const aggancia3d = (q: Pt, pq: string, prima?: Pt): Pt => {
    const vicino = (w: Pt) => Math.hypot(w.x - q.x, w.y - q.y) < 15;
    if (p3 && p3.pts.length > 1 && vicino(p3.pts[0])) return p3.pts[0];       // per chiudere
    for (const e of M.el) if (e.piano === pq && (e.tipo === "muro" || e.tipo === "stanza" || e.tipo === "area")) { const w = e.punti.find(vicino); if (w) return w; }
    const s = { x: Math.round(q.x / 5) * 5, y: Math.round(q.y / 5) * 5 };
    if (prima) {                                                              // quasi in squadra: dritto
      const dx = s.x - prima.x, dy = s.y - prima.y;
      if (Math.abs(dx) < Math.abs(dy) * 0.18) s.x = prima.x; else if (Math.abs(dy) < Math.abs(dx) * 0.18) s.y = prima.y;
    }
    return s;
  };
  const libero3d = strumento === "altezza" && modoAlto === "punto" || strumento === "appunto" && modoAppunto === "punto";   // dove tocchi, senza agganci
  const punto3d = (q: Colpo, doppio: boolean) => {
    const c = strumento, pts = p3?.piano === q.piano ? p3.pts : [];
    if (libero3d || c === "porta" || c === "finestra" || c === "arredo") { disegnato(c, [libero3d ? q.p : aggancia3d(q.p, q.piano)], q.piano); return; }
    const s3 = aggancia3d(q.p, q.piano, pts[pts.length - 1]);
    if (c === "muro" || c === "area") {
      const ultimo = pts[pts.length - 1], chiude = pts.length >= 2 && Math.hypot(s3.x - pts[0].x, s3.y - pts[0].y) < 1;
      if ((doppio || chiude) && pts.length) {
        const fin = [...pts, ...(Math.hypot(s3.x - ultimo.x, s3.y - ultimo.y) > 1 ? [s3] : [])];
        if (fin.length >= (c === "area" ? 3 : 2)) disegnato(c, fin, q.piano);
        setP3(null);
      } else setP3({ piano: q.piano, pts: [...pts, s3] });
      return;
    }
    if (DUE.includes(c) || c === "appunto" || c === "altezza") {
      if (!pts.length) { setP3({ piano: q.piano, pts: [s3] }); return; }
      setP3(null);
      disegnato(c, [pts[0], s3], q.piano);
    }
  };

  async function salvaBozza() {
    if (!bozza) return;
    if (bozza.tipo === "appunto") {
      if (!scritto.trim()) return;
      const r = await rpc("appunto", { id, piano: bozza.piano ?? piano, tipo: bozza.forma, a: bozza.a, b: bozza.b, testo: scritto });
      if (r.ok) { applica(r.doc); setDx("appunti"); } else mostra(r.errore);
    } else if (bozza.tipo === "calibra") {
      const f = p.foto.find(x => x.id === fotoAttiva), reale = parseFloat(scritto.replace(",", "."));
      const mis = Math.hypot(bozza.b.x - bozza.a.x, bozza.b.y - bozza.a.y);
      if (!f || !(reale > 0) || mis < 1) { mostra("Scrivi la distanza vera in centimetri"); return; }
      const k = reale / mis, a = bozza.a;                  // ingrandisco intorno al primo punto, che resta fermo
      const r = await rpc("cambiaFoto", { id, fid: f.id, scala: f.scala * k, x: a.x + (f.x - a.x) * k, y: a.y + (f.y - a.y) * k });
      if (r.ok) { applica(r.doc); mostra("Foto in scala"); setStrumento("foto"); } else mostra(r.errore);
    } else {
      const r = await rpc("pubblica", { id, nota: scritto });
      if (r.ok) { applica(r.doc); mostra(`Pubblicata la versione ${r.doc.pubblicato?.versione}: il cliente la vede già`); } else mostra(r.errore);
    }
    setBozza(null);
  }

  // tastiera: attrezzi, elimina, ruota, annulla
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const dentroCampo = (e.target as HTMLElement | null)?.closest?.("input, textarea, select");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !dentroCampo) { e.preventDefault(); if (e.shiftKey) rifai(); else annulla(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !dentroCampo) { e.preventDefault(); rifai(); return; }
      if ((e.ctrlKey || e.metaKey) && !dentroCampo && !e.shiftKey && !e.altKey) {
        const t = e.key.toLowerCase();
        if (t === "d" && sel != null) { e.preventDefault(); duplica(sel); return; }
        if (t === "c" && sel != null && !getSelection()?.toString()) { copiato.current = M.righe[sel].trim(); navigator.clipboard?.writeText(copiato.current).catch(() => {}); mostra("Copiato: Ctrl+V per incollarlo su questo piano"); return; }
        if (t === "v" && copiato.current) { e.preventDefault(); incolla(); return; }
      }
      if (dentroCampo || e.ctrlKey || e.metaKey || e.altKey) return;
      if (inCorso) return;                                   // la pianta sta disegnando: i tasti li gestisce lei
      if (p3?.pts.length) {                                  // un disegno a metà in 3D
        if (e.key === "Escape") { setP3(null); return; }
        if (e.key === "Backspace") { e.preventDefault(); setP3({ ...p3, pts: p3.pts.slice(0, -1) }); return; }
        if (e.key === "Enter" && (strumento === "muro" || strumento === "area")) { if (p3.pts.length >= (strumento === "area" ? 3 : 2)) disegnato(strumento, p3.pts, p3.piano); setP3(null); return; }
      }
      if (e.key === "?") { setScorciatoie(x => !x); return; }
      if (e.key === "Escape") { if (scorciatoie) { setScorciatoie(false); return; } setStrumento("sposta"); setSel(null); setBozza(null); setCatalogo(false); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && sel != null && strumento === "sposta") { e.preventDefault(); elimina(sel); return; }
      if (e.key.startsWith("Arrow") && sel != null && strumento === "sposta") {    // frecce, in pianta e in 3D: 1 cm, con Maiusc 10 cm
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        cambia(sposta(R.current.testo, sel, e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0), true);
        return;
      }
      if (e.key.toLowerCase() === "r" && elSel?.tipo === "arredo") { cambia(imposta(R.current.testo, elSel.riga, "ruota", String((elSel.ruota + 90) % 360))); return; }
      const a = ATTREZZI.find(x => x[2].toLowerCase() === e.key.toLowerCase());
      if (a) { setStrumento(a[0]); setCatalogo(a[0] === "arredo"); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const es = useMemo(() => (vediPassaggi ? passaggi(M, piano, mesh) : null), [vediPassaggi, M, piano, mesh]);
  const appunti = useMemo(() => p.appunti.map((a, i) => ({ ...a, n: i + 1 })), [p.appunti]);
  const rie = useMemo(() => (dx === "superfici" ? riepilogo(M) : null), [dx, M]);
  const sez = useMemo(() => (strumento === "sezione" && taglio ? sezione(M, taglio[0], taglio[1], mesh) : null), [strumento, taglio, M, mesh]);
  const areaQui = strumento === "area" && misArea && (misArea.piano === piano || vista === "3d") ? misArea.pts : null;
  useEffect(() => { setP3(null); setCur3(null); }, [strumento]);
  // il muro che stai tirando in 3D, con il suo spessore (come quando lo tiri in pianta)
  useEffect(() => {
    if (strumento !== "muro") return;
    if (!p3) { traccia.current?.(null); return; }
    const fine = cur3 && cur3.piano === p3.piano ? aggancia3d(cur3.p, p3.piano, p3.pts[p3.pts.length - 1]) : null;
    traccia.current?.({ pts: fine ? [...p3.pts, fine] : p3.pts, spessore: opzMuro.spessore, a: hA, b: hB, quota: M.piani.find(x => x.id === p3.piano)?.quota ?? 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p3, cur3, strumento]);
  const disegno3d = useMemo((): Disegno3D | null => {
    if (vista === "pianta") return null;
    const Q = (id: string) => M.piani.find(x => x.id === id)?.quota ?? 0, d: Required<Disegno3D> = { linee: [], veli: [], scritte: [] };
    const giro = (pts: Pt[], z: number) => pts.map(q => [q.x, q.y, z] as [number, number, number]);
    const centro = (pts: Pt[]) => ({ x: pts.reduce((t, q) => t + q.x, 0) / pts.length, y: pts.reduce((t, q) => t + q.y, 0) / pts.length });
    const mq = (pts: Pt[]) => `${(Math.abs(area2(pts)) / 1e4).toFixed(2).replace(".", ",")} m²`;
    if (strumento === "altezza" && modoAlto !== "punto" && profilo && !p3) {    // il profilo: un velo dal pavimento (o dalla quota fissa) al soffitto lungo la linea
      const z0 = Q(profilo.piano), { a, b, L, punti } = profilo, at = (s: number) => ({ x: a.x + ((b.x - a.x) * s) / L, y: a.y + ((b.y - a.y) * s) / L });
      const rif = modoAlto === "quota" ? quotaA : null, giuDi = (c: Campione) => (rif === null ? c.base : Math.max(rif, c.base));
      if (rif !== null) d.linee.push({ pts: [[a.x, a.y, z0 + rif], [b.x, b.y, z0 + rif]] });   // la quota fissa, dritta da A a B
      let giu: [number, number, number][] = [], su: [number, number, number][] = [];
      const chiudi = () => { if (giu.length > 1) d.linee.push({ pts: giu }, { pts: su }); giu = []; su = []; };
      punti.forEach((c, i) => {
        if (c.libera === null || c.cima === null) { chiudi(); return; }
        const q = at(c.s);
        giu.push([q.x, q.y, z0 + giuDi(c)]); su.push([q.x, q.y, z0 + c.cima]);
        const n = punti[i + 1];
        if (n && n.libera !== null && n.cima !== null) { const r = at(n.s); d.veli.push([[q.x, q.y, z0 + giuDi(c)], [r.x, r.y, z0 + giuDi(n)], [r.x, r.y, z0 + n.cima], [q.x, q.y, z0 + c.cima]]); }
      });
      chiudi();
      const min = piuBasso(punti, rif);
      const qui = sAlto === null ? min : punti.reduce((m, c) => (Math.abs(c.s - sAlto) < Math.abs(m.s - sAlto) ? c : m), punti[0]);
      const v = qui && daQuota(qui, rif).v;
      if (qui && v != null && qui.cima !== null) {
        const q = at(qui.s), z1 = rif ?? qui.base, conta = rif !== null || qui.piedi;
        d.linee.push({ pts: [[q.x - 12, q.y, z0 + qui.cima], [q.x + 12, q.y, z0 + qui.cima]] }, { pts: [[q.x, q.y, z0 + z1], [q.x, q.y, z0 + qui.cima]] });
        d.scritte.push({ p: [q.x, q.y, z0 + (z1 + qui.cima) / 2], testo: `${metri(v)} m`, tono: conta && v < 200 ? "basso" : conta && v < 210 ? "giusto" : undefined });
      }
      d.scritte.push({ p: [a.x, a.y, z0 + 10], testo: "A" }, { p: [b.x, b.y, z0 + 10], testo: "B" });
    }
    if (strumento === "altezza" && modoAlto === "punto" && alto) {           // l'asta dell'altezza libera, dai piedi alla testa
      const z0 = Q(alto.piano), { p: q, r } = alto, top = r.cima ?? r.base + 300;
      if (!r.buco) {
        d.linee.push({ pts: [[q.x, q.y, z0 + r.base], [q.x, q.y, z0 + top]] }, { pts: [[q.x - 12, q.y, z0 + top], [q.x + 12, q.y, z0 + top]] }, { pts: [[q.x - 12, q.y, z0 + r.base], [q.x + 12, q.y, z0 + r.base]] });
        const L = r.libera, piedi = !r.sotto.startsWith("sopra ");
        d.scritte.push({ p: [q.x, q.y, z0 + (r.base + top) / 2], testo: L === null ? "aperto" : `${metri(L)} m`, tono: piedi && L !== null && L < 200 ? "basso" : piedi && L !== null && L < 210 ? "giusto" : undefined });
      } else d.scritte.push({ p: [q.x, q.y, z0 + 20], testo: "buco nel pavimento" });
    }
    if (strumento === "area" && misArea && !p3) {
      const z = Q(misArea.piano) + 3;
      d.linee.push({ pts: giro(misArea.pts, z), chiusa: true });
      d.veli.push(giro(misArea.pts, z));
      const c = centro(misArea.pts);
      d.scritte.push({ p: [c.x, c.y, z], testo: mq(misArea.pts) });
    }
    if (strumento === "sezione" && taglio && sez && !p3) {                    // il piano di taglio, in piedi lungo la linea
      const [a, b] = taglio, z0 = sez.z0, z1 = sez.z1 + 40;
      const v: [number, number, number][] = [[a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1], [a.x, a.y, z1]];
      d.veli.push(v);
      d.linee.push({ pts: v, chiusa: true });
      d.scritte.push({ p: [a.x, a.y, z1], testo: "A" }, { p: [b.x, b.y, z1], testo: "B" });
    }
    if (strumento !== "sposta" && strumento !== "foto" && (p3 || cur3)) {   // il disegno in corso fino al mouse
      const pq = p3?.piano ?? cur3!.piano, z = Q(pq) + 3, pts = p3?.pts ?? [];
      const fine = cur3 && cur3.piano === pq ? (libero3d || strumento === "porta" || strumento === "finestra" ? cur3.p : aggancia3d(cur3.p, pq, pts[pts.length - 1])) : null;
      const zc = libero3d && cur3 ? cur3.z : z;
      if (fine) d.linee.push({ pts: [[fine.x - 15, fine.y, zc], [fine.x + 15, fine.y, zc]] }, { pts: [[fine.x, fine.y - 15, zc], [fine.x, fine.y + 15, zc]] }, { pts: [[fine.x, fine.y, zc], [fine.x, fine.y, zc + 30]] });
      const catena = fine ? [...pts, fine] : pts;
      if ((strumento === "stanza" || strumento === "foro" || strumento === "appunto" && modoAppunto === "zona") && catena.length === 2) {
        const [a, b] = catena, r4 = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
        d.linee.push({ pts: giro(r4, z), chiusa: true });
        d.veli.push(giro(r4, z));
        d.scritte.push({ p: [(a.x + b.x) / 2, (a.y + b.y) / 2, z], testo: `${Math.round(Math.abs(b.x - a.x))} × ${Math.round(Math.abs(b.y - a.y))}` });
      } else if (catena.length >= 2) {
        d.linee.push({ pts: giro(catena, z), chiusa: strumento === "area" && catena.length >= 3 });
        if (strumento === "area" && catena.length >= 3) { d.veli.push(giro(catena, z)); const c = centro(catena); d.scritte.push({ p: [c.x, c.y, z], testo: mq(catena) }); }
        const a = catena[catena.length - 2], b = catena[catena.length - 1];
        d.scritte.push({ p: [b.x, b.y, z + 25], testo: `${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} cm` });
      }
    }
    return d;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, strumento, alto, misArea, taglio, sez, p3, cur3, M, modoAppunto, modoAlto, profilo, sAlto, quotaA]);
  const visibili = appunti.filter(a => filtro === "tutti" || a.stato === "da fare").slice().reverse();
  const ultimoClaude = p.attivita.find(a => a.chi === "claude")?.quando;
  const claudeAttivo = !!ultimoClaude && Date.now() - ultimoClaude < 90_000;
  const pubblicato = p.pubblicato?.testo === testo;
  const link = typeof window === "undefined" ? `/v/${p.share}` : `${location.origin}/v/${p.share}`;

  async function caricaFoto(file: File) {
    const bmp = await createImageBitmap(file), s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const r = await rpc("foto", { id, nome: file.name, dati: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height, piano });
    if (r.ok) { applica(r.doc); const f = r.doc.foto[r.doc.foto.length - 1]; setFotoAttiva(f.id); mostra("Foto caricata: ora mettila in scala"); } else mostra(r.errore);
  }
  const cambiaFoto = async (fid: string, c: Partial<Foto>) => { const r = await rpc("cambiaFoto", { id, fid, ...c }); if (r.ok) applica(r.doc); else mostra(r.errore); };
  const cambiaNota = async (aid: string, c: object) => { const r = await rpc("cambiaAppunto", { id, aid, ...c }); if (r.ok) applica(r.doc); else mostra(r.errore); };
  const vaiNota = (a: Appunto) => { setNotaSel(a.id); if (a.piano !== piano) setPiano(a.piano); versoPianta(); setCentra({ p: a.a, n: Date.now() }); };

  // vista divisa: si ricorda tra una visita e l'altra (solo su questo browser)
  const ricorda = (k: string, v: string) => { try { localStorage.setItem("abita:" + k, v); } catch {} };
  useEffect(() => {
    try {
      const k = parseFloat(localStorage.getItem("abita:parte") ?? "");
      if (k >= 0.25 && k <= 0.75) setParte(k);
      if (localStorage.getItem("abita:vista") === "divisa" && matchMedia("(min-width: 721px)").matches) { setVista("divisa"); setTimeout(() => setAdatta(n => n + 1), 120); }
    } catch {}
  }, []);
  const scegliVista = (v: typeof vista) => {
    setVista(v);
    ricorda("vista", v);
    if (v !== "3d" && piano === "tutti") setPiano(M.piani[0]?.id ?? "terra");
    if (v !== "3d") setTimeout(() => setAdatta(n => n + 1), 60);              // dopo che la pianta ha preso la sua nuova misura
  };
  const versoPianta = () => setVista(v => (v === "3d" ? "pianta" : v));
  const trascinaDivisore = (e: Puntatore<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const muovi = (ev: PointerEvent) => {
      const r = centro.current!.getBoundingClientRect(), alto = r.height > r.width;
      setParte(Math.min(0.75, Math.max(0.25, alto ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width)));
    };
    const fine = () => { el.removeEventListener("pointermove", muovi); el.removeEventListener("pointerup", fine); el.removeEventListener("pointercancel", fine); setParte(k => (ricorda("parte", String(k)), k)); };
    el.addEventListener("pointermove", muovi);
    el.addEventListener("pointerup", fine);
    el.addEventListener("pointercancel", fine);
  };
  const tastoDivisore = (e: TastoReact<HTMLDivElement>) => {
    const d = { ArrowLeft: -0.05, ArrowUp: -0.05, ArrowRight: 0.05, ArrowDown: 0.05, Home: -1, End: 1 }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    setParte(k => { const n = Math.min(0.75, Math.max(0.25, k + d)); ricorda("parte", String(n)); return n; });
  };

  useEffect(() => { if (sx === "versioni") rpc("storia", { id }).then(r => r.ok && setStoria(r.doc as unknown as typeof storia)); }, [sx, id, p.rev]);
  useEffect(() => { if (piano !== "tutti" && !M.piani.some(x => x.id === piano) && M.piani[0]) setPiano(M.piani[0].id); }, [M, piano]);

  const comandiPianta = <div className="vetro" style={{ display: "flex", gap: 4 }}>
    <button className="btn piccolo" aria-pressed={quote} onClick={() => setQuote(!quote)}>Quote</button>
    <button className="btn piccolo" aria-pressed={vediPassaggi} onClick={() => setVediPassaggi(!vediPassaggi)}>Passaggi{es ? (es.problemi.length ? ` (${es.problemi.length})` : ", ok") : ""}</button>
    <button className="btn piccolo" onClick={() => setAdatta(n => n + 1)}>Adatta</button>
  </div>;
  const comandi3D = <div className="vetro" style={{ display: "flex", gap: 4 }}>
    <button className="btn piccolo" onClick={() => setVolo({ tipo: "panoramica", n: Date.now() })}>Panoramica</button>
    <button className="btn piccolo" onClick={() => setVolo({ tipo: "alto", n: Date.now() })}>Dall&apos;alto</button>
    {vista === "3d" && <button className="btn piccolo" aria-pressed={tetto} onClick={() => setTetto(!tetto)}>Tetto</button>}
  </div>;

  const attrezziUI = <>
          {strumento === "appunto" && <div className="galleggia" style={{ bottom: 80, left: "50%", transform: "translateX(-50%)" }}>
            <div className="segmenti vetro">{(["punto", "linea", "zona"] as const).map(m => <button key={m} aria-pressed={modoAppunto === m} onClick={() => setModoAppunto(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div>
          </div>}
          {strumento === "altezza" && <div className="galleggia" style={{ bottom: 80, left: "50%", transform: "translateX(-50%)" }}>
            <div className="segmenti vetro" role="group" aria-label="Altezza in un punto o lungo una linea">
              <button aria-pressed={modoAlto === "punto"} onClick={() => setModoAlto("punto")} title="Clic su un punto: quanto spazio c'è sopra la testa">Punto</button>
              <button aria-pressed={modoAlto === "linea"} onClick={() => setModoAlto("linea")} title="Clic su due punti: il grafico dell'altezza lungo la linea">Linea</button>
              <button aria-pressed={modoAlto === "quota"} onClick={() => setModoAlto("quota")} title="Il primo clic fissa la quota, il secondo tira la linea: quanto spazio c'è sopra quella quota">Da quota</button>
            </div>
          </div>}
          {strumento === "altezza" && modoAlto === "punto" && alto && (alto.piano === piano || vista === "3d") && <Alto r={alto.r} onChiudi={() => setAlto(null)} />}
          {strumento === "altezza" && modoAlto !== "punto" && profilo && <ProfiloAltezza L={profilo.L} punti={profilo.punti} s={sAlto} onS={setSAlto} onChiudi={() => setProfilo(null)}
            quota={modoAlto === "quota" ? quotaA : null} onQuota={setQuotaA} />}
          {areaQui && <Misurata pts={areaQui} onChiudi={() => setMisArea(null)} onStanza={() => {
            nuovaRiga(`stanza "Stanza ${M.el.filter(e => e.tipo === "stanza").length + 1}" ${scriviPunti(areaQui)} pavimento gres`, misArea?.piano);
            setMisArea(null); mostra("Stanza aggiunta: dalle il suo nome nel testo");
          }} />}
          {sez && <VistaSezione s={sez} onInverti={() => setTaglio(t => t && [t[1], t[0]])} onChiudi={() => setTaglio(null)} />}
          {catalogo && strumento === "arredo" && <Catalogo scelto={cosa} onScegli={k => { setCosa(k); setCatalogo(false); }} />}
          {strumento === "muro" && <div className="opzioni-muro vetro" role="group" aria-label="Opzioni del muro">
            <div className="gruppo">
              <span className="etichetta">Spessore</span>
              <div className="segmenti">{[10, 20, 30, 40].map(v => <button key={v} type="button" aria-pressed={opzMuro.spessore === v} onClick={() => setOpzMuro(o => ({ ...o, spessore: v }))}>{v}</button>)}</div>
              <input className="mini" inputMode="numeric" aria-label="Spessore su misura" value={[10, 20, 30, 40].includes(opzMuro.spessore) ? "" : opzMuro.spessore} placeholder="…"
                onChange={e => { const v = parseFloat(e.target.value); if (v > 0) setOpzMuro(o => ({ ...o, spessore: v })); }} />
            </div>
            <div className="gruppo">
              <span className="etichetta">Altezza</span>
              <label className="mini-campo">A<input className="mini" inputMode="numeric" placeholder={String(hPiano)} value={opzMuro.a} aria-label="Altezza al punto A"
                onChange={e => setOpzMuro(o => ({ ...o, a: e.target.value.replace(/[^\d.]/g, "") }))} /></label>
              <span aria-hidden="true" className="tenue">→</span>
              <label className="mini-campo">B<input className="mini" inputMode="numeric" placeholder={String(hA)} value={opzMuro.b} aria-label="Altezza al punto B"
                onChange={e => setOpzMuro(o => ({ ...o, b: e.target.value.replace(/[^\d.]/g, "") }))} /></label>
              {(opzMuro.a || opzMuro.b) && <button type="button" className="btn piccolo" onClick={() => setOpzMuro(o => ({ ...o, a: "", b: "" }))} title="Torna all'altezza del piano">Del piano</button>}
            </div>
            <Profilo a={hA} b={hB} scritte={false} />
            <p className="aiuto-muro">Clic per ogni angolo · scrivi una misura e Invio per un tratto esatto · Backspace toglie l&apos;ultimo punto · doppio clic per finire</p>
          </div>}
          {!bozza && !catalogo && !sez && !areaQui && AIUTO[strumento] && strumento !== "appunto" && strumento !== "altezza" && strumento !== "muro" && <div className="suggerimento vetro">{strumento === "arredo" ? `${cosa.replace("_", " ")}: clic dove va il centro` : AIUTO[strumento]}</div>}
          <nav className="attrezzi vetro" aria-label="Attrezzi">
            {ATTREZZI.map(([k, nome, tasto]) => (
              <button key={k} className={k === "appunto" ? "appunto" : undefined} aria-pressed={strumento === k} title={`${nome} (${tasto})`}
                onClick={() => { setStrumento(k); setCatalogo(k === "arredo" ? !(catalogo && strumento === "arredo") : false); }}>
                <Ico d={I[k as keyof typeof I]} /><span>{nome}</span>
              </button>
            ))}
          </nav>
  </>;

  return (
    <div className="ed">
      <header className="ed-top">
        <Link href="/studio" className="btn piccolo" aria-label="Tutti i progetti">←</Link>
        <button className="btn piccolo ed-mobile" onClick={() => setAperto(a => (a === "sx" ? "" : "sx"))}>Testo</button>
        <span className="nome" title={p.cliente}>{p.nome}</span>
        <span className="tenue piccolo nascondi-mobile">{p.cliente}</span>
        <Link href="/studio/guida" className={"stato-claude nascondi-mobile" + (claudeAttivo ? " attivo" : "")} style={{ textDecoration: "none" }} title="Come collegare Claude">
          <i />{claudeAttivo ? "Claude sta lavorando" : ultimoClaude ? `Claude, ${quanto(ultimoClaude)}` : "Collega Claude"}
        </Link>
        <span className="spazio" />
        <div className="storia-btn nascondi-mobile" role="group" aria-label="Cronologia">
          <button className="btn piccolo" onClick={annulla} disabled={!R.current.passato.length} title="Annulla (Ctrl+Z)" aria-label="Annulla">↶</button>
          <button className="btn piccolo" onClick={rifai} disabled={!R.current.futuro.length} title="Rifai (Ctrl+Shift+Z)" aria-label="Rifai">↷</button>
          <button className="btn piccolo" onClick={() => setScorciatoie(x => !x)} aria-pressed={scorciatoie} title="Scorciatoie da tastiera (?)" aria-label="Scorciatoie da tastiera">?</button>
        </div>
        <span className="tenue piccolo nascondi-mobile" aria-live="polite">{stato === "salvo" ? "Salvo…" : stato === "errore" ? "Non salvato" : "Salvato"}</span>
        {M.errori.length > 0 && <button className="btn piccolo pericolo" onClick={() => { setSx("codice"); setAperto("sx"); setVai({ riga: M.errori[0].riga, n: Date.now() }); }}>{M.errori.length} {M.errori.length === 1 ? "errore" : "errori"}</button>}
        <a className="btn piccolo nascondi-mobile" href={p.pubblicato ? `/v/${p.share}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!p.pubblicato}
          onClick={e => { if (!p.pubblicato) { e.preventDefault(); mostra("Il cliente vedrà il progetto dopo la prima pubblicazione"); } }}>Vista cliente</a>
        <button className="btn piccolo nascondi-mobile" onClick={() => navigator.clipboard.writeText(link).then(() => mostra("Link del cliente copiato"))}>Copia link</button>
        <a className="btn piccolo nascondi-mobile" href={`/studio/${id}/stampa?piano=${piano}`} target="_blank" rel="noreferrer" title="Pianta in scala 1:50 o 1:100, da stampare o salvare in PDF">Stampa</a>
        <button className={"btn piccolo" + (pubblicato ? "" : " primario")} onClick={() => { setBozza({ tipo: "pubblica" }); setScritto(""); }}>
          {pubblicato ? `Pubblicato v${p.pubblicato!.versione}` : p.pubblicato ? "Pubblica modifiche" : "Pubblica"}
        </button>
        <button className="btn piccolo ed-mobile" onClick={() => setAperto(a => (a === "dx" ? "" : "dx"))}>Appunti</button>
      </header>

      <aside className={"ed-pannello ed-sx" + (aperto === "sx" ? " aperto" : "")}>
        <div className="schede" role="tablist">
          {(["codice", "foto", "versioni"] as const).map(t => <button key={t} role="tab" aria-selected={sx === t} onClick={() => setSx(t)}>{{ codice: "Progetto in parole", foto: `Foto${p.foto.length ? ` (${p.foto.length})` : ""}`, versioni: "Versioni" }[t]}</button>)}
        </div>
        {sx === "codice" && <>
          <Codice testo={testo} errori={M.errori} sel={sel} evid={evid} vai={vai} onChange={t => cambia(t, true)}
            onRiga={r => { const e = M.el.find(x => x.riga === r); if (e) { setSel(r); if (e.piano !== piano) setPiano(e.piano); } }} />
          {M.errori.length > 0 && <div className="errori">{M.errori.map((e, i) => <button key={i} onClick={() => setVai({ riga: e.riga, n: Date.now() })}>Riga {e.riga + 1}: {e.msg}</button>)}</div>}
          <div className="blocco piccolo tenue" style={{ borderBottom: 0, borderTop: "1px solid var(--line)" }}>
            <span>Misure in cm. Le regole sono nella <Link href="/studio/guida" target="_blank">guida</Link>.</span>
          </div>
        </>}
        {sx === "foto" && <div className="scorre">
          <div className="blocco">
            <p className="piccolo tenue" style={{ margin: 0 }}>Carica la piantina del cliente o le foto delle stanze. Mettila in scala con due punti di cui sai la misura vera: poi ci ricalchi sopra, e anche Claude la può leggere.</p>
            <label className="btn primario" style={{ cursor: "pointer" }}>Carica una foto<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) caricaFoto(f); e.target.value = ""; }} /></label>
          </div>
          {p.foto.map(f => (
            <div className="blocco" key={f.id}>
              <div className="foto-card" style={{ borderColor: fotoAttiva === f.id ? "var(--accent)" : undefined }} onClick={() => setFotoAttiva(f.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/foto/${f.id}`} alt={f.nome} />
                <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                  <input value={f.nome} aria-label="Nome della foto" onChange={e => setP({ ...p, foto: p.foto.map(x => x.id === f.id ? { ...x, nome: e.target.value } : x) })} onBlur={e => cambiaFoto(f.id, { nome: e.target.value })} />
                  <div className="campi" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <label>Piano<select value={f.piano} onChange={e => cambiaFoto(f.id, { piano: e.target.value })}>{M.piani.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
                    <label>Rotazione<input type="number" step="0.5" defaultValue={f.rot} onBlur={e => cambiaFoto(f.id, { rot: +e.target.value })} /></label>
                  </div>
                  <label className="piccolo tenue">Trasparenza<input type="range" min="0.05" max="1" step="0.05" defaultValue={f.opacita} onChange={e => cambiaFoto(f.id, { opacita: +e.target.value })} /></label>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn piccolo" onClick={() => { setFotoAttiva(f.id); setPiano(f.piano); versoPianta(); setStrumento("calibra"); }}>Metti in scala</button>
                <button className="btn piccolo" aria-pressed={strumento === "foto" && fotoAttiva === f.id} onClick={() => { setFotoAttiva(f.id); setPiano(f.piano); versoPianta(); setStrumento("foto"); }}>Sposta</button>
                <button className="btn piccolo" onClick={() => cambiaFoto(f.id, { visibile: !f.visibile })}>{f.visibile ? "Nascondi" : "Mostra"}</button>
                <button className="btn piccolo pericolo" onClick={async () => { if (confirm(`Eliminare la foto ${f.nome}?`)) { const r = await rpc("togliFoto", { id, fid: f.id }); if (r.ok) applica(r.doc); } }}>Elimina</button>
              </div>
            </div>
          ))}
        </div>}
        {sx === "versioni" && <div className="scorre">
          <div className="blocco piccolo tenue">Le ultime 40 versioni del testo. Ripristinarne una crea una versione nuova: non perdi niente.</div>
          {storia?.map(v => (
            <div className="blocco" key={v.rev} style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}>
              <span><b style={{ color: v.chi === "claude" ? "var(--claude)" : undefined, fontWeight: 600 }}>{CHI[v.chi as keyof typeof CHI]}</b> <span className="tenue piccolo">{quanto(v.quando)}, {v.righe} righe</span></span>
              <button className="btn piccolo" onClick={async () => { const r = await rpc("ripristina", { id, rev: v.rev }); if (r.ok) applica(r.doc, true); }}>Ripristina</button>
            </div>
          ))}
        </div>}
      </aside>

      <main ref={centro} className={"ed-centro" + (vista === "divisa" ? " divisa" : "")} style={{ "--parte": `${parte * 100}%` } as CSSProperties}>
        {vista !== "3d" && <section className="lato lato-pianta" aria-label="Pianta">
          <Pianta modello={M} piano={piano} quote={quote} passaggi={es} modifica strumento={strumento} modoAppunto={modoAppunto} sel={sel} evid={evid}
            appunti={filtro === "tutti" ? appunti : appunti.filter(a => a.stato === "da fare" || a.id === notaSel)} notaSel={notaSel}
            segno={strumento === "altezza" && modoAlto === "punto" && alto?.piano === piano ? { p: alto.p, testo: alto.r.buco ? "buco" : alto.r.libera === null ? "aperto" : `${metri(alto.r.libera)} m`, basso: (alto.r.libera ?? 999) < 200 && !alto.r.sotto.startsWith("sopra ") } : null} foto={p.foto} fotoAttiva={fotoAttiva} centra={centra} adatta={adatta}
            area={areaQui} taglio={taglio} altezzaLinea={strumento === "altezza" && modoAlto !== "punto"}
            profilo={strumento === "altezza" && modoAlto !== "punto" && profilo && profilo.piano === piano ? { a: profilo.a, b: profilo.b, s: sAlto ?? piuBasso(profilo.punti, modoAlto === "quota" ? quotaA : null)?.s ?? null, L: profilo.L } : null}
            onSel={scegli} onSposta={posa}
            onVertici={(r, pts) => cambia(impostaPunti(R.current.testo, r, pts))} onDisegna={disegnato}
            muro={{ spessore: opzMuro.spessore, a: hA, b: hB }} onBozza={setInCorso}
            onRuota={(r, gr) => cambia(imposta(R.current.testo, r, "ruota", gr ? String(gr) : null))}
            onTraccia={c => traccia.current?.(c && { pts: c, spessore: opzMuro.spessore, a: hA, b: hB, quota: qPiano })}
            onNota={nid => { setNotaSel(nid); setDx("appunti"); }} onFoto={cambiaFoto} />
          {attrezziUI}
        </section>}
        {vista === "divisa" && <div className="divisore" role="separator" tabIndex={0} aria-label="Sposta la divisione tra pianta e 3D" title="Trascina per dare più spazio alla pianta o al 3D (doppio clic: a metà)"
          aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(parte * 100)} onPointerDown={trascinaDivisore} onKeyDown={tastoDivisore}
          onDoubleClick={() => { setParte(0.5); ricorda("parte", "0.5"); }} />}
        {vista !== "pianta" && <section className="lato lato-3d" aria-label="Vista 3D">
          <Vista3D modello={M} mesh={mesh} piano={piano} tetto={tetto} nomi={strumento === "sposta"} volo={volo} onStanza={r => { setVolo({ tipo: "stanza", riga: r, n: Date.now() }); scegli(r); }} traccia={traccia} sel={sel} onSel={scegli} onPosa={posa}
            onPunto={strumento !== "sposta" && strumento !== "foto" ? punto3d : undefined} onCursore={setCur3} disegno={disegno3d}
            fisso={p3?.pts.length ? { piano: p3.piano, quota: M.piani.find(x => x.id === p3.piano)?.quota ?? 0 } : null} />
          {vista === "divisa" && strumento === "sposta" && <div className="galleggia comandi-3d">{comandi3D}</div>}
          {vista === "3d" && <div className="in3d" style={{ display: "contents" }}>{attrezziUI}</div>}
        </section>}
        <div className="galleggia alto">
          <div className="segmenti vetro" role="group" aria-label="Piano">
            {M.piani.map(x => <button key={x.id} aria-pressed={piano === x.id} onClick={() => setPiano(x.id)}>{x.nome}</button>)}
            {vista === "3d" && <button aria-pressed={piano === "tutti"} onClick={() => setPiano("tutti")}>Tutta</button>}
            {vista !== "3d" && <button onClick={nuovoPiano} title="Nuovo piano sopra la casa, con i muri di questo" aria-label="Nuovo piano con i muri di questo">+</button>}
          </div>
          {vista === "divisa" && comandiPianta}
          <span className="spazio" />
          {vista === "pianta" && comandiPianta}
          {vista === "3d" && comandi3D}
          <div className="segmenti vetro" role="group" aria-label="Vista">
            <button aria-pressed={vista === "pianta"} onClick={() => scegliVista("pianta")}>Pianta</button>
            <button aria-pressed={vista === "divisa"} onClick={() => scegliVista("divisa")} className="nascondi-stretto" title="Pianta e 3D affiancati: il 3D si aggiorna mentre disegni">Pianta + 3D</button>
            <button aria-pressed={vista === "3d"} onClick={() => scegliVista("3d")}>3D</button>
          </div>
        </div>
        {bozza && <div className="foglio-nota vetro" style={{ background: "var(--panel)" }}>
          <p className="etichetta" style={{ margin: 0 }}>{bozza.tipo === "appunto" ? "Appunto per Claude" : bozza.tipo === "calibra" ? `Hai misurato ${Math.round(Math.hypot(bozza.b.x - bozza.a.x, bozza.b.y - bozza.a.y))} cm sulla foto. Quanto è lungo davvero?` : p.pubblicato ? "Cosa è cambiato? Lo legge il cliente (puoi lasciarlo vuoto)" : "Pubblica la prima versione per il cliente. Vuoi lasciargli un messaggio?"}</p>
          {bozza.tipo === "calibra"
            ? <input autoFocus inputMode="decimal" placeholder="420" value={scritto} onChange={e => setScritto(e.target.value)} onKeyDown={e => e.key === "Enter" && salvaBozza()} aria-label="Distanza vera in centimetri" />
            : <textarea autoFocus value={scritto} onChange={e => setScritto(e.target.value)} maxLength={2000} placeholder={bozza.tipo === "appunto" ? "Qui la finestra è larga 120, misurata oggi" : "Abbiamo spostato la cucina sul lato del giardino"}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) salvaBozza(); }} />}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primario" onClick={salvaBozza}>{bozza.tipo === "appunto" ? "Salva appunto" : bozza.tipo === "calibra" ? "Metti in scala" : "Pubblica"}</button>
            <button className="btn" onClick={() => setBozza(null)}>Annulla</button>
          </div>
        </div>}
        {avviso && <div className={"avviso vetro" + (avviso.claude ? " claude" : "")} role="status">
          <span>{avviso.t}</span>
          {avviso.azione && <button className="btn piccolo" onClick={() => { avviso.azione![1](); setAvviso(null); }}>{avviso.azione[0]}</button>}
        </div>}
        {scorciatoie && <Scorciatoie onChiudi={() => setScorciatoie(false)} />}
      </main>

      <aside className={"ed-pannello ed-dx" + (aperto === "dx" ? " aperto" : "")}>
        {elSel && <Proprieta M={M} el={elSel} testo={() => R.current.testo} cambia={cambia} onChiudi={() => setSel(null)}
          onElimina={() => elimina(elSel.riga)} onDuplica={() => duplica(elSel.riga)} onBuco={bucoScala}
          onAppunto={() => { versoPianta(); setStrumento("appunto"); setModoAppunto("punto"); mostra("Tocca il punto della pianta dove va l'appunto"); }} />}
        <div className="schede" role="tablist">
          <button role="tab" aria-selected={dx === "appunti"} onClick={() => setDx("appunti")}>Appunti ({appunti.filter(a => a.stato === "da fare").length})</button>
          <button role="tab" aria-selected={dx === "superfici"} onClick={() => setDx("superfici")}>Superfici</button>
          <button role="tab" aria-selected={dx === "claude"} onClick={() => setDx("claude")} style={{ color: dx === "claude" ? "var(--claude)" : undefined }}>Claude</button>
        </div>
        {dx === "superfici" && rie && <div className="scorre">
          <div className="blocco superfici-testa">
            <div><b>{m2(rie.utile)} m²</b> <span className="tenue">di superficie utile</span></div>
            <span className={rie.avvisi ? "da-vedere" : "ok"}>{rie.avvisi ? `${rie.avvisi} ${rie.avvisi === 1 ? "cosa" : "cose"} da vedere` : "Tutto in regola"}</span>
            <a className="btn piccolo" href={`/studio/${id}/stampa?piano=${piano}`} target="_blank" rel="noreferrer">Stampa in scala</a>
          </div>
          {rie.piani.map(pp => <div key={pp.id} className="blocco superfici-piano">
            <div className="superfici-titolo"><b>{pp.nome}</b><span>{m2(pp.utile)} m²</span></div>
            {pp.stanze.map(v => (
              <div key={v.s.riga} role="button" tabIndex={0} className={"stanza-riga" + (v.avvisi.length ? " da-vedere" : "")} aria-current={sel === v.s.riga}
                onClick={() => { setPiano(pp.id); scegli(v.s.riga); }} onKeyDown={e => { if (e.key === "Enter") { setPiano(pp.id); scegli(v.s.riga); } }}>
                <span className="nome">{v.s.nome}<small>{NOMI_USO[v.uso]}</small></span>
                <span className="num">{m2(v.area)} m²{v.finestre > 0 && <small>luce 1/{Math.max(1, Math.round(v.area / v.finestre))}</small>}</span>
                {v.avvisi.length > 0 && <ul>{v.avvisi.map(a => <li key={a}>{a}</li>)}</ul>}
              </div>
            ))}
            {!pp.stanze.length && <span className="piccolo tenue">Nessuna stanza su questo piano.</span>}
            {pp.stanze[0]?.variabile && <span className="piccolo tenue">Sottotetto: l&apos;altezza cambia sotto la falda. Le regole sono regionali, spesso chiedono 2,40 m di media.</span>}
          </div>)}
          {rie.pavimenti.length > 0 && <div className="blocco"><span className="etichetta" style={{ margin: 0 }}>Pavimenti</span>
            <div className="pavimenti">{rie.pavimenti.map(([c, a]) => <span key={c}><i style={{ background: hex(c) }} />{c.startsWith("#") ? "su misura" : c.replace("_", " ")} <b>{m2(a)} m²</b></span>)}</div>
          </div>}
          {rie.utile > 0 && <div className="blocco"><span className="etichetta" style={{ margin: 0 }}>Per il preventivo</span>
            <div className="conti-2"><span>Pareti da pitturare<b>{m2(rie.pareti)} m²</b></span><span>Battiscopa<b>{m2(rie.battiscopa)} m</b></span></div>
            <span className="piccolo tenue">Pareti: perimetro delle stanze per l&apos;altezza del piano, tolte porte e finestre. Battiscopa: perimetro tolte le porte.</span>
          </div>}
          {rie.serramenti.length > 0 && <div className="blocco"><span className="etichetta" style={{ margin: 0 }}>Abaco dei serramenti</span>
            <table className="abaco">
              <tbody>{rie.serramenti.map(s => (
                <tr key={`${s.cosa}${s.larga}${s.alta}${s.davanzale}${s.scorrevole}`}>
                  <td>{s.cosa.charAt(0).toUpperCase() + s.cosa.slice(1)}{s.scorrevole ? " scorrevole" : ""}<small>{s.piani.join(", ")}{s.cosa === "finestra" ? ` · davanzale ${s.davanzale}` : ""}</small></td>
                  <td>{s.larga}×{s.alta}</td>
                  <td>×{s.n}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
          <div className="blocco piccolo tenue">Verifiche del DM 5 luglio 1975: camere da 9 m² (doppie da 14), soggiorno da 14, finestre almeno 1/8 del pavimento nei locali abitabili, altezza 270 cm (240 nei bagni e nei locali di servizio). L&apos;uso della stanza si capisce dal nome.</div>
        </div>}
        {dx === "appunti" && <div className="scorre">
          <div className="blocco" style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}>
            <div className="segmenti">{(["da fare", "tutti"] as const).map(f => <button key={f} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{f === "da fare" ? "Da fare" : "Tutti"}</button>)}</div>
            <button className="btn piccolo" onClick={() => { versoPianta(); setStrumento("appunto"); }}>Nuovo</button>
          </div>
          {!visibili.length && <div className="blocco piccolo tenue">Nessun appunto {filtro === "da fare" ? "da fare" : ""}. Scegli Appunto in basso e tocca la pianta: scrivi cosa cambiare, Claude lo trova con le coordinate.</div>}
          <div style={{ display: "grid", gap: 8, padding: 12 }}>
            {visibili.map(a => (
              <div key={a.id} className="nota-card" aria-current={notaSel === a.id} onClick={() => vaiNota(a)} style={{ cursor: "pointer" }}>
                <div className="testa"><span className="pallino" style={{ background: COL_NOTA(a) }}>{a.n}</span>{CHI[a.da]}, {quanto(a.quando)}{a.piano !== piano && <>, {M.piani.find(x => x.id === a.piano)?.nome}</>}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{a.testo}</div>
                {a.risposta && <div className="risposta"><b>Claude</b> {a.risposta}</div>}
                <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button className="btn piccolo" onClick={() => cambiaNota(a.id, { stato: a.stato === "fatta" ? "da fare" : "fatta" })}>{a.stato === "fatta" ? "Riapri" : "Segna fatta"}</button>
                  <button className="btn piccolo pericolo" onClick={async () => { if (confirm("Eliminare questo appunto?")) { const r = await rpc("togliAppunto", { id, aid: a.id }); if (r.ok) applica(r.doc); } }}>Elimina</button>
                </div>
              </div>
            ))}
          </div>
        </div>}
        {dx === "claude" && <div className="scorre">
          <div className="blocco piccolo tenue">Qui compare quello che fanno Claude e i clienti. Le righe che Claude cambia si accendono di cotto nel testo e sulla pianta. Scrivi a Claude da Claude Code, sul tuo computer: <Link href="/studio/guida">come collegarlo</Link>.</div>
          <div className="attivita" style={{ padding: "0 12px 12px" }}>
            {p.attivita.map((a, i) => (
              <div key={i} onClick={() => a.righe?.length && (setEvid(a.righe), setTimeout(() => setEvid([]), 6000))} style={{ cursor: a.righe?.length ? "pointer" : undefined }}>
                <b className={a.chi}>{CHI[a.chi]}</b> {a.cosa} <span className="tenue piccolo">{quanto(a.quando)}</span>
              </div>
            ))}
            {!p.attivita.length && <div className="tenue">Ancora niente.</div>}
          </div>
          <div className="blocco piccolo"><span className="etichetta" style={{ margin: 0 }}>Link per il cliente</span><code style={{ wordBreak: "break-all" }}>{link}</code>
            <span className="tenue">{p.pubblicato ? `Vede la versione ${p.pubblicato.versione}, pubblicata ${quanto(p.pubblicato.quando)}.` : "Funziona dopo la prima pubblicazione."}</span></div>
        </div>}
      </aside>
    </div>
  );
}

const TASTI: [string, [string, string][]][] = [
  ["Attrezzi", [["V", "Sposta e scegli"], ["M", "Muro"], ["S", "Stanza"], ["B", "Buco nel pavimento"], ["P", "Porta"], ["F", "Finestra"], ["A", "Arredo"], ["Q", "Misura"], ["N", "Appunto per Claude"]]],
  ["Elemento scelto", [["← ↑ → ↓", "Sposta di 1 cm (Maiusc: 10 cm)"], ["R", "Ruota di 90°"], ["Ctrl+D", "Duplica"], ["Ctrl+C, Ctrl+V", "Copia e incolla"], ["Canc", "Elimina"], ["Esc", "Lascia"]]],
  ["Mentre tiri un muro", [["420+Invio", "Tratto lungo esattamente 420 cm"], ["Backspace", "Togli l'ultimo punto"], ["Tasto destro", "Togli l'ultimo punto"], ["Doppio clic", "Finisci"], ["Alt", "Senza agganci, al centimetro"]]],
  ["Sempre", [["Ctrl+Z", "Annulla"], ["Ctrl+Maiusc+Z", "Rifai"], ["Rotella", "Zoom"], ["Trascina il vuoto", "Spostati nella pianta"], ["?", "Questo pannello"]]],
];
function Scorciatoie({ onChiudi }: { onChiudi: () => void }) {
  return (
    <div className="scorciatoie-fondo" onClick={onChiudi}>
      <section className="scorciatoie vetro" role="dialog" aria-label="Scorciatoie da tastiera" onClick={e => e.stopPropagation()}>
        <header><b>Scorciatoie</b><button className="btn piccolo" onClick={onChiudi} aria-label="Chiudi">✕</button></header>
        <div className="colonne">
          {TASTI.map(([gruppo, voci]) => (
            <div key={gruppo}>
              <h3>{gruppo}</h3>
              <dl>{voci.map(([k, v]) => <div key={k}><dt>{k.split(", ").map((x, i) => <span key={i}>{x.split("+").map((t, j) => <kbd key={j}>{t}</kbd>)}</span>)}</dt><dd>{v}</dd></div>)}</dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
