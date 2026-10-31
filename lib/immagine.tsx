// La pianta come PNG per Claude: la geometria è un SVG, le scritte le mette satori (resvg da solo non ha font).
import { ImageResponse } from "next/og";
import type { Modello } from "./lingua.ts";
import { passaggi, type Triangoli } from "./passaggi.ts";
import { CHIARO, disegnaPianta, riquadro } from "./pianta.ts";
import type { Appunto } from "./progetti.ts";

export async function pngPianta(M: Modello, piano: string, o: { quote?: boolean; passaggi?: boolean; appunti?: Appunto[]; titolo?: string; mesh?: Triangoli }) {
  const b = riquadro(M, piano), k = Math.min(1400 / b.w, 1100 / b.h), W = Math.round(b.w * k), H = Math.round(b.h * k), TESTA = 44;
  const es = o.passaggi ? passaggi(M, piano, o.mesh) : null;
  const { svg, etichette } = disegnaPianta(M, { piano, colori: CHIARO, quote: o.quote, passaggi: es, testo: false });
  const note = (o.appunti ?? []).map((a, i) => ({ a, n: i + 1 })).filter(x => x.a.piano === piano);
  let extra = "";
  for (const { a } of note) {
    const c = a.stato === "fatta" ? "#2F9E44" : a.da === "cliente" ? "#7048E8" : "#E8590C";
    if (a.tipo === "linea" && a.b) extra += `<line x1="${a.a.x}" y1="${a.a.y}" x2="${a.b.x}" y2="${a.b.y}" style="stroke:${c};stroke-width:4"/>`;
    if (a.tipo === "zona" && a.b) extra += `<rect x="${Math.min(a.a.x, a.b.x)}" y="${Math.min(a.a.y, a.b.y)}" width="${Math.abs(a.b.x - a.a.x)}" height="${Math.abs(a.b.y - a.a.y)}" style="fill:${c}22;stroke:${c};stroke-width:3;stroke-dasharray:10 6"/>`;
    extra += `<circle cx="${a.a.x}" cy="${a.a.y}" r="${16 / k}" style="fill:${c}"/>`;
  }
  const src = "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${W}" height="${H}">${svg}${extra}</svg>`).toString("base64");
  const px = (x: number) => (x - b.x) * k, py = (y: number) => (y - b.y) * k + TESTA;
  const nome = M.piani.find(p => p.id === piano)?.nome ?? piano;
  const img = (
    <div style={{ width: W, height: H + TESTA, display: "flex", position: "relative", background: "#F8F8F5", fontFamily: "sans-serif" }}>
      <div style={{ position: "absolute", left: 16, top: 10, fontSize: 20, color: "#23262B", display: "flex" }}>{`${o.titolo ?? M.titolo} · ${nome}`}</div>
      <div style={{ position: "absolute", right: 16, top: 14, fontSize: 14, color: "#5B6169", display: "flex" }}>{`1 cm = ${k.toFixed(2)} px · x verso destra, y verso il basso`}</div>
      <img src={src} width={W} height={H} style={{ position: "absolute", left: 0, top: TESTA }} />
      {etichette.map((e, i) => (
        <div key={i} style={{ position: "absolute", left: px(e.x) - 150, top: py(e.y + (e.dy ?? 0) * e.dim) - 12, width: 300, height: 24, display: "flex", justifyContent: "center", alignItems: "center",
          fontSize: Math.max(10, Math.round(e.dim * k * 0.95)), fontWeight: e.peso, color: e.colore, ...(e.ruota ? { transform: `rotate(${e.ruota}deg)` } : {}) }}>{e.testo}</div>
      ))}
      {note.map(({ a, n }) => (
        <div key={a.id} style={{ position: "absolute", left: px(a.a.x) - 15, top: py(a.a.y) - 15, width: 30, height: 30, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 15, color: "#fff" }}>{String(n)}</div>
      ))}
    </div>
  );
  const r = new ImageResponse(img, { width: W, height: H + TESTA });
  return { png: Buffer.from(await r.arrayBuffer()).toString("base64"), problemi: es?.problemi ?? [], note };
}
