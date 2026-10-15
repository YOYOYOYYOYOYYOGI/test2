import { ITEMS } from "../data/moves";
import { SPECIES, STARTERS } from "../data/species";
import { createCreature, statsFor } from "./progression";
import type { Creature, GameData, ItemId } from "./types";

export const PARTY_LIMIT = 6;
export const STORAGE_LIMIT = 300;
export const BAG_LIMIT = 40;
export const START_POSITION = { x: -12, z: 8, facing: -0.35 };
export const START_SETTINGS: GameData["settings"] = {
  volume: 0.45,
  cameraSensitivity: 0.7,
  quality: "high",
  invertY: false,
};

export function newGame(starter: string): GameData {
  if (!STARTERS.some((s) => s === starter))
    throw new Error("Choose a starting companion");
  return {
    version: 1,
    player: { ...START_POSITION },
    party: [createCreature(starter, 3)],
    storage: [],
    bag: { wispVial: 5, lumenVial: 1, herbTonic: 3, deepTonic: 0 },
    gold: 90,
    quest: "unstarted",
    flags: { guideGift: false, trainerWon: false },
    foundItems: [],
    seen: [starter],
    captured: [starter],
    visited: ["village"],
    settings: { ...START_SETTINGS },
    playSeconds: 0,
  };
}
export const bagCount = (data: GameData) =>
  Object.values(data.bag).reduce((sum, count) => sum + count, 0);
export function addItem(data: GameData, item: ItemId, amount: number): boolean {
  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    bagCount(data) + amount > BAG_LIMIT
  )
    return false;
  data.bag[item] += amount;
  return true;
}
export function useItem(data: GameData, item: ItemId): boolean {
  if (!Number.isInteger(data.bag[item]) || data.bag[item] < 1) return false;
  data.bag[item]--;
  return true;
}
export function buyItem(
  data: GameData,
  item: ItemId,
  amount = 1,
): string | null {
  if (!ITEMS[item] || !Number.isInteger(amount) || amount < 1)
    return "Invalid item.";
  if (data.gold < ITEMS[item].buy * amount) return "Not enough sunmarks.";
  if (bagCount(data) + amount > BAG_LIMIT) return "Your bag is full.";
  data.gold -= ITEMS[item].buy * amount;
  addItem(data, item, amount);
  return null;
}
export function sellItem(data: GameData, item: ItemId): string | null {
  if (!ITEMS[item] || !useItem(data, item)) return "You do not have that item.";
  data.gold += ITEMS[item].sell;
  return null;
}
export function addCaptured(
  data: GameData,
  creature: Creature,
): "party" | "storage" {
  if (!SPECIES[creature.speciesId]) throw new Error("Unknown creature");
  if (
    data.party.some((c) => c.id === creature.id) ||
    data.storage.some((c) => c.id === creature.id)
  )
    throw new Error("Duplicate creature ID");
  const destination = data.party.length < PARTY_LIMIT ? "party" : "storage";
  if (destination === "storage" && data.storage.length >= STORAGE_LIMIT)
    throw new Error(
      "The lodge is full. Move a companion before capturing another.",
    );
  data[destination].push({
    ...creature,
    hp: Math.max(1, creature.hp),
    ailment: undefined,
  });
  if (!data.captured.includes(creature.speciesId))
    data.captured.push(creature.speciesId);
  if (!data.seen.includes(creature.speciesId))
    data.seen.push(creature.speciesId);
  if (data.quest === "catch") data.quest = "return";
  return destination;
}
export function moveToParty(data: GameData, id: string): string | null {
  if (data.party.length >= PARTY_LIMIT)
    return "Your party is full. Send a companion to storage first.";
  const index = data.storage.findIndex((c) => c.id === id);
  if (index < 0) return "Companion not in storage.";
  data.party.push(...data.storage.splice(index, 1));
  return null;
}
export function moveToStorage(data: GameData, id: string): string | null {
  if (data.party.length <= 1)
    return "Keep at least one companion in your party.";
  if (data.storage.length >= STORAGE_LIMIT) return "The lodge is full.";
  const index = data.party.findIndex((c) => c.id === id);
  if (index < 0) return "Companion not in your party.";
  data.storage.push(...data.party.splice(index, 1));
  return null;
}
export function leadParty(data: GameData, id: string): boolean {
  const index = data.party.findIndex((c) => c.id === id);
  if (index < 0) return false;
  data.party.unshift(...data.party.splice(index, 1));
  return true;
}
export function healParty(data: GameData): void {
  data.party.forEach((c) => {
    c.hp = statsFor(c).hp;
    c.ailment = undefined;
  });
  data.storage.forEach((c) => {
    c.hp = statsFor(c).hp;
    c.ailment = undefined;
  });
}
export function giftFromGuide(data: GameData): boolean {
  if (data.flags.guideGift) return false;
  data.flags.guideGift = true;
  // Reserve no space? Reward converted to currency instead of vanishing when bag is full.
  if (!addItem(data, "wispVial", 2)) data.gold += 40;
  return true;
}
export function beginQuest(data: GameData): boolean {
  if (data.quest !== "unstarted") return false;
  data.quest = "catch";
  return true;
}
export function finishQuest(data: GameData): boolean {
  if (data.quest !== "return") return false;
  data.quest = "done";
  data.gold += 80;
  if (!addItem(data, "herbTonic", 2)) data.gold += 40;
  // Fast travel is unlocked, but the player must still discover the waystone in person.
  return true;
}
export function awardTrainer(data: GameData): boolean {
  if (data.flags.trainerWon) return false;
  data.flags.trainerWon = true;
  data.gold += 100;
  if (!addItem(data, "lumenVial", 1)) data.gold += 35;
  return true;
}
export function findCache(
  data: GameData,
  id: string,
  item: ItemId,
  quantity = 1,
): boolean {
  if (data.foundItems.includes(id)) return false;
  data.foundItems.push(id);
  if (!addItem(data, item, quantity)) data.gold += ITEMS[item].sell * quantity;
  return true;
}
