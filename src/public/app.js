const state = {
  projects: [],
  currentProjectRoot: null,
  mapData: null,
  mode: 'folders',
  expandedPaths: new Set(['.']),
  selectedPath: null,
  hoveredPath: null,
  pan: { x: 0, y: 0 },
  zoom: 1,
  isPanning: false,
  panStart: { x: 0, y: 0 },
  nodePositions: new Map(),
  archPositions: new Map(),
  flowTimer: null,
  flowStepIndex: -1
};

const el = {
  projectDropdown: document.getElementById('projectDropdown'),
  projectTrigger: document.getElementById('projectTrigger'),
  projectTriggerLabel: document.getElementById('projectTriggerLabel'),
  projectMenu: document.getElementById('projectMenu'),
  tabFolders: document.getElementById('tabFolders'),
  tabArch: document.getElementById('tabArch'),
  canvasViewport: document.getElementById('canvasViewport'),
  canvasPan: document.getElementById('canvasPan'),
  canvasStage: document.getElementById('canvasStage'),
  canvasEdges: document.getElementById('canvasEdges'),
  canvasNodes: document.getElementById('canvasNodes'),
  hoverIdle: document.getElementById('hoverIdle'),
  hoverActive: document.getElementById('hoverActive'),
  hoverPath: document.getElementById('hoverPath'),
  hoverTitle: document.getElementById('hoverTitle'),
  hoverBrief: document.getElementById('hoverBrief'),
  btnZoomIn: document.getElementById('btnZoomIn'),
  btnZoomOut: document.getElementById('btnZoomOut'),
  btnZoomReset: document.getElementById('btnZoomReset'),
  zoomLabel: document.getElementById('zoomLabel'),
  detailDrawer: document.getElementById('detailDrawer'),
  drawerPath: document.getElementById('drawerPath'),
  drawerSyncBadge: document.getElementById('drawerSyncBadge'),
  drawerTitle: document.getElementById('drawerTitle'),
  drawerBrief: document.getElementById('drawerBrief'),
  drawerDetail: document.getElementById('drawerDetail'),
  drawerDeploy: document.getElementById('drawerDeploy'),
  drawerPort: document.getElementById('drawerPort'),
  drawerDepsSection: document.getElementById('drawerDepsSection'),
  drawerDeps: document.getElementById('drawerDeps'),
  drawerFilesSection: document.getElementById('drawerFilesSection'),
  drawerChildren: document.getElementById('drawerChildren'),
  drawerTroubleSection: document.getElementById('drawerTroubleSection'),
  drawerTrouble: document.getElementById('drawerTrouble'),
  btnCloseDrawer: document.getElementById('btnCloseDrawer'),
  btnOpenExplorer: document.getElementById('btnOpenExplorer'),
  btnCopyNodePrompt: document.getElementById('btnCopyNodePrompt'),
  openProjectModal: document.getElementById('openProjectModal'),
  btnCloseOpenProject: document.getElementById('btnCloseOpenProject'),
  inputProjectPath: document.getElementById('inputProjectPath'),
  btnConfirmOpenProject: document.getElementById('btnConfirmOpenProject'),
  toast: document.getElementById('toast')
};

function notifyDesktop(msg) {
  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.postMessage(msg);
  }
}

function showToast(text) {
  el.toast.textContent = text;
  el.toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.toast.classList.add('hidden'), 1800);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadRegistry(preferredRoot = null) {
  const data = await apiGet('/api/projects');
  state.projects = data.projects || [];
  const urlRoot = new URLSearchParams(window.location.search).get('projectRoot');
  const firstRoot = state.projects[0] && (state.projects[0].rootPath || state.projects[0].projectRoot);
  const target = preferredRoot || urlRoot || data.activeProjectRoot || firstRoot;

  renderProjectMenu(target);
  if (target) {
    await loadProjectMap(target, true);
  }
}

function closeProjectMenu() {
  el.projectDropdown.classList.remove('open');
  el.projectMenu.classList.add('hidden');
}

