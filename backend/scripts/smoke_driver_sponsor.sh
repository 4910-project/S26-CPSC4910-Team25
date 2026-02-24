#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"

if [[ -z "${TOKEN:-}" ]]; then
  echo "TOKEN is required."
  echo "Example:"
  echo "  TOKEN='<jwt>' bash backend/scripts/smoke_driver_sponsor.sh"
  exit 1
fi

echo "GET /driver/my-sponsor"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/driver/my-sponsor"
echo
echo

echo "GET /sponsor/org"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/sponsor/org"
echo
echo

echo "GET /sponsor/driver-applications?status=pending"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/sponsor/driver-applications?status=pending"
echo
echo

APP_ID="${APPLICATION_ID:-1}"
ACTION="${ACTION:-approve}"
echo "PATCH /sponsor/driver-applications/$APP_ID {\"action\":\"$ACTION\"}"
curl -sS -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"$ACTION\"}" \
  "$BASE_URL/sponsor/driver-applications/$APP_ID"
echo
echo

echo "GET /sponsor/drivers"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/sponsor/drivers"
echo
echo

echo "GET /sponsor/drivers?status=active"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/sponsor/drivers?status=active"
echo
echo

echo "GET /sponsor/drivers?status=dropped"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/sponsor/drivers?status=dropped"
echo
echo

echo "GET /sponsor/drivers?status=pending"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/sponsor/drivers?status=pending"
echo
