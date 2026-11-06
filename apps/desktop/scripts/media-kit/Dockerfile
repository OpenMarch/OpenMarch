# cspell:disable -- Debian package names
# The machine every recording runs on: Debian, Xvfb, ffmpeg (with libwebp), Node 24 and the
# fonts the app falls back to. Same image every run, so a changed recording means the app changed.
FROM debian:trixie
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb xauth ffmpeg ca-certificates curl git \
    libnss3 libatk-bridge2.0-0 libgtk-3-0 libasound2 libgbm1 libxss1 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 \
    libcairo2 libatspi2.0-0 libxshmfence1 fonts-liberation fonts-noto-color-emoji fonts-noto-cjk fonts-noto-core dbus-x11 \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs \
    && npm install -g pnpm@10.11.0 && rm -rf /var/lib/apt/lists/*
ENV ELECTRON_DISABLE_SECURITY_WARNINGS=1
