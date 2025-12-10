# Optimized image for Node.js 22.20.0 with native TypeScript support
FROM node:22.20.0-alpine

# Install dumb-init for better signal handling
RUN apk add --no-cache dumb-init

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S outlookicsproxy -u 1001

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install all dependencies (production + dev for ts-node)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Change file ownership to non-root user
RUN chown -R outlookicsproxy:nodejs /app

# Switch to non-root user
USER outlookicsproxy

# Expose port
EXPOSE 3003

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3003
ENV TARGET_TZ=Europe/Zurich

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]

# Default command (Node.js 22.20.0 supports TypeScript natively)
CMD ["node", "--loader", "ts-node/esm", "server.ts"]

# Labels for Docker Swarm and Portainer
LABEL maintainer="outlookicsproxy"
LABEL description="Outlook ICS Timezone Proxy Server"
LABEL version="1.0.0"
