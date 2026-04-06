#!/bin/sh
set -e

# Ensure Homebrew and common node bin paths are available
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"

# Usage: ./scripts/release.sh <version> ["release notes"]
# Example: ./scripts/release.sh 1.0.8 "Fix update prompt, improve token UX"

VERSION=$1
NOTES=${2:-""}

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version> [\"release notes\"]"
  echo "Example: ./scripts/release.sh 1.0.8 \"Fix update prompt\""
  exit 1
fi

# Strip leading 'v' if provided
VERSION=$(echo "$VERSION" | sed 's/^v//')
TAG="v$VERSION"

# Ensure we're on main and up to date
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Error: must be on main branch (currently on $BRANCH)"
  exit 1
fi

git pull origin main --quiet

echo "Releasing $TAG..."

# Bump version in package.json (--no-git-tag-version skips npm's own commit/tag)
npm version "$VERSION" --no-git-tag-version --silent

# Commit and push
git add package.json package-lock.json
git commit -m "chore: release $TAG"
git push origin main

# Create GitHub release (Vercel auto-deploys from the main push)
if [ -n "$NOTES" ]; then
  gh release create "$TAG" --title "$TAG" --notes "$NOTES"
else
  gh release create "$TAG" --title "$TAG" --generate-notes
fi

echo ""
echo "Released $TAG"
echo "  GitHub: https://github.com/Inflect-Labs/github-digest/releases/tag/$TAG"
echo "  Vercel: https://vercel.com/inflectlabs/github-digest"
echo "  Install: curl -fsSL https://github-digest-amber.vercel.app/install | sh"
