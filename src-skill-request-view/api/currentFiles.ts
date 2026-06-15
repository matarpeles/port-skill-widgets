type ApiContext = { baseUrl: string; token: string };

type PortEntity = {
  identifier: string;
  title?: string;
  properties?: Record<string, unknown>;
  createdAt?: string;
};

export type CurrentFile = { path: string; content: string };

const SKILL_VERSION_BLUEPRINT = "_skill_version";
const SKILL_FILE_BLUEPRINT = "_skill_file";
const REL_VERSION_TO_SKILL = "skill_version_to_skill";
const REL_FILE_TO_VERSION = "skill_file_to_skill_version";

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
  if (!res.ok) throw new Error(`Port API ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return (data.entities ?? []) as PortEntity[];
}

function pickLatest(versions: PortEntity[]): PortEntity {
  return [...versions].sort((a, b) => {
    const av = Number(a.properties?.version_number ?? 0);
    const bv = Number(b.properties?.version_number ?? 0);
    if (av !== bv) return bv - av;
    return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
  })[0];
}

/**
 * Current files for the target skill, traversed as:
 *   skill <- _skill_version (via skill_version_to_skill) <- _skill_file (via skill_file_to_skill_version)
 * Returns the latest version's files. Empty array if the skill has no version yet.
 */
export async function fetchCurrentFiles(
  ctx: ApiContext,
  skillId: string
): Promise<CurrentFile[]> {
  const versions = await searchEntities(ctx, SKILL_VERSION_BLUEPRINT, [
    { relation: REL_VERSION_TO_SKILL, operator: "=", value: skillId },
  ]);
  if (versions.length === 0) return [];

  const latest = pickLatest(versions);

  const fileEntities = await searchEntities(ctx, SKILL_FILE_BLUEPRINT, [
    { relation: REL_FILE_TO_VERSION, operator: "=", value: latest.identifier },
  ]);

  return fileEntities.map((f) => ({
    path: String(f.properties?.path ?? f.title ?? ""),
    content: String(f.properties?.content ?? ""),
  }));
}
