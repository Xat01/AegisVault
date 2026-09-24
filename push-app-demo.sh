#!/usr/bin/env bash
#
# Push the app-demo branch and report what still needs doing by hand.
#
# The environment this was set up from has no stored git credentials and its
# credential helper waits on an interactive prompt, which is why the push could
# not be completed automatically. Run this from your own terminal instead.
#
# Usage:
#   ./push-app-demo.sh                    # normal push, prompts if needed
#   GITHUB_TOKEN=ghp_xxx ./push-app-demo.sh   # push with a token, no prompt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

BRANCH="app-demo"
REMOTE="origin"

say()  { printf '\033[36m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
fail() { printf '\033[31m  ✗ %s\033[0m\n' "$*"; }

say "Repository: $REPO_ROOT"
say "Branch:     $(git branch --show-current)"
echo

# ---------------------------------------------------------------- sanity checks

if [ "$(git branch --show-current)" != "$BRANCH" ]; then
  warn "Not on $BRANCH — switching."
  git checkout "$BRANCH"
fi

if [ -n "$(git status --porcelain -- web .github .gitignore)" ]; then
  warn "There are uncommitted changes under web/ — commit them first:"
  git status --short -- web .github .gitignore
  exit 1
fi
ok "Working tree is clean for web/ and .github/"

if ! git rev-parse --verify --quiet "$BRANCH" >/dev/null; then
  fail "Branch $BRANCH does not exist."
  exit 1
fi
ok "Commit present: $(git log --oneline -1 "$BRANCH")"
echo

# ------------------------------------------------------------------------ push

if [ -n "${GITHUB_TOKEN:-}" ]; then
  say "Pushing with GITHUB_TOKEN (not written to disk)…"
  git -c "http.extraheader=Authorization: Bearer $GITHUB_TOKEN" \
      push -u "$REMOTE" "$BRANCH"
else
  say "Pushing (git may prompt for GitHub credentials)…"
  git push -u "$REMOTE" "$BRANCH"
fi

ok "Pushed $BRANCH to $REMOTE"
echo

# --------------------------------------------------------------- what's next

OWNER_REPO="$(git remote get-url "$REMOTE" \
  | sed -E 's#(git@|https://)github.com[:/]##; s#\.git$##')"

say "---------------------------------------------------------------"
say "Two manual steps remain, both in the GitHub web UI:"
echo
say "1. Enable GitHub Pages"
echo "     https://github.com/$OWNER_REPO/settings/pages"
echo "     Source -> GitHub Actions"
echo
say "2. Watch the deploy"
echo "     https://github.com/$OWNER_REPO/actions"
echo
say "Your app will then be live at:"
echo "     https://${OWNER_REPO%%/*}.github.io/${OWNER_REPO##*/}/"
echo
say "Open that on your phone and tap Install."
