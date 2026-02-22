# Ralph - Autonomous Feature Development

Interactive feature planning and autonomous execution loop for Claude Code.

---

## The Job

**Two modes:**

### Mode 1: New Feature
1. Chat through the feature - Ask clarifying questions
2. Break into small tasks - Each completable in one iteration
3. Create prd.json - Stories with dependencies
4. Set up ralph files - Reset progress.txt

### Mode 2: Existing PRD
1. Find existing prd.json - Verify it exists at project root
2. Verify structure - Check stories have proper dependencies
3. Show status - Which stories are ready, completed, blocked

**Ask the user which mode they need:**
```
Are you:
1. Starting a new feature (I'll help you plan and create the PRD)
2. Using an existing PRD (I'll show status and help run Ralph)
```

---

## Step 1: Understand the Feature

Start by asking the user about their feature. Don't assume - ASK:

```
What feature are you building?
```

Then ask clarifying questions:
- What's the user-facing goal?
- What parts of the codebase will this touch? (audio engine, UI components, synth definitions?)
- Are there any existing patterns to follow?
- What should it look like when done?

**Keep asking until you have enough detail to break it into stories.**

---

## Step 2: Break Into Stories

**Each story must be completable in ONE Ralph iteration (~one context window).**

Ralph spawns a fresh Claude Code instance per iteration with no memory of previous work. If a story is too big, the LLM runs out of context before finishing.

### Right-sized stories:
- Add a database column + migration
- Create a single UI component
- Implement one API endpoint
- Add a filter to an existing list
- Write tests for one module

### Too big (split these):
- "Build the entire dashboard" → Split into: schema, queries, components, filters
- "Add authentication" → Split into: schema, middleware, login UI, session handling
- "Refactor the API" → Split into one story per endpoint

**Rule of thumb:** If you can't describe the change in 2-3 sentences, it's too big.

---

## Step 3: Order by Dependencies

Stories execute based on `dependencies`. Earlier stories must complete before dependent ones start.

**Typical order:**
1. Schema/database changes (migrations)
2. API endpoints / backend logic
3. UI components that use the backend
4. Integration / E2E tests

Use `dependencies` array to express this:
```
Story 1: Schema (no dependencies)
Story 2: API endpoint (dependencies: ["story-001"])
Story 3: UI component (dependencies: ["story-002"])
Story 4: Tests (dependencies: ["story-003"])
```

Parallel stories that don't depend on each other can share the same dependency.

---

## Step 4: Create the PRD

Create `prd.json` at the project root with this structure:

```json
{
  "project": "Feature Name",
  "description": "One-line description of the feature",
  "created": "YYYY-MM-DD",
  "stories": [
    {
      "id": "story-001",
      "title": "Add priority field to database",
      "description": "Detailed description with:\n- What to implement\n- Files to create/modify\n- Acceptance criteria\n- How to verify",
      "priority": 1,
      "status": "pending",
      "services": ["audio", "ui"],
      "dependencies": [],
      "acceptance_criteria": [
        "Add priority field to module state",
        "State updates correctly",
        "npm run lint passes",
        "npm run build passes"
      ],
      "notes": ""
    }
  ]
}
```

### Story description format:

Write descriptions that a future Ralph iteration can pick up without context:

```
Implement parameter mapping for synth modules.

**What to do:**
- Create function mapParameterToControl(param)
- Map UI parameter values to synth control ranges
- Handle different parameter types (frequency, amplitude, etc.)

**Files:**
- src/audio/parameterMapper.js

**Acceptance criteria:**
- Function returns correct control values for all parameter types
- Returns default values for unknown parameters
- npm run lint passes
- npm run build passes

**Notes:**
- Follow pattern from existing synth modules
```

---

## Step 5: Set Up Ralph Files

After creating the PRD:

### 1. Check if progress.txt needs archiving:

```bash
cat progress.txt
```

**Archive if it has content from a previous feature:**
```bash
DATE=$(date +%Y-%m-%d)
FEATURE="previous-feature-name"
mkdir -p scripts/ralph/archive/$DATE-$FEATURE
mv progress.txt scripts/ralph/archive/$DATE-$FEATURE/
```

### 2. Create fresh progress.txt:

```bash
cat > progress.txt << 'EOF'
# Ralph Progress Log
Started: [current date]
Feature: [feature name]

## Codebase Patterns
(Patterns discovered during this feature build)

---
EOF
```

---

## Step 6: Confirm Setup

Show the user what was created:

