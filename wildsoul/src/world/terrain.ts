import * as THREE from "three";
import { mat } from "./models";

export type Collider =
  | { x: number; z: number; radius: number }
  | { x: number; z: number; halfX: number; halfZ: number };
export const BOUNDS = 34;
export const riverX = (z: number) => 12 + 1.7 * Math.sin(z * 0.105);
export function heightAt(x: number, z: number): number {
  const roll =
    0.16 * Math.sin(x * 0.19 + z * 0.06) * Math.cos(z * 0.18) +
    0.1 * Math.sin(z * 0.29 + x * 0.15);
  const border = Math.max(
    0,
    (Math.max(Math.abs(x) * 0.92, Math.abs(z)) - 25) / 10,
  );
  const river = Math.max(0, 1 - Math.abs(x - riverX(z)) / 3.7) * 0.5;
  const lake = Math.max(0, 1 - Math.hypot(x - 23, z - 24) / 9.5) * 0.65;
  const natural = roll + Math.pow(border, 2) * 4.5 - river - lake;
  // Flatten the authored cave floor into the hillside while retaining raised cliffs around it.
  if (x > 26 && x < 34 && z > -27 && z < -19) return 0.16 + natural * 0.08;
  return natural;
}
export function groundAt(x: number, z: number): number {
  if (Math.abs(z + 7) < 1.65 && Math.abs(x - riverX(-7)) < 3.8)
    return Math.max(0.44, heightAt(x, z));
  return heightAt(x, z);
}
function seeded(seed: number) {
  let v = seed >>> 0;
  return () => {
    v = (v * 1664525 + 1013904223) >>> 0;
    return v / 4294967296;
  };
}
function box(
  parent: THREE.Group,
  color: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function clearOfWater(x: number, z: number): boolean {
  return Math.abs(x - riverX(z)) > 3.5 && Math.hypot(x - 23, z - 24) > 9;
}

// The trail bends around the cave's western rock wall before entering its mouth.
// Keep it walkable: scattered scenery may flank it, but not silently block it.
export const CAVE_TRAIL: readonly [number, number][] = [
  [15, -7],
  [19, -8],
  [24, -15],
  [24, -21],
  [26, -23],
  [30, -23],
];
function nearCaveTrail(x: number, z: number, clearance: number): boolean {
  for (let i = 1; i < CAVE_TRAIL.length; i++) {
    const [ax, az] = CAVE_TRAIL[i - 1];
    const [bx, bz] = CAVE_TRAIL[i];
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)),
    );
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) < clearance) return true;
  }
  return false;
}

