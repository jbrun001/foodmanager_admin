# this image does't work on apple silicon so get rosetta error: failed to open elf at /lib64/ld-linux-x86-64.so.2  error
# FROM node:23-slim
# switch to official
FROM ghcr.io/puppeteer/puppeteer:latest
#FROM node:20-slim
USER root

# Install Chromium dependencies (as recommended by Puppeteer)
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    ca-certificates \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy your app files
COPY . .

# Install app dependencies (Puppeteer gets Chromium here)
RUN npm install

# open the port we want
ENV PORT=8080
EXPOSE 8080

# Start your app
CMD ["node", "index.js"]
