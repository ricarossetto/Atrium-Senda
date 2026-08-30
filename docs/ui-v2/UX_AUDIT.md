# ATRIUM UI V2 — UX Audit

Status: Gate 3 — discovery only

Baseline audited: `c1c8d06e4c883fb43107c1584ccdbbd446516cf3`

Branch: `ui-v2`

Date: 2026-08-29

## 1. Scope and evidence

This audit evaluates the current ATRIUM interface as a dense, desktop-first legal B2B application. It does not propose changes to Store, persistence, authentication, RBAC, APIs, judicial integrations, financial rules, publication treatment, deadline confirmation, or any other functional contract.

Evidence used:

- direct source inspection of `index.html`, `css/portal.css`, `js/portal.js`, `js/components/`, `js/features/`, and the required architecture documents;
- current regression contracts in `tests/shared_components.mjs`, `tests/frontend_module_foundation.mjs`, `tests/frontend_module_boot.mjs`, and `tests/visual-qa.mjs`;
- local browser inspection at 1440×900 and 390×844 in both light and dark themes, using only the synthetic `sampleState` from `js/core/store.js:33-103` and a temporary local authentication account;
- DOM and computed-layout measurements; no human or production data and no audit screenshots committed.

The static shell contains 17 operational views, 17 sidebar destinations, 15 modal backdrops, five HTML tables, approximately 185 buttons, 64 inputs, 15 selects, and 393 unique element IDs (`index.html:97-2242`). This is a real product surface, not a single dashboard skin.

## 2. Current product model

### 2.1 What the current UI does well enough to preserve

- It exposes the complete product without a frontend framework. The single ES-module composition imports 21 feature modules and five shared components (`js/portal.js:13-34`, `js/portal.js:301-642`).
- It keeps a single Store and a single application lifecycle. `App.init()` loads Store once, binds the interface, renders all features, performs silent synchronization, and installs one periodic sync (`js/portal.js:695-708`).
- Navigation is direct and shallow: every principal module is one sidebar action away, and `App.switchView()` is the canonical view transition (`js/portal.js:737-738`, `js/portal.js:799-824`).
- Domain features already own their rendering and actions. Dashboard, Processes, Publications, Tasks, Agenda, Financial, and the other modules are not anonymous markup fragments (`js/features/dashboard.js:3-291`, `js/features/processes.js:3-258`).
- Synthetic visual QA covers 11 view types, two themes, and 11 viewports from 1920×1080 through 320×700, checks active-view identity, unexpected overlays, horizontal page overflow, and screenshot uniqueness (`tests/visual-qa.mjs:13-42`, `tests/visual-qa.mjs:302-361`).
- Critical state persistence is revision-safe in the existing Store. The current UI V2 work must consume it, not reproduce it (`js/core/store.js:170-356`).

These are functional assets. The V2 must change presentation without replacing them.

### 2.2 Current information architecture

The sidebar has four visible groups (`index.html:116-299`):

1. **Principal:** Área de trabalho, Gestão kanban, Agenda.
2. **Processual:** Processos e casos, Publicações, Atendimentos, Contatos, Financeiro.
3. **Inteligência IA:** Criação de peças IA, Biblioteca de Prompts, Documentos.
4. **Ajustes & Sistema:** Monitoramento, Integrações & A1, Configurações, Importador, Alertas/Auditoria, Links Úteis.

The grouping is technically consistent but not aligned to the user’s daily decision sequence. Frequent operational work, relationship management, financial work, content generation, and system administration coexist at the same visual level. The current label “Principal” also includes Kanban and Agenda while Processos and Publicações—the most legally consequential queues—sit in another group.

The proposed V2 grouping should therefore be treated as a change in information architecture labels and ordering only. It must not rename `data-view` identifiers, feature modules, APIs, collections, or routes.

## 3. Visual inspection findings

### 3.1 Desktop, 1440×900

The shell reserves 258 px for the fixed sidebar (`css/portal.css:113-177`). The topbar occupies about 126 px and presents theme, global search, onboarding, documents, sync, notifications, and session controls before contextual page actions (`index.html:309-363`, `css/portal.css:390-449`). The usable workspace is adequate, but attention is split across too many equally styled actions.

