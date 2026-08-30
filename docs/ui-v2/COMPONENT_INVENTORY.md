# ATRIUM UI V2 — Component Inventory

Status: Gate 3 — discovery only

Baseline: `c1c8d06e4c883fb43107c1584ccdbbd446516cf3`

## 1. Frontend stack confirmed from code

| Concern | Current implementation | Evidence | Consequence for UI V2 |
|---|---|---|---|
| Runtime | Native browser ES modules and Vanilla JavaScript. `js/app/bootstrap.js` imports `js/auth.js` and `js/portal.js`; `portal.js` imports core, components, and 21 feature modules. | `index.html:2248`; `js/app/bootstrap.js:1-15`; `js/portal.js:1-34` | No framework or virtual DOM should be introduced. V2 must keep one module graph and one App runtime. |
| Composition | `App` in `js/portal.js` is the composition shell. Feature factories receive Store, formatters, secure fetch, shared modal/toast, callbacks, and render hooks. | `js/portal.js:301-646` | Keep dependency injection and feature boundaries. Add presentation primitives at composition edges, not domain duplication. |
| Lifecycle | `App.init()` loads Store, initializes theme/navigation/actions, renders all, updates status, starts onboarding, syncs silently, and schedules five-minute sync. | `js/portal.js:695-708` | Mode selection must happen before visual paint but may not cause a second `App.init()`, Store load, sync timer, or listener graph. |
| Navigation | In-document view switching through `data-view`, `data-view-link`, `.view.active`, and `App.switchView()`. No URL router. | `index.html:116-299`; `js/portal.js:726-824` | Preserve view IDs and callbacks. V2 navigation is a presenter for the same view state. |
| State | Single `Store` module with `load`, `save`, `flush`, upsert, audit, and conflict/error events. Current schema and data version are 9. | `js/core/store.js:170-356`; `lib/state-migrations.mjs:3-4` | UI mode and theme are not Store data. All V2 reads and writes use this exact Store. |
| CSS | One 4,697-line `css/portal.css`, dark-first root tokens, component/feature rules, scattered breakpoints, and a large light override block. | `css/portal.css:1-4697`; root `css/portal.css:9-92`; light `css/portal.css:2993-4027` | Classic must be behind a stylesheet boundary. V2 cannot append unscoped overrides indefinitely. |
| Fonts | Local `Inter` weights 400/500/600/700 and local `Playfair Display` weights 500/600/700. | `css/portal.css:1-7`, `css/portal.css:79-80` | Reuse Inter for interface and Playfair only for editorial headings. No new font in the Foundation Gate. |
| Icons | No icon library. Inline SVG is used in static HTML; emoji and text glyphs are rendered in HTML and feature templates. | `index.html:116-363`; `js/features/dashboard.js:137-169`; `js/features/tasks.js:74-145` | Establish a small local SVG icon set later; do not add a large dependency. |
| Theme | Dark is the absence of `data-theme`; light is `html[data-theme="light"]`. Preference is localStorage `atrium_theme`, with legacy fallback `jurisflow_theme`. | `js/components/theme.js:1-42`; `css/portal.css:2993-4027` | Keep theme local. V2 should make theme explicit inside its mode boundary and migrate legacy keys without Store writes. |
| Responsive behavior | Desktop fixed sidebar; off-canvas at 860 px; primary breakpoints at 1450, 1180, 860, 620 plus later feature breakpoints at 1100, 900, 768, 720, 600, 520, and 480. | `css/portal.css:803-877`, `css/portal.css:933-934`, `css/portal.css:2984`, `css/portal.css:4063`, `css/portal.css:4679-4697` | Consolidate V2 around declared desktop-first bands and component container needs. Preserve all current tested viewport widths. |
| Shared components | Modal, Toast, Theme, Global Search, and Onboarding are actual modules. | `js/components/*.js`; `tests/shared_components.mjs` | Retain call contracts where safe; replace visuals/semantics incrementally. |
| Feature renderers | Each feature renders into stable DOM IDs and attaches its own local listeners after render. | `js/features/`; examples `dashboard.js:51-291`, `processes.js:59-121` | Do not render Classic and V2 DOM trees simultaneously. One active presentation owns each stable target. |

## 2. Classification

- **A — real reusable component:** centralized implementation already used through a stable contract.
- **B — repeated pattern:** repeated markup/style/behavior that should become a V2 primitive.
- **C — feature-specific:** presentation or behavior whose domain meaning must remain owned by the feature.

“Reusable as-is” means behavior and semantics can be retained without modification. “Needs V2 styling” is purely visual. “Needs refactor” means a bounded presentation refactor is required; it does not authorize a business-rule change.

