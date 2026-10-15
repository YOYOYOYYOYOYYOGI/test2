import * as THREE from "three";
import type { GameData, Habitat } from "../core/types";
import { SPECIES } from "../data/species";
import { createCreatureModel, createPerson, mat, orb } from "./models";
import {
  BOUNDS,
  createEnvironment,
  groundAt,
  heightAt,
  riverX,
  type Collider,
  type Environment,
} from "./terrain";

export type NpcId = "guide" | "researcher" | "healer" | "shop" | "trainer";
export type Interactable = {
  id: string;
  type: "npc" | "wild" | "cache" | "cave" | "beacon";
  x: number;
  z: number;
  label: string;
  distance?: number;
  speciesId?: string;
};
interface Spawn {
  id: string;
  speciesId: string;
  habitat: Habitat;
  x: number;
  z: number;
  level: number;
  model: THREE.Group;
  active: boolean;
  cooldown: number;
  phase: number;
  wander: number;
}
export const NPCS: Record<
  NpcId,
  { x: number; z: number; name: string; role: string }
> = {
  guide: { x: -7, z: 6, name: "Pip", role: "Village guide" },
  researcher: { x: -18, z: 12.5, name: "Orla", role: "Wildling keeper" },
  healer: { x: -10, z: 22, name: "Mira", role: "Hearth tender" },
  shop: { x: -20.5, z: 22, name: "Fen", role: "Supply merchant" },
  trainer: { x: -2, z: -18, name: "Rowan", role: "Wayfarer trainer" },
};
export const CACHES = [
  { id: "field-cache", x: -5, z: -9, item: "wispVial" as const, quantity: 2 },
  {
    id: "forest-cache",
    x: 22,
    z: -13,
    item: "lumenVial" as const,
    quantity: 1,
  },
  { id: "cave-cache", x: 30, z: -25, item: "deepTonic" as const, quantity: 1 },
];
const SPAWN_PLAN: {
  id: string;
  species: string;
  x: number;
  z: number;
  level: number;
}[] = [
  { id: "m1", species: "mosskip", x: -7, z: -2, level: 2 },
  { id: "m2", species: "mosskip", x: -17, z: -7, level: 3 },
  { id: "m3", species: "mosskip", x: 1, z: -11, level: 3 },
  { id: "p1", species: "pumblit", x: -22, z: -15, level: 2 },
  { id: "p2", species: "pumblit", x: 5, z: 1, level: 3 },
  { id: "e1", species: "cinderkin", x: -25, z: -8, level: 4 },
  { id: "f1", species: "breezel", x: 22, z: -4, level: 3 },
  { id: "f2", species: "breezel", x: 27, z: 4, level: 4 },
  { id: "f3", species: "lumimoth", x: 25, z: -10, level: 3 },
  { id: "f4", species: "bristlebloom", x: 28, z: 7, level: 4 },
  { id: "r1", species: "brooklet", x: 8, z: -14, level: 2 },
  { id: "r2", species: "brooklet", x: 9, z: 11, level: 3 },
  { id: "r3", species: "tidewisp", x: 9, z: 2, level: 3 },
  { id: "r4", species: "coralume", x: 20, z: 14, level: 5 },
  { id: "c1", species: "noxling", x: 30, z: -22, level: 4 },
  { id: "c2", species: "ashhorn", x: 32, z: -23.9, level: 5 },
];

