# Build Stage
FROM rust:1.85-slim-bookworm AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock* ./
COPY src ./src

RUN cargo build --release --bin pilly-api --bin sync_pills

# Iggy Server Binary Stage
FROM iggyrs/iggy:0.4.210 AS iggy

# Runtime Stage
FROM debian:bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 1001 -m appuser

COPY --from=iggy /usr/local/bin/iggy-server /usr/local/bin/iggy-server
COPY --from=builder /app/target/release/pilly-api /usr/local/bin/pilly-api
COPY --from=builder /app/target/release/sync_pills /usr/local/bin/sync_pills
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown -R appuser:appuser /app

USER appuser

EXPOSE 3001
CMD ["/app/entrypoint.sh"]
