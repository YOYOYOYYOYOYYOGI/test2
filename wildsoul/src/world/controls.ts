import * as THREE from "three";
import type { Settings } from "../core/types";
import type { World } from "./world";
import { groundAt, heightAt } from "./terrain";

export class ExplorerControls {
  readonly camera = new THREE.PerspectiveCamera(59, 1, 0.12, 250);
  yaw = 0.34;
  pitch = 0.32;
  distance = 8.6;
  private keys = new Set<string>();
  private move = new THREE.Vector2();
  private touch = new THREE.Vector2();
  private dragId: number | null = null;
  private lookX = 0;
  private lookY = 0;
  private jumpQueued = false;
  private runTouch = false;
  private altitude = 0;
  private verticalSpeed = 0;
  private target = new THREE.Vector3(-12, 1.3, 8);
  private velocity = new THREE.Vector2();
  private wasWalking = false;
  private joystickId: number | null = null;
  private readonly onInteract: () => void;
  private readonly onShortcut: (action: string) => void;
  private get settings(): Settings {
    return this.settingsProvider();
  }
  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private settingsProvider: () => Settings,
    onInteract: () => void,
    onShortcut: (action: string) => void,
  ) {
    this.onInteract = onInteract;
    this.onShortcut = onShortcut;
    this.camera.position.set(-9, 5, 17);
    window.addEventListener("keydown", (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const key = e.key.toLowerCase();
      if (
        [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)
      )
        e.preventDefault();
      this.keys.add(key);
      if (e.repeat) return;
      if (key === "e" || key === "enter") this.onInteract();
      if (key === " ") this.jumpQueued = true;
      if (["p", "i", "b", "j", "m", "escape"].includes(key))
        this.onShortcut(key);
    });
    window.addEventListener("keyup", (e) =>
      this.keys.delete(e.key.toLowerCase()),
    );
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.touch.set(0, 0);
      this.runTouch = false;
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.dataset.cameraYaw = this.yaw.toFixed(3);
    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragId = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (this.dragId !== e.pointerId) return;
      const sensitivity = this.settings.cameraSensitivity;
      this.yaw -= (e.clientX - this.lookX) * 0.0042 * sensitivity;
      this.canvas.dataset.cameraYaw = this.yaw.toFixed(3);
      this.pitch = THREE.MathUtils.clamp(
        this.pitch +
          (e.clientY - this.lookY) *
            0.003 *
            sensitivity *
            (this.settings.invertY ? -1 : 1),
        0.09,
        0.83,
      );
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId === this.dragId) this.dragId = null;
    };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        this.distance = THREE.MathUtils.clamp(
          this.distance + Math.sign(e.deltaY) * 0.7,
          5.8,
          12,
        );
        e.preventDefault();
      },
      { passive: false },
    );
  }
  bindTouch(joystick: HTMLElement, jump: HTMLElement, run: HTMLElement) {
    const stick = joystick.querySelector<HTMLElement>(".joystick-knob")!;
    const moveStick = (e: PointerEvent) => {
      const rect = joystick.getBoundingClientRect();
      const x = THREE.MathUtils.clamp(
        (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.36),
        -1,
        1,
      );
      const y = THREE.MathUtils.clamp(
        (e.clientY - rect.top - rect.height / 2) / (rect.height * 0.36),
        -1,
        1,
      );
      const len = Math.max(1, Math.hypot(x, y));
      this.touch.set(x / len, -y / len);
      stick.style.transform = `translate(${this.touch.x * rect.width * 0.32}px, ${-this.touch.y * rect.height * 0.32}px)`;
    };
    joystick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.joystickId = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      moveStick(e);
    });
    joystick.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.joystickId) moveStick(e);
    });
    const reset = (e: PointerEvent) => {
      if (e.pointerId !== this.joystickId) return;
      this.joystickId = null;
      this.touch.set(0, 0);
      stick.style.transform = "";
    };
    joystick.addEventListener("pointerup", reset);
    joystick.addEventListener("pointercancel", reset);
    jump.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.jumpQueued = true;
    });
    run.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.runTouch = true;
      run.classList.add("pressed");
      run.setPointerCapture(e.pointerId);
    });
    const stopRun = () => {
      this.runTouch = false;
      run.classList.remove("pressed");
    };
    run.addEventListener("pointerup", stopRun);
    run.addEventListener("pointercancel", stopRun);
  }
  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  teleport(x: number, z: number) {
    this.world.setPlayer(x, z, this.world.player.rotation.y);
    this.altitude = 0;
    this.verticalSpeed = 0;
    this.velocity.set(0, 0);
    this.target.set(x, groundAt(x, z) + 1.2, z);
  }
  get walking() {
    return this.wasWalking;
  }
  update(dt: number, enabled: boolean) {
    const player = this.world.player;
    let fwd = 0,
      right = 0;
    if (enabled) {
      fwd =
        (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) -
        (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0) +
        this.touch.y;
      right =
        (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) -
        (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0) +
        this.touch.x;
    }
    this.move.set(right, fwd);
    if (this.move.length() > 1) this.move.normalize();
    const sprint = enabled && (this.keys.has("shift") || this.runTouch);
    const speed = sprint ? 7.1 : 4.4;
    const vx =
      (Math.cos(this.yaw) * this.move.x - Math.sin(this.yaw) * this.move.y) *
      speed;
    const vz =
      (-Math.sin(this.yaw) * this.move.x - Math.cos(this.yaw) * this.move.y) *
      speed;
    const damping = 1 - Math.exp(-dt * 10);
    this.velocity.lerp(new THREE.Vector2(vx, vz), damping);
    if (!enabled) this.velocity.multiplyScalar(Math.exp(-dt * 12));
    const x = player.position.x,
      z = player.position.z;
    if (this.world.canStand(x + this.velocity.x * dt, z))
      player.position.x += this.velocity.x * dt;
    else this.velocity.x = 0;
    if (this.world.canStand(player.position.x, z + this.velocity.y * dt))
      player.position.z += this.velocity.y * dt;
    else this.velocity.y = 0;
    const moving = this.velocity.length() > 0.35 && enabled;
    this.wasWalking = moving;
    if (moving) {
      const facing = Math.atan2(this.velocity.x, this.velocity.y);
      let diff =
        ((facing - player.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      player.rotation.y += diff * Math.min(1, dt * 13);
    }
    if (enabled && this.jumpQueued && this.altitude < 0.01)
      this.verticalSpeed = 6;
    this.jumpQueued = false;
    this.verticalSpeed -= dt * 16;
    this.altitude = Math.max(0, this.altitude + this.verticalSpeed * dt);
    if (this.altitude === 0) this.verticalSpeed = 0;
    player.position.y =
      groundAt(player.position.x, player.position.z) + this.altitude;
    const legs = player.userData.legs as THREE.Group[];
    const time = this.world.elapsed;
    legs.forEach((leg, i) => {
      leg.rotation.x =
        moving && this.altitude === 0
          ? Math.sin(time * (sprint ? 14 : 10) + i * Math.PI) * 0.43
          : THREE.MathUtils.lerp(leg.rotation.x, 0, dt * 7);
    });
    const torso = player.userData.torso as THREE.Group;
    torso.position.y =
      moving && this.altitude === 0
        ? Math.abs(Math.sin(time * (sprint ? 14 : 10))) * 0.045
        : Math.sin(time * 1.8) * 0.014;
    // Smooth, collision-aware chase camera. Low geometry behind the player does not occlude the view.
    const desiredTarget = new THREE.Vector3(
      player.position.x,
      player.position.y + 1.45,
      player.position.z,
    );
    this.target.lerp(desiredTarget, 1 - Math.exp(-dt * 9));
    const horizontal = this.distance * Math.cos(this.pitch);
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * horizontal,
      this.distance * Math.sin(this.pitch) + 0.55,
      Math.cos(this.yaw) * horizontal,
    );
    let distance = 1;
    for (let i = 1; i <= 18; i++) {
      const t = i / 18;
      const px = this.target.x + offset.x * t,
        pz = this.target.z + offset.z * t,
        py = this.target.y + offset.y * t;
      if (py < heightAt(px, pz) + 0.5 || this.world.blocksCamera(px, py, pz)) {
        distance = Math.max(0.3, (i - 1) / 18);
        break;
      }
    }
    const cameraPos = this.target.clone().addScaledVector(offset, distance);
    this.camera.position.lerp(cameraPos, 1 - Math.exp(-dt * 12));
    this.camera.lookAt(this.target);
  }
}
