#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, "..", "prisma", "seed.js");

const child = spawn(
  process.execPath,
  [seedPath],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      SEED_REQUEST_DEMO_ISSUER: "1",
      SEED_RESET: process.env.SEED_RESET || "0",
    },
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
