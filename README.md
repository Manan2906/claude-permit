# claude-permit

Stop switching back to Claude Code to approve permissions. Get **desktop notifications with Allow/Deny buttons** and **auto-allow trusted folders** — all without touching the Claude app.

## The Problem

Claude Code asks for permission on every tool use. You have to switch to the app, click allow, switch back. Repeat 100x/day.

## The Solution

| Feature | How it works |
|---|---|
| **Global auto-allow** | Never get prompted again across all projects |
| **Folder auto-allow** | Mark specific folders as trusted |
| **Desktop notification** | Allow/Deny popup — no app switching needed |
| **Command deny-list** | Block dangerous commands automatically |
| **Audit log** | Optional log of every allow/deny decision |

Works on **Windows**, **macOS**, and **Linux**.

---

## Install (One Time Only)

```bash
git clone https://github.com/Manan2906/claude-permit.git
cd claude-permit
node setup.js init
```

## Never Be Prompted Again (All Projects, All Folders)

```bash
claude-permit allow "C:/"        # Windows
claude-permit allow "/"          # Mac / Linux
```

That's it. Done forever. Every project, every folder, every new chat — fully automatic.

---

## How It Works

```
Claude wants to run a tool
        |
   [PreToolUse hook fires]
        |
   Is command in deny-list? --YES--> BLOCK (instant)
        |
       NO
        |
   Is folder auto-allowed? --YES--> ALLOW (silent)
        |
       NO
        |
   Show desktop popup
     /          |          \
  Allow      Always      Deny/Timeout
  Once      for Project      |
    |            |          BLOCK
  ALLOW    Save folder
             + ALLOW
```

---

## Popup Buttons

When a popup appears it has 3 buttons:

| Button | What it does |
|---|---|
| **✓ Allow Once** | Allows this one tool call |
| **★ Always for Project** | Auto-saves folder — never asks again for this project |
| **✕ Deny** | Blocks the tool call |

---

## Commands

```bash
claude-permit init              # Install hook + create config
claude-permit allow             # Auto-allow current folder
claude-permit allow "C:/"       # Auto-allow ALL folders (Windows)
claude-permit allow "/"         # Auto-allow ALL folders (Mac/Linux)
claude-permit deny "rm -rf *"   # Block a dangerous command pattern
claude-permit status            # View current config
claude-permit remove            # Uninstall hook
```

---

## Config

Edit `~/.claude-permit/config.json` to customise:

```json
{
  "autoAllow": {
    "tools": ["Read", "Glob", "Grep", "TodoWrite"],
    "commands": ["git status", "git diff*", "git log*", "npm test*"],
    "folders": ["C:/"]
  },
  "autoDeny": {
    "commands": ["rm -rf /*", "git push --force*"]
  },
  "notification": {
    "timeoutSeconds": 30,
    "defaultOnTimeout": "deny"
  },
  "log": {
    "enabled": false,
    "path": ""
  }
}
```

| Field | Description |
|---|---|
| `autoAllow.folders` | Paths where all tools are silently allowed. Use `C:/` for everything. |
| `autoAllow.tools` | Tool names always allowed everywhere (e.g. `Read`, `Glob`) |
| `autoAllow.commands` | Bash command glob patterns to auto-allow |
| `autoDeny.commands` | Bash command glob patterns to always block |
| `notification.timeoutSeconds` | How long popup stays open before auto-denying |
| `log.enabled` | Log every allow/deny to a file |

### Pattern syntax
`*` matches anything. Example: `git diff*` matches `git diff`, `git diff --staged`, etc.

---

## Platform Support

| OS | Notification method |
|---|---|
| Windows | PowerShell Windows Form (TopMost, themed) |
| macOS | `osascript` dialog |
| Linux | `zenity` (GNOME) or `kdialog` (KDE) |

---

## Safety

- **Deny-list wins** — always checked before allow-list
- **Timeout = deny** — if you don't respond, tool is blocked
- **Fail-open on crash** — if hook errors, Claude keeps working

---

## Uninstall

```bash
claude-permit remove        # removes hook, keeps config
rm -rf ~/.claude-permit     # removes everything
```

---

## License

MIT
