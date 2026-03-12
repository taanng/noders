# ============================================
# URL Proxy Service - Dockerfile
# ============================================
# Reverse proxy with token-based access control
# Built on Node.js Alpine (zero extra deps)
# ============================================

FROM node:20-alpine

LABEL maintainer="proxy-service"
LABEL description="Lightweight reverse proxy service with token-based access control"

# Create app directory
WORKDIR /app

# Copy application files
COPY server.js .

# Config file path (mount your JSON here)
ENV CONFIG_PATH=/app/config/config.json
ENV LISTEN_PORT=8080

EXPOSE 8080

# Health check – use 127.0.0.1 to avoid IPv6 lookup issues in Alpine
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["node", "server.js"]
