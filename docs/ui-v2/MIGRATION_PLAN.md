# ATRIUM UI V2 — Migration Plan

Status: Gate 3 plan; implementation has not started

Baseline: `c1c8d06e4c883fb43107c1584ccdbbd446516cf3`

Implementation branch: `ui-v2`

## 1. Migration objective

Deliver the Organic Editorial V2 incrementally while preserving the exact current functional system:

- one Store;
- one Auth/App runtime;
- one backend/API set;
- one revision and 409 contract;
- one schema/data version contract;
- one set of domain feature operations;
- two temporarily selectable presentations, only one active at a time.

No phase may use a business-rule change to make the redesign easier. A crossing of the functional firewall in `DESIGN_CONTRACT.md` stops the UI phase and becomes a separate **FUNCTIONAL CHANGE**.

## 2. Pilot decision

### 2.1 Comparison

| Criterion | Dashboard | Processes |
|---|---|---|
| Exercises the shell | High: sidebar, topbar, global search, status, page hierarchy, contextual actions. | High, but the table dominates the evaluation. |
| Exercises design tokens | High: canvas, surfaces, typography, cards, metrics, statuses, filters, task rows, right rail. | Medium/high: surface, table, filters, buttons, badges. |
| Exercises critical states | High: publication count, deadlines, tasks, agenda reminders, source health, sync/save status. | Medium: empty/search/sort/monitoring plus record details. |
| Mutation risk in the pilot | Containable: render is mostly read-only; task completion and New Task can initially retain the current functional modal/callback. | Higher: row interaction opens a 30+ field edit-capable form; sort, TJRS consultation, financial and secrecy fields are intertwined. |
| Responsive learning | High: current 206 px mobile topbar and stacked metrics expose shell/density decisions. | High: current 887 px table inside 353 px exposes data-priority decisions. |
| Representative shared primitives | Shell, command bar, metrics, cards, status, filter, task row, empty state, alerts. | Table, search, filters, row action, badge, read/edit detail. |
| Ability to compare success | Strong: “what requires attention now?” has a clear qualitative contract. | Strong for scanning density but requires table/detail policy to be settled first. |

### 2.2 Decision

**Dashboard is the first pilot.**

Reason:

1. It validates the highest-leverage shared surface—the shell—before feature-specific tables and long forms.
2. It exercises the approved direction without requiring a new Process edit workflow.
3. It can consume the current `createDashboardFeature()` calculations and actions unchanged (`js/features/dashboard.js:3-291`).
4. It gives an objective product question: can a lawyer identify overdue work, pending publications, deadlines, agenda, synchronization health, and save state in the first viewport?
5. It matches the product preference and the audit found no technical advantage strong enough to move Processes first.

Processes is deliberately second. It becomes the proof that V2’s softer editorial shell can support geometrically precise legal data without decorative distortion.

## 3. Migration strategy

### 3.1 Vertical slices, not a big-bang restyle

Each phase must deliver a complete vertical slice:

1. semantic structure and V2 styles;
2. Classic parity;
3. keyboard/focus/state behavior;
4. existing feature callbacks and Store results;
5. light/dark and multi-viewport evidence;
6. no-regression evidence;
7. one bounded reviewable commit/gate.

Do not globally replace colors, radii, or class names before a primitive and its consumers are in the same validated slice.

### 3.2 Presenter boundary

Feature modules continue to own domain read models and actions. A V2 renderer may receive data and callbacks from the same feature, but it cannot import a second Store or reproduce save/sync rules.

Preferred evolution:

```text
feature
  ├─ derive current view model from Store
  ├─ select active presenter: classic | v2
  └─ bind the same feature actions to the active presentation
```

Constraints:

- no simultaneous Classic/V2 operational trees;
- no duplicate IDs;
- no duplicate listeners or timers;
- no state synchronization between presentations because there is only one Store;
- the presentation mode is read from local UI preference before paint;
- switching mode may re-render the active view but may not reload Store, flush, save, audit, or mutate the API.

### 3.3 Toggle release policy

The mode mechanism can exist internally in Phase 1, but a broad user-visible V2 toggle is held until Phase 9 parity. Before then:

- Classic is the safe default;
- V2 is an explicit local preview for migrated surfaces;
- an unmigrated route cannot silently receive partially overridden Classic CSS;
- testers can always return to Classic using a local presentation control that does not touch Store.

## 4. Nine implementation phases

Gate 3 documentation is not counted as an implementation phase. The planned implementation has **nine phases**.

### Phase 1 — Foundation, isolation, shell, and Dashboard pilot

Scope:

