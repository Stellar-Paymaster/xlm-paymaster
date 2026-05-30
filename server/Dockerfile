FROM node:20-bookworm as builder

# Install Rust for native module building
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Install dependencies and build native modules
RUN npm install
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# Runtime image
FROM node:20-bookworm-slim

WORKDIR /app

# Install runtime dependencies (OpenSSL used by Prisma)
RUN apt-get update && apt-get install -y openssl ca-certificates wget && rm -rf /var/lib/apt/lists/*

# Copy built assets and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3001

CMD ["node", "dist/index.js"]
