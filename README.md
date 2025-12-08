# MCP Conformance Action

A GitHub Action for running [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) conformance tests against server implementations. This action helps ensure your MCP server implementation adheres to the protocol specification.

## Features

- ✅ Test multiple server implementations (Python, TypeScript, or both)
- 🔄 Support for fork PRs via workflow_run pattern
- 📊 Automatic PR comments with test results
- 🏷️ Badge generation for README
- 📈 Baseline comparison against main/canary branches
- 🎯 Configurable test types (server, client, or both)

## Usage

### Basic Usage

This action operates in two modes to properly support fork PRs:

1. **Test Mode** - Runs conformance tests and uploads results as artifacts
2. **Comment Mode** - Downloads artifacts and posts results as PR comments

### Example: Test Workflow

Create `.github/workflows/conformance.yml`:

```yaml
name: MCP Conformance Tests

on:
  push:
    branches: [main, canary]
  pull_request:
    branches: [main, canary]

jobs:
  conformance-test:
    name: Run Conformance Tests
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      # Set up your server environment
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build server
        run: npm run build
      
      # Run conformance tests
      - name: Run conformance tests
        uses: mcp-use/mcp-conformance-action@v1
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

### Example: Comment Workflow

Create `.github/workflows/conformance-comment.yml`:

```yaml
name: Post Conformance Comment

on:
  workflow_run:
    workflows: ["MCP Conformance Tests"]
    types: [completed]

permissions:
  pull-requests: write

jobs:
  comment:
    name: Post Conformance Results
    runs-on: ubuntu-latest
    if: github.event.workflow_run.event == 'pull_request'
    
    steps:
      - name: Download results
        uses: actions/download-artifact@v4
        with:
          name: conformance-results
          path: conformance-results
          github-token: ${{ secrets.GITHUB_TOKEN }}
          run-id: ${{ github.event.workflow_run.id }}
      
      - name: Post comment
        uses: mcp-use/mcp-conformance-action@v1
        with:
          mode: comment
          github-token: ${{ secrets.GITHUB_TOKEN }}
          comment-mode: update
```

## Inputs

### Test Mode Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `mode` | Action mode: `test` or `comment` | No | `test` |
| `servers` | JSON array of server configurations | Yes (test mode) | - |
| `test-type` | Type of tests: `server`, `client`, or `both` | No | `server` |
| `conformance-version` | Version of @modelcontextprotocol/conformance | No | `latest` |
| `show-summary` | Show results in Actions summary | No | `true` |
| `artifact-name` | Name for results artifact | No | `conformance-results` |
| `badge-gist-id` | Gist ID for badge updates | No | - |
| `badge-gist-token` | Token for updating badge gist | No | - |

### Comment Mode Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `mode` | Action mode: `test` or `comment` | No | `test` |
| `github-token` | GitHub token for API access | Yes (comment mode) | - |
| `comment-mode` | Comment behavior: `create`, `update`, or `none` | No | `update` |
| `include-baseline-comparison` | Compare against baseline branches | No | `true` |
| `baseline-branches` | JSON array of branches for comparison | No | `["main", "canary"]` |

## Server Configuration

The `servers` input accepts a JSON array of server objects with the following structure:

```json
{
  "name": "server-name",
  "setup-commands": ["optional", "setup", "commands"],
  "start-command": "command to start server",
  "url": "http://localhost:3000/mcp",
  "working-directory": "optional/working/directory"
}
```

### Server Configuration Fields

| Field | Description | Required |
|-------|-------------|----------|
| `name` | Display name for the server | Yes |
| `start-command` | Command to start the server | Yes |
| `url` | URL where the MCP server is accessible | Yes |
| `setup-commands` | Array of commands to run before starting server | No |
| `working-directory` | Directory to run commands in | No |

### Example: Multiple Servers

```yaml
- name: Run conformance tests
  uses: mcp-use/mcp-conformance-action@v1
  with:
    mode: test
    servers: |
      [
        {
          "name": "python",
          "setup-commands": [
            "pip install -e .",
            "python -m pytest --setup-only"
          ],
          "start-command": "python -m myserver --port 8000",
          "url": "http://localhost:8000/mcp",
          "working-directory": "python-server"
        },
        {
          "name": "typescript",
          "setup-commands": ["npm install", "npm run build"],
          "start-command": "npm start",
          "url": "http://localhost:3000/mcp",
          "working-directory": "ts-server"
        }
      ]
