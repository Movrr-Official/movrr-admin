#!/usr/bin/env bash
# Simple smoke test script for the optimizer service (assumes service on localhost:5000)
set -euo pipefail

echo "Posting sample input to /optimize"
curl -s -X POST -H "Content-Type: application/json" -d @sample_input.json http://localhost:5000/optimize | jq '.' || true

echo "Posting a decision sample"
curl -s -X POST -H "Content-Type: application/json" -d '{"action":"accept","note":"smoke"}' http://localhost:5000/decision | jq '.' || true

echo "Health:"
curl -s http://localhost:5000/health | jq '.' || true
