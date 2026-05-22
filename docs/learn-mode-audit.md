# Learn Mode UX Audit

**Date:** 2026-05-18
**Scope:** `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/` (TeachingResultWrapper, LearningDashboard, QuizMe, SidebarChat student mode) + `src/vs/workbench/contrib/void/common/learningProgressService.ts`
**Type:** Gap analysis and UX improvement opportunities

---

## 1. Teaching Content Display (`TeachingResultWrapper.tsx`)

### Current State
- Parses LLM output into collapsible sections (Summary, Breakdown, Concepts, Mistakes, Exercise).
- Auto-expands the first section.
- Shows exercise metadata (ID, type) in a small banner.
- Has a "Mark as complete" checkmark on summary sections.

### Gaps

| # | Issue | Impact |
|---|-------|--------|
| 1.1 | **No progress tracking per section** — The `completed` state on sections is purely local React state. It resets on re-render and is not persisted to `LearningProgressService`. | **High** |
| 1.2 | **No "Next section" navigation** — After reading a section, there's no "Continue to Key Concepts" button. Users must manually click each chevron. | **Medium** |
| 1.3 | **Exercise section is not interactive** — The exercise section renders as plain markdown. There's no inline code editor, no "Run" button, no submission mechanism. | **High** |
| 1.4 | **No code playground / sandbox** — Teaching content with code examples is read-only. Users cannot modify and run the code to experiment. | **High** |
| 1.5 | **Section parsing is brittle** — Relies on regex matching markdown headers with specific emoji prefixes. If the LLM deviates, the whole content falls back to a single blob. | **Medium** |
| 1.6 | **No visual progress bar** — No indication of how much of the lesson has been consumed (e.g., "3 of 5 sections completed"). | **Medium** |
| 1.7 | **No bookmarking** — Users cannot save/bookmark a specific section for later review. | **Medium** |
| 1.8 | **No note-taking** — No way to add personal notes to a section. | **Low** |

---

## 2. Learning Dashboard (`LearningDashboard.tsx`)

### Current State
- Full-screen modal with left sidebar navigation (Overview, Concepts, Quizzes, Badges).
- Shows stats: Lessons Done, XP Points, Learning Time, Current Streak.
- Has a "Skill Tree" visualization with hardcoded nodes (React, TypeScript, Node.js, CSS, Python).
- Badges tab shows 3 static placeholders (Code Ninja, Speed Demon, Polyglot).

### Gaps

| # | Issue | Impact |
|---|-------|--------|
| 2.1 | **Skill tree is completely hardcoded** — `SkillNode` components are hardcoded with static levels. Not connected to `LearningProgressService` at all. | **High** |
| 2.2 | **No real data in Concepts tab** — The "Mastery Skill Tree" shows fake data. No actual concept mastery tracking exists. | **High** |
| 2.3 | **Badges are static placeholders** — Badge definitions are hardcoded in the component. Not sourced from `LearningProgressService`. | **Medium** |
| 2.4 | **No lesson history** — The "Recent Activity" section only shows quizzes. No list of completed lessons, exercises, or concepts learned. | **High** |
| 2.5 | **No learning path / curriculum** — No visual representation of a structured curriculum (e.g., "Intro to JS" → "Variables" → "Functions" → "Arrays"). | **High** |
| 2.6 | **XP system is arbitrary** — `(totalExercisesSolved * 50)` is a naive formula. No weighting by difficulty, no level-up mechanics. | **Medium** |
| 2.7 | **No time tracking granularity** — `totalTimeSpent` is a single number. No per-lesson or per-day breakdown. | **Medium** |
| 2.8 | **Dashboard is a modal, not a sidebar pane** — Takes over the entire screen. Cannot reference lesson content while viewing stats. | **Medium** |

---

## 3. Quiz / Spaced Repetition (`QuizMe.tsx`)

### Current State
- "Daily Review" modal with spaced repetition items generated from `LearningProgressService`.
- Shows mastery level, review interval, and urgency (now/soon/later).
- Clicking an item sends a quiz prompt to the chat.

