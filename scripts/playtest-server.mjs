// Own only the process group we create. Never search for or kill other servers.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function startLocalServer() {
  const root = resolve("work/playtest-server");
  await mkdir(root, { recursive: true });
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: root,
    WRANGLER_LOG_PATH: resolve(root, "wrangler.log"),
  };
  const run = (args) => {
    const log = createWriteStream(resolve(root, "server.log"), { flags: "a" });
    const child = spawn("npx", ["--no-install", "wrangler", ...args], {
      env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once("close", () => log.end());
    let settled = false;
    const exited = new Promise((resolve, reject) => {
      child.once("error", (error) => {
        settled = true;
        log.end();
        reject(error);
      });
      child.once("exit", (code, signal) => {
        settled = true;
        resolve({ code, signal });
      });
    });
    // Attach a rejection handler even while readiness is polling.
    exited.catch(() => {});
    return { child, exited, running: () => !settled };
  };
  const signal = (proc, name) => {
    if (!proc.running()) return;
    try {
      if (process.platform === "win32") proc.child.kill(name);
      else process.kill(-proc.child.pid, name);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const stopProcess = async (proc) => {
    if (!proc?.running()) return;
    signal(proc, "SIGTERM");
    const timedOut = await Promise.race([
      proc.exited.then(() => false),
      delay(4000, true, { ref: false }),
    ]);
    if (timedOut) {
      signal(proc, "SIGKILL");
      await proc.exited;
    }
  };
  let active;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await stopProcess(active);
  };
  // Signals during migrations/readiness must also clean up owned children.
  const interrupted = () => {
    void stop().finally(() => process.exit(130));
  };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  try {
    active = run(["d1", "migrations", "apply", "haribo-dogam", "--local"]);
    const migration = await active.exited;
    if (migration.code !== 0)
      throw Error(`Local migrations failed; see ${root}/server.log`);
    const port = await new Promise((resolve, reject) => {
      const reservation = createServer();
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", () => {
        const { port } = reservation.address();
        reservation.close((error) => (error ? reject(error) : resolve(port)));
      });
    });
    const url = new URL(`http://127.0.0.1:${port}`);
    active = run([
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--var",
      "DEV_LOGIN:1",
      "--var",
      `SESSION_SECRET:${randomBytes(32).toString("hex")}`,
    ]);
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (!active.running())
        throw Error(`Wrangler exited before ready; see ${root}/server.log`);
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          console.log(
            `Owned npx wrangler dev ready at ${url.origin} (pid ${active.child.pid})`,
          );
          return {
            url,
            pid: active.child.pid,
            stop: async () => {
              if (stopped) return;
              await stop();
              process.removeListener("SIGINT", interrupted);
              process.removeListener("SIGTERM", interrupted);
              console.log(
                `Stopped owned Wrangler process group ${active.child.pid}`,
              );
            },
          };
        }
      } catch {
        /* Server is still starting. */
      }
      await delay(200);
    }
    throw Error(`Wrangler readiness timeout; see ${root}/server.log`);
  } catch (error) {
    await stop();
    process.removeListener("SIGINT", interrupted);
    process.removeListener("SIGTERM", interrupted);
    throw error;
  }
}
