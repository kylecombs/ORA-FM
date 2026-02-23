#!/bin/bash
#
# Ralph Auto - Comprehensive Orchestration Script
# Handles the complete Ralph workflow with automatic worktree detection
#
# This script:
# 1. Detects if running in a worktree environment
# 2. Runs Ralph in Docker for code changes (with read-only git)
# 3. Automatically runs quality checks on the host (where node_modules exist)
# 4. Handles git operations on the host (with proper permissions)
# 5. Optionally creates commits or PRs after successful completion
#
# Usage:
#   ./ralph-auto.sh [options]
#
# Options:
#   --iterations N       Max Ralph iterations (default: 10)
#   --install-deps       Install dependencies before running
#   --setup-db           Setup test database before running
#   --fresh              Remove volumes and start fresh
#   --skip-checks        Skip quality checks after Ralph completes
#   --skip-commit        Don't prompt to create commit after completion
#   --auto-commit        Automatically commit changes (no prompt)
#   --commit-msg MSG     Commit message (requires --auto-commit)
#   --name NAME          Instance name for parallel execution (default: auto-detected)
#   -h, --help           Show this help message
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RALPH_DOCKER_SCRIPT="$SCRIPT_DIR/ralph-docker.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[Ralph Auto]${NC} $1"; }
log_success() { echo -e "${GREEN}[Ralph Auto]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[Ralph Auto]${NC} $1"; }
log_error() { echo -e "${RED}[Ralph Auto]${NC} $1"; }
log_step() { echo -e "\n${CYAN}${BOLD}=== $1 ===${NC}\n"; }

# Default values
MAX_ITERATIONS=10
INSTALL_DEPS="false"
SETUP_DB="false"
FRESH="false"
SKIP_CHECKS="false"
SKIP_COMMIT="false"
AUTO_COMMIT="false"
COMMIT_MSG=""
INSTANCE_NAME=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        --install-deps)
            INSTALL_DEPS="true"
            shift
            ;;
        --setup-db)
            SETUP_DB="true"
            shift
            ;;
        --fresh)
            FRESH="true"
            shift
            ;;
        --skip-checks)
            SKIP_CHECKS="true"
            shift
            ;;
        --skip-commit)
            SKIP_COMMIT="true"
            shift
            ;;
        --auto-commit)
            AUTO_COMMIT="true"
            shift
            ;;
        --commit-msg)
            COMMIT_MSG="$2"
            shift 2
            ;;
        --name)
            INSTANCE_NAME="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --iterations N       Max iterations (default: 10)"
            echo "  --install-deps       Install dependencies first"
            echo "  --setup-db           Setup test database first"
            echo "  --fresh              Clean slate (removes volumes)"
            echo "  --skip-checks        Skip quality checks after Ralph"
            echo "  --skip-commit        Don't prompt to create commit"
            echo "  --auto-commit        Automatically commit changes"
            echo "  --commit-msg MSG     Commit message (requires --auto-commit)"
            echo "  --name NAME          Instance name for parallel execution"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Detect environment
detect_environment() {
    log_step "Detecting Environment"

    # Check if we're in a worktree
    if [ -f "$PROJECT_ROOT/.git" ]; then
        IS_WORKTREE="true"
        WORKTREE_NAME=$(basename "$PROJECT_ROOT")
        log_info "Detected worktree environment: $WORKTREE_NAME"

        # Find main repo root
        local gitdir
        gitdir=$(cat "$PROJECT_ROOT/.git" | sed 's/gitdir: //')
        MAIN_REPO_ROOT=$(echo "$gitdir" | sed 's|/.git/worktrees/.*||')
        log_info "Main repo root: $MAIN_REPO_ROOT"
    else
        IS_WORKTREE="false"
        MAIN_REPO_ROOT="$PROJECT_ROOT"
        log_info "Detected main repository (not a worktree)"
    fi

    # Check for node_modules
    if [ -d "$PROJECT_ROOT/customer/node_modules" ] || [ -d "$PROJECT_ROOT/shopify-admin/node_modules" ]; then
        HAS_NODE_MODULES="true"
        log_success "Node modules found - quality checks can run"
    else
        HAS_NODE_MODULES="false"
        log_warning "Node modules not found - quality checks will be skipped"
        SKIP_CHECKS="true"
    fi

    # Get current branch
    CURRENT_BRANCH=$(cd "$PROJECT_ROOT" && git rev-parse --abbrev-ref HEAD)
    log_info "Current branch: $CURRENT_BRANCH"
}

