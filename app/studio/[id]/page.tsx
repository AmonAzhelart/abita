import { notFound } from "next/navigation";
import Editor from "@/components/Editor";
import { carica } from "@/lib/progetti";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/studio/[id]">) {
  const p = await carica((await params).id);
  return { title: p ? `${p.nome} · Abita` : "Abita" };
}

export default async function Pagina({ params }: PageProps<"/studio/[id]">) {
  const p = await carica((await params).id);
  if (!p) notFound();
  return <Editor iniziale={p} />;
}
