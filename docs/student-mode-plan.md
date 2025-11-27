# Student Mode Implementation Plan

## ✅ IMPLEMENTATION COMPLETE

**Status:** Fully implemented and ready for testing.

## Overview

A dedicated learning mode that transforms A-Coder from a "do it for you" assistant into a "teach you while doing" tutor. Uses **teaching tools** that are structured prompt injectors guiding the LLM to respond in educational formats.

---

## Core Principles

1. **Explain, Don't Just Execute** - Every action comes with educational context
2. **Scaffolded Learning** - Adjust depth based on student's level (beginner/intermediate/advanced)
3. **Active Engagement** - Ask questions, provide challenges, check understanding
4. **Tool-Driven Structure** - Teaching tools provide consistent, structured educational responses

---

## Architecture

### How Teaching Tools Work

Teaching tools are **not** like filesystem tools (`read_file`, `edit_file`). They are:

1. **Structured prompt injectors** - Capture parameters, return a template
2. **LLM response guides** - The template tells the LLM how to format its response
3. **State managers** - Track exercises, hints, progress

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   LLM calls     │ ──▶ │  Tool returns    │ ──▶ │  LLM fills in   │
│  explain_code   │     │  template/prompt │     │  the template   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### State Management

Student mode state stored in thread (persists with conversation):

```typescript
interface StudentSession {
  level: "beginner" | "intermediate" | "advanced";
  activeExercises: Map<string, Exercise>;
  hintLevels: Map<string, number>;  // exercise_id → current hint level
  conceptsLearned: string[];
  exercisesCompleted: number;
}
```

---

## Tool Specifications

### 1. `explain_code`

**Purpose:** Line-by-line explanation of code at student's level

**Parameters:**
```typescript
{
  code: string,           // The code to explain
  language: string,       // "python", "javascript", etc.
  level: "beginner" | "intermediate" | "advanced",
  focus?: string          // Optional: specific concept to highlight
}
```

**Tool Handler Returns:**
```typescript
return {
  result: `
## Code Explanation Task

