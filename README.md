# claude-permit

Stop switching back to Claude Code to approve permissions. Get **desktop notifications with Allow/Deny buttons** and **auto-allow trusted folders**.

## The Problem

Claude Code asks for permission on every tool use. You have to switch to the app, click allow, switch back. Repeat 100x/day.

## The Solution

| Feature | How it works |
|---|---|
| **Folder auto-allow** | Mark folders as trusted. All tools run without prompts. |
| **Desktop notification** | A system popup with Allow / Deny. No app-switching. |
| **Command deny-list** | Block dangerous commands (`rm -rf`, `git push --force`) automatically. |
| **Audit log** | Optional log of every allow/deny decision. |

Works on **Windows**, **macOS**, and **Linux**.

## Install

```bash
# Option 1: npx (no install)
npx claude-permit init

# Option 2: global install
npm i -g claude-permit
claude-permit init
```

## Usage

```bash
# Auto-allow everything in current folder
claude-permit allow

# Auto-allow a specific folder
claude-permit allow /path/to/project

# Block a dangerous command pattern
claude-permit deny "rm -rf /*"

# Check config
claude-permit status

# Uninstall
claude-permit remove
```

## How It Works

```
Claude wants to run a tool
        |
   [PreToolUse hook fires]
        |
   Is command in deny-list? --YES--> BLOCK
        |
       NO
        |
   Is folder/tool auto-allowed? --YES--> ALLOW (silent)
        |
       NO
        |
   Show desktop notification
     /        \
  Allow      Deny/Timeout --> BLOCK
    |
  ALLOW
```

The hook installs into `~/.claude/settings.json` as a `PreToolUse` hook. It reads rules from `~/.claude-permit/config.json`.

## Config

After `init`, edit `~/.claude-permit/config.json`:

```json
{
  "autoAllow": {
    "tools": ["Read", "Glob", "Grep", "TodoWrite"],
    "commands": ["git status", "git diff*", "git log*", "npm test*"],
    "folders": ["/home/you/projects/my-app"]
  },
  "autoDeny": {
    "commands": ["rm -rf /*", "git push --force*"]
  },
  "notification": {
    "timeoutSeconds": 30,
    "defaultOnTimeout": "deny"
  },
  "log": {
    "enabled": true,
    "path": ""
  }
}
```

| Field | Description |
|---|---|
| `autoAllow.tools` | Tool names that always pass (e.g., `Read`, `Glob`) |
| `autoAllow.commands` | Bash command glob patterns to auto-allow |
| `autoAllow.folders` | Absolute paths. Any project inside these folders is auto-allowed. |
| `autoDeny.commands` | Bash command glob patterns to always block |
| `notification.timeoutSeconds` | How long the popup stays open |
| `notification.defaultOnTimeout` | `"deny"` or `"allow"` when popup times out |
| `log.enabled` | Write every decision to a log file |
| `log.path` | Log file path (default: `~/.claude-permit/permit.log`) |

### Pattern syntax

`*` matches anything. Examples:
- `git diff*` matches `git diff`, `git diff --staged`, etc.
- `npm run *` matches `npm run dev`, `npm run build`, etc.

## Platform Details

| OS | Notification method |
|---|---|
| Windows | PowerShell `WScript.Shell.Popup` (built-in, has timeout) |
| macOS | `osascript` dialog |
| Linux | `zenity` (GNOME) or `kdialog` (KDE) |

## Safety

- **Fail-open on crash**: If the hook errors out, tools are allowed (Claude keeps working).
- **Fail-closed on timeout**: If you don't respond to a notification, the tool is denied.
- Deny-list is checked **before** allow-list. Denies always win.

## Uninstall

```bash
claude-permit remove          # removes hook, keeps config
rm -rf ~/.claude-permit       # removes config too
```

## License

MIT
