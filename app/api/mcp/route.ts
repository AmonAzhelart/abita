// Il server MCP: Claude legge, scrive e guarda i progetti. Streamable HTTP senza sessioni, chiave Bearer.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { chiaveValida } from "@/lib/auth";
import { GUIDA } from "@/lib/guida";
import { pngPianta } from "@/lib/immagine";
import { etichetta, leggi, riassunto, stanzaDi, vicini, type Modello } from "@/lib/lingua";
import { testoPassaggi } from "@/lib/passaggi";
import * as P from "@/lib/progetti";

export const maxDuration = 60;

const ISTRUZIONI = `Abita è lo studio dove Claude disegna case (pianta e 3D) per i clienti del progettista, in una lingua di testo semplice.
Come lavorare:
1. La prima volta leggi guida_lingua. Poi progetti → leggi_progetto per avere il testo con i numeri di riga.
2. Gli appunti (appunti) sono le richieste del progettista e dei clienti, con le coordinate sulla pianta e gli elementi vicini.
3. Cambia il progetto con modifica_progetto (sostituzioni precise) o scrivi_progetto (testo intero). Scrivi sempre un messaggio breve: il progettista lo vede in diretta nell'editor.
4. Dopo ogni modifica usa guarda per vedere la pianta e controlla i passaggi (70 cm). Se una cosa non entra, dillo invece di forzarla.
5. Chiudi gli appunti con rispondi_appunto. Usa chiedi se ti manca una misura.
6. Non pubblicare per il cliente se il progettista non te lo chiede.`;

