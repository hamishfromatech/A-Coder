# Plan: Modernize A-Coder Sidebar Chat UI/UX

Inspired by the Hermes Agent desktop app (`/Users/hamishfromatech/Downloads/Code/A-Coder/hermes-agent/apps/desktop`) — a standalone Electron + Vite + React chat shell by Nous Research. This plan extracts its strongest patterns and adapts them to A-Coder's constraints (VS Code webview, `scope-tailwind` `void-` prefixing, existing `void-*` color tokens, single `SidebarChat.tsx`).

The guiding principle, borrowed from Hermes' `DESIGN.md`: **flat, not boxed — group with whitespace and a single hairline, never nested rounded boxes. One token set, hover-revealed actions, direct-manipulation-feel feedback.**

---

## What Hermes does well (the patterns worth stealing)

### 1. Message asymmetry — user bubble vs. assistant flow
- **User messages** are right-aligned **sticky glass bubbles** with a hairline border that strengthens on hover. No avatar, no name label — the bubble *is* the identity. Long prompts clamp to ~2 lines with a soft fade and expand on click.
- **Assistant messages** are left-aligned, **full-width, no bubble, no avatar**. Text flows directly on the transcript surface. This asymmetry (bubble vs. flow) makes the conversation read like iMessage/Slack, not a stacked card list.
- Both use a shared **conversation typography scale**: `--conversation-text-font-size` (0.8125rem), `--conversation-line-height`, `--conversation-turn-gap` (0.375rem), `--message-text-indent` (0.75rem). One scale, everywhere.

### 2. Hover-revealed actions (never always-on)
- Both user and assistant actions are `opacity-0 pointer-events-none` by default and reveal on `group-hover` / `focus-within`. This keeps the transcript calm when reading and only shows controls when the user intends to act.
- The action bar is **always mounted** (not `hideWhenRunning`) so layout height is stable during streaming — no jump when a turn resolves.
- A **turn-duration chip** (`⏱ 12s`) sits left of the actions, `tabular-nums`, muted.

### 3. The composer — flat, borderless, single surface
- The composer is **one rounded surface**, not a boxed input inside a panel. Controls sit in a row below the text: ghost icon buttons (left) + a single high-contrast **primary send circle** (`bg-foreground text-background`, black-on-white / white-on-black — reads as the dominant CTA regardless of theme).
- Attachments are **rounded-2xl chips** with an inset top highlight (`shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]`) and a hover-reveal remove (×) — they look physical, not like form inputs.
- Composer control sizes are token-driven: `--composer-control-size` (1.5rem), `--composer-control-gap` (0.25rem), `--composer-input-min/max-height`.

### 4. The landing/empty state — quiet, branded, copy-driven
- Centered **wordmark** in a display font (`fit-text` auto-scales to width), `mix-blend-plus-lighter` for a luminous feel in dark mode.
- A single rotating **headline + body** pair (seeded randomly on mount), e.g. *"What are we moving today?" / "Send a bug, branch, plan, or rough idea…"*. No prompt-suggestion grid clutter — the empty state is a calm invitation, not a menu.
- `pointer-events-none` on the container so it never competes with the composer.

### 5. Token discipline & elevation
- **Floating panels** float on `shadow-nous` (layered downward-weighted shadow) + `--stroke-nous` (a `currentColor` hairline at ~3% opacity) — no thick framed boxes.
- A **z-index ladder** as CSS vars: `--z-modal-backdrop/130`, `--z-over-modal/200`, `--z-switcher/220`, then the boot chain `--z-connecting/1200 → --z-onboarding → --z-crash/1500`. No ad-hoc `z-[100]` at call sites.
- Text hierarchy via `--ui-text-primary/secondary/tertiary/quaternary` (94/74/54/36% of base). Strokes `--ui-stroke-primary…quaternary`.

### 6. Tool calls — inline, calm, ticker-animated
- Tool progress renders as a **vertical ticker** (`tool-ticker`): a fixed-height window where rows translate up by one line-height as new steps arrive (`transform: translateY(index * line-height * -1)`). Reads as live activity without growing the transcript.
- Inline widgets (clarify, artifact cards) share one shell class (`WIDGET_SHELL_CLASS = rounded-3xl bg-(--ui-widget-surface-background) px-3.5 py-3`) — **no border**, surface reads as a surface on fill alone. Actions sit *outside* the panel, below it.
- Bordered surfaces in the transcript (tables, fences, callouts) use `--ui-stroke-tertiary`, never the app-wide `--ui-border` (which "reads too hot against the thread").

