import { DEV_MOCK } from "../hooks/usePostMessageData";
import {
  REL_FILE_TO_VERSION,
  REL_VERSION_TO_SKILL,
  SKILL_FILE_BLUEPRINT,
  SKILL_VERSION_BLUEPRINT,
} from "../constants";
import type {
  PluginConfig,
  PortEntity,
  SkillFile,
  SkillGroupOption,
  SubmitPayload,
} from "../types";
import { MOCK_CURRENT_FILES, MOCK_SKILL_GROUPS, MOCK_SKILL_SEARCH_RESULTS } from "../dev/mockData";
import { classifyPath, makeId } from "../utils/draft";

/** Minimal shape returned by skill search. */
export type SkillSearchResult = {
  identifier: string;
  title: string;
  location?: string;
  groupIds: string[];
};

type ApiContext = {
  baseUrl: string;
  token: string;
};

async function searchEntities(
  ctx: ApiContext,
  blueprint: string,
  rules: unknown[]
): Promise<PortEntity[]> {
  const res = await fetch(
    `${ctx.baseUrl}/v1/blueprints/${encodeURIComponent(blueprint)}/entities/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { combinator: "and", rules } }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Port API ${res.status}:\n${body}`);
  }

  const data = await res.json();
  return (data.entities ?? []) as PortEntity[];
}

/** All skill groups, for the group picker. */
export async function fetchSkillGroups(
  ctx: ApiContext,
  config: PluginConfig
): Promise<SkillGroupOption[]> {
  if (DEV_MOCK) {
    await new Promise((r) => setTimeout(r, 150));
    return MOCK_SKILL_GROUPS;
  }

  const entities = await searchEntities(ctx, config.skillGroupBlueprint, []);
  return entities
    .map((e) => ({ identifier: e.identifier, title: e.title ?? e.identifier }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Search skills by title substring. Returns up to 20 results. */
export async function fetchSkillsBySearch(
  ctx: ApiContext,
  config: PluginConfig,
  query: string
): Promise<SkillSearchResult[]> {
  if (DEV_MOCK) {
    await new Promise((r) => setTimeout(r, 150));
    const q = query.toLowerCase();
    return MOCK_SKILL_SEARCH_RESULTS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.identifier.toLowerCase().includes(q)
    );
  }

  const rules: unknown[] = query.trim()
    ? [{ property: "$title", operator: "contains", value: query.trim() }]
    : [];

  const entities = await searchEntities(ctx, config.skillBlueprint, rules);
  return entities.slice(0, 20).map((e) => ({
    identifier: e.identifier,
    title: e.title ?? e.identifier,
    location: e.properties?.location as string | undefined,
    groupIds: extractRelationIds(e.relations?.skill_to_skill_group),
  }));
}

function extractRelationIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value) return [value];
  return [];
}

/**
 * All current files for an existing skill, traversed as:
 *   skill ← skill_version (via skill_version_to_skill) ← skill_file (via skill_file_to_skill_version)
 *
 * Every file in the skill bundle (SKILL.md, references, scripts, assets, etc.)
 * is a `skill_file` entity with `path` and `content`. Returns them with
 * SKILL.md first, classified by path.
 */
export async function fetchCurrentFiles(
  ctx: ApiContext,
  skillId: string
): Promise<SkillFile[]> {
  if (DEV_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    return MOCK_CURRENT_FILES;
  }

  // 1. Find all versions pointing at this skill.
  const versions = await searchEntities(ctx, SKILL_VERSION_BLUEPRINT, [
    {
      relation: REL_VERSION_TO_SKILL,
      operator: "=",
      value: skillId,
    },
  ]);
  if (versions.length === 0) return [];

  // 2. Pick the latest version.
  const latestVersion = pickLatest(versions);

  // 3. Get ALL skill_file entities attached to that version.
  const fileEntities = await searchEntities(ctx, SKILL_FILE_BLUEPRINT, [
    {
      relation: REL_FILE_TO_VERSION,
      operator: "=",
      value: latestVersion.identifier,
    },
  ]);

  // 4. Map to SkillFile and sort: SKILL.md first, then alphabetically.
  const files: SkillFile[] = fileEntities.map((f) => {
    const path = String(f.properties?.path ?? f.title ?? "");
    const content = String(f.properties?.content ?? "");
    return { id: makeId(), path, content, type: classifyPath(path), entityId: f.identifier };
  });

  return files.sort((a, b) => {
    if (a.type === "skill_md") return -1;
    if (b.type === "skill_md") return 1;
    return a.path.localeCompare(b.path);
  });
}

function pickLatest(versions: PortEntity[]): PortEntity {
  return [...versions].sort((a, b) => {
    const av = String(a.properties?.version ?? a.createdAt ?? "");
    const bv = String(b.properties?.version ?? b.createdAt ?? "");
    return bv.localeCompare(av);
  })[0];
}

/**
 * Submit a skill request by triggering a Port self-service action.
 * Using actions instead of direct entity creation enforces permissions
 * and keeps the invocation logic in Port rather than the widget.
 *
 * - Create requests trigger `config.createActionIdentifier`
 * - Update requests trigger `config.updateActionIdentifier` (day-2 on the skill entity)
 *
 * Returns the `skill_request` entity identifier so the caller can build a link.
 * For updates the identifier is deterministic: `skill_req_update_{skillId}`.
 * For creates the widget generates it before calling so it can build the URL.
 */
export async function createSkillRequest(
  ctx: ApiContext,
  config: PluginConfig,
  payload: SubmitPayload
): Promise<{ identifier: string }> {
  if (DEV_MOCK) {
    await new Promise((r) => setTimeout(r, 250));
    return { identifier: `mock-skill-request-${Date.now()}` };
  }

  if (payload.requestType === "update") {
    const entityIdentifier = `skill_req_update_${payload.targetSkillId}`;

    await triggerActionRun(ctx, {
      action: config.updateActionIdentifier,
      entity: payload.targetSkillId,
      properties: {
        skill_content: payload.content,
        change_summary: payload.changeSummary,
        skill_group: payload.skillGroupId,
        location: payload.location,
        create_method: payload.createMethod,
        requester: payload.requesterEmail,
      },
    });

    return { identifier: entityIdentifier };
  }

  // Create request — generate the entity identifier here so we can link to it.
  const entityIdentifier = `skill_req_create_${Date.now()}`;

  await triggerActionRun(ctx, {
    action: config.createActionIdentifier,
    properties: {
      entity_identifier: entityIdentifier,
      skill_name: payload.skillName,
      skill_content: payload.content,
      change_summary: payload.changeSummary,
      skill_group: payload.skillGroupId,
      location: payload.location,
      create_method: payload.createMethod,
      requester: payload.requesterEmail,
    },
  });

  return { identifier: entityIdentifier };
}

async function triggerActionRun(
  ctx: ApiContext,
  body: {
    action: string;
    entity?: string;
    properties: Record<string, unknown>;
  }
): Promise<void> {
  const { action, ...rest } = body;
  const res = await fetch(
    `${ctx.baseUrl}/v1/actions/${encodeURIComponent(action)}/runs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rest),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Port API ${res.status}:\n${text}`);
  }
}
