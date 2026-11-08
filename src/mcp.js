#!/usr/bin/env node
const core = require('./core');
const launcher = require('./launcher');

const TOOLS = [
  {
    name: 'vibemap_open_window',
    description:
      '调出 VibeMap 独立桌面小窗口并切换到指定项目。AI 在创建新项目地图或完成更新后可调用此工具直接把可视化地图展示给用户。',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string',
          description: '项目根目录的绝对路径'
        }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'vibemap_get_map',
    description:
      '读取指定项目的 VibeMap 地图数据与真实文件同步状态（检测哪些文件夹/文件还没有说明、哪些文件代码已修改但地图说明过期）。AI 接手项目或准备修改功能前应先调用此工具。',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string',
          description: '项目根目录的绝对路径'
        }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'vibemap_upsert_folders',
    description:
      '批量更新「文件夹模式」下的目录或文件节点说明。brief 用于鼠标悬停时在底部和气泡展示的一句话简介（不超过50字）；details 用于右键弹出的详细卡片（作用、部署位置、依赖、端口、排错提示，保持精炼通俗）。',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string',
          description: '项目根目录的绝对路径'
        },
        agentName: {
          type: 'string',
          description: '当前 AI 名称（如 Antigravity, Claude Code, Codex）'
        },
        nodes: {
          type: 'array',
          description: '要更新的目录或文件说明列表',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '相对项目根目录的路径（根目录填 "."，子目录如 "tts" 或 "pipeline/router.py"）'
              },
              title: {
                type: 'string',
                description: '可读名称（如 "TTS 语音合成模块"）'
              },
              brief: {
                type: 'string',
                description: '鼠标悬停显示的简要介绍（一句话讲清楚它是干嘛的）'
              },
              details: {
                type: 'object',
                properties: {
                  summary: { type: 'string', description: '右键卡片详细说明（2-3句话讲清内部逻辑，不要贴大段代码）' },
                  deployLocation: { type: 'string', description: '运行/部署位置（如 "本机 Windows" 或 "甲骨文云 muri-oci:9002"）' },
                  dependencies: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '核心依赖的库或外部服务'
                  },
                  ports: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '涉及的端口或接口地址'
                  },
                  debugTip: { type: 'string', description: '如果这块坏了，先看哪里（1句话排错指南）' }
                }
              }
            },
            required: ['path', 'brief']
          }
        }
      },
      required: ['projectRoot', 'nodes']
    }
  },
  {
    name: 'vibemap_update_architecture',
    description:
      '更新「架构讲解模式（白板视图）」的全局说明、模块框图、端口连线和数据流转步骤。不会覆盖用户在白板上手动拖拽调整过的节点坐标。',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: '项目根目录的绝对路径' },
        agentName: { type: 'string', description: '当前 AI 名称' },
        projectName: { type: 'string', description: '顶部显示的项目大名' },
        purpose: { type: 'string', description: '右上角卡片：这个项目是用来做什么的（通俗易懂）' },
        implementationSummary: { type: 'string', description: '顶部实现方式概述（一两句话讲明白整体怎么串起来的）' },
        techStack: { type: 'array', items: { type: 'string' }, description: '技术栈标签' },
        nodes: {
          type: 'array',
          description: '白板上的核心模块卡片（控制在 3~10 个关键模块，一目了然）',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一节点 ID' },
              label: { type: 'string', description: '模块名称' },
              category: {
                type: 'string',
                enum: ['frontend', 'pipeline', 'service', 'external', 'storage', 'deploy'],
                description: '模块分类（用于配色）'
              },
              folderPath: { type: 'string', description: '关联的项目相对文件夹路径（右键可直接跳转到文件夹模式）' },
              host: { type: 'string', description: '部署在哪（如 "本机"、"muri-oci"、"云端 API"）' },
              port: { type: 'string', description: '监听或连接的端口（如 ":8000"）' },
              brief: { type: 'string', description: '一句话说明职责' },
              details: {
                type: 'object',
                properties: {
                  summary: { type: 'string' },
                  deployLocation: { type: 'string' },
                  dependencies: { type: 'array', items: { type: 'string' } },
                  ports: { type: 'array', items: { type: 'string' } },
                  debugTip: { type: 'string' }
                }
              },
              x: { type: 'number', description: '可选初始画布横坐标' },
              y: { type: 'number', description: '可选初始画布纵坐标' }
            },
            required: ['id', 'label', 'brief']
          }
        },
        edges: {
          type: 'array',
          description: '模块之间的连线关系',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string', description: '起点模块 ID' },
              to: { type: 'string', description: '终点模块 ID' },
              label: { type: 'string', description: '连线上的说明文字（如 "发送音频流"、"返回合成语音"）' },
              protocol: { type: 'string', description: '协议或端口标识（如 "WS :8000"、"HTTP POST"）' }
            },
            required: ['from', 'to', 'label']
          }
        },
        flows: {
          type: 'array',
          description: '关键业务运行链路（可在白板上一键逐步点亮演示）',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', description: '链路名称（如 "语音对话全流程"）' },
              description: { type: 'string' },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nodeId: { type: 'string' },
                    note: { type: 'string', description: '这一步具体干了什么' }
                  },
                  required: ['nodeId', 'note']
                }
              }
            },
            required: ['id', 'name', 'steps']
          }
        },
        changeNote: { type: 'string', description: '本次修改记录摘要' }
      },
      required: ['projectRoot']
    }
  }
];

