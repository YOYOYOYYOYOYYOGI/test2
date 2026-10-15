import { access, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import bundledChromium from "@sparticuz/chromium";
import { chromium } from "playwright-core";

export const gameURL = process.env.GAME_URL || "http://127.0.0.1:4173/";
export async function launchBrowser() {
  // Minimal Linux environments lack NSS/NSPR; the npm Chromium bundle supplies them.
  const libs = join(tmpdir(), "vesperglen-chromium-libs");
  await mkdir(libs, { recursive: true });
  try {
    await access(join(libs, "lib/libnss3.so"));
  } catch {
    const tarball = brotliDecompressSync(
      await readFile(
        new URL(
          "../node_modules/@sparticuz/chromium/bin/al2023.tar.br",
          import.meta.url,
        ),
      ),
    );
    const result = spawnSync("tar", ["-x", "-C", libs], { input: tarball });
    if (result.status !== 0)
      throw new Error(`Browser dependency extraction failed: ${result.stderr}`);
  }
  return chromium.launch({
    executablePath: await bundledChromium.executablePath(),
    headless: true,
    args: [
      ...bundledChromium.args,
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
    ],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${join(libs, "lib")}:${process.env.LD_LIBRARY_PATH || ""}`,
    },
  });
}
