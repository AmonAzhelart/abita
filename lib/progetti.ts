// I progetti, nel database (lib/db.ts): una riga per progetto con il testo e le parti piccole (appunti, foto, attività,
// modelli) come JSON; la storia del testo a righe (al massimo 40 per progetto, i salvataggi ravvicinati della stessa
// persona si fondono in una); i dati pesanti (immagini delle foto, triangoli dei modelli) a parte, a pezzi.
// Ogni modifica alza rev: l'editor e la pagina del cliente lo controllano per aggiornarsi da soli.
// Salvare il testo dall'editor è una richiesta sola: aggiorna la riga se la revisione è quella attesa, e la storia.
import { randomBytes } from "node:crypto";
import { batch, sql, type Istruzione, type Riga } from "./db.ts";
import { ESEMPIO } from "./esempio.ts";
import { leggi, righeCambiate, type ModelloInfo, type Pt } from "./lingua.ts";
import { vecchioArchivio } from "./vecchio.ts";

export type Chi = "io" | "claude" | "cliente";
export type Appunto = { id: string; piano: string; tipo: "punto" | "linea" | "zona"; a: Pt; b?: Pt; testo: string; stato: "da fare" | "fatta"; da: Chi; risposta?: string; quando: number };
export type Foto = { id: string; nome: string; piano: string; x: number; y: number; scala: number; w: number; h: number; rot: number; opacita: number; visibile: boolean; quando: number };
export type Attivita = { quando: number; chi: Chi; cosa: string; righe?: number[] };
export type Pubblicato = { testo: string; versione: number; quando: number; nota?: string };
export type Progetto = {
  id: string; nome: string; cliente: string; testo: string; rev: number; aggiornato: number; share: string;
  pubblicato: Pubblicato | null; appunti: Appunto[]; foto: Foto[]; attivita: Attivita[];
  modelli?: Record<string, ModelloInfo & { chiave: string }>;
};
export type Voce = { id: string; nome: string; cliente: string; aggiornato: number; daFare: number; versione: number | null; share: string };
/** Quello che cambia salvando il testo: all'editor basta questo, non il progetto intero. */
export type Salvato = { rev: number; nome: string; aggiornato: number };

export const LIMITI = { testo: 200_000, appunto: 2000, appunti: 400, foto: 20, datiFoto: 3_500_000 };
const STORIA = 40, FONDI = 120_000, PEZZO = 900_000;     // versioni tenute, ms entro cui si fondono, caratteri per riga di dati
const D = { m: (id: string, k: string) => `m:${id}:${k}`, f: (fid: string) => `f:${fid}` };
const nuovoId = (n: number) => randomBytes(n).toString("base64url");
const ID = /^[\w-]{4,40}$/;