The Dashboard shows four equal metric cards, a task queue, four right-rail widgets, an environment banner, and two contextual actions (`index.html:365-516`). It answers several questions, but it does not establish one dominant “requires action now” queue. “Tarefas atrasadas” is a small counter inside the right rail, while less urgent counts receive equal or greater area.

Light mode is more legible than the current dark default, but visually resembles a generic white SaaS because the dark-first stylesheet is corrected by a large selector-by-selector light override block (`css/portal.css:2993-4027`). Dark mode is atmospheric, but the combination of small text, gold accents, several near-black surfaces, and dense cards increases fatigue.

### 3.2 Mobile, 390×844

The Dashboard topbar measured approximately 206 px high—about one quarter of the initial viewport. Search disappears, while four global actions become icon-only. The first operational metric starts below the header, environment banner, date context, and two contextual actions (`css/portal.css:832-877`). This is usable as a fallback but not a prioritized mobile workflow.

Processes uses a 353 px visible table container for an approximately 887 px table. The page itself avoids global overflow, so the existing Visual QA assertion passes, but Monitoring and Latest Movement are off-screen with no explicit scroll affordance. In legal work, “no page overflow” is not equivalent to “critical information is discoverable.” The underlying pattern is `.responsive-table { overflow-x: auto; }` (`css/portal.css:631`) around the six-column table (`index.html:737-746`).

The off-canvas sidebar occupies 258 px and leaves underlying content visible without a dedicated scrim. It has its own long scroll and does not visibly establish focus containment. This creates click-target ambiguity and a weak modal relationship on a 390 px screen (`css/portal.css:832-859`).

### 3.3 Search and modal inspection

Global search is visually prominent on desktop and correctly searches Processes, Contacts, Tasks, and Publications (`js/components/global-search.js:48-109`). However, its results are plain `div.search-palette-item` nodes with no role, tab stop, `aria-expanded`, `aria-controls`, `aria-activedescendant`, ArrowUp/ArrowDown navigation, or Enter selection. Live inspection confirmed that four results could only be selected by pointer; the component handles input, Escape, global shortcut, and click only (`js/components/global-search.js:10-43`).

The generic modal has `role="dialog"`, `aria-modal="true"`, and a labelled title in HTML, and it focuses the first input without stealing an already established field focus (`index.html:1478-1484`, `js/components/modal.js:12-31`, `tests/shared_components.mjs:98-130`). It does not trap focus or restore focus to its invoker on close (`js/components/modal.js:33-38`). Feature-specific modal implementations repeat independent backdrop, body-overflow, close, and autofocus logic.

The New Task modal exposes roughly fourteen fields in one scrolling surface. The Process modal builds more than thirty fields in the same generic two-column form (`js/features/tasks.js:253-388`, `js/features/processes.js:156-221`). This preserves capability but imposes high scanning and completion cost.

## 4. Prioritized findings

Severity definitions: P0 threatens or blocks operation; P1 has major impact on a frequent or safety-relevant flow; P2 creates material friction; P3 is polish. Category tags use the vocabulary required by this gate.

