import { describe, expect, it } from "vitest";
import { SPECIES_LIST, STARTERS } from "../src/data/species";
import { ITEMS, MOVES, effectiveness } from "../src/data/moves";
import {
  addCaptured,
  awardTrainer,
  bagCount,
  beginQuest,
  buyItem,
  findCache,
  finishQuest,
  giftFromGuide,
  healParty,
  leadParty,
  moveToParty,
  moveToStorage,
  newGame,
  sellItem,
  PARTY_LIMIT,
  useItem,
} from "../src/core/game";
import {
  captureChance,
  resolveTurn,
  startTrainerBattle,
  startWildBattle,
} from "../src/core/battle";
import {
  createCreature,
  experienceForLevel,
  gainExperience,
  knownMoves,
  statsFor,
} from "../src/core/progression";
import { loadGame, saveGame, saveKey, validateSave } from "../src/core/save";
import type { BattleSession, GameData } from "../src/core/types";
import { CAVE_TRAIL, createEnvironment } from "../src/world/terrain";

describe("explorable terrain", () => {
  it.each(["low", "high"] as const)(
    "keeps the marked forest-to-cave trail open with %s-quality scenery",
    (quality) => {
      const { colliders } = createEnvironment(quality);
      for (let i = 1; i < CAVE_TRAIL.length; i++) {
        const [ax, az] = CAVE_TRAIL[i - 1];
        const [bx, bz] = CAVE_TRAIL[i];
        for (let step = 0; step <= 20; step++) {
          const t = step / 20;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          for (const collider of colliders) {
            if ("radius" in collider) {
              expect(
                Math.hypot(x - collider.x, z - collider.z),
              ).toBeGreaterThan(collider.radius + 0.4);
            }
          }
        }
      }
    },
  );
});

const zero = () => 0;
const high = () => 0.999;
const memory = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    map,
  };
};

describe("original, data-driven wildlings", () => {
  it("defines twelve original species with habitats, differentiated models, stats, and usable attacks", () => {
    expect(SPECIES_LIST).toHaveLength(12);
    expect(new Set(SPECIES_LIST.map((s) => s.name)).size).toBe(12);
    expect(new Set(SPECIES_LIST.map((s) => s.shape)).size).toBe(11);
    expect(STARTERS).toHaveLength(3);
    for (const s of SPECIES_LIST) {
      expect(s.capture).toBeGreaterThan(0);
      expect(s.capture).toBeLessThan(1);
      expect(s.affinities.length).toBeGreaterThan(0);
      expect(
        s.learns.filter((m) => m.level <= 3).length,
      ).toBeGreaterThanOrEqual(2);
      expect(s.learns.every((m) => !!MOVES[m.move])).toBe(true);
      const owned = createCreature(s.id, 3, `test-${s.id}`);
      expect(statsFor(owned).hp).toBe(owned.hp);
      expect(knownMoves(owned).length).toBeGreaterThan(1);
    }
  });
  it("has meaningful affinity advantages and resisted reverse matchups", () => {
    expect(effectiveness("grove", ["tide"])).toBe(1.5);
    expect(effectiveness("tide", ["grove"])).toBe(0.75);
    expect(effectiveness("lumen", ["dusk"])).toBe(1.5);
    expect(effectiveness("tide", ["dusk"])).toBe(1);
  });
  it("levels and evolves with HP scaled and new moves unlocked", () => {
    const young = createCreature("bristlebloom", 4, "evolve");
    young.hp = 15;
    const next = gainExperience(young, experienceForLevel(5) - young.xp);
    expect(next.creature.level).toBe(5);
    expect(next.creature.speciesId).toBe("thorncrest");
    expect(next.creature.hp).toBeGreaterThan(15);
    expect(next.creature.hp).toBeLessThanOrEqual(statsFor(next.creature).hp);
    expect(knownMoves(next.creature).map((m) => m.id)).toContain("glimmer");
    expect(next.messages.join(" ")).toContain("evolved");
  });
});

