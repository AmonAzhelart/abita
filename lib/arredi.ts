// Catalogo degli arredi e colori. Ogni arredo è fatto di scatole (B) e cilindri (C) in cm, in coordinate locali:
// x lungo la larghezza L, y lungo la profondità P (lo schienale/retro sta a y = -P/2, il fronte a +P/2), z in altezza da terra.

export const COLORI: Record<string, number[]> = {
  rovere: [0.8, 0.66, 0.48], rovere_chiaro: [0.85, 0.72, 0.55], noce: [0.42, 0.28, 0.18], abete: [0.86, 0.74, 0.56],
  bianco: [0.95, 0.94, 0.91], laccato: [0.97, 0.97, 0.96], quarzo: [0.93, 0.92, 0.9], lino: [0.86, 0.83, 0.77],
  boucle: [0.92, 0.9, 0.85], velluto: [0.3, 0.42, 0.35], salvia: [0.6, 0.68, 0.58], salvia_scuro: [0.4, 0.49, 0.42],
  terracotta: [0.76, 0.44, 0.3], sabbia: [0.86, 0.78, 0.65], blu_notte: [0.16, 0.22, 0.33], azzurro: [0.62, 0.74, 0.84],
  rosa: [0.88, 0.7, 0.68], senape: [0.85, 0.65, 0.25], antracite: [0.2, 0.21, 0.23], nero: [0.08, 0.08, 0.09],
  ottone: [0.8, 0.65, 0.35], acciaio: [0.76, 0.77, 0.79], ceramica: [0.98, 0.98, 0.98], gres: [0.74, 0.72, 0.69],
  pietra: [0.86, 0.84, 0.8], verde: [0.24, 0.45, 0.22], verde_chiaro: [0.4, 0.6, 0.3], tegola: [0.62, 0.3, 0.2],
  fuoco: [1, 0.55, 0.15], luce: [1, 0.97, 0.88], rosso: [0.8, 0.2, 0.18], blu: [0.2, 0.35, 0.7], giallo: [0.95, 0.8, 0.25],
  viola: [0.5, 0.3, 0.65], arancio: [0.9, 0.5, 0.15], crema: [0.92, 0.88, 0.78], vetro: [0.75, 0.88, 0.95, 0.25],
  acqua: [0.55, 0.75, 0.85, 0.5], specchio: [0.82, 0.88, 0.92], lavica: [0.3, 0.3, 0.31], cotto: [0.72, 0.42, 0.3],
  prato: [0.42, 0.62, 0.3], terra: [0.45, 0.34, 0.24], asfalto: [0.25, 0.25, 0.26], intonaco: [0.93, 0.89, 0.8],
  marmo: [0.95, 0.94, 0.91], mattone: [0.7, 0.38, 0.26], legna: [0.55, 0.38, 0.22], lavanda: [0.58, 0.5, 0.78],
  muro: [0.94, 0.93, 0.9], cartongesso: [0.97, 0.97, 0.96], feltro: [0.13, 0.38, 0.24], bottiglia: [0.12, 0.25, 0.15],
  verde_gioco: [0.25, 0.6, 0.3], ulivo: [0.47, 0.56, 0.42], corteccia: [0.38, 0.32, 0.26], limone: [0.98, 0.85, 0.2],
};

export const coloreValido = (c: string) => c in COLORI || /^#[0-9a-f]{6}$/i.test(c);

export function rgb(c: string): number[] {
  if (c.startsWith("#")) return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  return COLORI[c] ?? COLORI.bianco;
}

export const hex = (c: string, schiarisci = 0) =>
  "#" + rgb(c).slice(0, 3).map(v => Math.round((v + (1 - v) * schiarisci) * 255).toString(16).padStart(2, "0")).join("");

// accesso: dove deve arrivare una persona (fronte, uno dei lati lunghi, un lato qualsiasi, nessuno)
export type Voce = { L: number; P: number; H: number; colore: string; desc: string; accesso: "fronte" | "lati" | "tutti" | "no"; ostacolo?: false };

