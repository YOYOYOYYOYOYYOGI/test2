#!/usr/bin/env bash
# Dev-only setup for the end-to-end tests: creates a self-signed cert for
# queue.fal.run and maps that hostname to 127.0.0.1 so the mock fal queue API
# is reached at the real-looking HTTPS origin. Requires sudo for /etc/hosts.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$HERE/tls"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$HERE/tls/key.pem" -out "$HERE/tls/cert.pem" -days 30 \
  -subj "/CN=queue.fal.run" -addext "subjectAltName=DNS:queue.fal.run"
grep -q "queue.fal.run" /etc/hosts || echo "127.0.0.1 queue.fal.run" | sudo tee -a /etc/hosts >/dev/null
echo "TLS test fixture ready at $HERE/tls and queue.fal.run -> 127.0.0.1"