---

## The plan for A-Coder — phased, low-risk

All changes stay inside `src/vs/workbench/contrib/void/browser/react/src/` (write unprefixed Tailwind in `src/`, the build adds `void-`). Custom CSS rules go in `styles.css` **with the `void-` prefix already applied**. Each phase is independently shippable.

### Phase 1 — Conversation typography & spacing tokens (foundation)
**Files:** `styles.css`, then update className literals in `SidebarChat.tsx`.

Add a conversation scale to `styles.css` (these are CSS vars, so no scope prefix needed, but wrap rules in `.void-scope`):
```css
.void-scope {
  --void-conv-text: 0.8125rem;      /* 13px */
  --void-conv-leading: 1.5;
  --void-conv-turn-gap: 0.5rem;     /* slightly roomier than Hermes' 0.375 for the denser IDE rail */
  --void-msg-indent: 0.75rem;
}
```
Apply to the message scroll container and message wrappers: replace ad-hoc `text-sm`/`space-y-4` with `text-[length:var(--void-conv-text)] leading-[var(--void-conv-leading)]` and `gap-[var(--void-conv-turn-gap)]`.

**Why first:** every later phase depends on a shared scale; doing it now prevents per-message fiddling later.

### Phase 2 — Assistant messages: drop the card, flow on the surface
**Files:** `SidebarChat.tsx` (`AssistantMessageComponent`), `styles.css`.

Currently A-Coder wraps assistant content in a bordered/elevated card with a header row ("A-Coder" + timestamp + actions). Hermes' lesson: **the assistant has no chrome**.

- Remove the assistant message card background and border. Text renders directly on `--void-bg-1` (the chat surface), left-aligned, full width, with `text-pretty` and `wrap-anywhere` for long paths.
- Keep the modern header I added (name + timestamp) but make it **muted and tight** (`text-void-fg-4 text-[11px]`, no border, no background) — or move the timestamp into the hover action row as a `tabular-nums` chip and drop the name entirely (the side of the screen already says "assistant").
- The hover action row (Copy/Regenerate/Delete) becomes the single source of actions: `opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto`, **always mounted** (no layout shift on stream end).
- Bordered sub-elements inside assistant markdown (code fences, tables) switch from `border-void-border-1` to a calmer `--void-border-2` hairline, matching Hermes' "tertiary stroke in the transcript" rule.

### Phase 3 — User messages: right-aligned bubble with clamp
**Files:** `SidebarChat.tsx` (`UserMessageComponent`), `styles.css`.

A-Coder currently renders user messages as minimal inline left-aligned text (from my earlier modernization). Hermes goes further with the **right-aligned bubble** asymmetry, which is the single highest-impact visual change.

