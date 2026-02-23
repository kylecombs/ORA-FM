# Ralph Docker Sandbox

A sandboxed Docker environment for running the Ralph autonomous agent loop with headless testing capabilities.

## Features

- **Isolated environment**: Ralph runs in a container with its own PostgreSQL and Redis
- **Claude Max subscription support**: Use OAuth token from `claude setup-token` (recommended) or mount credentials
- **Headless browser testing**: Chromium pre-installed with Xvfb for E2E tests
- **All dependencies included**: Node.js 22, Ruby 3.1.6, and all build tools
- **Persistent caches**: Node modules and Ruby gems cached between runs

## Safety Features

### Branch Protection
Ralph **cannot run on protected branches**:
- `main`
- `master`
- `develop`

If you try to run Ralph on a protected branch, it will exit with an error:
```
SAFETY BLOCK: Cannot run Ralph on 'develop' branch
Please create a feature branch first:
  git checkout -b ralph/my-feature
```

### Network Restrictions
The container's network access is **restricted to only**:
- `api.anthropic.com` - Claude API
- `anthropic.com`, `claude.ai`, `console.anthropic.com` - Auth
- Internal Docker network (PostgreSQL, Redis)
- DNS resolution

All other outbound connections are blocked via iptables. This prevents:
- Exfiltration of code to external servers
- Downloading malicious payloads
- Accessing unintended external services

### Privilege Dropping
The container starts as root to configure iptables, then **drops to a non-root user** (`ralph`) before running any code. This limits potential damage from container escapes.

## Prerequisites

1. **Docker**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. **Claude CLI authenticated**: Run `claude login` on your host machine first

## Quick Start

```bash
# From the project root
cd scripts/ralph

# Run Ralph in the sandbox
./ralph-docker.sh run

# Or with options
./ralph-docker.sh run --iterations 20 --install-deps --setup-db
```

## Commands

| Command | Description |
|---------|-------------|
| `run` | Run the Ralph autonomous loop (default) |
| `shell` | Open interactive bash shell in container |
| `test` | Run all quality checks (typecheck, lint, rspec) |
| `login` | Authenticate Claude CLI in container |
| `build` | Build the Docker image |
| `clean` | Remove containers and volumes |
| `logs` | Show container logs |

## Options

| Option | Description |
|--------|-------------|
| `--iterations N` | Max Ralph iterations (default: 10) |
| `--install-deps` | Install npm/bundle dependencies before running |
| `--setup-db` | Create and migrate test database |
| `--fresh` | Remove all volumes and start clean |

## Authentication

### Option 1: OAuth Token (Recommended for Max Subscription)

Use your Claude Max subscription in Docker by generating a long-lived OAuth token:

```bash
# On your host machine, generate a token
claude setup-token
# Follow the browser authentication flow

# Set the token and run
export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"
./ralph-docker.sh run
```

This is the **recommended method** because:
- Uses your Max subscription quota (not pay-per-use API credits)
- Works reliably in Docker containers
- No Keychain decryption issues

### Option 2: API Key (Pay-per-use)

If you have an Anthropic API key:

```bash
export ANTHROPIC_API_KEY="your-api-key"
./ralph-docker.sh run
```

**Note**: This uses API credits, not your Max subscription.

### Option 3: Mounted Credentials (Limited)

Your `~/.claude` directory is mounted into the container, but **OAuth credentials from the host often don't work** because they're encrypted with your macOS Keychain.

```bash
# This may not work if your credentials are Keychain-encrypted
claude login  # on host
./ralph-docker.sh run
```

If you get auth errors with mounted credentials, use Option 1 (OAuth token) instead.

## Environment Variables

Set these before running to customize behavior:

```bash
# Authentication (use ONE of these)
export CLAUDE_CODE_OAUTH_TOKEN="..."  # Recommended - uses Max subscription
export ANTHROPIC_API_KEY="..."        # Fallback - uses API credits

# Max iterations before stopping
export RALPH_MAX_ITERATIONS=20

# Install dependencies on startup
export RALPH_INSTALL_DEPS=true

# Setup test database on startup
export RALPH_SETUP_DB=true
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  PostgreSQL │  │    Redis    │  │  Ralph Sandbox  │  │
│  │    :5432    │  │    :6379    │  │                 │  │
│  │             │  │             │  │  - Node.js 22   │  │
│  │  camp_test  │  │             │  │  - Ruby 3.1.6   │  │
│  │             │  │             │  │  - Claude CLI   │  │
│  └─────────────┘  └─────────────┘  │  - Chromium     │  │
│                                     │  - Xvfb        │  │
│                                     └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
                    Mounted Volumes
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ~/.claude         Project Root         ~/.gitconfig
  (credentials)      (read-write)         (git config)
```

## Headless Browser Testing

The container includes Chromium and Xvfb for headless E2E testing:

```bash
# In your tests, Chromium is available at:
CHROME_BIN=/usr/bin/chromium-browser

# Playwright config example included at:
scripts/ralph/docker/playwright.config.ts
```

To use Playwright in a story:
1. Add `@playwright/test` to customer/package.json
2. Copy the config to customer/
3. Write E2E tests in customer/e2e/

## Troubleshooting

### "Claude CLI not authenticated"
The best solution is to use an OAuth token:
```bash
claude setup-token  # on host, follow browser flow
export CLAUDE_CODE_OAUTH_TOKEN="your-token"
./ralph-docker.sh run
```

If using mounted credentials (`~/.claude`), they may be encrypted with your macOS Keychain and won't work in the Linux container.

### Slow first run
The first run builds the Docker image and downloads dependencies. Subsequent runs use cached layers.

### Permission errors on files
The container runs as a user matching your host UID/GID. If you see permission errors:
```bash
./ralph-docker.sh clean
./ralph-docker.sh run --fresh
```

### Database connection errors
Ensure the PostgreSQL container is healthy:
```bash
docker compose -f scripts/ralph/docker/docker-compose.yml ps
```

### Out of disk space
Docker volumes can accumulate. Clean up:
```bash
./ralph-docker.sh clean
docker system prune -a --volumes
```

## Development

### Modifying the Dockerfile
After changes to `docker/Dockerfile`:
```bash
./ralph-docker.sh build
```

### Debugging in container
```bash
./ralph-docker.sh shell
# Now you're in the container with all tools available
```

### Checking logs
```bash
./ralph-docker.sh logs
```