function renderProjectMenu(selectedRoot) {
  el.projectMenu.innerHTML = '';
  let activeLabel = '选择项目';

  for (const p of state.projects) {
    const rPath = p.rootPath || p.projectRoot;
    const folderName = rPath.split(/[\\/]/).filter(Boolean).pop() || rPath;
    const displayName = p.name || p.projectName || folderName;
    const isActive = rPath.toLowerCase() === String(selectedRoot || '').toLowerCase();

    if (isActive) {
      activeLabel = displayName;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `project-item ${isActive ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="project-item-left">
        <span class="project-item-dot"></span>
        <span class="project-item-name">${escapeHtml(displayName)}</span>
      </div>
      <span class="project-item-dir">${escapeHtml(folderName)}</span>
    `;
    btn.addEventListener('click', async () => {
      closeProjectMenu();
      if (isActive) return;
      await apiPost('/api/projects/select', { projectRoot: rPath });
      await loadProjectMap(rPath, true);
    });
    el.projectMenu.appendChild(btn);
  }

  el.projectTriggerLabel.textContent = activeLabel;

  const div = document.createElement('div');
  div.className = 'project-menu-divider';
  el.projectMenu.appendChild(div);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'project-item project-item-add';
  addBtn.innerHTML = `
    <div class="project-item-left">
      <span class="project-item-name">+ 加载其他项目目录...</span>
    </div>
  `;
  addBtn.addEventListener('click', () => {
    closeProjectMenu();
    el.inputProjectPath.value = '';
    el.openProjectModal.classList.remove('hidden');
    setTimeout(() => el.inputProjectPath.focus(), 40);
  });
  el.projectMenu.appendChild(addBtn);
}

async function loadProjectMap(projectRoot, resetCamera = false) {
  const data = await apiGet(`/api/state?projectRoot=${encodeURIComponent(projectRoot)}`);
  state.currentProjectRoot = data.projectRoot;
  state.mapData = data;
  renderProjectMenu(data.projectRoot);

  if (resetCamera) {
    state.expandedPaths = new Set(['.']);
    state.selectedPath = null;
    el.detailDrawer.classList.add('hidden');
  }

  renderCurrentMode(resetCamera);
}

function switchMode(mode) {
  if (state.mode === mode) return;
  stopFlowAnimation();
  state.mode = mode;
  el.tabFolders.classList.toggle('active', mode === 'folders');
  el.tabArch.classList.toggle('active', mode === 'architecture');
  renderCurrentMode(true);
}

function renderCurrentMode(centerCamera = false) {
  if (!state.mapData) return;
  if (state.mode === 'folders') {
    renderFolderTree(centerCamera);
  } else {
    renderArchitectureBoard(centerCamera);
  }
}

/* =========================================================
   Mode 1: Sleek Spatial Folder Tree
   ========================================================= */
const NODE_W = 216;
const ROOT_W = 204;
const NODE_H = 60;
const COL_GAP = 290;
const ROW_GAP = 16;
const ORIGIN_X = 240;
const ORIGIN_Y = 480;

function computeTreeLayout(rootNode) {
  const positions = new Map();
  const edges = [];

  function measureSubtreeHeight(node) {
    const isExpanded = state.expandedPaths.has(node.path);
    const children = (isExpanded && node.children && node.children.length > 0) ? node.children : [];
    if (children.length === 0) {
      node._subH = NODE_H;
      return NODE_H;
    }
    let total = 0;
    for (let i = 0; i < children.length; i++) {
      total += measureSubtreeHeight(children[i]);
      if (i > 0) total += ROW_GAP;
    }
    node._subH = Math.max(NODE_H, total);
    return node._subH;
  }

  function assignCoords(node, depth, centerY) {
    const x = ORIGIN_X + depth * COL_GAP;
    const y = centerY - NODE_H / 2;
    positions.set(node.path, { x, y, depth, node });

    const isExpanded = state.expandedPaths.has(node.path);
    const children = (isExpanded && node.children && node.children.length > 0) ? node.children : [];
    if (children.length === 0) return;

    let totalH = 0;
    for (let i = 0; i < children.length; i++) {
      totalH += children[i]._subH;
      if (i > 0) totalH += ROW_GAP;
    }

    let cursorY = centerY - totalH / 2;
    for (const child of children) {
      const childCenterY = cursorY + child._subH / 2;
      edges.push({ from: node.path, to: child.path });
      assignCoords(child, depth + 1, childCenterY);
      cursorY += child._subH + ROW_GAP;
    }
  }

  measureSubtreeHeight(rootNode);
  assignCoords(rootNode, 0, ORIGIN_Y);
  return { positions, edges };
}

function getActiveAncestorSet(targetPath) {
  const set = new Set();
  if (!targetPath) return set;
  set.add('.');
  if (targetPath === '.') return set;
  const parts = targetPath.split('/');
  let acc = '';
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    set.add(acc);
  }
  return set;
}

