import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePostMessageData } from "./hooks/usePostMessageData";
import { fetchCurrentFiles, type CurrentFile } from "./api/currentFiles";
import { DiffView } from "./components/DiffView";

/* ── Types ── */

type SkillFileType = "skill_md" | "reference" | "script" | "asset" | "other";

type SkillFile = {
  path: string;
  content: string;
  type: SkillFileType;
};

type FileGroup = {
  type: SkillFile["type"];
  label: string;
  files: SkillFile[];
};

type Tab = "diff" | "content";

const GROUP_ORDER: Exclude<SkillFile["type"], "skill_md">[] = [
  "reference",
  "script",
  "asset",
  "other",
];

const GROUP_LABELS: Record<string, string> = {
  reference: "References",
  script: "Scripts",
  asset: "Assets",
  other: "Other Files",
};

function classifyPath(path: string): SkillFileType {
  const p = path.toLowerCase();
  if (p.endsWith("skill.md")) return "skill_md";
  if (p.includes("/references/") || p.startsWith("references/")) return "reference";
  if (p.includes("/scripts/") || p.startsWith("scripts/")) return "script";
  if (p.includes("/assets/") || p.startsWith("assets/")) return "asset";
  return "other";
}

function baseName(path: string): string {
  return (path.split("/").pop() || path || "").toLowerCase();
}

/**
 * Parse the proposed files for a skill_request entity from its `files` JSON
 * property (array of {path, content, type}), with a `skill_content` fallback
 * for older single-file requests.
 */
function parseFiles(props: Record<string, unknown>): SkillFile[] {
  const raw = props.files;
  const out: SkillFile[] = [];

  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const f of parsed) {
          const path = String(f?.path ?? "").trim();
          if (!path) continue;
          const content = String(f?.content ?? "");
          const type = (f?.type as SkillFileType) || classifyPath(path);
          out.push({ path, content, type });
        }
      }
    } catch {
      /* fall through to skill_content */
    }
  }

  const hasSkillMd = out.some((f) => f.type === "skill_md");
  if (!hasSkillMd) {
    const skillContent = props.skill_content;
    if (typeof skillContent === "string" && skillContent.trim()) {
      out.unshift({ path: "SKILL.md", content: skillContent, type: "skill_md" });
    }
  }

  return out;
}

