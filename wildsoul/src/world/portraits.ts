import * as THREE from "three";
import { SPECIES_LIST } from "../data/species";
import { createCreatureModel } from "./models";

const portraits = new Map<string, string>();
export const portraitOf = (species: string) => portraits.get(species) || "";

/** One temporary WebGL context renders all creature portraits; it is then released. */
export function createPortraits(): void {
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    });
    renderer.setSize(172, 172);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const camera = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 30);
    camera.position.set(2.5, 2.4, 4.5);
    camera.lookAt(0, 1, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight("#ffffff", 2.1));
    const light = new THREE.DirectionalLight("#fff1d9", 2.2);
    light.position.set(-3, 7, 6);
    scene.add(light);
    for (const species of SPECIES_LIST) {
      const model = createCreatureModel(species.id);
      model.rotation.y = -0.2;
      scene.add(model);
      renderer.render(scene, camera);
      portraits.set(species.id, renderer.domElement.toDataURL("image/png"));
      scene.remove(model);
    }
  } catch (error) {
    console.warn("Portraits unavailable; using affinity emblems.", error);
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
