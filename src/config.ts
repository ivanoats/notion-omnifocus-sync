import { readFileSync } from "node:fs";
import { hostname } from "node:os";

export interface Config {
  syncHost: string;
  notion: {
    apiVersion: string;
    tokenKeychainService: string;
    tasksDataSourceId: string;
    projectsDataSourceId: string;
  };
  omnifocus: {
    excludeFolders: string[];
    priorityTagParent: string;
  };
  tagAllowlist: string[];
  conflictPolicy: "latest-wins";
  importCompletedWithinDays: number;
}

export function loadConfig(path = "sync.config.json"): Config {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  } catch (err) {
    throw new Error(`Could not read ${path}. Copy sync.config.example.json to get started.`, { cause: err });
  }
}

export function currentHost(): string {
  return hostname().replace(/\.local$/i, "").toLowerCase();
}

/** Throws unless this machine is the configured sync host. Call before any write. */
export function assertWriteHost(config: Config, host = currentHost()): void {
  if (host !== config.syncHost.toLowerCase()) {
    throw new Error(`Write mode only runs on ${config.syncHost}; this is ${host}. Use --dry-run here.`);
  }
}
