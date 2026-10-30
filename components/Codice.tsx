"use client";
// Il progetto in parole: una textarea trasparente sopra un <pre> colorato, con numeri di riga ed errori.
import { useEffect, useMemo, useRef } from "react";
import { tokenizza, type Errore } from "@/lib/lingua";

const PAR = new Set(["a", "spessore", "altezza", "alto", "alta", "quota", "solaio", "ruota", "davanzale", "sporto", "falde", "colore", "materiale", "pavimento", "verso", "cardine", "colmo", "chiudi", "chiuso", "scorrevole", "piano"]);
const NUM = /^(-?[\d.]+,-?[\d.]+|[<>^v][\d.]+|[\d.]+(x[\d.]+){0,2}|-?[\d.]+)$/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function colora(r: string) {
  const t = tokenizza(r);
  let out = "", i = 0;
  t.forEach((k, n) => {
    out += esc(r.slice(i, k.s));
    const cls = n === 0 ? "k-kw" : k.q ? "k-str" : NUM.test(k.t) ? "k-num" : PAR.has(k.t.toLowerCase()) ? "k-par" : "";
    out += cls ? `<span class="${cls}">${esc(r.slice(k.s, k.e))}</span>` : esc(r.slice(k.s, k.e));
    i = k.e;
  });
  const resto = r.slice(i);
  return out + (resto.trim().startsWith("#") ? esc(resto.slice(0, resto.indexOf("#"))) + `<span class="k-com">${esc(resto.slice(resto.indexOf("#")))}</span>` : esc(resto));
}

type Props = { testo: string; errori: Errore[]; sel: number | null; evid: number[]; vai?: { riga: number; n: number }; onChange: (t: string) => void; onRiga: (r: number) => void };

export default function Codice({ testo, errori, sel, evid, vai, onChange, onRiga }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null), pre = useRef<HTMLPreElement>(null), num = useRef<HTMLDivElement>(null);
  const righe = useMemo(() => testo.split("\n"), [testo]);
  const errate = useMemo(() => new Set(errori.map(e => e.riga)), [errori]);
  const ev = useMemo(() => new Set(evid), [evid]);
  const html = useMemo(() => righe.map((r, i) => `<span class="r${i === sel ? " sel" : ""}${ev.has(i) ? " claude" : ""}${errate.has(i) ? " err" : ""}">${colora(r) || " "}</span>`).join(""), [righe, sel, ev, errate]);
  const sync = () => { if (ta.current && pre.current && num.current) { pre.current.scrollTop = ta.current.scrollTop; pre.current.scrollLeft = ta.current.scrollLeft; num.current.scrollTop = ta.current.scrollTop; } };

  // porta in vista una riga (clic su un elemento della pianta o su un errore)
  useEffect(() => {
    const t = ta.current;
    if (!t || !vai) return;
    const top = vai.riga * 20, h = t.clientHeight;
    if (top < t.scrollTop + 20 || top > t.scrollTop + h - 60) t.scrollTop = Math.max(0, top - h / 3);
    sync();
  }, [vai]);
  useEffect(sync, [html]);

  const rigaCursore = () => { const t = ta.current!; onRiga(t.value.slice(0, t.selectionStart).split("\n").length - 1); };

  return (
    <div className="codice">
      <div className="numeri" ref={num} aria-hidden="true">
        {righe.map((_, i) => <div key={i} className={errate.has(i) ? "err" : undefined}>{i + 1}</div>)}
        <div style={{ height: 40 }} />
      </div>
      <div className="area">
        <pre ref={pre} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html + "\n\n" }} />
        <textarea ref={ta} value={testo} wrap="off" spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="Il progetto in parole"
          onChange={e => onChange(e.target.value)} onScroll={sync} onClick={rigaCursore} onKeyUp={e => { if (e.key.startsWith("Arrow")) rigaCursore(); }}
          onKeyDown={e => {
            if (e.key === "Tab") {                       // il tab mette due spazi invece di uscire dal campo
              e.preventDefault();
              const t = e.currentTarget, a = t.selectionStart;
              onChange(t.value.slice(0, a) + "  " + t.value.slice(t.selectionEnd));
              requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
            }
          }} />
      </div>
    </div>
  );
}
