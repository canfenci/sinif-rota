import { execFileSync } from "node:child_process";

function normalizeBuildId(value) {
  const normalized = value?.trim().slice(0, 40).replace(/[^a-zA-Z0-9._-]/g, "-");
  return normalized || null;
}

export function resolveBuildId(env = process.env) {
  const configured =
    normalizeBuildId(env.SINIF_ROTA_BUILD_ID) ??
    normalizeBuildId(env.NEXT_PUBLIC_COMMIT_HASH) ??
    normalizeBuildId(env.CF_PAGES_COMMIT_SHA);
  if (configured) return configured.slice(0, 7);

  try {
    return normalizeBuildId(execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })) ?? "unknown";
  } catch {
    return "unknown";
  }
}