function renderFolderTree(centerCamera = false) {
  const root = state.mapData.tree;
  if (!root) return;

  const { positions, edges } = computeTreeLayout(root);
  state.nodePositions = positions;

  const highlightTarget = state.hoveredPath || state.selectedPath;
  const activeSet = getActiveAncestorSet(highlightTarget);

  let svgHtml = `<g id="edgesGroup" transform="scale(${state.zoom})">`;
  for (const edge of edges) {
    const p1 = positions.get(edge.from);
    const p2 = positions.get(edge.to);
    if (!p1 || !p2) continue;

    const w1 = edge.from === '.' ? ROOT_W : NODE_W;
    const x1 = p1.x + w1;
    const y1 = p1.y + NODE_H / 2;
    const x2 = p2.x;
    const y2 = p2.y + NODE_H / 2;
    const dx = Math.max(44, (x2 - x1) * 0.48);

    const isActive = activeSet.has(edge.from) && activeSet.has(edge.to);
    svgHtml += `<path class="tree-edge ${isActive ? 'active' : ''}" d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}" />`;
  }
  svgHtml += `</g>`;
  el.canvasEdges.innerHTML = svgHtml;

  el.canvasNodes.innerHTML = '';
  for (const [nodePath, item] of positions.entries()) {
    const node = item.node;
    const isRoot = nodePath === '.';
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = state.expandedPaths.has(nodePath);
    const isSelected = state.selectedPath === nodePath;

    const div = document.createElement('div');
    div.className = `tree-node ${isRoot ? 'is-root' : ''} ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`;
    div.style.setProperty('--x', `${item.x}px`);
    div.style.setProperty('--y', `${item.y}px`);

    const displayName = isRoot
      ? node.name
      : (node.isDirectory ? `${node.name}/` : node.name);

    const rawSubtitle = node.title && node.title !== node.name
      ? node.title
      : (node.brief || (node.isDirectory ? '目录' : '文件'));

    let chevronHtml = '';
    if (hasChildren) {
      chevronHtml = `<span class="node-chevron">${isExpanded ? '‹' : `${node.children.length} ›`}</span>`;
    }

    div.innerHTML = `
      <div class="node-main">
        <div class="node-top-row">
          <span class="node-dot ${escapeHtml(node.syncStatus || 'synced')}"></span>
          <span class="node-name">${escapeHtml(displayName)}</span>
        </div>
        <div class="node-sub">${escapeHtml(rawSubtitle)}</div>
      </div>
      ${chevronHtml}
    `;

    div.addEventListener('mouseenter', () => {
      state.hoveredPath = nodePath;
      updateHoverBar(node);
      updateTreeEdgeHighlights();
    });

    div.addEventListener('mouseleave', () => {
      state.hoveredPath = null;
      updateHoverBar(null);
      updateTreeEdgeHighlights();
    });

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasChildren) {
        if (state.expandedPaths.has(nodePath)) {
          if (nodePath !== '.') state.expandedPaths.delete(nodePath);
        } else {
          state.expandedPaths.add(nodePath);
        }
        renderFolderTree(false);
      } else {
        openDetailDrawer(node);
      }
    });

    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDetailDrawer(node);
    });

    el.canvasNodes.appendChild(div);
  }

  if (centerCamera) {
    fitBoundsToPositions(Array.from(positions.values()).map((p) => ({
      x: p.x,
      y: p.y,
      w: p.node.path === '.' ? ROOT_W : NODE_W,
      h: NODE_H
    })));
  } else {
    applyTransform();
  }
}

