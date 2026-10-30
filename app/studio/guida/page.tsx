import Link from "next/link";
import { headers } from "next/headers";
import Copia from "@/components/Copia";
import { GUIDA } from "@/lib/guida";

export const metadata = { title: "Guida · Abita" };

// Markdown della guida: titoli, elenchi, blocchi di codice, `codice` e **grassetto**. Basta questo.
function md(t: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const riga = (s: string) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const out: string[] = [];
  let lista = "";
  const chiudi = () => { if (lista) { out.push(`</${lista}>`); lista = ""; } };
  const righe = t.split("\n");
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i];
    if (r.startsWith("```")) {
      chiudi();
      const c: string[] = [];
      while (++i < righe.length && !righe[i].startsWith("```")) c.push(esc(righe[i]));
      out.push(`<pre><code>${c.join("\n")}</code></pre>`);
    } else if (/^#{1,3} /.test(r)) { chiudi(); const n = r.indexOf(" "); out.push(`<h${n}>${riga(r.slice(n + 1))}</h${n}>`); }
    else if (/^(- |\d+\. )/.test(r)) {
      const tipo = r.startsWith("- ") ? "ul" : "ol";
      if (lista !== tipo) { chiudi(); out.push(`<${tipo}>`); lista = tipo; }
      out.push(`<li>${riga(r.replace(/^(- |\d+\. )/, ""))}</li>`);
    } else if (r.trim()) { chiudi(); out.push(`<p>${riga(r)}</p>`); }
    else chiudi();
  }
  chiudi();
  return out.join("\n");
}

export default async function Guida() {
  const h = await headers(), origin = process.env.ABITA_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const cmd = `claude mcp add --transport http --scope user abita ${origin}/api/mcp --header "Authorization: Bearer LA_TUA_CHIAVE"`;
  return (
    <main className="pagina">
      <header className="testata">
        <Link href="/studio" className="marchio">Abita<small>guida</small></Link>
      </header>
      <article className="guida">
        <section className="collega">
          <h2>Collega Claude Code</h2>
          <p>Nel terminale del tuo computer esegui questo comando. Al posto di <code>LA_TUA_CHIAVE</code> metti il valore di <code>ABITA_TOKEN</code> che hai impostato su Vercel.</p>
          <div className="comando"><pre>{cmd}</pre><Copia testo={cmd} /></div>
          <p>Poi apri Claude Code (anche in una cartella qualsiasi) e scrivi <code>/mcp</code>: deve comparire <strong>abita</strong> collegato. Da lì puoi chiedere cose come:</p>
          <ul>
            <li>«Su Abita crea il progetto Casa Bianchi: ti incollo le misure che ho preso»</li>
            <li>«Guarda la foto della piantina in Casa Bianchi e ridisegnala»</li>
            <li>«Leggi gli appunti di Casa Rossi e sistemali, poi controlla i passaggi»</li>
            <li>«Arreda la camera con letto, armadio e scrivania, lasciando 70 cm per passare»</li>
          </ul>
          <p className="tenue">Mentre Claude lavora, tieni aperto il progetto nell&apos;editor: vedi le modifiche comparire in diretta, colorate di cotto. Per togliere il collegamento: <code>claude mcp remove abita</code>.</p>
        </section>
        <div dangerouslySetInnerHTML={{ __html: md(GUIDA) }} />
      </article>
    </main>
  );
}
