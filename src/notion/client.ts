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
    throw new Error(`No Notion token in the Keychain under service "${service}".`, { cause: err });
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
