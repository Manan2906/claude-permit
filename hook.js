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
  // Claude-themed TopMost form — dark bg, orange Allow, subtle Deny, auto-closes on timeout
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',

    // — Form —
    '$f=New-Object Windows.Forms.Form',
    '$f.Text="Claude Permit"',
    '$f.Size=New-Object Drawing.Size(440,230)',
    '$f.StartPosition="CenterScreen"',
    '$f.TopMost=$true',
    '$f.FormBorderStyle="FixedDialog"',
    '$f.MaximizeBox=$false;$f.MinimizeBox=$false',
    '$f.BackColor=[Drawing.Color]::FromArgb(24,24,27)',   // dark zinc

    // — Icon strip (left accent bar) —
    '$bar=New-Object Windows.Forms.Panel',
    '$bar.Size=New-Object Drawing.Size(4,230)',
    '$bar.Location=New-Object Drawing.Point(0,0)',
    '$bar.BackColor=[Drawing.Color]::FromArgb(217,119,6)', // Claude orange
    '$f.Controls.Add($bar)',

    // — Title label —
    '$title=New-Object Windows.Forms.Label',
    '$title.Text="Claude needs permission"',
    '$title.Location=New-Object Drawing.Point(20,18)',
    '$title.Size=New-Object Drawing.Size(390,22)',
    '$title.Font=New-Object Drawing.Font("Segoe UI Semibold",11,[Drawing.FontStyle]::Bold)',
    '$title.ForeColor=[Drawing.Color]::FromArgb(250,250,250)',
    '$title.BackColor=[Drawing.Color]::Transparent',
    '$f.Controls.Add($title)',

    // — Detail label —
    '$l=New-Object Windows.Forms.Label',
    '$l.Text=$env:CP_M',
    '$l.Location=New-Object Drawing.Point(20,48)',
    '$l.Size=New-Object Drawing.Size(395,70)',
    '$l.Font=New-Object Drawing.Font("Segoe UI",9)',
    '$l.ForeColor=[Drawing.Color]::FromArgb(161,161,170)', // zinc-400
    '$l.BackColor=[Drawing.Color]::Transparent',
    '$f.Controls.Add($l)',

    // — Divider —
    '$div=New-Object Windows.Forms.Panel',
    '$div.Size=New-Object Drawing.Size(440,1)',
    '$div.Location=New-Object Drawing.Point(0,128)',
    '$div.BackColor=[Drawing.Color]::FromArgb(39,39,42)',
    '$f.Controls.Add($div)',

    // — Allow button (Claude orange) —
    '$y=New-Object Windows.Forms.Button',
    '$y.Text="✓  Allow"',
    '$y.Size=New-Object Drawing.Size(110,36)',
    '$y.Location=New-Object Drawing.Point(200,155)',
    '$y.BackColor=[Drawing.Color]::FromArgb(217,119,6)',
    '$y.ForeColor=[Drawing.Color]::White',
    '$y.FlatStyle="Flat"',
    '$y.Font=New-Object Drawing.Font("Segoe UI",9,[Drawing.FontStyle]::Bold)',
    '$y.FlatAppearance.BorderSize=0',
    '$y.Add_Click({$f.Tag=1;$f.Close()})',
    '$f.Controls.Add($y)',

    // — Deny button (muted) —
    '$n=New-Object Windows.Forms.Button',
    '$n.Text="✕  Deny"',
    '$n.Size=New-Object Drawing.Size(110,36)',
    '$n.Location=New-Object Drawing.Point(320,155)',
    '$n.BackColor=[Drawing.Color]::FromArgb(39,39,42)',
    '$n.ForeColor=[Drawing.Color]::FromArgb(161,161,170)',
    '$n.FlatStyle="Flat"',
    '$n.Font=New-Object Drawing.Font("Segoe UI",9)',
    '$n.FlatAppearance.BorderSize=1',
    '$n.FlatAppearance.BorderColor=[Drawing.Color]::FromArgb(63,63,70)',
    '$n.Add_Click({$f.Tag=0;$f.Close()})',
    '$f.Controls.Add($n)',

    '$f.AcceptButton=$y;$f.CancelButton=$n',

    // — Timeout timer —
    `$tmr=New-Object Windows.Forms.Timer;$tmr.Interval=${t * 1000}`,
    '$tmr.Add_Tick({$f.Tag=0;$f.Close()})',
    '$tmr.Start()',

    '$f.ShowDialog()|Out-Null',
    'if($f.Tag -eq 1){exit 0}else{exit 1}'
  ].join(';');
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    env: { ...process.env, CP_M: msg },
    timeout: (t + 10) * 1000, windowsHide: false
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
