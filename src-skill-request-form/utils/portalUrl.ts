const DEFAULT_PORTAL_ORIGIN = "https://app.port.io";

/** Portal app origin for in-app links — not the API host. */
export function getPortalOrigin(): string {
  try {
    const ref = document.referrer?.trim();
    if (ref) return new URL(ref).origin;
  } catch {
    /* invalid referrer */
  }
  return DEFAULT_PORTAL_ORIGIN;
}

/** Workflow run page — Port portal route: /organization/runs/{runId} */
export function buildRunUrl(runId: string): string {
  return `${getPortalOrigin()}/organization/runs/${encodeURIComponent(runId)}`;
}

/** Entity page — Port portal route: {blueprint}Entity?identifier={entityId} */
export function buildEntityPageUrl(
  blueprintIdentifier: string,
  entityIdentifier: string
): string {
  const origin = getPortalOrigin();
  const path = `${encodeURIComponent(blueprintIdentifier)}Entity`;
  const qs = new URLSearchParams({ identifier: entityIdentifier });
  return `${origin}/${path}?${qs.toString()}`;
}
