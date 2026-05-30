FROM node:20-alpine as builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source and build
COPY . .
# We disable experimental features if they cause build issues in Docker
RUN npm run build

# Runtime image
FROM node:20-alpine

WORKDIR /app

# Install wget for healthchecks
RUN apk add --no-cache wget

# Copy built assets and production binary
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3002

CMD ["npm", "start"]
