import React, { useEffect, useMemo, useState } from 'react';
import { usePostMessageData } from './hooks/usePostMessageData';
import { fetchSkills, SkillEntity } from './api/skills';

interface Skill {
  id: string; title: string; group: string | null;
  spec: number; disc: number; clar: number; maint: number; overall: number;
  has_version: boolean; has_owner: boolean; has_trigger: boolean;
  has_steps: boolean; has_examples: boolean; has_failure: boolean;
  has_fm: boolean; has_name: boolean; has_desc: boolean;
}

function num(v: unknown): number { return typeof v === 'number' ? v : 0; }

function normalise(e: SkillEntity): Skill {
  const p = e.properties;
  const spec = num(p.spec_compliance_score), disc = num(p.discoverability_score),
        clar = num(p.clarity_score),          maint = num(p.maintainability_score);
  const overall = Math.round((spec + disc + clar + maint) / 4);
  const rel = e.relations;
  return {
    id: e.identifier, title: e.title || e.identifier,
    group: typeof rel.skill_to_skill_group === 'string' ? rel.skill_to_skill_group : null,
    spec, disc, clar, maint, overall,
    has_version:  !!p.has_version,  has_owner:    !!p.has_owner,
    has_trigger:  !!p.has_trigger_hint, has_steps: !!p.has_steps,
    has_examples: !!p.has_examples, has_failure:  !!p.has_failure_modes,
    has_fm: !!p.has_frontmatter,   has_name:     !!p.has_name,
    has_desc: !!p.has_description,
  };
}

/* ── Score helpers ── */
function scoreCls(n: number) { return n >= 80 ? 'great' : n >= 60 ? 'good' : n >= 40 ? 'ok' : 'poor'; }
function barCls(n: number)   { return n >= 80 ? 'bar-great' : n >= 60 ? 'bar-good' : n >= 40 ? 'bar-ok' : 'bar-poor'; }
function scoreLabel(n: number) { return n >= 80 ? 'Great' : n >= 60 ? 'Good' : n >= 40 ? 'Needs work' : 'Poor'; }

/* ── Dimensions ── */
const DIMS = [
  { key: 'spec',  label: 'Structure',    tip: 'Proper frontmatter: name, version, owner, description' },
  { key: 'disc',  label: 'Findability',  tip: 'Trigger hints that tell AI when to apply this skill' },
  { key: 'clar',  label: 'Clarity',      tip: 'Numbered steps and examples for easy execution' },
  { key: 'maint', label: 'Maintenance',  tip: 'Owner declared, versioned — someone is responsible' },
] as const;

/* ── Gap definitions ── */
interface GapDef {
  key: string; label: string; short: string; why: string; fix: string;
  impact: 'High' | 'Medium' | 'Low'; color: string; check: (s: Skill) => boolean;
}
const GAPS: GapDef[] = [
  { key: 'trigger', label: 'Missing "When to Use"', short: 'When to use', impact: 'High',   color: '#d97706',
    why: 'Without triggers, AI agents can\'t know when to apply this skill.',
    fix: 'Add a "## When to Use" section with 2–3 bullet points.',
    check: s => !s.has_trigger },
  { key: 'steps',   label: 'No step-by-step instructions', short: 'Steps missing', impact: 'High',   color: '#0891b2',
    why: 'Skills without numbered steps are ambiguous and get skipped.',
    fix: 'Add a "## Steps" section with numbered instructions.',
    check: s => !s.has_steps },
  { key: 'owner',   label: 'No owner declared', short: 'No owner', impact: 'Medium', color: '#db2777',
    why: 'Skills without an owner become stale with no one accountable.',
    fix: 'Add `owner: your-name` to the frontmatter.',
    check: s => !s.has_owner },
  { key: 'version', label: 'No version declared', short: 'No version', impact: 'Medium', color: '#7c3aed',
    why: 'Without versions, teams can\'t tell if a skill is current.',
    fix: 'Add `version: 1.0.0` to the frontmatter.',
    check: s => !s.has_version },
  { key: 'examples',label: 'Missing examples', short: 'No examples', impact: 'Medium', color: '#2563eb',
    why: 'Examples make skills concrete and dramatically improve adoption.',
    fix: 'Add a "## Examples" section with 1–2 real scenarios.',
    check: s => !s.has_examples },
  { key: 'failure', label: 'No failure notes', short: 'No notes', impact: 'Low',    color: '#16a34a',
    why: 'Undocumented edge cases lead to mistakes in production.',
    fix: 'Add a "## Notes" section with known pitfalls.',
    check: s => !s.has_failure },
];