## 3. Inventory matrix

| Component | Current implementation | Used by | Reusable as-is | Needs V2 styling | Needs refactor | Functional risk | Suggested primitive |
|---|---|---|---|---|---|---|---|
| **Button (B)** | `.button` plus `.gold`, `.ghost`, `.glass`, `.danger-outline`, `.danger-ghost`, and feature-specific classes; 39 px min-height, 9 px radius, translateY hover. | All views and modals; base at `css/portal.css:451-456`. | No | Yes | Yes — normalize variants, disabled/loading, icon position, focus. | Medium: IDs and click listeners must remain. | `Button` with primary, secondary, ghost, danger; sm/md; loading; icon-only forbidden without label. |
| **Icon button (B)** | `.icon-button`, notification, close controls, mobile menu, sync glyphs; mixed SVG/text/emoji. | Topbar, modal headers, mobile shell, publications. | No | Yes | Yes — unify target size and accessible name. | Medium: notification and close IDs are functional. | `IconButton` 40 px desktop/44 px touch, tooltip, visible focus, optional badge. |
| **Input (B)** | Global `.field input`, table search, auth inputs, and many feature-specific input selectors; 42 px common height but different colors/focus rules. | Generic modal, auth, AI, importer, email, judicial setup, all CRUD. | No | Yes | Yes — common label/help/error/loading structure. | High: names, IDs, types, required flags, and FormData contracts must remain. | `Field` + `TextInput`, 40–44 px, 8–10 px radius, described error/help text. |
| **Textarea (B)** | `.field textarea` plus document, AI, prompt, publication variants; some remove outline. | Tasks, processes, assistant, documents, prompts, publication treatment. | No | Yes | Yes — resize, focus, counter/long-text behavior. | High for legal text: value and submission must be byte/meaning preserving. | `TextareaField`, optional monospace/read-only mode, no decorative surface. |
| **Select (B)** | Native selects styled through generic and feature selectors; sortable/filter controls vary. | Dashboard sort, Inbox sort, forms, filters, judicial setup. | Mostly behavior | Yes | Yes — label, focus, compact variant. | Medium: option values are domain contracts. | `SelectField` and `CompactSelect`; never change option values. |
| **Checkbox (B)** | Native checkbox in Dashboard completion, trust-browser control, forms, publication selection, settings. | Dashboard, Auth, Publications, Judicial, Config. | Native behavior only | Yes | Yes — label/hit area/indeterminate/loading. | High: task completion and trust-browser changes are consequential. | `CheckboxField` with 44 px labelled hit area and pending state. |
| **Search (A)** | `createGlobalSearch()` queries four collections and dispatches selection; page/table searches are independent inputs. | Shell; Processes, Contacts, Prompts, Audit. | Query and callback logic only | Yes | Yes — accessible combobox/listbox and keyboard selection. | High: selected target must map to the same record/view. | `CommandSearch` plus `TableSearch`; listbox roles, Arrow keys, Enter, Escape, busy/empty. |
| **Card (B)** | `.card` and many feature-specific containers; current radii/shadows vary. | Dashboard, monitoring, documents, assistant, config, audit, importer. | No | Yes | Yes — remove one-off structural styling. | Low if container-only; medium when entire card is clickable. | `Card`, `CardHeader`, `CardBody`, `CardFooter`, flat/raised/interactive. |
| **Metric card (B)** | Four Dashboard `.metric-card` articles with type classes and `data-view-link`; all same visual weight. | Dashboard; related financial/publication metric patterns. | Data calculations only | Yes | Yes — hierarchy, status, accessibility. | High: counts and destinations must remain exact. | `Metric` and `AttentionMetric`; semantic value, label, trend/status, optional navigation button. |
| **Data table (B)** | `<table>` inside `.responsive-table`; sortable `<th>` click handlers; rows often clickable and re-rendered by feature. | Processes, Contacts, Leads, Financial, Importer. | Data/render logic partly | Yes | Yes — sort buttons, sticky header, row actions, mobile composition. | Very high: fields, sort, record identity, and row actions must not drift. | `DataTable`/`DataTableHeader`; explicit column schema; `aria-sort`; tabular numbers; mobile `RecordList` adapter. |
| **Process row/card (C)** | Six-column row rendered by `processes.js`, including secrecy, NB, fees, risk, official TJRS action, movement, monitoring. | Processes. | No visual reuse | Yes | Yes — read-first detail and column priority. | Very high: secrecy, financial fields, external URL, linked tasks/intimations. | `ProcessRow` + `ProcessDetailDrawer`; stays in Processes feature. |
| **Publication row/card (C)** | Button-based list rows with treatment, urgency, importance, age, act classification; separate detail renderer. | Publications/Inbox, Dashboard metrics, search. | Semantics partly | Yes | Yes — clearer supervised workflow and state hierarchy. | Very high: treatment revision, linked task, deadline confirmation, email. | `PublicationRow`, `PublicationDetail`, `TreatmentStepper`; stays in Publications. |
| **Kanban card (C)** | Draggable `.task-card`; timer, completion, re-open, source tags, date/priority. | Tasks/Kanban and Dashboard task references. | Domain behavior | Yes | Yes — accessible move alternative and consistent tags. | Very high: status move, timesheet, persistence, publication link. | `TaskCard` with drag acceleration plus `MoveMenu`; feature-owned. |
| **Calendar event (C)** | Agenda aggregates agenda/tasks/intimations, renders list/mini calendar, opens generic modal. | Agenda and Dashboard reminders. | Aggregation logic | Yes | Yes — day/week hierarchy and connection state. | High: external calendar source and dates. | `CalendarEventRow`, `MiniCalendar`, `AgendaPanel`; feature-owned. |
| **Financial metric/row (C)** | Financial renderer calculates/filter records and opens a dedicated entry modal. | Financial and Dashboard statistics. | Calculation/output logic | Yes | Yes — tabular currency, type/status grouping. | Very high: manual values, fee/requisition semantics, validation. | `MoneyMetric`, `FinancialRow`, `FinancialEntryDialog`; feature-owned. |
| **Status badge/chip (B)** | `.status-chip`, task tags, treatment badges, deadline chips, risk/fee chips; many one-off color rules. | Nearly every feature. | Labels/data only | Yes | Yes — one semantic scale and non-color cues. | Medium: mapping from domain status to label must remain feature-owned. | `StatusBadge` with neutral/info/success/warning/danger and icon/text. |
| **Tabs / segmented filters (B)** | `.filter-tabs`, Dashboard task filters, Inbox filters, process filters; button markup and active classes vary. | Dashboard, Processes, Publications, Agenda, Financial, Audit, Prompts. | Behavior partly | Yes | Yes — semantics and overflow. | Medium: filter values must stay stable. | `SegmentedControl` for small mutually exclusive sets; `Tabs` only for panel semantics. |
| **Filter bar (B)** | Feature-specific toolbars combine tabs, search, selects, and counts. | Processes, Publications, Financial, Audit, Prompts, Configuration. | No | Yes | Yes — consistent ordering/collapse. | Medium: filter query logic must remain in feature. | `FilterBar` with primary filter, secondary controls, reset, count, mobile disclosure. |
| **Modal/Dialog (A)** | `createModal()` renders dynamic fields and connects to `App.handleModalSubmit`; feature-specific backdrops repeat behavior. | Tasks, Processes, Contacts, Leads, Config, Monitoring, Prompts, Links; special modals elsewhere. | Submit bridge only | Yes | Yes — focus trap/return, scroll lock, variants, shared behavior. | Very high: field names and mode dispatch drive domain saves. | `Dialog` for short decisions/forms; adapter preserves `open(mode, …)` initially. |
| **Drawer (absent)** | No true shared drawer was found. Long forms and record details use large modals. | None currently. | N/A | N/A | New presentation primitive required. | High if introduced around edit workflows; must not change save timing. | `Drawer` for read-first record context and long progressive forms; same callbacks as current modal. |
| **Toast (A)** | Central `Toast.show()` appends text and removes after 4.3 s; `#toastRegion` is `aria-live="polite"`. | All features through `App.toast`. | Call surface only | Yes | Yes — close/action/duration/critical policy. | High for save/sync error interpretation. | `Toast` for ephemeral acknowledgement only; error can be persistent and focusable. |
| **Persistent status/banner (B)** | Environment banner exists; integration/diagnostic errors are local; no shared save/sync/offline/conflict strip. | Dashboard, sync, Store conflict/error, auth. | No | Yes | Yes — centralized state mapping. | Very high: must reflect actual operation result, never infer success. | `SystemStatusBar` and `InlineAlert` with retry/details/reauth actions. |
| **Empty state (B)** | Repeated `.empty-detail`/`.empty-column` strings, often inline-styled and feature-specific. | Publications, Dashboard, Audit, Financial, Links, Monitoring. | Copy only, case by case | Yes | Yes — structure and next action. | Low to medium: “empty” must not mask loading/error/permission. | `EmptyState` with icon optional, title, explanation, safe primary action. |
| **Loading state (B)** | Auth spinner, System Diagnostic spinner, “Verificando…”, and local placeholders; no shared lifecycle. | Auth, System Admin, Judicial setup, Assistant, sync. | No | Yes | Yes — distinguish initial/skeleton/inline/long-running. | High when sync/persistence is involved. | `LoadingState`, `ProgressStatus`; cancellation only if operation supports it. |
| **Error state (B)** | Toasts, `.auth-feedback`, inline diagnostic error, assistant message error, status chips. | Global and feature-specific. | Error text/codes only | Yes | Yes — taxonomy and recovery. | Very high: must distinguish unsaved, 409, offline, permission, session, partial. | `ErrorState`, `InlineAlert`, `ConflictPanel`, `ReauthPrompt`. |
| **Sidebar item (B)** | Button `.nav-item[data-view]`, icon, label, optional count; active state and four groups. | Shell. | IDs/data attributes/click path | Yes | Yes — hierarchy, condensed state, mobile semantics. | High: every destination must still call `App.switchView(view)`. | `NavItem`, `NavGroup`, `NavBadge`; one active destination; visible focus. |
| **Topbar action (B)** | Theme, global search, tour, documents, sync, notifications, user/logout; wraps and hides labels responsively. | Shell. | Functional IDs/callbacks | Yes | Yes — priority and contextual action slot. | Very high: sync/logout/notification behavior. | `CommandBar`: search, contextual action, sync status, user, appearance menu. |
| **Mobile navigation (B)** | `.sidebar.open` off-canvas at ≤860 px; menu button toggles class. No dedicated backdrop primitive. | Shell. | View callbacks only | Yes | Yes — modal drawer behavior. | High: avoid click-through, focus loss, and duplicate navigation. | `NavigationDrawer` with scrim, focus containment, Escape, return focus. |
| **Onboarding (A/C)** | `createOnboarding()` manages six slides, keys/dots, localStorage and Store `guidedTourSeen`. | First access and Configuration. | Slide sequence/content partly | Yes | Yes — Dialog behavior and local-only preference. | Medium: removing Store write must be treated as presentation-state cleanup, not state schema change. | `OnboardingDialog`; UI preference service only. |
| **Auth gate (C)** | Static multi-step setup/register/login/TOTP/recovery UI controlled by `js/auth.js`. | Authentication. | Functional flow only | Yes, late migration | Yes — visual primitives only; no request changes. | Critical: sessions, setup, TOTP, recovery, trusted browser. | `AuthShell` consuming shared Field/Button/Alert; migrate after operational views. |
| **Judicial setup (C)** | Dedicated large modal with certificate, portal coverage, TOTP, statuses, and sync action. | Integrations/Judicial. | Functional flow only | Yes, late migration | Yes — staged setup and clearer supervised copy. | Critical: credentials, TOTP, portal sessions, sync. | `JudicialSetupFlow`; remains feature-owned and security-reviewed. |

