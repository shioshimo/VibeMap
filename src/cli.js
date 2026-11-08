#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const core = require('./core');
const launcher = require('./launcher');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'help';
  const root = core.normalizeProjectRoot(args.root || args._[1] || process.cwd());

  if (cmd === 'open') {
    const res = await launcher.openDesktopWindow(root);
    console.log(JSON.stringify({ ok: true, projectRoot: root, ...res }, null, 2));
    return;
  }

  if (cmd === 'status' || cmd === 'get') {
    const state = core.getProjectFullState(root);
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (cmd === 'upsert-node') {
    if (!args.path || !args.brief) {
      console.error('Usage: vibemap upsert-node --root <dir> --path <relPath> --brief <brief> [--title <t>] [--summary <s>] [--deploy <d>] [--ports <p1,p2>] [--deps <d1,d2>] [--tip <tip>]');
      process.exit(1);
    }
    const node = {
      path: args.path,
      title: args.title,
      brief: args.brief,
      details: {
        summary: args.summary || '',
        deployLocation: args.deploy || '',
        ports: args.ports ? String(args.ports).split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        dependencies: args.deps ? String(args.deps).split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        debugTip: args.tip || ''
      }
    };
    core.upsertFolderNodes(root, [node], args.agent || 'CLI Agent');
    await launcher.notifyServer({ type: 'map-updated', projectRoot: root });
    console.log(JSON.stringify({ ok: true, updated: args.path }, null, 2));
    return;
  }

  if (cmd === 'apply-json') {
    if (!args.file) {
      console.error('Usage: vibemap apply-json --root <dir> --file <payload.json>');
      process.exit(1);
    }
    const payload = JSON.parse(fs.readFileSync(path.resolve(args.file), 'utf8'));
    if (Array.isArray(payload.folderNodes)) {
      core.upsertFolderNodes(root, payload.folderNodes, payload.agentName || 'CLI Agent');
    }
    if (payload.architecture || payload.projectName || payload.purpose) {
      core.updateArchitecture(
        root,
        Object.assign({}, payload, payload.architecture || {}),
        payload.agentName || 'CLI Agent'
      );
    }
    await launcher.notifyServer({ type: 'map-updated', projectRoot: root });
    console.log(JSON.stringify({ ok: true, projectRoot: root }, null, 2));
    return;
  }

  console.log(`VibeMap CLI - AI 与人类共用的项目地图工具
用法:
  node cli.js open [projectRoot]                  唤起桌面小窗口并打开指定项目地图
  node cli.js status [projectRoot]                查看项目地图与真实文件同步校验状态
  node cli.js upsert-node --root <dir> --path <p> --brief <简介> [--summary <详情>] [--deploy <部署>] [--ports <端口>] [--deps <依赖>] [--tip <排错>]
  node cli.js apply-json --root <dir> --file <json> 批量写入文件夹说明与架构白板数据`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
