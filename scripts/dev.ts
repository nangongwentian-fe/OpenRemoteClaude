const children = [
  Bun.spawn([process.execPath, "run", "dev:server"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }),
  Bun.spawn([process.execPath, "run", "dev:client"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }),
];

let shuttingDown = false;
let stopPromise: Promise<void> | null = null;

async function terminateChild(child: (typeof children)[number]) {
  if (child.exitCode !== null) return;

  try {
    if (process.platform === "win32") {
      const killer = Bun.spawn([
        "taskkill",
        "/PID",
        String(child.pid),
        "/T",
        "/F",
      ], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });

      await killer.exited;
      return;
    }

    child.kill("SIGTERM");
  } catch {
    // Ignore child shutdown race.
  }
}

function stopChildren() {
  if (stopPromise) return stopPromise;

  stopPromise = Promise.allSettled(children.map((child) => terminateChild(child))).then(
    () => {}
  );

  return stopPromise;
}

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[dev] Received ${signal}, shutting down...`);
  void stopChildren();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const result = await Promise.race([
  children[0].exited.then((code) => ({ name: "dev:server", code })),
  children[1].exited.then((code) => ({ name: "dev:client", code })),
]);

if (!shuttingDown) {
  console.error(`[dev] ${result.name} exited with code ${result.code ?? 1}`);
  await stopChildren();
}

await stopChildren();
await Promise.allSettled(children.map((child) => child.exited));
process.exit(shuttingDown ? 0 : (result.code ?? 0));
