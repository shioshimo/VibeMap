const fs = require('fs');
const path = require('path');
const os = require('os');

const GLOBAL_DIR = path.join(os.homedir(), '.vibemap');
const REGISTRY_FILE = path.join(GLOBAL_DIR, 'registry.json');

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.venv',
  'venv',
  'env',
  'dist',
  'build',
  'out',
  'bin',
  'obj',
  'runtimes',
  '.vs',
  '.idea',
  '.vscode',
  '.vibemap',
  '.DS_Store',
  'Thumbs.db'
]);

function isIgnoredBuildArtifact(name) {
  if (IGNORED_NAMES.has(name)) return true;
  if (name.startsWith('.git')) return true;
  const lower = name.toLowerCase();
  if (
    lower.endsWith('.webview2') ||
    lower.startsWith('microsoft.web.webview2') ||
    lower === 'ebwebview' ||
    lower.endsWith('.dll') ||
    lower.endsWith('.exe') ||
    lower.endsWith('.pdb') ||
    lower.endsWith('.log') ||
    lower.endsWith('.deps.json') ||
    lower.endsWith('.runtimeconfig.json') ||
    lower === 'package-lock.json'
  ) {
    return true;
  }
  return false;
}

function ensureGlobalDir() {
  if (!fs.existsSync(GLOBAL_DIR)) {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  }
}

function normalizeRelPath(relPath) {
  if (!relPath || relPath === '.' || relPath === '/' || relPath === '\\') {
    return '.';
  }
  const cleaned = String(relPath)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  return cleaned || '.';
}

function normalizeProjectRoot(projectRoot) {
  return path.resolve(String(projectRoot || process.cwd()));
}

function loadRegistry() {
  ensureGlobalDir();
  if (!fs.existsSync(REGISTRY_FILE)) {
    const initial = {
      activeProjectRoot: null,
      windowSignal: 0,
      projects: []
    };
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.projects)) parsed.projects = [];
    return parsed;
  } catch {
    return { activeProjectRoot: null, windowSignal: 0, projects: [] };
  }
}

function saveRegistry(reg) {
  ensureGlobalDir();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2), 'utf8');
}

function getMapFilePath(projectRoot) {
  const root = normalizeProjectRoot(projectRoot);
  return path.join(root, '.vibemap', 'map.json');
}

function createDefaultMap(projectRoot) {
  const root = normalizeProjectRoot(projectRoot);
  const folderName = path.basename(root) || '未命名项目';
  const now = new Date().toISOString();
  return {
    version: '1.0',
    projectName: folderName,
    purpose: '尚未填写项目用途。AI 或你可以随时在架构白板右上角补充说明。',
    implementationSummary: '尚未填写实现方式概述。让 AI 调用 VibeMap 工具即可自动生成架构连线与目录说明。',
    techStack: [],
    updatedAt: now,
    updatedBy: 'System Init',
    folderNodes: {
      '.': {
        title: folderName,
        brief: `${folderName} 项目根目录`,
        details: {
          summary: '项目顶层工作目录。展开下方文件夹查看各模块职责。',
          deployLocation: '本地开发目录',
          dependencies: [],
          ports: [],
          debugTip: '将鼠标移到文件夹上看一句话简介，右键点击查看详细卡片。'
        },
        snapshotMtime: Date.now(),
        updatedAt: now
      }
    },
    architecture: {
      nodes: [],
      edges: [],
      flows: []
    },
    history: [
      {
        time: now,
        agent: 'System',
        summary: '初始化空白项目地图'
      }
    ]
  };
}

function registerProject(projectRoot, projectNameHint) {
  const root = normalizeProjectRoot(projectRoot);
  const reg = loadRegistry();
  const now = new Date().toISOString();
  let existing = reg.projects.find(
    (p) => p.rootPath.toLowerCase() === root.toLowerCase()
  );
  if (!existing) {
    existing = {
      id: Buffer.from(root.toLowerCase()).toString('base64url').slice(0, 16),
      name: projectNameHint || path.basename(root),
      rootPath: root,
      addedAt: now,
      updatedAt: now
    };
    reg.projects.unshift(existing);
  } else {
    if (projectNameHint) existing.name = projectNameHint;
    existing.updatedAt = now;
  }
  if (!reg.activeProjectRoot) {
    reg.activeProjectRoot = root;
  }
  saveRegistry(reg);
  return existing;
}

