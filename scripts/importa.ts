// Importa un progetto esportato (testo + modelli 3D) dentro Abita.
//   in locale:      node --env-file=.env.local scripts/importa.ts ../casa-fonti.abita.json
//   su Vercel:      vercel env pull .env.production.local && node --env-file=.env.production.local scripts/importa.ts ../casa-fonti.abita.json
// Con --prova controlla soltanto il testo, senza salvare niente.
import { readFileSync } from "node:fs";
import { leggi, type ModelloInfo } from "../lib/lingua.ts";
import { testoPassaggi } from "../lib/passaggi.ts";
import { crea, salvaModello } from "../lib/progetti.ts";

const file = process.argv.find(a => a.endsWith(".json"));
if (!file) throw new Error("Indica il file .json da importare");
const d: { nome: string; cliente: string; testo: string; modelli: Record<string, ModelloInfo & { mesh: Record<string, string> }> } = JSON.parse(readFileSync(file, "utf8"));
const M = leggi(d.testo, d.modelli);
console.log(`${d.nome}: ${M.righe.length} righe, ${M.el.length} elementi, ${Object.keys(d.modelli).length} modelli`);
for (const e of M.errori) console.log(`  riga ${e.riga + 1}: ${e.msg}`);
for (const p of M.piani) console.log("  " + testoPassaggi(M, p.id).replace(/\n/g, "\n  "));
if (process.argv.includes("--prova")) process.exit(0);

const p = await crea(d.nome, d.cliente, d.testo);
for (const [nome, { mesh, ...info }] of Object.entries(d.modelli)) await salvaModello(p.id, nome, info, mesh);
console.log(`Importato: /studio/${p.id}`);