export class Errore extends Error {
  stato: number;
  constructor(msg: string, stato = 400) { super(msg); this.stato = stato; }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS progetti (id TEXT PRIMARY KEY, nome TEXT NOT NULL, cliente TEXT NOT NULL DEFAULT '', testo TEXT NOT NULL,
    rev INTEGER NOT NULL, aggiornato INTEGER NOT NULL, share TEXT NOT NULL UNIQUE, chi TEXT NOT NULL DEFAULT 'io', gruppo INTEGER NOT NULL DEFAULT 0,
    pubblicato TEXT, appunti TEXT NOT NULL DEFAULT '[]', foto TEXT NOT NULL DEFAULT '[]', attivita TEXT NOT NULL DEFAULT '[]', modelli TEXT NOT NULL DEFAULT '{}')`,
  `CREATE TABLE IF NOT EXISTS versioni (progetto TEXT NOT NULL, gruppo INTEGER NOT NULL, rev INTEGER NOT NULL, testo TEXT NOT NULL, chi TEXT NOT NULL, quando INTEGER NOT NULL, PRIMARY KEY (progetto, gruppo))`,
  `CREATE TABLE IF NOT EXISTS dati (chiave TEXT NOT NULL, parte INTEGER NOT NULL, valore TEXT NOT NULL, PRIMARY KEY (chiave, parte))`,
  `CREATE TABLE IF NOT EXISTS meta (chiave TEXT PRIMARY KEY, valore TEXT NOT NULL)`,
];
const COPIATO = `copiato:${process.env.VERCEL_ENV ?? "locale"}`;   // l'anteprima e la produzione copiano ognuna per conto suo
let preparato: Promise<void> | null = null, daCopiare = false, inCopia: Promise<void> | null = null, intoppo: { quando: number; msg: string } | null = null;
/**
 * Una volta per avvio: le tabelle, e la copia dei progetti dal vecchio archivio se in questo ambiente non è ancora stata fatta.
 * Se il vecchio archivio non risponde (Upstash senza piano) Abita va avanti lo stesso e riprova al massimo ogni 5 minuti.
 */
async function pronto() {
  await (preparato ??= batch([...SCHEMA.map(s => ({ sql: s })), { sql: "SELECT valore FROM meta WHERE chiave = ?", params: [COPIATO] }])
    .then(r => { daCopiare = !r[r.length - 1].length; })
    .catch(e => { preparato = null; throw e; }));
  if (!daCopiare || (intoppo && Date.now() - intoppo.quando < 300_000)) return;
  await (inCopia ??= copiaDalVecchio()
    .then(() => { daCopiare = false; intoppo = null; })
    .catch(e => { intoppo = { quando: Date.now(), msg: e instanceof Error ? e.message : String(e) }; console.error("Copia dal vecchio archivio:", intoppo.msg); })
    .finally(() => { inCopia = null; }));
}
/** Se i progetti di prima non si sono ancora potuti copiare, perché: lo mostra l'elenco dei progetti. */
export const copiaSospesa = () => (daCopiare && intoppo ? intoppo.msg : null);

const json = <T>(v: unknown, vuoto: T): T => (typeof v === "string" && v ? (JSON.parse(v) as T) : vuoto);
const progetto = (r: Riga): Progetto => ({
  id: String(r.id), nome: String(r.nome), cliente: String(r.cliente), testo: String(r.testo), rev: Number(r.rev), aggiornato: Number(r.aggiornato), share: String(r.share),
  pubblicato: json(r.pubblicato, null), appunti: json(r.appunti, []), foto: json(r.foto, []), attivita: json(r.attivita, []), modelli: json(r.modelli, {}),
});
/** Le colonne che cambiano con le azioni diverse dal testo (appunti, foto, pubblicazione, modelli...). */
const COLONNE = ["nome", "cliente", "share", "pubblicato", "appunti", "foto", "attivita", "modelli"] as const;
const valori = (p: Progetto) => [p.nome, p.cliente, p.share, p.pubblicato ? JSON.stringify(p.pubblicato) : null, JSON.stringify(p.appunti), JSON.stringify(p.foto), JSON.stringify(p.attivita), JSON.stringify(p.modelli ?? {})];

/** Un valore lungo (foto, triangoli) in righe da PEZZO caratteri: D1 non vuole righe oltre i 2 MB. */
function scriviDati(chiave: string, valore: string, sovrascrivi = true): Istruzione[] {
  const parti = Array.from({ length: Math.max(1, Math.ceil(valore.length / PEZZO)) }, (_, i) => valore.slice(i * PEZZO, (i + 1) * PEZZO));
  return [
    ...(sovrascrivi ? [{ sql: "DELETE FROM dati WHERE chiave = ?", params: [chiave] }] : []),
    ...parti.map((v, i) => ({ sql: `INSERT ${sovrascrivi ? "" : "OR IGNORE "}INTO dati (chiave, parte, valore) VALUES (?, ?, ?)`, params: [chiave, i, v] })),
  ];
}
/** I dati con le chiavi da `da` (compresa) ad `a` (esclusa), rimessi insieme. */
async function leggiDati(da: string, a: string) {
  const out = new Map<string, string>();
  for (const r of await sql("SELECT chiave, valore FROM dati WHERE chiave >= ? AND chiave < ? ORDER BY chiave, parte", [da, a]))
    out.set(String(r.chiave), (out.get(String(r.chiave)) ?? "") + String(r.valore));
  return out;
}

export async function elenco(): Promise<Voce[]> {
  await pronto();
  const r = await sql(`SELECT id, nome, cliente, aggiornato, share, json_extract(pubblicato, '$.versione') AS versione,
    (SELECT count(*) FROM json_each(progetti.appunti) WHERE json_extract(value, '$.stato') = 'da fare') AS daFare FROM progetti ORDER BY aggiornato DESC`);
  return r.map(x => ({ id: String(x.id), nome: String(x.nome), cliente: String(x.cliente), aggiornato: Number(x.aggiornato), share: String(x.share), versione: x.versione == null ? null : Number(x.versione), daFare: Number(x.daFare) }));
}

export async function carica(id: string) {
  if (!ID.test(id)) return null;
  await pronto();
  const [r] = await sql("SELECT * FROM progetti WHERE id = ?", [id]);
  return r ? progetto(r) : null;
}

/** Solo il numero di revisione: l'editor lo controlla ogni pochi secondi senza scaricare tutto il progetto. */
export async function revisione(id: string) {
  if (!ID.test(id)) return null;
  await pronto();
  const [r] = await sql("SELECT rev FROM progetti WHERE id = ?", [id]);
  return r ? Number(r.rev) : null;
}

function registra(p: Progetto, a: Omit<Attivita, "quando">) {
  p.attivita = [{ ...a, quando: Date.now() }, ...p.attivita].slice(0, 40);
}

/** Leggi, cambia, salva (tutto tranne il testo). Se intanto qualcun altro ha salvato, si rilegge e si riprova. fn può lanciare Errore per annullare. */
async function modifica(id: string, fn: (p: Progetto) => void | Promise<void>) {
  for (let prova = 0; ; prova++) {
    const p = await carica(id);
    if (!p) throw new Errore("Progetto non trovato", 404);
    const base = p.rev;
    await fn(p);
    p.rev = base + 1;
    p.aggiornato = Date.now();
    const r = await sql(`UPDATE progetti SET ${COLONNE.map(c => `${c} = ?`).join(", ")}, rev = ?, aggiornato = ? WHERE id = ? AND rev = ? RETURNING rev`, [...valori(p), p.rev, p.aggiornato, id, base]);
    if (r.length) return p;
    if (prova >= 2) throw new Errore("Il progetto sta cambiando proprio adesso: riprova", 409);
  }
}

export async function crea(nome: string, cliente = "", testo?: string) {
  nome = nome.trim().slice(0, 120) || "Nuovo progetto";
  const t = testo ?? ESEMPIO.replace('progetto "Casa al mare"', `progetto "${nome.replace(/"/g, "'")}"`).replace('cliente "Famiglia Esposito"', `cliente "${(cliente || "—").replace(/"/g, "'")}"`);
  const p: Progetto = { id: nuovoId(6), nome, cliente: cliente.trim().slice(0, 120), testo: t.slice(0, LIMITI.testo), rev: 1, aggiornato: Date.now(), share: nuovoId(12), pubblicato: null, appunti: [], foto: [], attivita: [], modelli: {} };
  await pronto();
  await sql(`INSERT INTO progetti (id, testo, rev, aggiornato, ${COLONNE.join(", ")}) VALUES (?, ?, ?, ?, ${COLONNE.map(() => "?").join(", ")})`, [p.id, p.testo, p.rev, p.aggiornato, ...valori(p)]);
  return p;
}

/**
 * Salva il testo. Dall'editor (chi "io") passa baseRev: se nel frattempo il progetto è cambiato, 409 e non si scrive niente.
 * Torna rev, nome e data; per Claude anche il progetto aggiornato e il testo di prima (per raccontare cosa è cambiato).
 */
export async function salvaTesto(id: string, testo: string, chi: Chi, cosa = "", baseRev?: number): Promise<{ salvato: Salvato; p: Progetto | null; prima: string }> {
  if (testo.length > LIMITI.testo) throw new Errore(`Il testo è troppo lungo (massimo ${LIMITI.testo} caratteri)`);
  await pronto();
  let p: Progetto | null = null, prima = "", base = baseRev;
  if (chi !== "io") {                                          // Claude e il cliente lasciano traccia nelle attività
    p = await carica(id);
    if (!p) throw new Errore("Progetto non trovato", 404);
    prima = p.testo;
    registra(p, { chi, cosa: cosa || "ha cambiato il progetto", righe: righeCambiate(prima, testo).slice(0, 200) });
    base ??= p.rev;
  }
  const ora = Date.now(), nome = (leggi(testo).titolo ?? "").slice(0, 120), conBase = base !== undefined;
  const [r] = await batch([
    {                                                          // nello stesso gruppo della storia se è la stessa persona entro due minuti
      sql: `UPDATE progetti SET testo = ?, nome = COALESCE(NULLIF(?, ''), nome), gruppo = CASE WHEN chi = ? AND aggiornato > ? THEN gruppo ELSE rev + 1 END,
        chi = ?, rev = rev + 1, aggiornato = ?${p ? ", attivita = ?" : ""} WHERE id = ?${conBase ? " AND rev = ?" : ""} RETURNING rev, nome, aggiornato`,
      params: [testo, nome, chi, ora - FONDI, chi, ora, ...(p ? [JSON.stringify(p.attivita)] : []), id, ...(conBase ? [base!] : [])],
    },
    {
      sql: `INSERT INTO versioni (progetto, gruppo, rev, testo, chi, quando) SELECT id, gruppo, rev, testo, chi, aggiornato FROM progetti WHERE id = ? AND aggiornato = ? AND chi = ?
        ON CONFLICT (progetto, gruppo) DO UPDATE SET rev = excluded.rev, testo = excluded.testo, chi = excluded.chi, quando = excluded.quando`,
      params: [id, ora, chi],                                  // solo se l'UPDATE qui sopra è andato: la riga ha l'ora di questo salvataggio
    },
    { sql: `DELETE FROM versioni WHERE progetto = ? AND gruppo < (SELECT gruppo FROM versioni WHERE progetto = ? ORDER BY gruppo DESC LIMIT 1 OFFSET ${STORIA - 1})`, params: [id, id] },
  ]);
  if (!r.length) {
    if (conBase && (await revisione(id)) !== null) throw new Errore("Il progetto è cambiato nel frattempo", 409);
    throw new Errore("Progetto non trovato", 404);
  }
  const salvato = { rev: Number(r[0].rev), nome: String(r[0].nome), aggiornato: Number(r[0].aggiornato) };
  if (p) Object.assign(p, salvato, { testo });
  return { salvato, p, prima };
}

export async function storia(id: string) {
  await pronto();
  return (await sql("SELECT rev, chi, quando, length(testo) - length(replace(testo, char(10), '')) + 1 AS righe FROM versioni WHERE progetto = ? ORDER BY gruppo DESC", [id]))
    .map(r => ({ rev: Number(r.rev), chi: String(r.chi), quando: Number(r.quando), righe: Number(r.righe) }));
}

export async function ripristina(id: string, rev: number) {
  await pronto();
  const [v] = await sql("SELECT testo FROM versioni WHERE progetto = ? AND rev = ?", [id, rev]);
  if (!v) throw new Errore("Versione non trovata", 404);
  await salvaTesto(id, String(v.testo), "io");
  return (await carica(id))!;
}

export async function rinomina(id: string, campi: { nome?: string; cliente?: string }) {
  return modifica(id, p => {
    if (campi.nome !== undefined) p.nome = campi.nome.trim().slice(0, 120) || p.nome;
    if (campi.cliente !== undefined) p.cliente = campi.cliente.trim().slice(0, 120);
  });
}

export async function pubblica(id: string, chi: Chi, nota?: string) {
  return modifica(id, p => {
    p.pubblicato = { testo: p.testo, versione: (p.pubblicato?.versione ?? 0) + 1, quando: Date.now(), nota: nota?.slice(0, 500) };
    registra(p, { chi, cosa: `ha pubblicato la versione ${p.pubblicato.versione}` + (nota ? `: ${nota.slice(0, 120)}` : "") });
  });
}

export async function nuovoLink(id: string) {
  const share = nuovoId(12);
  return modifica(id, q => { q.share = share; });
}

const punto = (v: unknown): Pt => {
  const p = v as Pt;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) throw new Errore("Punto non valido");
  return { x: Math.round(p.x), y: Math.round(p.y) };
};

