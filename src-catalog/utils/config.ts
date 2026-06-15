import {
  DEFAULT_SKILL_BLUEPRINT,
  DEFAULT_SKILL_GROUP_BLUEPRINT,
  DEFAULT_SKILL_REQUEST_BLUEPRINT,
} from "../constants";
import type { Params, ParamValue, PluginConfig } from "../types";

// Both create and update route through the full lifecycle workflow
// (submit -> review -> approval gate -> apply). It reads the request's `files`
// JSON to apply content, so the widget and workflow share one data contract.
const DEFAULT_CREATE_ACTION = "skill-request-full";
const DEFAULT_UPDATE_ACTION = "skill-request-full";

/** A plain string/number param value, defaulting to "". */
function stringParam(param: ParamValue | undefined): string {
  if (!param) return "";
  if (typeof param.value === "string") return param.value.trim();
  if (typeof param.value === "number") return String(param.value);
  return "";
}

/** A blueprint param is an object ({ identifier, title }); tolerate string too. */
function blueprintId(param: ParamValue | undefined, fallback: string): string {
  if (!param) return fallback;
  const value = param.value as unknown;
  if (value && typeof value === "object") {
    const id = (value as { identifier?: string }).identifier;
    if (id) return id;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  if (param.identifier) return param.identifier;
  return fallback;
}

export function configFromParams(params: Params): PluginConfig {
  return {
    skillRequestBlueprint: blueprintId(
      params["skillRequestBlueprint"],
      DEFAULT_SKILL_REQUEST_BLUEPRINT
    ),
    skillBlueprint: blueprintId(params["skillBlueprint"], DEFAULT_SKILL_BLUEPRINT),
    skillGroupBlueprint: blueprintId(
      params["skillGroupBlueprint"],
      DEFAULT_SKILL_GROUP_BLUEPRINT
    ),
    createActionIdentifier:
      stringParam(params["createActionIdentifier"]) || DEFAULT_CREATE_ACTION,
    updateActionIdentifier:
      stringParam(params["updateActionIdentifier"]) || DEFAULT_UPDATE_ACTION,
    aiAgentIdentifier: stringParam(params["aiAgentIdentifier"]),
  };
}
