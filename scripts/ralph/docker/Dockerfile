# Ralph Sandbox Environment
# A containerized environment for running the Ralph autonomous agent loop
# Supports Claude Code Max subscription via OAuth authentication

FROM ubuntu:22.04

ARG NODE_VERSION=22
ARG RUBY_VERSION=3.1.6
ARG DEBIAN_FRONTEND=noninteractive

# System dependencies
RUN apt-get update && apt-get install -y \
    # Core utilities
    curl \
    wget \
    git \
    jq \
    bash \
    ca-certificates \
    gnupg \
    build-essential \
    # Ruby dependencies
    libssl-dev \
    libreadline-dev \
    zlib1g-dev \
    libyaml-dev \
    libffi-dev \
    # PostgreSQL client
    postgresql-client \
    libpq-dev \
    # ImageMagick for image processing
    imagemagick \
    libmagickwand-dev \
    # Headless browser dependencies (Chromium)
    chromium-browser \
    chromium-chromedriver \
    # X virtual framebuffer for headless testing
    xvfb \
    # Fonts for proper rendering
    fonts-liberation \
    fonts-noto-color-emoji \
    # Network utilities for restrictions and health checks
    iptables \
    netcat-openbsd \
    dnsutils \
    # For dropping privileges after network setup
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Install rbenv and Ruby
ENV RBENV_ROOT=/usr/local/rbenv
ENV PATH="$RBENV_ROOT/bin:$RBENV_ROOT/shims:$PATH"

RUN git clone https://github.com/rbenv/rbenv.git $RBENV_ROOT \
    && git clone https://github.com/rbenv/ruby-build.git $RBENV_ROOT/plugins/ruby-build \
    && $RBENV_ROOT/bin/rbenv install $RUBY_VERSION \
    && $RBENV_ROOT/bin/rbenv global $RUBY_VERSION \
    && eval "$($RBENV_ROOT/bin/rbenv init -)" \
    && gem install bundler -v 2.3.18

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create ralph user for security (matching host UID/GID for volume mounts)
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN (getent group ${HOST_GID} || groupadd -g ${HOST_GID} ralph) \
    && useradd -m -u ${HOST_UID} -g ${HOST_GID} -s /bin/bash ralph \
    && mkdir -p /workspace /home/ralph/.claude \
    && chown -R ${HOST_UID}:${HOST_GID} /workspace /home/ralph

# Set up Chrome for headless testing
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage --headless"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Environment for headless testing
ENV DISPLAY=:99
ENV CI=true
ENV HEADLESS=true

WORKDIR /workspace

# Copy entrypoint script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Note: We start as root to set up iptables network restrictions,
# then drop to ralph user in entrypoint.sh after network setup
ENV RALPH_USER=ralph

# Default environment variables
ENV RALPH_MAX_ITERATIONS=10
ENV RALPH_SANDBOX_MODE=true

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["ralph"]