### Gaps

| # | Issue | Impact |
|---|-------|--------|
| 3.1 | **No inline quiz UI** — Quizzes are just text prompts sent to the LLM. No structured multiple-choice, fill-in-the-blank, or code-challenge UI. | **High** |
| 3.2 | **No quiz history** — After completing a quiz, there's no record of questions, answers, or score in the dashboard. | **High** |
| 3.3 | **Spaced repetition algorithm is naive** — Simple threshold-based intervals (40%=2d, 60%=3d, 80%=7d). No actual SM-2 or FSRS algorithm. | **Medium** |
| 3.4 | **No quiz analytics** — No tracking of which concepts are weakest, no "needs more practice" identification. | **Medium** |
| 3.5 | **Quiz generation is manual** — User must click "Quiz Me" then select a topic. No automatic daily quiz notification or scheduled review. | **Medium** |
| 3.6 | **No difficulty adaptation** — Quizzes don't adapt to the user's performance. Hard concepts should get more questions. | **Medium** |

---

## 4. Student Onboarding & Settings (`SidebarChat.tsx`)

### Current State
- Student onboarding modal selects skill level (Beginner, Intermediate, Advanced).
- Landing page shows generic tips ("What is a function?", "Explain this code").
- "I'm stuck" button sends a generic help request.
- Shows active/completed exercise counts in the sidebar.

### Gaps

| # | Issue | Impact |
|---|-------|--------|
| 4.1 | **No learning goal selection** — User selects a level but not a topic (e.g., "Learn React", "Learn Python"). The LLM has no curriculum direction. | **High** |
| 4.2 | **No onboarding wizard** — One modal with 3 radio buttons. No guided setup of interests, goals, time commitment, or prior experience. | **High** |
| 4.3 | **No curriculum picker** — No list of available courses/curricula to choose from. Users must ask the LLM to create one ad-hoc. | **High** |
| 4.4 | **"I'm stuck" is too generic** — Sends the same prompt every time. No context about which exercise or hint level. | **Medium** |
| 4.5 | **No exercise list in sidebar** — Active exercises are tracked but not displayed in the sidebar. User must ask "What are my active exercises?" | **High** |
| 4.6 | **No hint level indicator** — When asking for a hint, there's no visual indicator of how many hints have been used or what level the hint is. | **Medium** |
| 4.7 | **No learning streak visualization** — Streak count is shown as a raw number. No calendar heatmap or visual streak indicator. | **Low** |

---

## 5. Learning Progress Service (`learningProgressService.ts`)

### Current State
- Stores thread-level and global learning progress.
- Tracks: lessons, exercises, quizzes, hints, badges, streaks.
- Encrypted storage via `IStorageService`.
- Auto-checks badges on save.

### Gaps

| # | Issue | Impact |
|---|-------|--------|
| 5.1 | **No concept taxonomy** — Progress is tracked by lesson ID (string), not by a structured concept graph. No parent/child relationships. | **High** |
| 5.2 | **No skill level calculation** — `masteryLevel` is computed ad-hoc in `QuizMe.tsx`. No centralized skill assessment. | **High** |
| 5.3 | **Badge system is incomplete** — `_checkBadges()` computes but doesn't actually award badges (no threadId available). Badge names are auto-generated from IDs. | **Medium** |
| 5.4 | **No export/import** — Learning progress is trapped in local storage. No backup, sync, or migration mechanism. | **Medium** |
| 5.5 | **No per-concept time tracking** — `timeSpent` is per-lesson, not per-section or per-concept. | **Low** |
| 5.6 | **No learning velocity metric** — No tracking of how quickly the user masters concepts (lessons per day, exercise success rate over time). | **Low** |

---

## Prioritization Matrix

