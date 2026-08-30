# ATRIUM UI V2 — Design Contract

Status: approved direction, not yet implemented

Baseline: `c1c8d06e4c883fb43107c1584ccdbbd446516cf3`

Design direction: **Organic Editorial / Jurídico Natural**

## 1. Contract statement

ATRIUM V2 is a presentation system for the existing product. It is not a rewrite, a second application, or a second state model.

The target experience is a contemporary legal office organized with the calm of paper, dark wood, and stone, translated into a precise digital workspace. It must communicate serenity, trust, organization, accuracy, humanity, restrained sophistication, and low visual fatigue.

The contract has four non-negotiable priorities:

1. information before ornament;
2. controlled density rather than empty minimalism;
3. visible, predictable operational state;
4. identical functional behavior and data in Classic and V2.

The interface must not resemble a craft app, wellness product, cosmetic site, generic blue SaaS, bank dashboard, heavy government portal, gaming UI, or marketing landing page.

## 2. Functional firewall

UI V2 may read the same values and invoke the same existing callbacks. It may not redefine or bypass any of these contracts:

| Contract | Authoritative implementation | V2 rule |
|---|---|---|
| Store and canonical state | `js/core/store.js:170-356` | One imported Store instance. No V2 Store, mirror, cache, or state copy with independent persistence. |
| Revision and conflict 409 | Store persistence pipeline and `ATRIUM_STORE_PERSISTENCE_ERROR_EVENT`/conflict event (`js/core/store.js:18-20`, `js/portal.js:1342-1346`) | V2 displays the authoritative result. It cannot auto-merge, suppress, or relabel a conflict as success. |
| Schema/data versions | `CURRENT_SCHEMA_VERSION = 9`, `CURRENT_DATA_VERSION = 9` (`lib/state-migrations.mjs:3-4`) | UI mode never changes, migrates, or writes schema/data versions. |
| Persistence | Store `save()`/`flush()` (`js/core/store.js:300-331`) and server state endpoints | No additional save/flush caused by theme, UI mode, layout, tour, sidebar, or density preference. |
| Auth/session/RBAC | `js/auth.js`, `lib/security.mjs`, protected server routes | Same login, CSRF, session, trusted device, role checks, and reauthentication. V2 cannot hide a denial and cannot create a client-side permission assumption. |
| Encryption/backup/recovery | server/security/backup pipeline | Presentation never reads decrypted storage directly and never changes backup or restore ordering. |
| Sync | `App.syncAll()` (`js/portal.js:1247-1276`) | Progress and success reflect the existing operation. Success only after required flush and canonical state processing. |
| DJEN/DataJud/judicial/TOTP | judicial feature modules and server adapters | No change to source, credential, TOTP, session, or supervised action rules. |
| Deadline confirmation | Tasks/Publications functional flow | V2 may clarify confirmation; it may not infer, auto-confirm, or calculate a final legal deadline outside current rules. |
| Publication treatment | `js/features/publications.js:499-617` | Preserve status transitions, revision handling, linked task creation, and human action. |
| Finance | `js/features/financial.js`, financial/process fields | Preserve manual values, validations, calculations, record types, and save semantics exactly. |
| Documents | `js/features/documents.js` and document ID contracts | Preserve document IDs, aliases, generator inputs, and outputs. |
| Email | `js/features/email-integration.js`, publication email paths | Preserve recipients, confirmation, request, and error behavior. |
| Audit | Store/server audit and `js/features/audit.js` | UI operations cannot erase, replace, or omit authoritative audit events. |

Any future diff crossing one of these boundaries must be labelled **FUNCTIONAL CHANGE**, removed from the UI V2 gate, and reviewed under the corresponding functional gate.

## 3. Classic and V2 isolation

### 3.1 One runtime, one active presentation

Recommended architecture:

```text
bootstrap
  ├─ read local UI preference (no Store, no API)
  ├─ select one presentation stylesheet before paint
  └─ initialize current Auth + current App exactly once
          ├─ current Store
          ├─ current feature factories
          ├─ current APIs/security
          └─ one active DOM presentation
```

The root selector contract is:

```text
html[data-ui="classic"]
html[data-ui="v2"]
```

This attribute describes presentation only. It is not a permission, feature flag, schema value, or domain setting.

### 3.2 Stylesheet firewall

The current `portal.css` contains Classic tokens, layout, feature rules, responsive rules, and light-mode corrections in one file (`css/portal.css:9-4697`). Merely appending unscoped V2 rules would allow Classic values to leak into V2 and V2 rules to regress Classic.

Foundation Gate requirements:

- Classic remains the default and continues to load the current `css/portal.css` unchanged in behavior.
- V2 receives a separate entry stylesheet and separate token namespace.
- Only one full presentation stylesheet is enabled for a completed mode. Both full stylesheets must not compete in the cascade.
- All V2 selectors are scoped by `html[data-ui="v2"]` or rooted below a V2 presentation root.
- Shared non-visual utilities must be intentionally extracted; Classic declarations are never silently treated as V2 defaults.
- During pilot development, V2 remains an internal/explicit preview until every reachable V2 route has styling coverage. A public toggle must not expose a half-styled mixture.
- If an unmigrated view temporarily uses Classic presentation, the boundary is explicit and tested; no duplicate element IDs, Store, listeners, or simultaneous hidden application tree is allowed.

The preferred long-term result is one active application DOM using stable IDs/callbacks and one active stylesheet. When a migrated screen needs different markup, its feature may choose a Classic or V2 renderer from the same read model and action callbacks. It must never render two operational trees at once.

### 3.3 Preference storage

Proposed local-only keys:

```text
atrium:ui:mode            = classic | v2
atrium:ui:theme           = light | dark | system
atrium:ui:density         = comfortable | compact   (future, only if validated)
atrium:ui:sidebar         = expanded | collapsed
atrium:ui:onboarding:v2   = seen | unseen
atrium:ui:prefs-version   = 1
```

Rules:

- use localStorage only; never `Store.state.settings`;
- no `Store.save()`, no `Store.flush()`, no API request, no audit event, no revision mutation;
- read before first meaningful paint to avoid flash between modes;
- safely migrate current `atrium_theme`, legacy `jurisflow_theme`, `atrium_sidebar_collapsed`, and tour keys once; keep Classic fallback until its retirement (`js/components/theme.js:8-33`, `js/portal.js:728-734`, `js/components/onboarding.js:50-61`);
- reset-visual-preferences must clear both legacy and V2 UI keys and no legal/operational keys (`js/features/system-admin.js:139-151`);
- toggling presentation re-renders only presentation when necessary; it does not reinitialize App, reload Store, or start another timer.

## 4. Semantic color tokens

Token names below are normative. Hex values are the approved starting palette. Component code consumes semantic roles, not raw hex values.

### 4.1 Light

| Token | Value | Intended role |
|---|---:|---|
| `--v2-color-background` | `#F7F5EF` | Page canvas; warm paper, never pure white. |
| `--v2-color-surface` | `#FCFBF7` | Primary cards, panels, dialogs. |
| `--v2-color-surface-secondary` | `#EFECE4` | Secondary containers and controls. |
| `--v2-color-surface-hover` | `#E9E6DD` | Hover/selected-neutral surface. |
| `--v2-color-foreground` | `#292A25` | Primary text. |
| `--v2-color-foreground-secondary` | `#56584F` | Secondary and small metadata text. |
| `--v2-color-muted-foreground` | `#76796E` | Non-essential or large muted text; restricted by contrast rule below. |
| `--v2-color-primary` | `#596B50` | Primary actions, active focus, selected state. |
| `--v2-color-primary-hover` | `#4B5C44` | Primary action hover/pressed direction. |
| `--v2-color-primary-soft` | `#E4E9DF` | Selected/attention-neutral background. |
| `--v2-color-gold` | `#A88742` | Institutional accent, not dominant action color. |
| `--v2-color-gold-soft` | `#EEE5D1` | Institutional subtle background. |
| `--v2-color-success` | `#56735B` | Confirmed successful state. |
| `--v2-color-warning` | `#A87535` | Warning border/icon/background accent. |
| `--v2-color-danger` | `#A34F49` | Error/destructive state. |
| `--v2-color-info` | `#536C7C` | Neutral operational information. |
| `--v2-color-border` | `#D9D5CA` | Standard boundary. |
| `--v2-color-border-subtle` | `#E8E4DB` | Low-emphasis division. |

