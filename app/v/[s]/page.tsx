import Visore from "@/components/Visore";
import { daLink } from "@/lib/progetti";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/v/[s]">) {
  const p = await daLink((await params).s);
  return { title: p?.pubblicato ? p.nome : "Abita", robots: { index: false, follow: false } };
}

export default async function Pagina({ params }: PageProps<"/v/[s]">) {
  const s = (await params).s, p = await daLink(s);
  if (!p?.pubblicato) return (
    <main className="accesso"><div style={{ maxWidth: 360, textAlign: "center" }}>
      <h1 style={{ font: "400 30px/1.1 var(--display)", marginBottom: 10 }}>Il progetto non è ancora pronto</h1>
      <p className="tenue">Il link è giusto, ma il progettista non l&apos;ha ancora pubblicato. Riapri questa pagina più tardi.</p>
    </div></main>
  );
  const commenti = p.appunti.filter(a => a.da === "cliente").map(({ id, piano, a, testo, stato }) => ({ id, piano, a, testo, stato }));
  return <Visore share={s} iniziale={{ nome: p.nome, cliente: p.cliente, ...p.pubblicato, modelli: p.modelli ?? {}, commenti }} />;
}
