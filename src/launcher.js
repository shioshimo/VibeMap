const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const core = require('./core');

const SERVER_PORT = 19527;
const SERVER_HOST = '127.0.0.1';

function spawnDetachedWindows(filePath, argsArray, workingDir, hidden = false) {
  try {
    const quotedArgs = (argsArray || []).map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
    const cmdLine = `"${filePath}" ${quotedArgs}`.trim();
    const escCmd = cmdLine.replace(/'/g, "''");
    const escDir = (workingDir || process.cwd()).replace(/'/g, "''");
    const showWin = hidden ? 0 : 1;
    const psScript = `
      $si = New-CimInstance -ClientOnly -ClassName Win32_ProcessStartup -Property @{ ShowWindow = [uint16]${showWin} }
      Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = '${escCmd}'
        CurrentDirectory = '${escDir}'
        ProcessStartupInformation = $si
      } | Out-Null
    `;
    execFileSync('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript], {
      stdio: 'ignore',
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

function pingServer(timeoutMs = 600) {
  return new Promise((resolve) => {
    const req = http.get(`http://${SERVER_HOST}:${SERVER_PORT}/api/ping`, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function notifyServer(eventPayload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(eventPayload || {});
    const req = http.request(
      {
        hostname: SERVER_HOST,
        port: SERVER_PORT,
        path: '/api/notify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 800
      },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

async function ensureServerRunning() {
  const alive = await pingServer();
  if (alive) return true;

  const serverScript = path.join(__dirname, 'server.js');
  const rootDir = path.join(__dirname, '..');

  if (process.platform === 'win32') {
    spawnDetachedWindows(process.execPath, [serverScript], rootDir, true);
  } else {
    const child = spawn(process.execPath, [serverScript], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
  }

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 150));
    if (await pingServer()) return true;
  }
  return false;
}

async function openDesktopWindow(projectRoot) {
  if (projectRoot) {
    core.setActiveProject(projectRoot, true);
  }
  await ensureServerRunning();

  await notifyServer({
    type: 'window-open',
    projectRoot: projectRoot ? core.normalizeProjectRoot(projectRoot) : null
  });

  const rootDir = path.join(__dirname, '..');
  const exePath = path.join(rootDir, 'VibeMap.exe');
  if (fs.existsSync(exePath)) {
    if (process.platform === 'win32') {
      const args = projectRoot ? [core.normalizeProjectRoot(projectRoot)] : [];
      spawnDetachedWindows(exePath, args, rootDir, false);
    } else {
      const args = projectRoot ? [core.normalizeProjectRoot(projectRoot)] : [];
      const child = spawn(exePath, args, {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }
    return { launched: 'VibeMap.exe', url: `http://${SERVER_HOST}:${SERVER_PORT}` };
  }

  return { launched: 'web-server', url: `http://${SERVER_HOST}:${SERVER_PORT}` };
}

module.exports = {
  SERVER_PORT,
  SERVER_HOST,
  pingServer,
  notifyServer,
  ensureServerRunning,
  openDesktopWindow
};
