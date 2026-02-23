#!/bin/bash
#
# Ralph - Autonomous AI Agent Loop for Claude Code
#
# This script implements an autonomous agent loop that:
# 1. Reads a PRD (prd.json) with user stories
# 2. Picks the highest-priority incomplete story
# 3. Implements it in a fresh Claude Code context
# 4. Runs quality checks (typecheck, lint, tests)
# 5. Commits if checks pass
# 6. Updates the PRD to mark the story complete
# 7. Appends learnings to progress.txt
# 8. Repeats until all stories pass or max iterations reached
#
# Usage: ./ralph.sh [max_iterations]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRD_FILE="$PROJECT_ROOT/prd.json"
PROGRESS_FILE="$PROJECT_ROOT/progress.txt"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"
MAX_ITERATIONS="${1:-10}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[Ralph]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[Ralph]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[Ralph]${NC} $1"
}

log_error() {
    echo -e "${RED}[Ralph]${NC} $1"
}

# Check dependencies
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed. Install with: brew install jq"
        exit 1
    fi

    if ! command -v claude &> /dev/null; then
        log_error "claude CLI is required but not installed."
        exit 1
    fi
}

# Initialize progress file if it doesn't exist
init_progress_file() {
    if [[ ! -f "$PROGRESS_FILE" ]]; then
        echo "# Ralph Progress Log" > "$PROGRESS_FILE"
        echo "# This file tracks learnings and progress across Ralph iterations" >> "$PROGRESS_FILE"
        echo "" >> "$PROGRESS_FILE"
    fi
}

# Get the next incomplete story from PRD
get_next_story() {
    if [[ ! -f "$PRD_FILE" ]]; then
        log_error "PRD file not found: $PRD_FILE"
        log_info "Create a prd.json file at the project root. See scripts/ralph/prd.json.example for format."
        exit 1
    fi

    # Find the first story with status != "done", ordered by priority (lower = higher priority)
    jq -r '
        .stories
        | sort_by(.priority)
        | map(select(.status != "done"))
        | first
        | if . then .id else "none" end
    ' "$PRD_FILE"
}

# Get story details by ID
get_story_details() {
    local story_id="$1"
    jq -r ".stories[] | select(.id == \"$story_id\")" "$PRD_FILE"
}

# Create the branch name from story
get_branch_name() {
    local story_id="$1"
    local story_title
    story_title=$(jq -r ".stories[] | select(.id == \"$story_id\") | .title" "$PRD_FILE")
    # Convert title to kebab-case branch name
    echo "ralph/${story_id}-$(echo "$story_title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-50)"
}

# Build the prompt for Claude Code
build_prompt() {
    local story_id="$1"
    local story_json
    story_json=$(get_story_details "$story_id")

    local base_prompt
    base_prompt=$(cat "$PROMPT_FILE")

    # Inject the current story into the prompt
    cat <<EOF
$base_prompt

## Current Story to Implement

\`\`\`json
$story_json
\`\`\`

## PRD Context

The full PRD is available at \`prd.json\` in the project root.

## Progress History

$(if [[ -f "$PROGRESS_FILE" ]]; then cat "$PROGRESS_FILE"; else echo "No previous progress."; fi)
EOF
}

# Run a single Ralph iteration
run_iteration() {
    local iteration="$1"
    local story_id="$2"

    echo ""
    log_info "╭─────────────────────────────────────────────────────────────────╮"
    log_info "│  ITERATION $iteration: Story $story_id"
    log_info "╰─────────────────────────────────────────────────────────────────╯"

    local branch_name
    branch_name=$(get_branch_name "$story_id")
    log_info "Target branch: $branch_name"

    # Check if we need to create/switch branch
    local current_branch
    current_branch=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")
    log_info "Current branch: $current_branch"

    if [[ "$current_branch" != "$branch_name" ]]; then
        # Check if branch exists
        if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/$branch_name"; then
            log_info "Switching to existing branch: $branch_name"
            git -C "$PROJECT_ROOT" checkout "$branch_name"
            log_success "Switched to branch: $branch_name"
        else
            log_info "Creating new branch: $branch_name"
            git -C "$PROJECT_ROOT" checkout -b "$branch_name"
            log_success "Created and switched to branch: $branch_name"
        fi
    else
        log_info "Already on target branch"
    fi

    log_info "Building prompt for Claude Code..."
    local prompt
    prompt=$(build_prompt "$story_id")
    log_success "Prompt built ($(echo "$prompt" | wc -l | tr -d ' ') lines)"

    log_info "Spawning Claude Code instance..."
    log_info "This may take several minutes. Claude Code is working autonomously..."
    log_info "Started at: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    echo "─────────────────────────────────────────────────────────────────"

    # Run Claude Code with the prompt
    # Using --print for non-interactive output and --dangerously-skip-permissions for automation
    # Use tee to stream output to terminal while also capturing exit code
    set +e
    echo "$prompt" | claude -p --print --dangerously-skip-permissions 2>&1
    local exit_code=$?
    set -e

    echo "─────────────────────────────────────────────────────────────────"
    echo ""
    log_info "Finished at: $(date '+%Y-%m-%d %H:%M:%S')"

    if [[ $exit_code -eq 0 ]]; then
        log_success "Claude Code iteration completed successfully"
        return 0
    else
        log_error "Claude Code iteration failed with exit code: $exit_code"
        return 1
    fi
}

# Main loop
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║           Ralph - Autonomous AI Agent Loop                        ║"
    echo "╚═══════════════════════════════════════════════════════════════════╝"
    echo ""
    log_info "Starting Ralph autonomous agent loop"
    log_info "Max iterations: $MAX_ITERATIONS"
    log_info "Project root: $PROJECT_ROOT"
    log_info "PRD file: $PRD_FILE"
    log_info "Progress file: $PROGRESS_FILE"
    echo ""

    log_info "Checking dependencies..."
    check_dependencies
    log_success "Dependencies OK (jq, claude)"

    init_progress_file

    cd "$PROJECT_ROOT"

    local iteration=1

    while [[ $iteration -le $MAX_ITERATIONS ]]; do
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "Looking for next incomplete story..."

        local next_story
        next_story=$(get_next_story)

        if [[ "$next_story" == "none" ]] || [[ -z "$next_story" ]]; then
            echo ""
            log_success "═══════════════════════════════════════════════════════════════"
            log_success "All stories completed! Ralph is done."
            log_success "═══════════════════════════════════════════════════════════════"
            exit 0
        fi

        local story_title
        story_title=$(jq -r ".stories[] | select(.id == \"$next_story\") | .title" "$PRD_FILE")
        log_info "Next story: $next_story"
        log_info "Title: $story_title"

        if run_iteration "$iteration" "$next_story"; then
            log_success "Iteration $iteration completed successfully"
        else
            log_warning "Iteration $iteration had issues, continuing..."
        fi

        iteration=$((iteration + 1))

        if [[ $iteration -le $MAX_ITERATIONS ]]; then
            log_info "Waiting 2 seconds before next iteration..."
            sleep 2
        fi
    done

    echo ""
    log_warning "═══════════════════════════════════════════════════════════════"
    log_warning "Reached max iterations ($MAX_ITERATIONS). Some stories may still be incomplete."
    log_warning "═══════════════════════════════════════════════════════════════"
    log_info "Check prd.json for remaining stories and progress.txt for learnings."
}

main "$@"
