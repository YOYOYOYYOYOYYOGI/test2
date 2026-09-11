import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

export async function getRenderingCapabilities() {
  try { await execFileAsync('ffmpeg', ['-version']); return { browserWebm: true, serverMp4: true, engine: 'Canvas + FFmpeg' }; } catch { return { browserWebm: true, serverMp4: false, engine: 'Canvas MediaRecorder', note: 'Install FFmpeg on the server to enable MP4 transcodes.' }; }
}

// The browser owns the interactive render because product images remain local to the user.
// This contract is intentionally separate so a queue/FFmpeg worker can be added without changing UI APIs.
export function createRenderJobRecord(payload) {
  return { id: `render-${Date.now()}-${Math.random().toString(16).slice(2)}`, state: 'browser-render', createdAt: new Date().toISOString(), ...payload };
}

export async function transcodeWebmToMp4(buffer) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ugc-render-'));
  const input = path.join(directory, 'input.webm'); const output = path.join(directory, 'output.mp4');
  try { await fs.writeFile(input, buffer); await execFileAsync('ffmpeg', ['-y', '-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', output], { maxBuffer: 2 * 1024 * 1024 }); return await fs.readFile(output); } catch (error) { if (error.code === 'ENOENT') { error.status = 503; error.message = 'FFmpeg is not installed on the gateway. The browser WebM export is still available.'; } throw error; } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