export async function nuovoAppunto(id: string, a: { piano: string; tipo?: string; a: Pt; b?: Pt; testo: string }, da: Chi) {
  const testo = String(a.testo ?? "").trim().slice(0, LIMITI.appunto);
  if (!testo) throw new Errore("Scrivi qualcosa nell'appunto");
  const tipo = a.tipo === "linea" || a.tipo === "zona" ? a.tipo : "punto";
  const nuovo: Appunto = { id: nuovoId(5), piano: String(a.piano).slice(0, 60), tipo, a: punto(a.a), b: tipo === "punto" ? undefined : punto(a.b), testo, stato: "da fare", da, quando: Date.now() };
  await modifica(id, p => {
    if (p.appunti.length >= LIMITI.appunti) throw new Errore("Troppi appunti in questo progetto");
    p.appunti.push(nuovo);
    if (da !== "io") registra(p, { chi: da, cosa: `ha lasciato un appunto: ${testo.slice(0, 80)}` });
  });
  return nuovo;
}

export async function cambiaAppunto(id: string, aid: string, c: { testo?: string; stato?: string; risposta?: string; a?: Pt; b?: Pt }, chi: Chi) {
  return modifica(id, p => {
    const a = p.appunti.find(x => x.id === aid);
    if (!a) throw new Errore("Appunto non trovato", 404);
    if (c.testo !== undefined) a.testo = String(c.testo).trim().slice(0, LIMITI.appunto) || a.testo;
    if (c.stato === "fatta" || c.stato === "da fare") a.stato = c.stato;
    if (c.risposta !== undefined) a.risposta = String(c.risposta).slice(0, LIMITI.appunto);
    if (c.a) a.a = punto(c.a);
    if (c.b && a.tipo !== "punto") a.b = punto(c.b);
    if (chi === "claude") registra(p, { chi, cosa: `${a.stato === "fatta" ? "ha fatto" : "ha risposto a"}: ${a.testo.slice(0, 80)}` });
  });
}