function skillGaps(s: Skill) { return GAPS.filter(g => g.check(s)); }

type View = 'overview' | 'gap' | 'skill';
type SortKey = 'score_asc' | 'score_desc' | 'name_asc' | 'gaps_desc';
const PAGE_SIZE = 15;

/* ── Mini score bar ── */
function MiniBar({ val, width = 100 }: { val: number; width?: number }) {
  return (
    <div className="mini-bar-track" style={{ width }}>
      <div className={`mini-bar-fill ${barCls(val)}`} style={{ width: `${val}%` }} />
    </div>
  );
}

/* ── Score ring (SVG donut) ── */
function ScoreRing({ value, size = 72 }: { value: number; size?: number }) {
  const r = (size - 8) / 2, circ = 2 * Math.PI * r;
  const colors: Record<string, string> = { great: '#16a34a', good: '#2563eb', ok: '#d97706', poor: '#dc2626' };
  const cls = scoreCls(value);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,.06)" strokeWidth="7" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={colors[cls]} strokeWidth="7"
        strokeDasharray={`${circ * value / 100} ${circ}`}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fontSize="16" fontWeight="700" fill={colors[cls]}>{value}</text>
    </svg>
  );
}

export default function App() {
  const { portToken, portApiBaseUrl } = usePostMessageData();
  const [skills, setSkills]   = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [view, setView]         = useState<View>('overview');
  const [activeGap, setActiveGap]     = useState<GapDef | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [query, setQuery]   = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score_asc');
  const [page, setPage]     = useState(1);

  useEffect(() => {
    if (!portToken || !portApiBaseUrl) return;
    fetchSkills(portApiBaseUrl, portToken)
      .then(e => { setSkills(e.map(normalise)); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [portToken, portApiBaseUrl]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return skills.filter(s => !q || s.title.toLowerCase().includes(q) || (s.group ?? '').toLowerCase().includes(q));
  }, [skills, query]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortKey === 'score_desc') return b.overall - a.overall;
    if (sortKey === 'name_asc')   return a.title.localeCompare(b.title);
    if (sortKey === 'gaps_desc')  return skillGaps(b).length - skillGaps(a).length;
    return a.overall - b.overall;
  }), [filtered, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated  = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const avg      = skills.length ? Math.round(skills.reduce((s,x) => s+x.overall, 0) / skills.length) : 0;
  const gapCards = GAPS.map(g => ({ ...g, count: skills.filter(g.check).length }))
                       .filter(g => g.count > 0)
                       .sort((a,b) => b.count - a.count);

  const dimAvgs = DIMS.map(d => ({
    ...d,
    avg: skills.length ? Math.round(skills.reduce((s,x) => s + (x[d.key] as number), 0) / skills.length) : 0,
  }));

  /* ── States ── */
  if (!portToken || !portApiBaseUrl) return <Spinner msg="Connecting to Port…" />;
  if (loading) return <Spinner msg="Loading skills…" />;
  if (error)   return <div className="state-panel state-error">Failed to load: {error}</div>;

  /* ── Skill detail ── */
  if (view === 'skill' && selectedSkill) {
    const s = selectedSkill;
    const gaps = skillGaps(s);
    const passing = GAPS.filter(g => !g.check(s));
    return (
      <div className="page">
        <button className="back-btn" onClick={() => setView('overview')}>← Back to overview</button>
        <div className="skill-header">
          <div>
            <div className="skill-detail-title">{s.title}</div>
            {s.group && <div className="skill-detail-group">{s.group}</div>}
          </div>
          <ScoreRing value={s.overall} size={80} />
        </div>

        <div className="dim-strip">
          {DIMS.map(d => {
            const val = s[d.key] as number;
            return (
              <div key={d.key} className="dim-card" title={d.tip}>
                <div className="dim-top">
                  <span className="dim-label">{d.label}</span>
                  <span className={`dim-score ${scoreCls(val)}`}>{val}</span>
                </div>
                <div className="dim-bar-track">
                  <div className={`dim-bar-fill ${barCls(val)}`} style={{ width: `${val}%` }} />
                </div>
                <div className="dim-sublabel">{scoreLabel(val)}</div>
              </div>
            );
          })}
        </div>

        {gaps.length > 0 && (
          <div className="section-block">
            <div className="section-title">What to fix · {gaps.length} gap{gaps.length !== 1 ? 's' : ''}</div>
            <div className="fix-list">
              {gaps.map(g => (
                <div key={g.key} className="fix-card">
                  <div className="fix-card-head">
                    <span className="fix-dot" style={{ background: g.color }} />
                    <span className="fix-card-label">{g.label}</span>
                    <span className={`impact-pill impact-${g.impact.toLowerCase()}`}>{g.impact} impact</span>
                  </div>
                  <p className="fix-why">{g.why}</p>
                  <div className="fix-how"><strong>Fix:</strong> {g.fix}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {passing.length > 0 && (
          <div className="section-block">
            <div className="section-title">What's working · {passing.length}</div>
            <div className="passing-grid">
              {passing.map(g => (
                <div key={g.key} className="passing-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="#16a34a" opacity=".15"/>
                    <path d="M7 12l3.5 3.5L17 9" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {g.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Gap drill-down ── */
  if (view === 'gap' && activeGap) {
    const affected = skills.filter(activeGap.check).sort((a,b) => a.overall - b.overall);
    return (
      <div className="page">
        <button className="back-btn" onClick={() => setView('overview')}>← Back to overview</button>
        <div className="gap-header">
          <span className="gap-header-dot" style={{ background: activeGap.color }} />
          <div>
            <div className="gap-header-title">{activeGap.label}</div>
            <div className="gap-header-sub">{affected.length} of {skills.length} skills affected</div>
          </div>
          <span className={`impact-pill impact-${activeGap.impact.toLowerCase()}`}>{activeGap.impact} impact</span>
        </div>
        <div className="explainer-card">
          <p><strong>Why it matters:</strong> {activeGap.why}</p>
          <p><strong>How to fix:</strong> {activeGap.fix}</p>
        </div>
        <div className="section-block">
          <div className="section-title">Affected skills</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Skill</th><th>Group</th><th>Quality score</th><th>Other gaps</th><th></th></tr></thead>
              <tbody>
                {affected.map(s => (
                  <tr key={s.id} className="skill-row" onClick={() => { setSelectedSkill(s); setView('skill'); }}>
                    <td><div className="skill-name">{s.title}</div></td>
                    <td><span className="muted-text">{s.group ?? '—'}</span></td>
                    <td>
                      <div className="quality-cell">
                        <MiniBar val={s.overall} width={80} />
                        <span className={`score-chip ${scoreCls(s.overall)}`}>{s.overall}</span>
                        <span className="score-label-xs">{scoreLabel(s.overall)}</span>
                      </div>
                    </td>
                    <td><span className="other-gaps-badge">{Math.max(0, skillGaps(s).length - 1)} other</span></td>
                    <td className="arrow-cell">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* ── Overview ── */
  const [curKey, curDir] = sortKey === 'score_desc' ? ['score', 'desc'] : sortKey === 'name_asc' ? ['name', 'asc'] : sortKey === 'gaps_desc' ? ['gaps', 'desc'] : ['score', 'asc'];
  return (
    <div className="page">

      {/* Hero — score + dim breakdown */}
      <div className="hero-card">
        <div className="hero-left">
          <ScoreRing value={avg} size={88} />
          <div className="hero-text">
            <div className="hero-title">Avg quality score</div>
            <div className="hero-counts">
              <span className="hc great">{skills.filter(s => s.overall >= 80).length} great</span>
              <span className="hc-sep">·</span>
              <span className="hc good">{skills.filter(s => s.overall >= 60 && s.overall < 80).length} good</span>
              <span className="hc-sep">·</span>
              <span className="hc ok">{skills.filter(s => s.overall >= 40 && s.overall < 60).length} needs work</span>
              <span className="hc-sep">·</span>
              <span className="hc poor">{skills.filter(s => s.overall < 40).length} poor</span>
            </div>
          </div>
        </div>
        <div className="hero-dims">
          {dimAvgs.map(d => (
            <div key={d.key} className="hero-dim" title={d.tip}>
              <div className="hero-dim-top">
                <span className="hero-dim-label">{d.label}</span>
                <span className={`hero-dim-score ${scoreCls(d.avg)}`}>{d.avg}</span>
              </div>
              <div className="mini-bar-track">
                <div className={`mini-bar-fill ${barCls(d.avg)}`} style={{ width: `${d.avg}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Where to focus */}
      {gapCards.length > 0 && (
        <div className="section-block">
          <div className="section-title">Where to focus</div>
          <div className="gap-grid">
            {gapCards.map(g => (
              <button key={g.key} className="gap-card" onClick={() => { setActiveGap(g); setView('gap'); }}>
                <div className="gap-card-top">
                  <span className="gap-card-dot" style={{ background: g.color }} />
                  <span className={`impact-pill impact-${g.impact.toLowerCase()}`}>{g.impact}</span>
                </div>
                <div className="gap-card-label">{g.label}</div>
                <div className="gap-card-count">{g.count} skill{g.count !== 1 ? 's' : ''} affected</div>
                <div className="gap-card-track">
                  <div className="gap-card-bar" style={{ width: `${Math.round(g.count/skills.length*100)}%`, background: g.color + 'cc' }} />
                </div>
                <div className="gap-card-cta">See affected skills →</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All skills table */}
      <div className="section-block">
        <div className="section-title">All skills</div>
        <div className="filter-bar">
          <div className="search-wrap">
            <svg className="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input className="search-input" placeholder="Search skills…" value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }} />
          </div>
          <span className="result-count">{sorted.length} skill{sorted.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {([
                  { k: 'name', label: 'Skill' },
                  { k: 'score', label: 'Overall' },
                  { k: 'score', label: 'Structure' },
                  { k: 'score', label: 'Findability' },
                  { k: 'score', label: 'Clarity' },
                  { k: 'score', label: 'Maintenance' },
                ]).map((col, i) => {
                  const sortMap: Record<string, SortKey> = { name: 'name_asc', score: sortKey === 'score_asc' ? 'score_desc' : 'score_asc' };
                  return (
                    <th key={i} className={i <= 1 ? 'sortable-th' : ''}
                      onClick={i <= 1 ? () => { setSortKey(sortMap[col.k]); setPage(1); } : undefined}>
                      {col.label}
                      {i === 1 && <span className="sort-arrow"> {sortKey === 'score_desc' ? '↓' : '↑'}</span>}
                    </th>
                  );
                })}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0
                ? <tr><td colSpan={7} className="empty-cell">No skills match</td></tr>
                : paginated.map(s => (
                  <tr key={s.id} className="skill-row" onClick={() => { setSelectedSkill(s); setView('skill'); }}>
                    <td>
                      <div className="skill-name">{s.title}</div>
                      {s.group && <div className="skill-group-tag">{s.group}</div>}
                    </td>
                    <td>
                      <div className="quality-cell">
                        <MiniBar val={s.overall} width={64} />
                        <span className={`score-chip ${scoreCls(s.overall)}`}>{s.overall}</span>
                      </div>
                    </td>
                    <td><DimCell val={s.spec} /></td>
                    <td><DimCell val={s.disc} /></td>
                    <td><DimCell val={s.clar} /></td>
                    <td><DimCell val={s.maint} /></td>
                    <td className="arrow-cell">›</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="pager">
            <button className="pager-btn" disabled={page <= 1} onClick={() => setPage(p => p-1)}>Prev</button>
            <span className="pager-info">Page {page} of {totalPages}</span>
            <button className="pager-btn" disabled={page >= totalPages} onClick={() => setPage(p => p+1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

function DimCell({ val }: { val: number }) {
  return (
    <div className="dim-cell">
      <MiniBar val={val} width={52} />
      <span className={`score-chip-sm ${scoreCls(val)}`}>{val}</span>
    </div>
  );
}

function Spinner({ msg }: { msg: string }) {
  return (
    <div className="state-panel">
      <svg className="spinner" width="22" height="22" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="50" strokeDashoffset="15"/>
      </svg>
      <span>{msg}</span>
    </div>
  );
}