export interface Environment {
  group: THREE.Group;
  colliders: Collider[];
  sun: THREE.DirectionalLight;
  sky: THREE.Mesh;
  ambient: THREE.HemisphereLight;
  water: THREE.Group;
  grassCount: number;
  update: (elapsed: number) => void;
}
export function createEnvironment(quality: "low" | "high"): Environment {
  const group = new THREE.Group(),
    water = new THREE.Group();
  group.add(water);
  const colliders: Collider[] = [];
  const random = seeded(352187);
  const groundColors = [
    "#76a077",
    "#86a97c",
    "#759b73",
    "#8da87b",
    "#7c9e70",
  ].map((c) => new THREE.Color(c));
  const vertices: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const segments = quality === "high" ? 88 : 60,
    extent = 49;
  for (let iz = 0; iz <= segments; iz++)
    for (let ix = 0; ix <= segments; ix++) {
      const x = -extent + (ix * extent * 2) / segments,
        z = -extent + (iz * extent * 2) / segments;
      vertices.push(x, heightAt(x, z), z);
      const noise =
        Math.sin(x * 1.77 + z * 2.13) * Math.cos(x * 3.32 - z * 1.29);
      const forest = x > 15 && z < 12;
      const color =
        groundColors[Math.min(4, Math.floor(Math.abs(noise) * 5))].clone();
      if (forest) color.lerp(new THREE.Color("#63846c"), 0.42);
      if (Math.abs(x - riverX(z)) < 4.2 || Math.hypot(x - 23, z - 24) < 10)
        color.lerp(new THREE.Color("#a3aa80"), 0.48);
      color.multiplyScalar(0.97 + noise * 0.08);
      colors.push(color.r, color.g, color.b);
      if (ix < segments && iz < segments) {
        const i = iz * (segments + 1) + ix;
        indices.push(
          i,
          i + segments + 1,
          i + 1,
          i + 1,
          i + segments + 1,
          i + segments + 2,
        );
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  terrain.receiveShadow = true;
  group.add(terrain);

  // Terrain-following dirt ribbons, joined into a walkable circuit.
  function trail(points: [number, number][], width = 2.8) {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    );
    const strip: number[] = [],
      idx: number[] = [],
      tint: number[] = [];
    const c1 = new THREE.Color("#cbb98e"),
      c2 = new THREE.Color("#afaa80");
    for (let i = 0; i <= 90; i++) {
      const t = i / 90,
        p = curve.getPoint(t),
        tangent = curve.getTangent(t);
      const nx = -tangent.z,
        nz = tangent.x;
      for (const side of [-1, 1]) {
        const w = width * (0.92 + Math.sin(t * 21) * 0.055),
          x = p.x + nx * w * 0.5 * side,
          z = p.z + nz * w * 0.5 * side;
        strip.push(x, groundAt(x, z) + 0.055, z);
        const c = c1.clone().lerp(c2, 0.5 + 0.35 * Math.sin(t * 29 + side));
        tint.push(c.r, c.g, c.b);
      }
      if (i < 90) {
        const n = i * 2;
        idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(strip, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(tint, 3));
    geometry.setIndex(idx);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  trail(
    [
      [-23, 14],
      [-15, 11],
      [-8, 5],
      [-6, -3],
      [-1, -12],
      [-2, -23],
    ],
    3.7,
  );
  trail([[-10, 5], [-4, 1], [3, -5], [11, -7], ...CAVE_TRAIL], 2.9);
  trail(
    [
      [18, -8],
      [20, 0],
      [23, 9],
      [20, 16],
    ],
    2.2,
  );
  trail(
    [
      [-13, 10],
      [-10, 18],
      [-18, 19],
      [-23, 14],
    ],
    2.4,
  );

  // Genuine 3D river and lake, not a flat background image.
  const riverPoints: number[] = [],
    riverIdx: number[] = [];
  for (let i = 0; i <= 130; i++) {
    const z = -39 + (i * 78) / 130,
      x = riverX(z),
      width = 1.83 + 0.28 * Math.sin(i * 0.17);
    riverPoints.push(x - width, 0.035, z, x + width, 0.035, z);
    if (i < 130) {
      const n = i * 2;
      riverIdx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(riverPoints, 3),
  );
  riverGeo.setIndex(riverIdx);
  riverGeo.computeVertexNormals();
  const waterMat = new THREE.MeshStandardMaterial({
    color: "#6ab9b9",
    emissive: "#3688a2",
    emissiveIntensity: 0.12,
    metalness: 0.12,
    roughness: 0.28,
    transparent: true,
    opacity: 0.91,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const river = new THREE.Mesh(riverGeo, waterMat);
  river.renderOrder = 2;
  water.add(river);
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(7.9, 48),
    waterMat.clone(),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(23, 0.044, 24);
  lake.scale.set(1.12, 0.89, 1);
  lake.renderOrder = 2;
  water.add(lake);
  // Glints across the surface shift gently with the day.
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < (quality === "high" ? 25 : 12); i++) {
    const z = -28 + random() * 55,
      x = riverX(z) + (random() - 0.5) * 2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.28, 24),
      new THREE.MeshBasicMaterial({
        color: "#e4f8df",
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.06, z);
    ring.userData.phase = random() * 6;
    water.add(ring);
    ripples.push(ring);
  }
  // Curved plank bridge, the only dry river crossing in this area.
  const bridgeX = riverX(-7);
  box(group, "#755a42", bridgeX, 0.3, -7, 8.6, 0.3, 3.55);
  for (let i = 0; i < 13; i++)
    box(
      group,
      i % 3 === 0 ? "#bf966a" : "#ab835b",
      bridgeX - 3.95 + i * 0.66,
      0.5,
      -7,
      0.59,
      0.12,
      3.45,
    );
  for (const side of [-1, 1]) {
    for (let i = -3; i <= 3; i += 2)
      box(
        group,
        "#765841",
        bridgeX + i * 1.12,
        1.0,
        -7 + side * 1.73,
        0.16,
        1.2,
        0.16,
      );
    box(group, "#8d6b4c", bridgeX, 1.42, -7 + side * 1.73, 8, 0.12, 0.12);
  }

  // Instanced, varied trees: a handful of draw calls instead of one per branch.
  const trees: { x: number; z: number; s: number; kind: number }[] = [];
  const treeTarget = quality === "high" ? 155 : 82;
  for (
    let tries = 0;
    tries < treeTarget * 8 && trees.length < treeTarget;
    tries++
  ) {
    const x = -31 + random() * 64,
      z = -31 + random() * 62;
    const forest = x > 16 && z < 16;
    // The heart of the meadow is deliberately open; density rises sharply past the bridge.
    const meadowClearing = x > -20 && x < 10 && z > -24 && z < 5;
    if (random() > (forest ? 0.86 : meadowClearing ? 0.045 : 0.16)) continue;
    if (
      !clearOfWater(x, z) ||
      Math.hypot(x + 13, z - 11) < 13 ||
      Math.hypot(x + 1, z + 18) < 5 ||
      Math.hypot(x - 30, z + 22) < 6 ||
      Math.hypot(x + 7, z + 2) < 5 ||
      nearCaveTrail(x, z, 2.2)
    )
      continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.7)) continue;
    const s = 0.82 + random() * 0.9;
    trees.push({ x, z, s, kind: random() });
    colliders.push({ x, z, radius: s * 0.42 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.15, 7);
  const crownGeo = new THREE.DodecahedronGeometry(1, 1);
  const trunkMesh = new THREE.InstancedMesh(
    trunkGeo,
    mat("#786249"),
    trees.length,
  );
  const crown1 = new THREE.InstancedMesh(
    crownGeo,
    mat("#80ad77"),
    trees.length,
  );
  const crown2 = new THREE.InstancedMesh(
    crownGeo,
    mat("#729d73"),
    trees.length,
  );
  const crown3 = new THREE.InstancedMesh(
    crownGeo,
    mat("#9dba80"),
    trees.length,
  );
  const dummy = new THREE.Object3D();
  const greens = [
    "#6e9874",
    "#799e75",
    "#89ad81",
    "#688e75",
    "#99b17c",
    "#789b84",
  ].map((c) => new THREE.Color(c));
  trees.forEach((t, i) => {
    const y = heightAt(t.x, t.z),
      s = t.s;
    dummy.position.set(t.x, y + s * 1.1, t.z);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(0, t.kind * 6.28, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    [
      [crown1, -0.15, 2.3, 0.23, 1],
      [crown2, -0.53, 2.9, -0.19, 0.83],
      [crown3, 0.44, 2.73, -0.15, 0.84],
    ].forEach(([mesh, dx, dy, dz, scale]) => {
      const m = mesh as THREE.InstancedMesh;
      dummy.position.set(
        t.x + (dx as number) * s,
        y + (dy as number) * s,
        t.z + (dz as number) * s,
      );
      dummy.scale.set(
        s * (scale as number) * 1.08,
        s * (scale as number) * 0.93,
        s * (scale as number) * 1.02,
      );
      dummy.rotation.set(t.kind * 0.2, t.kind * 5, t.kind * 0.35);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(
        i,
        greens[
          (i + Math.round((dy as number) * 2) + greens.length * 10) %
            greens.length
        ],
      );
    });
  });
  [trunkMesh, crown1, crown2, crown3].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  });

  // Instanced grass and tiny flowers, placed on the actual heightfield.
  const grassGeo = new THREE.ConeGeometry(0.11, 0.5, 3);
  const grassCount = quality === "high" ? 1600 : 660;
  const grass = new THREE.InstancedMesh(grassGeo, mat("#b3be7c"), grassCount);
  const flowerCount = quality === "high" ? 280 : 120;
  const flowers = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.085, 0),
    mat("#f1d9ab"),
    flowerCount,
  );
  const flowerColors = [
    "#f7d48f",
    "#f7afa0",
    "#e7e1b6",
    "#c8b9d7",
    "#d0e6be",
  ].map((c) => new THREE.Color(c));
  function placeScatter(
    mesh: THREE.InstancedMesh,
    count: number,
    isFlower: boolean,
  ) {
    let placed = 0;
    for (let attempt = 0; attempt < count * 12 && placed < count; attempt++) {
      const x = -32 + random() * 64,
        z = -32 + random() * 64;
      if (
        !clearOfWater(x, z) ||
        Math.hypot(x + 13, z - 10) < 7 ||
        Math.hypot(x - 30, z + 22) < 4
      )
        continue;
      const size = (isFlower ? 0.7 : 0.55) + random() * (isFlower ? 0.8 : 1.35);
      dummy.position.set(
        x,
        heightAt(x, z) + (isFlower ? 0.42 * size : 0.24 * size),
        z,
      );
      dummy.scale.set(size, size, size);
      dummy.rotation.set(
        (random() - 0.5) * 0.23,
        random() * 6.28,
        (random() - 0.5) * 0.28,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      mesh.setColorAt(
        placed,
        isFlower
          ? flowerColors[Math.floor(random() * flowerColors.length)]
          : greens[Math.floor(random() * greens.length)],
      );
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  placeScatter(grass, grassCount, false);
  placeScatter(flowers, flowerCount, true);
  // Low-poly boulders mark the horizon and guide the eye to the walkable path.
  const rockCount = quality === "high" ? 88 : 45;
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    mat("#a8a895"),
    rockCount,
  );
  for (let i = 0; i < rockCount; i++) {
    let x = 0,
      z = 0;
    for (let attempt = 0; attempt < 50; attempt++) {
      x = -33 + random() * 66;
      z = -33 + random() * 66;
      if (
        Math.hypot(x + 13, z - 10) > 14 &&
        Math.hypot(x - 3, z + 1) > 4 &&
        clearOfWater(x, z) &&
        !nearCaveTrail(x, z, 2.2)
      )
        break;
    }
    const s = 0.35 + random() * 1.05;
    dummy.position.set(x, heightAt(x, z) + s * 0.27, z);
    dummy.scale.set(s, s * 0.53, s * (0.8 + random() * 0.5));
    dummy.rotation.set(random() * 0.2, random() * 6.28, random() * 0.2);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    rocks.setColorAt(
      i,
      new THREE.Color(random() > 0.5 ? "#a9ad9a" : "#8c9e90"),
    );
    if (s > 0.75 && clearOfWater(x, z))
      colliders.push({ x, z, radius: s * 0.55 });
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);

  // Far rim of authored hills and peaks: the boundary reads as a natural valley.
  for (let i = 0; i < 32; i++) {
    const angle = (i * Math.PI * 2) / 32,
      distance = 46 + random() * 11;
    const x = Math.cos(angle) * distance,
      z = Math.sin(angle) * distance;
    const high = 6 + random() * 9;
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(8 + random() * 8, high, 6),
      mat(i % 3 ? "#708c82" : "#829f8b"),
    );
    hill.position.set(x, heightAt(x, z) + high * 0.3 - 1, z);
    hill.rotation.y = random() * 6.28;
    hill.receiveShadow = true;
    group.add(hill);
  }

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(210, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color("#638e97") },
        horizon: { value: new THREE.Color("#f7cfaa") },
      },
      vertexShader:
        "varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec3 vPos; uniform vec3 top; uniform vec3 horizon; void main(){float t=clamp(normalize(vPos).y*.85+.3,0.,1.);gl_FragColor=vec4(mix(horizon,top,smoothstep(0.,.9,t)),1.);}",
    }),
  );
  sky.frustumCulled = false;
  group.add(sky);
  const sun = new THREE.DirectionalLight("#fff2d5", 2.0);
  sun.position.set(-18, 30, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    quality === "high" ? 2048 : 1024,
    quality === "high" ? 2048 : 1024,
  );
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  group.add(sun);
  const ambient = new THREE.HemisphereLight("#d5ecdf", "#596d56", 1.35);
  group.add(ambient);

  return {
    group,
    colliders,
    sun,
    sky,
    ambient,
    water,
    grassCount,
    update(elapsed: number) {
      // Six-minute cycle. Dusk darkens gently so exploration remains legible.
      const phase = (elapsed % 360) / 360;
      const daylight = 0.75 + 0.23 * Math.cos(phase * Math.PI * 2 - 1);
      sun.position.set(
        Math.cos(phase * 6.28) * 30,
        16 + daylight * 20,
        Math.sin(phase * 6.28) * 25,
      );
      sun.intensity = daylight * 2;
      ambient.intensity = daylight * 1.5;
      const uniforms = (sky.material as THREE.ShaderMaterial).uniforms;
      uniforms.top.value.set(daylight < 0.72 ? "#485575" : "#648e98");
      uniforms.horizon.value.set(daylight < 0.72 ? "#da9ca1" : "#f3cfaa");
      ripples.forEach((r) => {
        const p = (elapsed * 0.23 + r.userData.phase) % 1;
        r.scale.setScalar(0.4 + p * 2.2);
        (r.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.4;
      });
      water.position.y = Math.sin(elapsed * 0.7) * 0.014;
    },
  };
}
