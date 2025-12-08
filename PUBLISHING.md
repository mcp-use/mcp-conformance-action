# Publishing Guide

This guide explains how to publish the MCP Conformance Action to GitHub Marketplace.

## Prerequisites

1. Create the `mcp-use/mcp-conformance-action` repository on GitHub
2. Ensure you have admin access to the repository
3. Have the GitHub CLI (`gh`) installed (optional but recommended)

## Initial Setup

### 1. Create the GitHub Repository

```bash
# Using GitHub CLI
gh repo create mcp-use/mcp-conformance-action --public --description "GitHub Action for running MCP conformance tests"

# Or create manually at: https://github.com/organizations/mcp-use/repositories/new
```

### 2. Push the Code

```bash
cd /Users/e.t./Projects/mcp-use/mcp-conformance-action

# Initialize git if not already done
git init
git add .
git commit -m "Initial commit: MCP Conformance Action v1.0.0"

# Add remote and push
git remote add origin https://github.com/mcp-use/mcp-conformance-action.git
git branch -M main
git push -u origin main
```

### 3. Build and Commit the Dist Directory

**Important:** GitHub Actions requires the `dist/` directory to be committed.

```bash
# Build the action
yarn build

# Add dist to git
git add dist/
git commit -m "Add compiled distribution"
git push
```

## Creating a Release

### Option 1: Using GitHub CLI

```bash
# Create a tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# Create the release
gh release create v1.0.0 \
  --title "MCP Conformance Action v1.0.0" \
  --notes "Initial release of the MCP Conformance Action

Features:
- Test multiple MCP server implementations
- Support for fork PRs via workflow_run pattern
- Automatic PR comments with test results
- Badge generation for README
- Baseline comparison against main/canary branches
- Configurable test types (server, client, or both)"
```

### Option 2: Using GitHub Web Interface

1. Go to https://github.com/mcp-use/mcp-conformance-action/releases/new
2. Choose a tag: `v1.0.0`
3. Set release title: `MCP Conformance Action v1.0.0`
4. Add release notes (see template below)
5. Check "Publish this action to the GitHub Marketplace"
6. Choose a primary category: **Continuous Integration**
7. Choose a secondary category: **Testing**
8. Click "Publish release"

### Release Notes Template

```markdown
## What's New

Initial release of the MCP Conformance Action 🎉

## Features

- ✅ Test multiple server implementations (Python, TypeScript, or both)
- 🔄 Support for fork PRs via workflow_run pattern
- 📊 Automatic PR comments with test results
- 🏷️ Badge generation for README
- 📈 Baseline comparison against main/canary branches
- 🎯 Configurable test types (server, client, or both)

## Usage

```yaml
- uses: mcp-use/mcp-conformance-action@v1
  with:
    mode: test
    servers: |
      [
        {
          "name": "my-server",
          "start-command": "npm start",
          "url": "http://localhost:3000/mcp"
        }
      ]
```

See the [README](https://github.com/mcp-use/mcp-conformance-action#readme) for full documentation.
```

## GitHub Marketplace Requirements

To publish to GitHub Marketplace, ensure:

1. ✅ Repository is public
2. ✅ Contains a single `action.yml` at the root
3. ✅ No workflow files in the repository (only in `.github/workflows/` for examples)
4. ✅ Action name is unique
5. ✅ README has comprehensive documentation
6. ✅ LICENSE file is present
7. ✅ `dist/` directory is committed

## Updating the Action

When publishing new versions:

### 1. Update Version Numbers

Update `package.json`:

```json
{
  "version": "1.1.0"
}
```

### 2. Rebuild

```bash
yarn build
git add dist/
git commit -m "Build v1.1.0"
git push
```

### 3. Create New Release

```bash
# Create tag
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0

# Create release
gh release create v1.1.0 \
  --title "MCP Conformance Action v1.1.0" \
  --notes "Release notes here..."
```

### 4. Move Major Version Tag

To allow users to use `@v1` instead of `@v1.1.0`:

```bash
# Delete old tag (if exists)
git tag -d v1
git push origin :refs/tags/v1

# Create new tag pointing to v1.1.0
git tag -f v1 v1.1.0
git push origin v1 --force
```

## Semantic Versioning

Follow semantic versioning:

- **Major (v2.0.0)**: Breaking changes
- **Minor (v1.1.0)**: New features, backwards compatible
- **Patch (v1.0.1)**: Bug fixes, backwards compatible

## Testing Before Release

Before releasing, test the action locally:

```bash
# In a test repository
- uses: mcp-use/mcp-conformance-action@main
  with:
    mode: test
    servers: '...'
```

Or test against a specific commit:

```bash
- uses: mcp-use/mcp-conformance-action@{commit-sha}
```

## Marketplace Categories

The action is published in these categories:

1. **Primary**: Continuous Integration
2. **Secondary**: Testing

These help users discover the action in GitHub Marketplace.

## Badge and Branding

The action uses:
- Icon: `check-circle` ✅
- Color: `green` 🟢

These are defined in `action.yml` and appear in the marketplace listing.

## After Publishing

1. Verify the action appears in GitHub Marketplace
2. Test the action using `@v1` in a workflow
3. Update the README in mcp-use/mcp-use to reference the new action
4. Announce the release in relevant channels

## Troubleshooting

### Action Not Appearing in Marketplace

- Ensure all marketplace requirements are met
- Check that the release was published with "Publish to Marketplace" checked
- Wait a few minutes for indexing

### Users Can't Use the Action

- Verify the `dist/` directory is committed
- Check that `action.yml` specifies `main: 'dist/index.js'`
- Ensure the repository is public

### Breaking Changes

If you need to make breaking changes:

1. Bump to a new major version (e.g., v2.0.0)
2. Keep the old major version tag (v1) pointing to the last v1.x.x release
3. Users on `@v1` won't be affected
4. Document migration path in release notes
