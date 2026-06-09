import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchSkillFiles, type SkillFile } from "./api/skills";
import { usePostMessageData } from "./hooks/usePostMessageData";

/* ── Helpers ── */

const FILE_TYPE_LABEL: Record<SkillFile["type"], string> = {
  skill_md: "SKILL.md",
  reference: "References",
  script: "Scripts",
  asset: "Assets",
  other: "Other",
};

const FILE_TYPE_ORDER: SkillFile["type"][] = [
  "skill_md",
  "reference",
  "script",
  "asset",
  "other",
];

function groupFiles(files: SkillFile[]): Record<string, SkillFile[]> {
  const groups: Record<string, SkillFile[]> = {};
  for (const f of files) {
    if (!groups[f.type]) groups[f.type] = [];
    groups[f.type].push(f);
  }
  return groups;
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
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M9 12h6M9 16h4M6 2h8l4 4v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="state-msg">No content found for this skill.</p>
      <p className="state-sub">The skill may not have a version or SKILL.md file yet.</p>
    </div>
  );
}

function Badge({ label, variant }: { label: string; variant: "green" | "blue" | "purple" | "gray" }) {
  return <span className={`badge badge-${variant}`}>{label}</span>;
}

function FileTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`file-tab ${active ? "file-tab-active" : ""}`}
      onClick={onClick}
    >
      {label}
      {count > 1 && <span className="file-tab-count">{count}</span>}
    </button>
  );
}

function SupportingFile({ file }: { file: SkillFile }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="support-file">
      <button
        type="button"
        className="support-file-header"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M9 12h6M9 16h4M6 2h8l4 4v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="support-file-path">{file.path}</span>
        <svg
          className={`chevron ${open ? "chevron-open" : ""}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <pre className="support-file-content">{file.content}</pre>
      )}
    </div>
  );
}

/* ── Main app ── */

export default function App() {
  const { entity, portToken, portApiBaseUrl } = usePostMessageData();
  const [activeTab, setActiveTab] = useState<SkillFile["type"]>("skill_md");

  const ctx = { baseUrl: portApiBaseUrl ?? "", token: portToken ?? "" };
  const ready = !!portApiBaseUrl && !!portToken && !!entity?.identifier;

  const filesQuery = useQuery({
    queryKey: ["skill-view-files", entity?.identifier, portToken],
    queryFn: () => fetchSkillFiles(ctx, entity!.identifier),
    enabled: ready,
    staleTime: 60 * 1000,
  });

  if (!portApiBaseUrl || !portToken) {
    return <Spinner msg="Connecting to Port…" />;
  }

  if (!entity?.identifier) {
    return (
      <div className="state-panel">
        <p className="state-msg">Embed this widget on a skill entity page.</p>
      </div>
    );
  }

  if (filesQuery.isLoading) return <Spinner msg="Loading skill content…" />;

  if (filesQuery.isError) {
    return (
      <div className="state-panel state-error">
        <p className="state-msg">Failed to load skill content.</p>
        <p className="state-sub">
          {filesQuery.error instanceof Error ? filesQuery.error.message : "Unknown error"}
        </p>
        <button className="retry-btn" onClick={() => void filesQuery.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const files = filesQuery.data ?? [];
  if (files.length === 0) return <EmptyState />;

  const groups = groupFiles(files);
  const tabs = FILE_TYPE_ORDER.filter((t) => !!groups[t]);
  const activeFiles = groups[activeTab] ?? groups[tabs[0]];
  const currentTab = groups[activeTab] ? activeTab : tabs[0];

  // Metadata from entity properties
  const props = entity.properties ?? {};
  const location = props.location as string | undefined;
  const status = props.status as string | undefined;

  return (
    <div className="viewer">
      {/* Header */}
      <div className="viewer-header">
        <div className="viewer-title">{entity.title ?? entity.identifier}</div>
        <div className="viewer-badges">
          {status === "active" && <Badge label="Active" variant="green" />}
          {status === "deprecated" && <Badge label="Deprecated" variant="gray" />}
          {status === "draft" && <Badge label="Draft" variant="blue" />}
          {location === "global" && <Badge label="Global" variant="purple" />}
          {location === "project" && <Badge label="Project" variant="blue" />}
        </div>
      </div>

      {/* Tabs (only shown when there are supporting files) */}
      {tabs.length > 1 && (
        <div className="file-tabs">
          {tabs.map((t) => (
            <FileTab
              key={t}
              active={currentTab === t}
              label={FILE_TYPE_LABEL[t]}
              count={groups[t].length}
              onClick={() => setActiveTab(t)}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="viewer-body">
        {currentTab === "skill_md" ? (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {activeFiles[0]?.content ?? ""}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="support-files">
            {activeFiles.map((f) => (
              <SupportingFile key={f.path} file={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