function setActiveProject(projectRoot, triggerWindowPopup = false) {
  const root = normalizeProjectRoot(projectRoot);
  registerProject(root);
  const reg = loadRegistry();
  reg.activeProjectRoot = root;
  if (triggerWindowPopup) {
    reg.windowSignal = Date.now();
  }
  saveRegistry(reg);
  return reg;
}

function loadProjectMap(projectRoot, autoCreate = true) {
  const root = normalizeProjectRoot(projectRoot);
  const mapFile = getMapFilePath(root);
  if (!fs.existsSync(mapFile)) {
    if (!autoCreate) return null;
    const def = createDefaultMap(root);
    saveProjectMap(root, def);
    return def;
  }
  try {
    const raw = fs.readFileSync(mapFile, 'utf8');
    const data = JSON.parse(raw);
    if (!data.folderNodes) data.folderNodes = {};
    if (!data.architecture) data.architecture = { nodes: [], edges: [], flows: [] };
    if (!Array.isArray(data.architecture.nodes)) data.architecture.nodes = [];
    if (!Array.isArray(data.architecture.edges)) data.architecture.edges = [];
    if (!Array.isArray(data.architecture.flows)) data.architecture.flows = [];
    if (!Array.isArray(data.history)) data.history = [];
    registerProject(root, data.projectName);
    return data;
  } catch (err) {
    const def = createDefaultMap(root);
    return def;
  }
}

function saveProjectMap(projectRoot, mapData) {
  const root = normalizeProjectRoot(projectRoot);
  const mapDir = path.join(root, '.vibemap');
  if (!fs.existsSync(mapDir)) {
    fs.mkdirSync(mapDir, { recursive: true });
  }
  mapData.updatedAt = new Date().toISOString();
  fs.writeFileSync(getMapFilePath(root), JSON.stringify(mapData, null, 2), 'utf8');
  registerProject(root, mapData.projectName);
  return mapData;
}

/**
 * Recursively scan filesystem up to maxDepth and compute latest mtime
 */
function scanFsTree(absDir, rootDir, mapNodes, currentDepth = 0, maxDepth = 4) {
  const relPath = normalizeRelPath(path.relative(rootDir, absDir));
  const name = relPath === '.' ? path.basename(rootDir) : path.basename(absDir);

  let stat;
  try {
    stat = fs.statSync(absDir);
  } catch {
    return null;
  }

  const isDirectory = stat.isDirectory();
  let latestMtime = isDirectory ? 0 : (stat.mtimeMs || 0);
  const children = [];

  if (isDirectory && currentDepth < maxDepth) {
    let entries = [];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      entries = [];
    }

    // Sort directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    for (const entry of entries) {
      if (isIgnoredBuildArtifact(entry.name)) continue;
      const childAbs = path.join(absDir, entry.name);
      const childNode = scanFsTree(childAbs, rootDir, mapNodes, currentDepth + 1, maxDepth);
      if (childNode) {
        children.push(childNode);
        if (childNode.syncStatus !== 'unmapped' && childNode.latestMtime > latestMtime) {
          latestMtime = childNode.latestMtime;
        }
      }
    }
  }

  const mapped = mapNodes[relPath] || null;
  let syncStatus = 'unmapped';
  if (mapped && mapped.brief) {
    const snap = mapped.snapshotMtime || 0;
    // Allow 10 seconds grace window around when AI writes code + updates map
    if (snap > 0 && latestMtime > snap + 10000) {
      syncStatus = 'stale';
    } else {
      syncStatus = 'synced';
    }
  }

  return {
    path: relPath,
    name,
    isDirectory,
    latestMtime,
    syncStatus,
    title: (mapped && mapped.title) || name,
    brief: (mapped && mapped.brief) || '',
    details: (mapped && mapped.details) || {
      summary: '',
      deployLocation: '',
      dependencies: [],
      ports: [],
      debugTip: ''
    },
    updatedAt: (mapped && mapped.updatedAt) || null,
    updatedBy: (mapped && mapped.updatedBy) || null,
    children
  };
}

/**
 * Build full state combining map.json + live filesystem verification + ghost nodes check
 */