describe("encounters and turn resolution", () => {
  const wild = (): [GameData, BattleSession] => {
    const data = newGame("bristlebloom");
    return [data, startWildBattle(data, "mosskip", 2, "m1")];
  };
  it("starts with a living creature and records a discovered species", () => {
    const [data, battle] = wild();
    expect(data.seen).toContain("mosskip");
    expect(battle.activeId).toBe(data.party[0].id);
    expect(battle.kind).toBe("wild");
  });
  it("damages opponents with a chosen move, logs why, and obeys speed", () => {
    const [data, battle] = wild();
    const result = resolveTurn(
      data,
      battle,
      { kind: "move", moveId: "vineWhip" },
      zero,
    );
    expect(result.error).toBeUndefined();
    expect(result.events.some((e) => e.text.includes("Vine Waltz"))).toBe(true);
    expect(result.session!.opponent.hp).toBeLessThan(battle.opponent.hp);
    expect(result.data.party[0].hp).toBeLessThan(data.party[0].hp);
    expect(data.party[0].hp).toBe(statsFor(data.party[0]).hp); // source was not mutated
  });
  it("can miss without damaging, yet the opponent acts", () => {
    const [data, battle] = wild();
    // All random results are .999: Vine Waltz can miss.
    const result = resolveTurn(
      data,
      battle,
      { kind: "move", moveId: "vineWhip" },
      high,
    );
    expect(result.events.some((e) => e.text.includes("missed"))).toBe(true);
    expect(result.session?.opponent.hp).toBe(battle.opponent.hp);
  });
  it("consumes a vial once and catches into the party, completing the catch objective", () => {
    const [data, battle] = wild();
    beginQuest(data);
    const count = data.bag.wispVial;
    battle.opponent.hp = 4;
    const result = resolveTurn(
      data,
      battle,
      { kind: "capture", item: "wispVial" },
      zero,
    );
    expect(result.outcome).toBe("captured");
    expect(result.session).toBeNull();
    expect(result.data.bag.wispVial).toBe(count - 1);
    expect(result.data.party).toHaveLength(2);
    expect(result.data.party[1].speciesId).toBe("mosskip");
    expect(result.data.captured).toContain("mosskip");
    expect(result.data.quest).toBe("return");
    expect(data.bag.wispVial).toBe(count);
  });
  it("sends a captured friend to storage instead of dropping it if party has six", () => {
    const [data, battle] = wild();
    for (let n = 1; n < PARTY_LIMIT; n++)
      data.party.push(createCreature("pumblit", 2, `filler-${n}`));
    const result = resolveTurn(
      data,
      battle,
      { kind: "capture", item: "lumenVial" },
      zero,
    );
    expect(result.outcome).toBe("captured");
    expect(result.data.party).toHaveLength(6);
    expect(result.data.storage).toHaveLength(1);
    expect(result.data.storage[0].speciesId).toBe("mosskip");
  });
  it("refuses capture before spending a vial if both party and lodge are full", () => {
    const [data, battle] = wild();
    for (let n = 1; n < PARTY_LIMIT; n++)
      data.party.push(createCreature("pumblit", 2, `party-${n}`));
    for (let n = 0; n < 300; n++)
      data.storage.push(createCreature("brooklet", 2, `stored-${n}`));
    const result = resolveTurn(
      data,
      battle,
      { kind: "capture", item: "wispVial" },
      zero,
    );
    expect(result.error).toContain("lodge is full");
    expect(result.data.bag.wispVial).toBe(5);
    expect(result.session).toBe(battle);
  });
  it("failed capture consumes vial, gives feedback, and battle continues normally", () => {
    const [data, battle] = wild();
    battle.opponent = createCreature("noxling", 5, "rare"); // rarity matters
    const chance = captureChance(battle.opponent, "wispVial");
    expect(chance).toBeLessThan(captureChance(battle.opponent, "lumenVial"));
    const result = resolveTurn(
      data,
      battle,
      { kind: "capture", item: "wispVial" },
      high,
    );
    expect(result.session).not.toBeNull();
    expect(result.outcome).toBeUndefined();
    expect(result.data.bag.wispVial).toBe(4);
    expect(result.events.some((e) => e.text.includes("broke free"))).toBe(true);
    expect(result.data.party).toHaveLength(1);
  });
  it("rejects invalid actions without consuming anything or corrupting state", () => {
    const [data, battle] = wild();
    data.bag.wispVial = 0;
    expect(
      resolveTurn(data, battle, { kind: "capture", item: "wispVial" }).error,
    ).toContain("none");
    expect(
      resolveTurn(data, battle, { kind: "heal", item: "herbTonic" }).error,
    ).toContain("full");
    expect(
      resolveTurn(data, battle, { kind: "move", moveId: "night" }).error,
    ).toContain("not available");
    expect(
      resolveTurn(data, battle, { kind: "switch", creatureId: "missing" })
        .error,
    ).toContain("healthy");
    expect(data.bag.herbTonic).toBe(3);
  });
  it("heals with a tonic, deducts one, and handles switching", () => {
    const [data, battle] = wild();
    data.party[0].hp = 9;
    const healed = resolveTurn(
      data,
      battle,
      { kind: "heal", item: "herbTonic" },
      zero,
    );
    expect(healed.data.bag.herbTonic).toBe(2);
    expect(healed.data.party[0].hp).toBeGreaterThan(9);
    const friend = createCreature("pumblit", 3, "backup");
    healed.data.party.push(friend);
    const switched = resolveTurn(
      healed.data,
      healed.session!,
      { kind: "switch", creatureId: "backup" },
      zero,
    );
    expect(switched.session?.activeId).toBe("backup");
    expect(switched.events[0].text).toContain("Pumblit");
  });
  it("resolves healing and status moves using the same data-driven engine", () => {
    const data = newGame("tidewisp");
    data.party[0].level = 4;
    data.party[0].xp = experienceForLevel(4);
    data.party[0].hp = 12;
    const battle = startWildBattle(data, "mosskip", 2, "m1");
    const healed = resolveTurn(
      data,
      battle,
      { kind: "move", moveId: "mend" },
      zero,
    );
    expect(
      healed.events.some(
        (e) => e.kind === "heal" && e.text.includes("Restored"),
      ),
    ).toBe(true);
    expect(healed.data.party[0].hp).toBeGreaterThan(12);
    const fire = newGame("cinderkin");
    fire.party[0].level = 4;
    fire.party[0].xp = experienceForLevel(4);
    const wildling = startWildBattle(fire, "pumblit", 3, "p1");
    const scorched = resolveTurn(
      fire,
      wildling,
      { kind: "move", moveId: "cinder" },
      zero,
    );
    expect(scorched.events.some((e) => e.text.includes("scorched"))).toBe(true);
  });
  it("registers an evolved species in the persistent field guide after victory", () => {
    const data = newGame("bristlebloom");
    data.party[0].level = 4;
    data.party[0].xp = experienceForLevel(5) - 1;
    const battle = startWildBattle(data, "mosskip", 2, "m1");
    battle.opponent.hp = 1;
    const result = resolveTurn(
      data,
      battle,
      { kind: "move", moveId: "vineWhip" },
      zero,
    );
    expect(result.outcome).toBe("won");
    expect(result.data.party[0].speciesId).toBe("thorncrest");
    expect(result.data.seen).toContain("thorncrest");
    expect(result.data.captured).toContain("thorncrest");
  });
  it("wild battles allow fleeing; trainer battles prohibit fleeing/capture", () => {
    const [data, battle] = wild();
    expect(resolveTurn(data, battle, { kind: "flee" }).outcome).toBe("fled");
    const trainer = startTrainerBattle(data);
    expect(resolveTurn(data, trainer, { kind: "flee" }).error).toContain(
      "cannot",
    );
    expect(
      resolveTurn(data, trainer, { kind: "capture", item: "lumenVial" }).error,
    ).toContain("cannot");
  });
  it("awards experience and rewards exactly once for trainer victory / rematch", () => {
    const data = newGame("cinderkin");
    const first = startTrainerBattle(data);
    first.opponent.hp = 1;
    const result = resolveTurn(
      data,
      first,
      { kind: "move", moveId: "emberDash" },
      zero,
    );
    expect(result.outcome).toBe("won");
    expect(result.data.flags.trainerWon).toBe(true);
    expect(result.data.gold).toBe(190);
    expect(result.data.bag.lumenVial).toBe(2);
    expect(result.data.party[0].xp).toBeGreaterThan(data.party[0].xp);
    const second = startTrainerBattle(result.data);
    second.opponent.hp = 1;
    const rematch = resolveTurn(
      result.data,
      second,
      { kind: "move", moveId: "emberDash" },
      zero,
    );
    expect(rematch.data.gold).toBe(190);
    expect(rematch.data.bag.lumenVial).toBe(2);
  });
  it("recovers from team defeat without a dead-end and keeps trainer uncleared", () => {
    const data = newGame("bristlebloom");
    data.party[0].hp = 1;
    const trainer = startTrainerBattle(data);
    trainer.opponent.level = 20;
    const result = resolveTurn(
      data,
      trainer,
      { kind: "move", moveId: "vineWhip" },
      zero,
    );
    expect(result.outcome).toBe("lost");
    expect(result.session).toBeNull();
    expect(result.data.party[0].hp).toBeGreaterThan(0);
    expect(result.data.player.x).toBe(-12);
    expect(result.data.flags.trainerWon).toBe(false);
  });
});