function updateTreeEdgeHighlights() {
  if (state.mode !== 'folders') return;
  const root = state.mapData && state.mapData.tree;
  if (!root) return;
  const { edges } = computeTreeLayout(root);
  const highlightTarget = state.hoveredPath || state.selectedPath;
  const activeSet = getActiveAncestorSet(highlightTarget);

  const pathEls = el.canvasEdges.querySelectorAll('.tree-edge');
  edges.forEach((edge, i) => {
    if (!pathEls[i]) return;
    const isActive = activeSet.has(edge.from) && activeSet.has(edge.to);
    pathEls[i].classList.toggle('active', isActive);
  });
}

function updateHoverBar(node) {
  if (!node) {
    el.hoverIdle.classList.remove('hidden');
    el.hoverActive.classList.add('hidden');
    return;
  }
  el.hoverIdle.classList.add('hidden');
  el.hoverActive.classList.remove('hidden');

  const pathLabel = node.path === '.' ? node.name : (node.isDirectory ? `${node.path}/` : node.path);
  el.hoverPath.textContent = pathLabel;
  el.hoverTitle.textContent = node.title || node.name;
  el.hoverBrief.textContent = node.brief || '右键查看详细说明';
}

/* =========================================================
   Mode 2: True On-Canvas Architecture Whiteboard
   ========================================================= */
const ARCH_W = 236;
const ARCH_H = 92;

