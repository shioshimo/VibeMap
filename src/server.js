const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');
const core = require('./core');
const { SERVER_PORT, SERVER_HOST } = require('./launcher');

const PUBLIC_DIR = path.join(__dirname, 'public');
const sseClients = new Set();
let activeWatcher = null;
let activeWatchedRoot = null;
let watchDebounceTimer = null;

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function setupDirectoryWatch(projectRoot) {
  if (!projectRoot) return;
  const norm = core.normalizeProjectRoot(projectRoot);
  if (activeWatchedRoot === norm && activeWatcher) return;

  if (activeWatcher) {
    try {
      activeWatcher.close();
    } catch {}
    activeWatcher = null;
  }

  const vibemapDir = path.join(norm, '.vibemap');
  if (!fs.existsSync(vibemapDir)) return;
  activeWatchedRoot = norm;

  try {
    activeWatcher = fs.watch(vibemapDir, { recursive: false }, (eventType, filename) => {
      if (!filename || !String(filename).endsWith('.json')) return;
      if (watchDebounceTimer) clearTimeout(watchDebounceTimer);
      watchDebounceTimer = setTimeout(() => {
        broadcastSSE('map-updated', {
          projectRoot: norm,
          time: Date.now()
        });
      }, 250);
    });
  } catch {
    // Ignore watch errors
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || '/';

  try {
    if (pathname === '/api/ping' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, time: Date.now() });
    }

    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (pathname === '/api/projects' && req.method === 'GET') {
      const reg = core.loadRegistry();
      return sendJson(res, 200, reg);
    }

    if (pathname === '/api/projects/select' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.projectRoot) {
        return sendJson(res, 400, { error: 'projectRoot is required' });
      }
      const root = core.normalizeProjectRoot(body.projectRoot);
      const reg = core.setActiveProject(root, !!body.triggerPopup);
      setupDirectoryWatch(root);
      const state = core.getProjectFullState(root);
      broadcastSSE('project-switched', { projectRoot: root });
      return sendJson(res, 200, { registry: reg, state });
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      const reg = core.loadRegistry();
      const targetRoot =
        parsedUrl.query.projectRoot ||
        reg.activeProjectRoot ||
        (reg.projects[0] && reg.projects[0].rootPath) ||
        path.join(__dirname, '..');
      const norm = core.normalizeProjectRoot(targetRoot);
      setupDirectoryWatch(norm);
      const state = core.getProjectFullState(norm);
      return sendJson(res, 200, state);
    }

    if (pathname === '/api/folder-nodes' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const root = core.normalizeProjectRoot(body.projectRoot || core.loadRegistry().activeProjectRoot);
      const nodes = Array.isArray(body.nodes) ? body.nodes : [body];
      core.upsertFolderNodes(root, nodes, body.agentName || 'User / UI');
      const state = core.getProjectFullState(root);
      broadcastSSE('map-updated', { projectRoot: root });
      return sendJson(res, 200, state);
    }

    if (pathname === '/api/architecture' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const root = core.normalizeProjectRoot(body.projectRoot || core.loadRegistry().activeProjectRoot);
      core.updateArchitecture(root, body, body.agentName || 'User / UI');
      const state = core.getProjectFullState(root);
      broadcastSSE('map-updated', { projectRoot: root });
      return sendJson(res, 200, state);
    }

    if (pathname === '/api/architecture/positions' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const root = core.normalizeProjectRoot(body.projectRoot || core.loadRegistry().activeProjectRoot);
      core.updateNodePositions(root, body.positions || {});
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/open-folder' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const root = core.normalizeProjectRoot(body.projectRoot || core.loadRegistry().activeProjectRoot);
      const rel = core.normalizeRelPath(body.path || '.');
      const absTarget = rel === '.' ? root : path.join(root, rel);
      if (fs.existsSync(absTarget)) {
        const st = fs.statSync(absTarget);
        if (st.isDirectory()) {
          spawn('explorer.exe', [absTarget], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn('explorer.exe', [`/select,${absTarget}`], { detached: true, stdio: 'ignore' }).unref();
        }
        return sendJson(res, 200, { ok: true, opened: absTarget });
      }
      return sendJson(res, 404, { error: '路径在磁盘上不存在', target: absTarget });
    }

    if (pathname === '/api/notify' && req.method === 'POST') {
      const body = await readJsonBody(req);
      broadcastSSE(body.type || 'map-updated', body);
      return sendJson(res, 200, { ok: true });
    }

    // Serve static frontend files
    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404);
    res.end('Not Found');
  } catch (err) {
    sendJson(res, 500, { error: err.message || String(err) });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    process.exit(0);
  }
});

server.listen(SERVER_PORT, SERVER_HOST, () => {
  const reg = core.loadRegistry();
  if (reg.activeProjectRoot) {
    setupDirectoryWatch(reg.activeProjectRoot);
  }
  console.log(`VibeMap Server listening at http://${SERVER_HOST}:${SERVER_PORT}`);
});