export const CATALOGO: Record<string, Voce> = {
  divano: { L: 220, P: 95, H: 85, colore: "lino", desc: "divano, schienale sul retro", accesso: "fronte" },
  poltrona: { L: 85, P: 85, H: 85, colore: "boucle", desc: "poltrona", accesso: "fronte" },
  pouf: { L: 50, P: 50, H: 45, colore: "velluto", desc: "pouf", accesso: "tutti" },
  letto: { L: 160, P: 200, H: 55, colore: "lino", desc: "letto matrimoniale, testiera sul retro", accesso: "lati" },
  letto_singolo: { L: 90, P: 200, H: 55, colore: "lino", desc: "letto singolo", accesso: "lati" },
  comodino: { L: 45, P: 40, H: 50, colore: "rovere", desc: "comodino", accesso: "tutti" },
  armadio: { L: 200, P: 60, H: 240, colore: "laccato", desc: "armadio, ante sul fronte", accesso: "fronte" },
  cassettiera: { L: 100, P: 50, H: 85, colore: "rovere", desc: "cassettiera", accesso: "fronte" },
  tavolo: { L: 160, P: 90, H: 75, colore: "rovere", desc: "tavolo da pranzo", accesso: "tutti" },
  tavolino: { L: 100, P: 60, H: 40, colore: "rovere", desc: "tavolino basso", accesso: "no" },
  sedia: { L: 45, P: 50, H: 90, colore: "rovere", desc: "sedia, schienale sul retro", accesso: "tutti" },
  sgabello: { L: 40, P: 40, H: 75, colore: "rovere", desc: "sgabello", accesso: "tutti" },
  scrivania: { L: 120, P: 60, H: 75, colore: "rovere", desc: "scrivania, ci si siede sul fronte", accesso: "fronte" },
  libreria: { L: 100, P: 35, H: 200, colore: "bianco", desc: "libreria con libri", accesso: "fronte" },
  mobile_tv: { L: 180, P: 45, H: 50, colore: "noce", desc: "mobile basso tv", accesso: "fronte" },
  madia: { L: 160, P: 45, H: 85, colore: "noce", desc: "madia / credenza", accesso: "fronte" },
  cucina: { L: 300, P: 60, H: 90, colore: "laccato", desc: "cucina in linea: basi, piano, fuochi, lavello e pensili", accesso: "fronte" },
  isola: { L: 180, P: 90, H: 90, colore: "laccato", desc: "isola da cucina", accesso: "tutti" },
  frigo: { L: 60, P: 65, H: 200, colore: "acciaio", desc: "frigorifero", accesso: "fronte" },
  lavabo: { L: 60, P: 45, H: 85, colore: "ceramica", desc: "lavabo con mobile e specchio", accesso: "fronte" },
  wc: { L: 38, P: 55, H: 40, colore: "ceramica", desc: "vaso", accesso: "fronte" },
  bidet: { L: 38, P: 55, H: 40, colore: "ceramica", desc: "bidet", accesso: "fronte" },
  doccia: { L: 90, P: 90, H: 200, colore: "ceramica", desc: "doccia con vetro sul fronte e a destra", accesso: "fronte" },
  vasca: { L: 170, P: 75, H: 55, colore: "ceramica", desc: "vasca da bagno", accesso: "fronte" },
  lavatrice: { L: 60, P: 60, H: 85, colore: "bianco", desc: "lavatrice", accesso: "fronte" },
  tappeto: { L: 200, P: 140, H: 1, colore: "sabbia", desc: "tappeto (si calpesta)", accesso: "no", ostacolo: false },
  pianta: { L: 45, P: 45, H: 120, colore: "verde", desc: "pianta in vaso", accesso: "no" },
  lampada: { L: 40, P: 40, H: 160, colore: "lino", desc: "lampada da terra", accesso: "no" },
  camino: { L: 120, P: 40, H: 110, colore: "pietra", desc: "camino", accesso: "fronte" },
  scala: { L: 100, P: 300, H: 0, colore: "rovere", desc: "scala: L larghezza, P lunghezza; sale verso il retro, si parte dal fronte. altezza = quanto sale (di serie fino al piano sopra)", accesso: "fronte" },
  blocco: { L: 100, P: 100, H: 100, colore: "bianco", desc: "volume generico", accesso: "no" },
};

export type Pezzo = { m: string; x: number; y: number; z: number; sx: number; sy: number; sz: number; cil?: true };
const B = (m: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): Pezzo => ({ m, x, y, z, sx, sy, sz });
const C = (m: string, x: number, y: number, z: number, d: number, sz: number): Pezzo => ({ m, x, y, z, sx: d, sy: d, sz, cil: true });

function gambe(L: number, P: number, h: number, m: string, s = 5, dentro = 4) {
  const x = L / 2 - dentro - s / 2, y = P / 2 - dentro - s / 2;
  return [B(m, -x, -y, 0, s, s, h), B(m, x, -y, 0, s, s, h), B(m, -x, y, 0, s, s, h), B(m, x, y, 0, s, s, h)];
}