function renderArchitectureBoard(centerCamera = false) {
  const mapObj = (state.mapData && state.mapData.map) || {};
  const arch = mapObj.architecture || {};
  const nodes = arch.nodes || [];
  const edges = arch.edges || [];

  state.archPositions.clear();
  el.canvasNodes.innerHTML = '';
  const bounds = [];

  // 1. Render On-Canvas Whiteboard Header Notes at top of the whiteboard
  const headerLeft = document.createElement('div');
  headerLeft.className = 'wb-header-card';
  headerLeft.style.setProperty('--x', `120px`);
  headerLeft.style.setProperty('--y', `70px`);
  headerLeft.style.setProperty('--w', `560px`);

  const isPlaying = !!state.flowTimer;
  headerLeft.innerHTML = `
    <div class="wb-title-row">
      <div class="wb-big-name">${escapeHtml(mapObj.projectName || '项目架构白板')}</div>
      ${edges.length > 0 ? `<button class="flow-play-btn ${isPlaying ? 'playing' : ''}" id="btnPlayFlow">${isPlaying ? '■ 停止演示' : '▶ 演示链路'}</button>` : ''}
    </div>
    <div class="wb-how-text">${escapeHtml(mapObj.implementationSummary || '尚未填写实现方式说明')}</div>
  `;
  el.canvasNodes.appendChild(headerLeft);
  bounds.push({ x: 120, y: 70, w: 560, h: 110 });

  const playBtn = headerLeft.querySelector('#btnPlayFlow');
  if (playBtn) {
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFlowAnimation();
    });
  }

  const headerRight = document.createElement('div');
  headerRight.className = 'wb-header-card';
  headerRight.style.setProperty('--x', `710px`);
  headerRight.style.setProperty('--y', `70px`);
  headerRight.style.setProperty('--w', `340px`);
  headerRight.innerHTML = `
    <div class="wb-purpose-label">项目用途</div>
    <div class="wb-purpose-text">${escapeHtml(mapObj.purpose || '尚未填写项目用途')}</div>
  `;
  el.canvasNodes.appendChild(headerRight);
  bounds.push({ x: 710, y: 70, w: 340, h: 110 });

  // 2. Render Module Cards with generous spacing below the header
  nodes.forEach((n, idx) => {
    const rawX = typeof n.x === 'number' ? n.x : (idx % 3) * 320;
    const rawY = typeof n.y === 'number' ? n.y : Math.floor(idx / 3) * 170;

    // Stretch horizontal spacing slightly so edge pills have plenty of room
    const x = Math.round(120 + rawX * 1.15);
    const y = Math.round(230 + rawY * 1.05);

    state.archPositions.set(n.id, { x, y, node: n });
    bounds.push({ x, y, w: ARCH_W, h: ARCH_H });

    const card = document.createElement('div');
    const roleClass = n.category ? `role-${n.category}` : '';
    const isStepActive = state.flowStepIndex >= 0 && edges[state.flowStepIndex] &&
      (edges[state.flowStepIndex].from === n.id || edges[state.flowStepIndex].to === n.id);

    card.className = `arch-card ${roleClass} ${isStepActive ? 'flow-highlight' : ''}`;
    card.style.setProperty('--x', `${x}px`);
    card.style.setProperty('--y', `${y}px`);

    const titleText = n.label || n.title || n.id;
    const briefText = n.brief || n.summary || '';

    card.innerHTML = `
      <div class="arch-card-badges">
        <span class="arch-host-tag">${escapeHtml(n.host || '本机')}</span>
        ${n.port ? `<span class="arch-port-tag">${escapeHtml(n.port)}</span>` : ''}
      </div>
      <div class="arch-card-title">${escapeHtml(titleText)}</div>
      <div class="arch-card-desc">${escapeHtml(briefText)}</div>
    `;

    card.addEventListener('mouseenter', () => {
      updateHoverBar({
        path: n.port || n.host || '模块',
        name: titleText,
        title: titleText,
        brief: briefText || '点击查看关联详情'
      });
    });

    card.addEventListener('mouseleave', () => {
      updateHoverBar(null);
    });

    const openMapped = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const mapped = n.folderPath ? findTreeNodeByPath(state.mapData.tree, n.folderPath) : null;
      if (mapped && n.folderPath !== '.') {
        openDetailDrawer(mapped);
      } else {
        openDetailDrawer({
          path: n.folderPath || n.id,
          name: titleText,
          title: titleText,
          brief: briefText,
          details: n.details || {
            summary: briefText,
            deployLocation: n.host || '本机',
            ports: n.port ? [n.port] : [],
            dependencies: []
          },
          syncStatus: 'synced'
        });
      }
    };

    card.addEventListener('click', openMapped);
    card.addEventListener('contextmenu', openMapped);
    el.canvasNodes.appendChild(card);
  });

  // 3. Render SVG directional curves + compact protocol pills
  let svgHtml = `
    <defs>
      <marker id="arrowHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#B8B4A8" />
      </marker>
      <marker id="arrowHeadActive" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563EB" />
      </marker>
    </defs>
    <g id="edgesGroup" transform="scale(${state.zoom})">
  `;

  edges.forEach((edge, idx) => {
    const p1 = state.archPositions.get(edge.from);
    const p2 = state.archPositions.get(edge.to);
    if (!p1 || !p2) return;

    const c1x = p1.x + ARCH_W / 2;
    const c1y = p1.y + ARCH_H / 2;
    const c2x = p2.x + ARCH_W / 2;
    const c2y = p2.y + ARCH_H / 2;

    let x1, y1, x2, y2, cp1x, cp1y, cp2x, cp2y;
    if (Math.abs(c2x - c1x) >= Math.abs(c2y - c1y) * 1.15) {
      x1 = c2x >= c1x ? p1.x + ARCH_W : p1.x;
      y1 = c1y;
      x2 = c2x >= c1x ? p2.x : p2.x + ARCH_W;
      y2 = c2y;
      const dx = (x2 - x1) * 0.45;
      cp1x = x1 + dx;
      cp1y = y1;
      cp2x = x2 - dx;
      cp2y = y2;
    } else {
      x1 = c1x;
      y1 = c2y >= c1y ? p1.y + ARCH_H : p1.y;
      x2 = c2x;
      y2 = c2y >= c1y ? p2.y : p2.y + ARCH_H;
      const dy = (y2 - y1) * 0.45;
      cp1x = x1;
      cp1y = y1 + dy;
      cp2x = x2;
      cp2y = y2 - dy;
    }

    const isActive = state.flowStepIndex === idx;
    svgHtml += `<path class="arch-edge ${isActive ? 'active' : ''}" d="M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}" marker-end="url(#${isActive ? 'arrowHeadActive' : 'arrowHead'})" />`;

    const shortPill = edge.protocol || (edge.label ? edge.label.slice(0, 14) : '');
    if (shortPill) {
      const pillW = Math.max(66, shortPill.length * 6.8 + 16);
      const pillH = 19;
      const lx = (x1 + 3 * cp1x + 3 * cp2x + x2) / 8;
      const ly = (y1 + 3 * cp1y + 3 * cp2y + y2) / 8;

      svgHtml += `
        <g class="edge-pill-group" data-edge-idx="${idx}">
          <rect class="edge-pill-bg ${isActive ? 'active' : ''}" x="${lx - pillW / 2}" y="${ly - pillH / 2}" width="${pillW}" height="${pillH}" />
          <text class="edge-pill-text ${isActive ? 'active' : ''}" x="${lx}" y="${ly}">${escapeHtml(shortPill)}</text>
        </g>
      `;
    }
  });

  svgHtml += `</g>`;
  el.canvasEdges.innerHTML = svgHtml;

  // Bind hover on edge pills to display full edge description in bottom bar
  el.canvasEdges.querySelectorAll('.edge-pill-group').forEach((gEl) => {
    const idx = Number(gEl.getAttribute('data-edge-idx'));
    const edge = edges[idx];
    if (!edge) return;
    gEl.addEventListener('mouseenter', () => {
      updateHoverBar({
        path: edge.protocol || '调用连线',
        name: `${edge.from} → ${edge.to}`,
        title: `${edge.from} → ${edge.to}`,
        brief: edge.label || ''
      });
    });
    gEl.addEventListener('mouseleave', () => {
      updateHoverBar(null);
    });
  });

  if (centerCamera && bounds.length > 0) {
    fitBoundsToPositions(bounds, 20);
  } else {
    applyTransform();
  }
}

