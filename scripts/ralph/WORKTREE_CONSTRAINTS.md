# Ralph in Worktrees - Constraints and Solutions

## Environment Constraints

When running Ralph in a Docker container within a git worktree, several constraints prevent fully automated completion:

### 1. Git Repository is Read-Only
- **Issue**: Cannot create `.git/index.lock` file
- **Cause**: Git worktrees use a reference to the main repo's `.git` directory, and Docker containers can't properly manage worktree lock files
- **Impact**: Ralph cannot commit changes from within Docker

### 2. Node Modules Unavailable
- **Issue**: Permission denied errors when accessing `node_modules` (owned by root in container)
- **Cause**: Docker builds `node_modules` as root, but the working directory is mounted from host
- **Impact**: Cannot run quality checks (`npm run typecheck`, `npm run lint`) inside Docker

### 3. File Permissions
- **Issue**: Files created/modified in Docker may have incorrect ownership
- **Cause**: Docker user vs host user ID mismatches
- **Impact**: May need to fix ownership of files after Docker runs

## Solution: ralph-auto.sh

The `ralph-auto.sh` script provides a comprehensive orchestration solution that works around these constraints:

### How It Works

1. **Detects Environment**
   - Automatically detects if running in a worktree
   - Identifies main repo root
   - Checks for node_modules availability

2. **Runs Ralph in Docker** (Read-Only Mode)
   - Ralph makes code changes in the container
   - Git operations are read-only (can read repo, cannot commit)
   - Changes are persisted to host via volume mount

3. **Runs Quality Checks on Host**
   - After Ralph completes, automatically runs `npm run lint -- --fix` to auto-fix formatting and linting issues
   - Then runs `npm run typecheck` and `npm run lint` for verification
   - Uses host's `node_modules` (proper permissions)
   - Runs only for workspaces that have changes

4. **Handles Git Operations on Host**
   - Commits are made on the host (proper git permissions)
   - Shows change summary before committing
   - Offers interactive or automatic commit options

### Usage

#### Basic Usage
```bash
./ralph-auto.sh
```

#### With Options
```bash
# Run with more iterations
./ralph-auto.sh --iterations 20

# Fresh start with dependency installation
./ralph-auto.sh --fresh --install-deps

# Auto-commit with custom message
./ralph-auto.sh --auto-commit --commit-msg "feat: implement new feature"

# Skip quality checks (useful for testing)
./ralph-auto.sh --skip-checks
```

#### All Options
- `--iterations N` - Max Ralph iterations (default: 10)
- `--install-deps` - Install dependencies before running
- `--setup-db` - Setup test database before running
- `--fresh` - Remove volumes and start fresh
- `--skip-checks` - Skip quality checks after Ralph completes
- `--skip-commit` - Don't prompt to create commit after completion
- `--auto-commit` - Automatically commit changes (no prompt)
- `--commit-msg MSG` - Commit message (requires --auto-commit)

### Workflow

1. Start: `./ralph-auto.sh`
2. Ralph runs in Docker and makes code changes
3. Script automatically runs quality checks on host
4. If checks pass, you're prompted to commit
5. Script shows next steps (push, create PR, etc.)

### Benefits

- **Fully Automated**: No manual intervention needed between steps
- **Auto-Formatting**: Automatically fixes prettier formatting and auto-fixable ESLint issues
- **Environment Aware**: Detects worktree automatically
- **Quality Guaranteed**: Won't commit if checks fail
- **Safe**: Runs checks on host with proper permissions
- **Flexible**: Supports both interactive and automated modes

### Auto-Fix Feature

The script automatically fixes:
- Prettier formatting issues (indentation, quotes, semicolons, etc.)
- Auto-fixable ESLint rules (unused imports, spacing, etc.)

This means Ralph's code changes will be automatically formatted to match your project's style guide before verification checks run, reducing manual formatting work.

## Alternative: Manual Workflow

If you prefer not to use the orchestration script, you can run steps manually:

```bash
# 1. Run Ralph in Docker (read-only)
./ralph-docker.sh

# 2. Run quality checks on host
cd customer && npm run typecheck && npm run lint
cd ../shopify-admin && npm run typecheck && npm run lint

# 3. Commit changes on host
git add -A
git commit -m "your message"
git push
```

## Troubleshooting

### Quality Checks Fail
- Ralph made changes that don't pass typecheck/lint
- Fix the issues manually or let Ralph run again
- Don't commit until checks pass

### Permission Errors
- If files have wrong ownership: `sudo chown -R $(whoami):$(id -gn) .`
- This shouldn't happen with proper UID/GID mapping

### Git Lock Errors
- If you see `.git/index.lock` errors, remove the lock file on host:
  ```bash
  rm -f .git/index.lock
  ```

### Node Modules Missing
- Run `npm install` in the workspace on the host:
  ```bash
  cd customer && npm install
  cd ../shopify-admin && npm install
  ```

## Future Improvements

Potential enhancements to consider:

1. **Incremental Checks**: Only run typecheck/lint on changed files
2. **Test Running**: Automatically run relevant tests
3. **PR Creation**: Automatically create PR after successful commit
4. **Rollback**: Automatically rollback changes if quality checks fail
5. **Parallel Checks**: Run customer and shopify-admin checks in parallel
