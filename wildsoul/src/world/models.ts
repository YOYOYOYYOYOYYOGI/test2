import * as THREE from "three";
import { SPECIES } from "../data/species";
import type { Species } from "../core/types";

const smoothSphere = new THREE.SphereGeometry(1, 20, 14);
const pebble = new THREE.DodecahedronGeometry(1, 1);
const cone = new THREE.ConeGeometry(1, 1, 7);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const materials = new Map<string, THREE.MeshStandardMaterial>();
export function mat(
  color: string | number,
  emissive = false,
): THREE.MeshStandardMaterial {
  const key = `${color}/${emissive}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: emissive ? 0.45 : 0.83,
        metalness: emissive ? 0.05 : 0,
        emissive: emissive ? color : 0x000000,
        emissiveIntensity: emissive ? 0.28 : 0,
        flatShading: false,
      }),
    );
  return materials.get(key)!;
}
function add(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  color: string | number,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  emissive = false,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat(color, emissive));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}
export function orb(
  parent: THREE.Group,
  color: string | number,
  position: [number, number, number],
  scale: [number, number, number],
  emissive = false,
): THREE.Mesh {
  return add(parent, smoothSphere, color, position, scale, emissive);
}
function tube(
  parent: THREE.Group,
  points: [number, number, number][],
  radius: number,
  color: string | number,
  emissive = false,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
  );
  return add(
    parent,
    new THREE.TubeGeometry(curve, 10, radius, 6, false),
    color,
    [0, 0, 0],
    [1, 1, 1],
    emissive,
  );
}
function leaf(
  parent: THREE.Group,
  color: string | number,
  pos: [number, number, number],
  rot = 0,
  size = 0.26,
) {
  const mesh = add(parent, pebble, color, pos, [
    size * 0.55,
    size,
    size * 0.18,
  ]);
  mesh.rotation.z = rot;
  return mesh;
}
function eyes(
  group: THREE.Group,
  y: number,
  z: number,
  spread: number,
  size = 0.075,
) {
  [-1, 1].forEach((side) => {
    orb(
      group,
      "#faf6e8",
      [side * spread, y, z],
      [size * 1.4, size * 1.25, size * 0.5],
    );
    orb(
      group,
      "#24383b",
      [side * spread, y, z + 0.035],
      [size * 0.73, size * 0.86, size * 0.35],
    );
    orb(
      group,
      "#ffffff",
      [side * spread - 0.016, y + 0.022, z + 0.057],
      [size * 0.26, size * 0.27, size * 0.15],
    );
  });
}
function groundShadow(group: THREE.Group) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.84, 20),
    new THREE.MeshBasicMaterial({
      color: 0x173b38,
      transparent: true,
      opacity: 0.21,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  shadow.scale.set(1.18, 0.82, 1);
  shadow.receiveShadow = false;
  group.add(shadow);
}

/** All silhouettes are bespoke, composited from original procedural geometry; front faces +Z. */
export function createCreatureModel(speciesId: string, size = 1): THREE.Group {
  const species: Species = SPECIES[speciesId];
  if (!species) throw new Error(`Unknown species: ${speciesId}`);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  groundShadow(group);
  const c = species.color,
    a = species.accent;
  switch (species.shape) {
    case "fawn": {
      orb(body, c, [0, 0.72, -0.08], [0.52, 0.49, 0.7]);
      orb(body, a, [0, 0.65, 0.49], [0.32, 0.3, 0.22]);
      orb(body, c, [0, 1.24, 0.43], [0.43, 0.43, 0.39]);
      orb(body, a, [0, 1.1, 0.75], [0.26, 0.17, 0.19]);
      eyes(body, 1.32, 0.74, 0.21, 0.065);
      [-1, 1].forEach((s) => {
        orb(body, c, [s * 0.35, 1.52, 0.38], [0.21, 0.32, 0.12]).rotation.z =
          s * -0.6;
        orb(
          body,
          "#f5d9b9",
          [s * 0.35, 1.52, 0.47],
          [0.12, 0.2, 0.045],
        ).rotation.z = s * -0.6;
        tube(
          body,
          [
            [s * 0.2, 1.57, 0.26],
            [s * 0.38, 1.97, 0.2],
            [s * 0.46, 2.19, 0.25],
          ],
          0.048,
          "#785f44",
        );
        tube(
          body,
          [
            [s * 0.36, 1.89, 0.2],
            [s * 0.61, 2.03, 0.28],
          ],
          0.035,
          "#785f44",
        );
        leaf(
          body,
          speciesId === "thorncrest" ? "#f0d394" : "#90c775",
          [s * 0.46, 2.16, 0.26],
          s * -0.5,
          0.21,
        );
        [-0.36, 0.38].forEach((z) =>
          orb(body, "#635d48", [s * 0.31, 0.25, z], [0.13, 0.32, 0.14]),
        );
      });
      orb(body, "#e9b1ac", [0, 1.1, 0.89], [0.095, 0.065, 0.055]);
      for (let i = 0; i < 4; i++)
        leaf(
          body,
          i % 2 ? a : "#b6d486",
          [(i - 1.5) * 0.19, 1.13, -0.28 + (i % 2) * 0.23],
          (i - 1.5) * 0.5,
          0.29,
        );
      if (speciesId === "thorncrest")
        [-1, 1].forEach((s) =>
          orb(body, "#f4d996", [s * 0.49, 1.98, 0.26], [0.1, 0.1, 0.1], true),
        );
      break;
    }
    case "cat": {
      orb(body, c, [0, 0.66, -0.12], [0.57, 0.47, 0.66]);
      orb(body, c, [0, 1.13, 0.41], [0.52, 0.48, 0.45]);
      [-1, 1].forEach((s) => {
        const ear = add(
          body,
          cone,
          c,
          [s * 0.37, 1.58, 0.36],
          [0.22, 0.5, 0.22],
        );
        ear.rotation.z = s * -0.22;
        add(
          body,
          cone,
          "#eab49b",
          [s * 0.37, 1.61, 0.51],
          [0.11, 0.29, 0.07],
        ).rotation.z = s * -0.22;
        orb(body, "#fff0ca", [s * 0.3, 0.25, 0.28], [0.15, 0.28, 0.18]);
      });
      orb(body, "#ffe3bb", [0, 1.0, 0.77], [0.32, 0.22, 0.18]);
      eyes(body, 1.24, 0.8, 0.22, 0.078);
      orb(body, "#6e413d", [0, 1.03, 0.94], [0.07, 0.055, 0.05]);
      tube(
        body,
        [
          [0, 0.7, -0.62],
          [0.35, 0.9, -0.91],
          [0.6, 1.29, -0.96],
          [0.61, 1.5, -0.8],
        ],
        0.13,
        c,
      );
      add(
        body,
        cone,
        "#f9a264",
        [0.59, 1.61, -0.8],
        [0.26, 0.51, 0.25],
        true,
      ).rotation.z = 0.3;
      add(
        body,
        cone,
        "#ffe2a4",
        [0.59, 1.56, -0.72],
        [0.14, 0.3, 0.14],
        true,
      ).rotation.z = 0.3;
      break;
    }
    case "salamander": {
      orb(body, c, [0, 0.54, -0.14], [0.7, 0.37, 0.83]);
      orb(body, c, [0, 0.81, 0.5], [0.57, 0.4, 0.52]);
      orb(body, "#cceae4", [0, 0.7, 0.89], [0.38, 0.15, 0.15]);
      eyes(body, 0.94, 0.91, 0.29, 0.082);
      [-1, 1].forEach((s) => {
        orb(body, c, [s * 0.58, 0.31, 0.21], [0.3, 0.13, 0.18]).rotation.y =
          s * 0.45;
        orb(body, c, [s * 0.53, 0.3, -0.5], [0.29, 0.13, 0.19]);
        for (let i = 0; i < 3; i++)
          add(
            body,
            cone,
            a,
            [s * (0.42 + i * 0.16), 0.86 + i * 0.04, 0.1 - i * 0.16],
            [0.08, 0.32 - i * 0.05, 0.11],
          ).rotation.z = s * -0.7;
      });
      tube(
        body,
        [
          [0, 0.5, -0.81],
          [0.1, 0.62, -1.15],
          [0, 0.75, -1.48],
        ],
        0.2,
        c,
      );
      orb(body, a, [0, 0.77, -1.51], [0.29, 0.15, 0.25]);
      for (let i = 0; i < 3; i++)
        orb(
          body,
          "#dcf7ed",
          [Math.cos(i * 2.1) * 0.65, 1.35 + i * 0.18, Math.sin(i * 2.1) * 0.3],
          [0.1 + i * 0.02, 0.1 + i * 0.02, 0.1 + i * 0.02],
          true,
        );
      break;
    }
    case "rabbit": {
      orb(body, c, [0, 0.67, -0.1], [0.5, 0.49, 0.53]);
      orb(body, "#f4e4be", [0, 0.57, 0.36], [0.32, 0.33, 0.19]);
      orb(body, c, [0, 1.2, 0.31], [0.44, 0.42, 0.4]);
      [-1, 1].forEach((s) => {
        const ear = orb(body, c, [s * 0.25, 1.89, 0.27], [0.18, 0.59, 0.14]);
        ear.rotation.z = s * -0.18;
        const inner = orb(
          body,
          "#dbbdaa",
          [s * 0.25, 1.9, 0.39],
          [0.095, 0.4, 0.04],
        );
        inner.rotation.z = s * -0.18;
        orb(body, a, [s * 0.35, 0.23, 0.38], [0.23, 0.22, 0.26]);
      });
      eyes(body, 1.29, 0.65, 0.21, 0.069);
      orb(body, "#e6aa9b", [0, 1.12, 0.74], [0.065, 0.055, 0.04]);
      orb(body, "#f5efcc", [0, 0.67, -0.67], [0.25, 0.25, 0.22]);
      leaf(body, "#679557", [0, 1.57, 0.27], 0.25, 0.3);
      break;
    }
    case "turtle": {
      orb(body, "#9c895f", [0, 0.55, -0.08], [0.65, 0.37, 0.68]);
      orb(body, c, [0, 0.78, -0.15], [0.74, 0.52, 0.7]);
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        orb(
          body,
          i % 2 ? "#9f9873" : "#d2be8a",
          [Math.sin(ang) * 0.49, 1.02, Math.cos(ang) * 0.44 - 0.16],
          [0.25, 0.14, 0.29],
        );
      }
      orb(body, "#c0aa7e", [0, 0.59, 0.7], [0.37, 0.31, 0.43]);
      eyes(body, 0.7, 1.06, 0.19, 0.064);
      [-1, 1].forEach((s) =>
        [-0.4, 0.42].forEach((z) =>
          orb(body, "#b1a076", [s * 0.55, 0.22, z], [0.24, 0.19, 0.23]),
        ),
      );
      tube(
        body,
        [
          [0, 1.19, -0.05],
          [0.04, 1.44, -0.06],
        ],
        0.045,
        "#62895a",
      );
      leaf(body, "#76ac65", [-0.16, 1.44, -0.08], -0.7, 0.22);
      leaf(body, "#89ba6b", [0.15, 1.45, -0.07], 0.7, 0.23);
      break;
    }
    case "moth": {
      orb(body, c, [0, 0.95, 0.0], [0.32, 0.5, 0.28], true);
      [-1, 1].forEach((s) => {
        const upper = orb(body, a, [s * 0.56, 1.3, -0.1], [0.6, 0.56, 0.11]);
        upper.rotation.z = s * -0.55;
        const lower = orb(body, c, [s * 0.53, 0.8, -0.12], [0.48, 0.38, 0.09]);
        lower.rotation.z = s * 0.52;
        orb(body, "#fff4d3", [s * 0.68, 1.32, 0.01], [0.19, 0.19, 0.045], true);
        tube(
          body,
          [
            [s * 0.12, 1.35, 0.17],
            [s * 0.34, 1.82, 0.17],
            [s * 0.51, 1.88, 0.16],
          ],
          0.025,
          "#dac590",
        );
        orb(body, c, [s * 0.52, 1.89, 0.16], [0.07, 0.07, 0.07], true);
      });
      orb(body, c, [0, 1.35, 0.2], [0.33, 0.32, 0.28]);
      eyes(body, 1.43, 0.44, 0.17, 0.055);
      break;
    }
    case "bird": {
      orb(body, c, [0, 0.82, 0], [0.55, 0.55, 0.5]);
      orb(body, a, [0, 0.65, 0.39], [0.33, 0.34, 0.16]);
      [-1, 1].forEach((s) => {
        const wing = orb(
          body,
          "#71a99e",
          [s * 0.52, 0.88, -0.11],
          [0.36, 0.23, 0.47],
        );
        wing.rotation.z = s * 0.35;
      });
      eyes(body, 1.05, 0.45, 0.23, 0.072);
      add(
        body,
        cone,
        "#dfad65",
        [0, 0.83, 0.58],
        [0.17, 0.27, 0.18],
      ).rotation.x = Math.PI / 2;
      for (let i = -1; i <= 1; i++) {
        const feather = orb(
          body,
          c,
          [i * 0.15, 1.41 + Math.abs(i) * -0.08, -0.05],
          [0.11, 0.29, 0.13],
        );
        feather.rotation.z = i * -0.32;
      }
      [-1, 1].forEach((s) =>
        orb(body, "#ca9b6b", [s * 0.21, 0.18, 0.15], [0.12, 0.19, 0.13]),
      );
      break;
    }
    case "fox": {
      orb(body, c, [0, 0.68, -0.12], [0.55, 0.46, 0.67]);
      orb(body, c, [0, 1.16, 0.48], [0.46, 0.43, 0.43]);
      [-1, 1].forEach((s) => {
        add(
          body,
          cone,
          c,
          [s * 0.34, 1.57, 0.46],
          [0.21, 0.49, 0.16],
        ).rotation.z = s * -0.22;
        orb(body, "#5b526e", [s * 0.32, 0.25, 0.2], [0.13, 0.29, 0.16]);
      });
      orb(body, a, [0, 1.0, 0.82], [0.34, 0.22, 0.2]);
      eyes(body, 1.26, 0.82, 0.21, 0.07);
      orb(body, "#ebc8dc", [0, 1.7, 0.65], [0.085, 0.085, 0.04], true);
      tube(
        body,
        [
          [0, 0.6, -0.68],
          [0.32, 0.7, -1.04],
          [0.64, 1.05, -1.2],
        ],
        0.24,
        c,
      );
      orb(body, a, [0.69, 1.12, -1.22], [0.27, 0.27, 0.31]);
      break;
    }
    case "jelly": {
      orb(body, c, [0, 1.24, 0], [0.72, 0.24, 0.65], true);
      orb(body, a, [0, 1.04, 0.1], [0.35, 0.24, 0.34], true);
      [-1, 1].forEach((s) => {
        const fin = orb(body, c, [s * 0.69, 1.14, -0.08], [0.49, 0.12, 0.42]);
        fin.rotation.z = s * 0.27;
      });
      for (let i = -2; i <= 2; i++)
        tube(
          body,
          [
            [i * 0.18, 0.99, -0.14],
            [i * 0.23, 0.58, -0.09],
            [i * 0.16, 0.4, 0.04],
          ],
          0.045,
          a,
          true,
        );
      eyes(body, 1.29, 0.57, 0.2, 0.06);
      orb(body, "#fff3d0", [0, 1.12, -0.1], [0.18, 0.15, 0.17], true);
      break;
    }
    case "ram": {
      orb(body, c, [0, 0.8, -0.15], [0.62, 0.57, 0.77]);
      orb(body, c, [0, 1.3, 0.49], [0.49, 0.44, 0.44]);
      [-1, 1].forEach((s) => {
        tube(
          body,
          [
            [s * 0.35, 1.53, 0.22],
            [s * 0.63, 1.78, 0.13],
            [s * 0.83, 1.64, 0.16],
            [s * 0.81, 1.34, 0.35],
          ],
          0.13,
          a,
          true,
        );
        orb(body, "#685852", [s * 0.38, 0.26, 0.1], [0.19, 0.32, 0.2]);
      });
      orb(body, "#d6b99a", [0, 1.17, 0.82], [0.33, 0.23, 0.18]);
      eyes(body, 1.39, 0.84, 0.22, 0.068);
      for (let i = -1; i <= 1; i++)
        add(
          body,
          cone,
          "#eea66f",
          [i * 0.18, 1.68, 0.16],
          [0.1, 0.24, 0.11],
          true,
        ).rotation.z = i * 0.32;
      break;
    }
    case "snail": {
      orb(body, c, [0, 0.29, 0.12], [0.5, 0.23, 0.7]);
      orb(body, "#a8cbbb", [0, 0.58, 0.55], [0.34, 0.31, 0.31]);
      orb(body, a, [0, 0.78, -0.31], [0.59, 0.59, 0.56]);
      const spiral = new THREE.Mesh(
        new THREE.TorusGeometry(0.29, 0.055, 7, 24, Math.PI * 1.8),
        mat("#759eaa"),
      );
      spiral.position.set(0.54, 0.81, -0.28);
      spiral.rotation.y = Math.PI / 2;
      body.add(spiral);
      [-1, 1].forEach((s) => {
        tube(
          body,
          [
            [s * 0.2, 0.8, 0.7],
            [s * 0.22, 1.2, 0.72],
          ],
          0.044,
          c,
        );
        orb(body, "#344d49", [s * 0.22, 1.24, 0.72], [0.09, 0.09, 0.09]);
      });
      eyes(body, 0.65, 0.82, 0.17, 0.052);
      break;
    }
    case "wisp":
      orb(body, c, [0, 0.9, 0], [0.5, 0.7, 0.5], true);
      eyes(body, 1, 0.49, 0.21);
      break;
  }
  group.scale.setScalar(size);
  group.userData.body = body;
  group.userData.phase = Math.random() * Math.PI * 2;
  return group;
}

export function createPerson(
  kind: "player" | "guide" | "researcher" | "healer" | "shop" | "trainer",
): THREE.Group {
  const group = new THREE.Group();
  const torso = new THREE.Group();
  group.add(torso);
  const palette: Record<typeof kind, [string, string, string]> = {
    player: ["#426e64", "#e7c693", "#a95e48"],
    guide: ["#926959", "#f1cf9d", "#dfaa68"],
    researcher: ["#5e8181", "#eee0b9", "#b17e63"],
    healer: ["#d6b7a1", "#e6d7b3", "#92a87b"],
    shop: ["#906c55", "#e4b994", "#e3bd75"],
    trainer: ["#755e77", "#e9bf9d", "#b190ad"],
  };
  const [coat, skin, trim] = palette[kind];
  const left = new THREE.Group(),
    right = new THREE.Group();
  left.position.set(-0.19, 0.76, 0);
  right.position.set(0.19, 0.76, 0);
  group.add(left, right);
  add(left, cylinder, "#433c3b", [0, -0.37, 0], [0.13, 0.72, 0.15]);
  add(right, cylinder, "#433c3b", [0, -0.37, 0], [0.13, 0.72, 0.15]);
  orb(group, "#52443a", [-0.19, 0.09, 0.11], [0.19, 0.09, 0.26]);
  orb(group, "#52443a", [0.19, 0.09, 0.11], [0.19, 0.09, 0.26]);
  add(torso, cone, coat, [0, 1.01, 0], [0.5, 0.83, 0.35]).rotation.z = Math.PI;
  orb(torso, coat, [0, 1.22, 0], [0.38, 0.45, 0.29]);
  [-1, 1].forEach((s) => {
    const sleeve = orb(torso, coat, [s * 0.43, 1.26, 0.04], [0.16, 0.32, 0.17]);
    sleeve.rotation.z = s * -0.26;
    orb(torso, skin, [s * 0.48, 0.98, 0.09], [0.12, 0.13, 0.13]);
  });
  add(torso, cylinder, skin, [0, 1.52, 0.04], [0.12, 0.15, 0.12]);
  orb(torso, skin, [0, 1.84, 0.05], [0.32, 0.34, 0.29]);
  eyes(torso, 1.88, 0.33, 0.13, 0.037);
  orb(torso, "#644834", [0, 1.76, 0.35], [0.043, 0.035, 0.03]);
  // Shaped hair, shoulder satchel, and personal accessories rather than box people.
  orb(
    torso,
    kind === "healer" ? "#c7a784" : "#423b38",
    [0, 2.08, -0.05],
    [0.34, 0.16, 0.32],
  );
  [-1, 1].forEach((s) =>
    orb(torso, "#423b38", [s * 0.27, 1.97, -0.04], [0.12, 0.23, 0.17]),
  );
  const scarf = orb(torso, trim, [0, 1.55, 0.24], [0.28, 0.1, 0.13]);
  scarf.rotation.z = 0.22;
  if (kind === "player") {
    orb(torso, "#a97752", [-0.42, 1.02, -0.29], [0.24, 0.33, 0.18]);
    tube(
      torso,
      [
        [-0.38, 1.19, -0.31],
        [0.17, 1.6, 0.29],
      ],
      0.048,
      "#d0a36e",
    );
    orb(torso, "#efcc86", [0, 1.56, 0.37], [0.085, 0.085, 0.045], true);
  } else {
    const hat = add(
      torso,
      cylinder,
      kind === "researcher" ? "#d8be91" : coat,
      [0, 2.14, -0.02],
      [0.4, 0.08, 0.4],
    );
    hat.castShadow = true;
    if (kind === "guide")
      leaf(torso, "#92c287", [0.25, 2.21, -0.05], 0.55, 0.17);
    if (kind === "trainer")
      add(torso, cone, "#766688", [0, 2.37, -0.03], [0.31, 0.42, 0.31]);
  }
  group.userData.legs = [left, right];
  group.userData.torso = torso;
  return group;
}
