import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildId } from "./build-id.mjs";
import { finalizeServiceWorker } from "./finalize-service-worker.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildId = resolveBuildId();
const vinextCli = path.join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const result = spawnSync(process.execPath, [vinextCli, "build"], {
  cwd: projectRoot,
  env: { ...process.env, SINIF_ROTA_BUILD_ID: buildId },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const finalized = await finalizeServiceWorker({ projectRoot, buildId });
console.info(`[PWA] ${finalized.cacheName}: ${finalized.corePrecacheUrls.length} core asset finalized.`);