function toggleFlowAnimation() {
  const edges = (state.mapData && state.mapData.map && state.mapData.map.architecture && state.mapData.map.architecture.edges) || [];
  if (edges.length === 0) return;

  if (state.flowTimer) {
    stopFlowAnimation();
    renderArchitectureBoard(false);
    return;
  }

  state.flowStepIndex = 0;
  renderArchitectureBoard(false);

  state.flowTimer = setInterval(() => {
    state.flowStepIndex = (state.flowStepIndex + 1) % edges.length;
    const e = edges[state.flowStepIndex];
    if (e) {
      updateHoverBar({
        path: e.protocol || `步骤 ${state.flowStepIndex + 1}`,
        name: `${e.from} → ${e.to}`,
        title: `${e.from} → ${e.to}`,
        brief: e.label || ''
      });
    }
    renderArchitectureBoard(false);
  }, 1400);
}

function stopFlowAnimation() {
  if (state.flowTimer) {
    clearInterval(state.flowTimer);
    state.flowTimer = null;
  }
  state.flowStepIndex = -1;
}

/* =========================================================
   Detail Slide-Over Sheet (Right-Click / Leaf Click)
   ========================================================= */
function findTreeNodeByPath(node, targetPath) {
  if (!node) return null;
  if (node.path === targetPath) return node;
  for (const child of node.children || []) {
    const found = findTreeNodeByPath(child, targetPath);
    if (found) return found;
  }
  return null;
}

const SYNC_TEXT = {
  synced: '已同步',
  stale: '代码已改·待更新',
  unmapped: '未写说明',
  missing: '文件已删'
};

