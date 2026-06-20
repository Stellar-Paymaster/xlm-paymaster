FROM rust:1.76-slim-bookworm as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY ./Cargo.toml ./Cargo.lock ./
COPY ./src ./src

# Build production binary
RUN cargo build --release

# Runtime image
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl3 \
    libpq5 \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/target/release/fluid-server /app/fluid-server

EXPOSE 3000

CMD ["./fluid-server"]
