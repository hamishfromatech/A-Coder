# IDE Command Bar & Diff Review UX Audit

**Date:** 2026-05-18
**Scope:** Editor overlay widgets (`VoidCommandBar.tsx`, `voidCommandBarService.ts`) + Sidebar file change list (`CommandBarInChat` in `SidebarChat.tsx`)
**Type:** Gap analysis and UX improvement opportunities

---

## 1. Editor Command Bar (Floating Overlay Widget)

### Current State
- Positioned at **BOTTOM_RIGHT_CORNER** of every editor that has diff changes.
- Shows: diff navigation (Up/Down arrows), file counter ("File 2 of 5"), accept/reject buttons, and a vertical-ellipsis menu for Accept All / Reject All.
- Styled with `backdrop-blur-md`, `shadow-2xl`, rounded corners.
- Uses VS Code keybindings for all navigation actions.

### Gaps

| # | Issue | Impact |
|---|-------|--------|
| 1.1 | **No filename shown in the command bar** — When navigating between files via left/right arrows, the bar shows "File 2 of 5" but not WHICH file. The user must look at the editor tab to know what they're reviewing. | **High** |
| 1.2 | **Keyboard shortcut labels are hidden behind tooltips** — Buttons have `data-tooltip-delay-show={500}`, so the keybinding hint only appears after hovering for half a second. No visual shortcut indicator on the button itself. | **Medium** |
| 1.3 | **No progress/completion indicator** — No visual sense of how much review work remains. A progress bar or "3 of 7 diffs reviewed" counter would help pacing. | **Medium** |
| 1.4 | **No auto-advance after accept/reject** — After clicking Accept or Reject on a file, the command bar stays on the current (now empty) file. User must manually click Next arrow to continue. | **High** |
| 1.5 | **No "Reject with reason" or partial accept** — Binary accept/reject only. No way to accept part of a diff zone or leave a comment. | **Medium** |
| 1.6 | **Ellipsis menu is two-step for Accept All** — Accept All and Reject All are hidden behind a vertical-ellipsis click. These are primary actions; they should be directly accessible. | **Medium** |
| 1.7 | **No animation when file changes** — When left/right arrows switch the active file, the command bar just updates text. No transition or flash to draw attention. | **Low** |
| 1.8 | **No persistent state of collapsed/expanded** — The Accept All / Reject All dropdown (`showAcceptRejectAllButtons`) doesn't remember its state across file switches. | **Low** |

---

## 2. Sidebar File Change List (`CommandBarInChat`)

### Current State
- Appears at the top of the sidebar chat when files have changes.
- Collapsible list (`fileDetailsContent`) showing each changed file with:
  - Basename (e.g., `index.tsx`)
  - Number of diffs (e.g., "3 diffs")
  - Status indicator dot (dark = done, orange = running)
  - Per-file Accept/Reject icons
- Also has global "Accept All" / "Reject All" buttons at the top level.

### Gaps

| # | Issue | Impact |
|---|-------|--------|
| 2.1 | **Only basename shown, no folder context** — `getBasename(uri.fsPath)` strips all path info. In a project with multiple `index.tsx` files, you can't tell which is which. | **High** |
| 2.2 | **No file type icons** — No visual distinction between `.ts`, `.css`, `.json`, etc. files in the list. | **Medium** |
| 2.3 | **No diff preview in sidebar** — Clicking a file name opens the file in the editor, but there's no inline preview of what changed (added/removed line count, change type). | **Medium** |
| 2.4 | **Accept/Reject icons are too small and unlabeled** — The X and Check icons are 14px with only a tooltip. No text label like "Accept" or "Reject". | **Medium** |
| 2.5 | **No grouping by folder** — All files are shown flat. In a large change set (e.g., 20 files across 5 directories), this is hard to scan. | **Medium** |
| 2.6 | **File status is binary** — "Done" vs "Running". Missing: "Accepted", "Rejected", "Partial" states per file. | **Medium** |
| 2.7 | **No total change stats** — No summary like "+124 lines, -43 lines across 7 files" at the top of the list. | **Low** |

---

## 3. Keyboard & Accessibility

### Gaps

| # | Issue | Impact |
|---|-------|--------|
| 3.1 | **No `aria-live` region for file navigation** — Screen readers are not notified when the command bar switches to a new file or diff. | **Medium** |
| 3.2 | **Focus is not managed after accept/reject** — After clicking Accept, focus is lost (no element focused). Keyboard users must tab back into the command bar. | **High** |
| 3.3 | **Command bar is not reachable via Tab from editor** — The floating widget uses `pointer-events-auto` but may not be in the natural tab order from the editor content. | **Medium** |

---

## Prioritization Matrix

### 🔴 High Impact
| # | Item | Why |
|---|------|-----|
| 1.1 | Show filename in editor command bar | Users don't know what file they're reviewing. |
| 1.4 | Auto-advance to next file after accept/reject | Removes friction in batch review workflow. |
| 2.1 | Show folder path in sidebar file list | Multiple files with same basename are ambiguous. |
| 3.2 | Focus management after accept/reject | Keyboard accessibility gap. |

### 🟡 Medium Impact
| # | Item | Why |
|---|------|-----|
| 1.2 | Keyboard shortcut labels on buttons | Speeds up power-user workflow. |
| 1.3 | Progress/completion indicator | Helps users pace their review. |
| 1.6 | Surface Accept All / Reject All directly | Reduces clicks for primary actions. |
| 2.2 | File type icons | Visual scanning aid. |
| 2.3 | Diff preview in sidebar | Reduces context-switching to editor. |
| 2.4 | Labeled Accept/Reject buttons | Clarity for new users. |
| 2.5 | Group files by folder | Organization for large change sets. |
| 2.6 | Per-file accepted/rejected states | Tracking what was already handled. |

### 🟢 Low Impact / Nice to Have
| # | Item | Why |
|---|------|-----|
| 1.5 | Reject with reason / partial accept | Advanced feature. |
| 1.7 | Animation on file switch | Polish. |
| 1.8 | Persist dropdown state | Minor convenience. |
| 2.7 | Total change stats | Summary vanity metric. |
| 3.1 | `aria-live` region | Screen-reader improvement. |
| 3.3 | Tab reachability from editor | Niche workflow. |

---

## Implementation Plan

### Phase 1: Critical Fixes (🔴 High)
1. **Show filename in command bar** — Add `getBasename(uri.fsPath)` next to "File X of Y".
2. **Auto-advance after accept/reject** — In `onAcceptFile` and `onRejectFile`, call `commandBarService.goToURIIdx(nextURIIdx)` after the action.
3. **Show folder path in sidebar** — Replace `getBasename` with a relative path or `basename + folder` pattern.
4. **Focus management** — After accept/reject, programmatically focus the Next diff or Next file button.

### Phase 2: UX Polish (🟡 Medium)
5. **Keyboard shortcut badges** — Show keybinding label directly on button (e.g., "Accept (⌘⌥⇧↵)").
6. **Progress indicator** — Add a thin progress bar above the command bar showing "diffs reviewed / total diffs".
7. **Surface Accept All / Reject All** — Move them out of the ellipsis menu into the main bar (or make the ellipsis always show them as a dropdown that auto-opens).
8. **File type icons in sidebar** — Use simple colored dots or extension badges.
9. **Per-file accepted/rejected state** — After accepting a file, grey it out or show a checkmark permanently.

### Phase 3: Advanced (🟢 Low)
10. **Diff preview in sidebar** — Show `+N / -M` line counts per file.
11. **Folder grouping** — Group files by their parent directory.
12. **Animation on file switch** — Subtle flash or slide transition.
