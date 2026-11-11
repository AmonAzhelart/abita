// Il database. Su Vercel: Cloudflare D1 attraverso la sua API (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN; il database
// si trova per nome, "abita-database", o con CLOUDFLARE_D1_DATABASE_ID). In locale, senza quelle variabili: un file
// SQLite in .dati/abita.sqlite. Lo stesso SQL nei due casi. Un batch è una richiesta sola e gira in una transazione.
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

export type Valore = string | number | null;
export type Istruzione = { sql: string; params?: Valore[] };
export type Riga = Record<string, unknown>;

const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN, nome = process.env.CLOUDFLARE_D1_NAME ?? "abita-database";
export const suD1 = !!(account && token);

async function api(percorso: string, init?: RequestInit) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database${percorso}`, {
    ...init, cache: "no-store", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const j = (await r.json().catch(() => null)) as { success?: boolean; errors?: { message: string }[]; result?: unknown } | null;
  if (!j?.success) throw new Error(`Database (D1): ${j?.errors?.map(e => e.message).join("; ") || `risposta ${r.status}`}`);
  return j.result;
}
let id: Promise<string> | null = null;
const idDatabase = () => (id ??= process.env.CLOUDFLARE_D1_DATABASE_ID
  ? Promise.resolve(process.env.CLOUDFLARE_D1_DATABASE_ID)
  : api(`?name=${encodeURIComponent(nome)}`).then(r => {
    const d = (r as { uuid: string; name: string }[]).find(x => x.name === nome);
    if (!d) throw new Error(`Database (D1): nel tuo account Cloudflare non c'è "${nome}"`);
    return d.uuid;
  }).catch(e => { id = null; throw e; }));

let locale: DatabaseSync | null = null;
async function aperto() {
  if (process.env.VERCEL) throw new Error("Manca il database: su Vercel aggiungi CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN (Cloudflare D1).");
  if (!locale) {
    const [{ DatabaseSync }, fs] = await Promise.all([import("node:sqlite"), import("node:fs")]);
    const dir = path.join(process.cwd(), ".dati");
    fs.mkdirSync(dir, { recursive: true });
    locale = new DatabaseSync(path.join(dir, "abita.sqlite"));
  }
  return locale;
}

/** Più istruzioni in una richiesta, tutte o nessuna. Torna le righe di ognuna. */
export async function batch(lista: Istruzione[]): Promise<Riga[][]> {
  if (!lista.length) return [];
  if (suD1) {                                              // l'API vuole i parametri come stringhe: SQLite li riconverte nelle colonne numeriche
    const q = lista.map(i => ({ sql: i.sql, params: (i.params ?? []).map(v => (typeof v === "number" ? String(v) : v)) }));
    const r = (await api(`/${await idDatabase()}/query`, { method: "POST", body: JSON.stringify(q.length === 1 ? q[0] : { batch: q }) })) as { results?: Riga[] }[];
    return r.map(x => x.results ?? []);
  }
  const db = await aperto();
  db.exec("BEGIN");
  try {
    const out = lista.map(i => db.prepare(i.sql).all(...(i.params ?? [])) as Riga[]);
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export const sql = async (q: string, params: Valore[] = []) => (await batch([{ sql: q, params }]))[0];