- Wrap user content in a right-aligned bubble: `self-end max-w-[min(86%,44rem)] rounded-xl border bg-void-bg-2 px-3 py-2`, border `--void-border-2` → strengthens to `--void-border-1` on hover.
- **Clamp long prompts** to ~3 lines with a soft bottom fade; click to expand. Add `.void-user-clamp` + `[data-clamped]` rules in `styles.css` (port Hermes' `sticky-human-clamp` with a `ResizeObserver`-free CSS-only `line-clamp-3` fallback first; upgrade to measured animation if it feels worth it).
- Keep the hover-reveal actions (Copy/Edit/Delete) **inside** the bubble, bottom-right, same opacity pattern as assistant.
- Image thumbnails stay inline inside the bubble, smaller (`w-16 h-16`), rounded-lg, single hairline.
- User-message markdown: keep it **minimal** (inline code + fenced blocks only). Don't run the full markdown+KaTeX pipeline on user input — it's heavy and user input rarely needs it. (Direct lesson from Hermes `user-message-text.tsx`.)

### Phase 4 — Composer: one surface, ghost controls, dominant send
**Files:** `SidebarChat.tsx` (`VoidChatArea` input section), `styles.css`.

- The composer already lives in `VoidChatArea` (rounded-xl elevated surface). Tighten it toward the Hermes ideal: attachments as **rounded-2xl chips with an inset top highlight** and hover-reveal × remove (replace the current `ImagePreview` block styling).
- Control row: left side = ghost icon buttons (`@ mention`, mic, attachments) using a shared `.void-composer-ghost-btn` (`size-6 rounded-md text-void-fg-3 hover:bg-void-bg-3 hover:text-void-fg-1`); right side = a single **high-contrast primary send circle** — `bg-void-fg-1 text-void-bg-1 rounded-full` (inverted, theme-adaptive) instead of the current accent-tinted submit button. When streaming, swap to a Stop button (filled square) in the same slot.
- Add a subtle **drag-over affordance**: a dashed inner ring + fade when dragging files over the composer (Hermes uses `COMPOSER_DROP_ACTIVE_CLASS`). One owner, one affordance language.

### Phase 5 — Landing state: quiet, branded, copy-driven
**Files:** `SidebarChat.tsx` (`landingPageContent`), `styles.css`.

My earlier landing state added animated orbs + prompt chips. Hermes argues for **calmer**: a luminous wordmark + one rotating headline/body pair, `pointer-events-none`, no prompt grid.

- Replace the prompt-chip grid with a **single rotating headline + subhead** (seeded on mount, like Hermes' `Intro`). Keep 2–3 tiny "try saying…" inline suggestions *below* the headline only if user-testing wants a starter — but make them text links, not buttons, and fewer of them.
- Keep the animated gradient orbs but **tone them down** (lower opacity, slower drift) so the wordmark is the hero, not the background.
- Wordmark: "A-CODER" in a bold uppercase display style with `mix-blend-plus-lighter` in dark mode for the luminous feel. Auto-fit width with a small `fit-text`-style clamp.

### Phase 6 — Token & elevation hygiene (cross-cutting)
**Files:** `styles.css`, then sweep `SidebarChat.tsx` for literals.

- Add a **z-index ladder** to `styles.css`: `--void-z-dropdown`, `--void-z-popover`, `--void-z-modal`, `--void-z-toast`. Replace ad-hoc `z-[100]`/`z-[200]` in the slash menu, model dropdown, and tooltips with these tokens. (This also makes the slash-menu vs. model-dropdown stacking deterministic — relevant to the bug I just fixed.)
- Add `--void-shadow-popover` (layered, downward-weighted — port Hermes' `--shadow-nous`) and `--void-stroke-overlay` (a `color-mix(currentColor 3%, transparent)` hairline) for the slash menu and any floating panel, replacing `shadow-lg`/`border-void-border-2` one-offs.
- Sweep `SidebarChat.tsx` for raw color literals (`bg-black/50`, `text-white`, `bg-void-bg-1` used as a hardcoded chip fill) and route them through tokens. The one sanctioned literal exception: a brand mark that needs a fixed backdrop.

### Phase 7 (optional, later) — Tool-call rendering calmness
**Files:** the tool-result / agent-step rendering in the thread (`SidebarChat.tsx` tool result sections).

- Port the **tool-ticker** idea: render active tool steps in a fixed-height window that translates up as new steps arrive, instead of growing the transcript downward. Lower priority — only worth it if the agent loop feels visually noisy in practice.
- Give inline tool-result panels a shared **borderless shell** (rounded-2xl, `--void-bg-2` fill, no border) with actions *below* the panel, not inside it.

---

## What I'm explicitly NOT taking from Hermes
- **assistant-ui / nanostores architecture** — A-Coder uses VS Code DI + React state; no reason to import a new state model.
- **i18n four-locale mandate** — A-Coder isn't localized the same way; don't introduce that overhead now.
- **The `@assistant-ui/react` primitive library** — A-Coder already has its own message components; forking the library would be a rewrite, not a modernization.
- **Tabler/Codicon dual icon system** — A-Coder uses `lucide-react` consistently; stay on it.

---

## Build & verification per phase
After each phase:
1. `npm run buildreact` — confirm scope-tailwind generates the new `void-*` rules (check `src2/styles.css` for the additions).
2. `npm run compile` — 0 TypeScript errors.
3. Launch `./scripts/code.sh`, open the chat sidebar, visually verify: empty state, user message, assistant streaming, hover actions, slash menu, composer attachments.

## Suggested order & effort
1. Phase 1 (tokens) — ~15 min, foundation
2. Phase 3 (user bubble) — highest visual impact, ~30 min
3. Phase 2 (assistant de-card) — ~25 min
4. Phase 4 (composer send circle + attachment chips) — ~30 min
5. Phase 5 (landing calm-down) — ~20 min
6. Phase 6 (z-index ladder + shadow tokens) — ~20 min, also hardens the slash-menu stacking
7. Phase 7 (tool ticker) — optional, deferred

Total: ~2.5 hrs for phases 1–6, all reversible, all inside `void/`.