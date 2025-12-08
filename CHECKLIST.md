# Publication Checklist

Use this checklist when publishing the MCP Conformance Action.

## Pre-Publication

- [ ] All TypeScript code compiles without errors
- [ ] `yarn build` runs successfully
- [ ] `dist/` directory is committed to git
- [ ] Tests pass (if any)
- [ ] README is complete and accurate
- [ ] Examples work correctly
- [ ] Version number updated in package.json
- [ ] CHANGELOG updated (if exists)

## GitHub Repository Setup

- [ ] Create `mcp-use/mcp-conformance-action` repository on GitHub
- [ ] Repository is public
- [ ] Repository has a description
- [ ] Repository topics are set (e.g., `github-actions`, `mcp`, `conformance`, `testing`)
- [ ] Default branch is `main`

## Initial Push

```bash
cd /Users/e.t./Projects/mcp-use/mcp-conformance-action
git init
git add .
git commit -m "Initial commit: MCP Conformance Action v1.0.0"
git remote add origin https://github.com/mcp-use/mcp-conformance-action.git
git branch -M main
git push -u origin main
```

- [ ] Code pushed to GitHub
- [ ] All files present in repository
- [ ] `dist/` directory is committed

## First Release

- [ ] Create tag: `git tag -a v1.0.0 -m "Release v1.0.0"`
- [ ] Push tag: `git push origin v1.0.0`
- [ ] Go to GitHub releases page
- [ ] Create new release from tag v1.0.0
- [ ] Set title: "MCP Conformance Action v1.0.0"
- [ ] Add release notes (see PUBLISHING.md)
- [ ] ✅ Check "Publish this action to the GitHub Marketplace"
- [ ] Select primary category: **Continuous Integration**
- [ ] Select secondary category: **Testing**
- [ ] Click "Publish release"

## Verify Publication

- [ ] Action appears in GitHub Marketplace
- [ ] Action can be found by searching "MCP Conformance"
- [ ] README renders correctly
- [ ] Badge and branding show correctly

## Test the Action

- [ ] Create test workflow using `@v1`
- [ ] Verify test mode works
- [ ] Verify comment mode works
- [ ] Verify artifacts are uploaded
- [ ] Verify PR comments are posted

## Update Documentation

- [ ] Update mcp-use/mcp-use README to reference new action
- [ ] Update mcp-use/mcp-use workflows to use published action
- [ ] Remove local action implementation from mcp-use/mcp-use

## Major Version Tag

- [ ] Create/update v1 tag: `git tag -f v1 v1.0.0`
- [ ] Push v1 tag: `git push origin v1 --force`
- [ ] Verify users can use `@v1`

## Announce

- [ ] Announce in team chat
- [ ] Share on relevant channels
- [ ] Update project documentation

## Future Releases

For subsequent releases, use the helper script:

```bash
./scripts/publish.sh
```

Or follow the manual steps in PUBLISHING.md.
