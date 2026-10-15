import { MOVES } from "../data/moves";
import { SPECIES } from "../data/species";
import type { Creature, Stats } from "./types";

export const experienceForLevel = (level: number): number => 10 * level * level;
export const displayName = (creature: Creature): string =>
  creature.nickname || SPECIES[creature.speciesId]?.name || "Unknown";
export function statsFor(creature: Creature): Stats {
  const base = SPECIES[creature.speciesId].base;
  return {
    hp: Math.floor(base.hp + creature.level * 5),
    attack: Math.floor(base.attack + creature.level * 2.1),
    defense: Math.floor(base.defense + creature.level * 1.65),
    speed: Math.floor(base.speed + creature.level * 1.5),
  };
}
export function createCreature(
  speciesId: string,
  level: number,
  id: string = globalThis.crypto?.randomUUID?.() ||
    `c${Math.random().toString(36).slice(2)}`,
): Creature {
  if (!SPECIES[speciesId]) throw new Error(`Unknown creature: ${speciesId}`);
  if (!Number.isInteger(level) || level < 1 || level > 50)
    throw new Error("Invalid level");
  const creature: Creature = {
    id,
    speciesId,
    level,
    xp: experienceForLevel(level),
    hp: 1,
  };
  creature.hp = statsFor(creature).hp;
  return creature;
}
export function knownMoves(creature: Creature) {
  return SPECIES[creature.speciesId].learns
    .filter((entry) => entry.level <= creature.level)
    .slice(-4)
    .map((entry) => MOVES[entry.move]);
}
export interface Growth {
  creature: Creature;
  messages: string[];
}
export function gainExperience(original: Creature, amount: number): Growth {
  const creature = {
    ...original,
    xp: original.xp + Math.max(0, Math.floor(amount)),
  };
  const messages: string[] = [];
  while (
    creature.level < 50 &&
    creature.xp >= experienceForLevel(creature.level + 1)
  ) {
    const oldMax = statsFor(creature).hp;
    creature.level++;
    creature.hp = Math.min(
      statsFor(creature).hp,
      creature.hp + (statsFor(creature).hp - oldMax),
    );
    messages.push(`${displayName(creature)} reached level ${creature.level}!`);
    const evolution = SPECIES[creature.speciesId].evolution;
    if (evolution && creature.level >= evolution.at) {
      const oldName = displayName(creature);
      const hpRatio = creature.hp / statsFor(creature).hp;
      creature.speciesId = evolution.into;
      creature.hp = Math.max(1, Math.round(statsFor(creature).hp * hpRatio));
      messages.push(`✦ ${oldName} evolved into ${displayName(creature)}!`);
    }
    const newest = SPECIES[creature.speciesId].learns.find(
      (entry) => entry.level === creature.level,
    );
    if (newest)
      messages.push(
        `${displayName(creature)} learned ${MOVES[newest.move].name}!`,
      );
  }
  return { creature, messages };
}
export function restoreHP(creature: Creature, amount: number): Creature {
  return {
    ...creature,
    hp: Math.min(statsFor(creature).hp, creature.hp + amount),
  };
}