```

## Outputs

| Output | Description |
|--------|-------------|
| `results` | JSON string containing test results for each server |
| `all-passed` | Boolean indicating if all tests passed |

### Using Outputs

```yaml
- name: Run conformance tests
  id: conformance
  uses: mcp-use/mcp-conformance-action@v1
  with:
    mode: test
    servers: '...'

- name: Check results
  if: steps.conformance.outputs.all-passed == 'false'
  run: echo "Some tests failed!"
```

## Badge Setup

To display conformance badges in your README:

1. Create a GitHub Gist to store badge data
2. Generate a Personal Access Token with `gist` scope
3. Add the gist ID and token as repository secrets
4. Configure the action:

```yaml
- uses: mcp-use/mcp-conformance-action@v1
  with:
    mode: test
    servers: '...'
    badge-gist-id: ${{ secrets.CONFORMANCE_GIST_ID }}
    badge-gist-token: ${{ secrets.GIST_SECRET }}
```

5. Add badge to your README:

```markdown
![MCP Conformance](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/USERNAME/GIST_ID/raw/my-server-conformance.json)
```

The badge will automatically update on pushes to main/canary branches.

## Comment Modes

### Update Mode (Recommended)

Updates the same comment on each run. This keeps PR conversations clean:

```yaml
comment-mode: update
```

### Create Mode

Creates a new comment for each run. Useful for tracking progress over time:

```yaml
comment-mode: create
```

### None Mode

Disables PR comments completely:

```yaml
comment-mode: none
```

## Fork PR Support

This action properly supports PRs from forks using the `workflow_run` pattern:

1. The test workflow runs with read-only permissions on the fork's code
2. Results are uploaded as artifacts
3. A separate workflow with write permissions downloads artifacts and posts comments
4. Repository maintainers can review and approve workflow runs for first-time contributors

This ensures security while still providing automated test feedback.

## Advanced Examples

### Conditional Server Testing

Test different servers based on workflow inputs:

```yaml
on:
  workflow_dispatch:
    inputs:
      server:
        type: choice
        options: [all, python, typescript]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build server list
        id: servers
        run: |
          if [ "${{ inputs.server }}" = "all" ]; then
            echo 'servers=[{"name":"python",...},{"name":"typescript",...}]' >> $GITHUB_OUTPUT
          elif [ "${{ inputs.server }}" = "python" ]; then
            echo 'servers=[{"name":"python",...}]' >> $GITHUB_OUTPUT
          else
            echo 'servers=[{"name":"typescript",...}]' >> $GITHUB_OUTPUT
          fi
      
      - uses: mcp-use/mcp-conformance-action@v1
        with:
          mode: test
          servers: ${{ steps.servers.outputs.servers }}
```

### Client Testing

Test MCP client implementations:

```yaml
- uses: mcp-use/mcp-conformance-action@v1
  with:
    mode: test
    test-type: client
    servers: |
      [
        {
          "name": "my-client",
          "start-command": "npm run start:client",
          "url": "http://localhost:3000"
        }
      ]
```

## Troubleshooting

### Server Fails to Start

If your server doesn't start within 5 seconds, you may need to add a longer delay or health check:

```json
{
  "setup-commands": [
    "npm start &",
    "sleep 10",
    "curl --retry 5 --retry-delay 1 http://localhost:3000/health"
  ],
  "start-command": "true",
  "url": "http://localhost:3000/mcp"
}
```

### Missing Artifacts

If the comment workflow can't find artifacts:

1. Ensure the test workflow completed successfully
2. Check that the artifact name matches in both workflows
3. Verify the workflow_run trigger is configured correctly

### Permission Errors

For fork PRs, ensure:

1. The comment workflow has `pull-requests: write` permission
2. The workflow_run trigger is used (not direct pull_request)
3. The test workflow uploads artifacts successfully

## Contributing

Contributions are welcome! Please open an issue or PR on [GitHub](https://github.com/mcp-use/mcp-conformance-action).

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Conformance Tool](https://github.com/modelcontextprotocol/conformance)
- [MCP Use](https://github.com/mcp-use/mcp-use)
