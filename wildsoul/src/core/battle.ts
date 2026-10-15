import { ITEMS, MOVES, effectiveness } from "../data/moves";
import { SPECIES } from "../data/species";
import {
  addCaptured,
  awardTrainer,
  PARTY_LIMIT,
  START_POSITION,
  STORAGE_LIMIT,
  useItem,
} from "./game";
import {
  createCreature,
  displayName,
  gainExperience,
  knownMoves,
  statsFor,
} from "./progression";
import type {
  BattleAction,
  BattleEvent,
  BattleResult,
  BattleSession,
  Creature,
  GameData,
  Move,
} from "./types";

const clamp = (x: number, min: number, max: number) =>
  Math.max(min, Math.min(max, x));
export type Random = () => number;
const message = (
  text: string,
  kind: BattleEvent["kind"] = "info",
  target?: BattleEvent["target"],
): BattleEvent => ({ text, kind, target });

export function startWildBattle(
  data: GameData,
  speciesId: string,
  level: number,
  spawnId: string,
): BattleSession {
  if (!SPECIES[speciesId]) throw new Error("Unknown wildling");
  if (!data.seen.includes(speciesId)) data.seen.push(speciesId);
  const lead = data.party.find((c) => c.hp > 0);
  if (!lead) throw new Error("Your companions need rest. Visit the hearth!");
  return {
    kind: "wild",
    spawnId,
    opponent: createCreature(speciesId, level),
    activeId: lead.id,
    turn: 1,
  };
}
export function startTrainerBattle(
  data: GameData,
  trainerId = "rowan",
): BattleSession {
  const lead = data.party.find((c) => c.hp > 0);
  if (!lead) throw new Error("Your companions need rest. Visit the hearth!");
  return {
    kind: "trainer",
    trainerId,
    opponent: createCreature("breezel", 4),
    activeId: lead.id,
    turn: 1,
  };
}
export function captureChance(
  opponent: Creature,
  item: "wispVial" | "lumenVial",
): number {
  const healthFraction = clamp(opponent.hp / statsFor(opponent).hp, 0, 1);
  const strength = item === "lumenVial" ? 1.65 : 1;
  const ailment = opponent.ailment ? 1.15 : 1;
  return clamp(
    SPECIES[opponent.speciesId].capture *
      (1.03 + (1 - healthFraction) * 1.1) *
      strength *
      ailment,
    0.04,
    0.94,
  );
}
export function calculateDamage(
  attacker: Creature,
  defender: Creature,
  move: Move,
  rng: Random,
): { damage: number; multiplier: number; critical: boolean } {
  const a = statsFor(attacker);
  const d = statsFor(defender);
  const multiplier = effectiveness(
    move.affinity,
    SPECIES[defender.speciesId].affinities,
  );
  const critical = rng() < 0.09;
  const variance = 0.9 + rng() * 0.18;
  const stab = SPECIES[attacker.speciesId].affinities.includes(move.affinity)
    ? 1.12
    : 1;
  const burnt = attacker.ailment === "scorched" ? 0.83 : 1;
  return {
    damage: Math.max(
      1,
      Math.round(
        (12 + attacker.level * 1.4) *
          (move.power / 48) *
          (a.attack / (d.defense + 12)) *
          multiplier *
          variance *
          (critical ? 1.45 : 1) *
          stab *
          burnt +
          2,
      ),
    ),
    multiplier,
    critical,
  };
}

