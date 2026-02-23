#!/bin/bash
#
# Ralph Docker Entrypoint
# Handles authentication, environment setup, and running the Ralph loop
#
# Safety features:
# - Blocks network access except for Claude API (api.anthropic.com)
# - Prevents running on protected branches (main, master, develop)
#

set -e

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

# Protected branches that Ralph cannot work on
PROTECTED_BRANCHES="main master develop"

# Allowed remote repository for git push
ALLOWED_PUSH_REPO="github.com/kylecombs/ORA-FM"

# Check if current branch is protected
check_branch_protection() {
    # Check for .git directory (normal repo) or .git file (worktree)
    if [ ! -d ".git" ] && [ ! -f ".git" ]; then
        log_warning "Not a git repository, skipping branch protection check"
        return 0
    fi

    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "")

    if [ -z "$current_branch" ]; then
        log_warning "Could not determine current branch (detached HEAD?)"
        return 0
    fi

    for protected in $PROTECTED_BRANCHES; do
        if [ "$current_branch" = "$protected" ]; then
            log_error "====================================================="
            log_error "SAFETY BLOCK: Cannot run Ralph on '$current_branch' branch"
            log_error "====================================================="
            log_error ""
            log_error "Protected branches: $PROTECTED_BRANCHES"
            log_error ""
            log_error "Please create a feature branch first:"
            log_error "  git checkout -b ralph/my-feature"
            log_error ""
            log_error "Or let Ralph create its own branch by starting from"
            log_error "a non-protected branch."
            log_error ""
            exit 1
        fi
    done

    log_success "Branch '$current_branch' is not protected - OK to proceed"
}

# Set up git push restrictions via pre-push hook
setup_git_push_restrictions() {
    log_info "Setting up git push restrictions..."

    local hooks_dir="/workspace/.git/hooks"

    # Handle worktree case where .git is a file pointing to the main repo
    if [ -f "/workspace/.git" ]; then
        local gitdir
        gitdir=$(cat "/workspace/.git" | sed 's/gitdir: //')
        hooks_dir="$gitdir/hooks"
    fi

    mkdir -p "$hooks_dir"

    # Create pre-push hook
    cat > "$hooks_dir/pre-push" << 'HOOK_EOF'
#!/bin/bash
#
# Ralph Git Push Restriction Hook
# Only allows pushes to the allowed repository and blocks protected branches
#

ALLOWED_REPO="github.com/kylecombs/ORA-FM"
PROTECTED_BRANCHES="main master develop"

# Get the remote URL
remote="$1"
url="$2"

# Check if pushing to allowed repository
if ! echo "$url" | grep -qi "$ALLOWED_REPO"; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚫 PUSH BLOCKED: Not an allowed repository"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "   Remote URL: $url"
    echo "   Allowed:    $ALLOWED_REPO"
    echo ""
    exit 1
fi

# Read stdin for ref information
while read local_ref local_sha remote_ref remote_sha; do
    # Extract branch name from ref (refs/heads/branch-name -> branch-name)
    branch_name=$(echo "$remote_ref" | sed 's|refs/heads/||')

    # Check if pushing to a protected branch
    for protected in $PROTECTED_BRANCHES; do
        if [ "$branch_name" = "$protected" ]; then
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "🚫 PUSH BLOCKED: Cannot push to protected branch '$branch_name'"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo "   Protected branches: $PROTECTED_BRANCHES"
            echo "   Please push to a feature branch instead."
            echo ""
            exit 1
        fi
    done
done

exit 0
HOOK_EOF

    chmod +x "$hooks_dir/pre-push"
    log_success "Git pre-push hook installed at $hooks_dir/pre-push"
    log_info "  - Allowed repo: $ALLOWED_PUSH_REPO"
    log_info "  - Blocked branches: $PROTECTED_BRANCHES"
}