### 🔴 High Impact
| # | Item | Why |
|---|------|-----|
| 1.1 | Persist section completion state | Makes progress tracking meaningful. |
| 1.3 | Interactive exercise UI | Exercises are currently just text; no hands-on practice. |
| 1.4 | Code playground / sandbox | Critical for a coding tutor to let users experiment. |
| 2.1 | Real skill tree data | Hardcoded skill tree is useless; needs real tracking. |
| 2.4 | Lesson history in dashboard | Users need to see what they've learned. |
| 2.5 | Structured curriculum / learning path | Gives direction to the learning experience. |
| 3.1 | Inline quiz UI | Current "quiz" is just a chat prompt. |
| 3.2 | Quiz history | Users need to review past quiz performance. |
| 4.1 | Learning goal / topic selection | Without a topic, the tutor has no curriculum. |
| 4.3 | Curriculum picker | Users need to browse available courses. |
| 4.5 | Exercise list in sidebar | Active exercises should be visible and actionable. |
| 5.1 | Concept taxonomy / graph | Foundation for real skill tracking and adaptive learning. |

### 🟡 Medium Impact
| # | Item | Why |
|---|------|-----|
| 1.2 | Next section navigation | Smoother lesson flow. |
| 1.5 | Robust section parsing | More reliable content structure. |
| 1.6 | Visual progress bar | Motivational feedback. |
| 1.7 | Bookmarking | Useful for review. |
| 2.3 | Real badge data | Gamification needs real achievements. |
| 2.6 | Better XP system | More meaningful progression. |
| 2.7 | Time tracking granularity | Better analytics. |
| 3.3 | Real SM-2 / FSRS algorithm | Better retention. |
| 3.4 | Quiz analytics | Identifies weak areas. |
| 3.5 | Automatic daily quizzes | Habit formation. |
| 4.2 | Guided onboarding wizard | Better first-time experience. |
| 4.4 | Contextual "I'm stuck" | Better help quality. |
| 4.6 | Hint level indicator | Transparency in guidance. |
| 5.2 | Centralized skill level calc | Consistent mastery assessment. |
| 5.3 | Complete badge awarding | Finish the gamification system. |

### 🟢 Low Impact / Nice to Have
| # | Item | Why |
|---|------|-----|
| 1.8 | Note-taking | Personalization. |
| 2.8 | Sidebar pane instead of modal | UX preference. |
| 3.6 | Difficulty adaptation | Advanced feature. |
| 4.7 | Streak calendar heatmap | Visual delight. |
| 5.4 | Export/import progress | Data portability. |
| 5.5 | Per-concept time tracking | Granular analytics. |
| 5.6 | Learning velocity metric | Advanced analytics. |

---

## Recommended Implementation Order

### Phase 1: Foundation (Week 1)
1. **Persist section completion** — Wire `TeachingResultWrapper` to `LearningProgressService.updateLessonProgress()`.
2. **Add visual progress bar** — Show "X of Y sections completed" in the teaching wrapper header.
3. **Exercise list in sidebar** — Render active exercises from `studentSession` in `SidebarChat`.

### Phase 2: Content & Navigation (Week 2)
4. **Next section navigation** — Add "Continue" button at bottom of each expanded section.
5. **Robust section parsing** — Add fallback heuristics for non-standard markdown headers.
6. **Bookmarking** — Wire bookmark buttons to `LearningProgressService.addBookmark()`.

### Phase 3: Interactive Learning (Week 3-4)
7. **Inline exercise UI** — Create a simple code challenge component with instructions + editable code block.
8. **Quiz UI** — Multiple choice / fill-in-blank component with instant feedback.
9. **Code playground** — Integrate a minimal sandbox (or use existing editor) for running code examples.

### Phase 4: Dashboard & Analytics (Week 4-5)
10. **Real skill tree** — Replace hardcoded nodes with data from `LearningProgressService`.
11. **Lesson history** — List completed lessons with timestamps and scores.
12. **Quiz history** — Show past quizzes with scores and review links.
13. **Curriculum picker** — UI for browsing and selecting learning paths.

### Phase 5: Advanced (Week 6+)
14. **Concept taxonomy** — Structured concept graph in `LearningProgressService`.
15. **Spaced repetition algorithm** — Implement SM-2 or integrate FSRS.
16. **Learning goal selection** — Onboarding wizard with topic selection.