### 4.2 Dark

| Token | Value | Intended role |
|---|---:|---|
| `--v2-color-background` | `#171915` | Charcoal page canvas; never pure black. |
| `--v2-color-surface` | `#1E211C` | Primary card/panel/dialog. |
| `--v2-color-surface-secondary` | `#252920` | Secondary surface/input. |
| `--v2-color-surface-hover` | `#2D3228` | Hover/selected-neutral surface. |
| `--v2-color-foreground` | `#ECECE5` | Primary text. |
| `--v2-color-foreground-secondary` | `#BCC0B5` | Secondary text. |
| `--v2-color-muted-foreground` | `#92978C` | Muted text. |
| `--v2-color-primary` | `#819477` | Primary action background and active state. |
| `--v2-color-primary-hover` | `#91A487` | Derived hover state; must retain dark foreground contrast. |
| `--v2-color-primary-soft` | `#293226` | Selected/attention-neutral background. |
| `--v2-color-gold` | `#C0A15C` | Institutional accent. |
| `--v2-color-gold-soft` | `#352E20` | Institutional subtle background. |
| `--v2-color-success` | `#86A58C` | Derived AA semantic foreground/accent. |
| `--v2-color-warning` | `#D2A05A` | Derived AA semantic foreground/accent. |
| `--v2-color-danger` | `#D57A74` | Derived AA semantic foreground/accent. |
| `--v2-color-info` | `#7FA0B4` | Derived AA semantic foreground/accent. |
| `--v2-color-border` | `#343930` | Standard boundary. |
| `--v2-color-border-subtle` | `#2A2E27` | Derived quiet boundary. |

Dark semantic values missing from the product-provided subset are explicitly derived here so that error, warning, success, and info never fall back to Classic colors.

### 4.3 Contrast constraints

Measured starting-palette contrast examples:

| Pair | Ratio | Contract |
|---|---:|---|
| Light foreground / background | 13.26:1 | Pass AA/AAA normal text. |
| Light secondary / background | 6.63:1 | Pass AA normal text. |
| Light muted / background | 4.07:1 | **Fail for normal text.** Use only for non-text decoration or qualifying large text; small metadata uses foreground-secondary. |
| Light surface text / primary button | 5.57:1 | Pass AA normal text. |
| Light gold / background | 3.10:1 | Accent/large mark only; never normal body text. |
| Light warning / background | 3.66:1 | Border/icon/background accent only; warning text uses foreground plus icon/label. |
| Dark foreground / background | 14.92:1 | Pass AA/AAA normal text. |
| Dark secondary / background | 9.56:1 | Pass AA/AAA normal text. |
| Dark muted / background | 5.92:1 | Pass AA normal text. |
| Dark background text / primary button | 5.43:1 | Pass AA normal text. |
| Dark gold / background | 7.16:1 | Pass, but role remains institutional accent. |

Every component/theme/state combination must be checked in the implemented browser. A token name or isolated palette calculation is not sufficient proof. Disabled state may reduce emphasis but must remain identifiable; it cannot communicate information required to proceed.

Color is never the only state cue. Status includes text and, where useful, an icon or shape.

## 5. Typography

The current repository already contains suitable families (`css/portal.css:1-7`):

- **Interface:** Inter, then system sans-serif.
- **Editorial heading:** Playfair Display, then Georgia/serif.

No Fraunces or Plus Jakarta Sans should be added in the Foundation Gate. Playfair is the approved equivalent already present. It may be reconsidered only after the pilot demonstrates a specific deficiency.