# Restrict network access to only Claude API and GitHub
setup_network_restrictions() {
    log_info "Setting up network restrictions..."

    # Check if we have iptables (requires --cap-add=NET_ADMIN)
    if ! command -v iptables &>/dev/null; then
        log_warning "iptables not available, network restrictions not applied"
        log_warning "To enable, run container with --cap-add=NET_ADMIN"
        return 0
    fi

    # Check if we have permission to modify iptables
    if ! iptables -L &>/dev/null 2>&1; then
        log_warning "No permission to modify iptables, network restrictions not applied"
        log_warning "To enable, run container with --cap-add=NET_ADMIN"
        return 0
    fi

    # Allowed destinations:
    # - api.anthropic.com (Claude API)
    # - anthropic.com (for auth)
    # - localhost/container network (for PostgreSQL, Redis)
    # - DNS (needed to resolve hostnames)

    # Flush existing rules
    iptables -F OUTPUT 2>/dev/null || true

    # Allow loopback
    iptables -A OUTPUT -o lo -j ACCEPT

    # Allow established connections
    iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

    # Allow DNS (UDP 53)
    iptables -A OUTPUT -p udp --dport 53 -j ACCEPT

    # Allow connections to Docker internal network (PostgreSQL, Redis)
    # Docker typically uses 172.16.0.0/12 or 192.168.0.0/16
    iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
    iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT
    iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT

    # Allow Anthropic API and GitHub (resolve and allow IPs)
    # We allow the domains and let DNS resolution happen
    for domain in api.anthropic.com anthropic.com claude.ai console.anthropic.com github.com api.github.com; do
        # Resolve domain to IPs and allow them (filter to IPv4 only for iptables)
        local ips
        ips=$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | sort -u || true)
        for ip in $ips; do
            iptables -A OUTPUT -d "$ip" -j ACCEPT
            log_info "  Allowed: $domain ($ip)"
        done
    done

    # Allow HTTPS to Anthropic's known IP ranges (backup)
    # Anthropic uses AWS, so we allow their API endpoints
    iptables -A OUTPUT -p tcp --dport 443 -d api.anthropic.com -j ACCEPT 2>/dev/null || true

    # Block everything else
    iptables -A OUTPUT -j REJECT --reject-with icmp-net-unreachable

    log_success "Network restricted to Claude API, GitHub, and local services only"
}

# Start Xvfb for headless browser testing
start_xvfb() {
    if [ "$HEADLESS" = "true" ]; then
        log_info "Starting Xvfb for headless browser testing..."
        Xvfb :99 -screen 0 1920x1080x24 &
        export DISPLAY=:99
        sleep 1
    fi
}

# Check if Claude CLI is authenticated
check_auth() {
    log_info "Checking Claude CLI authentication..."

    # Check for OAuth token first (preferred - uses Max subscription, not API credits)
    if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
        log_success "Using CLAUDE_CODE_OAUTH_TOKEN (Max subscription)"
        return 0
    fi

    # Check for API key (fallback - uses pay-per-use credits)
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        log_success "Using ANTHROPIC_API_KEY environment variable"
        log_warning "Note: This uses API credits, not your Max subscription."
        log_warning "For Max subscription, run 'claude setup-token' and set CLAUDE_CODE_OAUTH_TOKEN"
        return 0
    fi

    # Check if credentials exist in mounted config
    if [ -f "$HOME/.claude/.credentials.json" ] || [ -f "$HOME/.claude/credentials.json" ]; then
        log_success "Found existing Claude credentials"
        log_warning "Note: Mounted OAuth credentials may not work in Docker (encrypted with host Keychain)."
        log_warning "If you get auth errors, run 'claude setup-token' and set CLAUDE_CODE_OAUTH_TOKEN"
        return 0
    fi

    # Try to check auth status
    if claude --version &>/dev/null; then
        log_success "Claude CLI is available"
        return 0
    fi

    return 1
}

# Interactive login helper
do_login() {
    log_warning "Claude CLI not authenticated."
    log_info ""
    log_info "To authenticate, use one of these methods:"
    log_info ""
    log_info "  1. OAuth token (RECOMMENDED - uses your Max subscription):"
    log_info "     On your host machine, run:"
    log_info "       claude setup-token"
    log_info "     Then set the token:"
    log_info "       export CLAUDE_CODE_OAUTH_TOKEN=your-token-here"
    log_info "       ./ralph-docker.sh run --worktree <name>"
    log_info ""
    log_info "  2. API key (uses pay-per-use credits, NOT Max subscription):"
    log_info "       export ANTHROPIC_API_KEY=your-api-key"
    log_info "       ./ralph-docker.sh run --worktree <name>"
    log_info ""
    log_info "  3. Interactive browser login (if display available):"
    log_info "       claude login"
    log_info ""

    if [ "$RALPH_REQUIRE_AUTH" = "true" ]; then
        log_error "Authentication required but not found. Exiting."
        exit 1
    fi
}

# Install project dependencies
install_deps() {
    log_info "Installing project dependencies..."

    # API dependencies (Ruby/Rails)
    if [ -d "api" ] && [ -f "api/Gemfile" ]; then
        log_info "Installing API (Ruby) dependencies..."
        cd api
        bundle config set --local path 'vendor/bundle'
        bundle install --jobs 4 --retry 3
        cd ..
    fi

    # Customer app dependencies
    if [ -d "customer" ] && [ -f "customer/package.json" ]; then
        log_info "Installing customer app dependencies..."
        cd customer && npm ci && cd ..
    fi

    # Shopify admin dependencies
    if [ -d "shopify-admin" ] && [ -f "shopify-admin/package.json" ]; then
        log_info "Installing shopify-admin dependencies..."
        cd shopify-admin && npm ci && cd ..
    fi

    log_success "Dependencies installed"
}

# Wait for database to be ready
wait_for_db() {
    if [ -n "$PGHOST" ]; then
        log_info "Waiting for PostgreSQL at $PGHOST:${PGPORT:-5432}..."
        until pg_isready -h "$PGHOST" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" &>/dev/null; do
            sleep 1
        done
        log_success "PostgreSQL is ready"
    fi
}

