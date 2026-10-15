import * as THREE from "three";
import type { BattleEvent, BattleSession, GameData } from "../core/types";
import { createCreatureModel, mat } from "./models";

export class BattleScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 130);
  private player?: THREE.Group;
  private opponent?: THREE.Group;
  private sparks: THREE.Points;
  private pulse = 0;
  private victim: "player" | "opponent" | null = null;
  private vanishing: "player" | "opponent" | null = null;
  private time = 0;
  constructor() {
    this.scene.background = new THREE.Color("#3e7776");
    this.scene.fog = new THREE.Fog("#78a99b", 20, 82);
    this.camera.position.set(0, 3.4, 10.9);
    this.camera.lookAt(0, 1.15, 0);
    const ambient = new THREE.HemisphereLight("#f8f4d5", "#526c64", 2);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight("#ffdfb1", 2.4);
    sun.position.set(-5, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 13;
    sun.shadow.camera.bottom = -13;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const back = new THREE.DirectionalLight("#a2e1d2", 1.2);
    back.position.set(4, 6, -6);
    this.scene.add(back);
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9.5, 0.5, 48),
      mat("#5c8c76"),
    );
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const inset = new THREE.Mesh(
      new THREE.CylinderGeometry(7.75, 7.8, 0.07, 48),
      mat("#769e7c"),
    );
    inset.position.y = -0.02;
    inset.receiveShadow = true;
    this.scene.add(inset);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(6.6, 0.06, 5, 80),
      mat("#e6d2a0"),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.scene.add(ring);
    for (let i = 0; i < 9; i++) {
      const theta = (i * Math.PI * 2) / 9 + 0.15;
      const x = Math.sin(theta) * 8.1,
        z = Math.cos(theta) * 8.1;
      const pillar = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.62, 0),
        mat(i % 2 ? "#8daa91" : "#a9b798"),
      );
      pillar.position.set(x, 0.37, z);
      pillar.scale.set(0.8, 1.8 + (i % 3) * 0.4, 0.8);
      pillar.castShadow = true;
      this.scene.add(pillar);
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18, 0),
        mat("#f9dfaa", true),
      );
      crystal.position.set(x, 1.62 + (i % 3) * 0.24, z);
      this.scene.add(crystal);
    }
    for (let i = 0; i < 8; i++) {
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(8 + (i % 3) * 3, 11 + (i % 4) * 4, 6),
        mat(i % 2 ? "#648e83" : "#79a290"),
      );
      hill.position.set((i - 3.5) * 12, 2, -28 - (i % 2) * 9);
      this.scene.add(hill);
    }
    const particles = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      const a = i * 2.39996,
        radius = Math.sqrt(i / 180) * 10;
      particles[i * 3] = Math.cos(a) * radius;
      particles[i * 3 + 1] = 0.3 + ((i * 17) % 35) / 10;
      particles[i * 3 + 2] = Math.sin(a) * radius;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(particles, 3));
    this.sparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: "#fff3cf",
        size: 0.08,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    this.scene.add(this.sparks);
  }
  set(session: BattleSession, data: GameData) {
    if (this.player) this.scene.remove(this.player);
    if (this.opponent) this.scene.remove(this.opponent);
    const active = data.party.find((c) => c.id === session.activeId)!;
    this.player = createCreatureModel(active.speciesId, 1.4);
    this.opponent = createCreatureModel(session.opponent.speciesId, 1.52);
    this.player.position.set(-2.5, 0.035, 1.9);
    this.player.rotation.y = 1.0;
    this.opponent.position.set(2.4, 0.035, -1.8);
    this.opponent.rotation.y = -0.55;
    this.scene.add(this.player, this.opponent);
    this.vanishing = null;
    this.pulse = 0;
  }
  react(events: BattleEvent[], outcome?: string) {
    const lastHurt = [...events].reverse().find((e) => e.kind === "hurt");
    this.victim = lastHurt?.target ?? null;
    this.pulse = 1;
    if (outcome === "captured" || outcome === "won")
      this.vanishing = "opponent";
    if (outcome === "lost") this.vanishing = "player";
  }
  update(dt: number) {
    this.time += dt;
    const player = this.player,
      foe = this.opponent;
    if (player) {
      const body = player.userData.body as THREE.Group;
      body.position.y = Math.sin(this.time * 2.7) * 0.065;
      player.position.x =
        -2.5 +
        (this.pulse > 0 && this.victim === "opponent" ? 0.28 * this.pulse : 0);
    }
    if (foe) {
      const body = foe.userData.body as THREE.Group;
      body.position.y = Math.sin(this.time * 2.4 + 1.2) * 0.07;
      foe.position.x =
        2.4 +
        (this.pulse > 0 && this.victim === "player" ? -0.25 * this.pulse : 0);
    }
    if (this.vanishing) {
      const target = this.vanishing === "player" ? player : foe;
      if (target) target.scale.multiplyScalar(1 - Math.min(0.9, dt * 1.35));
    }
    this.pulse = Math.max(0, this.pulse - dt * 1.9);
    this.sparks.rotation.y += dt * 0.04;
    this.camera.position.x = Math.sin(this.time * 0.28) * 0.2;
    this.camera.lookAt(0, 1.15, 0);
  }
  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
