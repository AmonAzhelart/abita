// La guida della lingua: la legge Claude (strumento guida_lingua) e la leggi tu in /studio/guida.
import { CATALOGO, COLORI } from "./arredi.ts";
import { APERTURE } from "./lingua.ts";

export const GUIDA = `# La lingua di Abita

Un progetto è un testo. **Una riga per cosa**, misure in **centimetri**. Quello che scrivi diventa la pianta e il 3D.

## Le regole

- La pianta si guarda dall'alto: **x va verso destra (est)**, **y va verso il basso (sud)**. L'origine 0,0 è dove vuoi, di solito l'angolo in alto a sinistra.
- Un punto si scrive \`x,y\` senza spazi, con il punto per i decimali: \`520,430\` oppure \`37.5,560\`.
- I **passi** partono dal punto prima: \`>420\` = 420 a destra, \`<420\` a sinistra, \`v310\` giù, \`^310\` su. Comodi quando hai le misure prese col metro.
- Le misure di un oggetto si scrivono \`LxP\` o \`LxPxH\` (larghezza x profondità x altezza): \`220x95\`, \`160x200x55\`.
- I nomi con spazi vanno tra virgolette: \`"Camera da letto"\`.
- \`#\` e uno spazio iniziano un commento fino a fine riga.
- Le righe sotto \`piano\` appartengono a quel piano (il rientro è solo per leggere meglio).

## Progetto e piani

\`\`\`
progetto "Casa Rossi"
cliente "Famiglia Rossi"

piano Terra altezza 280            # quota 0
piano Primo altezza 270            # sta sopra il precedente (+ solaio 30)
piano Interrato quota -300 altezza 250
\`\`\`
\`altezza\` = da pavimento a soffitto (di serie 270), \`quota\` = a che altezza sta il pavimento, \`solaio\` = spessore del solaio sotto (di serie 30).

## Muri

\`\`\`
muro 0,0 >1000 v800 <1000 chiudi spessore 30    # perimetro chiuso
muro 620,0 v800 spessore 10                     # tramezzo
muro 0,500 v300 >620 spessore 20 altezza 100     # parapetto basso
\`\`\`
Il muro passa per la sua **linea di mezzo**. Una riga può avere tanti punti (una spezzata); \`chiudi\` torna al primo. Di serie: spessore 20, altezza del piano, colore muro.

## Stanze e aree esterne

\`\`\`
stanza Soggiorno 15,15 605,785 pavimento rovere     # due angoli = rettangolo
stanza Disimpegno 625,15 >170 v770 <160 ^285 <10    # più punti = poligono (si chiude da solo)
giardino -400,-300 1400,1100                       # prato
area Terrazza 10,510 605,790 pavimento cotto        # pavimento esterno
\`\`\`
La stanza è il **pavimento**: disegnala con le **misure interne**, quelle che prendi col metro tra muro e muro. L'area la calcola Abita.

## Porte e finestre

Si agganciano da sole al muro più vicino: basta dire dove sta il **centro**.

\`\`\`
porta 90 a 300,800 verso Soggiorno     # larga 90 (alta 210), si apre verso il soggiorno
porta 80x220 a 620,740 cardine dx      # cerniera dall'altro lato
porta 120 a 400,0 scorrevole
varco 120 a 620,190                    # apertura senza porta
finestra 120 a 810,0 davanzale 110     # alta 140, davanzale 90 di serie
finestra 60x60 a 1000,600 davanzale 150
portafinestra 160 a 0,250
\`\`\`
${Object.entries(APERTURE).map(([k, [l, h, d]]) => `- \`${k}\`: di serie ${l}x${h}${d ? `, davanzale ${d}` : ""}`).join("\n")}

## Arredi

\`\`\`
divano a 400,560                          # misure di catalogo
divano 240x95 a 400,560 ruota 90 colore salvia
letto 160x200 a 310,115
cucina 260 a 760,45                        # basi, piano, fuochi, lavello e pensili
scala 100x300 a 715,560                    # sale fino al piano di sopra
blocco 60x40x200 a 100,100 colore noce     # volume generico
\`\`\`
- \`a x,y\` è il **centro** dell'oggetto.
- \`ruota\` in gradi, in senso orario. Con \`ruota 0\` il **retro** (schienale, testiera, muro dei pensili) sta in alto/nord e il **fronte** guarda in basso/sud. \`ruota 90\`: il fronte guarda a sinistra (ovest). \`ruota 180\`: in alto (nord). \`ruota 270\`: a destra (est).
- Un mobile contro il muro nord: \`ruota 0\` e centro a metà profondità dal muro (y = muro + P/2). Contro il muro est: \`ruota 90\`.
- \`quota 150\` lo alza da terra (mensole, pensili). \`colore\` cambia il materiale principale.

Catalogo (L x P x H di serie):
${Object.entries(CATALOGO).map(([k, v]) => `- \`${k}\` ${v.L}x${v.P}${v.H ? "x" + v.H : ""} — ${v.desc}`).join("\n")}

## Tetto e misure

\`\`\`
tetto 0,0 1000,500 falde 2 altezza 140     # a capanna, colmo lungo il lato lungo
tetto 0,0 1000,500 falde 1 altezza 80      # una falda, alta a nord
tetto 620,500 1000,800 piano               # tetto piano
misura 0,-60 1000,-60                      # una quota disegnata in pianta
\`\`\`
Il tetto va nel piano più alto e parte da sopra i suoi muri. \`sporto\` (di serie 40) è quanto sporge, \`colmo x\` o \`colmo y\` sceglie la direzione.

## Oggetti importati, fori e muri sotto la falda

\`\`\`
modello "Scala a U verso la zona notte" a 575,1476            # oggetto 3D importato: si sposta e si ruota come un arredo
modello "Tetto a capanna" a 400,900 quota 1 copertura          # copertura: si nasconde quando guardi dentro la casa
modello "Gradini e pavimento corridoio" a 586,700 calpestabile # ci si cammina sopra, non è un ostacolo
foro 520,1290 >195 v400 <195                                   # buco nel solaio, per la scala che sale da sotto
muro 0,0 >830 spessore 30 altezza 170 fino 240                 # muro che sale sotto la falda: 170 all'inizio, 240 alla fine
\`\`\`
I modelli arrivano con l'importazione (scale su misura, tetti, verande, mobili particolari): la loro forma non si cambia scrivendo, ma si possono spostare, ruotare, alzare con \`quota\` o togliere. Per un mobile nuovo usa il catalogo.

## Colori e materiali

${Object.keys(COLORI).map(c => `\`${c}\``).join(" ")}, oppure un colore esadecimale come \`#a0b0c0\`.

## Passaggi

Abita controlla che si possa passare ovunque: **70 cm liberi** dagli ingressi (o dall'arrivo della scala) fino a ogni stanza e davanti a ogni mobile. Porte sotto i 70 cm, mobili chiusi contro il muro, sedie senza spazio dietro vengono segnalati.

## Consigli per lavorare bene

1. Prima il perimetro e i tramezzi, poi le stanze con le misure interne, poi porte e finestre, infine gli arredi.
2. Dopo ogni modifica guarda la pianta e controlla i passaggi: se una cosa non entra con i suoi spazi, dillo invece di forzarla.
3. Gli appunti hanno coordinate nello stesso sistema della pianta: partono da lì per capire cosa cambiare.
`;