function box(
  parent: THREE.Group,
  color: string,
  pos: [number, number, number],
  scale: [number, number, number],
  glow = false,
) {
  const obj = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(color, glow));
  obj.position.set(...pos);
  obj.scale.set(...scale);
  obj.castShadow = !glow;
  obj.receiveShadow = !glow;
  parent.add(obj);
  return obj;
}
function roof(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  color: string,
) {
  // Raised gabled roof, six carefully wound faces with real normals.
  const coords = [
    [-w / 2, 0, -d / 2],
    [w / 2, 0, -d / 2],
    [0, 1.6, -d / 2],
    [-w / 2, 0, d / 2],
    [w / 2, 0, d / 2],
    [0, 1.6, d / 2],
  ];
  const triangles = [
    0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
  ];
  const verts: number[] = [];
  triangles.forEach((i) => verts.push(...coords[i]));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  for (const s of [-1, 1]) {
    const beam = box(
      parent,
      "#f1d6a2",
      [x + (s * w) / 4, y + 0.83, z + d / 2 + 0.065],
      [w * 0.59, 0.11, 0.15],
    );
    beam.rotation.z = s * -0.68;
  }
}
function makeCottage(
  scene: THREE.Group,
  x: number,
  z: number,
  wall: string,
  roofColor: string,
  style: "home" | "shop" | "hearth" = "home",
) {
  const group = new THREE.Group();
  group.position.set(x, heightAt(x, z), z);
  scene.add(group);
  box(group, "#a8a98a", [0, 0.12, 0], [5.9, 0.24, 4.5]);
  box(group, wall, [0, 1.7, 0], [5.25, 3.2, 4]);
  for (const s of [-1, 1]) {
    box(group, "#e8d8ad", [s * 2.45, 1.5, 2.07], [0.2, 2.9, 0.13]);
    box(group, "#e8d8ad", [s * 1.68, 3.05, 2.07], [1.54, 0.18, 0.14]);
    box(group, "#605e56", [s * 1.72, 1.87, 2.09], [0.78, 0.8, 0.14]);
    box(group, "#f7d68e", [s * 1.72, 1.87, 2.19], [0.57, 0.6, 0.05], true);
    box(group, "#926f51", [s * 1.72, 1.87, 2.23], [0.08, 0.7, 0.06]);
    box(group, "#926f51", [s * 1.72, 1.87, 2.23], [0.66, 0.07, 0.06]);
    box(group, "#af825b", [s * 1.72, 1.35, 2.29], [1.0, 0.2, 0.42]);
  }
  roof(group, 0, 3.28, 0, 6.25, 4.9, roofColor);
  box(group, "#967152", [0, 1.1, 2.12], [1.08, 2.2, 0.18]);
  box(group, "#be9167", [0, 2.17, 2.23], [1.26, 0.15, 0.2]);
  orb(group, "#f1d191", [0.38, 1.05, 2.26], [0.06, 0.06, 0.06], true);
  box(group, "#e8c69b", [0, 0.14, 2.9], [2.2, 0.13, 1.6]);
  box(group, roofColor, [1.58, 4.42, -0.73], [0.64, 1.05, 0.75]); // chimney
  if (style === "shop") {
    box(group, "#6f846c", [0, 2.78, 2.4], [2.1, 0.43, 0.14]);
    box(group, "#dfbd82", [0, 2.77, 2.49], [1.82, 0.27, 0.07]);
    for (let i = -1; i <= 1; i++)
      orb(
        group,
        i === 0 ? "#a8c8a1" : "#eec493",
        [i * 0.65, 0.7, 3.1],
        [0.23, 0.27, 0.25],
      );
  }
  if (style === "hearth") {
    orb(group, "#f4d195", [0, 4.37, 1.7], [0.21, 0.21, 0.14], true);
    for (const s of [-1, 1])
      orb(group, "#b1ca9e", [s * 2.8, 0.45, 2.62], [0.48, 0.52, 0.44]);
  }
  return { x, z, halfX: 2.65, halfZ: 2.12 };
}
function makeLamp(scene: THREE.Group, x: number, z: number, height = 2.3) {
  const group = new THREE.Group();
  group.position.set(x, heightAt(x, z), z);
  scene.add(group);
  box(group, "#695b47", [0, height / 2, 0], [0.12, height, 0.12]);
  box(group, "#706046", [0, height + 0.21, 0], [0.64, 0.1, 0.64]);
  orb(group, "#f8d696", [0, height - 0.07, 0], [0.25, 0.3, 0.25], true);
  box(group, "#756147", [0, height + 0.42, 0], [0.33, 0.13, 0.33]);
}
function makeSign(
  scene: THREE.Group,
  x: number,
  z: number,
  text: string,
  angle = 0,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#72573e";
  ctx.fillRect(10, 10, 492, 140);
  ctx.strokeStyle = "#e0c192";
  ctx.lineWidth = 5;
  ctx.strokeRect(21, 20, 470, 118);
  ctx.fillStyle = "#fff0cf";
  ctx.font = "bold 39px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 83);
  const group = new THREE.Group();
  group.position.set(x, heightAt(x, z), z);
  group.rotation.y = angle;
  scene.add(group);
  box(group, "#65513c", [0, 1.1, -0.06], [0.16, 2.2, 0.18]);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 0.84),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      side: THREE.DoubleSide,
    }),
  );
  board.position.y = 1.86;
  group.add(board);
}
function makeCache(scene: THREE.Group, x: number, z: number, color: string) {
  const group = new THREE.Group();
  group.position.set(x, groundAt(x, z), z);
  scene.add(group);
  box(group, "#7b5e4a", [0, 0.28, 0], [0.69, 0.4, 0.55]);
  box(group, "#b79260", [0, 0.48, 0], [0.75, 0.11, 0.6]);
  orb(group, color, [0, 0.65, 0], [0.12, 0.15, 0.12], true);
  group.userData.bob = true;
  return group;
}
function makeCave(scene: THREE.Group, colliders: Collider[]) {
  const z = -23;
  const group = new THREE.Group();
  scene.add(group);
  // Open-ended, walkable rock tunnel extends into the eastern cliffs.
  for (let i = 0; i < 7; i++) {
    const xx = 26.5 + i * 1.4;
    for (const side of [-1, 1]) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, 1),
        mat(i % 2 ? "#70827b" : "#89978a"),
      );
      rock.position.set(
        xx,
        heightAt(xx, z + side * 3.4) + 1.25,
        z + side * 3.4,
      );
      rock.scale.set(1.35, 2.2, 1.4);
      rock.castShadow = true;
      group.add(rock);
      colliders.push({ x: xx, z: z + side * 3.4, radius: 1.05 });
    }
    const arch = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1, 0),
      mat("#6a7774"),
    );
    arch.position.set(xx, heightAt(xx, z) + 4.5, z);
    arch.scale.set(1.6, 0.83, 3.9);
    arch.castShadow = true;
    group.add(arch);
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 6.3),
    mat("#6f867b"),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(30.7, 0.21, z);
  floor.receiveShadow = true;
  group.add(floor);
  for (const s of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38 + (i % 2) * 0.1, 0),
        mat(i % 2 ? "#c2ddbb" : "#89cfd2", true),
      );
      crystal.scale.y = 2.2;
      crystal.position.set(
        27.6 + i * 2,
        heightAt(27.6 + i * 2, z + s * 2.5) + 0.67,
        z + s * 2.45,
      );
      crystal.rotation.z = s * 0.17;
      group.add(crystal);
    }
  makeSign(scene, 25, -16, "ECHO CAVE", -0.5);
}

