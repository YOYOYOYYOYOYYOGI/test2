import type { Affinity, ItemId, Move } from "../core/types";

export const AFFINITY: Record<
  Affinity,
  { label: string; color: string; glyph: string }
> = {
  grove: { label: "Grove", color: "#91ce93", glyph: "❧" },
  ember: { label: "Ember", color: "#f5a278", glyph: "✺" },
  tide: { label: "Tide", color: "#78c6dd", glyph: "≈" },
  stone: { label: "Stone", color: "#c6ac82", glyph: "⬡" },
  gale: { label: "Gale", color: "#b3dacc", glyph: "➶" },
  lumen: { label: "Lumen", color: "#efd38a", glyph: "✦" },
  dusk: { label: "Dusk", color: "#bd9acb", glyph: "☾" },
};

const moves: Move[] = [
  {
    id: "nudge",
    name: "Gentle Nudge",
    affinity: "stone",
    power: 35,
    accuracy: 1,
    description: "A dependable little bump.",
  },
  {
    id: "vineWhip",
    name: "Vine Waltz",
    affinity: "grove",
    power: 48,
    accuracy: 0.94,
    description: "Dancing vines sweep the field.",
  },
  {
    id: "seedBurst",
    name: "Seedburst",
    affinity: "grove",
    power: 67,
    accuracy: 0.87,
    description: "A shower of enchanted seeds.",
  },
  {
    id: "pollen",
    name: "Pollen Hush",
    affinity: "grove",
    power: 27,
    accuracy: 0.95,
    effect: "slow",
    effectChance: 0.85,
    description: "Dust that slows an opponent.",
  },
  {
    id: "emberDash",
    name: "Ember Dash",
    affinity: "ember",
    power: 50,
    accuracy: 0.95,
    description: "A quick streak of warm fire.",
  },
  {
    id: "cinder",
    name: "Cinder Song",
    affinity: "ember",
    power: 35,
    accuracy: 0.92,
    effect: "scorch",
    effectChance: 0.4,
    description: "Sometimes leaves a lingering scorch.",
  },
  {
    id: "flare",
    name: "Hearthflare",
    affinity: "ember",
    power: 69,
    accuracy: 0.85,
    description: "A bright, powerful blaze.",
  },
  {
    id: "ripple",
    name: "Ripple Ring",
    affinity: "tide",
    power: 49,
    accuracy: 0.96,
    description: "A spinning wave of clear water.",
  },
  {
    id: "foam",
    name: "Foam Flick",
    affinity: "tide",
    power: 34,
    accuracy: 1,
    description: "A playful spray of foam.",
  },
  {
    id: "mend",
    name: "Moonpool",
    affinity: "tide",
    power: 0,
    accuracy: 1,
    effect: "heal",
    description: "Restores about a third of your health.",
  },
  {
    id: "torrent",
    name: "River Rush",
    affinity: "tide",
    power: 68,
    accuracy: 0.86,
    description: "The current gathers strength.",
  },
  {
    id: "pebble",
    name: "Pebble Toss",
    affinity: "stone",
    power: 48,
    accuracy: 0.96,
    description: "A carefully aimed skipping stone.",
  },
  {
    id: "quake",
    name: "Rootquake",
    affinity: "stone",
    power: 64,
    accuracy: 0.84,
    description: "A tremor beneath the earth.",
  },
  {
    id: "gust",
    name: "Guststep",
    affinity: "gale",
    power: 49,
    accuracy: 0.95,
    description: "A twisting rush of wind.",
  },
  {
    id: "wing",
    name: "Feather Arc",
    affinity: "gale",
    power: 62,
    accuracy: 0.88,
    description: "A soaring curved strike.",
  },
  {
    id: "glimmer",
    name: "Glimmer",
    affinity: "lumen",
    power: 49,
    accuracy: 0.96,
    description: "A flicker of borrowed starlight.",
  },
  {
    id: "sunbeam",
    name: "Sunthread",
    affinity: "lumen",
    power: 65,
    accuracy: 0.86,
    description: "A slender ray of golden light.",
  },
  {
    id: "shade",
    name: "Shade Kiss",
    affinity: "dusk",
    power: 50,
    accuracy: 0.96,
    description: "A brush of cool evening air.",
  },
  {
    id: "night",
    name: "Nightfall",
    affinity: "dusk",
    power: 66,
    accuracy: 0.85,
    description: "A sudden veil of twilight.",
  },
];
export const MOVES: Readonly<Record<string, Move>> = Object.fromEntries(
  moves.map((m) => [m.id, m]),
);

// Attacking affinity -> affinities it is strong against. Reverse match = resistance.
const strong: Partial<Record<Affinity, Affinity[]>> = {
  grove: ["tide", "stone"],
  ember: ["grove", "gale"],
  tide: ["ember", "stone"],
  stone: ["gale"],
  gale: ["grove"],
  lumen: ["dusk"],
  dusk: ["lumen"],
};
export function effectiveness(attack: Affinity, defense: Affinity[]): number {
  return defense.reduce(
    (factor, type) =>
      factor *
      (strong[attack]?.includes(type)
        ? 1.5
        : strong[type]?.includes(attack)
          ? 0.75
          : 1),
    1,
  );
}

export const ITEMS: Record<
  ItemId,
  {
    name: string;
    description: string;
    buy: number;
    sell: number;
    color: string;
    icon: string;
  }
> = {
  wispVial: {
    name: "Wisp Vial",
    description: "A glass vessel for befriending wildlings. Standard strength.",
    buy: 30,
    sell: 12,
    color: "#99d8b5",
    icon: "◈",
  },
  lumenVial: {
    name: "Lumen Vial",
    description: "A brighter vessel with a better chance of bonding.",
    buy: 75,
    sell: 30,
    color: "#f6d28c",
    icon: "✧",
  },
  herbTonic: {
    name: "Herb Tonic",
    description: "Restores 35 HP to one companion.",
    buy: 25,
    sell: 10,
    color: "#afd59f",
    icon: "❦",
  },
  deepTonic: {
    name: "Deep Tonic",
    description: "Restores 80 HP to one companion.",
    buy: 55,
    sell: 22,
    color: "#82c6d4",
    icon: "✚",
  },
};