export function resolveTurn(
  source: GameData,
  original: BattleSession,
  action: BattleAction,
  rng: Random = Math.random,
): BattleResult {
  const invalid = (error: string): BattleResult => ({
    data: source,
    session: original,
    events: [],
    error,
  });
  const originalActive = source.party.find((c) => c.id === original.activeId);
  if (!originalActive?.hp) return invalid("No healthy active companion.");
  if (
    action.kind === "move" &&
    !knownMoves(originalActive).some((m) => m.id === action.moveId)
  )
    return invalid("That move is not available.");
  if (action.kind === "capture" && original.kind !== "wild")
    return invalid("A trainer’s companion cannot be captured.");
  if (
    action.kind === "capture" &&
    source.party.length >= PARTY_LIMIT &&
    source.storage.length >= STORAGE_LIMIT
  )
    return invalid(
      "The lodge is full. Move a friend before capturing another.",
    );
  if (
    (action.kind === "capture" || action.kind === "heal") &&
    source.bag[action.item] < 1
  )
    return invalid("You have none left.");
  if (
    action.kind === "heal" &&
    originalActive.hp >= statsFor(originalActive).hp &&
    !originalActive.ailment
  )
    return invalid("Already at full health.");
  if (
    action.kind === "switch" &&
    !source.party.some(
      (c) =>
        c.id === action.creatureId && c.hp > 0 && c.id !== original.activeId,
    )
  )
    return invalid("Choose another healthy companion.");
  if (action.kind === "flee" && original.kind !== "wild")
    return invalid("You cannot leave a trainer challenge.");

  const data: GameData = structuredClone(source);
  const session: BattleSession = structuredClone(original);
  const events: BattleEvent[] = [];
  const player = () => data.party.find((c) => c.id === session.activeId)!;
  const enemyMove = () => {
    const choices = knownMoves(session.opponent).filter((m) => m.power > 0);
    return choices[
      Math.min(choices.length - 1, Math.floor(rng() * choices.length))
    ];
  };
  const victory = (): BattleResult => {
    const xp = Math.round(
      (session.kind === "trainer" ? 75 : 44) * (session.opponent.level / 3),
    );
    const gained = gainExperience(player(), xp);
    data.party[data.party.findIndex((c) => c.id === session.activeId)] =
      gained.creature;
    // Evolution is a discovery and an owned species, not just a model change.
    if (!data.seen.includes(gained.creature.speciesId))
      data.seen.push(gained.creature.speciesId);
    if (!data.captured.includes(gained.creature.speciesId))
      data.captured.push(gained.creature.speciesId);
    events.push(
      message(
        `${displayName(gained.creature)} gained ${xp} experience.`,
        "victory",
      ),
    );
    gained.messages.forEach((text) => events.push(message(text, "victory")));
    if (session.kind === "trainer") {
      const first = awardTrainer(data);
      events.push(
        message(
          first
            ? "Rowan awards you 100 sunmarks and a Lumen Vial!"
            : "Rowan thanks you for the rematch.",
          "victory",
        ),
      );
    } else {
      data.gold += 12;
      events.push(message("You found 12 sunmarks in the grass.", "victory"));
    }
    return { data, session: null, events, outcome: "won" };
  };
  const defeat = (): BattleResult => {
    events.push(
      message(
        "Your team needs a rest. The village hearth carries you home.",
        "faint",
      ),
    );
    data.party.forEach((c) => {
      c.hp = Math.max(1, Math.ceil(statsFor(c).hp * 0.65));
      c.ailment = undefined;
    });
    data.player = { ...START_POSITION };
    return { data, session: null, events, outcome: "lost" };
  };
  const checkFaint = (): BattleResult | undefined => {
    if (session.opponent.hp <= 0) {
      events.push(
        message(
          `${displayName(session.opponent)} settled down!`,
          "faint",
          "opponent",
        ),
      );
      return victory();
    }
    if (player().hp <= 0) {
      const fallen = displayName(player());
      events.push(message(`${fallen} needs a rest!`, "faint", "player"));
      const next = data.party.find((c) => c.hp > 0);
      if (!next) return defeat();
      session.activeId = next.id;
      events.push(
        message(`${displayName(next)} joins the battle!`, "info", "player"),
      );
    }
    return undefined;
  };
  const strike = (
    attacker: Creature,
    defender: Creature,
    move: Move,
    target: "player" | "opponent",
  ) => {
    const attackerName = displayName(attacker);
    events.push(
      message(`${attackerName} used ${move.name}!`, "attack", target),
    );
    if (rng() >= move.accuracy) {
      events.push(message("But it missed!", "info", target));
      return;
    }
    if (move.effect === "heal") {
      const restored = Math.min(
        statsFor(attacker).hp - attacker.hp,
        Math.ceil(statsFor(attacker).hp * 0.32),
      );
      attacker.hp += restored;
      if (attacker.ailment === "scorched") attacker.ailment = undefined;
      events.push(
        message(
          restored ? `Restored ${restored} HP.` : "Already at full health.",
          "heal",
          target === "player" ? "opponent" : "player",
        ),
      );
      return;
    }
    const { damage, multiplier, critical } = calculateDamage(
      attacker,
      defender,
      move,
      rng,
    );
    defender.hp = Math.max(0, defender.hp - damage);
    events.push(
      message(
        `${damage} damage${critical ? " · critical hit!" : ""}${multiplier > 1 ? " · super effective!" : multiplier < 1 ? " · resisted" : ""}`,
        "hurt",
        target,
      ),
    );
    if (defender.hp > 0 && move.effect && rng() < (move.effectChance ?? 0)) {
      defender.ailment = move.effect === "scorch" ? "scorched" : "slowed";
      events.push(
        message(
          `${displayName(defender)} is ${defender.ailment}!`,
          "info",
          target,
        ),
      );
    }
  };
  const opponentAction = () => {
    if (session.opponent.hp <= 0) return;
    strike(session.opponent, player(), enemyMove(), "player");
    if (session.opponent.ailment === "scorched" && session.opponent.hp > 0) {
      const tick = Math.max(1, Math.ceil(statsFor(session.opponent).hp * 0.05));
      session.opponent.hp = Math.max(0, session.opponent.hp - tick);
      events.push(
        message(
          `${displayName(session.opponent)} takes ${tick} scorch damage.`,
          "hurt",
          "opponent",
        ),
      );
    }
  };
  if (action.kind === "flee") {
    events.push(
      message("You slipped away safely into the tall grass.", "info"),
    );
    return { data, session: null, events, outcome: "fled" };
  }
  if (action.kind === "capture") {
    useItem(data, action.item);
    const chance = captureChance(session.opponent, action.item);
    events.push(
      message(
        `You offered a ${ITEMS[action.item].name}…`,
        "capture",
        "opponent",
      ),
    );
    if (rng() < chance) {
      const destination = addCaptured(data, session.opponent);
      events.push(
        message(
          `${displayName(session.opponent)} bonded with you! Sent to ${destination}.`,
          "victory",
          "opponent",
        ),
      );
      if (data.quest === "return")
        events.push(
          message("Quest updated · Return to Orla at the village.", "info"),
        );
      return { data, session: null, events, outcome: "captured" };
    }
    events.push(
      message(
        "The light scattered — the wildling broke free!",
        "info",
        "opponent",
      ),
    );
    opponentAction();
  } else if (action.kind === "heal") {
    useItem(data, action.item);
    const amount = action.item === "deepTonic" ? 80 : 35;
    const restored = Math.min(amount, statsFor(player()).hp - player().hp);
    player().hp += restored;
    player().ailment = undefined;
    events.push(
      message(
        `${ITEMS[action.item].name} restored ${restored} HP and cleared ailments.`,
        "heal",
        "player",
      ),
    );
    opponentAction();
  } else if (action.kind === "switch") {
    session.activeId = action.creatureId;
    events.push(
      message(`${displayName(player())} takes the field!`, "info", "player"),
    );
    opponentAction();
  } else {
    const move = MOVES[action.moveId];
    const enemy = enemyMove();
    const ours = player();
    const ourSpeed =
      statsFor(ours).speed * (ours.ailment === "slowed" ? 0.55 : 1);
    const theirSpeed =
      statsFor(session.opponent).speed *
      (session.opponent.ailment === "slowed" ? 0.55 : 1);
    const first = ourSpeed === theirSpeed ? rng() < 0.5 : ourSpeed > theirSpeed;
    if (first) {
      strike(ours, session.opponent, move, "opponent");
      const done = checkFaint();
      if (done) return done;
      strike(session.opponent, ours, enemy, "player");
    } else {
      strike(session.opponent, ours, enemy, "player");
      if (ours.hp <= 0) {
        const done = checkFaint();
        if (done) return done;
        session.turn++; // the newly switched companion does not inherit the fainted one's move
        return { data, session, events };
      }
      strike(ours, session.opponent, move, "opponent");
    }
  }
  if (player().ailment === "scorched" && player().hp > 0) {
    const tick = Math.max(1, Math.ceil(statsFor(player()).hp * 0.05));
    player().hp = Math.max(0, player().hp - tick);
    events.push(
      message(
        `${displayName(player())} takes ${tick} scorch damage.`,
        "hurt",
        "player",
      ),
    );
  }
  const ended = checkFaint();
  if (ended) return ended;
  session.turn++;
  return { data, session, events };
}
