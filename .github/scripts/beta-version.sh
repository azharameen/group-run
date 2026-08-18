#!/usr/bin/env bash
# Beta version calculator (develop lane).
#
# Mirrors the prod lane (release-please, .release-please-config.json) exactly:
#   fix:/perf:        -> patch
#   feat:             -> minor
#   breaking marker   -> minor while base < 1.0.0 (bump-minor-pre-major),
#                        major at >= 1.0.0
#   1.0.0 is a human declaration (Release-As), never an accident.
#
# Emits to $GITHUB_OUTPUT:
#   tag          e.g. v0.1.0-beta.1
#   version      the base version, e.g. 0.1.0
#   previous_tag last tag reachable here (for release-notes scope), or empty
set -euo pipefail

# 1) Last PRODUCTION tag = newest vX.Y.Z (no -beta) anywhere in the repo.
#    ls-remote is mandatory: prod tags live on main, which is usually NOT
#    reachable from develop (its merge commit is not an ancestor of
#    develop), so git describe would never find them.
prod_tags=$(git ls-remote --tags origin \
  | sed 's|.*refs/tags/||' \
  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true)

last_prod=""
if [ -n "$prod_tags" ]; then
  last_prod=$(printf '%s\n' "$prod_tags" | sort -V | tail -n 1)
  # Ensure the tag object exists locally so the range can resolve.
  git fetch origin "refs/tags/${last_prod}" --no-tags || true
fi

# 2) Base = last prod base, bumped by the strongest signal in the range.
base="0.0.0"
range="HEAD"
if [ -n "$last_prod" ]; then
  base="${last_prod#v}"
  range="${last_prod}..HEAD"
fi

commits=$(git log --no-merges --pretty='format:%s%n%b' "$range")

# Breakdown for the preview comment (human-readable evidence).
feat_n=$(printf '%s\n' "$commits" | grep -cE '^feat(\([^)]*\))?:' || true)
fix_n=$(printf '%s\n' "$commits" | grep -cE '^fix(\([^)]*\))?:' || true)
perf_n=$(printf '%s\n' "$commits" | grep -cE '^perf(\([^)]*\))?:' || true)
breaking_n=$(printf '%s\n' "$commits" | grep -cE '^(feat|fix|perf|refactor|build|ci|chore|test|docs)(\([^)]*\))?!:|^BREAKING CHANGE:' || true)

if [ "$breaking_n" -gt 0 ]; then
  level="major"
elif [ "$feat_n" -gt 0 ]; then
  level="minor"
else
  level="patch" # fix:/perf:, or docs/chore-only merges
fi
level_raw=$level

# Pre-1.0 breaking demotion, identical to bump-minor-pre-major.
IFS=. read -r MA MI PA <<< "$base"
if [ "$level" = "major" ] && [ "$MA" -lt 1 ]; then
  level="minor"
fi

case "$level" in
  major) MA=$((MA + 1)); MI=0; PA=0 ;;
  minor) MI=$((MI + 1)); PA=0 ;;
  patch) PA=$((PA + 1)) ;;
esac
next_base="${MA}.${MI}.${PA}"

# 3) Counter = how many betas already exist for this base.
#    The checkout is full-depth, so all remote tags are local.
n=$(git tag --list "v${next_base}-beta.*" | wc -l | tr -d '[:space:]')

{
  echo "tag=v${next_base}-beta.$((n + 1))"
  echo "version=${next_base}"
  echo "previous_tag=$(git describe --tags --abbrev=0 2>/dev/null || true)"
  echo "level=${level}"
  echo "level_raw=${level_raw}"
  echo "last_prod=${last_prod:-none}"
  echo "breakdown=feat=${feat_n} fix=${fix_n} perf=${perf_n} breaking=${breaking_n}"
} >> "${GITHUB_OUTPUT}"

echo "beta=${next_base}-beta.$((n + 1)) level=${level} last_prod=${last_prod:-none}"
