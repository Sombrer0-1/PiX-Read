# Extension Examples

Example extensions for pi-coding-agent.

## Usage

```bash
# Load an extension with --extension flag
pi --extension examples/extensions/permission-gate.ts

# Or copy to extensions directory for auto-discovery
cp permission-gate.ts ~/.pi/agent/extensions/
```

## Examples

### Lifecycle & Safety

| Extension | Description |
|-----------|-------------|
| `permission-gate.ts` | Prompts for confirmation before dangerous bash commands (rm -rf, sudo, etc.) |
| `protected-paths.ts` | Blocks writes to protected paths (.env, .git/, node_modules/) |
| `confirm-destructive.ts` | Confirms before destructive session actions (clear, switch, fork) |
| `dirty-repo-guard.ts` | Prevents session changes with uncommitted git changes |
| `auto-commit-on-exit.ts` | Commits uncommitted changes when the agent finishes a turn |
| `sandbox/` | OS-level sandboxing using `@anthropic-ai/sandbox-runtime` with per-project config |

### Custom Tools

| Extension | Description |
|-----------|-------------|
| `dynamic-tools.ts` | Registers/removes tools at runtime based on session state |
| `tool-override.ts` | Wraps a built-in tool to change its behavior |
| `inline-bash.ts` | Adds a tool that executes short bash snippets |
| `bash-spawn-hook.ts` | Customizes bash process spawning (env, cwd) |
| `with-deps/` | Extension with its own node_modules dependencies |

### Session & Messages

| Extension | Description |
|-----------|-------------|
| `send-user-message.ts` | Sends user messages programmatically (steer / follow-up) |
| `session-name.ts` | Sets the session display name automatically |
| `bookmark.ts` | Adds labels to session entries as bookmarks |
| `git-checkpoint.ts` | Creates a git commit checkpoint per turn |
| `git-merge-and-resolve.ts` | Merge conflict resolution workflow |
| `claude-rules.ts` | Loads CLAUDE.md as extra context |

### Events & Input

| Extension | Description |
|-----------|-------------|
| `event-bus.ts` | Cross-extension communication via the shared event bus |
| `input-transform.ts` | Transforms user input before it reaches the agent |
| `input-transform-streaming.ts` | Same, but only while streaming |
| `file-trigger.ts` | Reacts to file changes during a session |
| `prompt-customizer.ts` | Rewrites the system prompt via before_agent_start |
| `system-prompt-header.ts` | Appends a header to the system prompt |
| `provider-payload.ts` | Inspects/modifies raw provider request payloads |
| `pirate.ts` | Fun system prompt rewrite |
| `hello.ts` | Minimal extension skeleton |

### Model & Compaction

| Extension | Description |
|-----------|-------------|
| `model-status.ts` | Reports current model changes |
| `custom-compaction.ts` | Custom compaction logic via session_before_compact |
| `trigger-compact.ts` | Triggers compaction from a command |
| `reload-runtime.ts` | Reloads extensions/skills at runtime |

### Commands & UI

| Extension | Description |
|-----------|-------------|
| `commands.ts` | Registers a slash command listing all available commands |
| `notify.ts` | Shows notifications via ctx.ui.notify |
| `timed-confirm.ts` | Confirm dialog with a timeout |
| `titlebar-spinner.ts` | Updates the window title while streaming |
| `widget-placement.ts` | Places status line widgets above/below the editor |
| `rpc-demo.ts` | Demonstrates the RPC UI bridge (setWidget/setTitle/setEditorText) |
| `shutdown-command.ts` | Registers a command that shuts pi down gracefully |

### Providers

| Extension | Description |
|-----------|-------------|
| `custom-provider-anthropic/` | Registers a custom Anthropic-compatible provider |
| `custom-provider-gitlab-duo/` | Registers GitLab Duo as a provider |

### Resources

| Extension | Description |
|-----------|-------------|
| `dynamic-resources/` | Contributes skills/prompts via resources_discover |