# Run Ralph in Docker
run_ralph() {
    log_step "Running Ralph in Docker"

    # Build arguments for ralph-docker.sh
    local args=("run")
    args+=("--iterations" "$MAX_ITERATIONS")

    if [ "$INSTALL_DEPS" = "true" ]; then
        args+=("--install-deps")
    fi

    if [ "$SETUP_DB" = "true" ]; then
        args+=("--setup-db")
    fi

    if [ "$FRESH" = "true" ]; then
        args+=("--fresh")
    fi

    if [ -n "$INSTANCE_NAME" ]; then
        args+=("--name" "$INSTANCE_NAME")
    fi

    log_info "Running: $RALPH_DOCKER_SCRIPT ${args[@]}"
    log_warning "Git operations in Docker are read-only due to worktree constraints"
    log_info "Quality checks and commits will be handled on the host after Ralph completes"
    echo ""

    # Run ralph-docker.sh
    if ! "$RALPH_DOCKER_SCRIPT" "${args[@]}"; then
        log_error "Ralph Docker execution failed"
        return 1
    fi

    log_success "Ralph Docker execution completed"
}

# Run quality checks on host
run_quality_checks() {
    if [ "$SKIP_CHECKS" = "true" ]; then
        log_warning "Skipping quality checks (--skip-checks specified or node_modules missing)"
        return 0
    fi

    log_step "Running Quality Checks on Host"

    cd "$PROJECT_ROOT"

    # Check if there are any changes
    if git diff --quiet && git diff --cached --quiet; then
        log_info "No changes detected, skipping quality checks"
        return 0
    fi

    # Determine which workspace(s) have changes
    local customer_changed=false
    local shopify_changed=false

    if git diff --name-only HEAD | grep -q "^customer/"; then
        customer_changed=true
    fi

    if git diff --name-only HEAD | grep -q "^shopify-admin/"; then
        shopify_changed=true
    fi

    # Auto-fix linting and formatting issues first
    log_info "Auto-fixing linting and formatting issues..."
    echo ""

    if [ "$customer_changed" = "true" ] && [ -d "$PROJECT_ROOT/customer/node_modules" ]; then
        cd "$PROJECT_ROOT/customer"
        log_info "Auto-fixing customer workspace..."
        if npm run lint -- --fix; then
            log_success "Customer auto-fix completed"
        else
            log_warning "Some customer issues could not be auto-fixed"
        fi
    fi

    if [ "$shopify_changed" = "true" ] && [ -d "$PROJECT_ROOT/shopify-admin/node_modules" ]; then
        cd "$PROJECT_ROOT/shopify-admin"
        log_info "Auto-fixing shopify-admin workspace..."
        if npm run lint -- --fix; then
            log_success "Shopify-admin auto-fix completed"
        else
            log_warning "Some shopify-admin issues could not be auto-fixed"
        fi
    fi

    echo ""
    log_info "Running verification checks..."
    echo ""

    # Run checks for customer workspace
    if [ "$customer_changed" = "true" ]; then
        log_info "Verifying customer workspace..."

        if [ -d "$PROJECT_ROOT/customer/node_modules" ]; then
            cd "$PROJECT_ROOT/customer"

            log_info "Running typecheck..."
            if npm run typecheck; then
                log_success "Typecheck passed"
            else
                log_error "Typecheck failed"
                return 1
            fi

            log_info "Running lint..."
            if npm run lint; then
                log_success "Lint passed"
            else
                log_error "Lint failed"
                return 1
            fi
        else
            log_warning "Customer node_modules not found, skipping checks"
        fi
    fi

    # Run checks for shopify-admin workspace
    if [ "$shopify_changed" = "true" ]; then
        log_info "Verifying shopify-admin workspace..."

        if [ -d "$PROJECT_ROOT/shopify-admin/node_modules" ]; then
            cd "$PROJECT_ROOT/shopify-admin"

            log_info "Running typecheck..."
            if npm run typecheck; then
                log_success "Typecheck passed"
            else
                log_error "Typecheck failed"
                return 1
            fi

            log_info "Running lint..."
            if npm run lint; then
                log_success "Lint passed"
            else
                log_error "Lint failed"
                return 1
            fi
        else
            log_warning "Shopify-admin node_modules not found, skipping checks"
        fi
    fi

    cd "$PROJECT_ROOT"
    log_success "All quality checks passed"
}

