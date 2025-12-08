#!/bin/bash
set -e

# MCP Conformance Action - Publishing Script
# This script helps publish the action to GitHub

echo "🚀 MCP Conformance Action Publishing Helper"
echo "==========================================="
echo

# Check if we're in the right directory
if [ ! -f "action.yml" ]; then
  echo "❌ Error: action.yml not found. Please run this script from the repository root."
  exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
  echo "⚠️  Warning: GitHub CLI (gh) not found. Install it for easier publishing:"
  echo "   https://cli.github.com/"
  echo
fi

# Get version from user
read -p "Enter version (e.g., 1.0.0): " VERSION
if [ -z "$VERSION" ]; then
  echo "❌ Error: Version is required"
  exit 1
fi

TAG="v$VERSION"

echo
echo "📦 Building action..."
yarn build

echo
echo "✅ Checking for uncommitted changes in dist/..."
if [ -n "$(git status --porcelain dist/)" ]; then
  echo "📝 Found uncommitted changes in dist/"
  git add dist/
  git commit -m "Build $TAG"
else
  echo "✨ dist/ is up to date"
fi

echo
echo "🏷️  Creating tag $TAG..."
git tag -a "$TAG" -m "Release $TAG"

echo
echo "⬆️  Pushing to GitHub..."
git push origin main
git push origin "$TAG"

echo
echo "📋 Next steps:"
echo "1. Go to: https://github.com/mcp-use/mcp-conformance-action/releases/new?tag=$TAG"
echo "2. Set the release title: 'MCP Conformance Action $TAG'"
echo "3. Add release notes"
echo "4. Check 'Publish this action to the GitHub Marketplace'"
echo "5. Choose categories:"
echo "   - Primary: Continuous Integration"
echo "   - Secondary: Testing"
echo "6. Click 'Publish release'"
echo
echo "🎉 Done! The action will be available at:"
echo "   uses: mcp-use/mcp-conformance-action@$TAG"
echo "   uses: mcp-use/mcp-conformance-action@v${VERSION%%.*}"
echo

# Update major version tag
MAJOR_VERSION="v${VERSION%%.*}"
read -p "Update $MAJOR_VERSION tag to point to $TAG? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🔖 Updating $MAJOR_VERSION tag..."
  git tag -f "$MAJOR_VERSION" "$TAG"
  git push origin "$MAJOR_VERSION" --force
  echo "✅ $MAJOR_VERSION tag updated"
fi

echo
echo "✨ Publishing complete!"