export async function togliAppunto(id: string, aid: string) {
  return modifica(id, p => { p.appunti = p.appunti.filter(a => a.id !== aid); });
}

export async function nuovaFoto(id: string, f: { nome: string; dati: string; w: number; h: number; piano: string }) {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(f.dati)) throw new Errore("Serve un'immagine JPEG, PNG o WebP");
  if (f.dati.length > LIMITI.datiFoto) throw new Errore("La foto è troppo pesante");
  const fid = nuovoId(8), w = Math.round(+f.w) || 1000, h = Math.round(+f.h) || 1000;
  const foto: Foto = { id: fid, nome: String(f.nome || "foto").slice(0, 120), piano: String(f.piano).slice(0, 60), x: 0, y: 0, scala: 1, w, h, rot: 0, opacita: 0.5, visibile: true, quando: Date.now() };
  await pronto();
  await batch(scriviDati(D.f(fid), f.dati));                  // prima l'immagine: se il progetto poi rifiuta la foto resta solo un dato orfano
  await modifica(id, p => {
    if (p.foto.length >= LIMITI.foto) throw new Errore(`Al massimo ${LIMITI.foto} foto per progetto`);
    p.foto.push(foto);
  });
  return foto;
}

export async function cambiaFoto(id: string, fid: string, c: Partial<Pick<Foto, "nome" | "piano" | "x" | "y" | "scala" | "rot" | "opacita" | "visibile">>) {
  return modifica(id, p => {
    const f = p.foto.find(x => x.id === fid);
    if (!f) throw new Errore("Foto non trovata", 404);
    for (const k of ["x", "y", "scala", "rot", "opacita"] as const) if (c[k] !== undefined && Number.isFinite(+c[k]!)) f[k] = +c[k]!;
    f.scala = Math.min(100, Math.max(0.01, f.scala));
    f.opacita = Math.min(1, Math.max(0.05, f.opacita));
    if (c.nome !== undefined) f.nome = String(c.nome).slice(0, 120);
    if (c.piano !== undefined) f.piano = String(c.piano).slice(0, 60);
    if (c.visibile !== undefined) f.visibile = !!c.visibile;
  });
}