```
✅ Ralph is ready!

**Feature:** [name]

**Stories:**
1. [Story 1 title] - no dependencies
2. [Story 2 title] - depends on #1
3. [Story 3 title] - depends on #2
...

**To start Ralph:**
./scripts/ralph/ralph.sh

Or run manually with: claude -p --dangerously-skip-permissions
```

---

## Quality Checks for ORA-FM

Each story's acceptance criteria MUST include relevant quality checks:

```
- npm run lint passes
- npm run build passes
```

### Good acceptance criteria (verifiable):
- "Add `modulationType` field to synth state with default 'none'"
- "Filter dropdown has options: All, Synths, Effects"
- "npm run lint passes"

### Bad acceptance criteria (vague):
- ❌ "Works correctly"
- ❌ "Good UX"
- ❌ "Handles edge cases"

---

## Mode 2: Setting Up Existing PRD

If the user already has a prd.json, help them check status:

### Verify PRD exists:

```bash
cat prd.json
```

### Show status:

Parse the PRD and report:
```
✅ Ralph is ready to use existing PRD!

**Feature:** [project name]

**Status:**
- ✅ Completed: X stories
- 🔄 Ready to work: Y stories (dependencies satisfied)
- ⏳ Blocked: Z stories (waiting on dependencies)

**Next story Ralph will pick:**
[Story title] - [brief description]

**To start:** ./scripts/ralph/ralph.sh
```

---

## Example Conversation

**User:** set up ralph for adding a new oscillator module

**Assistant:** What feature are you building?

**User:** I want to add a new wavetable oscillator module with multiple waveforms and modulation.

**Assistant:** Got it - wavetable oscillator with modulation. A few questions:

1. Should the waveforms be predefined or allow custom wavetables?
2. What modulation targets do you need? (frequency, amplitude, waveform position)
3. Do you need visualizations for the waveform or just controls?
4. Any existing synth modules I should follow as a pattern?

**User:** Predefined waveforms for now. FM and AM modulation. Just controls, no visualization. Follow the existing drone synth pattern.

**Assistant:** Here's my proposed breakdown:

1. **Create wavetable synthdef** - SuperCollider synthdef with wavetable oscillator
2. **Add WavetableModule component** - React component with controls
3. **Implement waveform selector** - Dropdown for waveform selection
4. **Add FM modulation controls** - Frequency modulation parameters
5. **Add AM modulation controls** - Amplitude modulation parameters
6. **Connect to Grid View** - Integration with module grid

Does this look right? Any stories to add or remove?

**User:** Looks good, create the PRD

**Assistant:** [Creates prd.json with 6 stories and proper dependencies]

✅ Ralph is ready!

**Feature:** Wavetable Oscillator Module

**Stories:** 6 stories created with dependencies

**To start:** `./scripts/ralph/ralph.sh`

---

# Phase 2: The Execution Loop

When Ralph runs, each iteration follows this workflow:

## Loop Workflow

### 1. Read progress.txt first

Check the "Codebase Patterns" section for context from previous iterations.

### 2. Find the next ready story

A story is "ready" when:
- `status` is "pending" or "in_progress"
- All stories in its `dependencies` array have `status: "done"`

### 3. Implement the story

Follow the story's description and acceptance criteria exactly.

### 4. Run quality checks

Run the checks specified in acceptance criteria. **FIX any failures before proceeding.**

### 5. Update AGENTS.md if needed

If you learned something important about the codebase:
- Check for AGENTS.md in directories where you edited files
- Add learnings that future developers/agents should know
- This is LONG-TERM memory

### 6. Update progress.txt

Append (never replace):
```
## [Date] - [Story Title]
Story ID: [id]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
---
```

### 7. Commit changes

```bash
git add -A
git commit -m "feat: [Story Title]

Story: [story-id]"
```

### 8. Mark story complete

Update prd.json to set the story's `status` to `"done"`.

### 9. Loop continues

Ralph spawns a new iteration which picks the next ready story.

---

## Task Discovery

While working, **create new stories** when you discover:
- Failing tests or test gaps
- Code that needs refactoring
- Missing error handling
- TODOs or FIXMEs in the code
- Build/lint warnings

Add them to prd.json with appropriate dependencies.

---

## Stop Condition

When no ready stories remain AND all stories are done:
1. Output: "✅ Build complete - all stories finished!"
2. Summarize what was accomplished
3. Archive progress.txt

---

## Checklist Before Starting

- [ ] Chatted through feature to understand scope
- [ ] Each story completable in one iteration (small enough)
- [ ] Stories ordered by dependency (schema → backend → UI → tests)
- [ ] Every story has quality checks in acceptance criteria
- [ ] Descriptions have enough detail to implement without context
- [ ] prd.json created at project root
- [ ] progress.txt reset for new feature
