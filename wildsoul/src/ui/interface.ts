import type {
  BattleEvent,
  BattleSession,
  Creature,
  GameData,
  ItemId,
} from "../core/types";
import {
  experienceForLevel,
  displayName,
  knownMoves,
  statsFor,
} from "../core/progression";
import { BAG_LIMIT, bagCount } from "../core/game";
import { AFFINITY, ITEMS } from "../data/moves";
import { SPECIES, SPECIES_LIST, STARTERS } from "../data/species";
import { NPCS, type Interactable } from "../world/world";
import { portraitOf } from "../world/portraits";
import { icon, esc } from "./icons";
import { paintMap } from "./map";

export type UIAction = (action: string, data: DOMStringMap) => void;
type PanelName =
  "party" | "bag" | "quest" | "map" | "menu" | "settings" | "shop" | null;
export interface Dialogue {
  eyebrow: string;
  title: string;
  text: string;
  actions: { label: string; action: string; primary?: boolean }[];
}

const progress = (value: number, max: number) =>
  Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
const affinityTags = (types: string[]) =>
  types
    .map(
      (t) =>
        `<span class="type-tag" style="--type-color:${AFFINITY[t as keyof typeof AFFINITY].color}">${AFFINITY[t as keyof typeof AFFINITY].glyph} ${AFFINITY[t as keyof typeof AFFINITY].label}</span>`,
    )
    .join("");
function portrait(speciesId: string, className = "") {
  const s = SPECIES[speciesId];
  const image = portraitOf(speciesId);
  return `<span class="creature-portrait ${className}" style="--portrait-color:${s.color};--portrait-accent:${s.accent}">${
    image
      ? `<img src="${image}" alt="${esc(s.name)} model" draggable="false"/>`
      : `<span class="portrait-fallback">${AFFINITY[s.affinities[0]].glyph}</span>`
  }</span>`;
}
function objective(data: GameData): {
  title: string;
  subtitle: string;
  x: number;
  z: number;
} {
  if (data.quest === "unstarted")
    return {
      title: "The First Light",
      subtitle: "Speak with Orla in Thimblewick",
      x: NPCS.researcher.x,
      z: NPCS.researcher.z,
    };
  if (data.quest === "catch")
    return {
      title: "A new friend awaits",
      subtitle: "Bond with a wildling in the fields",
      x: -7,
      z: -2,
    };
  if (data.quest === "return")
    return {
      title: "The First Light",
      subtitle: "Return to Orla for your reward",
      x: NPCS.researcher.x,
      z: NPCS.researcher.z,
    };
  if (!data.flags.trainerWon)
    return {
      title: "A friendly challenge",
      subtitle: "Find Rowan on the southern trail",
      x: NPCS.trainer.x,
      z: NPCS.trainer.z,
    };
  return {
    title: "Follow your own path",
    subtitle: "Explore Whisperwood & Echo Cave",
    x: 26,
    z: -20,
  };
}