const testo = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const sbaglio = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });
type Risposta = ReturnType<typeof testo> | { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
const prova = <A,>(fn: (a: A) => Promise<Risposta>) => async (a: A) => {
  try { return await fn(a); } catch (e) { return sbaglio(e instanceof Error ? e.message : String(e)); }
};

async function progetto(id: string) {
  const p = await P.carica(id);
  if (!p) throw new P.Errore(`Non trovo il progetto "${id}". Usa lo strumento progetti per vedere gli id.`);
  return p;
}
function piano(M: Modello, nome?: string) {
  if (!nome) return M.piani[0]?.id ?? "terra";
  const p = M.piani.find(x => x.id === nome.toLowerCase() || x.nome.toLowerCase() === nome.toLowerCase());
  if (!p) throw new P.Errore(`Piano "${nome}" non trovato. Piani: ${M.piani.map(x => x.nome).join(", ")}`);
  return p.id;
}
const numerato = (t: string) => t.split("\n").map((r, i) => `${String(i + 1).padStart(4)} | ${r}`).join("\n");
const errori = (M: Modello) => (M.errori.length ? "Errori da correggere:\n" + M.errori.map(e => `- riga ${e.riga + 1}: ${e.msg}`).join("\n") : "Nessun errore.");
const passaggiTutti = (M: Modello) => M.piani.map(p => testoPassaggi(M, p.id)).join("\n");
function quando(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "adesso" : m < 60 ? `${m} min fa` : m < 1440 ? `${Math.round(m / 60)} ore fa` : `${Math.round(m / 1440)} giorni fa`;
}

function esito(p: P.Progetto, prima: string, origin: string) {
  const M = leggi(p.testo, p.modelli), n = p.attivita[0]?.righe?.length ?? 0;
  return testo(`Salvato (rev ${p.rev}). ${prima === p.testo ? "Il testo non è cambiato." : `${n} righe nuove o cambiate.`}\n${errori(M)}\n\n${riassunto(M)}\n\n${passaggiTutti(M)}\n\nEditor: ${origin}/studio/${p.id}`);
}

function server(origin: string) {
  const s = new McpServer({ name: "abita", version: "1.0.0" }, { instructions: ISTRUZIONI });

  s.registerTool("guida_lingua", { description: "La guida completa della lingua di Abita: piani, muri, stanze, porte, arredi, tetti, colori, regole sui passaggi. Leggila prima di scrivere un progetto.", inputSchema: {} },
    async () => testo(GUIDA));

  s.registerTool("progetti", { description: "Elenca i progetti: id, nome, cliente, appunti da fare, versione pubblicata, link.", inputSchema: {} },
    prova(async () => {
      const v = await P.elenco();
      return testo(v.length ? v.map(x => `- ${x.id} · ${x.nome}${x.cliente ? ` (${x.cliente})` : ""} · aggiornato ${quando(x.aggiornato)} · ${x.daFare} appunti da fare · ${x.versione ? `pubblicato v${x.versione}` : "non pubblicato"}\n  editor ${origin}/studio/${x.id}`).join("\n") : "Nessun progetto. Creane uno con nuovo_progetto.");
    }));

  s.registerTool("nuovo_progetto", {
    description: "Crea un progetto nuovo. Senza testo parte da uno scheletro vuoto con un piano Terra.",
    inputSchema: { nome: z.string().describe("Nome del progetto, es. Casa Rossi"), cliente: z.string().optional(), testo: z.string().optional().describe("Testo completo nella lingua di Abita") },
  }, prova(async ({ nome, cliente, testo: t }: { nome: string; cliente?: string; testo?: string }) => {
    const p = await P.crea(nome, cliente ?? "", t ?? `progetto "${nome.replace(/"/g, "'")}"\ncliente "${(cliente ?? "").replace(/"/g, "'")}"\n\npiano Terra altezza 270\n`);
    return testo(`Creato ${p.id}.\nEditor: ${origin}/studio/${p.id}\nLink cliente (vale dopo la prima pubblicazione): ${origin}/v/${p.share}\n${errori(leggi(p.testo, p.modelli))}`);
  }));

  s.registerTool("leggi_progetto", {
    description: "Il testo del progetto con i numeri di riga, gli errori, le stanze con le aree, il controllo dei passaggi e quanti appunti ci sono da fare.",
    inputSchema: { id: z.string() },
  }, prova(async ({ id }: { id: string }) => {
    const p = await progetto(id), M = leggi(p.testo, p.modelli), da = p.appunti.filter(a => a.stato === "da fare").length;
    const pub = p.pubblicato ? `pubblicato v${p.pubblicato.versione} ${quando(p.pubblicato.quando)}${p.pubblicato.testo === p.testo ? "" : " (ci sono modifiche non pubblicate)"}` : "mai pubblicato";
    return testo(`${p.nome}${p.cliente ? ` per ${p.cliente}` : ""} · id ${p.id} · rev ${p.rev} · ${pub}\nEditor: ${origin}/studio/${p.id} · cliente: ${origin}/v/${p.share}\n${da} appunti da fare${da ? " (strumento appunti)" : ""}\n\n${numerato(p.testo)}\n\n${errori(M)}\n\n${riassunto(M)}\n\n${passaggiTutti(M)}`);
  }));

  s.registerTool("scrivi_progetto", {
    description: "Sostituisce tutto il testo del progetto. Per cambi piccoli preferisci modifica_progetto.",
    inputSchema: { id: z.string(), testo: z.string(), messaggio: z.string().describe("Cosa hai fatto, in breve: lo vede il progettista") },
  }, prova(async ({ id, testo: t, messaggio }: { id: string; testo: string; messaggio: string }) => {
    const { p, prima } = await P.salvaTesto((await progetto(id)).id, t, "claude", messaggio);
    return esito(p, prima, origin);
  }));

  s.registerTool("modifica_progetto", {
    description: "Applica sostituzioni di testo esatte, in ordine. Ogni 'cerca' deve comparire una sola volta (copia la riga intera da leggi_progetto, senza il numero). Per aggiungere righe, cerca una riga vicina e rimettila insieme alle nuove. Se una sostituzione non va, non si salva niente.",
    inputSchema: {
      id: z.string(),
      modifiche: z.array(z.object({ cerca: z.string().min(1), sostituisci: z.string() })).min(1),
      messaggio: z.string().describe("Cosa hai fatto, in breve: lo vede il progettista"),
    },
  }, prova(async ({ id, modifiche, messaggio }: { id: string; modifiche: { cerca: string; sostituisci: string }[]; messaggio: string }) => {
    const p0 = await progetto(id);
    let t = p0.testo;
    for (const [i, m] of modifiche.entries()) {
      const n = t.split(m.cerca).length - 1;
      if (n !== 1) return sbaglio(`Modifica ${i + 1}: "${m.cerca.slice(0, 80)}" compare ${n} volte (deve essere 1). Non ho salvato niente.`);
      t = t.replace(m.cerca, () => m.sostituisci);
    }
    const { p, prima } = await P.salvaTesto(p0.id, t, "claude", messaggio);
    return esito(p, prima, origin);
  }));

  s.registerTool("guarda", {
    description: "Disegna la pianta di un piano come immagine (con nomi, aree, quote e appunti numerati) per controllare il lavoro. Con passaggi: true colora di verde dove si passa e segna in rosso cosa non si raggiunge.",
    inputSchema: { id: z.string(), piano: z.string().optional().describe("Nome del piano, di serie il primo"), quote: z.boolean().optional(), passaggi: z.boolean().optional() },
  }, prova(async ({ id, piano: pn, quote, passaggi }: { id: string; piano?: string; quote?: boolean; passaggi?: boolean }) => {
    const p = await progetto(id), M = leggi(p.testo, p.modelli), pid = piano(M, pn);
    const r = await pngPianta(M, pid, { quote: quote ?? true, passaggi, appunti: p.appunti, titolo: p.nome });
    const legenda = [
      r.note.length ? "Appunti su questo piano: " + r.note.map(({ a, n }) => `${n}) ${a.stato} – ${a.testo.slice(0, 60)}`).join(" · ") : "",
      passaggi ? (r.problemi.length ? "Da sistemare: " + r.problemi.map(x => x.msg).join(" · ") : "Si passa ovunque.") : "",
      M.errori.length ? errori(M) : "",
    ].filter(Boolean).join("\n");
    return { content: [{ type: "image" as const, data: r.png, mimeType: "image/png" }, { type: "text" as const, text: legenda || "Pianta disegnata." }] };
  }));

  s.registerTool("appunti", {
    description: "Gli appunti sulla pianta (tuoi, del progettista e dei clienti): testo, coordinate, la stanza e gli elementi vicini con il numero di riga.",
    inputSchema: { id: z.string(), tutti: z.boolean().optional().describe("Anche quelli già fatti") },
  }, prova(async ({ id, tutti }: { id: string; tutti?: boolean }) => {
    const p = await progetto(id), M = leggi(p.testo, p.modelli);
    const lista = p.appunti.map((a, i) => ({ a, n: i + 1 })).filter(x => tutti || x.a.stato === "da fare");
    if (!lista.length) return testo("Nessun appunto da fare.");
    return testo(lista.map(({ a, n }) => {
      const pn = M.piani.find(x => x.id === a.piano)?.nome ?? a.piano;
      const dove = a.tipo === "punto" ? `punto ${a.a.x},${a.a.y}` : `${a.tipo} da ${a.a.x},${a.a.y} a ${a.b?.x},${a.b?.y}` + (a.b ? ` (${Math.round(Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y))} cm)` : "");
      const v = vicini(M, a.piano, a.a).map(x => `${etichetta(x.e)} riga ${x.e.riga + 1}${x.d ? ` a ${Math.round(x.d)} cm` : ""}`).join("; ");
      const st = stanzaDi(M, a.piano, a.a);
      return `${n}) [${a.id}] ${a.stato} · da ${a.da === "io" ? "progettista" : a.da} · ${pn}${st ? `, in ${st.nome || "area"} (riga ${st.riga + 1})` : ""} · ${dove}\n   "${a.testo}"${a.risposta ? `\n   risposta: ${a.risposta}` : ""}${v ? `\n   vicino a: ${v}` : ""}`;
    }).join("\n"));
  }));

  s.registerTool("rispondi_appunto", {
    description: "Risponde a un appunto e (di serie) lo segna come fatto. La risposta la vede il progettista.",
    inputSchema: { id: z.string(), appunto: z.string().describe("L'id tra parentesi quadre in appunti"), risposta: z.string(), fatta: z.boolean().optional() },
  }, prova(async ({ id, appunto, risposta, fatta }: { id: string; appunto: string; risposta: string; fatta?: boolean }) => {
    await P.cambiaAppunto((await progetto(id)).id, appunto, { risposta, stato: fatta === false ? "da fare" : "fatta" }, "claude");
    return testo("Fatto.");
  }));

  s.registerTool("chiedi", {
    description: "Lascia una domanda o un avviso per il progettista in un punto della pianta (per esempio una misura che manca).",
    inputSchema: { id: z.string(), testo: z.string(), x: z.number(), y: z.number(), piano: z.string().optional() },
  }, prova(async ({ id, testo: t, x, y, piano: pn }: { id: string; testo: string; x: number; y: number; piano?: string }) => {
    const p = await progetto(id);
    await P.nuovoAppunto(p.id, { piano: piano(leggi(p.testo, p.modelli), pn), a: { x, y }, testo: t }, "claude");
    return testo("Domanda lasciata sulla pianta.");
  }));

  s.registerTool("foto", {
    description: "Senza 'foto': elenca le foto del progetto (piantine del cliente, foto delle stanze) con la loro messa in scala. Con 'foto': restituisce l'immagine e come passare dai pixel alle coordinate della pianta.",
    inputSchema: { id: z.string(), foto: z.string().optional() },
  }, prova(async ({ id, foto }: { id: string; foto?: string }) => {
    const p = await progetto(id);
    const scala = (f: P.Foto) => f.scala === 1 && !f.x && !f.y && !f.rot ? "non ancora messa in scala"
      : `pixel (px,py) → pianta x = ${f.x} + px·${f.scala.toFixed(4)}·cos(${f.rot}°) − py·${f.scala.toFixed(4)}·sin(${f.rot}°), y = ${f.y} + px·${f.scala.toFixed(4)}·sin(${f.rot}°) + py·${f.scala.toFixed(4)}·cos(${f.rot}°)`;
    if (!foto) return testo(p.foto.length ? p.foto.map(f => `- ${f.id} · ${f.nome} · ${f.w}x${f.h} px · piano ${f.piano} · ${scala(f)}`).join("\n") : "Nessuna foto. Il progettista le carica dall'editor (pannello Foto).");
    const f = p.foto.find(x => x.id === foto), d = f && (await P.datiFoto(f.id));
    if (!f || !d) return sbaglio("Foto non trovata.");
    const [testa, b64] = d.split(",");
    return { content: [{ type: "image" as const, data: b64, mimeType: testa.slice(5, testa.indexOf(";")) }, { type: "text" as const, text: `${f.nome}, ${f.w}x${f.h} px. ${scala(f)}` }] };
  }));

  s.registerTool("passaggi", {
    description: "Controlla che si passi ovunque (70 cm) dagli ingressi o dalla scala fino a ogni stanza e davanti a ogni mobile.",
    inputSchema: { id: z.string(), piano: z.string().optional() },
  }, prova(async ({ id, piano: pn }: { id: string; piano?: string }) => {
    const pp = await progetto(id), M = leggi(pp.testo, pp.modelli);
    return testo(pn ? testoPassaggi(M, piano(M, pn)) : passaggiTutti(M));
  }));

  s.registerTool("pubblica", {
    description: "Pubblica la versione attuale sul link del cliente. Solo se il progettista lo chiede.",
    inputSchema: { id: z.string(), nota: z.string().optional().describe("Cosa è cambiato, la vede il cliente") },
  }, prova(async ({ id, nota }: { id: string; nota?: string }) => {
    const p = await P.pubblica((await progetto(id)).id, "claude", nota);
    return testo(`Pubblicata la versione ${p.pubblicato!.versione}. Link cliente: ${origin}/v/${p.share}`);
  }));

  return s;
}

async function mcp(req: Request) {
  if (!chiaveValida(req.headers.get("authorization")))
    return Response.json({ jsonrpc: "2.0", error: { code: -32001, message: "Chiave mancante o sbagliata: usa Authorization: Bearer <ABITA_TOKEN>" }, id: null }, { status: 401 });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const t = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server(process.env.ABITA_URL ?? new URL(req.url).origin).connect(t);
  return t.handleRequest(req);
}

export { mcp as GET, mcp as POST, mcp as DELETE };