**Code to explain:**
\`\`\`${language}
${code}
\`\`\`

**Student level:** ${level}

**Your response must include:**

### 📋 Summary
(One sentence: what does this code do?)

### 📖 Line-by-Line Breakdown
(Explain each part, using ${level}-appropriate language)

### 💡 Key Concepts
(List 2-3 concepts this code demonstrates)

### ⚠️ Common Mistakes
(What do beginners often get wrong with this pattern?)

### 🎯 Try It Yourself
(Suggest a small modification the student could try)
`
};
```

---

### 2. `teach_concept`

**Purpose:** Explain a programming concept from scratch

**Parameters:**
```typescript
{
  concept: string,        // "loops", "recursion", "API calls", etc.
  level: "beginner" | "intermediate" | "advanced",
  language?: string,      // Optional: show examples in specific language
  context?: string        // Optional: relate to student's current project
}
```

**Tool Handler Returns:**
```typescript
return {
  result: `
## Teach Concept Task

**Concept:** ${concept}
**Level:** ${level}
**Language:** ${language || 'any appropriate language'}
${context ? `**Context:** Relate to: ${context}` : ''}

**Your response must include:**

### 📚 What is ${concept}?
(Clear definition in ${level}-appropriate language)

### 🌍 Real-World Analogy
(Relatable comparison to everyday life)

### 💻 Code Example
\`\`\`${language || 'javascript'}
// Well-commented example
\`\`\`

### ⚠️ Common Pitfalls
(2-3 mistakes beginners make)

### 🔗 Related Concepts
(What to learn next)

### 🎯 Quick Exercise
(Simple practice problem to reinforce)
`
};
```

---

### 3. `create_exercise`

**Purpose:** Generate a practice problem for the student

**Parameters:**
```typescript
{
  topic: string,          // What concept to practice
  difficulty: "easy" | "medium" | "hard",
  language: string,
  type: "fill_blank" | "fix_bug" | "write_function" | "extend_code"
}
```

**Tool Handler:**
```typescript
case 'create_exercise': {
  const { topic, difficulty, language, type } = params;

  // Generate unique exercise ID
  const exerciseId = `ex_${Date.now()}_${randomId()}`;

  // Store in thread state for later reference
  threadState.activeExercises.set(exerciseId, {
    topic, difficulty, language, type,
    created: Date.now()
  });

  return {
    result: `
## Create Exercise Task

**Exercise ID:** ${exerciseId}
**Topic:** ${topic}
**Difficulty:** ${difficulty}
**Language:** ${language}
**Type:** ${type}

**Generate an exercise with this structure:**

### 🎯 Challenge: [Creative Title]

**Problem:**
(Clear description of what the student needs to do)

**Starter Code:**
\`\`\`${language}
// Appropriate starter code for "${type}" type
\`\`\`

**Expected Output/Behavior:**
(What correct solution should produce)

**Hints Available:** 3 (use give_hint tool if stuck)

---
*Save this Exercise ID: ${exerciseId}*
`
  };
}
```

---

### 4. `check_answer`

**Purpose:** Validate student's solution attempt (LLM-based validation)

**Parameters:**
```typescript
{
  exercise_id: string,    // Reference to the exercise
  student_code: string    // Their attempt
}
```

**Tool Handler:**
```typescript
case 'check_answer': {
  const { exercise_id, student_code } = params;
  const exercise = threadState.activeExercises.get(exercise_id);

  if (!exercise) {
    return { result: `Exercise ${exercise_id} not found. Create a new exercise first.` };
  }

  return {
    result: `
## Validate Student Solution

**Exercise:** ${exercise.topic} (${exercise.difficulty})
**Type:** ${exercise.type}

**Student's Code:**
\`\`\`${exercise.language}
${student_code}
\`\`\`

**Your task:**
1. Analyze if this solution is correct
2. Do NOT give the answer if wrong - guide them
3. Be encouraging regardless of result

**Response format:**

### Result: ✅ Correct! / ❌ Not quite...

### What Works Well
(Positive feedback on their approach)

### ${correct ? 'Why This Works' : 'Hint'}
(If correct: explain why. If wrong: ONE specific hint, not the answer)

### Next Step
(If correct: suggest extension. If wrong: encourage retry or offer hint)
`
  };
}
```

---

### 5. `give_hint`

**Purpose:** Progressive hints (level 1 → 2 → 3 → solution)

**Parameters:**
```typescript
{
  exercise_id: string
}
```

**Tool Handler:**
```typescript
case 'give_hint': {
  const { exercise_id } = params;
  const exercise = threadState.activeExercises.get(exercise_id);

  if (!exercise) {
    return { result: `Exercise ${exercise_id} not found.` };
  }

  // Get and increment hint level
  const currentLevel = threadState.hintLevels.get(exercise_id) || 0;
  const nextLevel = Math.min(currentLevel + 1, 4);
  threadState.hintLevels.set(exercise_id, nextLevel);

  const hintInstructions = {
    1: "VAGUE hint - just point in the right direction, no specifics",
    2: "MODERATE hint - mention the specific concept/method needed",
    3: "STRONG hint - show the structure/pseudocode without exact syntax",
    4: "SOLUTION - show complete answer with full explanation"
  };

  return {
    result: `
## Hint for Exercise: ${exercise.topic}

**Hint Level:** ${nextLevel} of 4
**Instruction:** ${hintInstructions[nextLevel]}

${nextLevel < 4
  ? `*(${4 - nextLevel} more hints before solution is revealed)*`
  : `*(This is the full solution)*`}

**Provide the level ${nextLevel} hint now.**
`
  };
}
```

---

### 6. `create_lesson_plan`

**Purpose:** Multi-step learning path for a topic or project

**Parameters:**
```typescript
{
  goal: string,           // "Build a todo app" or "Learn recursion"
  level: "beginner" | "intermediate" | "advanced",
  time_available?: number // Minutes (optional)
}
```

**Tool Handler:**
```typescript
case 'create_lesson_plan': {
  const { goal, level, time_available } = params;
  const planId = `lesson_${Date.now()}_${randomId()}`;

  return {
    result: `
## Create Lesson Plan

**Plan ID:** ${planId}
**Goal:** ${goal}
**Student Level:** ${level}
${time_available ? `**Time Available:** ${time_available} minutes` : ''}

**Create a structured lesson plan:**

### 🎯 Learning Objectives
(3-5 specific things student will learn)

### 📚 Prerequisites
(What student should already know)

### 📋 Modules

For each module include:
- **Title** and estimated time
- **Concepts** covered
- **Hands-on exercise** (reference create_exercise)
- **Checkpoint question** to verify understanding

### 🏆 Final Project
(Capstone that combines all learned concepts)

### 📈 Success Criteria
(How student knows they've mastered this)
`
  };
}
```

---

## Student Mode Tool Set

```typescript
const studentModeTools: BuiltinToolName[] = [
  // Read-only context (inherited from gather)
  'read_file',
  'outline_file',
  'ls_dir',
  'get_dir_tree',
  'search_pathnames_only',
  'search_for_files',
  'search_in_file',

  // Teaching tools (new)
  'explain_code',
  'teach_concept',
  'create_exercise',
  'check_answer',
  'give_hint',
  'create_lesson_plan',

  // Limited editing (for exercises/demos)
  'create_file_or_folder',
  'edit_file',
]
```

---

## System Prompt Addition

```typescript
const studentModePrompt = `
<student_mode>
You are a patient, encouraging coding tutor. Your goal is to help students LEARN, not just complete tasks.

**Teaching approach:**
1. Always explain concepts before showing code
2. Use the teaching tools to structure your responses
3. Ask questions to check understanding
4. Celebrate progress and normalize mistakes
5. Give hints before answers when students are stuck

**Tool usage:**
- Use \`teach_concept\` when introducing new ideas
- Use \`explain_code\` when reviewing code
- Use \`create_exercise\` to reinforce learning
- Use \`give_hint\` when student is stuck (progressive hints)
- Use \`check_answer\` to validate their attempts
- Use \`create_lesson_plan\` for multi-step learning paths

**Level: {{level}}**
- Beginner: No jargon, simple analogies, step-by-step
- Intermediate: Some technical terms, explain when introduced
- Advanced: Technical language, discuss trade-offs

**Never:**
- Write code without explanation
- Give complete solutions immediately
- Make students feel bad for not knowing
- Skip the "why" and only show the "how"
</student_mode>
`;
```

---

## Implementation Phases

### Phase 1: Core Mode Setup ✅
- [x] Add `'student'` to `ChatMode` type in `voidSettingsTypes.ts`
- [x] Add `studentModeTools` array in `prompts.ts`
- [x] Add student mode system prompt section
- [x] Add learning level setting (`studentLevel`) to void settings
- [x] Update mode selector UI to include Student option

### Phase 2: Basic Teaching Tools ✅
- [x] Add tool definitions to `builtinTools` in `prompts.ts`:
  - [x] `explain_code`
  - [x] `teach_concept`
- [x] Implement tool handlers in `toolsService.ts`
- [ ] Test with different levels (beginner/intermediate/advanced)

### Phase 3: Interactive Exercise Tools ✅
- [x] Add exercise tool definitions:
  - [x] `create_exercise`
  - [x] `check_answer`
  - [x] `give_hint`
- [x] Add exercise state to thread state (activeExercises, hintLevels)
- [x] Add StudentSession and StudentExercise types
- [x] Implement session management methods in chatThreadService
- [ ] Test exercise flow end-to-end

### Phase 4: Lesson Planning ✅
- [x] Add `create_lesson_plan` tool
- [x] Add progress tracking (exercise counts in toolbar)
- [ ] Test with real learning scenarios

### Phase 5: UI Enhancements ✅
- [x] Level picker in onboarding modal (shows when switching to student mode)
- [x] Student-specific landing page with tips
- [x] "I'm stuck" quick button (appears in student mode when not streaming)
- [x] Progress indicator (shows active/completed exercise counts in toolbar)
- [ ] Exercise submission UI - *Future*

---

## Files to Modify

| File | Changes |
|------|---------|
| `voidSettingsTypes.ts` | Add `'student'` to `ChatMode`, add `studentLevel` setting |
| `prompts.ts` | Add teaching tool definitions, `studentModeTools` array, system prompt |
| `toolsService.ts` | Implement teaching tool handlers |
| `toolsServiceTypes.ts` | Add teaching tool param/result types |
| `chatThreadService.ts` | Add student session state to thread |
| UI components | Mode selector, level picker (Phase 5) |

---

## Example Interaction Flow

**Student:** "I want to learn how to make a function in Python"

**A-Coder (Student Mode):**
1. Calls `teach_concept({ concept: "functions", level: "beginner", language: "python" })`
2. Tool returns structured template
3. LLM fills in with:
   - Definition with analogy
   - Simple code example
   - Common mistakes
   - Quick exercise

**Student:** "I tried the exercise but it's not working"

**A-Coder:**
1. Calls `give_hint({ exercise_id: "ex_123..." })`
2. Tool returns Level 1 hint instruction
3. LLM gives vague directional hint
4. Student tries again...

**Student:** "Still stuck"

**A-Coder:**
1. Calls `give_hint({ exercise_id: "ex_123..." })` again
2. Tool returns Level 2 hint (more specific)
3. Continue until solved or solution revealed

---

## Success Metrics

- Students can complete exercises with hints (not just given answers)
- Explanations are appropriate for selected level
- Progressive hint system prevents immediate solution reveal
- Lesson plans provide structured learning paths