| Style | Family | Size / line-height | Weight | Use |
|---|---|---|---|---|
| Display | Playfair | 32/38 px | 600 | Dashboard/editorial opening at wide desktop only. |
| Page title | Playfair | 26/32 px | 600 | One `h1` per view. |
| Section title | Inter | 18/24 px | 600 | Operational section heading. |
| Card title | Inter | 15/20 px | 600 | Dense cards, rows, drawers. |
| Body | Inter | 14/21 px | 400/500 | Default operational copy. |
| Compact body | Inter | 13/18 px | 500 | Table cells and dense metadata when validated. |
| Caption | Inter | 12/16 px | 500/600 | Secondary metadata only, never critical instruction. |
| Label | Inter | 12/16 px | 600 | Form labels; sentence case preferred. |

Rules:

- Serif is prohibited in tables, inputs, badges, menus, process numbers, dates, currency, and dense operational data.
- Body and critical helper text must not fall below 14 px.
- Legal numbers, dates, currency, durations, counts, and metrics use `font-variant-numeric: tabular-nums`.
- Process numbers may use controlled wrapping but not arbitrary hyphenation.
- Uppercase is reserved for small group labels; letter spacing must not reduce rapid reading.

## 6. Geometry and spacing

### 6.1 Spacing scale

Use a 4 px base with a bounded scale:

| Token | Value |
|---|---:|
| `--v2-space-0` | 0 |
| `--v2-space-1` | 4 px |
| `--v2-space-1-5` | 6 px |
| `--v2-space-2` | 8 px |
| `--v2-space-3` | 12 px |
| `--v2-space-4` | 16 px |
| `--v2-space-5` | 20 px |
| `--v2-space-6` | 24 px |
| `--v2-space-8` | 32 px |
| `--v2-space-10` | 40 px |
| `--v2-space-12` | 48 px |
| `--v2-space-16` | 64 px |

One-off spacing is permitted only for a documented alignment constraint. Feature files must not embed arbitrary inline spacing when a primitive token exists.

### 6.2 Radius

| Token | Value | Use |
|---|---:|---|
| `--v2-radius-sm` | 6 px | Small tags, compact internal elements. |
| `--v2-radius-md` | 10 px | Inputs, buttons, segmented controls. |
| `--v2-radius-lg` | 14 px | Cards and panels. |
| `--v2-radius-xl` | 18 px | Dialogs, onboarding, editorial banners. |
| `--v2-radius-round` | 999 px | Pills only: tags, filters, compact status, avatar. |

Blob shapes and random radii are prohibited in tables, forms, processes, publications, and operational task areas. Organic forms are limited to onboarding, empty states, broad banners, and restrained illustration.

### 6.3 Shadows and borders

Light:

```text
shadow-subtle   0 1px 3px rgba(41,42,37,.06)
shadow-card     0 4px 16px rgba(70,75,62,.08)
shadow-elevated 0 10px 30px rgba(70,75,62,.12)
```

Dark uses surface and border contrast first. Heavy black shadows, large blurred glows, and persistent glass blur are prohibited. Elevated dark overlays may use one restrained shadow when separation cannot be achieved with surface/border.

### 6.4 Z-index

| Token | Value | Layer |
|---|---:|---|
| `--v2-z-base` | 0 | Page content. |
| `--v2-z-sticky` | 20 | Sticky table/header controls. |
| `--v2-z-navigation` | 40 | Desktop/mobile navigation. |
| `--v2-z-popover` | 60 | Search, menus, tooltips. |
| `--v2-z-overlay` | 80 | Dialog/drawer backdrop. |
| `--v2-z-toast` | 100 | Toast/critical transient notice. |

No feature may invent a higher layer without documenting the interaction with Dialog, Drawer, search, and Toast.

## 7. Layout contract

ATRIUM is desktop-first in this order: 1440, 1280, 1024, then tablet/mobile. Desktop-first does not mean mobile is optional.

### 7.1 Shell

- Desktop keeps a left sidebar. It is not a floating pill collection.
- Sidebar width target: 248–264 px expanded and 64–72 px collapsed; exact pilot value is selected through 1280/1024 testing.
- Main content has a bounded readable maximum for editorial areas but data tables can use the full available width.
- Topbar is one principal row at desktop. Priority: global search, one contextual action region, sync state, user, appearance.
- Tour and secondary tools move into user/help menus; they do not compete with the primary action.
- At mobile, navigation becomes a modal Drawer with scrim and focus containment. Search remains explicitly reachable.