describe("party, rewards, supplies and persistence", () => {
  it("rearranges a party, stores and retrieves without losing or duplicating anyone", () => {
    const data = newGame("tidewisp");
    const second = createCreature("mosskip", 2, "second");
    addCaptured(data, second);
    expect(leadParty(data, "second")).toBe(true);
    expect(data.party[0].id).toBe("second");
    expect(moveToStorage(data, "second")).toBeNull();
    expect(data.storage).toHaveLength(1);
    expect(moveToStorage(data, data.party[0].id)).toContain("at least one");
    expect(moveToParty(data, "second")).toBeNull();
    expect(data.storage).toHaveLength(0);
    expect(() => addCaptured(data, second)).toThrow("Duplicate");
  });
  it("prevents repeat gift, quest reward, cache and trainer reward", () => {
    const data = newGame("bristlebloom");
    const before = data.bag.wispVial;
    expect(giftFromGuide(data)).toBe(true);
    expect(giftFromGuide(data)).toBe(false);
    expect(data.bag.wispVial).toBe(before + 2);
    expect(beginQuest(data)).toBe(true);
    expect(beginQuest(data)).toBe(false);
    addCaptured(data, createCreature("mosskip", 2, "quest"));
    expect(finishQuest(data)).toBe(true);
    const gold = data.gold;
    expect(finishQuest(data)).toBe(false);
    expect(data.gold).toBe(gold);
    expect(findCache(data, "field-cache", "wispVial")).toBe(true);
    expect(findCache(data, "field-cache", "wispVial")).toBe(false);
    expect(awardTrainer(data)).toBe(true);
    expect(awardTrainer(data)).toBe(false);
  });
  it("enforces currency, nonnegative items, bag capacity, and healing", () => {
    const data = newGame("tidewisp");
    data.gold = 0;
    expect(buyItem(data, "deepTonic")).toContain("sunmarks");
    expect(sellItem(data, "deepTonic")).toContain("do not");
    expect(useItem(data, "deepTonic")).toBe(false);
    expect(data.bag.deepTonic).toBe(0);
    data.gold = 500;
    expect(buyItem(data, "deepTonic")).toBeNull();
    expect(data.gold).toBe(445);
    expect(sellItem(data, "deepTonic")).toBeNull();
    expect(data.gold).toBe(467);
    data.bag.wispVial = 36;
    data.bag.herbTonic = 3;
    data.bag.lumenVial = 1;
    expect(bagCount(data)).toBe(40);
    expect(buyItem(data, "wispVial")).toContain("full");
    data.party[0].hp = 1;
    healParty(data);
    expect(data.party[0].hp).toBe(statsFor(data.party[0]).hp);
  });
  it("saves and reloads full progress, falls back to valid backup, rejects malformed saves", () => {
    const storage = memory();
    const data = newGame("bristlebloom");
    data.player.x = 18;
    data.player.z = -8;
    data.party.push(createCreature("mosskip", 2, "save-test"));
    data.quest = "return";
    data.flags.trainerWon = true;
    data.gold = 304;
    data.visited.push("forest");
    data.settings.volume = 0.15;
    expect(saveGame(data, storage)).toBe(true);
    const loaded = loadGame(storage)!;
    expect(loaded).toEqual(data);
    expect(loaded).not.toBe(data);
    expect(validateSave({ ...data, gold: -1 })).toBe(false);
    expect(saveGame({ ...data, gold: -1 }, storage)).toBe(false);
    expect(loadGame(storage)?.gold).toBe(304);
    saveGame(data, storage);
    storage.setItem(saveKey(), "{corrupted");
    expect(loadGame(storage)?.quest).toBe("return");
    storage.setItem(`${saveKey()}.backup`, "{corrupted");
    expect(loadGame(storage)).toBeNull();
    expect(Object.keys(ITEMS)).toHaveLength(4);
  });
});
