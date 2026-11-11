// Il database dei progetti (SQLite locale, lo stesso SQL di D1), in una cartella temporanea: non tocca i dati veri.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const qui = process.cwd(), tmp = mkdtempSync(path.join(tmpdir(), "abita-"));
process.chdir(tmp);
// un vecchio archivio (i file JSON di prima) con un progetto, la sua storia e un modello: al primo avvio si copia
const vecchio = (k: string, v: unknown) => writeFileSync(path.join(tmp, ".dati", encodeURIComponent(k) + ".json"), JSON.stringify(v));
mkdirSync(path.join(tmp, ".dati"));
vecchio("abita:indice", [{ id: "Vecchio1", nome: "Casa vecchia" }]);
vecchio("abita:p:Vecchio1", { id: "Vecchio1", nome: "Casa vecchia", cliente: "", testo: "piano Terra", rev: 7, aggiornato: 1, share: "linkvecchio1", pubblicato: null, appunti: [], foto: [], attivita: [], modelli: { Cubo: { L: 1, P: 1, H: 1, pianta: [], chiave: "k1" } } });
vecchio("abita:storia:Vecchio1", [{ rev: 7, testo: "piano Terra", chi: "io", quando: 1 }, { rev: 5, testo: "piano", chi: "claude", quando: 0 }]);
vecchio("abita:m:Vecchio1:k1", { gres: "QUJD" });
const P = await import("./progetti.ts");
const v1 = (await P.carica("Vecchio1"))!;
assert.equal(v1.rev, 7);
assert.equal((await P.storia("Vecchio1")).length, 2);
assert.deepEqual(await P.meshModelli(v1), { Cubo: { gres: "QUJD" } });
assert.equal((await P.daLink("linkvecchio1"))?.id, "Vecchio1");
// un progetto di prova: salvataggi, fusione della storia, conflitto, appunti, link
const q = await P.crea("Prova D1", "Test");
const s1 = await P.salvaTesto(q.id, q.testo + "\n# uno", "io", "", q.rev);
const s2 = await P.salvaTesto(q.id, q.testo + "\n# due", "io", "", s1.salvato.rev);
assert.equal(s2.salvato.rev, q.rev + 2);
assert.equal((await P.storia(q.id)).length, 1, "due salvataggi ravvicinati della stessa persona: una versione");
const c = await P.salvaTesto(q.id, q.testo + "\n# claude", "claude", "prova");
assert.equal((await P.storia(q.id)).length, 2, "Claude apre una versione sua");
assert.equal(c.p!.attivita[0].chi, "claude");
await assert.rejects(P.salvaTesto(q.id, "x", "io", "", s2.salvato.rev), (e: { stato?: number }) => e.stato === 409);
assert.equal((await P.carica(q.id))!.testo, q.testo + "\n# claude", "il conflitto non ha scritto niente");
await P.nuovoAppunto(q.id, { piano: "terra", a: { x: 1, y: 2 }, testo: "ciao" }, "io");
assert.equal((await P.elenco()).find(v => v.id === q.id)!.daFare, 1);
await P.pubblica(q.id, "io");
const st = await P.statoLink(q.share);
await P.commentoCliente(q.share, { piano: "terra", a: { x: 5, y: 5 }, testo: "bello", nome: "Anna" });
assert.notEqual(await P.statoLink(q.share), st, "un commento cambia lo stato del link");
await P.salvaModello(q.id, "Cubo", { L: 10, P: 10, H: 10, pianta: [] }, { gres: "A".repeat(2_000_000) });
const mm = await P.meshModelli((await P.carica(q.id))!);
assert.equal(mm.Cubo.gres.length, 2_000_000, "un modello da 2 MB torna intero dai pezzi");
for (let i = 0; i < 45; i++) await P.salvaTesto(q.id, q.testo + "\n#" + i, i % 2 ? "io" : "claude");
assert.equal((await P.storia(q.id)).length, 40, "la storia tiene 40 versioni");
const r = await P.storia(q.id);
await P.ripristina(q.id, r[r.length - 1].rev);
await P.elimina(q.id);
assert.equal(await P.carica(q.id), null);
process.chdir(qui);
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* il file del database può restare aperto fino all'uscita */ }
console.log("progetti ok");