export async function togliFoto(id: string, fid: string) {
  const p = await modifica(id, q => { q.foto = q.foto.filter(f => f.id !== fid); });
  await sql("DELETE FROM dati WHERE chiave = ?", [D.f(fid)]);
  return p;
}

export async function datiFoto(fid: string) {
  if (!/^[\w-]{6,20}$/.test(fid)) return null;
  await pronto();
  return (await leggiDati(D.f(fid), D.f(fid) + "\u0000")).get(D.f(fid)) ?? null;
}

/** Un oggetto 3D importato: le misure stanno nel progetto, i triangoli (base64 float32 per materiale) a parte. */
export async function salvaModello(id: string, nome: string, info: ModelloInfo, mesh: Record<string, string>) {
  nome = String(nome).trim().slice(0, 120);
  if (!nome) throw new Errore("Il modello deve avere un nome");
  const testo = JSON.stringify(mesh);
  if (testo.length > LIMITI.datiFoto) throw new Errore(`Il modello "${nome}" è troppo pesante`);
  const chiave = nuovoId(8);
  let vecchia: string | undefined;
  await pronto();
  await batch(scriviDati(D.m(id, chiave), testo));
  const p = await modifica(id, q => {
    q.modelli ??= {};
    if (!q.modelli[nome] && Object.keys(q.modelli).length >= 400) throw new Errore("Troppi modelli in questo progetto");
    vecchia = q.modelli[nome]?.chiave;
    q.modelli[nome] = { L: +info.L, P: +info.P, H: +info.H, pianta: info.pianta, chiave };
  });
  if (vecchia) await sql("DELETE FROM dati WHERE chiave = ?", [D.m(id, vecchia)]);
  return p;
}

