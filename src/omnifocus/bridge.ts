import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { OFSnapshot } from "../model.ts";

const run = promisify(execFile);

// JXA is only the bridge: it hands the Omni Automation source to OmniFocus and prints the result.
const JXA_BRIDGE = `function run(argv) { return Application("OmniFocus").evaluateJavascript(argv[0]); }`;

/** Evaluate an Omni Automation function-expression file with params; returns its string result. */
export async function evaluateOmniScript(file: URL, params: unknown): Promise<string> {
  const source = await readFile(file, "utf8");
  const call = `(${source.trim()})(${JSON.stringify(params)})`;
  const { stdout } = await run("osascript", ["-l", "JavaScript", "-e", JXA_BRIDGE, call], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function exportOmniFocus(params: {
  excludeFolders: string[];
  completedWithinDays: number;
}): Promise<OFSnapshot> {
  const json = await evaluateOmniScript(new URL("./export.omnijs.js", import.meta.url), params);
  return JSON.parse(json) as OFSnapshot;
}