function getProjectFullState(projectRoot) {
  const root = normalizeProjectRoot(projectRoot);
  const existsOnDisk = fs.existsSync(root);
  const mapData = loadProjectMap(root, true);
  const mapNodes = mapData.folderNodes || {};

  let tree = null;
  const seenPaths = new Set();

  function collectPaths(node) {
    if (!node) return;
    seenPaths.add(node.path);
    if (Array.isArray(node.children)) {
      node.children.forEach(collectPaths);
    }
  }

  if (existsOnDisk) {
    tree = scanFsTree(root, root, mapNodes, 0, 5);
    collectPaths(tree);
  }

  // Check for ghost nodes (in map.json but deleted on disk)
  const ghostNodes = [];
  for (const [relKey, val] of Object.entries(mapNodes)) {
    const normKey = normalizeRelPath(relKey);
    if (!seenPaths.has(normKey)) {
      const targetAbs = path.join(root, normKey === '.' ? '' : normKey);
      if (!fs.existsSync(targetAbs)) {
        ghostNodes.push({
          path: normKey,
          name: path.basename(normKey),
          isDirectory: false,
          syncStatus: 'missing',
          title: val.title || path.basename(normKey),
          brief: val.brief || '',
          details: val.details || {},
          children: []
        });
      }
    }
  }

  // Compute summary stats
  let totalItems = 0;
  let syncedCount = 0;
  let staleCount = 0;
  let unmappedCount = 0;

  function countStats(node) {
    if (!node) return;
    totalItems++;
    if (node.syncStatus === 'synced') syncedCount++;
    else if (node.syncStatus === 'stale') staleCount++;
    else if (node.syncStatus === 'unmapped') unmappedCount++;
    if (Array.isArray(node.children)) {
      node.children.forEach(countStats);
    }
  }
  countStats(tree);

  return {
    projectRoot: root,
    existsOnDisk,
    map: mapData,
    tree,
    ghostNodes,
    stats: {
      totalItems,
      syncedCount,
      staleCount,
      unmappedCount,
      missingCount: ghostNodes.length
    }
  };
}

/**
 * Get latest mtime for a relative path inside projectRoot
 */
function getTargetLatestMtime(projectRoot, relPath) {
  const root = normalizeProjectRoot(projectRoot);
  const norm = normalizeRelPath(relPath);
  const abs = norm === '.' ? root : path.join(root, norm);
  if (!fs.existsSync(abs)) return Date.now();
  try {
    const st = fs.statSync(abs);
    let maxMtime = st.mtimeMs || Date.now();
    if (st.isDirectory()) {
      const entries = fs.readdirSync(abs, { withFileTypes: true });
      for (const e of entries) {
        if (IGNORED_NAMES.has(e.name)) continue;
        try {
          const cst = fs.statSync(path.join(abs, e.name));
          if (cst.mtimeMs > maxMtime) maxMtime = cst.mtimeMs;
        } catch {}
      }
    }
    return maxMtime;
  } catch {
    return Date.now();
  }
}

/**
 * Upsert one or more folder/file annotations
 */
function upsertFolderNodes(projectRoot, nodesArray, agentName = 'AI Agent') {
  const root = normalizeProjectRoot(projectRoot);
  const mapData = loadProjectMap(root, true);
  const now = new Date().toISOString();

  for (const item of nodesArray) {
    const rel = normalizeRelPath(item.path);
    const existing = mapData.folderNodes[rel] || {};
    const details = Object.assign(
      {
        summary: '',
        deployLocation: '',
        dependencies: [],
        ports: [],
        debugTip: ''
      },
      existing.details || {},
      item.details || {}
    );

    mapData.folderNodes[rel] = {
      title: item.title || existing.title || (rel === '.' ? mapData.projectName : path.basename(rel)),
      brief: item.brief !== undefined ? String(item.brief).slice(0, 120) : (existing.brief || ''),
      details: {
        summary: String(details.summary || '').slice(0, 360),
        deployLocation: String(details.deployLocation || '').slice(0, 120),
        dependencies: Array.isArray(details.dependencies) ? details.dependencies : [],
        ports: Array.isArray(details.ports) ? details.ports : [],
        debugTip: String(details.debugTip || '').slice(0, 200)
      },
      snapshotMtime: getTargetLatestMtime(root, rel) + 2000,
      updatedAt: now,
      updatedBy: agentName
    };
  }

  mapData.updatedBy = agentName;
  mapData.history.unshift({
    time: now,
    agent: agentName,
    summary: `更新了 ${nodesArray.length} 个目录/文件节点说明 (${nodesArray.map((n) => n.path).slice(0, 3).join(', ')})`
  });
  mapData.history = mapData.history.slice(0, 30);

  return saveProjectMap(root, mapData);
}

