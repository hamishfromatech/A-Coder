# Proactive AI Coach

The Proactive Coach is a background learning assistant that watches your editor activity and surfaces a dismissible coaching bubble when it notices something worth discussing — a pattern, a missed opportunity, a concept you might want to learn.

> Configure in **Settings → Features → Proactive Coach**.

---

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `enableProactiveCoach` | `false` | Master toggle. |
| `proactiveCoachIntervalSeconds` | `120` | Minimum seconds between coach checks. |

## How it works

- A `ProactiveLearningService` observes editor activity and, no more often than the interval, emits a `ProactiveCoachObservation`.
- An editor overlay widget (`ProactiveCoachContribution`) listens for observations and mounts a small React bubble with **Dismiss** / **Discuss** actions.
- **Discuss** opens the sidebar chat so you can explore the suggestion with the model.
- **Dismiss** closes the bubble.

If `proactiveCoachIntervalSeconds` is `0` or less, the coach never fires. Raise the interval to make it less intrusive; lower it (within reason) for more active coaching.

---

## Relation to Learn mode

The coach pairs naturally with [Learn Mode](learn-mode.md): Learn mode is on-demand tutoring (you ask), while the Proactive Coach is ambient (it offers). Enable both when you want A-Coder to actively help you grow as you work, not just when you explicitly ask.