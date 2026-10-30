// Controllo veloce della lingua: node lib/lingua.check.ts (npm run verifica)
import assert from "node:assert/strict";
import { ESEMPIO } from "./esempio.ts";
import { aggiungi, dentro, imposta, impostaPunti, leggi, righeCambiate, sposta, type Apertura, type Arredo, type Stanza } from "./lingua.ts";
import { passaggi, testoPassaggi } from "./passaggi.ts";

const M = leggi(ESEMPIO);
assert.deepEqual(M.errori, [], "l'esempio non deve avere errori");
assert.equal(M.titolo, "Casa al mare");
assert.deepEqual(M.piani.map(p => [p.id, p.quota]), [["terra", 0], ["primo", 310]]);
const sogg = M.el.find((e): e is Stanza => e.tipo === "stanza" && e.nome === "Soggiorno")!;
assert.equal(sogg.area, 45.4);
const ingresso = M.el.find((e): e is Apertura => e.tipo === "apertura" && e.riga === 15)!;
const g = ingresso.aggancio!;
assert.ok(dentro({ x: g.p.x + g.n.x * g.lato * 40, y: g.p.y + g.n.y * g.lato * 40 }, sogg.punti), "l'ingresso apre verso il soggiorno");
const scala = M.el.find((e): e is Arredo => e.tipo === "arredo" && e.cosa === "scala")!;
assert.equal(scala.H, 310, "la scala sale fino al primo piano");
for (const p of M.piani) {
  const e = passaggi(M, p.id)!;
  assert.deepEqual(e.problemi.map(x => x.msg), [], testoPassaggi(M, p.id));
}

// passi relativi, errori con suggerimento
const T = leggi("piano Terra\nmuro 0,0 >400 v300\ndivanno a 1,1\nstanza Bagno 0,0 200,150 colore blu_scuro");
assert.deepEqual((T.el[0] as { punti: unknown }).punti, [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }]);
assert.match(T.errori[0].msg, /forse "divano"/);
assert.match(T.errori[1].msg, /colore "blu_scuro"/);

// un divano bloccato contro il muro viene segnalato
const B = leggi("piano Terra\nmuro 0,0 >300 v300 <300 chiudi spessore 20\nstanza Sala 10,10 290,290\nporta 80 a 150,300\ndivano 200x90 a 150,55 ruota 180");
assert.match(passaggi(B, "terra")!.problemi.map(p => p.msg).join(), /divano .*davanti/);

// modifiche che toccano solo il necessario
let t = "piano Terra\n  divano a 100,100 # vicino alla finestra\n  muro 0,0 >300 v200";
t = sposta(t, 1, 15, -5);
assert.equal(t.split("\n")[1], "  divano a 115,95 # vicino alla finestra");
t = imposta(t, 1, "ruota", "90");
assert.equal(t.split("\n")[1], "  divano a 115,95 ruota 90 # vicino alla finestra");
t = imposta(t, 1, "ruota", null);
t = imposta(t, 1, "misure", "200x90");
assert.equal(t.split("\n")[1], "  divano 200x90 a 115,95 # vicino alla finestra");
assert.equal(sposta(t, 2, 10, 10).split("\n")[2], "  muro 10,10 >300 v200", "i passi relativi non cambiano");
assert.equal(impostaPunti(t, 2, [{ x: 0, y: 0 }, { x: 310, y: 0 }]).split("\n")[2], "  muro 0,0 310,0");
const ag = aggiungi("piano Terra\n  muro 0,0 >1\n\npiano Primo\n  muro 0,0 >1\n", leggi("piano Terra\n  muro 0,0 >1\n\npiano Primo\n  muro 0,0 >1\n"), "terra", "sedia a 1,1");
assert.equal(ag.riga, 2);
assert.equal(ag.testo.split("\n")[2], "  sedia a 1,1");
assert.deepEqual(righeCambiate("a\nb\nc", "a\nB\nc\nd"), [1, 3]);
// oggetti importati, fori, muri sotto la falda, porte su muri spezzati
const I = leggi(`piano Terra
muro 0,0 >200 spessore 20 altezza 170 fino 240
muro 200,0 >200 spessore 20
porta 80 a 200,0
foro 50,50 150,150
modello "Scala" a 100,100 ruota 90 calpestabile
modello "Boh" a 1,1`,
  { Scala: { L: 100, P: 300, H: 280, pianta: [] } });
assert.equal((I.el[0] as { fino: number }).fino, 240);
assert.ok(I.el.some(e => e.tipo === "foro"));
const sc = I.el.find((e): e is Arredo => e.tipo === "arredo" && e.nome === "Scala")!;
assert.deepEqual([sc.L, sc.P, sc.ruota, sc.calpestabile], [100, 300, 90, true]);
assert.match(I.errori.map(e => e.msg).join(), /"Boh": non c'è/);
assert.ok(!I.errori.some(e => /non entra/.test(e.msg)), "una porta a cavallo di due tratti allineati entra");
console.log("lingua ok");
