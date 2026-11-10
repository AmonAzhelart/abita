// I progetti: un documento per progetto (testo, appunti, foto, attività), un indice, le foto a parte.
// Ogni modifica alza rev: l'editor e la pagina del cliente lo controllano per aggiornarsi da soli.
import { randomBytes } from "node:crypto";
import { ESEMPIO } from "./esempio.ts";
import { leggi, righeCambiate, type ModelloInfo, type Pt } from "./lingua.ts";
import { kv } from "./store.ts";

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
type Versione = { rev: number; testo: string; chi: Chi; quando: number };

export const LIMITI = { testo: 200_000, appunto: 2000, appunti: 400, foto: 20, datiFoto: 3_500_000 };
const K = { m: (id: string, k: string) => `abita:m:${id}:${k}`, indice: "abita:indice", p: (id: string) => `abita:p:${id}`, r: (id: string) => `abita:r:${id}`, s: (s: string) => `abita:s:${s}`, f: (id: string) => `abita:f:${id}`, storia: (id: string) => `abita:storia:${id}` };
const nuovoId = (n: number) => randomBytes(n).toString("base64url");

export class Errore extends Error {
  stato: number;
  constructor(msg: string, stato = 400) { super(msg); this.stato = stato; }
}

export async function elenco() {
  return ((await kv.get<Voce[]>(K.indice)) ?? []).sort((a, b) => b.aggiornato - a.aggiornato);
}

export async function carica(id: string) {
  return /^[\w-]{4,40}$/.test(id) ? kv.get<Progetto>(K.p(id)) : null;
}

/** Solo il numero di revisione: l'editor lo controlla ogni pochi secondi senza scaricare tutto il progetto. */
export async function revisione(id: string) {
  return /^[\w-]{4,40}$/.test(id) ? kv.get<number>(K.r(id)) : null;
}

async function voce(p: Progetto | null, id: string) {
  // ponytail: indice letto e riscritto per intero; basta per un utente e qualche centinaio di progetti
  const ind = ((await kv.get<Voce[]>(K.indice)) ?? []).filter(v => v.id !== id);
  if (p) ind.push({ id: p.id, nome: p.nome, cliente: p.cliente, aggiornato: p.aggiornato, daFare: p.appunti.filter(a => a.stato === "da fare").length, versione: p.pubblicato?.versione ?? null, share: p.share });
  await kv.set(K.indice, ind);
}

function registra(p: Progetto, a: Omit<Attivita, "quando">) {
  p.attivita = [{ ...a, quando: Date.now() }, ...p.attivita].slice(0, 40);
}

/** Leggi, cambia, salva. fn può lanciare Errore per annullare. */
async function modifica(id: string, fn: (p: Progetto) => void | Promise<void>) {
  // ponytail: leggi-modifica-scrivi senza lock; con un solo utente e Claude le collisioni sono rare
  const p = await carica(id);
  if (!p) throw new Errore("Progetto non trovato", 404);
  await fn(p);
  p.rev++;
  p.aggiornato = Date.now();
  await kv.set(K.p(id), p);
  await kv.set(K.r(id), p.rev);
  await voce(p, id);
  return p;
}

export async function crea(nome: string, cliente = "", testo?: string) {
  nome = nome.trim().slice(0, 120) || "Nuovo progetto";
  const id = nuovoId(6), share = nuovoId(12);
  const t = testo ?? ESEMPIO.replace('progetto "Casa al mare"', `progetto "${nome.replace(/"/g, "'")}"`).replace('cliente "Famiglia Esposito"', `cliente "${(cliente || "—").replace(/"/g, "'")}"`);
  const p: Progetto = { id, nome, cliente: cliente.trim().slice(0, 120), testo: t.slice(0, LIMITI.testo), rev: 1, aggiornato: Date.now(), share, pubblicato: null, appunti: [], foto: [], attivita: [] };
  await kv.set(K.p(id), p);
  await kv.set(K.r(id), p.rev);
  await kv.set(K.s(share), id);
  await voce(p, id);
  return p;
}

