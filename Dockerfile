FROM node:20-bullseye

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for Puppeteer + your current requirements
RUN apt-get update && apt-get install -y \
    fonts-noto \
    software-properties-common \
    speedtest-cli \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    build-essential \
    python3 \
    ffmpeg \
    libnspr4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libgtk-3-0 \
    fonts-liberation \
    ca-certificates \
    curl \
    unzip \
    && fc-cache -f -v \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Xray-core for VMess/VLESS/Shadowsocks support
RUN curl -L https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip -o xray.zip \
    && unzip xray.zip xray -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/xray \
    && rm xray.zip

WORKDIR /api

# Copy package.json first for caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --legacy-peer-deps

# Rebuild native modules if needed
RUN npm rebuild canvas sharp --force

# Copy the rest of your app
COPY . .

# Set global Node.js memory limit for 16GB RAM environment (8GB limit)
ENV NODE_OPTIONS="--max-old-space-size=8192"

EXPOSE 8000

# Run the manager script instead of the app directly
CMD ["node", "app.js"]
