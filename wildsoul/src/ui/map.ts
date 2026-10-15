import type { GameData } from "../core/types";
import { NPCS } from "../world/world";
import { riverX } from "../world/terrain";

/** Hand-drawn cartographic overlay of the navigable region, not a screenshot. */
export function paintMap(
  canvas: HTMLCanvasElement,
  data: GameData,
  large = false,
) {
  const size = large ? 640 : 180;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pos = (x: number, z: number): [number, number] => [
    size * (0.5 + x / 76),
    size * (0.5 + z / 76),
  ];
  ctx.fillStyle = "#a9bb94";
  ctx.fillRect(0, 0, size, size);
  const forest = pos(18, -17);
  const gradient = ctx.createRadialGradient(
    forest[0],
    forest[1],
    size * 0.02,
    forest[0],
    forest[1],
    size * 0.46,
  );
  gradient.addColorStop(0, "#688f77");
  gradient.addColorStop(1, "#a6bc95");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#d0c7a0";
  ctx.beginPath();
  ctx.ellipse(...pos(-14, 13), size * 0.16, size * 0.15, -0.3, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(...pos(-11, -13), size * 0.24, size * 0.27, 0.2, 0, 7);
  ctx.fill();
  // Glasswater river, crossed by the old timber bridge.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#6c9ba1";
  ctx.lineWidth = size * 0.065;
  ctx.beginPath();
  for (let z = -38; z <= 38; z++) {
    const [px, py] = pos(riverX(z), z);
    if (z === -38) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = "#a9d2c0";
  ctx.lineWidth = size * 0.022;
  ctx.stroke();
  ctx.fillStyle = "#85aeb0";
  ctx.beginPath();
  ctx.ellipse(...pos(23, 24), size * 0.105, size * 0.095, -0.15, 0, 7);
  ctx.fill();
  ctx.strokeStyle = "#d5ba91";
  ctx.lineWidth = size * 0.018;
  const roads: [number, number][][] = [
    [
      [-22, 16],
      [-12, 9],
      [-5, -4],
      [-2, -19],
    ],
    [
      [-11, 7],
      [1, -5],
      [12, -7],
      [22, -8],
      [30, -22],
    ],
  ];
  roads.forEach((road) => {
    ctx.beginPath();
    road.forEach(([x, z], i) => {
      const p = pos(x, z);
      if (!i) ctx.moveTo(...p);
      else ctx.lineTo(...p);
    });
    ctx.stroke();
  });
  ctx.fillStyle = "#846d55";
  ctx.fillRect(...pos(9, -8.8), size * 0.055, size * 0.02);
  // Abstract little treetops suggest density without implying a separate navigable zone.
  for (let i = 0; i < (large ? 62 : 35); i++) {
    const x = 18 + ((i * 47) % 16) + Math.sin(i * 6) * 1.6;
    const z = -24 + ((i * 31) % 36);
    if (Math.hypot(x - 23, z - 24) < 10) continue;
    const [px, py] = pos(x, z);
    ctx.fillStyle = i % 3 === 0 ? "#558473" : "#6b9980";
    ctx.beginPath();
    ctx.arc(px, py, size * (large ? 0.006 : 0.007), 0, 7);
    ctx.fill();
  }
  const marker = (x: number, z: number, color: string, radius: number) => {
    const [px, py] = pos(x, z);
    ctx.fillStyle = "#f9f0d2";
    ctx.beginPath();
    ctx.arc(px, py, radius + 3, 0, 7);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, 7);
    ctx.fill();
  };
  if (large) {
    const places: [string, number, number, string][] = [
      ["THIMBLEWICK", -15, 12, "#495e55"],
      ["SUNLIT FIELDS", -14, -22, "#516958"],
      ["WHISPERWOOD", 24, -2, "#426951"],
      ["ECHO CAVE", 29, -27, "#485b55"],
      ["GLASSWATER", 23, 31, "#517c80"],
    ];
    ctx.font = "600 13px Georgia";
    ctx.textAlign = "center";
    for (const [label, x, z, color] of places) {
      const [px, py] = pos(x, z);
      ctx.fillStyle = color;
      ctx.fillText(label, px, py);
    }
  }
  if (data.quest !== "done") {
    const target =
      data.quest === "catch"
        ? [-7, -2]
        : [NPCS.researcher.x, NPCS.researcher.z];
    marker(target[0], target[1], "#e6a262", large ? 7 : 4);
  }
  if (data.visited.includes("beacon"))
    marker(3.2, -6, "#e9d894", large ? 6 : 3);
  marker(data.player.x, data.player.z, "#204849", large ? 8 : 5);
  const [px, py] = pos(data.player.x, data.player.z);
  ctx.fillStyle = "#fff5d9";
  ctx.beginPath();
  ctx.arc(px, py, large ? 3 : 2, 0, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(59,89,81,.55)";
  ctx.lineWidth = large ? 12 : 5;
  ctx.strokeRect(0, 0, size, size);
}