export async function salvaTesto(id: string, testo: string, chi: Chi, cosa = "", baseRev?: number) {
  if (testo.length > LIMITI.testo) throw new Errore(`Il testo è troppo lungo (massimo ${LIMITI.testo} caratteri)`);
  let prima = "";
  const p = await modifica(id, async q => {
    if (baseRev !== undefined && baseRev !== q.rev) throw new Errore("Il progetto è cambiato nel frattempo", 409);
    prima = q.testo;
    q.testo = testo;
    const t = leggi(testo).titolo;
    if (t) q.nome = t.slice(0, 120);
    if (chi !== "io") registra(q, { chi, cosa: cosa || "ha cambiato il progetto", righe: righeCambiate(prima, testo).slice(0, 200) });
  });
  const st = (await kv.get<Versione[]>(K.storia(id))) ?? [];
  if (st[0] && st[0].chi === chi && Date.now() - st[0].quando < 120_000) st[0] = { rev: p.rev, testo, chi, quando: Date.now() };
  else st.unshift({ rev: p.rev, testo, chi, quando: Date.now() });
  await kv.set(K.storia(id), st.slice(0, 40));
  return { p, prima };
}

export const storia = async (id: string) => ((await kv.get<Versione[]>(K.storia(id))) ?? []).map(({ rev, chi, quando, testo }) => ({ rev, chi, quando, righe: testo.split("\n").length }));

export async function ripristina(id: string, rev: number) {
  const v = ((await kv.get<Versione[]>(K.storia(id))) ?? []).find(x => x.rev === rev);
  if (!v) throw new Errore("Versione non trovata", 404);
  return (await salvaTesto(id, v.testo, "io")).p;
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
  const vecchio = (await carica(id))?.share, share = nuovoId(12);
  const p = await modifica(id, q => { q.share = share; });
  if (vecchio) await kv.del(K.s(vecchio));
  await kv.set(K.s(share), id);
  return p;
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
  await modifica(id, p => {
    if (p.foto.length >= LIMITI.foto) throw new Errore(`Al massimo ${LIMITI.foto} foto per progetto`);
    p.foto.push(foto);
  });
  await kv.set(K.f(fid), { dati: f.dati });
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
  await kv.del(K.f(fid));
  return p;
}

export const datiFoto = async (fid: string) => (/^[\w-]{6,20}$/.test(fid) ? (await kv.get<{ dati: string }>(K.f(fid)))?.dati ?? null : null);

/** Un oggetto 3D importato: le misure stanno nel progetto, i triangoli (base64 float32 per materiale) a parte. */
export async function salvaModello(id: string, nome: string, info: ModelloInfo, mesh: Record<string, string>) {
  nome = String(nome).trim().slice(0, 120);
  if (!nome) throw new Errore("Il modello deve avere un nome");
  if (JSON.stringify(mesh).length > LIMITI.datiFoto) throw new Errore(`Il modello "${nome}" è troppo pesante`);
  const chiave = nuovoId(8);
  let vecchia: string | undefined;
  const p = await modifica(id, q => {
    q.modelli ??= {};
    if (!q.modelli[nome] && Object.keys(q.modelli).length >= 400) throw new Errore("Troppi modelli in questo progetto");
    vecchia = q.modelli[nome]?.chiave;
    q.modelli[nome] = { L: +info.L, P: +info.P, H: +info.H, pianta: info.pianta, chiave };
  });
  await kv.set(K.m(id, chiave), mesh);
  if (vecchia) await kv.del(K.m(id, vecchia));
  return p;
}

export async function meshModelli(p: Progetto) {
  const voci = Object.entries(p.modelli ?? {});
  const dati = await Promise.all(voci.map(([, m]) => kv.get<Record<string, string>>(K.m(p.id, m.chiave))));
  return Object.fromEntries(voci.map(([n], i) => [n, dati[i] ?? {}]));
}

export async function elimina(id: string) {
  const p = await carica(id);
  if (!p) return;
  for (const m of Object.values(p.modelli ?? {})) await kv.del(K.m(id, m.chiave));
  for (const f of p.foto) await kv.del(K.f(f.id));
  await kv.del(K.s(p.share));
  await kv.del(K.storia(id));
  await kv.del(K.r(id));
  await kv.del(K.p(id));
  await voce(null, id);
}

export async function daLink(share: string) {
  if (!/^[\w-]{8,40}$/.test(share)) return null;
  const id = await kv.get<string>(K.s(share));
  return id ? carica(id) : null;
}

export async function commentoCliente(share: string, a: { piano: string; a: Pt; testo: string; nome?: string }) {
  const p = await daLink(share);
  if (!p?.pubblicato) throw new Errore("Progetto non trovato", 404);
  if (p.appunti.filter(x => x.da === "cliente").length >= 100) throw new Errore("Sono già arrivati tanti commenti: scrivi direttamente al progettista");
  const nome = String(a.nome ?? "").trim().slice(0, 60);
  return nuovoAppunto(p.id, { piano: a.piano, a: a.a, testo: (nome ? `${nome}: ` : "") + String(a.testo ?? "") }, "cliente");
}