async function handleToolCall(name, args) {
  if (name === 'vibemap_open_window') {
    const res = await launcher.openDesktopWindow(args.projectRoot);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, message: '已唤起 VibeMap 窗口并切换项目', ...res }, null, 2)
        }
      ]
    };
  }

  if (name === 'vibemap_get_map') {
    const state = core.getProjectFullState(args.projectRoot);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(state, null, 2)
        }
      ]
    };
  }

  if (name === 'vibemap_upsert_folders') {
    const root = core.normalizeProjectRoot(args.projectRoot);
    core.upsertFolderNodes(root, args.nodes || [], args.agentName || 'MCP Agent');
    core.setActiveProject(root, false);
    await launcher.notifyServer({ type: 'map-updated', projectRoot: root });
    const state = core.getProjectFullState(root);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              updatedCount: (args.nodes || []).length,
              stats: state.stats
            },
            null,
            2
          )
        }
      ]
    };
  }

  if (name === 'vibemap_update_architecture') {
    const root = core.normalizeProjectRoot(args.projectRoot);
    core.updateArchitecture(root, args, args.agentName || 'MCP Agent');
    core.setActiveProject(root, false);
    await launcher.notifyServer({ type: 'map-updated', projectRoot: root });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              projectRoot: root,
              message: '已更新架构讲解白板并实时同步到窗口'
            },
            null,
            2
          )
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

let useContentLength = false;

function sendResponse(msg) {
  const json = JSON.stringify(msg);
  if (useContentLength) {
    const len = Buffer.byteLength(json, 'utf8');
    process.stdout.write(`Content-Length: ${len}\r\n\r\n${json}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

async function processMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  const { id, method, params } = msg;

  try {
    if (method === 'initialize') {
      return sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: (params && params.protocolVersion) || '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'vibemap-mcp',
            version: '1.0.0'
          }
        }
      });
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'ping') {
      return sendResponse({ jsonrpc: '2.0', id, result: {} });
    }

    if (method === 'tools/list') {
      return sendResponse({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      });
    }

    if (method === 'tools/call') {
      const result = await handleToolCall(params.name, params.arguments || {});
      return sendResponse({
        jsonrpc: '2.0',
        id,
        result
      });
    }

    if (id !== undefined) {
      sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      });
    }
  } catch (err) {
    if (id !== undefined) {
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }]
        }
      });
    }
  }
}

let buffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (buffer.length > 0) {
    const str = buffer.toString('utf8');
    if (str.startsWith('Content-Length:')) {
      useContentLength = true;
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = buffer.slice(0, headerEnd).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }
      const contentLen = parseInt(match[1], 10);
      const totalLen = headerEnd + 4 + contentLen;
      if (buffer.length < totalLen) break;
      const bodyStr = buffer.slice(headerEnd + 4, totalLen).toString('utf8');
      buffer = buffer.slice(totalLen);
      try {
        processMessage(JSON.parse(bodyStr));
      } catch {}
    } else {
      const nlIndex = buffer.indexOf('\n');
      if (nlIndex === -1) break;
      const line = buffer.slice(0, nlIndex).toString('utf8').trim();
      buffer = buffer.slice(nlIndex + 1);
      if (!line) continue;
      try {
        processMessage(JSON.parse(line));
      } catch {}
    }
  }
});