/** target_skill relation may arrive as a string id or an object with identifier. */
function targetSkillId(relations: Record<string, unknown> | undefined): string | undefined {
  const rel = relations?.target_skill;
  if (typeof rel === "string" && rel) return rel;
  if (rel && typeof rel === "object") {
    const id = (rel as { identifier?: string }).identifier;
    if (id) return id;
  }
  if (Array.isArray(rel) && rel.length) {
    const first = rel[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") return (first as { identifier?: string }).identifier;
  }
  return undefined;
}

function buildGroups(files: SkillFile[]): { skillMd: SkillFile | undefined; groups: FileGroup[] } {
  const skillMd = files.find((f) => f.type === "skill_md");
  const groups: FileGroup[] = GROUP_ORDER
    .map((type) => ({ type, label: GROUP_LABELS[type], files: files.filter((f) => f.type === type) }))
    .filter((g) => g.files.length > 0);
  return { skillMd, groups };
}

function isMarkdown(file: SkillFile): boolean {
  return file.type === "skill_md" || file.path.toLowerCase().endsWith(".md");
}

function fileName(path: string): string {
  return path.split("/").pop() || path || "untitled";
}

/* ── Icons ── */

function IconFile({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 12h6M9 16h4M6 2h8l4 4v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCode({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconImage({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon({ type }: { type: SkillFile["type"] }) {
  if (type === "script") return <IconCode />;
  if (type === "asset") return <IconImage />;
  return <IconFile />;
}

/* ── Sub-components ── */

function Spinner({ msg }: { msg: string }) {
  return (
    <div className="state-panel">
      <svg className="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"
          strokeDasharray="50" strokeDashoffset="15" />
      </svg>
      <span>{msg}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="state-panel">
      <IconFile size={28} />
      <p className="state-msg">No proposed content in this request.</p>
      <p className="state-sub">The request has no SKILL.md or supporting files to show.</p>
    </div>
  );
}

function Badge({ label, variant }: { label: string; variant: "green" | "blue" | "purple" | "gray" }) {
  return <span className={`badge badge-${variant}`}>{label}</span>;
}

function FileNav({
  skillMd,
  groups,
  selectedPath,
  onSelect,
}: {
  skillMd: SkillFile | undefined;
  groups: FileGroup[];
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  return (
    <nav className="file-nav">
      {skillMd && (
        <button
          type="button"
          className={`file-nav-row ${selectedPath === skillMd.path ? "file-nav-row-active" : ""}`}
          onClick={() => onSelect(skillMd.path)}
          title={skillMd.path}
        >
          <IconFile />
          <span className="file-nav-name">{fileName(skillMd.path)}</span>
        </button>
      )}

      {groups.map((group) => (
        <div key={group.type} className="file-nav-group">
          <div className="file-nav-group-label">{group.label}</div>
          {group.files.map((file) => (
            <button
              key={file.path}
              type="button"
              className={`file-nav-row ${selectedPath === file.path ? "file-nav-row-active" : ""}`}
              onClick={() => onSelect(file.path)}
              title={file.path}
            >
              <FileIcon type={file.type} />
              <span className="file-nav-name">{fileName(file.path)}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function MarkdownOrRaw({ file }: { file: SkillFile }) {
  if (isMarkdown(file)) {
    return (
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content}</ReactMarkdown>
      </div>
    );
  }
  return <pre className="raw-content">{file.content}</pre>;
}

/* ── Main app ── */

export default function App() {
  const { entity, portToken, portApiBaseUrl } = usePostMessageData();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("diff");

  const skillId = targetSkillId(entity?.relations);
  const ctx = { baseUrl: portApiBaseUrl ?? "", token: portToken ?? "" };
  const canFetchCurrent = !!portApiBaseUrl && !!portToken && !!skillId;

  const currentQuery = useQuery({
    queryKey: ["request-view-current", skillId, portToken],
    queryFn: () => fetchCurrentFiles(ctx, skillId!),
    enabled: canFetchCurrent,
    staleTime: 60 * 1000,
  });

  if (!portApiBaseUrl || !portToken) return <Spinner msg="Connecting to Port…" />;
  if (!entity?.identifier) {
    return (
      <div className="state-panel">
        <p className="state-msg">Embed this widget on a skill request entity page.</p>
      </div>
    );
  }

  const props = entity.properties ?? {};
  const files = parseFiles(props);
  if (files.length === 0) return <EmptyState />;

  const { skillMd, groups } = buildGroups(files);
  const hasSupporting = groups.length > 0;

  const activePath = selectedPath ?? skillMd?.path ?? files[0]?.path ?? "";
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  // Match the proposed file to its current counterpart by file name.
  const currentFiles: CurrentFile[] = currentQuery.data ?? [];
  const currentMatch = currentFiles.find((f) => baseName(f.path) === baseName(activeFile.path));
  const baselineContent = currentMatch?.content ?? "";

  const requestType = props.request_type as string | undefined;
  const status = props.status as string | undefined;

  return (
    <div className="viewer">
      {/* Header */}
      <div className="viewer-header">
        <div className="viewer-title">{entity.title ?? entity.identifier}</div>
        <div className="viewer-badges">
          {requestType === "create"        && <Badge label="Create"         variant="green"  />}
          {requestType === "update"        && <Badge label="Update"         variant="blue"   />}
          {status === "pending_review"     && <Badge label="Pending review" variant="blue"   />}
          {status === "approved"           && <Badge label="Approved"       variant="green"  />}
          {status === "denied"             && <Badge label="Denied"         variant="gray"   />}
          {status === "applied"            && <Badge label="Applied"        variant="purple" />}
        </div>
      </div>

      {/* Body: nav + content */}
      <div className={`viewer-body ${hasSupporting ? "viewer-body-split" : ""}`}>
        {hasSupporting && (
          <FileNav
            skillMd={skillMd}
            groups={groups}
            selectedPath={activePath}
            onSelect={setSelectedPath}
          />
        )}

        <div className="content-pane">
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "diff"}
              className={tab === "diff" ? "tab active" : "tab"}
              onClick={() => setTab("diff")}
            >
              Diff
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "content"}
              className={tab === "content" ? "tab active" : "tab"}
              onClick={() => setTab("content")}
            >
              Proposed
            </button>
          </div>

          {tab === "diff" ? (
            currentQuery.isLoading ? (
              <Spinner msg="Loading current version…" />
            ) : (
              <DiffView oldText={baselineContent} newText={activeFile.content} />
            )
          ) : (
            <MarkdownOrRaw file={activeFile} />
          )}
        </div>
      </div>
    </div>
  );
}
