FROM ubuntu:22.04

# Install system dependencies for Node, Playwright, and Electron
RUN apt-get update && \
    apt-get install -y \
        curl \
        git \
        xvfb \
        libnss3 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libxss1 \
        libasound2 \
        libgbm-dev \
        libxshmfence-dev \
        ca-certificates \
        fonts-liberation \
        libappindicator3-1 \
        libu2f-udev \
        xauth \
        # Add build tools for native modules
        build-essential \
        python3 \
        python3-pip \
        pkg-config \
        # Add additional dependencies for Electron
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libpango-1.0-0 \
        libcairo2 \
        libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (LTS) and pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files for root, desktop app, and packages for better caching
COPY package.json ./
COPY apps/desktop/package.json ./apps/desktop/
COPY packages/*/package.json ./packages/*/

# Copy the rest of the monorepo
COPY . .

# Clean install dependencies for the target platform (Linux)
RUN pnpm install

# Install Playwright browsers with dependencies
RUN pnpm exec playwright install --with-deps

# Build the Electron app
WORKDIR /app/apps/desktop
RUN pnpm run build:electron --linux --publish=never

# Set environment variables for headless Electron
ENV DISPLAY=:99
ENV ELECTRON_NO_SANDBOX=1
ENV ELECTRON_DISABLE_SECURITY_WARNINGS=1
ENV ELECTRON_ENABLE_LOGGING=1
ENV ELECTRON_ENABLE_STACK_DUMPING=1

# Default command (optional)
CMD ["xvfb-run", "--auto-servernum", "--server-args='-screen 0 1024x768x24'", "pnpm", "exec", "playwright", "test", "--headed"]