# Wait for Redis to be ready
wait_for_redis() {
    if [ -n "$REDIS_URL" ]; then
        log_info "Waiting for Redis..."
        # Extract host from REDIS_URL
        REDIS_HOST=$(echo "$REDIS_URL" | sed -E 's|redis://([^:]+):?.*|\1|')
        until nc -z "$REDIS_HOST" 6379 &>/dev/null; do
            sleep 1
        done
        log_success "Redis is ready"
    fi
}

# Setup database for testing
setup_test_db() {
    if [ "$RALPH_SETUP_DB" = "true" ] && [ -d "api" ]; then
        log_info "Setting up test database..."
        cd api
        bundle exec rails db:create db:migrate RAILS_ENV=test 2>/dev/null || true
        cd ..
        log_success "Test database ready"
    fi
}

# Drop privileges to ralph user
drop_privileges() {
    local target_user="${RALPH_USER:-ralph}"

    if [ "$(id -u)" = "0" ]; then
        log_info "Dropping privileges to user: $target_user"

        # Ensure ralph user owns their home directory
        chown -R "$target_user:$target_user" /home/ralph 2>/dev/null || true

        # Set git safe.directory for ralph user (must be done before exec)
        gosu "$target_user" git config --global --add safe.directory /workspace 2>/dev/null || true
        gosu "$target_user" git config --global --add safe.directory '*' 2>/dev/null || true

        # Execute the command as ralph user
        exec gosu "$target_user" "$@"
    else
        # Already running as non-root, ensure git safe directory is set
        git config --global --add safe.directory /workspace 2>/dev/null || true
        git config --global --add safe.directory '*' 2>/dev/null || true
        exec "$@"
    fi
}

# Run the Ralph loop
run_ralph() {
    local max_iterations="${RALPH_MAX_ITERATIONS:-10}"

    log_info "Starting Ralph autonomous agent loop..."
    log_info "Max iterations: $max_iterations"
    log_info "Sandbox mode: ${RALPH_SANDBOX_MODE:-true}"

    # Run the Ralph script (as ralph user if we're root)
    if [ -f "scripts/ralph/ralph.sh" ]; then
        drop_privileges bash scripts/ralph/ralph.sh "$max_iterations"
    else
        log_error "ralph.sh not found at scripts/ralph/ralph.sh"
        exit 1
    fi
}

# Setup git safe directories
setup_git_safe_directories() {
    # Mark workspace as safe for git (needed when volume ownership differs from container user)
    git config --global --add safe.directory /workspace
    git config --global --add safe.directory '*'
    su -c "git config --global --add safe.directory /workspace" ralph 2>/dev/null || true
    su -c "git config --global --add safe.directory '*'" ralph 2>/dev/null || true
}

# Main entrypoint logic
main() {
    log_info "=== Ralph Docker Environment ==="
    log_info "Working directory: $(pwd)"

    # Setup git safe directories for container environment
    setup_git_safe_directories

    # Start headless display
    start_xvfb

    case "${1:-ralph}" in
        ralph)
            # Full Ralph execution mode

            # SAFETY: Check we're not on a protected branch
            check_branch_protection

            # SAFETY: Restrict git push to allowed repo and non-protected branches
            setup_git_push_restrictions

            # SAFETY: Restrict network to Claude API and GitHub only
            setup_network_restrictions

            check_auth || do_login
            wait_for_db
            wait_for_redis

            if [ "$RALPH_INSTALL_DEPS" = "true" ]; then
                install_deps
            fi

            if [ "$RALPH_SETUP_DB" = "true" ]; then
                setup_test_db
            fi

            run_ralph
            ;;

        login)
            # Just run login flow
            log_info "Starting Claude login flow..."
            drop_privileges claude login
            ;;

        shell|bash)
            # Interactive shell for debugging
            log_info "Starting interactive shell..."
            # Apply safety restrictions in shell mode too
            setup_git_push_restrictions
            setup_network_restrictions
            drop_privileges /bin/bash
            ;;

        test)
            # Run tests only (no Ralph loop)
            log_info "Running tests..."

            # SAFETY: Check we're not on a protected branch
            check_branch_protection

            # SAFETY: Restrict git push
            setup_git_push_restrictions

            # SAFETY: Restrict network
            setup_network_restrictions

            wait_for_db
            wait_for_redis

            # Run tests as ralph user
            drop_privileges bash -c '
                if [ -d "api" ]; then
                    cd api && bundle exec rspec && cd ..
                fi
                if [ -d "customer" ]; then
                    cd customer && npm run typecheck && npm run lint && cd ..
                fi
                if [ -d "shopify-admin" ]; then
                    cd shopify-admin && npm run typecheck && npm run lint && cd ..
                fi
            '
            ;;

        *)
            # Pass through any other command
            exec "$@"
            ;;
    esac
}

main "$@"
