"use client";
// Elimina un progetto dall'elenco, dopo aver chiesto conferma col suo nome.
export default function Elimina({ id, nome, azione }: { id: string; nome: string; azione: (f: FormData) => Promise<void> }) {
  return (
    <form action={azione} onSubmit={e => { if (!confirm(`Eliminare "${nome}"? Spariscono anche foto, appunti e link del cliente. Non si può annullare.`)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn piccolo pericolo">Elimina</button>
    </form>
  );
}
