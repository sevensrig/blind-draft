#!/usr/bin/env bash
# Marks a deploy on every PostHog chart, so a move in the numbers can be read
# against the PR that shipped it rather than guessed at from a date.
#
# Missing secrets skip the annotation instead of failing the build, the same way
# an unset PUBLIC_POSTHOG_KEY switches analytics off rather than breaking it. A
# deploy that ships is worth more than a mark on a graph.
set -euo pipefail

# Management API, not the ingestion host: `us.i.posthog.com` takes events, this
# takes annotations. EU projects are on https://eu.posthog.com.
HOST="${POSTHOG_API_HOST:-https://us.posthog.com}"

if [ -z "${POSTHOG_PERSONAL_API_KEY:-}" ] || [ -z "${POSTHOG_PROJECT_ID:-}" ]; then
  echo "::notice::POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID is unset — skipping the deploy annotation."
  exit 0
fi

sha="${GITHUB_SHA:?GITHUB_SHA is required}"
short="${sha:0:7}"

# The commit's own date, not now: this job runs after e2e and load, minutes
# behind the Vercel deploy it is marking.
marker=$(git log -1 --format=%cI "$sha")

# The PR that carried the commit, if there was one. Its title beats the merge
# commit's subject, which is always "Merge pull request #N from <branch>".
pr_json=$(gh api "repos/$GITHUB_REPOSITORY/commits/$sha/pulls" 2>/dev/null || echo '[]')
pr_number=$(printf '%s' "$pr_json" | jq -r '.[0].number // empty')
pr_title=$(printf '%s' "$pr_json" | jq -r '.[0].title // empty')

if [ -n "$pr_number" ] && [ -n "$pr_title" ]; then
  content="#$pr_number $pr_title ($short)"
else
  content="$(git log -1 --format=%s "$sha") ($short)"
fi

body=$(jq -n --arg c "$content" --arg d "$marker" \
  '{content: $c, date_marker: $d, scope: "project"}')

out=$(mktemp)
status=$(curl -sS -o "$out" -w '%{http_code}' --max-time 30 \
  -X POST "$HOST/api/projects/$POSTHOG_PROJECT_ID/annotations/" \
  -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
  -H 'content-type: application/json' \
  -d "$body" || true)

case "$status" in
  200 | 201)
    echo "Annotated PostHog: $content"
    ;;
  000)
    echo "::warning::Couldn't reach PostHog at $HOST."
    ;;
  401 | 403)
    echo "::warning::PostHog rejected the key (HTTP $status). It needs a personal API key with the annotation:write scope."
    ;;
  404)
    echo "::warning::No PostHog project $POSTHOG_PROJECT_ID at $HOST. Check POSTHOG_PROJECT_ID, and POSTHOG_API_HOST if the project is in the EU."
    ;;
  *)
    echo "::warning::PostHog answered HTTP $status: $(head -c 300 "$out")"
    ;;
esac

# Never fatal. Losing a chart marker is not a reason to redden a green deploy.
exit 0
