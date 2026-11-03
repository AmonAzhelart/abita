// Controllo veloce della lingua: node lib/lingua.check.ts (npm run verifica)
import assert from "node:assert/strict";
import { ESEMPIO } from "./esempio.ts";
import { aggiungi, area2, dentro, imposta, impostaPunti, leggi, segna, righeCambiate, sposta, type Apertura, type Arredo, type Stanza } from "./lingua.ts";
import { passaggi, testoPassaggi } from "./passaggi.ts";
import { muroInCorso } from "./scena.ts";
import { ancora } from "./ancora.ts";
import { riepilogo, uso } from "./verifiche.ts";
import { altezzaLibera, daQuota, piuBasso, profiloAltezza } from "./altezza.ts";
import { sezione } from "./sezione.ts";
import { descriviScala } from "./scala.ts";

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

// una porta che aprendosi sbatte contro un mobile; un piano a cui non porta nessuna scala
const U = leggi(`piano Terra
muro 0,0 >400 v300 <400 chiudi spessore 20
stanza Sala 10,10 390,290
porta 80 a 200,300 verso Sala
armadio 100x60 a 200,250 ruota 180
piano Primo
muro 0,0 >400 v300 <400 chiudi spessore 20
stanza Camera 10,10 390,290`);
assert.match(passaggi(U, "terra")!.problemi.map(p => p.msg).join(), /aprendosi urta armadio/);
assert.match(passaggi(U, "primo")!.problemi.map(p => p.msg).join(), /Primo: non ci si arriva/);
// con la scala si sale: il piano di sopra è raggiunto e in cima si esce sul pavimento
const S2 = leggi(`piano Terra altezza 270
muro 0,0 >600 v500 <600 chiudi spessore 20
stanza Sala 10,10 590,490
porta 90 a 300,500
scala U a 150,250
piano Primo
muro 0,0 >600 v500 <600 chiudi spessore 20
stanza Camera 10,10 590,490`);
assert.deepEqual(passaggi(S2, "primo")!.problemi.map(p => p.msg), [], testoPassaggi(S2, "primo"));

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
assert.equal(segna("muro 0,0 >10 # x", 0, "chiudi", true), "muro 0,0 >10 chiudi # x");
assert.equal(segna("muro 0,0 >10 chiuso spessore 9", 0, "chiudi", false), "muro 0,0 >10 spessore 9");
// il muro in corso nel 3D: lungo 400 + mezzo spessore per parte, alto da 100 a 300 cm
const fant = muroInCorso([{ x: 0, y: 0 }, { x: 400, y: 0 }], 0, 20, 100, 300);
fant.computeBoundingBox();
assert.deepEqual([fant.boundingBox!.min.x, fant.boundingBox!.max.x, fant.boundingBox!.min.y, fant.boundingBox!.max.y].map(v => +v.toFixed(2)), [-0.1, 4.1, 0, 3]);
// ancoraggio: il divano va col retro al muro ovest e scivola nell'angolo nord; il tavolo si appoggia senza girarsi
const div = M.el.find((e): e is Arredo => e.tipo === "arredo" && e.cosa === "divano")!;
assert.deepEqual(ancora(M, div, { x: 70, y: 140 }), { c: { x: 62.5, y: 135 }, ruota: 270, facce: ancora(M, div, { x: 70, y: 140 }).facce });
assert.equal(ancora(M, div, { x: 70, y: 140 }).facce.length, 2);
const tav = M.el.find((e): e is Arredo => e.tipo === "arredo" && e.cosa === "tavolo")!;
assert.deepEqual([ancora(M, tav, { x: 300, y: 70 }).c, ancora(M, tav, { x: 300, y: 70 }).ruota], [{ x: 300, y: 60 }, 0]);
assert.deepEqual(ancora(M, tav, { x: 300, y: 300 }).facce, [], "lontano dai muri resta dov'è");
// scale: alzate e pedate vere (Blondel), forme, svolte e specchio
const scl = (r: string) => leggi(`piano Terra
${r}
piano Primo`).el.find((e): e is Arredo => e.tipo === "arredo")!;
const dritta = scl("scala a 0,0").scala!;
assert.deepEqual([dritta.alzate, dritta.alzata, dritta.pedata, dritta.L, dritta.P], [17, 17.6, 27.7, 100, 443.2], "300 cm: 17 alzate, pedata da 63 - 2a");
const u = scl("scala U a 0,0");
assert.deepEqual([u.L, u.P, u.scala!.rampe, u.scala!.avvisi], [210, 321.6, [9, 8], []], "a U: due rampe col pianerottolo, comoda");
assert.equal(Math.abs(area2(u.scala!.sagoma)), 62550, "la sagoma a U: le due rampe e il pianerottolo");
const lv = scl("scala forma L ventaglio giro sx a 0,0").scala!, spicchi = lv.gradini.filter(g => g.tipo === "ventaglio");
assert.equal(spicchi.length, 3);
assert.ok(Math.abs(spicchi.reduce((t, g) => t + Math.abs(area2(g.poli)), 0) - 100 * 100) < 20, "i ventagli riempiono il quadrato della svolta");
assert.ok(lv.gradini[0].poli.every(q => q.x > 0), "gira a sinistra: si parte dal lato destro");
// rampe larghe diverse e soletta: la seconda rampa a 90, il pianerottolo profondo 90, sotto i gradini il vuoto
const u2 = scl("scala U larga 80 seconda 90 pozzo 15 soletta a 0,0"), s2 = u2.scala!;
assert.deepEqual([u2.L, s2.larga, s2.seconda, s2.soletta, s2.avvisi], [185, 80, 90, true, []]);
assert.match(descriviScala(s2), /larga 80 e 90 cm, a soletta/);
const pn = s2.gradini.find(g => g.tipo === "pianerottolo")!;
assert.deepEqual([s2.gradini[0].sotto, pn.sotto, Math.round(Math.abs(pn.poli[0].y - pn.poli[2].y))], [0, Math.round((pn.z - 20) * 10) / 10, 90]);
assert.equal(s2.gradini[5].sotto, Math.round((s2.gradini[5].z - s2.alzata - 20) * 10) / 10, "sotto un gradino la soletta segue i gradini");
assert.equal(u.scala!.gradini[3].sotto, undefined, "di serie piena fino a terra");
const ch = scl("scala chiocciola 160 a 0,0");
assert.deepEqual([ch.scala!.forma, ch.L, ch.P, ch.scala!.alzata, ch.scala!.avvisi], ["chiocciola", 160, 160, 20, []]);
assert.match(scl("scala 100x300 a 0,0").scala!.avvisi.join(), /pedata 18,8 cm: corta/, "100x300 per 3 metri è troppo ripida");
assert.equal(imposta("scala 100x300 a 715,560", 0, "misure", null), "scala a 715,560");
// superfici e verifiche (DM 5/7/1975): l'esempio è in regola; una camera piccola e senza finestre no
const rv = riepilogo(M);
assert.deepEqual(rv.piani.flatMap(p => p.stanze.flatMap(v => v.avvisi.map(a => `${v.s.nome}: ${a}`))), []);
assert.equal(rv.utile, Math.round(M.el.reduce((t, e) => t + (e.tipo === "stanza" ? e.area : 0), 0) * 10) / 10);
assert.deepEqual([uso("Camera matrimoniale"), uso("Cameretta"), uso("Bagno di servizio"), uso("Disimpegno")], ["doppia", "camera", "bagno", "servizio"]);
const cp = riepilogo(leggi(`piano Terra altezza 260
muro 0,0 >300 v260 <300 chiudi spessore 20
stanza Camera 10,10 290,250`)).piani[0].stanze[0].avvisi.join(" | ");
assert.match(cp, /6,7 m²: per una camera singola ne servono almeno 9/);
assert.match(cp, /nessuna finestra/);
assert.match(cp, /alta 260 cm/);
// altezza libera: in soggiorno fino al solaio del primo piano; sulla scala fino al tetto piano sopra il buco
assert.deepEqual([altezzaLibera(M, "terra", { x: 300, y: 450 }).libera, altezzaLibera(M, "terra", { x: 300, y: 450 }).sopra], [280, "solaio del piano Primo"]);
const su = altezzaLibera(M, "terra", { x: 755, y: 500 });
assert.match(su.sotto, /gradino della scala a U/);
assert.equal(su.sopra, "tetto");
assert.equal(su.cima, 580 - 0);
assert.equal(altezzaLibera(M, "primo", { x: 755, y: 600 }).buco, true, "al primo piano lì c'è il buco della scala");
// sezione lungo x=690: cucina alta 280, il solaio del primo si ferma dove comincia il buco della scala, i gradini ci sono
const sz = sezione(M, { x: 690, y: -20 }, { x: 690, y: 820 });
assert.equal(sz.quote.find(q => !q.scala && Math.round(q.s) === 215)?.libera, 280);
assert.deepEqual(sz.pezzi.filter(p => p.cosa === "solaio" && p.p[0][1] === 280).map(p => [p.p[0][0], Math.round(p.p[1][0])]), [[35, 496]]);
assert.ok(sz.pezzi.filter(p => p.cosa === "scala").length >= 5 && sz.pezzi.some(p => p.cosa === "tetto"));
// profilo lungo una linea: in soggiorno sempre 2,80 m, un campione ogni 5 cm
const pf = profiloAltezza(M, "terra", { x: 300, y: 300 }, { x: 300, y: 450 });
assert.equal(pf.punti.length, 31);
assert.ok(pf.punti.every(c => c.libera === 280 && c.piedi));
// da una quota fissa 30 cm sopra il pavimento: 2,50 m di spazio, pavimento 30 cm sotto
assert.deepEqual(daQuota(piuBasso(pf.punti, 30)!, 30), { v: 250, f: -30 });
// stampa: il foglio prende la casa (muri esterni da 30 cm), non un muro di cinta lontano che sfiora una stanza
const { contenuto } = await import("./pianta.ts");
assert.deepEqual(contenuto(M, "terra", false), { x: -15, y: -15, w: 1030, h: 830 });
const Mc = leggi(ESEMPIO.replace("piano Terra altezza 280", `piano Terra altezza 280
  muro 0,-3000 0,3000 spessore 30`));
assert.ok(contenuto(Mc, "terra", false)!.h < 840, "il muro di cinta lungo 60 m non allarga il foglio");
console.log("lingua ok");
