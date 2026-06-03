# Port Skill Widgets

Two custom Port plugins for managing skills through the UI:

| Widget | Output file | Purpose |
|--------|-------------|---------|
| **Skill Marketplace** (`skill-catalog`) | `dist/catalog.html` | Dashboard card grid of all skills with readiness scores, search, category grouping, and inline Create / Edit flows |
| **Skill Request Form** (`skill-request-form`) | `dist/skill-request-form.html` | Standalone form for creating or updating skills — markdown editor, multi-file authoring, AI drafting, live diff |

The **Marketplace** embeds the Request Form's create/edit flows inside modal overlays, so most users only need the catalog widget on a dashboard. The standalone Request Form is useful on individual `skill` entity pages (update mode with diff view) or as a dedicated creation page.

---

## Prerequisites

- **Node.js 18+**
- A Port account with the following blueprints (definitions in `port/blueprints/`):

| Blueprint | Role |
|-----------|------|
| `skill` | Holds the skill location (global/project) |
| `skill_file` | Content of all skill files (SKILL.md, references, scripts, assets) |
| `skill_version` | Timestamp of the latest version |
| `skill_group` | Grouping / ownership |
| `skill_request` | Intermediary entity for approval workflows |

Data model: `skill_file` → `skill_version` → `skill` → `skill_group`

- Port client credentials (client ID + secret) for the upload CLI

---

## Quick start

```bash
npm install
npm run build
```

This produces two self-contained HTML files in `dist/`:

```
dist/catalog.html              → Skill Marketplace
dist/skill-request-form.html   → Skill Request Form
```

---

## Upload to Port

```bash
# Skill Marketplace
npx @port-labs/port-plugins-cli upload \
  --client-id  "$PORT_CLIENT_ID" \
  --client-secret "$PORT_CLIENT_SECRET" \
  --file dist/catalog.html \
  --identifier skill-catalog \
  --title "Skills Marketplace" \
  --description "Dashboard card grid with readiness scores, search, filtering, and inline create/edit" \
  --params "$(cat src-catalog/upload-params.json)" \
  --upsert

# Skill Request Form
npx @port-labs/port-plugins-cli upload \
  --client-id  "$PORT_CLIENT_ID" \
  --client-secret "$PORT_CLIENT_SECRET" \
  --file dist/skill-request-form.html \
  --identifier skill-request-form \
  --title "Skill Request Form" \
  --description "Create or update skills with markdown editor, AI drafting, and live diff" \
  --params "$(cat src-skill-request-form/upload-params.json)" \
  --upsert
```

---

## Add to Port UI

### Skill Marketplace (dashboard)

1. Open or create a dashboard page in Port
2. **Edit page** → **Add widget** → **Custom plugin** → **Skills Marketplace**

The marketplace includes "Create Skill" and per-card "Edit" buttons that open modal overlays.

### Skill Request Form (entity page — optional)

1. Open a `skill` entity page
2. **Edit page** → **Add widget** → **Custom plugin** → **Skill Request Form**

The form detects the host `skill` entity and switches to update mode with live diff.

---

## Widget parameters

### Skill Marketplace (`src-catalog/upload-params.json`)

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `skillRequestBlueprint` | `string` | no | Skill request blueprint identifier |
| `skillGroupBlueprint` | `string` | no | Skill group blueprint identifier |
| `aiAgentIdentifier` | `string` | no | Port AI agent identifier for "Create with AI" |

### Skill Request Form (`src-skill-request-form/upload-params.json`)

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `skillRequestBlueprint` | `blueprint` | yes | Blueprint the widget creates entities in |
| `skillBlueprint` | `blueprint` | yes | Skill blueprint (detected on entity pages) |
| `skillGroupBlueprint` | `blueprint` | yes | Blueprint backing the group picker |
| `aiAgentIdentifier` | `string` | no | Port AI agent identifier for "Create with AI" |

---

## Port configuration

### Blueprints

Import the JSON files from `port/blueprints/` to set up the required blueprints. The key ones are:

- `skill_request.json` — the request entity created by the widget
- `skill.json`, `skillFile.json`, `skillVersion.json` — the skill data model
- `group.json` — skill groups for ownership

### GitLab integration (optional)

`port/gitlab-skills-mapping.yaml` contains ingestion mappings for syncing skills from GitLab repositories.

### Approval workflow

The widgets create `skill_request` entities. A separate Port workflow (`skill-approval-workflow`) handles:
- AI-generated summaries of changes
- Slack notifications to `#skill-approvals`
- Admin approval gate
- Entity finalization on approval

---

## Local development

```bash
npm run dev
# Opens with hot reload; loads mock data (no live Port connection)
```

Both widgets include dev mocks in their `dev/mockData.ts` files.

---

## Project structure

```
share/
├── package.json              # unified dependencies
├── tsconfig.json             # shared TypeScript config
├── webpack.config.js         # builds both widgets → dist/
├── src-catalog/              # Skill Marketplace widget
│   ├── App.tsx               # main component (card grid + modals)
│   ├── styles.css            # catalog styles (Port theme tokens)
│   ├── form-styles.css       # embedded form styles
│   ├── upload-params.json    # widget parameters
│   ├── components/           # Modal, CreateFlow, UpdateFlow, etc.
│   ├── api/                  # Port API calls
│   ├── hooks/                # usePostMessageData
│   ├── utils/                # config, draft, diff, SSE
│   └── dev/                  # mock data
├── src-skill-request-form/   # Skill Request Form widget
│   ├── App.tsx               # main component (create/update modes)
│   ├── App.css               # form styles
│   ├── upload-params.json    # widget parameters
│   ├── README.md             # detailed documentation
│   ├── components/           # editor, file manager, AI prompt, etc.
│   ├── api/                  # Port API calls
│   ├── hooks/                # usePostMessageData
│   ├── utils/                # config, draft, diff, SSE
│   └── dev/                  # mock data
└── port/
    ├── blueprints/           # blueprint JSON definitions
    └── gitlab-skills-mapping.yaml
```
