#!/usr/bin/env bash
# Regression and unit tests for beta-version.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CALCULATOR_SCRIPT="${SCRIPT_DIR}/beta-version.sh"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

setup_test_repo() {
  local repo_dir="$1"
  local bare_origin="$2"

  rm -rf "$repo_dir" "$bare_origin"
  git init -q --initial-branch=main "$bare_origin"

  git init -q --initial-branch=main "$repo_dir"
  cd "$repo_dir"
  git config user.name "Test Bot"
  git config user.email "test@example.com"
  git remote add origin "$bare_origin"

  git commit -q --allow-empty -m "initial commit"
  git branch -M develop
  git push -q -u origin develop >/dev/null 2>&1
}

run_calculator() {
  local repo_dir="$1"
  cd "$repo_dir"
  local output_file
  output_file=$(mktemp)
  GITHUB_OUTPUT="$output_file" bash "$CALCULATOR_SCRIPT" >/dev/null
  cat "$output_file"
  rm -f "$output_file"
}

echo "=== Running beta-version.sh regression tests ==="

# Test Case (a): feat-only history -> minor
echo -n "Test 1: feat-only history -> minor... "
repo_a="$tmpdir/repo_a"
origin_a="$tmpdir/origin_a.git"
setup_test_repo "$repo_a" "$origin_a"
cd "$repo_a"
git commit -q --allow-empty -m "feat(core): add new feature"
out_a=$(run_calculator "$repo_a")
level_a=$(echo "$out_a" | grep '^level=' | cut -d= -f2)
if [ "$level_a" != "minor" ]; then
  echo "FAILED (expected level=minor, got level=$level_a)"
  exit 1
fi
echo "PASSED"

# Test Case (b): fix/perf-only history -> patch
echo -n "Test 2: fix/perf-only history -> patch... "
repo_b="$tmpdir/repo_b"
origin_b="$tmpdir/origin_b.git"
setup_test_repo "$repo_b" "$origin_b"
cd "$repo_b"
git commit -q --allow-empty -m "fix(core): fix severe bug"
git commit -q --allow-empty -m "perf(core): speedup loop"
out_b=$(run_calculator "$repo_b")
level_b=$(echo "$out_b" | grep '^level=' | cut -d= -f2)
if [ "$level_b" != "patch" ]; then
  echo "FAILED (expected level=patch, got level=$level_b)"
  exit 1
fi
echo "PASSED"

# Test Case (c): breaking pre-1.0 -> minor (demotion)
echo -n "Test 3: breaking pre-1.0 -> minor (demotion)... "
repo_c="$tmpdir/repo_c"
origin_c="$tmpdir/origin_c.git"
setup_test_repo "$repo_c" "$origin_c"
cd "$repo_c"
git commit -q --allow-empty -m "feat(api)!: breaking change pre-1.0"
out_c=$(run_calculator "$repo_c")
level_c=$(echo "$out_c" | grep '^level=' | cut -d= -f2)
level_raw_c=$(echo "$out_c" | grep '^level_raw=' | cut -d= -f2)
if [ "$level_c" != "minor" ] || [ "$level_raw_c" != "major" ]; then
  echo "FAILED (expected level=minor, level_raw=major; got level=$level_c, level_raw=$level_raw_c)"
  exit 1
fi
echo "PASSED"

# Test Case (d): 1000+ feat commits to force SIGPIPE window -> still minor
echo -n "Test 4: 1000+ feat commits (SIGPIPE stress test) -> minor... "
repo_d="$tmpdir/repo_d"
origin_d="$tmpdir/origin_d.git"
setup_test_repo "$repo_d" "$origin_d"
cd "$repo_d"
python3 -c '
import subprocess
for i in range(1050):
  subprocess.run(["git", "commit", "-q", "--allow-empty", "-m", f"feat(module-{i}): feature description {i}"], check=True)
'
out_d=$(run_calculator "$repo_d")
level_d=$(echo "$out_d" | grep '^level=' | cut -d= -f2)
if [ "$level_d" != "minor" ]; then
  echo "FAILED (expected level=minor, got level=$level_d)"
  exit 1
fi
echo "PASSED"

echo "All tests passed successfully!"
