FROM python:3.10-slim

# Set up user to run Hugging Face space
RUN useradd -m -u 1000 user
USER root

# Install dependencies for Node.js and Chromium
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    wget \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get install -y chromium \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set up the working directory
WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy frontend, install deps, and build
COPY frontend/ frontend/
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Switch back to app root
WORKDIR /app

# Copy backend Node.js deps and install
COPY package.json package-lock.json* ./
RUN npm install

# Copy all the rest of the application code
COPY . .

# Set permissions for user 1000
RUN mkdir -p backend/sessions uploads/images && chown -R user:user /app

# Switch to the non-root user
USER user

# Set environment variables
ENV HOST=0.0.0.0
ENV PORT=7860
ENV FASTAPI_PORT=7860
ENV WHATSAPP_SERVICE_PORT=8006
ENV WHATSAPP_SERVICE_URL=http://127.0.0.1:8006
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Expose port for Hugging Face
EXPOSE 7860

# Run start script
CMD ["bash", "start.sh"]
