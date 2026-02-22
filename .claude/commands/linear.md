# Linear Issue Setup

Fetch a Linear issue, create a worktree with its branch name, generate a PRD, and convert it to prd.json for Ralph execution.

---

## The Job

1. Receive a Linear issue ID from the user (e.g., `ENG-123` or just the ID)
2. Fetch the issue details from Linear (title, description, branch name)
3. Create a worktree using `wt create <branch-name>`
4. Change directory into the new worktree
5. Invoke `/prd` with a summary of the Linear issue
6. Invoke `/ralph` to convert the PRD markdown to `prd.json`

---

## Step 1: Fetch Linear Issue

Use the `mcp__linear__get_issue` tool to fetch the issue details:

```
mcp__linear__get_issue(id: "$ARGUMENTS")
```

Extract from the response:
- **Title**: The issue title
- **Description**: The issue description (may be markdown)
- **Branch Name**: The git branch name (usually in `branchName` field)
- **Labels**: Any labels on the issue
- **Priority**: The issue priority

If the issue is not found, inform the user and stop.

---

## Step 2: Create Worktree

Run the worktree creation command with the Linear-generated branch name and the `--ora` flag to run project setup:

```bash
wt create <branch-name> --ora
```

The `wt` command will:
1. Create the worktree at `.worktrees/<branch-name>`
2. Copy `.env` file if it exists
3. Run `npm install`

---

## Step 3: Change Directory

Change the working directory to the new worktree:

```bash
cd <worktree-path>
```

Confirm you're in the correct directory.

---

## Step 4: Generate PRD Summary

Create a summary of the Linear issue to pass to the PRD generator. Format it as:

```
Linear Issue: <issue-id>
Title: <title>

<description>

Priority: <priority>
Labels: <labels>
```

---

## Step 5: Invoke PRD Command

Use the Skill tool to invoke the `/prd` command with the summary:

```
Skill(skill: "prd", args: "<summary>")
```

This will trigger the PRD generator which will:
1. Ask clarifying questions
2. Generate a structured PRD
3. Save it to `tasks/prd-[feature-name].md`

---

## Step 6: Convert PRD to prd.json

After the PRD markdown is generated, invoke the `/ralph` skill to convert it to `prd.json`:

```
Skill(skill: "ralph", args: "Convert the PRD at tasks/prd-[feature-name].md to prd.json")
```

When invoking ralph:
1. Tell it you have an existing PRD markdown file
2. Point it to the `tasks/prd-[feature-name].md` file that was just created
3. Ask it to parse the markdown and create the corresponding `prd.json`

Ralph will:
1. Read the PRD markdown file
2. Extract the user stories and acceptance criteria
3. Convert them to the `prd.json` format with proper dependencies
4. Create `prd.json` at the project root
5. Set up `progress.txt` for the Ralph execution loop

---

## Example Flow

```
User: /linear ENG-123

1. Fetch ENG-123 from Linear
   - Title: "Add user authentication"
   - Description: "Implement OAuth2 login with Google..."
   - Branch: "eng-123-add-user-authentication"

2. Create worktree
   $ wt create eng-123-add-user-authentication --ora
   Created worktree at /path/to/worktrees/eng-123-add-user-authentication
   (runs npm install)

3. Change directory
   $ cd /path/to/worktrees/eng-123-add-user-authentication

4. Invoke PRD with summary
   /prd "Linear Issue: ENG-123 - Add user authentication

   Implement OAuth2 login with Google and GitHub providers.
   Users should be able to sign in with existing accounts.

   Priority: High
   Labels: feature, auth"

5. PRD generates tasks/prd-add-user-authentication.md

6. Invoke Ralph to convert PRD to prd.json
   /ralph "Convert the PRD at tasks/prd-add-user-authentication.md to prd.json"

   Ralph creates:
   - prd.json at project root with stories and dependencies
   - progress.txt reset for the new feature
```

---

## Error Handling

- **Issue not found**: Tell the user the issue ID was not found in Linear
- **Worktree creation fails**: Show the error and suggest checking if the branch already exists
- **Already in worktree**: If `wt create` indicates the branch exists, offer to just cd into it

---

## Notes

- The issue ID can be provided with or without the team prefix (e.g., `ENG-123` or just `123`)
- The branch name comes from Linear's auto-generated branch name field
- The PRD markdown will be saved in the new worktree's `tasks/` directory
- The `prd.json` will be created at the project root, ready for Ralph execution
- After completion, run `./scripts/ralph/ralph.sh` to start autonomous development
