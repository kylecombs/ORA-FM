#!/bin/bash
#
# Ralph Docker Runner
# Runs the Ralph autonomous agent loop in a sandboxed Docker environment
#
# Usage:
#   ./ralph-docker.sh [command] [options]
#
# Commands:
#   run         Run the Ralph loop (default)
#   shell       Open an interactive shell in the container
#   test        Run all tests without Ralph loop
#   login       Authenticate Claude CLI in the container
#   build       Build the Docker image
#   clean       Remove containers and volumes
#   logs        Show container logs
#
# Options:
#   --iterations N    Max Ralph iterations (default: 10)
#   --install-deps    Install dependencies before running
#   --setup-db        Setup test database before running
#   --fresh           Remove volumes and start fresh
#   --worktree NAME   Run in a worktree (.worktrees/NAME directory)
#   --name NAME       Instance name for parallel execution (default: auto-detected from worktree or "default")
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/docker"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[Ralph Docker]${NC} $1"; }
log_success() { echo -e "${GREEN}[Ralph Docker]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[Ralph Docker]${NC} $1"; }
log_error() { echo -e "${RED}[Ralph Docker]${NC} $1"; }

# Default values
COMMAND="run"
MAX_ITERATIONS=10
INSTALL_DEPS="false"
SETUP_DB="false"
FRESH="false"
WORKTREE=""
INSTANCE_NAME=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        run|shell|test|login|build|clean|logs)
            COMMAND="$1"
            shift
            ;;
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
        --worktree)
            WORKTREE="$2"
            shift 2
            ;;
        --name)
            INSTANCE_NAME="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  run         Run the Ralph loop (default)"
            echo "  shell       Open an interactive shell"
            echo "  test        Run all tests"
            echo "  login       Authenticate Claude CLI"
            echo "  build       Build the Docker image"
            echo "  clean       Remove containers and volumes"
            echo "  logs        Show container logs"
            echo ""
            echo "Options:"
            echo "  --iterations N    Max iterations (default: 10)"
            echo "  --install-deps    Install dependencies first"
            echo "  --setup-db        Setup test database first"
            echo "  --fresh           Clean slate (removes volumes)"
            echo "  --worktree NAME   Run in a worktree (.worktrees/NAME directory)"
            echo "  --name NAME       Instance name for parallel execution (default: auto-detected)"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check for Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
}

# Check for Claude credentials on host
check_credentials() {
    if [ ! -d "$HOME/.claude" ]; then
        log_warning "No Claude credentials found at ~/.claude"
        log_info "Run 'claude login' on your host machine first, then re-run this script."
        log_info "Your credentials will be mounted into the container."
        echo ""
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        log_success "Found Claude credentials at ~/.claude"
    fi
}

# Get host UID/GID for proper file permissions
get_host_ids() {
    export HOST_UID=$(id -u)
    export HOST_GID=$(id -g)
}