export async function meshModelli(p: Progetto) {
  const tutti = await leggiDati(D.m(p.id, ""), D.m(p.id, "\u007f"));
  return Object.fromEntries(Object.entries(p.modelli ?? {}).map(([n, m]) => [n, json<Record<string, string>>(tutti.get(D.m(p.id, m.chiave)), {})]));
}

export async function elimina(id: string) {
  const p = await carica(id);
  if (!p) return;
  await batch([
    { sql: "DELETE FROM dati WHERE chiave >= ? AND chiave < ?", params: [D.m(id, ""), D.m(id, "\u007f")] },
    ...p.foto.map(f => ({ sql: "DELETE FROM dati WHERE chiave = ?", params: [D.f(f.id)] })),
    { sql: "DELETE FROM versioni WHERE progetto = ?", params: [id] },
    { sql: "DELETE FROM progetti WHERE id = ?", params: [id] },
  ]);
}

export async function daLink(share: string) {
  if (!/^[\w-]{8,40}$/.test(share)) return null;
  await pronto();
  const [r] = await sql("SELECT * FROM progetti WHERE share = ?", [share]);
  return r ? progetto(r) : null;
}

/** Per la pagina del cliente: basta sapere se c'è una versione nuova o se i commenti sono cambiati, senza scaricare il progetto. */
export async function statoLink(share: string) {
  if (!/^[\w-]{8,40}$/.test(share)) return null;
  await pronto();
  const [r] = await sql(`SELECT json_extract(pubblicato, '$.versione') AS v, (SELECT count(*) || '-' || sum(json_extract(value, '$.stato') = 'fatta') FROM json_each(progetti.appunti)
    WHERE json_extract(value, '$.da') = 'cliente') AS c FROM progetti WHERE share = ?`, [share]);
  return r ? `${r.v ?? 0}.${r.c ?? "0-0"}` : null;
}

