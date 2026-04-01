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

function saveAlwaysAllow(folder) {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!c.autoAllow.folders) c.autoAllow.folders = [];
    const norm = folder.replace(/\\/g, '/');
    if (!c.autoAllow.folders.includes(norm)) {
      c.autoAllow.folders.push(norm);
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));
    }
  } catch {}
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
  if (allow.folders) {
    const cwd = norm(process.cwd());
    for (const f of allow.folders) { if (cwd.startsWith(norm(f))) return true; }
  }
  if (allow.tools && allow.tools.includes(name)) return true;
  if (name === 'Bash' && allow.commands) {
    const cmd = cmdLine(input);
    for (const p of allow.commands) { if (glob(cmd, p)) return true; }
  }
  return false;
}

// --- Notify: returns 'once' | 'always' | 'deny' ---
function ask(name, input) {
  const t = cfg().notification?.timeoutSeconds || 30;
  const detail = name === 'Bash' ? cmdLine(input) : (input.file_path || input.pattern || JSON.stringify(input).slice(0, 120));
  const msg = `Tool: ${name}\n${trunc(detail, 200)}`;
  const plat = os.platform();
  try {
    if (plat === 'win32') return askWin(msg, t);
    if (plat === 'darwin') return askMac(msg, t);
    return askLinux(msg, t);
  } catch {
    return cfg().notification?.defaultOnTimeout === 'allow' ? 'once' : 'deny';
  }
}

