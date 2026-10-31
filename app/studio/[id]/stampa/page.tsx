import { notFound } from "next/navigation";
import Stampa from "@/components/Stampa";
import { carica } from "@/lib/progetti";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/studio/[id]/stampa">) {
  const p = await carica((await params).id);
  return { title: p ? `${p.nome} · Stampa · Abita` : "Abita" };
}

export default async function Pagina({ params, searchParams }: PageProps<"/studio/[id]/stampa">) {
  const p = await carica((await params).id);
  if (!p) notFound();
  const { piano } = await searchParams;
  return <Stampa id={p.id} nome={p.nome} cliente={p.cliente} testo={p.testo} modelli={p.modelli ?? {}} piano={typeof piano === "string" ? piano : undefined} />;
}