| ID | Priority | Categories | Finding and evidence | Real user impact | V2 contract response |
|---|---|---|---|---|---|
| UX-01 | P1 | FEEDBACK, UX | Save, sync, conflict, and persistence failures ultimately surface through transient Toasts removed after 4.3 seconds (`js/components/toast.js:1-8`, `js/portal.js:1247-1276`, `js/portal.js:1342-1346`). | A lawyer can miss whether data was durable or whether it is safe to continue. | Add persistent save/sync status and recoverable error banners; Toast is supplementary only. |
| UX-02 | P1 | ACCESSIBILITY, CONSISTENCY | There is no global `:focus-visible` contract. Focus styling is limited to selected inputs and the password toggle (`css/portal.css:409-410`, `css/portal.css:786-793`). | Keyboard users cannot reliably track focus across navigation, cards, tables, and actions. | Every interactive primitive receives a WCAG-visible focus ring and tested tab order. |
| UX-03 | P1 | ACCESSIBILITY, UX | Search results are pointer-only generic nodes with no combobox/listbox semantics or Arrow/Enter interaction (`js/components/global-search.js:10-43`, `js/components/global-search.js:80-109`). | The first-class cross-product locator is inaccessible by keyboard and assistive technology. | Implement an accessible combobox/listbox while retaining the same search data and selection callbacks. |
| UX-04 | P1 | DENSITY, UX, ACCESSIBILITY | At 390×844, the Dashboard topbar measured ~206 px, search is hidden, and main actions become unlabeled icons (`css/portal.css:832-877`). | Mobile users lose a quarter of the initial viewport and cannot scan action meaning. | Define a compact mobile command bar, 44 px targets, accessible labels, and an explicit search entry. |
| UX-05 | P1 | DENSITY, INFORMATION ARCHITECTURE | Processes measured ~887 px of table content inside 353 px. Critical columns are discoverable only by horizontal scrolling (`index.html:737-746`, `css/portal.css:631`). | Latest movement and monitoring state can be overlooked under pressure. | Use priority columns plus mobile row/detail composition; retain a precise desktop table. |
| UX-06 | P1 | UX, FEEDBACK | Public-facing copy promises “triagem autônoma de intimações” and the judicial setup footer promises “Sincronização Judicial Autônoma” (`index.html:16-29`, `index.html:1554`). | The interface can overstate autonomy despite the product’s mandatory human confirmation boundaries. | Replace autonomy claims in a content pass with supervised/assistive language; never change the underlying rule. |
| UX-07 | P1 | CONSISTENCY, ACCESSIBILITY | The shell has 17 views, but the main Visual QA `VIEWS` matrix covers 11. Leads, Monitoring, Importer, Configuration, Prompts, and Links are not in that multi-viewport loop (`index.html:365-1277`, `tests/visual-qa.mjs:27-42`). | V2 regressions in six screens could pass the current visual gate. | Extend parity coverage before declaring each V2 migration complete. |
| UX-08 | P1 | ACCESSIBILITY, CONSISTENCY | The generic modal and multiple feature backdrops lack one shared focus trap/return-focus/body-lock contract (`js/components/modal.js:1-38`; 15 backdrops in `index.html:1478-2240`). | Focus may escape behind a dialog; close behavior differs by feature. | One Dialog primitive owns focus, Escape, return focus, scroll lock, labelling, and nested-dialog policy. |
| UX-09 | P2 | INFORMATION ARCHITECTURE, UX | Seventeen sidebar destinations and six global topbar actions compete without frequency or current-task prioritization (`index.html:116-363`). | Experienced users scan repeated visual noise; new users cannot infer the principal workflow. | Reorder labels into Overview, Work, Relationship, Management, Intelligence, System without changing view IDs. |
| UX-10 | P2 | INFORMATION ARCHITECTURE, DENSITY | Dashboard metrics and right-rail widgets have nearly equal visual weight; overdue work and sync failure are not dominant (`index.html:365-516`, `js/features/dashboard.js:58-291`). | “What needs attention now?” requires cross-reading several regions. | Lead with one prioritized attention queue and a persistent system-state strip. |
| UX-11 | P2 | UX, DENSITY | Task and Process data entry use long monolithic scrolling modals (`js/features/tasks.js:253-388`, `js/features/processes.js:156-221`). | High field count increases omission, re-reading, and accidental edits. | Use progressive sections and a Drawer for long records; keep validation and save callbacks unchanged. |
| UX-12 | P2 | VISUAL, CONSISTENCY | Real root tokens coexist with repeated hardcoded colors, radii, shadows, transitions, and a large light-theme override layer (`css/portal.css:9-92`, `css/portal.css:451-483`, `css/portal.css:2993-4027`). | Theme parity is expensive and component states drift. | V2 declares a closed semantic token contract; Classic CSS is isolated and never imported as a V2 token source. |
| UX-13 | P2 | ACCESSIBILITY, DENSITY | Operational labels commonly render at 9.5–12.5 px, including metric captions and helper text (`css/portal.css:410`, `css/portal.css:451`, `css/portal.css:481-483`). | Long sessions and high-pressure reading become tiring, especially on lower-density displays. | Default operational text is 14 px; 12 px is reserved for truly secondary metadata with AA contrast. |
| UX-14 | P2 | ACCESSIBILITY, CONSISTENCY | Sortable table headers are clickable `<th>` elements without nested buttons or tab stops (`index.html:740-745`, `js/portal.js:787-796`). | Keyboard and screen-reader users cannot reliably discover or invoke sorting. | Header sort uses a real button, `aria-sort`, visible direction, and a 40 px hit area. |
| UX-15 | P2 | ACCESSIBILITY, UX | Kanban movement is implemented through dragstart/dragover/drop, and empty columns instruct users to drag (`js/features/tasks.js:70-107`). | Keyboard and touch users lack an equivalent explicit move action. | Retain drag as acceleration; add “Move to…” menu and announce the result. |
| UX-16 | P2 | ACCESSIBILITY, UX | Mobile sidebar opens without a clear scrim/focus boundary; underlying content remains visible (`css/portal.css:832-859`). | Users can lose context or interact with the wrong layer. | Treat mobile navigation as a modal drawer with scrim, focus containment, Escape/back, and focus return. |
| UX-17 | P2 | ACCESSIBILITY, CONSISTENCY | Theme control displays the current theme text but exposes no `aria-pressed` or switch semantics (`js/components/theme.js:16-33`, `index.html:319-323`). | The control’s state/action is ambiguous to assistive technology and some sighted users. | Use a labelled menu or switch: current value is state; accessible name describes the action. |
| UX-18 | P2 | CONSISTENCY, UX | Onboarding writes `guidedTourSeen` to Store as well as localStorage and does not preserve/restore invoker focus or page scroll (`js/components/onboarding.js:38-61`). Live dismissal left the document around 151 px from the top. | A presentation preference can cause an unnecessary operational save, and the user can return to an unexpected viewport. | All UI-only preferences remain local; Dialog restores focus and scroll explicitly. |
| UX-19 | P2 | CONSISTENCY, FEEDBACK | Empty, loading, and error states are assembled per feature, often with inline HTML/style (`js/features/dashboard.js:126-131`, `js/features/audit.js:71`, `js/features/system-admin.js:17-30`). | Similar conditions look and behave differently and often lack a next action. | Provide EmptyState, LoadingState, ErrorState, OfflineState, and PermissionState primitives with optional recovery action. |
| UX-20 | P3 | VISUAL, CONSISTENCY | Icon vocabulary mixes inline SVG, emoji, text glyphs, and ASCII marks; no icon library exists (`index.html:116-363`, feature render templates). | Visual tone and baseline alignment vary. | Use a small local SVG icon set; no large library dependency. |
| UX-21 | P3 | VISUAL | Gold appears in navigation, headings, borders, primary actions, metrics, and status accents (`css/portal.css:9-92`, `css/portal.css:451-483`). | Institutional emphasis competes with operational meaning. | Gold is identity/accent only; primary actions use green and statuses use semantic colors. |
| UX-22 | P3 | VISUAL, ACCESSIBILITY | Motion values are scattered and include translate-on-hover; no `prefers-reduced-motion` rule exists (`css/portal.css:313-314`, `css/portal.css:451-474`). | Motion feels inconsistent and cannot be reduced centrally. | Use 120–220 ms state motion, no operational scale/rotation, and a global reduced-motion override. |
| UX-23 | P3 | VISUAL, DENSITY | Dates, counts, currency, process numbers, and timers do not share a tabular-numeral contract. | Dense columns and counters are harder to compare line by line. | Apply `font-variant-numeric: tabular-nums` to legal numbers, dates, currency, duration, and counts. |

