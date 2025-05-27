# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Install system dependencies needed for zk-SNARKs and circom
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    bash \
    curl

# Install Rust (needed for circom)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install circom from source
RUN git clone https://github.com/iden3/circom.git /tmp/circom && \
    cd /tmp/circom && \
    cargo build --release && \
    cargo install --path circom && \
    rm -rf /tmp/circom

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Copy source code (needed for postinstall scripts)
COPY . .

# Create necessary directories
RUN mkdir -p dist circuits/build

# Make scripts executable before npm install
RUN chmod +x ./scripts/*.sh 2>/dev/null || true

# Install dependencies (use npm ci for production builds, npm install for dev)
RUN npm install

# Run circuit generation if needed
RUN npm run circuit:build || true
# RUN npm run circuit:generate-ptau || true

# Build the application
RUN npm run build

# Expose port (adjust based on your app's port)
EXPOSE 3000

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S zkchat -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R zkchat:nodejs /app
USER zkchat

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Set environment to development
ENV NODE_ENV=development

# Start the application
CMD ["npm", "run", "dev"]