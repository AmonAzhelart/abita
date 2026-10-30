import Link from "next/link";
import { redirect } from "next/navigation";
import { crea, elenco } from "@/lib/progetti";

export const metadata = { title: "Progetti · Abita" };
export const dynamic = "force-dynamic";

async function nuovo(f: FormData) {
  "use server";
  const nome = String(f.get("nome") ?? ""), cliente = String(f.get("cliente") ?? "");
  const p = await crea(nome, cliente, f.get("esempio") ? undefined : `progetto "${nome.replace(/"/g, "'")}"\ncliente "${cliente.replace(/"/g, "'")}"\n\npiano Terra altezza 270\n`);
  redirect(`/studio/${p.id}`);
}

const data = (t: number) => new Date(t).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Studio() {
  const lista = await elenco();
  return (
    <main className="pagina">
      <header className="testata">
        <Link href="/studio" className="marchio">Abita<small>studio</small></Link>
        <span className="spazio" />
        <Link href="/studio/guida" className="btn">Guida e collegamento a Claude</Link>
        <form method="post" action="/api/accesso"><button className="btn" name="esci" value="1">Esci</button></form>
      </header>
      <div className="griglia-progetti">
        <section className="progetto nuovo">
          <h2>Nuovo progetto</h2>
          <form action={nuovo}>
            <input name="nome" placeholder="Casa Rossi" aria-label="Nome del progetto" required maxLength={120} />
            <input name="cliente" placeholder="Famiglia Rossi" aria-label="Cliente" maxLength={120} />
            <label className="piccolo tenue" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="esempio" defaultChecked style={{ minHeight: 0 }} /> Parti dalla casa di esempio</label>
            <button className="btn primario">Crea progetto</button>
          </form>
        </section>
        {lista.map(p => (
          <section className="progetto" key={p.id}>
            <h2><Link href={`/studio/${p.id}`}>{p.nome}</Link></h2>
            {p.cliente && <p className="tenue" style={{ margin: 0 }}>{p.cliente}</p>}
            <div className="distintivi">
              <span className="distintivo">Modificato il {data(p.aggiornato)}</span>
              {p.daFare > 0 && <span className="distintivo nota">{p.daFare} {p.daFare === 1 ? "appunto da fare" : "appunti da fare"}</span>}
              <span className={"distintivo" + (p.versione ? " ok" : "")}>{p.versione ? `Pubblicato, versione ${p.versione}` : "Non ancora pubblicato"}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link className="btn piccolo" href={`/studio/${p.id}`}>Apri</Link>
              {p.versione && <a className="btn piccolo" href={`/v/${p.share}`} target="_blank" rel="noreferrer">Vista cliente</a>}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