### 4.1 Counts

- **P0:** 0
- **P1:** 8
- **P2:** 11
- **P3:** 4
- **Total:** 23

There is no P0 discovered in this UI-only audit. P1 does not mean the current functional baseline is rejected; it means the corresponding V2 surface cannot be considered complete until the issue has an objective validation.

### 4.2 Top 10 UX findings

1. Durable save/sync/conflict state cannot depend on a 4.3-second Toast.
2. Keyboard focus is not globally visible or consistently contained in dialogs.
3. Global search is pointer-only despite being the fastest cross-module journey.
4. Mobile header density hides search and delays operational content.
5. Mobile tables hide legally significant columns behind unexplained horizontal scroll.
6. Autonomous-operation copy conflicts with supervised legal workflow boundaries.
7. Multi-viewport Visual QA omits six of 17 views.
8. Fifteen modal implementations lack one accessibility and behavior contract.
9. The Dashboard does not make overdue work and system failure dominant enough.
10. Classic CSS values and light overrides do not form a maintainable two-theme design system.

## 5. Journey audit

No click-time or task-time metrics were collected; all assessments below are qualitative and evidence-based.

| Journey | Current surfaces and context changes | What is difficult or risky now | V2 opportunity |
|---|---|---|---|
| A. Start of day | Dashboard → Publications/Kanban/Agenda/Monitoring; Dashboard metrics dispatch to other views through `data-view-link` (`index.html:365-516`, `js/portal.js:738`). | Overdue tasks, unreviewed publications, upcoming agenda, unhealthy sources, save state, and last sync are split across equal-weight cards and side widgets. | One “Attention today” queue ordered by legal urgency, followed by calendar and workload; persistent save/sync health in shell. |
| B. New publication | Publications list → detail → treatment/discard → optional linked task → deadline confirmation (`js/features/publications.js:313-617`). | List/detail is capable but status, treatment, urgency, and downstream task creation compete. Several modal variants interrupt context. | Preserve split view on desktop; show a clear supervised sequence and immutable original text, with task/deadline confirmation as explicit steps. |
| C. Locate process | Global search or sidebar → Processes search → row → large edit/detail modal (`js/components/global-search.js:48-109`, `js/features/processes.js:59-221`). | Search selection is pointer-only; process row opens an edit-capable long form rather than a calm read-first record. | Keyboard combobox; Process read view/drawer first; edit is a deliberate secondary action. |
| D. Phone call: client → process → context | Global search can return Contacts and Processes, then switches view and opens the record (`js/portal.js:984-1014`). | Results do not expose keyboard navigation and context is split across separate feature records. | Search result preview with client/process/court and a single deterministic jump; related-record links in read drawer. |
| E. Agenda today/week | Dashboard reminders → Agenda; Agenda has filters, list, mini-calendar, and external sync (`js/features/agenda.js:80-337`). | Dashboard shows only a small reminder panel; system sync and calendar sync are visually similar but conceptually different. | Today/next event appears in attention hierarchy; calendar connection state is explicit and separate from judicial sync. |
| F. Financial record | Dashboard statistic or sidebar → Financial filters/table → financial-entry modal (`index.html:554-603`, `js/features/financial.js:3-237`). | Monetary fields share a modal pattern with other CRUD records; success/failure feedback is transient. | Tabular currency, explicit record type, calculation summary, durable save state, and no semantic rule changes. |
| G. Judicial synchronization | Global Sync → flush → `/api/sync` → canonical state → render (`js/portal.js:1247-1276`); Monitoring/Integrations for configuration. | Progress is a Toast; source-level progress, partial completion, cancellation policy, and durable final state are not first-class. | Shell sync-status component with running/partial/failed/success timestamps and source details; success only after canonical persistence. |
| H. Failure | Toast, inline feature error, auth gate, or diagnostics depending on source (`js/portal.js:1342-1346`, `js/features/system-admin.js:17-30`). | The user may not know whether data was saved, whether retry is safe, or whether reauthentication is required. | Standard error taxonomy: unsaved, conflict 409, offline, permission denied, reauthentication, integration partial, and fatal recovery; each names the safe next action. |