# Show changes summary
show_changes_summary() {
    log_step "Changes Summary"

    cd "$PROJECT_ROOT"

    # Show status
    log_info "Git status:"
    git status --short

    echo ""

    # Show diff stats
    log_info "Diff stats:"
    git diff --stat
}

# Handle git commit
handle_commit() {
    if [ "$SKIP_COMMIT" = "true" ]; then
        log_info "Skipping commit (--skip-commit specified)"
        return 0
    fi

    log_step "Git Commit"

    cd "$PROJECT_ROOT"

    # Check if there are changes
    if git diff --quiet && git diff --cached --quiet; then
        log_info "No changes to commit"
        return 0
    fi

    # Auto-commit if specified
    if [ "$AUTO_COMMIT" = "true" ]; then
        if [ -z "$COMMIT_MSG" ]; then
            log_error "--auto-commit requires --commit-msg"
            return 1
        fi

        log_info "Auto-committing changes..."
        git add -A
        git commit -m "$COMMIT_MSG

Co-Authored-By: Ralph (Claude) <noreply@anthropic.com>"
        log_success "Changes committed"
        return 0
    fi

    # Prompt user
    echo ""
    read -p "$(echo -e ${CYAN}Would you like to commit these changes? \(y/N\)${NC} )" -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        read -p "$(echo -e ${CYAN}Enter commit message:${NC} )" commit_msg

        if [ -n "$commit_msg" ]; then
            git add -A
            git commit -m "$commit_msg

Co-Authored-By: Ralph (Claude) <noreply@anthropic.com>"
            log_success "Changes committed"
        else
            log_warning "Empty commit message, skipping commit"
        fi
    else
        log_info "Skipping commit"
    fi
}

# Main execution flow
main() {
    log_info "Ralph Auto - Comprehensive Orchestration Script"
    echo ""

    # Check dependencies
    if [ ! -f "$RALPH_DOCKER_SCRIPT" ]; then
        log_error "ralph-docker.sh not found at: $RALPH_DOCKER_SCRIPT"
        exit 1
    fi

    # Detect environment
    detect_environment

    # Store initial state
    INITIAL_COMMIT=$(cd "$PROJECT_ROOT" && git rev-parse HEAD)

    # Run Ralph
    if ! run_ralph; then
        log_error "Ralph execution failed, stopping"
        exit 1
    fi

    # Check if Ralph made changes
    FINAL_COMMIT=$(cd "$PROJECT_ROOT" && git rev-parse HEAD)

    if [ "$INITIAL_COMMIT" = "$FINAL_COMMIT" ]; then
        if git diff --quiet && git diff --cached --quiet; then
            log_info "No changes made by Ralph"
            exit 0
        fi
    fi

    # Show changes
    show_changes_summary

    # Run quality checks
    if ! run_quality_checks; then
        log_error "Quality checks failed"
        log_warning "Changes were made but quality checks did not pass"
        log_info "Fix the issues and run quality checks again before committing"
        exit 1
    fi

    # Handle commit
    handle_commit

    log_step "Complete"
    log_success "Ralph Auto workflow completed successfully!"

    if [ "$IS_WORKTREE" = "true" ]; then
        echo ""
        log_info "Next steps:"
        log_info "  - Review the changes above"
        log_info "  - Run additional tests if needed"
        log_info "  - Push changes: git push"
        log_info "  - Create PR: gh pr create"
    fi
}

main
