export type Affinity =
  "grove" | "ember" | "tide" | "stone" | "gale" | "lumen" | "dusk";
export type Rarity = "common" | "uncommon" | "rare";
export type Habitat = "meadow" | "forest" | "river" | "cave";
export type ItemId = "wispVial" | "lumenVial" | "herbTonic" | "deepTonic";
export type Ailment = "scorched" | "slowed";

export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}
export interface Move {
  id: string;
  name: string;
  affinity: Affinity;
  power: number;
  accuracy: number;
  description: string;
  effect?: "heal" | "scorch" | "slow";
  effectChance?: number;
}
export interface Species {
  id: string;
  name: string;
  affinities: Affinity[];
  rarity: Rarity;
  habitat: Habitat;
  base: Stats;
  capture: number;
  color: string;
  accent: string;
  description: string;
  shape:
    | "fawn"
    | "cat"
    | "salamander"
    | "rabbit"
    | "turtle"
    | "moth"
    | "bird"
    | "fox"
    | "jelly"
    | "ram"
    | "snail"
    | "wisp";
  learns: { level: number; move: string }[];
  evolution?: { at: number; into: string };
}
export interface Creature {
  id: string;
  speciesId: string;
  nickname?: string;
  level: number;
  xp: number;
  hp: number;
  ailment?: Ailment;
}
export interface Settings {
  volume: number;
  cameraSensitivity: number;
  quality: "low" | "high";
  invertY: boolean;
}
export interface GameData {
  version: 1;
  player: { x: number; z: number; facing: number };
  party: Creature[];
  storage: Creature[];
  bag: Record<ItemId, number>;
  gold: number;
  quest: "unstarted" | "catch" | "return" | "done";
  flags: { guideGift: boolean; trainerWon: boolean };
  foundItems: string[];
  seen: string[];
  captured: string[];
  visited: string[];
  settings: Settings;
  playSeconds: number;
}
export interface BattleSession {
  kind: "wild" | "trainer";
  spawnId?: string;
  trainerId?: string;
  opponent: Creature;
  activeId: string;
  turn: number;
}
export type BattleAction =
  | { kind: "move"; moveId: string }
  | { kind: "capture"; item: "wispVial" | "lumenVial" }
  | { kind: "heal"; item: "herbTonic" | "deepTonic" }
  | { kind: "switch"; creatureId: string }
  | { kind: "flee" };
export interface BattleEvent {
  text: string;
  kind: "attack" | "hurt" | "heal" | "capture" | "faint" | "victory" | "info";
  target?: "player" | "opponent";
}
export interface BattleResult {
  data: GameData;
  session: BattleSession | null;
  events: BattleEvent[];
  outcome?: "captured" | "won" | "lost" | "fled";
  error?: string;
}