### 7.2 Proposed information architecture

Labels/order may be tested as:

- **Visão geral:** Dashboard.
- **Trabalho:** Processos, Publicações, Tarefas, Agenda.
- **Relacionamento:** Contatos, Atendimentos/Leads.
- **Gestão:** Financeiro, Documentos.
- **Inteligência:** Assistente, Biblioteca de Prompts.
- **Sistema:** Monitoramento, Integrações, Configurações, Importador, Auditoria, Links.

This is a presentation hypothesis. Existing `data-view` values, feature modules, collections, links, and permissions stay unchanged. Any label change must be terminology-tested with current users before release.

### 7.3 Dashboard

The first viewport must answer, in order:

1. what requires attention today;
2. which deadlines require human checking;
3. which publications remain untreated;
4. which tasks are late or due soon;
5. what is next on the agenda;
6. whether synchronization is healthy;
7. whether current changes are saved.

The pilot should use one attention queue rather than an ornamental mosaic. Metrics are navigation summaries, not decoration. Zero and healthy states should be calm; failures should be explicit and actionable.

### 7.4 Tables

- exact rectangular geometry; no organic shapes;
- 40–44 px compact rows where content permits, otherwise content-driven;
- subtle sticky header where useful;
- real sort buttons and `aria-sort`;
- tabular numerals and consistent right alignment for money/counts;
- row selection/action is explicit, not implied only by cursor;
- contextual row actions appear on focus as well as hover;
- responsive strategy prioritizes columns and provides a mobile record list/detail, not unexplained table clipping;
- hidden columns remain available through a disclosed detail action.

### 7.5 Forms

- inputs 40–44 px high, 8–10 px radius, no default pills;
- visible label always; placeholder is an example, never the only label;
- helper, validation, and persistence error text are connected through `aria-describedby`;
- required/optional status is explicit;
- long records use grouped sections and optionally a Drawer; save timing and validation remain unchanged;
- secret fields keep current secure type/autocomplete behavior and cannot expose secrets in logs or durable UI.

## 8. Component behavior contract

### 8.1 Buttons

- Primary = green primary, one per local decision group.
- Secondary = surface-secondary plus border.
- Ghost = transparent; must remain visible on hover/focus.
- Danger = danger color plus explicit destructive label.
- Radius 8–10 px; default height 40 px; touch target 44 px minimum.
- No `scale(1.05)`, rotation, bounce, or continuous animation on operational buttons.
- Loading preserves width, sets `aria-busy`, disables duplicate invocation, and keeps a textual state.

### 8.2 Cards

- Cards organize related information; they are not ornamental objects.
- Radius 12–14 px, consistent padding, no rotation.
- An entire clickable card must have button/link semantics and a visible focus state.
- Status color is a small semantic cue, not the card’s full background unless contrast/state has been tested.

### 8.3 Dialog and Drawer

- Dialog for short decisions and bounded forms; Drawer for long record context/editing.
- Must set role/name, trap focus, restore invoker focus, close on Escape when safe, and lock background scroll.
- Backdrop click may close only when it cannot discard uncommitted input without confirmation.
- Destructive/cancel behavior is explicit. Never show success before `flush()`/server confirmation required by the current operation.
- Nested modal behavior is prohibited unless formally specified.

### 8.4 Toast, alerts, and durable state

- Toast acknowledges a completed, non-critical event.
- Save failure, conflict 409, offline, permission denial, reauthentication, and sync partial/failure require persistent inline or shell state.
- Every state answers: what happened, whether data is safe, whether retry is safe, and what the user can do.
- Error text must not disappear automatically while unresolved.
- Success is never inferred from visual completion. It follows the authoritative existing callback/result.

## 9. State model for presentation

Primitives support these states when applicable:

| State | Required presentation behavior |
|---|---|
| Normal | Stable label/value/action; no implied activity. |
| Hover | Subtle surface/border change only; equivalent focus behavior exists. |
| Focus | 2 px or stronger visible outline with 2 px offset; meets contrast and is not clipped. |
| Loading | `aria-busy`, textual progress, duplicate action blocked, prior data not falsely erased. |
| Empty | Explains why empty and offers a safe next action when one exists. |
| Success | Shown only after the authoritative operation succeeds; includes what changed. |
| Warning | Names the risk and recommended action; not color-only. |
| Error | Persistent until resolved/dismissed intentionally; names data durability and retry safety. |
| Offline | Distinguishes local unsaved state from server unavailability; never claims sync. |
| Partial | Lists successful and failed portions; overall state is not “success.” |
| Unsaved | Persistent local state indicator; mode/theme toggles never create this state. |
| Conflict 409 | Stops unsafe continuation, explains another revision won, and offers the existing safe recovery path. |
| Sync running | Names current operation/source and blocks duplicate sync; cancellation only if actually supported. |
| Sync failed | Names last successful point, failed source, save safety, and retry action. |
| Permission denied | Explains required permission without exposing hidden data or offering a nonfunctional control. |
| Reauthentication | Preserves safe local context, invokes existing auth path, and never simulates success. |

Domain features supply state; visual primitives render it. Primitives do not calculate legal deadlines, financial status, publication treatment, or judicial source health.

## 10. Motion and texture

Motion tokens:

```text
--v2-duration-fast: 120ms
--v2-duration-base: 180ms
--v2-duration-slow: 220ms
--v2-duration-max: 300ms
--v2-ease-standard: cubic-bezier(.2, 0, 0, 1)
```

Motion communicates opening, closing, state change, spatial relationship, confirmation, or actual loading. It must not rotate cards, continuously pulse decorative elements, use large scale, or delay work.

`prefers-reduced-motion: reduce` disables non-essential transitions and makes required spatial transitions effectively immediate.

Paper texture is optional, max 1–2% opacity, and only on broad non-operational surfaces. It is prohibited over text, tables, inputs, dialogs, or dense data. No heavy image or filter is allowed for texture.

## 11. Accessibility contract

Minimum target: WCAG 2.2 AA where applicable.

- semantic landmarks and one page `h1`;
- full keyboard operation with logical order;
- visible `:focus-visible` on every interactive element;
- accessible combobox/listbox for global search;
- Dialog/Drawer focus trap and focus return;
- real buttons/links instead of click-only generic elements;
- `aria-sort` for tables and state/value semantics for toggles;
- labels and descriptions connected to controls;
- state never communicated by color alone;
- 44×44 px touch targets for primary mobile controls;
- 200% zoom/reflow without lost action or information;
- reduced motion support;
- contrast tested in both themes and every semantic state;
- mobile data retains access to every critical field;
- announcements are polite for routine updates and assertive only for blocking safety errors.

Automated checks are supporting evidence, not a substitute for keyboard, zoom, contrast, and screen-reader walkthroughs.

## 12. Performance contract

- no frontend framework added;
- no large icon, animation, or component library;
- use existing local fonts and a minimal number of weights actually loaded;
- no heavy decorative images;
- no persistent backdrop blur in dense working surfaces;
- no duplicate Classic/V2 DOM tree, Store, feature factory, listener set, sync request, or timer;
- mode resolution before paint and no avoidable layout shift;
- V2 rendering must not increase persistence/API calls;
- Visual QA must record browser errors, layout overflow, and stable view identity as it does today (`tests/visual-qa.mjs:302-361`).

## 13. Definition of contract compliance

The Organic Editorial contract passes only when:

- the exact semantic token roles above are implemented for light and dark;
- Playfair is confined to editorial headings and Inter drives operational UI;
- geometry, density, and motion follow the bounded scales;
- gold is institutional accent rather than dominant action/status color;
- Dashboard prioritizes attention and durable system state;
- tables remain precise and compact;
- normal, focus, loading, empty, success, warning, error, offline, partial, unsaved, conflict, sync, permission, and reauthentication states are specified and tested where applicable;
- Classic remains behaviorally unchanged;
- switching to V2 changes zero operational state and zero network mutation;
- the non-regression firewall is proven by tests, not assumed from code review.