export class World {
  readonly scene = new THREE.Scene();
  readonly environment: Environment;
  readonly player: THREE.Group;
  readonly colliders: Collider[];
  readonly spawns: Spawn[] = [];
  readonly npcModels = new Map<NpcId, THREE.Group>();
  readonly caches = new Map<string, THREE.Group>();
  elapsed = 0;
  private buildings: { x: number; z: number; halfX: number; halfZ: number }[] =
    [];
  constructor(quality: "low" | "high" = "high") {
    this.scene.background = new THREE.Color("#c4d8bb");
    this.scene.fog = new THREE.FogExp2("#bbd4ba", 0.009);
    this.environment = createEnvironment(quality);
    this.scene.add(this.environment.group);
    this.colliders = this.environment.colliders;
    const village = new THREE.Group();
    this.scene.add(village);
    this.buildings.push(makeCottage(village, -21, 9, "#e6d6b4", "#9a7166"));
    this.buildings.push(
      makeCottage(village, -22, 18, "#e4d7b8", "#67877d", "shop"),
    );
    this.buildings.push(
      makeCottage(village, -9, 18, "#ede0c2", "#ab846b", "hearth"),
    );
    this.buildings.push(makeCottage(village, -2, 15, "#e1d1ab", "#a9786a"));
    this.colliders.push(...this.buildings);
    for (const [x, z] of [
      [-15, 6],
      [-6, 8],
      [-15, 22],
      [-25, 13],
      [1, 7],
      [4, -5],
      [17, -7],
    ] as [number, number][])
      makeLamp(village, x, z);
    makeSign(village, -11, -2, "HOLLOW VALE", 0.3);
    makeSign(village, 17, -5, "WHISPERWOOD", -0.4);
    makeCave(this.environment.group, this.colliders);
    // A small landmark with an animated core. Players can explore it before it becomes a travel point.
    const beacon = new THREE.Group();
    beacon.position.set(3.2, heightAt(3.2, -6), -6);
    this.scene.add(beacon);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.38, 0),
        mat("#9eab96"),
      );
      stone.position.set(Math.cos(a) * 1.2, 0.25, Math.sin(a) * 1.2);
      beacon.add(stone);
    }
    orb(beacon, "#b7d8c0", [0, 0.72, 0], [0.21, 0.46, 0.21], true);
    beacon.userData.core = beacon.children[5];
    for (const [id, info] of Object.entries(NPCS) as [
      NpcId,
      (typeof NPCS)[NpcId],
    ][]) {
      const npc = createPerson(id);
      npc.position.set(info.x, groundAt(info.x, info.z), info.z);
      npc.rotation.y = id === "trainer" ? -1.3 : id === "guide" ? 0.55 : -1.4;
      this.scene.add(npc);
      this.npcModels.set(id, npc);
    }
    for (const cache of CACHES)
      this.caches.set(
        cache.id,
        makeCache(
          this.environment.group,
          cache.x,
          cache.z,
          cache.item === "lumenVial" ? "#f6d794" : "#a4d9b8",
        ),
      );
    for (const plan of SPAWN_PLAN) {
      const model = createCreatureModel(plan.species, 0.76);
      model.position.set(plan.x, groundAt(plan.x, plan.z), plan.z);
      const spawn: Spawn = {
        id: plan.id,
        speciesId: plan.species,
        habitat: SPECIES[plan.species].habitat,
        x: plan.x,
        z: plan.z,
        level: plan.level,
        model,
        active: false,
        cooldown: 0,
        phase: (plan.x * 31 + plan.z * 17) % 6,
        wander: 0,
      };
      this.spawns.push(spawn);
    }
    this.player = createPerson("player");
    this.player.position.set(-12, groundAt(-12, 8), 8);
    this.scene.add(this.player);
  }
  blocksCamera(x: number, y: number, z: number): boolean {
    return this.buildings.some(
      (b) =>
        Math.abs(x - b.x) < b.halfX + 0.35 &&
        Math.abs(z - b.z) < b.halfZ + 0.35 &&
        y < heightAt(b.x, b.z) + 5.4,
    );
  }
  setPlayer(x: number, z: number, facing: number) {
    this.player.position.set(x, groundAt(x, z), z);
    this.player.rotation.y = facing;
  }
  canStand(x: number, z: number, radius = 0.32): boolean {
    if (Math.abs(x) > BOUNDS - 1.2 || Math.abs(z) > BOUNDS - 1.2) return false;
    if (Math.hypot(x - 23, z - 24) < 7.4 + radius) return false;
    if (
      Math.abs(x - riverX(z)) < 1.8 + radius &&
      !(Math.abs(z + 7) < 1.45 && Math.abs(x - riverX(-7)) < 4)
    )
      return false;
    for (const c of this.colliders) {
      if ("radius" in c) {
        if (Math.hypot(x - c.x, z - c.z) < c.radius + radius) return false;
      } else if (
        Math.abs(x - c.x) < c.halfX + radius &&
        Math.abs(z - c.z) < c.halfZ + radius
      )
        return false;
    }
    return true;
  }
  update(dt: number, playerX: number, playerZ: number, foundItems: string[]) {
    this.elapsed += dt;
    this.environment.update(this.elapsed);
    for (const spawn of this.spawns) {
      const distance = Math.hypot(playerX - spawn.x, playerZ - spawn.z);
      const visible = distance < 31 && this.elapsed >= spawn.cooldown;
      if (visible && !spawn.active) {
        if (
          SPECIES[spawn.speciesId].rarity === "rare" &&
          spawn.cooldown > 0 &&
          Math.random() > 0.45
        ) {
          spawn.cooldown = this.elapsed + 35;
          continue;
        }
        this.scene.add(spawn.model);
        spawn.active = true;
      } else if ((!visible || spawn.cooldown > this.elapsed) && spawn.active) {
        this.scene.remove(spawn.model);
        spawn.active = false;
      }
      if (!spawn.active) continue;
      spawn.wander += dt;
      const swayX = Math.sin(spawn.wander * 0.31 + spawn.phase) * 0.65;
      const swayZ = Math.cos(spawn.wander * 0.27 + spawn.phase) * 0.6;
      const x = spawn.x + swayX,
        z = spawn.z + swayZ;
      if (this.canStand(x, z, 0.15))
        spawn.model.position.set(x, groundAt(x, z), z);
      else
        spawn.model.position.set(spawn.x, groundAt(spawn.x, spawn.z), spawn.z);
      spawn.model.rotation.y =
        Math.sin(spawn.wander * 0.22 + spawn.phase) * 0.55;
      const body = spawn.model.userData.body as THREE.Group;
      body.position.y =
        Math.sin(this.elapsed * 2 + spawn.phase) * 0.065 +
        (SPECIES[spawn.speciesId].shape === "moth" ||
        SPECIES[spawn.speciesId].shape === "jelly"
          ? 0.24
          : 0);
    }
    for (const [id, model] of this.caches) {
      model.visible = !foundItems.includes(id);
      if (model.visible)
        model.children[2].position.y =
          0.65 + Math.sin(this.elapsed * 2.2 + model.position.x) * 0.09;
    }
    for (const [id, model] of this.npcModels) {
      const torso = model.userData.torso as THREE.Group;
      torso.rotation.z = Math.sin(this.elapsed * 1.3 + NPCS[id].x) * 0.012;
    }
  }
  takeSpawn(id: string, cooldown = 60) {
    const spawn = this.spawns.find((s) => s.id === id);
    if (!spawn) return;
    if (spawn.active) this.scene.remove(spawn.model);
    spawn.active = false;
    spawn.cooldown = this.elapsed + cooldown;
  }
  nearby(x: number, z: number, data: GameData): Interactable | null {
    const options: Interactable[] = [];
    for (const [id, info] of Object.entries(NPCS))
      options.push({
        id,
        type: "npc",
        x: info.x,
        z: info.z,
        label: `Talk to ${info.name}`,
      });
    for (const spawn of this.spawns)
      if (spawn.active)
        options.push({
          id: spawn.id,
          type: "wild",
          x: spawn.model.position.x,
          z: spawn.model.position.z,
          speciesId: spawn.speciesId,
          label: `Meet ${SPECIES[spawn.speciesId].name}`,
        });
    for (const cache of CACHES)
      if (!data.foundItems.includes(cache.id))
        options.push({
          id: cache.id,
          type: "cache",
          x: cache.x,
          z: cache.z,
          label: "Open hidden cache",
        });
    options.push({
      id: "cave",
      type: "cave",
      x: 27,
      z: -23,
      label: "Explore Echo Cave",
    });
    options.push({
      id: "beacon",
      type: "beacon",
      x: 3.2,
      z: -6,
      label: "Inspect waystone",
    });
    return (
      options
        .map((o) => ({ ...o, distance: Math.hypot(o.x - x, o.z - z) }))
        .filter((o) => o.distance! <= (o.type === "wild" ? 2.55 : 3.05))
        .sort((a, b) => a.distance! - b.distance!)[0] ?? null
    );
  }
  region(x: number, z: number): { id: string; label: string } {
    if (x > 26 && z < -16) return { id: "cave", label: "Echo Cave" };
    if (x > 15 && z < 14) return { id: "forest", label: "Whisperwood" };
    if (x > 4 && z > 9) return { id: "river", label: "Glasswater Bend" };
    if (Math.hypot(x + 14, z - 13) < 13)
      return { id: "village", label: "Thimblewick" };
    return { id: "meadow", label: "Sunlit Fields" };
  }
}