/**
 * Update architecture whiteboard while preserving user-dragged node coordinates if not explicitly overridden
 */
function updateArchitecture(projectRoot, payload, agentName = 'AI Agent') {
  const root = normalizeProjectRoot(projectRoot);
  const mapData = loadProjectMap(root, true);
  const now = new Date().toISOString();

  if (payload.projectName) mapData.projectName = payload.projectName;
  if (payload.purpose) mapData.purpose = payload.purpose;
  if (payload.implementationSummary) mapData.implementationSummary = payload.implementationSummary;
  if (Array.isArray(payload.techStack)) mapData.techStack = payload.techStack;

  const existingPos = new Map();
  for (const oldNode of mapData.architecture.nodes || []) {
    if (oldNode.id && typeof oldNode.x === 'number' && typeof oldNode.y === 'number') {
      existingPos.set(oldNode.id, { x: oldNode.x, y: oldNode.y, lockedByUser: !!oldNode.lockedByUser });
    }
  }

  if (Array.isArray(payload.nodes)) {
    mapData.architecture.nodes = payload.nodes.map((n, idx) => {
      const prev = existingPos.get(n.id);
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const defaultX = 90 + col * 310;
      const defaultY = 110 + row * 190;

      // Preserve user-dragged position if lockedByUser
      let x = typeof n.x === 'number' ? n.x : (prev ? prev.x : defaultX);
      let y = typeof n.y === 'number' ? n.y : (prev ? prev.y : defaultY);
      if (prev && prev.lockedByUser && !payload.forceResetLayout) {
        x = prev.x;
        y = prev.y;
      }

      return {
        id: String(n.id),
        label: String(n.label || n.id),
        category: n.category || 'service',
        folderPath: n.folderPath ? normalizeRelPath(n.folderPath) : '',
        host: n.host || '',
        port: n.port || '',
        brief: String(n.brief || '').slice(0, 120),
        details: Object.assign(
          {
            summary: '',
            deployLocation: n.host || '',
            dependencies: [],
            ports: n.port ? [n.port] : [],
            debugTip: ''
          },
          n.details || {}
        ),
        x,
        y,
        lockedByUser: prev ? prev.lockedByUser : false
      };
    });
  }

  if (Array.isArray(payload.edges)) {
    mapData.architecture.edges = payload.edges.map((e, idx) => ({
      id: e.id || `edge-${idx + 1}`,
      from: String(e.from),
      to: String(e.to),
      label: String(e.label || ''),
      protocol: String(e.protocol || '')
    }));
  }

  if (Array.isArray(payload.flows)) {
    mapData.architecture.flows = payload.flows;
  }

  mapData.updatedBy = agentName;
  mapData.history.unshift({
    time: now,
    agent: agentName,
    summary: payload.changeNote || '更新了架构讲解白板与模块连线'
  });
  mapData.history = mapData.history.slice(0, 30);

  return saveProjectMap(root, mapData);
}

/**
 * Save user-dragged positions on the architecture whiteboard
 */
function updateNodePositions(projectRoot, positionsMap) {
  const root = normalizeProjectRoot(projectRoot);
  const mapData = loadProjectMap(root, true);
  for (const node of mapData.architecture.nodes || []) {
    if (positionsMap[node.id]) {
      node.x = Math.round(positionsMap[node.id].x);
      node.y = Math.round(positionsMap[node.id].y);
      node.lockedByUser = true;
    }
  }
  return saveProjectMap(root, mapData);
}

module.exports = {
  GLOBAL_DIR,
  REGISTRY_FILE,
  normalizeRelPath,
  normalizeProjectRoot,
  loadRegistry,
  saveRegistry,
  registerProject,
  setActiveProject,
  loadProjectMap,
  saveProjectMap,
  getProjectFullState,
  upsertFolderNodes,
  updateArchitecture,
  updateNodePositions
};
