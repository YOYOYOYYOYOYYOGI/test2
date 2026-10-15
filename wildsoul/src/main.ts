import * as THREE from "three";
import "./ui/styles.css";
import { GameUI, type Dialogue } from "./ui/interface";
import { World, CACHES, type Interactable } from "./world/world";
import { ExplorerControls } from "./world/controls";
import { BattleScene } from "./world/battleScene";
import { createPortraits } from "./world/portraits";
import { Soundscape } from "./audio/synth";
import {
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
  useItem,
} from "./core/game";
import {
  resolveTurn,
  startTrainerBattle,
  startWildBattle,
} from "./core/battle";
import {
  displayName,
  restoreHP,
  statsFor,
  knownMoves,
} from "./core/progression";
import { hasSave, loadGame, saveGame } from "./core/save";
import { ITEMS } from "./data/moves";
import { SPECIES } from "./data/species";
import type {
  BattleAction,
  BattleSession,
  GameData,
  ItemId,
} from "./core/types";

type ActionData = DOMStringMap;
class Vesperglen {
  private renderer: THREE.WebGLRenderer;
  private world: World;
  private worldQuality: "low" | "high";
  private arena = new BattleScene();
  private controls: ExplorerControls;
  private ui: GameUI;
  private audio = new Soundscape();
  private data: GameData | null = null;
  private battle: BattleSession | null = null;
  private battleOutcome: string | null = null;
  private lastTime = performance.now();
  private hudTime = 0;
  private saveTime = 0;
  private visible = true;
  constructor(root: HTMLElement) {
    const existing = loadGame();
    const quality =
      existing?.settings.quality ||
      (window.matchMedia("(pointer:coarse)").matches ? "low" : "high");
    this.worldQuality = quality;
    this.ui = new GameUI(root, (action, info) => this.action(action, info));
    this.world = new World(quality);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, quality === "low" ? 1 : 1.55),
    );
    this.renderer.domElement.id = "world-canvas";
    this.ui.canvasHost.append(this.renderer.domElement);
    this.controls = new ExplorerControls(
      this.renderer.domElement,
      this.world,
      () =>
        this.data?.settings || {
          volume: 0.45,
          cameraSensitivity: 0.7,
          quality: "high",
          invertY: false,
        },
      () => this.interact(),
      (key) => this.shortcut(key),
    );
    this.controls.bindTouch(
      root.querySelector("#joystick")!,
      root.querySelector("#jump-button")!,
      root.querySelector("#run-button")!,
    );
    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      this.visible = !document.hidden;
      if (!this.visible) {
        if (this.data) this.save(false);
        this.audio.suspend();
      } else {
        this.lastTime = performance.now();
        this.audio.resume();
      }
    });
    window.addEventListener("pagehide", () => {
      if (this.data) this.save(false);
    });
    window.addEventListener("keydown", (e) => {
      if (
        this.ui.activeScreen !== "battle" ||
        this.ui.activePanel ||
        this.battleOutcome ||
        !this.data ||
        !this.battle
      )
        return;
      if (e.target instanceof HTMLInputElement) return;
      const index = parseInt(e.key, 10) - 1;
      if (index >= 0 && index < 4) {
        const active = this.data.party.find(
          (c) => c.id === this.battle?.activeId,
        );
        const move = active && knownMoves(active)[index];
        if (move) this.takeTurn({ kind: "move", moveId: move.id });
      }
    });
    this.ui.showMenu(hasSave());
    // Portraits are rendered from the actual in-game 3D models, then cached as UI images.
    window.setTimeout(() => {
      createPortraits();
      if (this.ui.activeScreen === "starter") this.ui.showStarters();
    }, 250);
    requestAnimationFrame((now) => this.frame(now));
  }
  private resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.controls.resize(w, h);
    this.arena.resize(w, h);
  }
  private frame(now: number) {
    requestAnimationFrame((time) => this.frame(time));
    const dt = Math.min(0.045, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (!this.visible) return;
    const exploring = this.ui.activeScreen === "explore" && !!this.data;
    const canMove = exploring && !this.ui.activePanel && !this.ui.hasDialogue;
    this.controls.update(dt, !!canMove);
    if (exploring && this.data) {
      this.data.player.x = this.world.player.position.x;
      this.data.player.z = this.world.player.position.z;
      this.data.player.facing = this.world.player.rotation.y;
      this.data.playSeconds += dt;
      this.saveTime += dt;
      this.hudTime += dt;
      if (this.saveTime >= 25) {
        this.save(false);
        this.saveTime = 0;
      }
      if (this.hudTime >= 0.17) {
        this.hudTime = 0;
        const region = this.world.region(
          this.data.player.x,
          this.data.player.z,
        );
        if (!this.data.visited.includes(region.id)) {
          this.data.visited.push(region.id);
          this.ui.notify(`Location discovered · ${region.label}`);
          this.audio.cue("discover");
          this.save(false);
        }
        const near = this.world.nearby(
          this.data.player.x,
          this.data.player.z,
          this.data,
        );
        this.ui.updateHUD(this.data, near, region.label, this.data.playSeconds);
      }
    }
    if (this.ui.activeScreen !== "battle") {
      this.world.update(
        dt,
        this.world.player.position.x,
        this.world.player.position.z,
        this.data?.foundItems || [],
      );
      this.renderer.render(this.world.scene, this.controls.camera);
    } else {
      this.arena.update(dt);
      this.renderer.render(this.arena.scene, this.arena.camera);
    }
  }
  private save(showFeedback: boolean) {
    if (!this.data) return;
    const success = saveGame(this.data);
    if (showFeedback)
      this.ui.notify(
        success
          ? "Journey saved on this device."
          : "Save failed. Check available browser storage.",
        success,
      );
  }
  private startJourney(starter: string) {
    try {
      this.data = newGame(starter);
    } catch {
      this.ui.notify("Please choose one of Orla’s companions.", false);
      return;
    }
    this.data.settings.quality = this.worldQuality;
    this.battle = null;
    this.battleOutcome = null;
    this.world.elapsed = 0;
    this.controls.teleport(this.data.player.x, this.data.player.z);
    this.audio.start(this.data.settings.volume);
    this.audio.cue("discover");
    this.ui.showExplore(this.data);
    this.ui.notify(`${SPECIES[starter].name} is ready to explore with you!`);
    this.save(false);
  }
  private continueJourney() {
    const loaded = loadGame();
    if (!loaded) {
      this.ui.notify("No valid saved journey was found.", false);
      this.ui.showMenu(false);
      return;
    }
    this.data = loaded;
    this.battle = null;
    this.battleOutcome = null;
    this.world.elapsed = loaded.playSeconds;
    this.controls.teleport(loaded.player.x, loaded.player.z);
    this.world.player.rotation.y = loaded.player.facing;
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio || 1,
        loaded.settings.quality === "low" ? 1 : 1.55,
      ),
    );
    this.resize();
    this.audio.start(loaded.settings.volume);
    this.audio.setMode("explore");
    this.ui.showExplore(loaded);
    this.ui.notify("Welcome back to the vale.");
  }
  private shortcut(key: string) {
    if (this.ui.hasDialogue) {
      if (key === "escape") this.ui.closeDialogue();
      return;
    }
    if (this.ui.activePanel) {
      if (key === "escape") this.ui.closePanel();
      return;
    }
    if (this.ui.activeScreen === "explore") {
      const panels: Record<string, "party" | "bag" | "quest" | "map" | "menu"> =
        {
          p: "party",
          i: "bag",
          b: "bag",
          j: "quest",
          m: "map",
          escape: "menu",
        };
      if (panels[key]) this.ui.setPanel(panels[key]);
    } else if (this.ui.activeScreen === "battle" && key === "escape")
      this.ui.setPanel("menu");
  }
  private dialogue(
    eyebrow: string,
    title: string,
    text: string,
    actions: Dialogue["actions"] = [],
  ) {
    this.audio.cue("tap");
    this.ui.openDialogue({
      eyebrow,
      title,
      text,
      actions: actions.length
        ? actions
        : [
            {
              label: "CONTINUE EXPLORING",
              action: "dialogue-close",
              primary: true,
            },
          ],
    });
  }
  private interact() {
    if (
      !this.data ||
      this.ui.activeScreen !== "explore" ||
      this.ui.activePanel ||
      this.ui.hasDialogue
    )
      return;
    const near = this.world.nearby(
      this.data.player.x,
      this.data.player.z,
      this.data,
    );
    if (!near) {
      this.ui.notify("Move closer to a person, wildling or glowing object.");
      return;
    }
    if (near.type === "wild") {
      this.encounter(near);
      return;
    }
    if (near.type === "cache") {
      const cache = CACHES.find((c) => c.id === near.id)!;
      if (findCache(this.data, cache.id, cache.item, cache.quantity)) {
        this.audio.cue("discover");
        this.ui.notify(`Found ${cache.quantity} × ${ITEMS[cache.item].name}!`);
        this.save(false);
      }
      return;
    }
    if (near.type === "cave") {
      if (!this.data.visited.includes("cave")) {
        this.data.visited.push("cave");
        this.save(false);
      }
      this.dialogue(
        "A PLACE BETWEEN ROOTS",
        "Echo Cave",
        "The stone walls hum with a different kind of life. Follow the path inside to find rarer wildlings and a hidden cache.",
      );
      return;
    }
    if (near.type === "beacon") {
      if (!this.data.visited.includes("beacon")) {
        this.data.visited.push("beacon");
        this.save(false);
      }
      this.dialogue(
        "THE OLD WAYSTONE",
        "A point of return",
        this.data.quest === "done"
          ? "This place is now linked to your map. Use the map to travel between the waystone and Thimblewick."
          : "Warm light threads through its carvings. Orla may know how to wake the old path.",
        [{ label: "OPEN MAP", action: "open-map", primary: true }],
      );
      return;
    }
    switch (near.id) {
      case "guide": {
        const gift = giftFromGuide(this.data);
        if (gift) {
          this.save(false);
          this.audio.cue("discover");
        }
        this.dialogue(
          "PIP · VILLAGE GUIDE",
          "Welcome, wanderer!",
          gift
            ? "The vale is full of small wonders. Take two Wisp Vials for the road! Find Orla by the western cottage; she will teach you how to befriend the wildlings."
            : "Orla waits by the western cottage. The meadows are south, the old bridge leads east, and the hearth will heal your companions. Be kind out there.",
        );
        return;
      }
      case "researcher": {
        if (this.data.quest === "unstarted")
          this.dialogue(
            "ORLA · WILDLING KEEPER",
            "A little spark of friendship",
            "Wildlings aren’t prizes to win. Listen to one in the Sunlit Fields, meet it in a gentle battle, then offer a Wisp Vial. Come tell me what you learn.",
            [
              {
                label: "ACCEPT THE FIRST LIGHT",
                action: "accept-quest",
                primary: true,
              },
              { label: "MAYBE LATER", action: "dialogue-close" },
            ],
          );
        else if (this.data.quest === "catch")
          this.dialogue(
            "ORLA · WILDLING KEEPER",
            "Find your first friend",
            "Walk south into the fields and approach a wildling. Weaken it with a move, then choose Vials in battle. A gentler touch helps the bond take hold.",
          );
        else if (this.data.quest === "return") {
          const rewarded = finishQuest(this.data);
          if (rewarded) {
            this.save(false);
            this.audio.cue("victory");
            this.ui.notify("Quest complete · 80 sunmarks and 2 Herb Tonics!");
          }
          this.dialogue(
            "ORLA · WILDLING KEEPER",
            "The valley knows your name",
            "You found a friend, not a trophy. That is how this place begins to open its heart. The old waystones will answer you now. Take these supplies for whatever comes next.",
          );
        } else
          this.dialogue(
            "ORLA · WILDLING KEEPER",
            "Keep listening",
            "There are twelve known wildlings in Hollow Vale, and many more beyond the ridgeline. The forest, the river and Echo Cave each have their own stories.",
          );
        return;
      }
      case "healer":
        healParty(this.data);
        this.save(false);
        this.audio.cue("heal");
        this.dialogue(
          "MIRA · HEARTH TENDER",
          "A warm place to rest",
          "All of your companions are fully rested, including those staying at the lodge. The hearth will always have room for you.",
        );
        return;
      case "shop":
        this.dialogue(
          "FEN · SUPPLY MERCHANT",
          "A well-packed journey",
          "I keep vials for new friendships and tonics for hard-won ones. Everything in this pack has been tested on the road.",
          [
            { label: "BROWSE SUPPLIES", action: "open-shop", primary: true },
            { label: "NOT NOW", action: "dialogue-close" },
          ],
        );
        return;
      case "trainer":
        this.dialogue(
          "ROWAN · WAYFARER",
          this.data.flags.trainerWon
            ? "Another friendly round?"
            : "A friendly challenge",
          this.data.flags.trainerWon
            ? "Breezel and I learned a thing or two from you. Want to practise again? The first victory reward is already yours."
            : "The road teaches us by trying. My Breezel and I would love a one-on-one spar. If you win, I have a little something for your travels.",
          [
            {
              label: this.data.flags.trainerWon
                ? "REMATCH ROWAN"
                : "CHALLENGE ROWAN",
              action: "start-trainer",
              primary: true,
            },
            { label: "MAYBE LATER", action: "dialogue-close" },
          ],
        );
        return;
    }
  }
  private encounter(near: Interactable) {
    if (!this.data || !near.speciesId) return;
    try {
      this.battle = startWildBattle(
        this.data,
        near.speciesId,
        this.world.spawns.find((s) => s.id === near.id)!.level,
        near.id,
      );
      this.world.takeSpawn(near.id, 18);
      this.beginBattle();
    } catch (error) {
      this.ui.notify(
        String(error instanceof Error ? error.message : error),
        false,
      );
    }
  }
  private beginBattle() {
    if (!this.data || !this.battle) return;
    this.battleOutcome = null;
    this.arena.set(this.battle, this.data);
    this.ui.showBattle(this.data, this.battle);
    this.audio.setMode("battle");
    this.audio.cue("hit");
    this.save(false);
  }
  private takeTurn(action: BattleAction) {
    if (!this.data || !this.battle || this.battleOutcome || this.ui.activePanel)
      return;
    const previous = this.battle;
    const result = resolveTurn(this.data, this.battle, action);
    if (result.error) {
      this.ui.notify(result.error, false);
      return;
    }
    this.data = result.data;
    this.battle = result.session;
    if (result.outcome) {
      this.battleOutcome = result.outcome;
      if (previous.spawnId)
        this.world.takeSpawn(
          previous.spawnId,
          result.outcome === "fled" ? 10 : 65,
        );
      if (result.outcome === "lost")
        this.controls.teleport(this.data.player.x, this.data.player.z);
      const displaySession: BattleSession = {
        ...previous,
        opponent: {
          ...previous.opponent,
          hp: result.outcome === "won" ? 0 : previous.opponent.hp,
        },
      };
      this.ui.updateBattle(
        this.data,
        displaySession,
        result.events,
        result.outcome,
      );
      this.arena.react(result.events, result.outcome);
      this.audio.cue(
        result.outcome === "won" || result.outcome === "captured"
          ? "victory"
          : "miss",
      );
    } else {
      if (this.battle && this.battle.activeId !== previous.activeId)
        this.arena.set(this.battle, this.data);
      this.ui.updateBattle(this.data, this.battle!, result.events, null);
      this.arena.react(result.events);
      this.audio.cue(
        action.kind === "capture"
          ? "miss"
          : action.kind === "heal"
            ? "heal"
            : "hit",
      );
    }
    this.save(false);
  }
  private action(action: string, details: ActionData) {
    this.audio.cue("tap");
    const id = details.id || "";
    if (action === "new-game") {
      this.ui.showStarters();
      return;
    }
    if (action === "back-menu") {
      this.ui.showMenu(hasSave());
      return;
    }
    if (action === "pick-starter") {
      this.startJourney(id);
      return;
    }
    if (action === "continue") {
      this.continueJourney();
      return;
    }
    if (action === "interact") {
      this.interact();
      return;
    }
    if (action === "dialogue-close") {
      this.ui.closeDialogue();
      return;
    }
    if (!this.data) return;
    if (action === "accept-quest") {
      if (beginQuest(this.data)) {
        this.ui.notify("New quest · The First Light");
        this.save(false);
      }
      this.ui.closeDialogue();
      return;
    }
    if (action === "open-shop") {
      this.ui.closeDialogue();
      this.ui.setPanel("shop");
      return;
    }
    if (action === "open-map") {
      this.ui.closeDialogue();
      this.ui.setPanel("map");
      return;
    }
    if (action === "start-trainer") {
      this.ui.closeDialogue();
      try {
        this.battle = startTrainerBattle(this.data);
        this.beginBattle();
      } catch (error) {
        this.ui.notify(
          String(error instanceof Error ? error.message : error),
          false,
        );
      }
      return;
    }
    if (action === "battle-move")
      return this.takeTurn({ kind: "move", moveId: id });
    if (action === "battle-capture")
      return this.takeTurn({
        kind: "capture",
        item: id as "wispVial" | "lumenVial",
      });
    if (action === "battle-heal")
      return this.takeTurn({
        kind: "heal",
        item: id as "herbTonic" | "deepTonic",
      });
    if (action === "battle-switch")
      return this.takeTurn({ kind: "switch", creatureId: id });
    if (action === "battle-flee") return this.takeTurn({ kind: "flee" });
    if (action === "finish-battle" || action === "exit-encounter") {
      if (action === "exit-encounter" && this.battle?.spawnId)
        this.world.takeSpawn(this.battle.spawnId, 12);
      this.battle = null;
      this.battleOutcome = null;
      this.ui.showExplore(this.data);
      this.audio.setMode("explore");
      this.save(false);
      if (action === "exit-encounter")
        this.ui.notify("Challenge abandoned. No rewards granted.");
      return;
    }
    if (action === "save") {
      this.save(true);
      return;
    }
    if (action === "return-title") {
      this.save(false);
      this.battle = null;
      this.battleOutcome = null;
      this.ui.showMenu(hasSave());
      this.audio.setMode("explore");
      this.data = null;
      return;
    }
    if (action === "buy" || action === "sell") {
      const item = id as ItemId;
      const error =
        action === "buy" ? buyItem(this.data, item) : sellItem(this.data, item);
      if (error) this.ui.notify(error, false);
      else {
        this.ui.notify(
          `${action === "buy" ? "Bought" : "Sold"} ${ITEMS[item].name}.`,
        );
        this.save(false);
        this.ui.refresh(this.data);
      }
      return;
    }
    if (action === "lead") {
      if (leadParty(this.data, id)) {
        this.ui.notify("Lead companion changed.");
        this.save(false);
        this.ui.refresh(this.data);
      }
      return;
    }
    if (action === "store" || action === "retrieve") {
      const error =
        action === "store"
          ? moveToStorage(this.data, id)
          : moveToParty(this.data, id);
      if (error) this.ui.notify(error, false);
      else {
        this.ui.notify("Your companions have been rearranged.");
        this.save(false);
        this.ui.refresh(this.data);
      }
      return;
    }
    if (action === "rename") {
      const creature = [...this.data.party, ...this.data.storage].find(
        (c) => c.id === id,
      );
      const field = document.getElementById(
        "creature-nickname",
      ) as HTMLInputElement | null;
      if (creature && field) {
        // Escaped before rendering; no HTML is ever executed from a nickname.
        creature.nickname =
          field.value.trim().replace(/[<>]/g, "").slice(0, 20) || undefined;
        this.save(false);
        this.ui.notify(
          creature.nickname
            ? `${SPECIES[creature.speciesId].name} is now called ${creature.nickname}.`
            : "Original name restored.",
        );
        this.ui.refresh(this.data);
      }
      return;
    }
    if (action === "heal-outside") {
      const item = this.ui.itemToUse;
      const creature = this.data.party.find((c) => c.id === id);
      if (
        !item ||
        !creature ||
        !item.includes("Tonic") ||
        this.data.bag[item] < 1
      ) {
        this.ui.notify("This item cannot be used.", false);
        return;
      }
      if (creature.hp >= statsFor(creature).hp && !creature.ailment) {
        this.ui.notify("That companion is already rested.", false);
        return;
      }
      if (useItem(this.data, item)) {
        const healed = restoreHP(creature, item === "deepTonic" ? 80 : 35);
        healed.ailment = undefined;
        Object.assign(creature, healed);
        this.ui.clearItemTarget();
        this.ui.notify(`${displayName(creature)} feels better.`);
        this.audio.cue("heal");
        this.save(false);
        this.ui.refresh(this.data);
      }
      return;
    }
    if (action === "travel") {
      if (this.data.quest !== "done" || !this.data.visited.includes(id)) {
        this.ui.notify("This waystone is not unlocked yet.", false);
        return;
      }
      const destination =
        id === "village" ? [-12, 8] : id === "beacon" ? [2, -5] : null;
      if (
        !destination ||
        !this.world.canStand(destination[0], destination[1])
      ) {
        this.ui.notify("That route is not safe right now.", false);
        return;
      }
      this.controls.teleport(destination[0], destination[1]);
      this.data.player.x = destination[0];
      this.data.player.z = destination[1];
      this.ui.closePanel();
      this.ui.notify("Waystone travel complete.");
      this.save(false);
      return;
    }
    if (action === "setting") {
      const value = details.value || "";
      switch (id) {
        case "volume":
          this.data.settings.volume = Math.max(
            0,
            Math.min(1, parseFloat(value) || 0),
          );
          this.audio.setVolume(this.data.settings.volume);
          break;
        case "sensitivity":
          this.data.settings.cameraSensitivity = Math.max(
            0.2,
            Math.min(2, parseFloat(value) || 0.7),
          );
          break;
        case "quality":
          this.data.settings.quality = value === "low" ? "low" : "high";
          this.renderer.setPixelRatio(
            Math.min(
              devicePixelRatio || 1,
              this.data.settings.quality === "low" ? 1 : 1.55,
            ),
          );
          this.resize();
          break;
        case "invert":
          this.data.settings.invertY = value === "true";
          break;
      }
      this.save(false);
      // Range slider stays focused; do not rebuild this panel on every input event.
    }
  }
}

const root = document.getElementById("app");
if (root) {
  try {
    new Vesperglen(root);
  } catch (error) {
    console.error("Vesperglen could not start", error);
    root.innerHTML = `<div style="padding:3rem;font-family:system-ui;background:#173c3b;color:#f9ebcc;height:100%"><h1>Unable to enter the vale</h1><p>Vesperglen needs a browser with WebGL 2 enabled. Try current Chrome, Edge, Firefox or Safari with hardware acceleration.</p><p>Details: ${String(error instanceof Error ? error.message : error).replace(/[<>&]/g, "")}</p></div>`;
  }
}
