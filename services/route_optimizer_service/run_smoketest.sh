#!/usr/bin/env bash
# Smoke test for optimizer service (assumes service on localhost:5000)
set -euo pipefail

TOKEN="${ROUTE_OPTIMIZER_TOKEN:-smoke-test-token}"

echo "Health (unauthenticated — expected 200):"
curl -sf http://localhost:5000/health | jq '.'

echo "Optimize without token (expected 401):"
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d @sample_input.json \
  http://localhost:5000/optimize)
if [ "$status" != "401" ]; then
  echo "Expected 401 without token, got $status"
  exit 1
fi
echo "Got 401 as expected"

echo "Optimize with token (expected 200):"
curl -sf -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d @sample_input.json \
  http://localhost:5000/optimize | jq '.'
