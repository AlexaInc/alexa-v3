FROM node:20

# Set noninteractive mode to prevent user prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt update \
    && apt install -y software-properties-common speedtest-cli \
    && apt install -y ffmpeg \
    && apt clean \
    && apt install -y curl unzip \
    && rm -rf /var/lib/apt/lists/*


# Install V2Ray
RUN curl -L -o v2ray.zip https://github.com/v2fly/v2ray-core/releases/latest/download/v2ray-linux-64.zip \
 && unzip v2ray.zip -d /v2ray \
 && mv /v2ray/v2ray /usr/local/bin/v2ray \
 && mv /v2ray/v2ctl /usr/local/bin/v2ctl \
 && chmod +x /usr/local/bin/v2ray /usr/local/bin/v2ctl
# Create a virtual environment


# Set working directory
WORKDIR /api

# Copy package.json and install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application files
COPY . .

COPY config.json /etc/v2ray/config.json
# Expose the application port
EXPOSE 4001

# Run the application (use the system `npm` rather than the virtual environment)
CMD ["npm", "start"]
