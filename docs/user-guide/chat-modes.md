# Chat Modes

A-Coder's sidebar has four modes, picked from the dropdown at the bottom of the chat. Each mode changes what the model is allowed to do and how it's prompted.

> Switch modes anytime — the choice is remembered across sessions (`chatMode` setting).

---

## The four modes

### 💬 Chat — *Conversation only, no tools*
> Engage in pure conversation. Ask questions, explore ideas, and get high-level advice.

The model answers from its own knowledge and whatever context you paste in. It **cannot** read your files, run tools, or edit code. Best for quick questions, brainstorming, explaining concepts, and anything where you don't want the model touching your project.

### 🔍 Plan — *Research, plan & document*
> Research your codebase. Create detailed implementation plans for review.

The model can **read** your codebase (read-only tools run in parallel) and produce structured plans — todos, implementation plans with steps/complexity/dependencies, walkthroughs — but it **cannot edit files or run commands**. Best for understanding an unfamiliar codebase, scoping a feature, and getting a reviewable plan before any code changes.

### 🤖 Code — *Edit files & run commands*
> Kick off a new project. Make changes across your entire codebase.

Full agent autonomy. The model reads, edits, creates, and deletes files, runs terminal commands, and orchestrates multi-step work. Sensitive actions require approval unless you enable [auto-approval](tool-approval-and-terminal.md). Bounded by **Max Iterations** (`maxAgentIterations`, default 50). This is the default mode.

### 🎓 Learn — *Ask questions, learn concepts, and practice coding with your personal tutor*
> Ask questions, learn concepts, and practice coding with your personal tutor.

Interactive tutoring with a difficulty level (🌱 Beginner / 🌿 Intermediate / 🌳 Advanced). The model explains code, teaches concepts, generates exercises (fill-in-the-blank, fix-bug, write-function, extend-code), checks your answers, gives progressive hints, builds lesson plans, and quizzes you. See [Learn Mode](learn-mode.md).

---

## Choosing a mode

| You want to… | Use |
|---|---|
| Ask a quick question, no file access | **Chat** |
| Understand a codebase or scope a feature | **Plan** |
| Actually change code, run commands | **Code** |
| Learn / practice / get tutored | **Learn** |

**Safety tip:** Start in **Plan** for anything non-trivial. Review the plan, then switch to **Code** to execute it. This separates thinking from acting and keeps you in control.

---

## Behaviors common to all modes

- **Double-tap Enter** to force-send while the model is streaming.
- **Auto-continue** — long responses continue automatically up to limits; the message queue retries with exponential backoff.
- **Image attachments** — drag/drop or paste images (with [Vision](vision.md) enabled).
- **@-mentions / context chips** — attach files and gather context inline.
- **Multiple threads** — work on several conversations at once.
- **Voice** — dictate input (STT) or hear answers (TTS) if [Voice](voice.md) is enabled.
- **Reasoning** — thinking-capable models show a reasoning card; control reasoning per model (budget/effort). See [Providers & Models](providers-and-models.md#reasoning-thinking-controls).
- **Notification sound** — optional audio when a response completes (`notificationSound`).