function openDetailDrawer(node) {
  state.selectedPath = node.path;
  updateTreeEdgeHighlights();

  const details = node.details || {};
  el.drawerPath.textContent = node.path === '.' ? './' : `./${node.path}`;
  el.drawerSyncBadge.textContent = SYNC_TEXT[node.syncStatus] || '已同步';
  el.drawerTitle.textContent = node.title || node.name;
  el.drawerBrief.textContent = node.brief || '暂无简要说明';
  el.drawerDetail.textContent = details.summary || node.brief || '暂无详细说明';
  el.drawerDeploy.textContent = details.deployLocation || '本机';

  const ports = Array.isArray(details.ports) ? details.ports.join(' / ') : (details.ports || '');
  el.drawerPort.textContent = ports || '无独立端口';

  const deps = Array.isArray(details.dependencies) ? details.dependencies : [];
  if (deps.length > 0) {
    el.drawerDepsSection.classList.remove('hidden');
    el.drawerDeps.innerHTML = deps.map((d) => `<span class="dep-chip">${escapeHtml(d)}</span>`).join('');
  } else {
    el.drawerDepsSection.classList.add('hidden');
  }

  const children = node.children || [];
  if (children.length > 0) {
    el.drawerFilesSection.classList.remove('hidden');
    el.drawerChildren.innerHTML = '';
    for (const child of children) {
      const row = document.createElement('div');
      row.className = 'child-row';
      row.innerHTML = `
        <span class="child-row-name">${escapeHtml(child.isDirectory ? `${child.name}/` : child.name)}</span>
        <span class="child-row-brief">${escapeHtml(child.title || child.brief || '')}</span>
      `;
      row.addEventListener('click', () => {
        state.expandedPaths.add(node.path);
        renderCurrentMode(false);
        openDetailDrawer(child);
      });
      el.drawerChildren.appendChild(row);
    }
  } else {
    el.drawerFilesSection.classList.add('hidden');
  }

  if (details.debugTip) {
    el.drawerTroubleSection.classList.remove('hidden');
    el.drawerTrouble.textContent = details.debugTip;
  } else {
    el.drawerTroubleSection.classList.add('hidden');
  }

  el.detailDrawer.classList.remove('hidden');
}

/* =========================================================
   Camera Pan & Zoom
   ========================================================= */
function applyTransform() {
  if (el.canvasPan) {
    el.canvasPan.style.transform = `translate(${Math.round(state.pan.x)}px, ${Math.round(state.pan.y)}px)`;
  }
  el.canvasStage.style.setProperty('--z', state.zoom);
  const g = document.getElementById('edgesGroup');
  if (g) {
    g.setAttribute('transform', `scale(${state.zoom})`);
  }
  el.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

function fitBoundsToPositions(rects, topOffset = 0) {
  if (!rects || rects.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }

  const vw = el.canvasViewport.clientWidth || window.innerWidth;
  const vh = el.canvasViewport.clientHeight || window.innerHeight;
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);

  const scaleX = (vw - 90) / contentW;
  const scaleY = (vh - 130 - topOffset) / contentH;
  const minZoom = state.mode === 'architecture' ? 0.68 : 0.82;
  state.zoom = Math.max(minZoom, Math.min(1.02, Math.min(scaleX, scaleY)));

  const cx = minX + contentW / 2;
  const cy = minY + contentH / 2;
  state.pan.x = vw / 2 - cx * state.zoom;
  state.pan.y = (vh + topOffset) / 2 - cy * state.zoom;
  applyTransform();
}

function setupCanvasInteractions() {
  el.canvasViewport.addEventListener('mousedown', (e) => {
    closeProjectMenu();
    if (e.button !== 0) return;
    if (
      e.target.closest('.tree-node') ||
      e.target.closest('.arch-card') ||
      e.target.closest('.wb-header-card') ||
      e.target.closest('.edge-pill-group')
    ) {
      return;
    }
    state.isPanning = true;
    state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
    el.canvasViewport.classList.add('panning');
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isPanning) return;
    state.pan.x = e.clientX - state.panStart.x;
    state.pan.y = e.clientY - state.panStart.y;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (state.isPanning) {
      state.isPanning = false;
      el.canvasViewport.classList.remove('panning');
    }
  });

  el.canvasViewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = Math.max(0.45, Math.min(2.6, state.zoom * factor));
    const rect = el.canvasViewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    state.pan.x = mx - ((mx - state.pan.x) / state.zoom) * nextZoom;
    state.pan.y = my - ((my - state.pan.y) / state.zoom) * nextZoom;
    state.zoom = nextZoom;
    applyTransform();
  }, { passive: false });

  el.btnZoomIn.addEventListener('click', () => {
    state.zoom = Math.min(2.6, state.zoom * 1.15);
    applyTransform();
  });

  el.btnZoomOut.addEventListener('click', () => {
    state.zoom = Math.max(0.45, state.zoom * 0.88);
    applyTransform();
  });

  el.btnZoomReset.addEventListener('click', () => {
    renderCurrentMode(true);
  });
}