function askWin(msg, t) {
  // Returns: exit 0 = Allow Once, exit 2 = Allow Always, exit 1 = Deny
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',

    // Form
    '$f=New-Object Windows.Forms.Form',
    '$f.Text="Claude Permit"',
    '$f.Size=New-Object Drawing.Size(520,240)',
    '$f.StartPosition="CenterScreen"',
    '$f.TopMost=$true',
    '$f.FormBorderStyle="FixedDialog"',
    '$f.MaximizeBox=$false;$f.MinimizeBox=$false',
    '$f.BackColor=[Drawing.Color]::FromArgb(24,24,27)',

    // Left orange accent bar
    '$bar=New-Object Windows.Forms.Panel',
    '$bar.Size=New-Object Drawing.Size(4,240)',
    '$bar.Location=New-Object Drawing.Point(0,0)',
    '$bar.BackColor=[Drawing.Color]::FromArgb(217,119,6)',
    '$f.Controls.Add($bar)',

    // Title
    '$title=New-Object Windows.Forms.Label',
    '$title.Text="Claude needs permission"',
    '$title.Location=New-Object Drawing.Point(20,18)',
    '$title.Size=New-Object Drawing.Size(480,22)',
    '$title.Font=New-Object Drawing.Font("Segoe UI",11,[Drawing.FontStyle]::Bold)',
    '$title.ForeColor=[Drawing.Color]::FromArgb(250,250,250)',
    '$title.BackColor=[Drawing.Color]::Transparent',
    '$f.Controls.Add($title)',

    // Detail
    '$l=New-Object Windows.Forms.Label',
    '$l.Text=$env:CP_M',
    '$l.Location=New-Object Drawing.Point(20,48)',
    '$l.Size=New-Object Drawing.Size(475,70)',
    '$l.Font=New-Object Drawing.Font("Segoe UI",9)',
    '$l.ForeColor=[Drawing.Color]::FromArgb(161,161,170)',
    '$l.BackColor=[Drawing.Color]::Transparent',
    '$f.Controls.Add($l)',

    // Divider
    '$div=New-Object Windows.Forms.Panel',
    '$div.Size=New-Object Drawing.Size(520,1)',
    '$div.Location=New-Object Drawing.Point(0,130)',
    '$div.BackColor=[Drawing.Color]::FromArgb(39,39,42)',
    '$f.Controls.Add($div)',

    // Allow Once (orange)
    '$y=New-Object Windows.Forms.Button',
    '$y.Text="✓ Allow Once"',
    '$y.Size=New-Object Drawing.Size(138,36)',
    '$y.Location=New-Object Drawing.Point(155,160)',
    '$y.BackColor=[Drawing.Color]::FromArgb(217,119,6)',
    '$y.ForeColor=[Drawing.Color]::White',
    '$y.FlatStyle="Flat"',
    '$y.Font=New-Object Drawing.Font("Segoe UI",9,[Drawing.FontStyle]::Bold)',
    '$y.FlatAppearance.BorderSize=0',
    '$y.Add_Click({$f.Tag=1;$f.Close()})',
    '$f.Controls.Add($y)',

    // Allow Always (darker teal/green)
    '$a=New-Object Windows.Forms.Button',
    '$a.Text="★ Always for Project"',
    '$a.Size=New-Object Drawing.Size(155,36)',
    '$a.Location=New-Object Drawing.Point(303,160)',
    '$a.BackColor=[Drawing.Color]::FromArgb(20,83,45)',
    '$a.ForeColor=[Drawing.Color]::FromArgb(134,239,172)',
    '$a.FlatStyle="Flat"',
    '$a.Font=New-Object Drawing.Font("Segoe UI",9,[Drawing.FontStyle]::Bold)',
    '$a.FlatAppearance.BorderSize=0',
    '$a.Add_Click({$f.Tag=2;$f.Close()})',
    '$f.Controls.Add($a)',

    // Deny (muted)
    '$n=New-Object Windows.Forms.Button',
    '$n.Text="✕ Deny"',
    '$n.Size=New-Object Drawing.Size(100,36)',
    '$n.Location=New-Object Drawing.Point(46,160)',
    '$n.BackColor=[Drawing.Color]::FromArgb(39,39,42)',
    '$n.ForeColor=[Drawing.Color]::FromArgb(161,161,170)',
    '$n.FlatStyle="Flat"',
    '$n.Font=New-Object Drawing.Font("Segoe UI",9)',
    '$n.FlatAppearance.BorderSize=1',
    '$n.FlatAppearance.BorderColor=[Drawing.Color]::FromArgb(63,63,70)',
    '$n.Add_Click({$f.Tag=0;$f.Close()})',
    '$f.Controls.Add($n)',

    '$f.AcceptButton=$y;$f.CancelButton=$n',

    // Timeout → deny
    `$tmr=New-Object Windows.Forms.Timer;$tmr.Interval=${t * 1000}`,
    '$tmr.Add_Tick({$f.Tag=0;$f.Close()})',
    '$tmr.Start()',

    '$f.ShowDialog()|Out-Null',
    'if($f.Tag -eq 1){exit 0}elseif($f.Tag -eq 2){exit 2}else{exit 1}'
  ].join(';');

  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    env: { ...process.env, CP_M: msg },
    timeout: (t + 10) * 1000, windowsHide: false
  });

  if (r.status === 0) return 'once';
  if (r.status === 2) return 'always';
  return 'deny';
}

function askMac(msg, t) {
  const safe = msg.replace(/'/g, "\\'").replace(/"/g, '\\"');
  const r = spawnSync('osascript', ['-e',
    `display dialog "${safe}" buttons {"Deny","Allow Once","Always for Project"} default button "Allow Once" giving up after ${t}`
  ], { timeout: (t + 5) * 1000 });
  const out = r.stdout ? r.stdout.toString() : '';
  if (out.includes('Always')) return 'always';
  if (out.includes('Allow')) return 'once';
  return 'deny';
}

function askLinux(msg, t) {
  const r = spawnSync('zenity', [
    '--question', `--text=${msg}`, '--title=Claude Permit',
    '--ok-label=Allow Once', '--cancel-label=Deny', `--timeout=${t}`
  ], { timeout: (t + 5) * 1000 });
  return r.status === 0 ? 'once' : 'deny';
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
    run(data.tool_name, data.tool_input || {});
  } catch {
    process.exit(0);
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

  const decision = ask(name, tInput);
  log(name, tInput, decision.toUpperCase());

  if (decision === 'always') {
    saveAlwaysAllow(process.cwd());
    process.exit(0);
  } else if (decision === 'once') {
    process.exit(0);
  } else {
    process.stdout.write(`Denied by user: ${name}`);
    process.exit(2);
  }
}
