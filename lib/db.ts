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
  const j = (await r.json().catch(() => null)) as { success?: boolean; errors?: { code?: number; message: string }[]; result?: unknown } | null;
  if (!j?.success) {                                       // dove e cosa, senza credenziali: per capire se è il token, l'account o il database
    const dove = percorso.startsWith("?") ? "ricerca del database" : "query";
    throw new Error(`Database (D1, ${dove}, HTTP ${r.status}): ${j?.errors?.map(e => `${e.message}${e.code ? ` [${e.code}]` : ""}`).join("; ") || "risposta vuota"}`
      + (r.status === 401 || r.status === 403 ? `. ${await diagnosi()}` : ""));
  }
  return j.result;
}
/** Quando D1 rifiuta: il token è valido? (come token personale o come token dell'account) Dice cosa sistemare. */
async function diagnosi() {
  const prova = async (u: string) => ((await fetch(u, { cache: "no-store", headers: { authorization: `Bearer ${token}` } }).then(x => x.json()).catch(() => null)) as { success?: boolean; result?: { status?: string } } | null);
  const v = (await prova("https://api.cloudflare.com/client/v4/user/tokens/verify"))?.success ? "personale" : (await prova(`https://api.cloudflare.com/client/v4/accounts/${account}/tokens/verify`))?.success ? "dell'account" : null;
  // solo la forma dei valori, mai i caratteri: basta a riconoscere una Global API Key o un ID messi al posto del token
  const forma = (s = "") => (s.startsWith("cfk_") || /^[0-9a-f]{37,45}$/.test(s) ? "è la Global API Key, non un API Token: con Abita non funziona"
    : s.startsWith("cfut_") ? `token personale nel formato nuovo (cfut_), ${s.length} caratteri` : s.startsWith("cfat_") ? `token dell'account nel formato nuovo (cfat_), ${s.length} caratteri`
      : s.startsWith("cfoat_") ? "è un accesso di Wrangler (cfoat_), non un API Token"
    : /^[0-9a-f]{32}$/.test(s) ? "32 cifre esadecimali: sembra un ID (account, zona o database), non un token"
      : /["'\s]/.test(s) ? `${s.length} caratteri, con virgolette o spazi dentro` : `${s.length} caratteri`);
  const conti = `CLOUDFLARE_API_TOKEN: ${forma(token)}; CLOUDFLARE_ACCOUNT_ID: ${/^[0-9a-f]{32}$/.test(account ?? "") ? "32 cifre esadecimali, giusto" : `${forma(account)}, ma dovrebbe essere di 32 cifre esadecimali`}.`;
  return (v ? `Il token è valido (token ${v}) ma non può usare D1 su questo account: controlla che CLOUDFLARE_ACCOUNT_ID sia quello dell'account con "${nome}" e che il token abbia il permesso Account > D1 > Edit per quell'account (senza filtro sugli IP).`
    : "Cloudflare non riconosce il token: forse è scaduto, revocato o copiato male, o è un token dell'account con un CLOUDFLARE_ACCOUNT_ID sbagliato.") + " " + conti;
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
