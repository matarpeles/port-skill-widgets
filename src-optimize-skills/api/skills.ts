export interface SkillEntity {
  identifier: string;
  title: string;
  properties: Record<string, unknown>;
  relations: Record<string, unknown>;
}

export async function fetchSkills(
  baseUrl: string,
  token: string
): Promise<SkillEntity[]> {
  const res = await fetch(
    `${baseUrl}/v1/blueprints/_skill/entities/search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: { combinator: 'and', rules: [] } }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Port API ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.entities ?? [];
}
