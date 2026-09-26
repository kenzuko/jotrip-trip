#!/usr/bin/env bash
# Run ONLY inside the original Work workspace where the recovery commits exist.
# This script does not checkout, commit, stash, reset, or force-push.
set -euo pipefail
expected_branch="recovery/trip-engine-worktree-20260924"
expected_merge_commit="8400ae4633362b4e6c6ca10ceebdcb88f93db609"
repo_url="https://github.com/kenzuko/jotrip-trip.git"

current="$(git branch --show-current)"
if [[ "$current" != "$expected_branch" ]]; then
  echo "STOP: expected $expected_branch, found $current"
  exit 1
fi
if ! git cat-file -e "${expected_merge_commit}^{commit}" 2>/dev/null; then
  echo "STOP: reconciliation commit is not in this workspace"
  exit 1
fi
if ! git merge-base --is-ancestor "$expected_merge_commit" HEAD; then
  echo "STOP: recovery HEAD does not contain the reported reconciliation commit"
  exit 1
fi
if [[ "$(git remote get-url origin)" != "$repo_url" && "$(git remote get-url origin)" != "git@github.com:kenzuko/jotrip-trip.git" ]]; then
  echo "STOP: unexpected origin URL: $(git remote get-url origin)"
  exit 1
fi
echo "Review uncommitted files before push (not included in the push):"
git status --short
echo "Review recovery commits:"
git log -4 --oneline
echo "Check GitHub authentication using your configured credential helper."
echo "Never paste an access token into chat or put it in the remote URL."
git ls-remote --exit-code origin HEAD >/dev/null
if git ls-remote --heads origin "$expected_branch" | grep -q .; then
  echo "STOP: recovery branch already exists remotely. Compare histories manually; no overwrite."
  exit 1
fi
git push --porcelain origin "HEAD:refs/heads/$expected_branch"
echo "Remote recovery branch: https://github.com/kenzuko/jotrip-trip/tree/$expected_branch"
echo "Next: inspect full source and migrations before merge or deploy."
