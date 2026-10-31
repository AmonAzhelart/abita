"use client";
// La casa in 3D: un dito ruota, due dita zoom e spostano. Le etichette delle stanze seguono la scena.
import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ancora, type Ancora } from "@/lib/ancora";
import type { Arredo, Modello, Pt } from "@/lib/lingua";
import { contorno } from "@/lib/pianta";
import { costruisci, lastra, muroInCorso, type Mesh, type Scena } from "@/lib/scena";

/** Scarica le mesh dei modelli importati (una volta per insieme di nomi) e le decodifica. */
export function useMesh(url: string, nomi: string) {
  const [m, setM] = useState<Record<string, Mesh>>({});
  useEffect(() => {
    if (!nomi) return;
    let vivo = true;
    fetch(url).then(r => (r.ok ? r.json() : {})).then((j: Record<string, Record<string, string>>) => {
      const f32 = (b64: string) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); };
      if (vivo) setM(Object.fromEntries(Object.entries(j).map(([n, mats]) => [n, Object.fromEntries(Object.entries(mats).map(([k, v]) => [k, f32(v)]))])));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [url, nomi]);
  return m;
}

const lontano = (cam: THREE.PerspectiveCamera) => Math.max(1, 1 / (cam.aspect || 1)) ** 0.85;   // schermi stretti: più indietro

export type Volo = { tipo: "panoramica" | "alto" | "entra" | "stanza"; riga?: number; n: number };
/** Il muro che si sta tirando in pianta: la pianta lo passa qui a ogni movimento, senza far ridisegnare l'editor. */
export type Traccia = { pts: Pt[]; spessore: number; a: number; b: number; quota: number };
type Props = { modello: Modello; piano: string; tetto: boolean; nomi: boolean; volo: Volo; mesh?: Record<string, Mesh>; onStanza?: (riga: number) => void; traccia?: RefObject<((t: Traccia | null) => void) | null>; sel?: number | null;
  /** Con onSel un clic sceglie un elemento; con onPosa gli arredi si trascinano (dx, dy in cm, ruota se l'ancoraggio lo ha girato). */
  onSel?: (riga: number | null) => void; onPosa?: (riga: number, dx: number, dy: number, ruota?: number) => void;
};
type Trascina = { perno: THREE.Group; copie: { pos: THREE.BufferAttribute; da: number; prima: Float32Array }[]; esito?: Ancora };

export default function Vista3D({ modello, piano, tetto, nomi, volo, mesh, onStanza, traccia, sel, onSel, onPosa }: Props) {
  const box = useRef<HTMLDivElement>(null), tags = useRef<HTMLDivElement>(null);
  const S = useRef<{
    r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; ctl: OrbitControls; sc?: Scena; ground: THREE.Mesh; needs: boolean;
    anim?: { t0: number; p0: THREE.Vector3; t0v: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3 };
    trascina?: Trascina; contorno?: THREE.Group; facce?: THREE.Mesh; libera?: (rimetti: boolean) => void;
  } | null>(null);
  const prop = useRef({ piano, tetto, nomi, onStanza, modello, onSel, onPosa });
  prop.current = { piano, tetto, nomi, onStanza, modello, onSel, onPosa };

  useEffect(() => {
    const el = box.current!;
    let r: THREE.WebGLRenderer;
    try { r = new THREE.WebGLRenderer({ antialias: true }); } catch { el.textContent = "Questo dispositivo non riesce a mostrare il 3D."; return; }
    r.setPixelRatio(Math.min(1.5, devicePixelRatio));
    el.prepend(r.domElement);
    r.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block";
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, 0.05, 800), ctl = new OrbitControls(cam, r.domElement);
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.16;                 // segue il mouse da vicino: con il valore di serie la camera "rincorre" e sembra lenta
    ctl.zoomToCursor = true;                  // lo zoom va dove punti, non al centro
    ctl.zoomSpeed = 1.4;
    ctl.maxPolarAngle = Math.PI * 0.495;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6f6a60, 1.25));
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.15);
    sun.position.set(-30, 50, 25);
    const fill = new THREE.DirectionalLight(0xdde6ff, 0.35);
    fill.position.set(30, 20, -30);
    scene.add(sun, fill);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc9ccc0 }));
    scene.add(ground);
    S.current = { r, scene, cam, ctl, ground, needs: true };
    const tema = () => {
      const cs = getComputedStyle(el);
      scene.background = new THREE.Color(cs.getPropertyValue("--sky").trim() || "#DCE4E8");
      (ground.material as THREE.MeshLambertMaterial).color.set(cs.getPropertyValue("--ground").trim() || "#C9CCC0");
      S.current!.needs = true;
    };
    tema();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", tema);
    const dim = { w: 1, h: 1 };                // letta qui e non a ogni fotogramma
    const misura = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      dim.w = w;
      dim.h = h;
      r.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      S.current!.needs = true;
    };
    misura();
    const ro = new ResizeObserver(misura);
    ro.observe(el);
    let raf = 0;
    const v = new THREE.Vector3();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = S.current!;
      if (s.anim) {
        const k = Math.min(1, (now - s.anim.t0) / 750), e = 1 - Math.pow(1 - k, 3);
        cam.position.lerpVectors(s.anim.p0, s.anim.p1, e);
        ctl.target.lerpVectors(s.anim.t0v, s.anim.t1, e);
        if (k >= 1) s.anim = undefined;
        s.needs = true;
      }
      if (ctl.update() || s.needs) {
        s.needs = false;
        r.render(scene, cam);
        const { w, h } = dim, kids = tags.current?.children;
        s.sc?.stanze.forEach((st, i) => {
          const t = kids?.[i] as HTMLElement | undefined;
          if (!t) return;
          const vis = prop.current.nomi && s.sc!.piani.get(st.piano)?.visible && (prop.current.piano === "tutti" ? !prop.current.tetto : st.piano === prop.current.piano);
          v.copy(st.pos).project(cam);
          if (!vis || v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { t.style.visibility = "hidden"; return; }
          t.style.visibility = "visible";
          t.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
        });
      }
    };
    raf = requestAnimationFrame(loop);

    // la rotella sopra i nomi delle stanze fa comunque zoom
    const passa = (e: WheelEvent) => { e.preventDefault(); r.domElement.dispatchEvent(new WheelEvent("wheel", e)); };
    tags.current?.addEventListener("wheel", passa, { passive: false });

    // scegliere e spostare in 3D: un clic sceglie l'elemento, un arredo si trascina sul suo pavimento e si aggancia ai muri
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), suolo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3();
    const accento = new THREE.Color(getComputedStyle(el).getPropertyValue("--accent").trim() || "#2557A7");
    const velo = new THREE.MeshBasicMaterial({ color: accento, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const mira = (e: { clientX: number; clientY: number }) => {
      const b = r.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
    };
    const colpo = () => {                      // la riga dell'elemento sotto il puntatore (i muri davanti coprono quello che c'è dietro)
      const sc = S.current?.sc;
      if (!sc) return null;
      const h = ray.intersectObjects([...sc.piani.values(), sc.tetti].filter(g => g.visible), true)[0];
      if (!h) return null;
      const ud = h.object.userData as { riga?: number; righe?: { da: number; a: number; riga: number }[] }, v = (h.faceIndex ?? 0) * 3;
      return ud.riga ?? ud.righe?.find(x => x.da <= v && v < x.a)?.riga ?? null;
    };
    const mostraFacce = (f: [Pt, Pt][], y: number) => {   // il muro a cui si sta appoggiando, acceso per 40 cm
      const s = S.current!;
      if (s.facce) { s.facce.removeFromParent(); s.facce.geometry.dispose(); s.facce = undefined; }
      if (!f.length) return;
      const v = f.flatMap(([a, b]) => [[a.x, 0, a.y], [b.x, 0, b.y], [b.x, 40, b.y], [a.x, 0, a.y], [b.x, 40, b.y], [a.x, 40, a.y]]).flatMap(([x, h, z]) => [x / 100, y + h / 100, z / 100]);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      s.facce = new THREE.Mesh(g, velo);
      s.facce.renderOrder = 11;
      s.scene.add(s.facce);
    };
    const libera = (rimetti: boolean) => {     // fine del trascinamento: il pezzo torna nella sua mesh (se serve) e l'anteprima sparisce
      const s = S.current, t = s?.trascina;
      if (!s || !t) return;
      if (rimetti) for (const c of t.copie) { (c.pos.array as Float32Array).set(c.prima, c.da * 3); c.pos.needsUpdate = true; }
      t.perno.removeFromParent();
      t.perno.traverse(o => (o as THREE.Mesh).geometry?.dispose());
      mostraFacce([], 0);
      if (s.contorno) s.contorno.visible = true;
      s.trascina = undefined;
      s.needs = true;
    };
    S.current.libera = libera;
    const prendi = (a: Arredo) => {            // stacca i triangoli del pezzo dalla mesh unita e li mette in un gruppo che si muove
      const s = S.current!, perno = new THREE.Group();
      perno.position.set(a.a.x / 100, 0, a.a.y / 100);
      const copie = (s.sc?.parti.get(a.riga) ?? []).map(({ mesh: m, da, a: fine }) => {
        const pos = m.geometry.getAttribute("position") as THREE.BufferAttribute, nor = m.geometry.getAttribute("normal") as THREE.BufferAttribute;
        const prima = (pos.array as Float32Array).slice(da * 3, fine * 3), g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(prima.slice(), 3));
        g.setAttribute("normal", new THREE.BufferAttribute((nor.array as Float32Array).slice(da * 3, fine * 3), 3));
        const copia = new THREE.Mesh(g, m.material);
        copia.position.set(-a.a.x / 100, 0, -a.a.y / 100);
        perno.add(copia);
        (pos.array as Float32Array).fill(0, da * 3, fine * 3);
        pos.needsUpdate = true;
        return { pos, da, prima };
      });
      s.scene.add(perno);
      if (s.contorno) s.contorno.visible = false;
      s.trascina = { perno, copie };
    };
    let presa: { id: number; x: number; y: number; riga: number | null; a?: Arredo; p0?: THREE.Vector3; mosso: boolean } | null = null, ultimaMira = 0;
    const giu = (e: PointerEvent) => {
      if (!prop.current.onSel || e.button !== 0 || e.target !== r.domElement || presa) return;
      mira(e);
      const riga = colpo(), M = prop.current.modello, a = M.el.find(x => x.riga === riga);
      presa = { id: e.pointerId, x: e.clientX, y: e.clientY, riga, mosso: false };
      if (a?.tipo !== "arredo" || !prop.current.onPosa) return;
      suolo.constant = -((M.piani.find(q => q.id === a.piano)?.quota ?? 0) + a.quota) / 100;
      if (!ray.ray.intersectPlane(suolo, pt)) return;
      ctl.enabled = false;                       // hai preso un pezzo: la camera sta ferma
      presa.a = a;
      presa.p0 = pt.clone();
      try { r.domElement.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
      r.domElement.style.cursor = "grabbing";
    };
    const muovi = (e: PointerEvent) => {
      const s = S.current!;
      if (!presa) {                              // sopra un arredo compare la manina
        if (!prop.current.onPosa || e.buttons || e.timeStamp - ultimaMira < 80) return;
        ultimaMira = e.timeStamp;
        mira(e);
        const riga = colpo();
        r.domElement.style.cursor = prop.current.modello.el.find(x => x.riga === riga)?.tipo === "arredo" ? "grab" : "";
        return;
      }
      if (e.pointerId !== presa.id) return;
      if (Math.hypot(e.clientX - presa.x, e.clientY - presa.y) > 4) presa.mosso = true;
      const a = presa.a;
      if (!a || !presa.mosso) return;
      mira(e);
      if (!ray.ray.intersectPlane(suolo, pt)) return;
      if (!s.trascina) prendi(a);
      const passo = e.altKey ? 1 : 5;            // come in pianta: 5 cm, Alt per il centimetro e niente agganci
      const libero = { x: a.a.x + Math.round(((pt.x - presa.p0!.x) * 100) / passo) * passo, y: a.a.y + Math.round(((pt.z - presa.p0!.z) * 100) / passo) * passo };
      const an: Ancora = e.altKey ? { c: libero, ruota: a.ruota, facce: [] } : ancora(prop.current.modello, a, libero, 35);
      s.trascina!.perno.position.set(an.c.x / 100, 0, an.c.y / 100);
      s.trascina!.perno.rotation.y = (-(an.ruota - a.ruota) * Math.PI) / 180;
      s.trascina!.esito = an;
      mostraFacce(an.facce, -suolo.constant);
      s.needs = true;
    };
    const su = (e: PointerEvent) => {
      if (!presa || e.pointerId !== presa.id) return;
      const q = presa, t = S.current?.trascina;
      presa = null;
      ctl.enabled = true;
      r.domElement.style.cursor = q.a ? "grab" : "";
      if (!q.mosso) { prop.current.onSel?.(q.riga); return; }
      if (!q.a || !t?.esito) { libera(true); return; }
      const { c, ruota } = t.esito, dx = Math.round((c.x - q.a.a.x) * 10) / 10, dy = Math.round((c.y - q.a.a.y) * 10) / 10;
      if (!dx && !dy && ruota === q.a.ruota) { libera(true); return; }
      prop.current.onSel?.(q.a.riga);
      prop.current.onPosa?.(q.a.riga, dx, dy, ruota !== q.a.ruota ? ruota : undefined);
      setTimeout(() => { if (S.current?.trascina === t) libera(true); }, 500);   // se il testo non è cambiato, il pezzo torna al suo posto
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && presa?.a) { libera(true); presa = null; ctl.enabled = true; } };
    el.addEventListener("pointerdown", giu, { capture: true });  // prima dei controlli della camera
    r.domElement.addEventListener("pointermove", muovi);
    r.domElement.addEventListener("pointerup", su);
    r.domElement.addEventListener("pointercancel", su);
    window.addEventListener("keydown", esc);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); mq.removeEventListener("change", tema);
      el.removeEventListener("pointerdown", giu, { capture: true }); window.removeEventListener("keydown", esc);
      ctl.dispose(); S.current?.sc?.dispose(); velo.dispose();
      r.dispose(); r.forceContextLoss(); r.domElement.remove(); S.current = null;
    };
  }, []);

  // ricostruisci la scena quando cambia il modello, senza spostare la camera
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    const prima = !s.sc;
    s.libera?.(false);                          // un pezzo appena trascinato: ora è nel testo, l'anteprima non serve più
    if (s.sc) { s.scene.remove(...s.sc.piani.values(), s.sc.tetti); s.sc.dispose(); }
    s.sc = costruisci(modello, mesh);
    s.scene.add(...s.sc.piani.values(), s.sc.tetti);
    s.ground.position.y = (Math.min(0, ...modello.piani.map(p => p.quota)) - 3) / 100;
    if (prima) {
      const c = s.sc.centro, R = s.sc.raggio * lontano(s.cam);
      s.cam.position.set(c.x + R * 0.9, c.y + R * 0.85, c.z + R * 1.15);
      s.ctl.target.copy(c);
    }
    const t = tags.current;
    if (t) {
      t.replaceChildren(...s.sc.stanze.map(st => {
        const d = document.createElement("button");
        d.className = "tag";
        d.type = "button";
        d.innerHTML = `${st.nome.replace(/</g, "&lt;")}<small>${st.area.toFixed(1).replace(".", ",")} m²</small>`;
        d.onclick = () => prop.current.onStanza?.(st.riga);
        return d;
      }));
    }
    s.needs = true;
  }, [modello, mesh]);

  // piani visibili: quello scelto e quelli sotto; il tetto solo con tutta la casa
  useEffect(() => {
    const s = S.current;
    if (!s?.sc) return;
    const q = modello.piani.find(p => p.id === piano)?.quota ?? Infinity;
    for (const p of modello.piani) { const g = s.sc.piani.get(p.id); if (g) g.visible = piano === "tutti" || p.quota <= q; }
    s.sc.tetti.visible = tetto && piano === "tutti";
    s.needs = true;
  }, [piano, tetto, nomi, modello]);

  // il muro in corso, trasparente nel colore dell'editor; sparisce quando lo finisci (e arriva quello vero)
  useEffect(() => {
    if (!traccia) return;
    const col = new THREE.Color(getComputedStyle(box.current!).getPropertyValue("--accent").trim() || "#2557A7");
    const pieno = new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const filo = new THREE.LineBasicMaterial({ color: col });
    const grp = new THREE.Group();
    S.current?.scene.add(grp);
    const svuota = () => { for (const o of grp.children) (o as THREE.Mesh).geometry.dispose(); grp.clear(); };
    traccia.current = t => {
      svuota();
      if (t && t.pts.length > 1) {
        const g = muroInCorso(t.pts, t.quota, t.spessore, t.a, t.b), m = new THREE.Mesh(g, pieno);
        m.renderOrder = 3;
        grp.add(m, new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), filo));
      }
      if (S.current) S.current.needs = true;
    };
    return () => { traccia.current = null; svuota(); grp.removeFromParent(); pieno.dispose(); filo.dispose(); };
  }, [traccia]);

  // l'elemento scelto in pianta: un contorno che si vede anche attraverso i muri
  useEffect(() => {
    const s = S.current, e = sel == null ? undefined : modello.el.find(x => x.riga === sel), P = e && modello.piani.find(p => p.id === e.piano);
    if (!s || !e || !P) return;
    const geo: THREE.BufferGeometry[] = [];
    if (e.tipo === "muro") geo.push(muroInCorso(e.chiuso ? [...e.punti, e.punti[0]] : e.punti, P.quota - 1, e.spessore + 3, e.altezza + 2, e.fino + 2));
    else if (e.tipo !== "tetto") for (const poly of contorno(modello, e.riga)) {
      const [su, alto] = e.tipo === "arredo" ? [e.quota + e.H + 1, e.H + 2] : e.tipo === "apertura" ? [e.davanzale + e.alta, e.alta] : [6, 8];
      geo.push(lastra(poly, P.quota + su, alto));
    }
    if (!geo.length) return;
    const col = new THREE.Color(getComputedStyle(box.current!).getPropertyValue("--accent").trim() || "#2557A7");
    const velo = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
    const filo = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthTest: false });
    const grp = new THREE.Group();
    for (const g of geo) {
      const m = new THREE.Mesh(g, velo), l = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), filo);
      m.renderOrder = 4;
      l.renderOrder = 10;
      grp.add(m, l);
    }
    s.scene.add(grp);
    s.contorno = grp;
    s.needs = true;
    return () => {
      if (S.current?.contorno === grp) S.current.contorno = undefined;
      grp.removeFromParent();
      grp.traverse(o => (o as THREE.Mesh).geometry?.dispose());
      velo.dispose();
      filo.dispose();
      if (S.current) S.current.needs = true;
    };
  }, [sel, modello]);

  useEffect(() => {
    const s = S.current;
    if (!s?.sc || !volo.n) return;
    const c = s.sc.centro, R = s.sc.raggio * lontano(s.cam);
    let p1: THREE.Vector3, t1: THREE.Vector3;
    const st = s.sc.stanze.find(x => x.riga === volo.riga);
    if (volo.tipo === "alto") { t1 = c.clone(); p1 = c.clone().add(new THREE.Vector3(0, R * 2.3, 0.01)); }
    else if (volo.tipo === "entra" && st) { p1 = st.pos.clone().setY(st.pos.y + 0.7); t1 = p1.clone().add(new THREE.Vector3(0.01, -0.05, -0.6)); }
    else if (volo.tipo === "stanza" && st) { t1 = st.pos.clone(); p1 = st.pos.clone().add(new THREE.Vector3(-2.6, 6.2, 5.4)); }
    else { t1 = c.clone(); p1 = c.clone().add(new THREE.Vector3(R * 0.9, R * 0.85, R * 1.15)); }
    s.ctl.minDistance = volo.tipo === "entra" ? 0.01 : 0.5;
    s.anim = { t0: performance.now(), p0: s.cam.position.clone(), t0v: s.ctl.target.clone(), p1, t1 };
  }, [volo]);

  return (
    <div ref={box} className="vista" style={{ background: "var(--sky)" }}>
      <div ref={tags} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
    </div>
  );
}
