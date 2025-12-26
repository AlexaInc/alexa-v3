FROM node:20

# Set noninteractive mode to prevent user prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt update \
    && apt install -y software-properties-common speedtest-cli \
    && apt-get install -y \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    build-essential \
    python3
    && apt install -y ffmpeg \
    && apt clean \
    && rm -rf /var/lib/apt/lists/*


# Create a virtual environment


# Set working directory
WORKDIR /api

# Copy package.json and install Node.js dependencies
COPY package*.json ./
RUN npm config set ignore-scripts true

RUN npm install --legacy-peer-deps
RUN npm rebuild sharp --platform=linux --arch=x64 --force

# Copy the rest of the application files
COPY . .

# Expose the application port
EXPOSE 4001

# Run the application (use the system `npm` rather than the virtual environment)
CMD ["npm", "start"]
