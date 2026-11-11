import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Elimina from "@/components/Elimina";
import Importa from "@/components/Importa";
import { copiaSospesa, crea, elenco, elimina, riprovaCopia } from "@/lib/progetti";

export const metadata = { title: "Progetti · Abita" };
export const dynamic = "force-dynamic";

async function nuovo(f: FormData) {
  "use server";
  const nome = String(f.get("nome") ?? ""), cliente = String(f.get("cliente") ?? "");
  const p = await crea(nome, cliente, f.get("esempio") ? undefined : `progetto "${nome.replace(/"/g, "'")}"\ncliente "${cliente.replace(/"/g, "'")}"\n\npiano Terra altezza 270\n`);
  redirect(`/studio/${p.id}`);
}

async function copia() {
  "use server";
  await riprovaCopia();
  revalidatePath("/studio");
}

async function via(f: FormData) {
  "use server";
  await elimina(String(f.get("id") ?? ""));
  revalidatePath("/studio");
}

const data = (t: number) => new Date(t).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Studio() {
  const lista = await elenco(), sospesa = copiaSospesa();
  return (
    <main className="pagina">
      <header className="testata">
        <Link href="/studio" className="marchio">Abita<small>studio</small></Link>
        <span className="spazio" />
        <Link href="/studio/guida" className="btn">Guida e collegamento a Claude</Link>
        <form method="post" action="/api/accesso"><button className="btn" name="esci" value="1">Esci</button></form>
      </header>
      {sospesa && <div className="blocco avviso-copia" role="status">
        <b>I progetti di prima sono ancora sul vecchio database (Upstash) e per ora non si possono leggere.</b>
        <span>Abita riprova da solo ogni 5 minuti e li copia qui appena può, senza toccare quello che fai nel frattempo. Per averli subito: nella console di Upstash attiva l&apos;aumento automatico del piano o passa al pagamento a consumo (per la copia bastano pochi centesimi), poi ricarica questa pagina.</span>
        <span className="tenue piccolo">Risposta di Upstash: {sospesa}</span>
        <form action={copia}><button className="btn piccolo">Copia adesso</button></form>
      </div>}
      <div className="griglia-progetti">
        <section className="progetto nuovo">
          <h2>Nuovo progetto</h2>
          <form action={nuovo}>
            <input name="nome" placeholder="Casa Rossi" aria-label="Nome del progetto" required maxLength={120} />
            <input name="cliente" placeholder="Famiglia Rossi" aria-label="Cliente" maxLength={120} />
            <label className="piccolo tenue" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="esempio" defaultChecked style={{ minHeight: 0 }} /> Parti dalla casa di esempio</label>
            <button className="btn primario">Crea progetto</button>
          </form>
          <Importa />
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
              <span style={{ flex: 1 }} />
              <Elimina id={p.id} nome={p.nome} azione={via} />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
