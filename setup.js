#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CFG_DIR = path.join(HOME, '.claude-permit');
const CFG_FILE = path.join(CFG_DIR, 'config.json');
const HOOK_SRC = path.join(__dirname, 'hook.js');
const HOOK_DEST = path.join(CFG_DIR, 'hook.js');
const CLAUDE_SETTINGS = path.join(HOME, '.claude', 'settings.json');

const cmd = process.argv[2];

switch (cmd) {
  case 'init': init(); break;
  case 'allow': allow(process.argv[3]); break;
  case 'deny': deny(process.argv[3]); break;
  case 'remove': remove(); break;
  case 'status': status(); break;
  default: help();
}

function help() {
  console.log(`
claude-permit - Desktop notifications & auto-allow for Claude Code

Usage:
  claude-permit init              Install hook + create default config
  claude-permit allow [folder]    Auto-allow a folder (default: current dir)
  claude-permit deny <pattern>    Auto-deny a Bash command pattern
  claude-permit remove            Uninstall hook from Claude settings
  claude-permit status            Show current config
`);
}

function init() {
  fs.mkdirSync(CFG_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true });

  // Copy hook to stable location
  fs.copyFileSync(HOOK_SRC, HOOK_DEST);

  // Create config if missing
  if (!fs.existsSync(CFG_FILE)) {
    const example = path.join(__dirname, 'config.example.json');
    fs.copyFileSync(example, CFG_FILE);
    console.log('Config created: ' + CFG_FILE);
  }

  // Patch Claude settings: auto-allow all tools + add PreToolUse hook
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8')); } catch {}

  // Auto-allow tools in Claude so our hook is the ONLY permission gate
  if (!settings.permissions) settings.permissions = {};
  settings.permissions.defaultMode = 'bypassPermissions';
  // Get existing MCP tool entries so we don't lose them
  const existingMcp = (settings.permissions?.allow || []).filter(t => t.startsWith('mcp__'));
  settings.permissions.allow = [
    'Bash', 'PowerShell', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
    'Agent', 'WebFetch', 'WebSearch', 'NotebookEdit', 'TodoWrite', 'Skill', 'ExitPlanMode',
    ...existingMcp
  ];

  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];

  // Remove old claude-permit entries
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    h => !(h.command || '').includes('claude-permit')
  );

  // Use full node path so Claude desktop app can find it regardless of PATH
  const nodePath = process.execPath.replace(/\\/g, '/');
  settings.hooks.PreToolUse.push({
    matcher: '',
    command: '"' + nodePath + '" "' + HOOK_DEST.replace(/\\/g, '/') + '"'
  });

  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));

  console.log(`
Installed!
  Hook:   ${HOOK_DEST}
  Config: ${CFG_FILE}
  Claude: ${CLAUDE_SETTINGS}

Next steps:
  claude-permit allow             Auto-allow current folder
  Edit ${CFG_FILE} to tweak rules
`);
}

function allow(folder) {
  ensureConfig();
  const config = loadConfig();
  folder = path.resolve(folder || '.');
  if (!config.autoAllow.folders) config.autoAllow.folders = [];
  if (config.autoAllow.folders.some(f => path.resolve(f) === folder)) {
    console.log('Already allowed: ' + folder);
    return;
  }
  config.autoAllow.folders.push(folder);
  saveConfig(config);
  console.log('Auto-allow added: ' + folder);
}

function deny(pattern) {
  if (!pattern) { console.log('Usage: claude-permit deny "rm -rf*"'); return; }
  ensureConfig();
  const config = loadConfig();
  if (!config.autoDeny) config.autoDeny = {};
  if (!config.autoDeny.commands) config.autoDeny.commands = [];
  if (!config.autoDeny.commands.includes(pattern)) {
    config.autoDeny.commands.push(pattern);
    saveConfig(config);
    console.log('Auto-deny added: ' + pattern);
  } else {
    console.log('Already denied: ' + pattern);
  }
}

function remove() {
  try {
    const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
    if (settings.hooks?.PreToolUse) {
      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
        h => !(h.command || '').includes('claude-permit')
      );
      if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
    }
  } catch {}
  console.log('Hook removed. Config preserved at: ' + CFG_FILE);
}

function status() {
  if (!fs.existsSync(CFG_FILE)) {
    console.log('Not installed. Run: claude-permit init');
    return;
  }
  console.log(fs.readFileSync(CFG_FILE, 'utf8'));
}

function ensureConfig() {
  if (!fs.existsSync(CFG_FILE)) {
    console.log('Run "claude-permit init" first.');
    process.exit(1);
  }
}
function loadConfig() { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); }
function saveConfig(c) { fs.writeFileSync(CFG_FILE, JSON.stringify(c, null, 2) + '\n'); }
