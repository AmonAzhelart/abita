"use client";
// Importa un progetto esportato (per esempio casa-fonti.abita.json): prima il testo, poi i modelli 3D uno alla volta.
import { useState } from "react";

async function rpc(azione: string, dati: object) {
  const r = await fetch("/api/studio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ azione, ...dati }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.errore ?? "Il server non ha accettato il file");
  return j;
}

export default function Importa() {
  const [stato, setStato] = useState("");
  async function carica(f: File) {
    try {
      setStato("Leggo il file…");
      const d = JSON.parse(await f.text());
      if (typeof d.testo !== "string") throw new Error("Questo file non è un progetto di Abita");
      const p = await rpc("crea", { nome: d.nome ?? f.name.replace(/\..*$/, ""), cliente: d.cliente ?? "", testo: d.testo });
      const modelli = Object.entries(d.modelli ?? {}) as [string, { mesh: Record<string, string> }][];
      for (const [i, [nome, { mesh, ...info }]] of modelli.entries()) {
        setStato(`Carico i modelli 3D: ${i + 1} di ${modelli.length}`);
        await rpc("modello", { id: p.id, nome, info, mesh });
      }
      location.href = `/studio/${p.id}`;
    } catch (e) {
      setStato(e instanceof Error ? e.message : "Importazione non riuscita");
    }
  }
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label className="btn" style={{ cursor: "pointer" }}>Importa da file
        <input type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) carica(f); e.target.value = ""; }} />
      </label>
      {stato && <span className="piccolo tenue" aria-live="polite">{stato}</span>}
    </div>
  );
}
