# Build Stage
FROM rust:1.85-slim-bookworm AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock* ./
COPY migrations ./migrations
COPY src ./src

RUN cargo build --release --bin pilly-api --bin sync_pills

# Runtime Stage
FROM debian:bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/pilly-api /usr/local/bin/pilly-api
COPY --from=builder /app/target/release/sync_pills /usr/local/bin/sync_pills
COPY migrations ./migrations

EXPOSE 3001
CMD ["pilly-api"]