- introduce local-only `data-ui="classic|v2"` selection and preference version;
- establish the Classic/V2 stylesheet firewall;
- implement V2 semantic tokens for light and dark;
- implement first primitives: Button, IconButton, Field shell, Card, Metric, StatusBadge, SegmentedControl, InlineAlert, SystemStatusBar, EmptyState, Dialog foundation;
- implement global focus-visible and reduced-motion contracts;
- build V2 shell, sidebar, topbar/command bar, mobile navigation drawer, and theme control;
- migrate Dashboard presentation only;
- retain current Dashboard calculations, task completion callback, New Task callback, Store, sync, and navigation IDs;
- add V2-specific visual fixtures and Classic/V2 parity probes.

Explicitly out of scope:

- Process table redesign;
- publication treatment redesign;
- task modal business behavior;
- public rollout of V2;
- Store/settings migration.

Exit criteria:

- Classic screenshots/behavior remain green;
- toggling mode produces zero Store/API/revision mutations and one App runtime;
- Dashboard answers the seven questions in `DESIGN_CONTRACT.md` in the first desktop viewport;
- Dashboard V2 passes 1440, 1280, 1024, 768, 430, 390, 360, and 320 in both themes, plus current broader matrix where applicable;
- keyboard navigation and focus work for shell, search entry, Dashboard actions, filters, metrics, and task rows;
- no success state appears before existing operation completion.

### Phase 2 — Processes and the dense-data contract

Scope:

- implement DataTable, sortable header button, row action, compact metadata, and mobile RecordList;
- migrate Process filters, search, rows, monitoring/secrecy/risk/fee badges;
- introduce a read-first Process detail Drawer while retaining the existing edit fields and `saveProcess()` contract;
- preserve official TJRS action, linked task/intimation summary, financial/requisition fields, and record identity.

Exit criteria:

- every current cell value and action is available in V2;
- same query/sort yields same ordered record IDs in Classic and V2;
- mobile exposes Latest Movement and Monitoring without unexplained horizontal scroll;
- edit submit produces the same Store record and audit behavior;
- no process secrecy or financial field is omitted.

### Phase 3 — Publications and supervised legal workflow

Scope:

- migrate publication metrics, filters, list/detail, act/treatment/urgency states, and email actions;
- implement PublicationRow, PublicationDetail, and supervised TreatmentStepper;
- make original text, process identity, treatment revision, and human confirmation hierarchy explicit;
- replace autonomous wording in presentation copy with supervised/assistive wording, without changing behavior.

Exit criteria:

- same filter/sort returns the same publication IDs;
- all treatment transitions and 409 behavior remain exact;
- linked task creation and deadline confirmation use current callbacks;
- original publication text is preserved and never truncated in the actionable detail;
- email actions and errors remain equivalent.

### Phase 4 — Tasks/Kanban and Agenda

Scope:

- migrate Kanban columns/cards, task detail, timer/timesheet, completion/reopen, and task filters;
- add explicit keyboard/touch “Move to…” alternative while preserving drag-and-drop;
- migrate Agenda list, mini-calendar, filters, event detail, and external calendar state;
- reuse shared task/event primitives on Dashboard without duplicating feature logic.

Exit criteria:

- moving, completing, reopening, timing, and saving a task yield identical state/audit results;
- keyboard users can perform every Kanban status move;
- Agenda aggregation contains the same tasks/intimations/events and dates;
- judicial sync and calendar sync remain distinct in copy and status.

### Phase 5 — Relationship: Contacts and Leads/Atendimentos

Scope:

- migrate Contacts table/search/detail/edit;
- migrate Leads/Atendimentos filters, rows, stages, and forms;
- implement related-record links to Process/Contact using existing IDs and `App.switchView()` pathways;
- validate phone-call search journey.

Exit criteria:

- same searches/sorts produce same record IDs;
- no contact document/channel data is lost or exposed incorrectly;
- lead stage/save behavior remains exact;
- global search selection remains deterministic by record ID.

### Phase 6 — Financial and Documents

Scope:

- migrate Financial metrics, filters, table, entry dialog, currency/status presentation;
- migrate Documents catalog, generator, preview, custom documents, and downloads;
- apply tabular numerals and long-content/read-only patterns.

Exit criteria:

- same financial input produces exactly the same canonical record and validation result;
- manual amounts, fee percentages, requisitions, and notes are preserved;
- document type IDs/aliases, inputs, generated content, and download behavior are unchanged;
- no success before persistence/generation completion.

### Phase 7 — Intelligence: Assistant and Prompt Library

Scope:

- migrate Assistant onboarding, key setup presentation, chat, quick prompts, loading/error messages;
- migrate Prompt Library filters, cards, create/edit/delete flows;
- clarify AI limits and supervised legal use in UI copy.

Exit criteria:

- same configured-key and request pathways; no key rendered/logged beyond current secure behavior;
- same chat payload and error handling;
- prompt IDs/content and deletion confirmations remain exact;
- loading/partial/error is explicit and never represented as generated success.

### Phase 8 — System, integrations, administration, and secondary modules

Recommended internal order:

1. Monitoring;
2. Integrations/Judicial Setup;
3. Email and external-calendar configuration;
4. Configuration and Office Identity;
5. Importer;
6. Audit;
7. Links;
8. Auth visual shell.

Scope includes source health, DataJud, certificate/TOTP/portal coverage, diagnostic, backups/restore presentation, configuration catalogs/users, import preview, audit filters, and links.

Exit criteria:

- security-sensitive forms preserve current request, masking, autocomplete, session, and RBAC rules;
- sync/source partial failures are explicit;
- backup/restore confirmations and atomic behavior remain unchanged;
- importer never claims success before canonical persistence;
- Audit displays the same events and filters;
- Auth visual migration changes no endpoint, CSRF, TOTP, trusted-device, recovery, or session behavior.

### Phase 9 — Full parity, accessibility, performance, and controlled rollout

Scope:

- add every one of the 17 views to Classic/V2 visual coverage;
- complete keyboard, zoom, contrast, reduced-motion, and screen-reader walkthroughs;
- run cross-mode state/revision/network parity suite;
- verify no duplicate runtime/listeners/timers;
- measure performance and remove V2 preview-only diagnostics;
- expose the presentation-only toggle to beta users only after all reachable routes have V2 coverage;
- keep Classic as recovery path; do not remove it in this phase.

Exit criteria:

- all current functional, security, persistence, visual, and E2E suites green;
- both themes and all current viewport fixtures green for all views;
- mode toggle is mutation-free and survives reload locally;
- no P0/P1 V2 UX finding remains open;
- rollback to Classic is immediate and data-neutral;
- release decision is documented separately.

## 5. Recommended module order

Condensed order:

```text
foundation/isolation/tokens/primitives
→ shell + Dashboard
→ Processes
→ Publications
→ Tasks/Kanban
→ Agenda
→ Contacts
→ Leads/Atendimentos
→ Financial
→ Documents
→ Assistant
→ Prompts
→ Monitoring
→ Judicial/Email/Calendar integrations
→ Configuration/Office Identity/System Admin
→ Importer
→ Audit
→ Links
→ Auth visual shell
→ parity and rollout
```

This ordering follows shared-component leverage and functional risk. It does not follow visual novelty.

## 6. Validation contract per phase

### 6.1 Static/diff gate

- only files declared by the phase;
- `git diff --check`;
- no unexpected Store/server/lib/API/schema/auth/RBAC/financial/publication logic diff;
- Classic and V2 selectors stay within their stylesheet boundary;
- no new dependency without a separately justified gate.

### 6.2 Runtime identity gate

Instrument in tests, not production:

- `App.init()` once;
- `Store.load()` once;
- one Store instance;
- one sync interval and retry timer set;
- shared component listeners not duplicated;
- one active presentation DOM;
- no duplicate IDs.

The current foundation and boot tests already protect the single module graph and runtime; V2 tests must extend, not replace, them (`tests/frontend_module_foundation.mjs`, `tests/frontend_module_boot.mjs`).

### 6.3 Cross-mode mutation gate

For a frozen synthetic Store snapshot:

1. record Store state hash, revision, schemaVersion, dataVersion, network mutation count, audit length, timers/listeners;
2. switch Classic → V2 → Classic;
3. assert exact equality for all recorded operational values;
4. assert no POST/PUT/PATCH/DELETE, no `save()`, no `flush()`, no new audit event;
5. assert only approved local UI keys changed.

### 6.4 Semantic parity gate

For each migrated view, compare rather than merely screenshot:

- rendered record IDs;
- counts/amounts/dates/status labels;
- filter and sort result IDs;
- action callback and payload;
- save/flush result;
- error/conflict/permission/reauth behavior;
- audit event and canonical revision where applicable.

Different pixels are expected. Different legal/business meaning is a failure.

### 6.5 Visual and accessibility gate

- current 11 viewports and both themes from `tests/visual-qa.mjs:13-25`;
- all 17 views before rollout, not the current subset of 11;
- screenshots must be unique where views differ and stable for the same fixture;
- no unexpected overlay and no global horizontal overflow;
- critical component bounds and sticky behavior assertions;
- keyboard-only journey A–H;
- focus visible and not clipped;
- dialog/drawer containment and focus return;
- 200% zoom/reflow;
- contrast for every semantic state;
- reduced motion;
- touch target and mobile critical-field discoverability.

### 6.6 State gate

Each migrated critical component demonstrates, when applicable:

- normal;
- hover and focus;
- loading;
- empty;
- success;
- warning;
- error;
- offline;
- partial;
- unsaved;
- conflict 409;
- sync running/failed;
- permission denied;
- reauthentication.

Fixtures must use synthetic data and real current callbacks. “Success” fixtures cannot bypass a failed functional step.

## 7. Objective improvement criteria

Gate acceptance does not use invented click/time numbers. It uses the following objective comparisons:

| Objective | Evidence |
|---|---|
| Safer state interpretation | A user can identify saved/unsaved/sync/conflict/offline from persistent labelled state; test verifies the label matches the actual operation result. |
| Faster record location | Global search is fully operable by keyboard and pointer and selects the same record ID; controlled usability timing may be added after a baseline measurement. |
| Better start-of-day hierarchy | The first 1440×900 viewport exposes late tasks, deadlines needing confirmation, untreated publications, next agenda item, sync health, and save state. |
| Better mobile disclosure | Critical process movement/monitoring data is directly visible or reached through a labelled detail action without unexplained horizontal exploration. |
| Better accessibility | Complete keyboard flows, visible focus, Dialog/Drawer containment, AA contrast, 200% zoom, and reduced motion pass. |
| No functional drift | Cross-mode state hash, revision, network mutation count, record IDs, and callback results remain equal. |
| Maintainable themes | V2 components use semantic tokens and both themes share component structure/state rules; no selector-by-selector light patchwork. |

Only after baseline task measurements exist may the team set percentage or time targets.

## 8. Risk register

| Risk | Level | Why it is high | Mitigation / stop condition |
|---|---|---|---|
| Classic CSS contaminates V2 | High visual | `portal.css` combines global, feature, responsive, and light overrides. | Stylesheet firewall before pilot; no unscoped V2 rules; mode-specific screenshot diff. |
| V2 renderer changes fixed IDs/listeners | Highest functional | Features and `App` bind through stable IDs and rerendered targets. | Preserve IDs/callbacks; one active tree; listener-count and semantic-parity tests. |
| Mode toggle mutates Store/revision | Highest functional | Current onboarding mixes local UI preference with Store settings. | Dedicated local preference service; spy on save/flush/network/audit/revision. Any mutation fails. |
| Publication/task redesign alters supervised sequence | Critical | Treatment, task creation, deadline, and 409 are coupled safety flows. | Migrate after shell/process patterns; exact functional fixtures; no inferred state. |
| Financial/process form loses fields | Critical | Process modal contains financial, requisition, secrecy, monitoring, and legal metadata. | Field-by-field inventory and round-trip equality; read-first Drawer does not remove edit controls. |
| Mobile simplification hides legal context | High | Current table already hides critical columns through horizontal scroll. | Column-priority contract plus labelled detail; semantic assertions at mobile widths. |
| Success UI precedes persistence | Critical | Attractive optimistic motion can misrepresent durability. | Success is driven only by existing resolved operation; durable error persists. |
| Visual QA gives false confidence | High | Current suite covers 11/17 views and only global page overflow. | Expand views and add component-level/semantic assertions before V2 rollout. |
| Two runtimes/listener graphs | High | A duplicated hidden V2 app would sync and mutate twice. | Runtime identity probes; duplicate DOM/Store/timer is a hard stop. |
| Large migration diff becomes unreviewable | High | 4,697-line Classic CSS and 17 views invite bulk restyle. | Nine gated vertical slices, small commits, and rollback at each phase. |

Highest visual-regression risk: the Classic dark-first global CSS plus its large light override layer interacting with V2 shell, responsive layout, and feature-specific rules.

Highest functional-regression risk: presentation renderers or the mode toggle duplicating listeners/runtime or altering fixed IDs, Store save/flush/revision, especially across Publications → Tasks → deadlines and Processes → Financial fields.

## 9. Rollback and recovery

- `ui-v2-start` remains the immutable pre-V2 baseline.
- Classic remains the default/recovery presentation until a separate retirement gate.
- Every phase can be disabled through the local presentation preference without touching data.
- A failed V2 render must not auto-write, migrate, or repair Store. The safe response is to return to Classic presentation and report the error.
- Rollback is code/presentation rollback only; no data rollback is necessary because presentation changes are forbidden from mutating the data contract.
- No force push, tag movement, or main merge occurs as part of an implementation gate without explicit release authorization.

## 10. Foundation Gate handoff

The next gate may implement only Phase 1:

- tokens;
- primitives;
- Classic/V2 isolation;
- presentation-only internal toggle;
- shell/sidebar/topbar/theme;
- approved Dashboard pilot;
- V2-specific Visual QA and Classic/V2 mutation/parity tests.

It must not start Processes or any later phase, and it must stop if isolation, mutation-free toggling, Classic parity, or the Dashboard pilot cannot be proven.