## 6. Cognitive walkthrough

| Persona | Likely hesitation or ambiguity | Risk of incorrect action | Required V2 response |
|---|---|---|---|
| Experienced, fast lawyer | Repeatedly scans 17 sidebar items and equal-weight Dashboard cards; global actions move position/wrap at smaller widths. | Opens a configuration surface or misses a late-task indicator while moving quickly. | Stable command hierarchy, first-class keyboard search, compact tables, and attention sorting. |
| Lawyer with low technical familiarity | “Monitoramento”, “Integrações & A1”, sync icons, DataJud/DJEN, and autonomous copy do not explain the boundary between configuration and daily work. | Assumes collection or deadline creation is automatic and final. | Plain-language supervised states, contextual help, and human-confirmation status near the action. |
| Lawyer under deadline pressure | Small metadata, transient errors, and visually equal cards require careful reading. | Interprets a Toast or colored badge as durable success; misses conflict/offline state. | Persistent save/sync state, large target, deadline queue, explicit error recovery, no decorative motion. |
| Secretary/assistant locating a record | Search is excellent in scope but not keyboard-operable; process and contact context open in separate views. | Uses slower sidebar/table scanning or chooses similarly named records. | Accessible global combobox, disambiguating metadata, and read-first related-record drawer. |
| New user | Onboarding is detailed but overlays an already dense shell; navigation groups expose system functions immediately. | Skips the tour and lacks a clear first safe task, or reads autonomy language literally. | Role-oriented first-run checklist, concise supervised language, and progressive disclosure of system administration. |