# Resolve the instance name for parallel execution
resolve_instance_name() {
    if [ -n "$INSTANCE_NAME" ]; then
        # Use explicitly provided name
        export RALPH_INSTANCE_NAME="$INSTANCE_NAME"
    elif [ -n "$WORKTREE" ]; then
        # Use worktree name
        export RALPH_INSTANCE_NAME="$WORKTREE"
    elif [ -f "$PROJECT_ROOT/.git" ]; then
        # Auto-detect from current worktree
        export RALPH_INSTANCE_NAME=$(basename "$PROJECT_ROOT")
    else
        # Default instance
        export RALPH_INSTANCE_NAME="default"
    fi

    # Sanitize name for docker (lowercase, alphanumeric and hyphens only)
    RALPH_INSTANCE_NAME=$(echo "$RALPH_INSTANCE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')
    export RALPH_INSTANCE_NAME

    log_info "Instance name: $RALPH_INSTANCE_NAME"
}

# Get docker compose command with project name for isolation
docker_compose() {
    docker compose -p "ralph-${RALPH_INSTANCE_NAME}" "$@"
}

# Find the main git repo root (handles worktrees)
find_main_repo_root() {
    local dir="$1"

    # Check if .git is a file (worktree) or directory (main repo)
    if [ -f "$dir/.git" ]; then
        # This is a worktree - parse the gitdir path to find main repo
        local gitdir
        gitdir=$(cat "$dir/.git" | sed 's/gitdir: //')
        # gitdir is like /path/to/main/.git/worktrees/<name>
        # We want /path/to/main
        echo "$gitdir" | sed 's|/.git/worktrees/.*||'
    elif [ -d "$dir/.git" ]; then
        # This is the main repo
        echo "$dir"
    else
        # Not a git repo, return empty
        echo ""
    fi
}

# Resolve project root (handles worktree option)
resolve_project_root() {
    # Find the main repo root (needed for worktree git support)
    local main_repo
    main_repo=$(find_main_repo_root "$PROJECT_ROOT")

    if [ -n "$main_repo" ]; then
        export RALPH_MAIN_REPO_ROOT="$main_repo"
        log_info "Main repo root: $main_repo"
    else
        export RALPH_MAIN_REPO_ROOT="$PROJECT_ROOT"
    fi

    if [ -n "$WORKTREE" ]; then
        # Worktrees are in .worktrees directory: <project>/.worktrees/<name>
        local worktree_path="$RALPH_MAIN_REPO_ROOT/.worktrees/$WORKTREE"
        if [ ! -d "$worktree_path" ]; then
            log_error "Worktree not found: $worktree_path"
            log_info "Available worktrees:"
            ls -d "$RALPH_MAIN_REPO_ROOT"/.worktrees/* 2>/dev/null | while read dir; do
                echo "  - $(basename "$dir")"
            done
            exit 1
        fi
        export RALPH_PROJECT_ROOT="$worktree_path"
        log_info "Using worktree: $WORKTREE ($worktree_path)"
    else
        export RALPH_PROJECT_ROOT="$PROJECT_ROOT"
    fi
}

# Build the Docker image
do_build() {
    log_info "Building Ralph Docker image..."
    cd "$DOCKER_DIR"

    get_host_ids
    resolve_instance_name
    docker_compose build --build-arg HOST_UID=$HOST_UID --build-arg HOST_GID=$HOST_GID

    log_success "Image built successfully"
}

# Clean up containers and volumes
do_clean() {
    log_info "Cleaning up Ralph Docker environment..."
    cd "$DOCKER_DIR"

    resolve_instance_name
    docker_compose down -v --remove-orphans 2>/dev/null || true

    log_success "Cleanup complete for instance: $RALPH_INSTANCE_NAME"
}

# Run Ralph in the container
do_run() {
    log_info "Starting Ralph in Docker sandbox..."
    cd "$DOCKER_DIR"

    check_credentials
    get_host_ids
    resolve_project_root
    resolve_instance_name

    if [ "$FRESH" = "true" ]; then
        log_info "Fresh start requested, cleaning volumes..."
        docker_compose down -v 2>/dev/null || true
    fi

    export RALPH_MAX_ITERATIONS="$MAX_ITERATIONS"
    export RALPH_INSTALL_DEPS="$INSTALL_DEPS"
    export RALPH_SETUP_DB="$SETUP_DB"

    log_info "Project root: $RALPH_PROJECT_ROOT"
    log_info "Main repo root: $RALPH_MAIN_REPO_ROOT"
    log_info "Max iterations: $MAX_ITERATIONS"
    log_info "Install deps: $INSTALL_DEPS"
    log_info "Setup DB: $SETUP_DB"

    # Debug: show the .git file/directory status
    if [ -f "$RALPH_PROJECT_ROOT/.git" ]; then
        log_info "Worktree .git file contents: $(cat "$RALPH_PROJECT_ROOT/.git")"
    fi
    log_info "Main repo .git exists: $([ -d "$RALPH_MAIN_REPO_ROOT/.git" ] && echo 'yes' || echo 'no')"

    # Start services and run Ralph
    docker_compose up --build ralph
}

# Open interactive shell
do_shell() {
    log_info "Opening shell in Ralph container..."
    cd "$DOCKER_DIR"

    check_credentials
    get_host_ids
    resolve_project_root
    resolve_instance_name

    # Start dependencies first
    docker_compose up -d postgres redis

    # Run shell
    docker_compose run --rm ralph shell
}

# Run tests
do_test() {
    log_info "Running tests in Ralph container..."
    cd "$DOCKER_DIR"

    get_host_ids
    resolve_project_root
    resolve_instance_name

    docker_compose run --rm \
        -e RALPH_INSTALL_DEPS="$INSTALL_DEPS" \
        -e RALPH_SETUP_DB="$SETUP_DB" \
        ralph test
}

# Login to Claude
do_login() {
    log_info "Starting Claude login in container..."
    log_warning "Note: For Claude Max subscription, it's easier to run 'claude login' on your host"
    log_warning "      and let this script mount your ~/.claude credentials."
    echo ""
    read -p "Continue with in-container login? (y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$DOCKER_DIR"
        get_host_ids
        resolve_project_root
        resolve_instance_name

        # Run login with writable credential mount
        docker_compose run --rm \
            -v "$HOME/.claude:/home/ralph/.claude:rw" \
            ralph login
    fi
}

# Show logs
do_logs() {
    cd "$DOCKER_DIR"
    resolve_instance_name
    docker_compose logs -f ralph
}

# Main
main() {
    check_docker

    case "$COMMAND" in
        run)
            do_run
            ;;
        shell)
            do_shell
            ;;
        test)
            do_test
            ;;
        login)
            do_login
            ;;
        build)
            do_build
            ;;
        clean)
            do_clean
            ;;
        logs)
            do_logs
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            exit 1
            ;;
    esac
}

main
