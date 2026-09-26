import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client, collectPaginatedAPI } from "@notionhq/client";
import type { Config } from "../config.ts";
import type { NotionSnapshot } from "../model.ts";
import { toProjectRow, toSchema, toTaskRow, type NotionPage } from "./mapper.ts";

const run = promisify(execFile);

async function keychainToken(service: string): Promise<string> {
  try {
    const { stdout } = await run("security", ["find-generic-password", "-s", service, "-a", "notion", "-w"]);
    return stdout.trim();
  } catch (err) {
    const { code, stderr } = err as { code?: number; stderr?: string };
    const detail = (stderr ?? "").trim();
    // 44 = errSecItemNotFound. 36/51 and "interaction" errors mean the keychain is locked,
    // which is normal in an SSH session (SSH logins don't unlock the login keychain).
    const hint = code === 44
      ? `Add it with: security add-generic-password -U -s ${service} -a notion -w`
      : /interaction|locked/i.test(detail) || code === 36 || code === 51
        ? "The login keychain is locked (normal over SSH). Run: security unlock-keychain ~/Library/Keychains/login.keychain-db"
        : "";
    throw new Error(`Couldn't read the Notion token from the Keychain (service "${service}", exit ${code}): ${detail}\n${hint}`.trim(), { cause: err });
  }
}

export async function notionClient(config: Config): Promise<Client> {
  return new Client({
    auth: await keychainToken(config.notion.tokenKeychainService),
    notionVersion: config.notion.apiVersion,
    // The SDK retries 429s and 5xx with backoff; Notion averages ~3 req/s.
    retry: { maxRetries: 5, initialRetryDelayMs: 500, maxRetryDelayMs: 30_000 },
  });
}

async function queryAll(notion: Client, dataSourceId: string): Promise<NotionPage[]> {
  const results = await collectPaginatedAPI(notion.dataSources.query, { data_source_id: dataSourceId });
  return results.filter((r): r is typeof r & NotionPage => r.object === "page" && "properties" in r);
}

export async function exportNotion(notion: Client, config: Config): Promise<NotionSnapshot & { raw: unknown }> {
  const { tasksDataSourceId, projectsDataSourceId } = config.notion;
  const [taskPages, projectPages, tasksDs, projectsDs] = await Promise.all([
    queryAll(notion, tasksDataSourceId),
    queryAll(notion, projectsDataSourceId),
    notion.dataSources.retrieve({ data_source_id: tasksDataSourceId }),
    notion.dataSources.retrieve({ data_source_id: projectsDataSourceId }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    tasks: taskPages.map(toTaskRow),
    projects: projectPages.map(toProjectRow),
    tasksSchema: toSchema(tasksDs.properties),
    projectsSchema: toSchema(projectsDs.properties),
    raw: { taskPages, projectPages },
  };
}