## 7. Reuse assessment

### A. Real reusable components

- `createModal()` provides dynamic field rendering and the functional submit bridge (`js/components/modal.js`). Reuse its contract, not its current visual/focus implementation.
- `Toast` provides a centralized event outlet (`js/components/toast.js`). Keep the call surface while replacing rendering with a V2 notification primitive.
- `createTheme()` centralizes theme preference (`js/components/theme.js`). Its local-only approach is correct for a presentation mode; its key/semantics need a migration contract.
- `createGlobalSearch()` centralizes four-domain search and navigation callbacks (`js/components/global-search.js`). Preserve its query and selection behavior while replacing interaction semantics.
- `createOnboarding()` centralizes first-run slides (`js/components/onboarding.js`). Preserve content flow but remove Store persistence for purely visual state in a later functional-safe migration.

### B. Repeated patterns that should become primitives

Buttons, icon buttons, fields, segmented filters, cards, metric cards, data tables, status badges, empty/loading/error states, sync status, sidebar items, topbar actions, modal/drawer shells, and read-only detail groups are repeated across `index.html`, `css/portal.css`, and feature templates. The exact mapping is in `COMPONENT_INVENTORY.md`.

### C. Feature-specific presentation that should remain feature-specific

- Publication treatment states and human-confirmation sequence (`js/features/publications.js`).
- Kanban columns, task timer, and task movement semantics (`js/features/tasks.js`).
- Process summary, court consultation, financial/requisition fields (`js/features/processes.js`).
- Agenda recurrence/calendar behavior (`js/features/agenda.js`).
- Financial entry types and validation (`js/features/financial.js`).
- Document catalog/generator (`js/features/documents.js`).
- Judicial source, certificate, and TOTP setup (`js/features/judicial-integrations.js`).

V2 can change how these are arranged, but it must call the same feature operations and render the same canonical state.

## 8. Acceptance implications

The V2 is objectively better only if it passes all of the following, not merely if stakeholders prefer its appearance:

- every frequent action is keyboard-operable with a visible focus indication;
- Dashboard communicates overdue work, unreviewed publications, upcoming commitments, sync health, and durability without visiting another screen;
- presentation toggling causes zero Store mutations, zero revision changes, and zero persistence requests;
- critical mobile information is visible or explicitly disclosed without unexplained horizontal exploration;
- every migrated view has normal, loading, empty, error, offline, permission, unsaved, conflict, and reauthentication behavior where applicable;
- the same synthetic state produces semantically equivalent values and actions in Classic and V2;
- all 17 views enter the visual parity matrix before V2 release;
- the user-visible success state is emitted only after the current functional operation reports success and, where applicable, canonical persistence completes.

Quantitative task-time and click-count targets should be set only after a controlled baseline study. This Gate deliberately does not invent those measurements.
