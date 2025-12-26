FROM node:20-bullseye

ENV DEBIAN_FRONTEND=noninteractive

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
    && fc-cache -f -v \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*


WORKDIR /api

COPY package*.json ./

# IMPORTANT: allow postinstall scripts
RUN npm install --legacy-peer-deps

# Optional but safe
RUN npm rebuild canvas sharp --force

COPY . .

EXPOSE 4001

CMD ["node", "index"]
