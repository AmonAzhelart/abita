# Abita

Il tuo studio per progetti di case: scrivi (o fai scrivere a Claude) la casa in una lingua semplice, la vedi in pianta e in 3D, e mandi al cliente un link con l'anteprima.

- `/studio` i tuoi progetti (con password)
- `/studio/<id>` l'editor: testo, pianta, 3D, foto, appunti per Claude, versioni
- `/studio/guida` la lingua e come collegare Claude
- `/v/<link>` la pagina del cliente: vede solo l'ultima versione pubblicata e può lasciare commenti
- `/api/mcp` il server MCP per Claude Code

## In locale

```bash
npm install
npm run dev
```

Serve un file `.env.local` con `ABITA_PASSWORD` e `ABITA_TOKEN` (vedi `.env.example`). In locale i dati stanno in un file SQLite, `.dati/abita.sqlite`
(stesso SQL di Cloudflare D1). `npm run verifica` controlla la lingua, i passaggi e il database.

## Su Vercel

1. Metti la cartella su GitHub e importala da vercel.com (oppure `npx vercel` da qui).
2. In Settings → Environment Variables aggiungi `ABITA_PASSWORD` (per entrare) e `ABITA_TOKEN` (una chiave lunga e casuale, per Claude).
3. Il database è **Cloudflare D1** (`abita-database`). Da Cloudflare → My Profile → API Tokens crea un token con il permesso
   *Account → D1 → Edit*, poi su Vercel aggiungi `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`. Le tabelle si creano da sole.
   Se ci sono ancora `KV_REST_API_URL` e `KV_REST_API_TOKEN` (il vecchio Upstash), al primo avvio Abita ci copia i progetti, una volta sola.
4. Ripubblica (Deployments → Redeploy).
5. Collega Claude Code con il comando che trovi in `/studio/guida`.

## Importare un progetto (Casa Fonti)

Dal generatore Python esce un file con testo e modelli 3D:

```bash
cd ../generatore
python export_abita.py p5d.json ../casa-fonti.abita.json
```

Poi lo carichi in Abita. In locale:

```bash
node --env-file=.env.local scripts/importa.ts ../casa-fonti.abita.json
```

Online, dopo il deploy, con le variabili di Vercel:

```bash
npx vercel env pull .env.production.local
node --env-file=.env.production.local scripts/importa.ts ../casa-fonti.abita.json
```

Con `--prova` lo script controlla solo il testo e i passaggi, senza salvare.
