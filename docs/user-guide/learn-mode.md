# Learn Mode

Learn Mode turns A-Coder into a personal coding tutor. Switch the chat mode to **🎓 Learn** and pick a difficulty level; the model then teaches, exercises, and quizzes you at your level.

> The level is remembered across sessions (`studentLevel` setting).

---

## Difficulty levels

| Level | Tagline |
|---|---|
| 🌱 **Beginner** | New to coding — simple explanations, no jargon |
| 🌿 **Intermediate** | Some experience — technical terms with definitions |
| �🌳 **Advanced** | Experienced — deep dives and best practices |

On first entering Learn mode you'll get an onboarding modal to pick a level. Change it later from the chat header dropdown.

---

## What the tutor can do

The model has a dedicated set of teaching tools (all auto-approved — learning never needs approval):

| Tool | What it does |
|---|---|
| `explain_code` | Line-by-line explanation of code at your level. |
| `teach_concept` | Teach a concept from scratch — analogy + example + exercise. |
| `create_exercise` | Generate a practice exercise in one of four types (below). |
| `check_answer` | Validate your solution **without giving away the answer** if you're wrong. |
| `give_hint` | Progressive hint, levels 1→4 (vague → solution). Each call advances a level. |
| `create_lesson_plan` | Build a multi-module learning path for a goal. |
| `display_lesson` | Render a markdown lesson in a dedicated preview tab. |

### Exercise types

| Type | What you do |
|---|---|
| `fill_blank` | Fill in missing code in a snippet. |
| `fix_bug` | Find and fix a bug in provided code. |
| `write_function` | Write a function from a spec. |
| `extend_code` | Extend existing code with new behavior. |

### Hints

Stuck? Ask for a hint. Hints escalate through four levels — each `give_hint` call advances one level, from a nudge toward the solution. The model tracks how many hints you've used per exercise so it doesn't repeat or overshoot.

### Quizzes

The tutor can create interactive quizzes (`create_quiz`) with immediate feedback and scoring — multiple question types, optional time limits, and per-question explanations.

---

## Progress, streaks & badges

A-Coder tracks your learning progress per thread and globally:

- **Lessons completed**, **exercises solved**, **quizzes taken**, **time spent**.
- **Streaks** — consecutive days learning (current + longest).
- **Badges** — unlockable across categories: lessons, exercises, quizzes, streaks, milestones.

Progress is stored locally (`~/.a-coder` data) and surfaced in the Learn-mode UI.

---

## Learning settings

These live in the Learn-mode UI (not the main Settings tabs):

| Setting | Default | Purpose |
|---|---|---|
| `preferredFontSize` | `medium` | Lesson font size (`small` / `medium` / `large`). |
| `preferredCodeTheme` | `auto` | Code-block theme in lessons (`light` / `dark` / `auto`). |
| `enableCelebrations` | `true` | Celebration animations on achievements. |
| `enableSoundEffects` | `false` | Sound effects on achievements. |
| `enableAnimations` | `true` | Animations in the learning UI. |
| `enableReducedMotion` | `false` | Reduce motion (accessibility). |
| `enableHighContrast` | `false` | High-contrast learning UI (accessibility). |

---

## Pair with the Proactive Coach

For ambient learning while you work, enable the [Proactive Coach](proactive-coach.md). Learn mode is on-demand tutoring (you ask); the coach is ambient (it offers). Together they keep you growing without interrupting your flow.