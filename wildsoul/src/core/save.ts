import { SPECIES } from "../data/species";
import { BAG_LIMIT, PARTY_LIMIT, STORAGE_LIMIT } from "./game";
import { experienceForLevel, statsFor } from "./progression";
import type { Creature, GameData, ItemId } from "./types";

const KEY = "vesperglen.save.v1";
const itemIds: ItemId[] = ["wispVial", "lumenVial", "herbTonic", "deepTonic"];
const isObject = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const int = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const num = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
const uniqueStrings = (
  x: unknown,
  allowed?: (s: string) => boolean,
): x is string[] =>
  Array.isArray(x) &&
  x.length <= 500 &&
  x.every(
    (v) => typeof v === "string" && v.length <= 64 && (!allowed || allowed(v)),
  ) &&
  new Set(x).size === x.length;
const validCreature = (raw: unknown): raw is Creature => {
  if (
    !isObject(raw) ||
    typeof raw.id !== "string" ||
    !raw.id ||
    raw.id.length > 80 ||
    typeof raw.speciesId !== "string" ||
    !SPECIES[raw.speciesId] ||
    !int(raw.level, 1, 50) ||
    !int(raw.xp, experienceForLevel(raw.level), 1_000_000) ||
    (raw.nickname !== undefined &&
      (typeof raw.nickname !== "string" || raw.nickname.length > 20)) ||
    (raw.ailment !== undefined &&
      !["scorched", "slowed"].includes(String(raw.ailment)))
  )
    return false;
  const creature = raw as unknown as Creature;
  return int(raw.hp, 0, statsFor(creature).hp);
};

export function validateSave(raw: unknown): raw is GameData {
  if (
    !isObject(raw) ||
    raw.version !== 1 ||
    !isObject(raw.player) ||
    !isObject(raw.bag) ||
    !isObject(raw.flags) ||
    !isObject(raw.settings) ||
    !Array.isArray(raw.party) ||
    !Array.isArray(raw.storage)
  )
    return false;
  if (
    !num(raw.player.x, -43, 43) ||
    !num(raw.player.z, -43, 43) ||
    !num(raw.player.facing, -10000, 10000)
  )
    return false;
  if (
    raw.party.length < 1 ||
    raw.party.length > PARTY_LIMIT ||
    raw.storage.length > STORAGE_LIMIT ||
    !raw.party.every(validCreature) ||
    !raw.storage.every(validCreature)
  )
    return false;
  const ids = [...raw.party, ...raw.storage].map((c: Creature) => c.id);
  if (ids.length !== new Set(ids).size) return false;
  const bag = raw.bag as Record<string, unknown>;
  if (
    !itemIds.every((id) => int(bag[id], 0, BAG_LIMIT)) ||
    itemIds.reduce((sum, id) => sum + Number(bag[id]), 0) > BAG_LIMIT ||
    !int(raw.gold, 0, 9_999_999)
  )
    return false;
  if (
    !["unstarted", "catch", "return", "done"].includes(String(raw.quest)) ||
    typeof raw.flags.guideGift !== "boolean" ||
    typeof raw.flags.trainerWon !== "boolean"
  )
    return false;
  if (
    !uniqueStrings(raw.foundItems) ||
    !uniqueStrings(raw.seen, (id) => !!SPECIES[id]) ||
    !uniqueStrings(raw.captured, (id) => !!SPECIES[id]) ||
    !uniqueStrings(raw.visited)
  )
    return false;
  if (
    !num(raw.settings.volume, 0, 1) ||
    !num(raw.settings.cameraSensitivity, 0.2, 2) ||
    !["low", "high"].includes(String(raw.settings.quality)) ||
    typeof raw.settings.invertY !== "boolean" ||
    !num(raw.playSeconds, 0, 100_000_000)
  )
    return false;
  return true;
}

function parse(raw: string | null): GameData | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return validateSave(value) ? value : null;
  } catch {
    return null;
  }
}
export function loadGame(
  storage: Pick<Storage, "getItem"> = localStorage,
): GameData | null {
  try {
    return (
      parse(storage.getItem(KEY)) ?? parse(storage.getItem(`${KEY}.backup`))
    );
  } catch {
    return null;
  }
}
export function hasSave(
  storage: Pick<Storage, "getItem"> = localStorage,
): boolean {
  return loadGame(storage) !== null;
}
export function saveGame(
  data: GameData,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): boolean {
  if (!validateSave(data)) return false; // never overwrite a valid save with malformed state
  try {
    const previous = storage.getItem(KEY);
    if (parse(previous)) storage.setItem(`${KEY}.backup`, previous!);
    storage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
export function saveKey(): string {
  return KEY;
}
