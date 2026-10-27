#!/usr/bin/env bash
# Fails if SUPABASE_ACCESS_TOKEN no longer works, or expires within WARN_DAYS.
# Shared by the deploy job and the weekly token check.
set -euo pipefail

WARN_DAYS="${WARN_DAYS:-14}"
ROTATE="Create a new token at https://supabase.com/dashboard/account/tokens, update the SUPABASE_ACCESS_TOKEN secret and the SUPABASE_TOKEN_EXPIRES variable (YYYY-MM-DD), then re-run."

missing=
[ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && missing="$missing SUPABASE_ACCESS_TOKEN"
[ -z "${SUPABASE_PROJECT_REF:-}" ] && missing="$missing SUPABASE_PROJECT_REF"
if [ -n "$missing" ]; then
  echo "::error::Missing repository secrets:$missing"
  exit 1
fi

status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF" || true)

case "$status" in
  200) echo "Access token works for $SUPABASE_PROJECT_REF." ;;
  401) echo "::error::SUPABASE_ACCESS_TOKEN has expired or been revoked. $ROTATE"; exit 1 ;;
  403 | 404) echo "::error::The token can't see project $SUPABASE_PROJECT_REF (HTTP $status). Check SUPABASE_PROJECT_REF."; exit 1 ;;
  *) echo "::error::Supabase Management API answered HTTP $status."; exit 1 ;;
esac

# The API doesn't report a token's expiry, so the date is recorded by hand.
if [ -z "${SUPABASE_TOKEN_EXPIRES:-}" ]; then
  echo "::warning::SUPABASE_TOKEN_EXPIRES is not set, so expiry can't be warned about ahead of time."
  exit 0
fi

expires=$(date -u -d "$SUPABASE_TOKEN_EXPIRES" +%s 2>/dev/null || true)
if [ -z "$expires" ]; then
  echo "::error::SUPABASE_TOKEN_EXPIRES is '$SUPABASE_TOKEN_EXPIRES', expected YYYY-MM-DD."
  exit 1
fi

days=$(( (expires - $(date -u +%s)) / 86400 ))
if [ "$days" -lt "$WARN_DAYS" ]; then
  echo "::error::SUPABASE_ACCESS_TOKEN expires in $days day(s), on $SUPABASE_TOKEN_EXPIRES. $ROTATE"
  exit 1
fi
echo "Token expires in $days days."
