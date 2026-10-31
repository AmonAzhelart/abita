// Il progetto con cui parte ogni casa nuova: mostra tutta la lingua in poche righe.
export const ESEMPIO = `progetto "Casa al mare"
cliente "Famiglia Esposito"

piano Terra altezza 280
  giardino -400,-300 1400,1100
  muro 0,0 >1000 v800 <1000 chiudi spessore 30     # perimetro
  muro 620,0 v800 spessore 10
  muro 620,380 >380 spessore 10
  muro 800,380 v420 spessore 10

  stanza Soggiorno 15,15 605,785 pavimento rovere
  stanza Cucina 625,15 985,375 pavimento gres
  stanza Scala 625,385 795,785 pavimento gres
  stanza Bagno 805,385 985,785 pavimento ceramica

  porta 100 a 300,800 verso Soggiorno               # ingresso
  varco 120 a 620,190
  porta 80 a 620,435 verso Scala
  porta 80 a 800,435 verso Bagno
  finestra 160 a 300,0
  finestra 120 a 810,0 davanzale 110
  finestra 120 a 1000,190
  finestra 60x60 a 1000,600 davanzale 150
  finestra 140 a 500,800
  portafinestra 160 a 0,250

  tavolo 180x90 a 300,230
  sedia a 255,160
  sedia a 345,160
  sedia a 255,300 ruota 180
  sedia a 345,300 ruota 180
  divano 240x95 a 400,560 ruota 90 colore salvia
  mobile_tv 180x45 a 37.5,560 ruota 270
  tappeto 240x170 a 230,560 ruota 90
  tavolino 100x60 a 230,560 ruota 90
  pianta a 560,60
  cucina 260 a 760,45
  frigo a 945,47.5
  isola 160x90 a 810,240
  scala U giro sx larga 80 a 710,630.5 ruota 180     # 18 alzate, pianerottolo in fondo
  doccia a 850,740 ruota 180
  lavabo a 962.5,560 ruota 90
  wc a 957.5,650 ruota 90

piano Primo altezza 270
  muro 620,500 <620 ^500 >1000 v800 <380 ^300 spessore 30
  muro 0,500 v300 >620 spessore 20 altezza 100      # parapetto della terrazza
  muro 620,0 v500 spessore 10
  muro 800,0 v800 spessore 10
  muro 800,300 >200 spessore 10

  stanza Camera 15,15 605,485 pavimento rovere
  stanza Disimpegno 625,15 >170 v770 <160 ^285 <10 pavimento rovere
  stanza Bagno 805,15 985,295 pavimento ceramica
  stanza Studio 805,305 985,785 pavimento rovere
  area Terrazza 10,510 605,790 pavimento cotto

  porta 80 a 620,250 verso Camera
  porta 80 a 800,150 verso Bagno
  porta 80 a 800,360 verso Studio
  portafinestra 160 a 300,500 verso Camera
  finestra 160 a 300,0
  finestra 60x60 a 1000,150 davanzale 150
  finestra 140 a 1000,550

  letto a 310,115
  comodino a 182.5,35
  comodino a 437.5,35
  armadio 240x60 a 45,300 ruota 270
  pianta a 560,440
  doccia a 940,60
  lavabo a 850,37.5
  wc a 957.5,200 ruota 90
  scrivania 140x50 a 960,545 ruota 90
  sedia a 905,545 ruota 270
  libreria a 895,767.5 ruota 180
  tavolo 120x80 a 300,650 colore bianco
  sedia a 215,650 ruota 270 colore bianco
  sedia a 385,650 ruota 90 colore bianco
  pianta a 560,750

  tetto 0,0 1000,500 falde 2 altezza 140
  tetto 620,500 1000,800 piano
`;