export async function commentoCliente(share: string, a: { piano: string; a: Pt; testo: string; nome?: string }) {
  const p = await daLink(share);
  if (!p?.pubblicato) throw new Errore("Progetto non trovato", 404);
  if (p.appunti.filter(x => x.da === "cliente").length >= 100) throw new Errore("Sono già arrivati tanti commenti: scrivi direttamente al progettista");
  const nome = String(a.nome ?? "").trim().slice(0, 60);
  return nuovoAppunto(p.id, { piano: a.piano, a: a.a, testo: (nome ? `${nome}: ` : "") + String(a.testo ?? "") }, "cliente");
}

/**
 * Una volta per ambiente: i progetti del vecchio archivio (Upstash, o i file di .dati in locale) con storia, modelli e foto.
 * Un progetto già nel database si aggiorna solo se il vecchio ha una revisione più alta (vuol dire che lì si è lavorato dopo);
 * quello che è stato cambiato in D1 non si tocca mai. Si può ripetere senza danni se si interrompe.
 */
async function copiaDalVecchio() {
  const v = await vecchioArchivio();
  if (v) {
    type Vecchio = Omit<Progetto, "modelli"> & { modelli?: Progetto["modelli"] };
    for (const { id } of (await v.get<Voce[]>("abita:indice")) ?? []) {
      const p = await v.get<Vecchio>(`abita:p:${id}`);
      if (!p) continue;
      const st = (await v.get<{ rev: number; testo: string; chi: Chi; quando: number }[]>(`abita:storia:${id}`)) ?? [];
      await batch([
        {
          sql: `INSERT INTO progetti (id, testo, rev, aggiornato, gruppo, ${COLONNE.join(", ")}) VALUES (?, ?, ?, ?, ?, ${COLONNE.map(() => "?").join(", ")})
            ON CONFLICT (id) DO UPDATE SET ${["testo", "rev", "aggiornato", "gruppo", ...COLONNE].map(c => `${c} = excluded.${c}`).join(", ")} WHERE excluded.rev > progetti.rev`,
          params: [p.id, p.testo, p.rev, p.aggiornato, p.rev, ...valori({ ...p, modelli: p.modelli ?? {} })],
        },
        ...st.map(s => ({ sql: "INSERT OR IGNORE INTO versioni (progetto, gruppo, rev, testo, chi, quando) VALUES (?, ?, ?, ?, ?, ?)", params: [id, s.rev, s.rev, s.testo, s.chi, s.quando] })),
      ]);
      let pacco: Istruzione[] = [], peso = 0;                  // i dati pesanti a pacchi di qualche MB per richiesta
      const manda = async () => { if (pacco.length) await batch(pacco); pacco = []; peso = 0; };
      const metti = async (chiave: string, valore: string | null) => {
        if (!valore) return;
        pacco.push(...scriviDati(chiave, valore, false));
        if ((peso += valore.length) > 3_000_000) await manda();
      };
      for (const m of Object.values(p.modelli ?? {})) { const mesh = await v.get<Record<string, string>>(`abita:m:${id}:${m.chiave}`); await metti(D.m(id, m.chiave), mesh && JSON.stringify(mesh)); }
      for (const f of p.foto) await metti(D.f(f.id), (await v.get<{ dati: string }>(`abita:f:${f.id}`))?.dati ?? null);
      await manda();
    }
  }
  await sql("INSERT OR REPLACE INTO meta (chiave, valore) VALUES (?, ?)", [COPIATO, String(Date.now())]);
}