/* =========================================================
   UI Event Bindings & SSE Live Reload
   ========================================================= */
function setupUIEvents() {
  el.tabFolders.addEventListener('click', () => {
    closeProjectMenu();
    switchMode('folders');
  });

  el.tabArch.addEventListener('click', () => {
    closeProjectMenu();
    switchMode('architecture');
  });

  el.projectTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = el.projectDropdown.classList.toggle('open');
    el.projectMenu.classList.toggle('hidden', !isOpen);
  });

  window.addEventListener('click', (e) => {
    if (!e.target.closest('#projectDropdown')) {
      closeProjectMenu();
    }
  });

  el.btnCloseDrawer.addEventListener('click', () => {
    el.detailDrawer.classList.add('hidden');
    state.selectedPath = null;
    updateTreeEdgeHighlights();
  });

  el.btnOpenExplorer.addEventListener('click', async () => {
    if (!state.currentProjectRoot) return;
    await apiPost('/api/open-folder', {
      projectRoot: state.currentProjectRoot,
      path: state.selectedPath || '.'
    });
  });

  el.btnCopyNodePrompt.addEventListener('click', async () => {
    const node = findTreeNodeByPath(state.mapData?.tree, state.selectedPath || '.');
    if (!node) return;
    const d = node.details || {};
    const text = `[VibeMap 节点] ${state.currentProjectRoot} -> ./${node.path} (${node.title || node.name})\n简介：${node.brief || ''}\n部署：${d.deployLocation || '本机'} | 端口：${(d.ports || []).join(', ') || '无'}`;
    await navigator.clipboard.writeText(text);
    showToast('已复制节点信息');
  });

  el.btnCloseOpenProject.addEventListener('click', () => {
    el.openProjectModal.classList.add('hidden');
  });

  el.btnConfirmOpenProject.addEventListener('click', async () => {
    const p = el.inputProjectPath.value.trim();
    if (!p) return;
    try {
      await apiPost('/api/projects/select', { projectRoot: p });
      await loadRegistry(p);
      el.openProjectModal.classList.add('hidden');
    } catch (err) {
      showToast('路径无效或不存在');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProjectMenu();
      el.detailDrawer.classList.add('hidden');
      el.openProjectModal.classList.add('hidden');
      state.selectedPath = null;
      updateTreeEdgeHighlights();
    }
  });

  window.addEventListener('resize', () => {
    renderCurrentMode(true);
  });
}

function connectSSE() {
  const es = new EventSource('/api/events');
  const handleEvent = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (event.type === 'window-open' || msg.type === 'window-open') {
        notifyDesktop('popup-window');
        if (msg.projectRoot) {
          await loadRegistry(msg.projectRoot);
        }
      } else if (event.type === 'ui-cmd' || msg.type === 'ui-cmd') {
        if (msg.openMenu) {
          el.projectDropdown.classList.add('open');
          el.projectMenu.classList.remove('hidden');
        }
        if (msg.mode) {
          switchMode(msg.mode);
        }
      } else if (
        event.type === 'map-updated' ||
        event.type === 'fs-changed' ||
        event.type === 'project-switched' ||
        msg.type === 'map-updated' ||
        msg.type === 'fs-changed'
      ) {
        if (msg.projectRoot && msg.projectRoot !== state.currentProjectRoot && event.type === 'project-switched') {
          await loadRegistry(msg.projectRoot);
        } else {
          await loadProjectMap(state.currentProjectRoot, false);
        }
      }
    } catch {}
  };

  es.addEventListener('window-open', handleEvent);
  es.addEventListener('ui-cmd', handleEvent);
  es.addEventListener('map-updated', handleEvent);
  es.addEventListener('fs-changed', handleEvent);
  es.addEventListener('project-switched', handleEvent);
  es.onmessage = handleEvent;
}

window.addEventListener('DOMContentLoaded', async () => {
  setupCanvasInteractions();
  setupUIEvents();
  connectSSE();
  await loadRegistry();
});
