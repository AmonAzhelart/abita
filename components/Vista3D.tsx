"use client";
// La casa in 3D: un dito ruota, due dita zoom e spostano. Le etichette delle stanze seguono la scena.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Modello } from "@/lib/lingua";
import { costruisci, type Mesh, type Scena } from "@/lib/scena";

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
type Props = { modello: Modello; piano: string; tetto: boolean; nomi: boolean; volo: Volo; mesh?: Record<string, Mesh>; onStanza?: (riga: number) => void };

export default function Vista3D({ modello, piano, tetto, nomi, volo, mesh, onStanza }: Props) {
  const box = useRef<HTMLDivElement>(null), tags = useRef<HTMLDivElement>(null);
  const S = useRef<{ r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; ctl: OrbitControls; sc?: Scena; ground: THREE.Mesh; needs: boolean; anim?: { t0: number; p0: THREE.Vector3; t0v: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3 } } | null>(null);
  const prop = useRef({ piano, tetto, nomi, onStanza });
  prop.current = { piano, tetto, nomi, onStanza };

  useEffect(() => {
    const el = box.current!;
    let r: THREE.WebGLRenderer;
    try { r = new THREE.WebGLRenderer({ antialias: true }); } catch { el.textContent = "Questo dispositivo non riesce a mostrare il 3D."; return; }
    r.setPixelRatio(Math.min(2, devicePixelRatio));
    el.prepend(r.domElement);
    r.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block";
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, 0.05, 800), ctl = new OrbitControls(cam, r.domElement);
    ctl.enableDamping = true;
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
    const misura = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
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
        const w = el.clientWidth, h = el.clientHeight, kids = tags.current?.children;
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
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mq.removeEventListener("change", tema); ctl.dispose(); S.current?.sc?.dispose(); r.dispose(); r.domElement.remove(); S.current = null; };
  }, []);

  // ricostruisci la scena quando cambia il modello, senza spostare la camera
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    const prima = !s.sc;
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