## 4. Informal repetition map

### 4.1 Repetition that should be centralized first

1. **Action controls:** `.button`, `.icon-button`, feature-specific colored buttons.
2. **Form controls:** labels, input/select/textarea, helper text, validation feedback.
3. **Container geometry:** card surface, border, radius, padding, elevation.
4. **State communication:** badge, inline alert, save/sync status, loading, empty, error.
5. **Navigation:** sidebar groups/items, command-bar actions, mobile drawer.
6. **Data display:** table header, cell metadata, row action, tabular numerals.
7. **Overlays:** Dialog, Drawer, confirmation, focus and body-scroll policy.

These primitives should be presentation modules with no Store import. They receive values and callbacks.

### 4.2 Patterns that must not be generalized across domain boundaries

- A publication treatment badge is not a generic task status even if the colors match.
- A deadline warning is not inferred by the visual component; it displays the feature’s supplied state.
- Financial success is not inferred from a valid-looking amount; it follows the existing save/flush result.
- Judicial synchronization progress cannot be manufactured by animation; it reflects actual source responses.
- Process secrecy, publication urgency, deadline confirmation, and permission denial retain their current domain sources.

The Design System may standardize presentation, but it may not standardize away legal meaning.

## 5. Shared component migration rule

For every shared component migration:

1. preserve the current public function/callback contract first;
2. add semantic DOM and V2 styling behind `data-ui="v2"`;
3. verify Classic behavior unchanged;
4. verify the V2 variant with the same synthetic Store snapshot;
5. assert no extra Store `save()`/`flush()`, API mutation, listener, timer, or revision change;
6. only then migrate feature-specific call sites.

The existing tests prove selected Modal, Toast, Theme, Search, and conflict behavior (`tests/shared_components.mjs:35-63`, `tests/shared_components.mjs:98-212`). They are necessary but not sufficient for the accessibility and state requirements above.
