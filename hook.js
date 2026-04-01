#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.claude-permit', 'config.json');
const LOG_PATH = path.join(os.homedir(), '.claude-permit', 'permit.log');

// --- Config ---
let _cfg;
function cfg() {
  if (!_cfg) {
    try { _cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
    catch { _cfg = { autoAllow: {}, autoDeny: {}, notification: {} }; }
  }
  return _cfg;
}

// --- Path helpers ---
function norm(p) { return path.resolve(p).replace(/\\/g, '/').toLowerCase(); }

function glob(str, pattern) {
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return re.test(str);
}

function cmdLine(input) { return (input.command || '').split('\n')[0].trim(); }

// --- Rules ---
function isDenied(name, input) {
  const deny = cfg().autoDeny || {};
  if (name === 'Bash' && deny.commands) {
    const cmd = cmdLine(input);
    for (const p of deny.commands) { if (glob(cmd, p)) return true; }
  }
  return false;
}

function isAllowed(name, input) {
  const allow = cfg().autoAllow || {};
  // Folder match
  if (allow.folders) {
    const cwd = norm(process.cwd());
    for (const f of allow.folders) { if (cwd.startsWith(norm(f))) return true; }
  }
  // Tool match
  if (allow.tools && allow.tools.includes(name)) return true;
  // Command match
  if (name === 'Bash' && allow.commands) {
    const cmd = cmdLine(input);
    for (const p of allow.commands) { if (glob(cmd, p)) return true; }
  }
  return false;
}

// --- Notify ---
function ask(name, input) {
  const t = cfg().notification?.timeoutSeconds || 30;
  const detail = name === 'Bash' ? cmdLine(input) : (input.file_path || input.pattern || JSON.stringify(input).slice(0, 120));
  const msg = `[Claude Permit]\nTool: ${name}\n${trunc(detail, 200)}`;
  const plat = os.platform();
  try {
    if (plat === 'win32') return askWin(msg, t);
    if (plat === 'darwin') return askMac(msg, t);
    return askLinux(msg, t);
  } catch {
    return cfg().notification?.defaultOnTimeout === 'allow';
  }
}

function askWin(msg, t) {
  // WScript.Shell.Popup: has built-in timeout, Yes/No buttons (4), Question icon (32)
  const ps = `$w=New-Object -ComObject WScript.Shell;$r=$w.Popup($env:CP_M,[int]$env:CP_T,'Claude Permit - Allow?',36);if($r-eq6){exit 0}else{exit 1}`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    env: { ...process.env, CP_M: msg, CP_T: String(t) },
    timeout: (t + 5) * 1000, windowsHide: false
  });
  return r.status === 0;
}

function askMac(msg, t) {
  const safe = msg.replace(/'/g, "\\'").replace(/"/g, '\\"');
  const r = spawnSync('osascript', ['-e',
    `display dialog "${safe}" buttons {"Deny","Allow"} default button "Allow" giving up after ${t}`
  ], { timeout: (t + 5) * 1000 });
  return r.stdout && r.stdout.toString().includes('Allow');
}

function askLinux(msg, t) {
  // Try zenity first, fall back to kdialog
  let r = spawnSync('zenity', ['--question', `--text=${msg}`, '--title=Claude Permit', `--timeout=${t}`],
    { timeout: (t + 5) * 1000 });
  if (r.error) {
    r = spawnSync('kdialog', ['--yesno', msg, '--title', 'Claude Permit'],
      { timeout: (t + 5) * 1000 });
  }
  return r.status === 0;
}

function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + '...' : s || ''; }

// --- Log ---
function log(name, input, result) {
  if (!cfg().log?.enabled) return;
  const p = cfg().log?.path || LOG_PATH;
  const line = `${new Date().toISOString()} | ${result} | ${name} | ${trunc(cmdLine(input) || JSON.stringify(input), 100)}\n`;
  try { fs.appendFileSync(p, line); } catch {}
}

// --- Main ---
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => (input += d));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const name = data.tool_name;
    const tInput = data.tool_input || {};
    run(name, tInput);
  } catch {
    process.exit(0); // fail-open
  }
});

function run(name, tInput) {
  if (isDenied(name, tInput)) {
    log(name, tInput, 'DENIED');
    process.stdout.write(`Blocked by Claude Permit: ${name}`);
    process.exit(2);
  }
  if (isAllowed(name, tInput)) {
    log(name, tInput, 'AUTO');
    process.exit(0);
  }
  const ok = ask(name, tInput);
  log(name, tInput, ok ? 'ALLOW' : 'DENY');
  if (ok) {
    process.exit(0);
  } else {
    process.stdout.write(`Denied by user: ${name}`);
    process.exit(2);
  }
}