const LIBRI = ["blu_notte", "terracotta", "salvia", "senape", "crema", "rosa", "antracite"];

export function pezzi(cosa: string, L: number, P: number, H: number, c: string): Pezzo[] {
  switch (cosa) {
    case "divano": case "poltrona": {
      const br = Math.min(18, L * 0.12), sc = Math.min(22, P * 0.25);
      return [B(c, 0, sc / 2, 8, L - 2 * br, P - sc, 34), B(c, 0, -P / 2 + sc / 2, 8, L, sc, H - 8),
        B(c, -L / 2 + br / 2, 0, 8, br, P, 54), B(c, L / 2 - br / 2, 0, 8, br, P, 54), ...gambe(L, P, 8, "noce", 4, 6)];
    }
    case "pouf": return [C(c, 0, 0, 0, Math.min(L, P), H)];
    case "letto": case "letto_singolo": {
      const cuscini = L >= 140 ? [-L / 4 + 2, L / 4 - 2] : [0], w = L >= 140 ? L / 2 - 16 : L - 24;
      return [B("rovere", 0, 0, 8, L, P, 22), ...gambe(L, P, 8, "rovere", 6, 4), B("bianco", 0, 3, 30, L - 6, P - 10, 22),
        B(c, 0, P * 0.14, 30, L - 2, P * 0.72, 24), B("rovere", 0, -P / 2 + 3, 8, L, 6, 97),
        ...cuscini.map(x => B("bianco", x, -P / 2 + 28, 52, w, 34, 12))];
    }
    case "comodino": return [B(c, 0, 0, 0, L, P, H), B("ottone", 0, P / 2 + 0.5, H * 0.72, 10, 1, 1.5)];
    case "armadio": {
      const n = Math.max(1, Math.round(L / 50)), out = [B(c, 0, 0, 0, L, P, H)];
      for (let i = 1; i < n; i++) out.push(B("antracite", -L / 2 + (i * L) / n, P / 2, 2, 0.6, 0.8, H - 4));
      for (let i = 0; i < n; i++) out.push(B("ottone", -L / 2 + ((i + (i % 2 ? 0.12 : 0.88)) * L) / n, P / 2 + 0.6, H * 0.45, 1.5, 1.2, 30));
      return out;
    }
    case "cassettiera": case "madia": case "mobile_tv":
      return [B(c, 0, 0, 10, L, P, H - 10), ...gambe(L, P, 10, "nero", 3, 3)];
    case "tavolo": case "tavolino": return [B(c, 0, 0, H - 4, L, P, 4), ...gambe(L, P, H - 4, c, 6, 6)];
    case "sedia": return [B(c, 0, 0, 42, L, P, 4), B(c, 0, -P / 2 + 2, 46, L, 4, H - 46), ...gambe(L, P, 42, c, 4, 2)];
    case "sgabello": return [C(c, 0, 0, H - 4, Math.min(L, P), 4), C("acciaio", 0, 0, 0, 5, H - 4), C("acciaio", 0, 0, 0, Math.min(L, P) * 0.8, 1.5)];
    case "scrivania": return [B(c, 0, 0, H - 3, L, P, 3), B(c, -L / 2 + 1.5, 0, 0, 3, P, H - 3), B(c, L / 2 - 1.5, 0, 0, 3, P, H - 3)];
    case "libreria": {
      const n = Math.max(2, Math.round(H / 35)), out = [B(c, -L / 2 + 1.5, 0, 0, 3, P, H), B(c, L / 2 - 1.5, 0, 0, 3, P, H), B(c, 0, -P / 2 + 0.75, 0, L, 1.5, H)];
      for (let i = 0; i <= n; i++) {
        const z = (i * (H - 3)) / n;
        out.push(B(c, 0, 0, z, L - 6, P, 3));
        if (i === n) continue;
        for (let x = -L / 2 + 5, k = i * 3; x < L / 2 - 12; k++) {         // libri di larghezze e colori diversi
          const w = 3 + ((k * 7) % 5), h = Math.min(28, (H - 3) / n - 6) - ((k * 5) % 7);
          out.push(B(LIBRI[k % LIBRI.length], x + w / 2, 0, z + 3, w, P * 0.75, h));
          x += w + ((k % 4) === 3 ? 9 : 0.5);
        }
      }
      return out;
    }
    case "cucina": {
      const out = [B("antracite", 0, 3, 0, L, P - 6, 10), B(c, 0, 0, 10, L, P - 2, H - 14), B("quarzo", 0, 1, H - 4, L, P + 2, 4),
        B(c, 0, -P / 2 + 17.5, 150, L, 35, 70)];
      const n = Math.max(1, Math.round(L / 60));
      for (let i = 1; i < n; i++) out.push(B("antracite", -L / 2 + (i * L) / n, P / 2 - 1, 12, 0.6, 0.8, H - 18), B("antracite", -L / 2 + (i * L) / n, -P / 2 + 35, 151, 0.6, 0.8, 68));
      if (L >= 120) out.push(B("nero", L / 4, 2, H, Math.min(60, L / 3), 50, 0.6), B("acciaio", -L / 4, 2, H - 0.3, Math.min(50, L / 3), 40, 0.6),
        C("acciaio", -L / 4, -P / 2 + 8, H, 3, 25));
      return out;
    }
    case "isola": return [B(c, 0, 0, 10, L - 10, P - 20, H - 14), B("antracite", 0, 0, 0, L - 14, P - 24, 10), B("quarzo", 0, 0, H - 4, L, P, 4)];
    case "frigo": return [B(c, 0, 0, 0, L, P, H), B("antracite", 0, P / 2, H * 0.62, L - 2, 0.6, 0.8), B("acciaio", L / 2 - 6, P / 2 + 1, H * 0.35, 2, 2, 40)];
    case "lavabo": return [B("rovere", 0, -2, 22, L, P - 4, H - 30), B(c, 0, 0, H - 8, L, P, 8), B("acqua", 0, 3, H - 0.5, L * 0.6, P * 0.5, 0.6),
      C("acciaio", 0, -P / 2 + 6, H, 3, 16), B("specchio", 0, -P / 2 + 0.5, H + 30, L * 0.9, 1, 70)];
    case "wc": return [B(c, 0, -P / 2 + 9, 0, L, 18, 80), B(c, 0, 0, 0, L * 0.6, P * 0.6, H - 5), C(c, 0, P / 2 - L * 0.45, 0, L * 0.9, H)];
    case "bidet": return [B(c, 0, -P / 2 + 12, 0, L * 0.7, 24, H), C(c, 0, P / 2 - L * 0.45, 0, L * 0.9, H), C("acciaio", 0, -P / 2 + 6, H, 3, 10)];
    case "doccia": return [B(c, 0, 0, 0, L, P, 5), B("vetro", 0, P / 2 - 0.5, 5, L, 1, H - 5), B("vetro", L / 2 - 0.5, 0, 5, 1, P, H - 5),
      B("acciaio", 0, -P / 2 + 1, 100, 2, 2, 92), C("acciaio", 0, -P / 2 + 14, 190, 18, 1.5)];
    case "vasca": return [B(c, 0, 0, 0, L, P, H), B("acqua", 0, 0, H - 10, L - 12, P - 12, 9), C("acciaio", -L / 2 + 8, 0, H, 3, 14)];
    case "lavatrice": return [B(c, 0, 0, 0, L, P, H), B("antracite", 0, P / 2, H * 0.25, 32, 1, 32), B("acciaio", 0, P / 2 + 0.5, H * 0.28, 24, 1, 26)];
    case "tappeto": return [B(c, 0, 0, 0, L, P, Math.max(1, H))];
    case "pianta": { const d = Math.min(L, P); return [C("cotto", 0, 0, 0, d * 0.6, 35), C(c, 0, 0, 35, d, Math.max(10, H - 55)), C(c, 0, 0, H - 20, d * 0.7, 20)]; }
    case "lampada": return [C("antracite", 0, 0, 0, 28, 3), C("ottone", 0, 0, 3, 2.5, H - 40), C(c, 0, 0, H - 40, Math.min(L, P), 35)];
    case "camino": return [B(c, 0, 0, 0, L, P, H), B("nero", 0, P / 2 - 8, 15, L * 0.55, 16.5, H * 0.45), B("fuoco", 0, P / 2 - 10, 16, L * 0.3, 10, 8)];
    case "scala": {
      const n = Math.max(2, Math.round(H / 17.5)), r = H / n, t = P / n;
      return Array.from({ length: n }, (_, i) => B(c, 0, P / 2 - t * (i + 0.5), 0, L, t, r * (i + 1)));
    }
    default: return [B(c, 0, 0, 0, L, P, H)];
  }
}
