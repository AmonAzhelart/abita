"use client";
import { useState } from "react";

export default function Copia({ testo, etichetta = "Copia" }: { testo: string; etichetta?: string }) {
  const [fatto, setFatto] = useState(false);
  return (
    <button type="button" className="btn piccolo" onClick={() => navigator.clipboard.writeText(testo).then(() => { setFatto(true); setTimeout(() => setFatto(false), 1600); })}>
      {fatto ? "Copiato" : etichetta}
    </button>
  );
}
