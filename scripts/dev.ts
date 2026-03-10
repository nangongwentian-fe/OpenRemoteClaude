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

function stopChildren() {
  for (const child of children) {
    if (child.exitCode === null) {
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore child shutdown race.
      }
    }
  }
}

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[dev] Received ${signal}, shutting down...`);
  stopChildren();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const result = await Promise.race([
  children[0].exited.then((code) => ({ name: "dev:server", code })),
  children[1].exited.then((code) => ({ name: "dev:client", code })),
]);

if (!shuttingDown) {
  console.error(`[dev] ${result.name} exited with code ${result.code ?? 1}`);
  stopChildren();
}

await Promise.allSettled(children.map((child) => child.exited));
process.exit(shuttingDown ? 0 : (result.code ?? 0));