export class GameUI {
  readonly canvasHost: HTMLElement;
  readonly mobile: HTMLElement;
  private readonly root: HTMLElement;
  private readonly onAction: UIAction;
  private screen: "menu" | "starter" | "explore" | "battle" = "menu";
  private panel: PanelName = null;
  private partyTab: "party" | "storage" | "journal" = "party";
  private battleTab: "moves" | "vials" | "tonics" | "switch" = "moves";
  private selectedId: string | null = null;
  private itemTarget: ItemId | null = null;
  private search = "";
  private filter = "all";
  private sort = "number";
  private dialogue: Dialogue | null = null;
  private outcome: string | null = null;
  private log: BattleEvent[] = [];
  private lastData: GameData | null = null;
  private lastBattle: BattleSession | null = null;
  private hadSave = false;
  constructor(root: HTMLElement, onAction: UIAction) {
    this.root = root;
    this.onAction = onAction;
    root.innerHTML = `
      <main class="game-shell" aria-label="Vesperglen game">
        <div id="scene-host" class="scene-host" aria-label="3D game world"></div>
        <div class="world-vignette" aria-hidden="true"></div>
        <div id="hud" class="hud" hidden>
          <div class="hud-top">
            <div class="brand-chip"><span class="brand-symbol">✣</span><span><strong>VESPERGLEN</strong><small id="region-label">HOLLOW VALE</small></span></div>
            <div class="quest-compass" id="quest-compass"></div>
            <div class="hud-currency" id="hud-currency"></div>
          </div>
          <div class="hud-left"><div class="map-frame"><canvas id="minimap" width="180" height="180" aria-label="Minimap"></canvas><span class="map-n">N</span></div><button class="mini-map-expand" data-action="panel" data-id="map" aria-label="Open world map">${icon("map", 17)} MAP</button></div>
          <div class="hud-right" id="hud-nav">
            <button data-action="panel" data-id="party" aria-label="Open companions">${icon("creatures")}<span>COMPANIONS</span></button>
            <button data-action="panel" data-id="bag" aria-label="Open bag">${icon("satchel")}<span>BAG</span></button>
            <button data-action="panel" data-id="quest" aria-label="Open journal">${icon("journal")}<span>JOURNAL</span></button>
            <button data-action="panel" data-id="menu" aria-label="Pause menu">${icon("menu")}<span>MENU</span></button>
          </div>
          <div id="interact-prompt" class="interact-prompt" hidden></div>
          <div class="hud-bottom-hint"><span class="keycap">W A S D</span> MOVE &nbsp; <span class="keycap">DRAG</span> LOOK &nbsp; <span class="keycap">E</span> INTERACT <span class="hint-extra"> &nbsp; <span class="keycap">SHIFT</span> RUN &nbsp; <span class="keycap">SPACE</span> JUMP</span></div>
        </div>
        <div class="touch-controls" id="touch-controls" hidden>
          <div id="joystick" class="joystick" aria-label="Movement joystick"><div class="joystick-knob"></div></div>
          <div class="touch-actions"><button id="run-button" class="touch-round touch-run" aria-label="Hold to run">↟<small>RUN</small></button><button id="jump-button" class="touch-round" aria-label="Jump">⤒<small>JUMP</small></button><button id="touch-interact" class="touch-round touch-interact" data-action="interact" aria-label="Interact">✦<small>ACT</small></button></div>
        </div>
        <div id="screen-layer" class="screen-layer"></div>
        <div id="battle-layer" class="battle-layer" hidden></div>
        <div id="panel-layer" class="panel-layer" hidden></div>
        <div id="dialogue-layer" class="dialogue-layer" hidden></div>
        <div id="toast-layer" class="toast-layer" aria-live="polite"></div>
      </main>`;
    this.canvasHost = root.querySelector("#scene-host")!;
    this.mobile = root.querySelector("#touch-controls")!;
    root.addEventListener("click", (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>(
        "button[data-action]",
      );
      if (!button || button.disabled) return;
      const action = button.dataset.action!;
      if (action === "panel") {
        this.togglePanel(button.dataset.id as PanelName);
        return;
      }
      if (action === "close-panel") {
        this.closePanel();
        return;
      }
      if (action === "party-tab") {
        this.partyTab = button.dataset.id as typeof this.partyTab;
        this.selectedId = null;
        this.renderPanel();
        return;
      }
      if (action === "battle-tab") {
        this.battleTab = button.dataset.id as typeof this.battleTab;
        this.renderBattle();
        return;
      }
      if (action === "select-creature") {
        this.selectedId = button.dataset.id!;
        this.renderPanel();
        return;
      }
      if (action === "dialogue-close") {
        this.closeDialogue();
        return;
      }
      if (action === "choose-item-target") {
        this.itemTarget = button.dataset.id as ItemId;
        this.partyTab = "party";
        this.setPanel("party");
        return;
      }
      if (action === "cancel-item-target") {
        this.itemTarget = null;
        this.renderPanel();
        return;
      }
      this.onAction(action, button.dataset);
    });
    root.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.id === "field-search") {
        this.search = target.value;
        const cursor = target.selectionStart;
        this.renderPanel();
        const next = root.querySelector<HTMLInputElement>("#field-search");
        next?.focus();
        next?.setSelectionRange(cursor, cursor);
      }
      if (target.id === "volume" || target.id === "sensitivity")
        this.onAction("setting", {
          id: target.id,
          value: target.value,
        } as DOMStringMap);
    });
    root.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.id === "field-filter") {
        this.filter = target.value;
        this.renderPanel();
      }
      if (target.id === "field-sort") {
        this.sort = target.value;
        this.renderPanel();
      }
      if (target.id === "quality" || target.id === "invert")
        this.onAction("setting", {
          id: target.id,
          value:
            target instanceof HTMLInputElement
              ? String(target.checked)
              : target.value,
        } as DOMStringMap);
    });
  }
  get activeScreen() {
    return this.screen;
  }
  get activePanel() {
    return this.panel;
  }
  get hasDialogue() {
    return !!this.dialogue;
  }
  get itemToUse() {
    return this.itemTarget;
  }
  clearItemTarget() {
    this.itemTarget = null;
  }
  private layer(id: string): HTMLElement {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  private hud(visible: boolean) {
    this.layer("hud").hidden = !visible;
    this.mobile.hidden = !visible || this.screen !== "explore";
  }
  showMenu(hasSave: boolean) {
    this.hadSave = hasSave;
    this.screen = "menu";
    this.panel = null;
    this.dialogue = null;
    this.outcome = null;
    this.hud(false);
    this.layer("panel-layer").hidden = true;
    this.layer("battle-layer").hidden = true;
    this.layer("dialogue-layer").hidden = true;
    this.layer("screen-layer").innerHTML = `<div class="title-screen">
      <div class="title-mark">✣ &nbsp; A NEW WORLD AWAITS &nbsp; ✣</div>
      <div class="title-content"><p class="title-overline">AN ORIGINAL CREATURE ADVENTURE</p><h1>VESPER<span>GLEN</span></h1><p class="title-subtitle">THE FIRST LIGHT</p>
        <div class="title-rule"><span>❧</span></div><p class="title-blurb">The valley remembers every friendship.<br/>Find yours beyond the village gates.</p>
        <div class="title-buttons"><button class="btn btn-primary btn-large" data-action="new-game">BEGIN YOUR JOURNEY ${icon("arrow", 19)}</button>
          <button class="btn btn-ghost btn-large" data-action="continue" ${hasSave ? "" : "disabled"}>${icon("save", 18)} CONTINUE JOURNEY</button></div>
        <p class="title-note">${hasSave ? "A saved journey was found on this device." : "No journey saved yet. Progress stays on this device."}</p>
      </div><div class="title-footer"><span>✦ &nbsp; HOLLOW VALE</span><span>CHAPTER ONE · PLAYABLE DEMO</span><span>MADE FOR EXPLORING</span></div>
    </div>`;
  }
  showStarters() {
    this.screen = "starter";
    this.hud(false);
    this.layer("screen-layer").innerHTML =
      `<section class="starter-screen"><button class="back-link" data-action="back-menu">← BACK TO TITLE</button>
      <div class="starter-heading"><span class="eyebrow">CHAPTER 01 / THE FIRST LIGHT</span><h2>Every story begins<br/><em>with a friend.</em></h2>
      <p>Orla has three young wildlings waiting for a travelling companion. Who will walk beside you?</p></div>
      <div class="starter-grid">${STARTERS.map((id) => {
        const s = SPECIES[id];
        return `<article class="starter-card" style="--card-accent:${s.color};--card-light:${s.accent}">
          <div class="starter-card-art">${portrait(id, "starter-portrait")}<span class="starter-number">0${STARTERS.indexOf(id) + 1} / 03</span></div>
          <div class="starter-card-body">${affinityTags(s.affinities)}<h3>${s.name}</h3><p>${esc(s.description)}</p>
          <button class="btn btn-card" data-action="pick-starter" data-id="${id}">CHOOSE ${s.name.toUpperCase()} ${icon("arrow", 17)}</button></div></article>`;
      }).join(
        "",
      )}</div><div class="starter-footer">${this.hadSave ? "Choosing a companion starts a new journey and replaces the existing save." : "Your journey will save automatically as you explore."}</div>
    </section>`;
  }
  showExplore(data: GameData) {
    this.lastData = data;
    this.screen = "explore";
    this.panel = null;
    this.outcome = null;
    this.layer("screen-layer").innerHTML = "";
    this.layer("battle-layer").hidden = true;
    this.layer("panel-layer").hidden = true;
    this.hud(true);
    this.updateHUD(data, null, "Thimblewick", 0);
  }
  updateHUD(
    data: GameData,
    nearby: Interactable | null,
    region: string,
    seconds: number,
  ) {
    if (this.screen !== "explore") return;
    this.lastData = data;
    // Lightweight observable position for accessibility tooling and browser smoke tests.
    this.layer("hud").dataset.playerX = data.player.x.toFixed(2);
    this.layer("hud").dataset.playerZ = data.player.z.toFixed(2);
    const objectiveNow = objective(data);
    const distance = Math.round(
      Math.hypot(
        objectiveNow.x - data.player.x,
        objectiveNow.z - data.player.z,
      ),
    );
    this.layer("region-label").textContent = region.toUpperCase();
    this.layer("hud-currency").innerHTML =
      `${icon("coin", 18)} <strong>${data.gold}</strong> <span>SUNMARKS</span>`;
    this.layer("quest-compass").innerHTML =
      `<span class="compass-flower">✦</span><span><small>YOUR WAY FORWARD</small><strong>${esc(objectiveNow.subtitle)}</strong></span><em>${distance}m</em>`;
    const prompt = this.layer("interact-prompt");
    prompt.hidden = !nearby;
    if (nearby)
      prompt.innerHTML = `<span class="prompt-key">E</span><span>${esc(nearby.label)}</span><button data-action="interact" aria-label="${esc(nearby.label)}">${icon("arrow", 16)}</button>`;
    const map = this.root.querySelector<HTMLCanvasElement>("#minimap");
    if (map) paintMap(map, data);
    const day = Math.floor(seconds / 360) + 1;
    this.layer("region-label").textContent =
      `${region.toUpperCase()}  ·  DAY ${day.toString().padStart(2, "0")}`;
  }
  showBattle(
    data: GameData,
    session: BattleSession,
    events: BattleEvent[] = [],
    outcome: string | null = null,
  ) {
    this.screen = "battle";
    this.lastData = data;
    this.lastBattle = session;
    this.log = [...events];
    this.outcome = outcome;
    this.panel = null;
    this.dialogue = null;
    this.battleTab = "moves";
    this.hud(false);
    this.layer("screen-layer").innerHTML = "";
    this.layer("panel-layer").hidden = true;
    this.layer("dialogue-layer").hidden = true;
    this.layer("battle-layer").hidden = false;
    this.renderBattle();
  }
  updateBattle(
    data: GameData,
    session: BattleSession,
    events: BattleEvent[],
    outcome: string | null,
  ) {
    this.lastData = data;
    this.lastBattle = session;
    this.log = events;
    this.outcome = outcome;
    this.renderBattle();
  }
  private renderBattle() {
    if (this.screen !== "battle" || !this.lastData || !this.lastBattle) return;
    const data = this.lastData,
      session = this.lastBattle;
    const active =
      data.party.find((c) => c.id === session.activeId) || data.party[0];
    const opponent = session.opponent;
    const card = (creature: Creature, side: string) => {
      const s = SPECIES[creature.speciesId];
      return `<div class="combat-card combat-${side}"><div class="combat-name"><span>${esc(displayName(creature))} <small>LV ${creature.level}</small></span>${affinityTags(s.affinities)}</div>
        <div class="hp-track"><span style="width:${progress(creature.hp, statsFor(creature).hp)}%;background:${creature.hp / statsFor(creature).hp < 0.3 ? "#e59c80" : "#92ceb0"}"></span></div><div class="hp-caption">HP ${creature.hp} / ${statsFor(creature).hp}${creature.ailment ? ` <b class="ailment">${esc(creature.ailment)}</b>` : ""}</div></div>`;
    };
    const tabs = [
      ["moves", "✦", "MOVES"],
      ["vials", "◈", "VIALS"],
      ["tonics", "✚", "TONICS"],
      ["switch", "↝", "SWITCH"],
    ];
    let choices = "";
    if (this.battleTab === "moves")
      choices = `<div class="moves-grid">${knownMoves(active)
        .map(
          (m) =>
            `<button class="battle-move" data-action="battle-move" data-id="${m.id}" style="--move-color:${AFFINITY[m.affinity].color}"><span class="move-icon">${AFFINITY[m.affinity].glyph}</span><span><b>${esc(m.name)}</b><small>${AFFINITY[m.affinity].label.toUpperCase()} · ${m.power ? `POWER ${m.power}` : "HEAL"}</small></span>${icon("chevron", 16)}</button>`,
        )
        .join("")}</div>`;
    if (this.battleTab === "vials")
      choices = `<div class="battle-items">${(["wispVial", "lumenVial"] as const).map((id) => `<button data-action="battle-capture" data-id="${id}" ${data.bag[id] ? "" : "disabled"}><span class="item-glyph" style="color:${ITEMS[id].color}">${ITEMS[id].icon}</span><span><b>${ITEMS[id].name}</b><small>${ITEMS[id].description}</small></span><strong>×${data.bag[id]}</strong></button>`).join("")}<p class="battle-tip">Lower health and a brighter vial improve your chance. Trainer companions cannot be captured.</p></div>`;
    if (this.battleTab === "tonics")
      choices = `<div class="battle-items">${(["herbTonic", "deepTonic"] as const).map((id) => `<button data-action="battle-heal" data-id="${id}" ${data.bag[id] ? "" : "disabled"}><span class="item-glyph" style="color:${ITEMS[id].color}">${ITEMS[id].icon}</span><span><b>${ITEMS[id].name}</b><small>${ITEMS[id].description}</small></span><strong>×${data.bag[id]}</strong></button>`).join("")}</div>`;
    if (this.battleTab === "switch")
      choices = `<div class="battle-items">${data.party.map((c) => `<button data-action="battle-switch" data-id="${c.id}" ${c.hp && c.id !== active.id ? "" : "disabled"}>${portrait(c.speciesId, "portrait-tiny")}<span><b>${esc(displayName(c))}</b><small>LV ${c.level} · ${c.hp} / ${statsFor(c).hp} HP</small></span>${icon("chevron", 18)}</button>`).join("")}</div>`;
    const title =
      this.outcome === "captured"
        ? "A new bond is born"
        : this.outcome === "won"
          ? "The vale celebrates you"
          : this.outcome === "lost"
            ? "Rest at the hearth"
            : "Safe travels";
    this.layer("battle-layer").innerHTML =
      `<div class="combat-top"><div class="combat-backdrop-label">${session.kind === "trainer" ? "✦ WAYFARER CHALLENGE" : "✦ WILD ENCOUNTER"}<small> TURN ${session.turn}</small></div><button class="battle-pause" data-action="panel" data-id="menu" aria-label="Pause battle">${icon("menu", 22)}</button></div>
      ${card(opponent, "opponent")}${card(active, "player")}
      <div class="combat-bottom"><div class="combat-log"><span class="combat-log-star">✧</span><div class="combat-log-lines">${
        this.log.length
          ? this.log
              .slice(-5)
              .map((e) => `<span>${esc(e.text)}</span>`)
              .join("")
          : `<span>${session.kind === "trainer" ? "Rowan steps forward with Breezel. The challenge begins!" : `A wild ${SPECIES[opponent.speciesId].name} appeared!`}</span>`
      }</div></div>
        ${
          this.outcome
            ? `<div class="battle-finale"><div class="eyebrow">${this.outcome.toUpperCase()} · BATTLE COMPLETE</div><h2>${title}</h2><div class="finale-events">${this.log
                .filter(
                  (e) =>
                    e.kind === "victory" ||
                    e.kind === "faint" ||
                    e.kind === "info",
                )
                .map((e) => `<p>✦ ${esc(e.text)}</p>`)
                .join(
                  "",
                )}</div><button class="btn btn-primary" data-action="finish-battle">RETURN TO THE VALE ${icon("arrow", 18)}</button></div>`
            : `<div class="combat-actions"><div class="combat-panel-heading"><span><small>YOUR COMPANION</small><strong>${esc(displayName(active))}, what will you do?</strong></span><button class="flee-btn" data-action="battle-flee" ${session.kind === "trainer" ? 'disabled title="Cannot flee a trainer battle"' : ""}>↩ RETREAT</button></div><div class="combat-tabs">${tabs.map(([id, glyph, name]) => `<button data-action="battle-tab" data-id="${id}" class="${this.battleTab === id ? "active" : ""}">${glyph} <span>${name}</span></button>`).join("")}</div>${choices}</div>`
        }
      </div>`;
  }
  openDialogue(dialogue: Dialogue) {
    this.dialogue = dialogue;
    this.layer("dialogue-layer").hidden = false;
    this.layer("dialogue-layer").innerHTML =
      `<div class="dialogue-shade" data-backdrop="true"></div><section class="dialogue-box" role="dialog" aria-label="Dialogue">
      <div class="dialogue-portrait">✦</div><div class="dialogue-content"><span class="eyebrow">${esc(dialogue.eyebrow)}</span><h2>${esc(dialogue.title)}</h2><p>${esc(dialogue.text)}</p>
      <div class="dialogue-actions">${dialogue.actions.map((a) => `<button class="btn ${a.primary ? "btn-primary" : "btn-ghost"}" data-action="${a.action}">${esc(a.label)} ${a.primary ? icon("arrow", 17) : ""}</button>`).join("")}
      <button class="btn btn-text" data-action="dialogue-close">CLOSE</button></div></div></section>`;
  }
  closeDialogue() {
    this.dialogue = null;
    this.layer("dialogue-layer").hidden = true;
    this.layer("dialogue-layer").innerHTML = "";
  }
  togglePanel(name: PanelName) {
    if (!name || (this.screen !== "explore" && this.screen !== "battle"))
      return;
    if (this.panel === name) {
      this.closePanel();
      return;
    }
    this.setPanel(name);
  }
  setPanel(name: PanelName) {
    this.panel = name;
    this.closeDialogue();
    this.renderPanel();
  }
  closePanel() {
    this.panel = null;
    this.itemTarget = null;
    this.layer("panel-layer").hidden = true;
    this.layer("panel-layer").innerHTML = "";
  }
  refresh(data: GameData) {
    this.lastData = data;
    if (this.panel) this.renderPanel();
  }
  private renderPanel() {
    if (!this.panel || !this.lastData) return;
    const data = this.lastData;
    const titles: Record<NonNullable<PanelName>, [string, string]> = {
      party: ["The Companions", "EVERY FRIEND HAS A STORY"],
      bag: ["Your Satchel", "TOOLS FOR THE ROAD"],
      quest: ["Field Journal", "THE TALES WE CARRY"],
      map: ["Hollow Vale", "A LITTLE WORLD TO DISCOVER"],
      menu: ["A Moment to Breathe", "PAUSED"],
      settings: ["Make It Yours", "PREFERENCES"],
      shop: ["Fen’s Trading Post", "GOOD THINGS FOR GOOD JOURNEYS"],
    };
    let content = "";
    switch (this.panel) {
      case "party":
        content = this.renderParty(data);
        break;
      case "bag":
        content = this.renderBag(data);
        break;
      case "quest":
        content = this.renderQuest(data);
        break;
      case "map":
        content = this.renderMap(data);
        break;
      case "menu":
        content = this.renderMenu(data);
        break;
      case "settings":
        content = this.renderSettings(data);
        break;
      case "shop":
        content = this.renderShop(data);
        break;
    }
    const [title, eyebrow] = titles[this.panel];
    this.layer("panel-layer").hidden = false;
    this.layer("panel-layer").innerHTML =
      `<div class="panel-backdrop"></div><section class="panel" role="dialog" aria-label="${title}">
      <header class="panel-header"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div><button class="icon-button" data-action="close-panel" aria-label="Close panel">${icon("cross", 22)}</button></header>
      <div class="panel-scroll">${content}</div>
      <footer class="panel-footer"><span>✣ &nbsp; VESPERGLEN · THE FIRST LIGHT</span><span>ESC TO CLOSE</span></footer></section>`;
    if (this.panel === "map") {
      const canvas = this.root.querySelector<HTMLCanvasElement>("#fullmap");
      if (canvas) paintMap(canvas, data, true);
    }
  }
  private renderParty(data: GameData) {
    const tabs = [
      ["party", `PARTY · ${data.party.length}/6`],
      ["storage", `STORAGE · ${data.storage.length}`],
      ["journal", `FIELD GUIDE · ${data.seen.length}/12`],
    ] as const;
    const list = this.partyTab === "party" ? data.party : data.storage;
    const selected = [...data.party, ...data.storage].find(
      (c) => c.id === this.selectedId,
    );
    let body = "";
    if (this.partyTab === "journal") {
      let species = SPECIES_LIST.filter(
        (s) =>
          data.seen.includes(s.id) &&
          (!this.search ||
            s.name.toLowerCase().includes(this.search.toLowerCase())) &&
          (this.filter === "all" ||
            s.affinities.includes(this.filter as keyof typeof AFFINITY)),
      );
      if (this.sort === "name")
        species = [...species].sort((a, b) => a.name.localeCompare(b.name));
      if (this.sort === "rarity")
        species = [...species].sort(
          (a, b) =>
            ["rare", "uncommon", "common"].indexOf(a.rarity) -
            ["rare", "uncommon", "common"].indexOf(b.rarity),
        );
      body = `<div class="journal-toolbar"><input id="field-search" type="search" placeholder="Search discovered wildlings..." value="${esc(this.search)}" aria-label="Search wildlings"/><select id="field-filter" aria-label="Filter by affinity"><option value="all">All affinities</option>${Object.entries(
        AFFINITY,
      )
        .map(
          ([id, val]) =>
            `<option value="${id}" ${this.filter === id ? "selected" : ""}>${val.label}</option>`,
        )
        .join(
          "",
        )}</select><select id="field-sort" aria-label="Sort wildlings"><option value="number" ${this.sort === "number" ? "selected" : ""}>Field order</option><option value="name" ${this.sort === "name" ? "selected" : ""}>Name</option><option value="rarity" ${this.sort === "rarity" ? "selected" : ""}>Rarity</option></select></div>
        <p class="section-intro">${data.seen.length} of ${SPECIES_LIST.length} wildlings discovered · ${data.captured.length} species befriended</p>
        <div class="field-grid">${species.map((s) => `<article class="field-card">${portrait(s.id)}<div><span class="eyebrow">${s.rarity.toUpperCase()} · ${s.habitat.toUpperCase()}</span><h3>${s.name}</h3><p>${data.captured.includes(s.id) ? "✦ BEFRIENDED" : "○ OBSERVED"}</p></div></article>`).join("") || `<div class="empty-state">No wildlings match your search.</div>`}</div><p class="muted-note">Unseen wildlings are hidden until you encounter them in the world.</p>`;
    } else if (this.itemTarget) {
      body = `<div class="notice-banner">Choose a companion to receive a ${ITEMS[this.itemTarget].name}. <button data-action="cancel-item-target">CANCEL</button></div>
      <div class="creature-list">${data.party.map((c) => `<button class="creature-row" data-action="heal-outside" data-id="${c.id}" ${c.hp >= statsFor(c).hp && !c.ailment ? "disabled" : ""}>${portrait(c.speciesId, "portrait-small")}<span><b>${esc(displayName(c))}</b><small>LV ${c.level} · ${c.hp}/${statsFor(c).hp} HP</small></span>${icon("heart", 18)}</button>`).join("")}</div>`;
    } else {
      body = `<p class="section-intro">${this.partyTab === "party" ? "Your travelling companions. Choose a lead or inspect a friend." : "Friends beyond your travelling party stay safely in the lodge."}</p>
        <div class="companion-layout"><div class="creature-list">${
          list
            .map((c) => {
              const s = SPECIES[c.speciesId];
              return `<button class="creature-row ${this.selectedId === c.id ? "selected" : ""}" data-action="select-creature" data-id="${c.id}">${portrait(c.speciesId, "portrait-small")}
            <span class="creature-row-main"><b>${esc(displayName(c))} <em>LV ${c.level}</em></b><small>${s.affinities.map((t) => AFFINITY[t].label).join(" / ")} · ${s.rarity}</small><span class="row-hp"><span style="width:${progress(c.hp, statsFor(c).hp)}%"></span></span></span><small class="creature-hp">${c.hp}/${statsFor(c).hp} HP</small></button>`;
            })
            .join("") ||
          `<div class="empty-state">No companions in storage yet. When your party reaches six, new friends arrive here.</div>`
        }</div>
        <div class="creature-detail">${selected ? this.creatureDetail(selected, data) : `<div class="detail-empty"><span>✧</span><h3>A story waiting to unfold</h3><p>Choose a companion to see its story, strengths and available moves.</p></div>`}</div></div>`;
    }
    return `<div class="tabs">${tabs.map(([id, name]) => `<button data-action="party-tab" data-id="${id}" class="${this.partyTab === id ? "active" : ""}">${name}</button>`).join("")}</div>${body}`;
  }
  private creatureDetail(c: Creature, data: GameData) {
    const s = SPECIES[c.speciesId],
      stats = statsFor(c),
      xpStart = experienceForLevel(c.level),
      xpNext = experienceForLevel(c.level + 1);
    const inParty = data.party.some((p) => p.id === c.id);
    return `<div class="detail-hero" style="--detail-color:${s.color}">${portrait(c.speciesId, "portrait-detail")}<div><span class="eyebrow">${s.rarity.toUpperCase()} · ${s.habitat.toUpperCase()}</span><h3>${esc(displayName(c))}</h3>${affinityTags(s.affinities)}<p>${esc(s.description)}</p></div></div>
      <div class="detail-progress"><span>HEALTH <b>${c.hp} / ${stats.hp}</b></span><div class="hp-track"><span style="width:${progress(c.hp, stats.hp)}%"></span></div>
      <span>EXPERIENCE TO LV ${c.level + 1}<b>${Math.max(0, xpNext - c.xp)} XP</b></span><div class="xp-track"><span style="width:${progress(c.xp - xpStart, xpNext - xpStart)}%"></span></div></div>
      <div class="stat-trio"><span>ATTACK <b>${stats.attack}</b></span><span>DEFENSE <b>${stats.defense}</b></span><span>SPEED <b>${stats.speed}</b></span></div>
      <h4 class="detail-label">KNOWN MOVES</h4><div class="move-list">${knownMoves(
        c,
      )
        .map(
          (m) =>
            `<div><span style="color:${AFFINITY[m.affinity].color}">${AFFINITY[m.affinity].glyph}</span><b>${m.name}</b><small>${m.power || "HEAL"} ${m.power ? "PWR" : ""}</small></div>`,
        )
        .join("")}</div>
      ${s.evolution ? `<p class="evo-hint">✦ Evolves at level ${s.evolution.at} into ${SPECIES[s.evolution.into].name}</p>` : ""}
      <div class="detail-actions">${inParty ? `<button class="btn btn-small btn-primary" data-action="lead" data-id="${c.id}" ${data.party[0].id === c.id ? "disabled" : ""}>SET AS LEAD</button><button class="btn btn-small btn-ghost" data-action="store" data-id="${c.id}" ${data.party.length < 2 ? "disabled" : ""}>SEND TO STORAGE</button>` : `<button class="btn btn-small btn-primary" data-action="retrieve" data-id="${c.id}" ${data.party.length >= 6 ? "disabled" : ""}>ADD TO PARTY</button>`}</div>
      <div class="nickname-field"><label for="creature-nickname">GIVE A NICKNAME</label><div><input id="creature-nickname" maxlength="20" value="${esc(c.nickname || "")}" placeholder="${s.name}"/><button class="btn btn-small" data-action="rename" data-id="${c.id}">SAVE NAME</button></div></div>`;
  }
  private renderBag(data: GameData) {
    return `<div class="resource-strip"><span>${icon("coin", 18)} <strong>${data.gold}</strong> SUNMARKS</span><span>${icon("satchel", 18)} ${bagCount(data)} / ${BAG_LIMIT} ITEMS</span></div>
      <p class="section-intro">Vials form a gentle bond with wildlings in battle. Tonics restore health here or in battle.</p>
      <div class="inventory-grid">${Object.entries(ITEMS)
        .map(
          ([id, item]) =>
            `<article class="inventory-item"><div class="item-symbol" style="--item-color:${item.color}">${item.icon}</div><div><h3>${item.name}<span>×${data.bag[id as ItemId]}</span></h3><p>${item.description}</p></div>${id.includes("Tonic") ? `<button class="btn btn-small" data-action="choose-item-target" data-id="${id}" ${!data.bag[id as ItemId] ? "disabled" : ""}>USE</button>` : `<span class="item-context">USE IN BATTLE</span>`}</article>`,
        )
        .join(
          "",
        )}</div><div class="notice-banner">✦ Want more supplies? Visit Fen at the trading post in Thimblewick.</div>`;
  }
  private renderQuest(data: GameData) {
    const steps = [
      ["Speak with Orla", data.quest !== "unstarted"],
      [
        "Befriend a wildling in Sunlit Fields",
        data.quest === "return" || data.quest === "done",
      ],
      ["Return to Orla", data.quest === "done"],
    ] as const;
    return `<div class="journal-cover"><span class="eyebrow">HOLLOW VALE · MAIN STORY</span><h3>The First Light</h3><p>Orla believes every bond begins with a moment of listening. Meet a wildling beyond the village and bring back its story.</p></div>
      <div class="journal-steps">${steps.map(([text, done], i) => `<div class="journal-step ${done ? "done" : ""}"><span>${done ? "✓" : String(i + 1).padStart(2, "0")}</span><div><b>${text}</b><small>${done ? "COMPLETE" : i === ["unstarted", "catch", "return"].indexOf(data.quest) ? "CURRENT OBJECTIVE" : "UP NEXT"}</small></div></div>`).join("")}</div>
      <div class="reward-box"><span>✦ &nbsp; QUEST REWARD</span><strong>80 sunmarks · 2 Herb Tonics</strong><small>${data.quest === "done" ? "CLAIMED · THANK YOU FOR HELPING ORLA" : "Return to Orla after your first wildling bond"}</small></div>
      <div class="side-quest"><span class="eyebrow">WAYFARER CHALLENGE</span><h3>Rowan’s Invitation</h3><p>Challenge Rowan on the southern trail to a friendly one-on-one battle.</p><span class="quest-status">${data.flags.trainerWon ? "✓ CHALLENGE COMPLETE" : "○ CHALLENGE AVAILABLE"}</span></div>`;
  }
  private renderMap(data: GameData) {
    const unlocked = data.quest === "done";
    return `<p class="section-intro">Explore without loading screens. The valley ends at the old ridgeline; new regions are planned beyond it.</p>
      <div class="full-map"><canvas id="fullmap" aria-label="Hollow Vale map with player and objective"></canvas><div class="map-legend"><span><i class="dot dot-player"></i> YOU</span><span><i class="dot dot-quest"></i> OBJECTIVE</span><span><i class="dot dot-waystone"></i> WAYSTONE</span></div></div>
      <div class="map-locations"><div><b>THIMBLEWICK</b><small>Village · hearth · supply shop</small>${unlocked ? `<button data-action="travel" data-id="village">TRAVEL HERE ${icon("arrow", 15)}</button>` : ""}</div>
      <div><b>OLD WAYSTONE</b><small>${data.visited.includes("beacon") ? "Discovered · near the old bridge" : "Undiscovered · explore east of the village"}</small>${unlocked && data.visited.includes("beacon") ? `<button data-action="travel" data-id="beacon">TRAVEL HERE ${icon("arrow", 15)}</button>` : ""}</div></div>
      <p class="muted-note">${unlocked ? "Travel is available only between discovered safe locations." : "Complete The First Light to unlock waystone travel."}</p>`;
  }
  private renderMenu(data: GameData) {
    return `<div class="pause-art"><span>✣</span><h3>The valley will wait for you.</h3><p>Your story lives on this device, even when you set it down.</p></div>
      <div class="menu-stack"><button data-action="close-panel">${icon("arrow")} RESUME EXPLORING</button><button data-action="save">${icon("save")} SAVE JOURNEY NOW</button><button data-action="panel" data-id="settings">${icon("sound")} AUDIO & CONTROLS</button>
      ${this.screen === "battle" ? `<button data-action="exit-encounter">↩ ABANDON THIS BATTLE <small>No rewards; current items and health remain</small></button>` : ""}
      <button data-action="return-title">${icon("menu")} SAVE & RETURN TO TITLE</button></div>
      <div class="menu-save-note">Autosaves after important events and periodically during exploration. ${this.screen === "battle" ? "An interrupted battle is not restored on reload; your last resolved turn and items are saved." : ""}<br/>${Math.floor(data.playSeconds / 60)} MINUTES IN THE VALE</div>`;
  }
  private renderSettings(data: GameData) {
    const s = data.settings;
    return `<div class="settings-list"><div><label for="volume">SOUNDSCAPE <small>Original procedural music and feedback</small></label><input id="volume" type="range" min="0" max="1" step="0.05" value="${s.volume}"/><b>${Math.round(s.volume * 100)}%</b></div>
      <div><label for="sensitivity">CAMERA SENSITIVITY <small>Drag to look around; scroll to zoom</small></label><input id="sensitivity" type="range" min="0.2" max="2" step="0.1" value="${s.cameraSensitivity}"/><b>${s.cameraSensitivity.toFixed(1)}×</b></div>
      <div><label for="quality">GRAPHICS QUALITY <small>Lower uses fewer grass instances and smaller shadows</small></label><select id="quality"><option value="high" ${s.quality === "high" ? "selected" : ""}>Lush / high</option><option value="low" ${s.quality === "low" ? "selected" : ""}>Light / low</option></select></div>
      <div><label for="invert">INVERT CAMERA VERTICAL <small>Changes drag direction</small></label><input id="invert" type="checkbox" ${s.invertY ? "checked" : ""}/></div></div>
      <div class="notice-banner">Volume and camera settings apply immediately. Vegetation density updates when the game is reloaded.</div>
      <button class="btn btn-primary" data-action="panel" data-id="menu">${icon("arrow", 16)} BACK TO PAUSE MENU</button>`;
  }
  private renderShop(data: GameData) {
    return `<div class="shop-banner"><span>✦ FEN’S PROVISIONS ✦</span><p>“The best journeys start with a well-stocked satchel.”</p></div>
      <div class="resource-strip"><span>${icon("coin", 18)} <strong>${data.gold}</strong> SUNMARKS</span><span>${bagCount(data)} / ${BAG_LIMIT} BAG SPACE</span></div>
      <div class="shop-list">${Object.entries(ITEMS)
        .map(
          ([id, item]) =>
            `<div class="shop-row"><span class="item-symbol" style="--item-color:${item.color}">${item.icon}</span><span><b>${item.name}</b><small>${item.description}</small><em>OWNED ×${data.bag[id as ItemId]}</em></span><div><button class="btn btn-small btn-primary" data-action="buy" data-id="${id}" ${data.gold < item.buy || bagCount(data) >= BAG_LIMIT ? "disabled" : ""}>BUY · ${item.buy}</button><button class="btn btn-small btn-ghost" data-action="sell" data-id="${id}" ${!data.bag[id as ItemId] ? "disabled" : ""}>SELL · ${item.sell}</button></div></div>`,
        )
        .join("")}</div>`;
  }
  notify(text: string, good = true) {
    const toast = document.createElement("div");
    toast.className = `toast ${good ? "" : "toast-error"}`;
    toast.innerHTML = `<span>${good ? "✦" : "!"}</span><span>${esc(text)}</span>`;
    this.layer("toast-layer").append(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }
}
