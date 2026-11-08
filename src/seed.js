const fs = require('fs');
const path = require('path');
const core = require('./core');

function seedDemoProject() {
  const demoRoot = path.join(__dirname, '..', 'examples', 'VoiceFlow-TTS-Demo');
  const dirs = [
    path.join(demoRoot, 'pipeline'),
    path.join(demoRoot, 'tts'),
    path.join(demoRoot, 'asr'),
    path.join(demoRoot, 'frontend')
  ];
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));

  const files = {
    'pipeline/router.py': '# 流水线总控网关：串联 ASR -> LLM -> TTS\ndef run_pipeline(audio_chunk):\n    pass\n',
    'pipeline/interrupt_mgr.py': '# 语音打断控制器：检测用户插话时立即清空播放队列\n',
    'tts/edge_synth.py': '# TTS 语音合成核心：将短句文本转为 MP3/PCM 音频帧\n',
    'tts/audio_cache.py': '# 常用回复语音缓存池，命中时跳过推理直接返回\n',
    'asr/whisper_stream.py': '# 实时流式语音识别：20ms 音频帧转文字\n',
    'frontend/voice_panel.html': '<!-- 前端麦克风波形与字幕面板 -->\n'
  };

  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(demoRoot, rel);
    if (!fs.existsSync(abs)) {
      fs.writeFileSync(abs, content, 'utf8');
    }
  }

  // Create one unmapped new file to demonstrate live sync verification
  fs.writeFileSync(
    path.join(demoRoot, 'tts', 'new_voice_cloner.py'),
    '# 新增的音色克隆实验脚本（尚未写入地图说明）\n',
    'utf8'
  );

  core.upsertFolderNodes(
    demoRoot,
    [
      {
        path: '.',
        title: 'AI 实时语音流水线 (VoiceFlow)',
        brief: '把语音识别、大模型对话和 TTS 语音合成串成低延迟流水线的完整工程',
        details: {
          summary:
            '顶层工程目录。包含前端采集面板、Pipeline 调度网关、ASR 语音转文字和 TTS 语音合成四个核心文件夹。',
          deployLocation: '本机 Windows (muri) + 甲骨文云 (muri-oci)',
          ports: [':8000 (本地总网关)', ':9002 (远程 TTS)'],
          dependencies: ['Python 3.11', 'FastAPI', 'WebSocket', 'Edge-TTS'],
          debugTip: '整体跑不通时先看 pipeline/router.py 的 8000 端口有没有启动。'
        }
      },
      {
        path: 'pipeline',
        title: '流水线打包整合层',
        brief: '负责把下面的 ASR、LLM 和 TTS 打包整合成一条自动流转的流水线',
        details: {
          summary:
            '接收前端发来的声音流，先调 ASR 转成字，再塞给大模型拿回复，按标点切句后发给 TTS 合成声音推回前端。',
          deployLocation: '本机 Windows (127.0.0.1:8000)',
          ports: ['WS :8000/stream'],
          dependencies: ['asyncio', 'FastAPI', 'websockets'],
          debugTip: '如果能识别文字但没声音返回，检查 router.py 里连接 TTS 服务的地址。'
        }
      },
      {
        path: 'pipeline/router.py',
        title: '流水线主路由',
        brief: '串联语音识别、大模型按句切分与 TTS 调用的核心调度脚本',
        details: {
          summary: '维护每个会话的异步队列，实现边生成文字、边合成语音、边播放的流式效果。',
          deployLocation: '本机进程',
          ports: [':8000'],
          dependencies: ['asr.whisper_stream', 'tts.edge_synth'],
          debugTip: '延迟变高时看这里的切句标点正则是不是卡住了长句。'
        }
      },
      {
        path: 'pipeline/interrupt_mgr.py',
        title: '插话打断管理器',
        brief: '用户中途开口说话时，立刻掐断正在播放的 AI 语音',
        details: {
          summary: '监听 VAD 人声激活信号，一旦触发立刻取消当前未完成的 TTS 任务并通知前端清空播放器。',
          deployLocation: '本机进程',
          ports: [],
          dependencies: [' Silero-VAD'],
          debugTip: '如果环境噪音导致 AI 说话老被自己打断，调高这里的 VAD 阈值。'
        }
      },
      {
        path: 'tts',
        title: 'TTS 语音合成中心',
        brief: '专门做 TTS 的模块，也就是把 AI 回复的文字实时转化为语音音频',
        details: {
          summary:
            '接收切分好的短句文本，优先查本地音频缓存；未命中则调用语音合成模型输出 PCM 音频流。比较吃算力，可独立部署在甲骨文云。',
          deployLocation: '甲骨文云 muri-oci (100.107.197.66:9002)',
          ports: ['HTTP POST :9002/synthesize'],
          dependencies: ['edge-tts', 'FFmpeg', 'aiohttp'],
          debugTip: '没声音或者报连接超时，先 ping 100.107.197.66 看看 Tailscale 和 9002 端口在不在。'
        }
      },
      {
        path: 'tts/edge_synth.py',
        title: '语音合成引擎',
        brief: '调用 TTS 接口把文字转成语音字节流',
        details: {
          summary: '封装了音色选择、语速调节和音频流切片返回逻辑。',
          deployLocation: 'muri-oci 容器内',
          ports: [':9002'],
          dependencies: ['edge-tts'],
          debugTip: '切换音色报错时检查 voice_name 参数拼写。'
        }
      },
      {
        path: 'tts/audio_cache.py',
        title: '高频语音缓存池',
        brief: '把「在的」「请说」等常用短句的语音缓存在内存里，0延迟秒回',
        details: {
          summary: '按文本 Hash 缓存合成好的音频块，命中后不用再调远端 TTS 服务。',
          deployLocation: '本机内存 / Redis',
          ports: [],
          dependencies: ['hashlib'],
          debugTip: '改了音色后如果老短句还是旧声音，清空一下缓存目录。'
        }
      },
      {
        path: 'asr',
        title: 'ASR 语音转文字模块',
        brief: '负责把麦克风录到的声音实时转化成文字',
        details: {
          summary: '接收前端 WebSocket 传来的 16kHz 音频流，识别出完整句子后交给 Pipeline 网关。',
          deployLocation: '本机 Windows',
          ports: ['内部调用 / :9001'],
          dependencies: ['faster-whisper'],
          debugTip: '识别不出中文或乱码时检查采样率是不是 16000Hz。'
        }
      },
      {
        path: 'asr/whisper_stream.py',
        title: '流式语音识别脚本',
        brief: '滑动窗口实时识别音频流并输出文本',
        details: {
          summary: '每 300ms 对音频缓冲区做一次增量推理。',
          deployLocation: '本机 Windows',
          ports: [],
          dependencies: ['faster-whisper', 'numpy'],
          debugTip: '显存不够时把 model_size 从 medium 改成 small。'
        }
      },
      {
        path: 'frontend',
        title: '桌面语音交互前端',
        brief: '采集麦克风声音、展示实时字幕、播放 TTS 合成出来的语音',
        details: {
          summary: '提供录音按钮、波形动画和音频播放队列，通过单条 WebSocket 跟后端 Pipeline 通信。',
          deployLocation: '本机桌面窗口',
          ports: [':5173'],
          dependencies: ['WebAudio API', 'WebSocket'],
          debugTip: '点开始说话没反应时先看麦克风权限。'
        }
      }
    ],
    'Antigravity'
  );

  core.updateArchitecture(
    demoRoot,
    {
      projectName: 'VoiceFlow · AI 实时语音对话项目',
      purpose:
        '让你直接用嘴跟 AI 聊天：把麦克风录到的声音转成字，发给大模型思考，再通过 TTS 把回答变成语音播出来，支持随时插话打断。',
      implementationSummary:
        '前端通过 WebSocket 连接到本地 8000 端口的 Pipeline 打包流水线；Pipeline 依次调用本机 ASR 转文字、云端 LLM 生成回答、以及部署在甲骨文云 9002 端口的 TTS 服务合成语音，最后把音频流推回前端播放。',
      techStack: ['Python', 'FastAPI', 'WebSocket', 'Edge-TTS', 'Faster-Whisper'],
      nodes: [
        {
          id: 'fe-panel',
          label: '前端语音面板',
          category: 'frontend',
          folderPath: 'frontend',
          host: '本机 (muri)',
          port: ':5173',
          brief: '录音采集麦克风音频，接收并播放合成好的语音流',
          x: 60,
          y: 170
        },
        {
          id: 'pipeline-hub',
          label: 'Pipeline 流水线总控',
          category: 'pipeline',
          folderPath: 'pipeline',
          host: '本机 (muri)',
          port: ':8000',
          brief: '把 ASR、大模型和 TTS 打包串联成一条自动化处理流水线',
          x: 390,
          y: 170
        },
        {
          id: 'asr-svc',
          label: 'ASR 语音识别',
          category: 'service',
          folderPath: 'asr',
          host: '本机 (muri)',
          port: ':9001',
          brief: '把用户说的声音流实时转成文字',
          x: 390,
          y: 25
        },
        {
          id: 'llm-api',
          label: '大语言模型 (LLM)',
          category: 'external',
          folderPath: 'pipeline/router.py',
          host: '云端 API',
          port: 'HTTPS :443',
          brief: '根据识别出的文字流式生成回复内容，按标点切分成短句',
          x: 730,
          y: 60
        },
        {
          id: 'tts-svc',
          label: 'TTS 语音合成服务',
          category: 'service',
          folderPath: 'tts',
          host: 'muri-oci 甲骨文云',
          port: ':9002',
          brief: '专门负责把短句文字转化为语音音频块（带高频缓存）',
          x: 730,
          y: 260
        }
      ],
      edges: [
        {
          from: 'fe-panel',
          to: 'pipeline-hub',
          label: '双向音频与控制流',
          protocol: 'WS :8000'
        },
        {
          from: 'pipeline-hub',
          to: 'asr-svc',
          label: '转发录音帧 / 返回识别文本',
          protocol: 'Local :9001'
        },
        {
          from: 'pipeline-hub',
          to: 'llm-api',
          label: '发送用户文本 / 流式拿回复',
          protocol: 'SSE :443'
        },
        {
          from: 'pipeline-hub',
          to: 'tts-svc',
          label: '发送切分短句 / 返回语音流',
          protocol: 'HTTP :9002'
        }
      ],
      flows: [
        {
          id: 'flow-talk',
          name: '开口说话到听见回答全流程',
          description: '一条语音从麦克风进入直到变成 AI 语音播出的 5 个步骤',
          steps: [
            {
              nodeId: 'fe-panel',
              note: '第 1 步：你在前端对着麦克风说话，音频流通过 WebSocket 发往本地 :8000 端口'
            },
            {
              nodeId: 'pipeline-hub',
              note: '第 2 步：Pipeline 流水线收到音频，先检查有没有触发插话打断，然后把声音送给 ASR'
            },
            {
              nodeId: 'asr-svc',
              note: '第 3 步：ASR 识别出你说的话（例如「今天天气怎么样」），把文字交回给 Pipeline'
            },
            {
              nodeId: 'llm-api',
              note: '第 4 步：Pipeline 请求大模型生成回答，每吐出一个逗号/句号就切成一个短句'
            },
            {
              nodeId: 'tts-svc',
              note: '第 5 步：短句发往甲骨文云 :9002 的 TTS 服务转成语音，再由 Pipeline 推回前端播放'
            }
          ]
        }
      ],
      changeNote: '初始化 VoiceFlow 语音流水线示例地图与架构白板'
    },
    'Antigravity'
  );

  return demoRoot;
}

function seedSelfProject() {
  const selfRoot = path.join(__dirname, '..');
  core.upsertFolderNodes(
    selfRoot,
    [
      {
        path: '.',
        title: 'VibeMap · AI 与人类共用的项目地图',
        brief: '提供可逐层展开的文件夹地图、架构讲解白板、真实文件同步校验与通用 MCP 接口',
        details: {
          summary:
            '让 Vibe Coding 开发者不用翻代码也能一眼看懂项目结构和运行原理；所有 AI 通过 MCP 或 CLI 共享并持续维护同一份地图。',
          deployLocation: '本机 Windows 独立桌面悬浮窗 + 本地服务 (:19527)',
          ports: [':19527 (本地 UI 与热更新服务)', 'stdio (MCP 协议)'],
          dependencies: ['Node.js v24', '.NET 9 WebView2'],
          debugTip: '窗口打不开时运行 node src/cli.js open 即可自动拉起后台与桌面端。'
        }
      },
      {
        path: 'src',
        title: '核心源码目录',
        brief: '包含地图读写内核、实时文件对照器、MCP 服务端、CLI 工具和前端页面',
        details: {
          summary: '整个工具的核心逻辑层，无任何笨重的第三方依赖，启动仅需几十毫秒。',
          deployLocation: '本机 Node.js 环境',
          ports: [':19527'],
          dependencies: ['node:http', 'node:fs'],
          debugTip: '改了前端界面直接刷新窗口即可生效。'
        }
      },
      {
        path: 'src/core.js',
        title: '地图数据内核与文件校验器',
        brief: '负责读写 .vibemap/map.json，并实时比对磁盘文件检测过期说明或新增文件',
        details: {
          summary:
            '扫描真实目录树并与 AI 写的说明合并，计算每个节点是「已同步」「代码已改待更新」「未写说明」还是「文件已删」。',
          deployLocation: '本机进程',
          ports: [],
          dependencies: ['fs', 'path'],
          debugTip: '如果想忽略特定缓存目录，在 IGNORED_NAMES 集合里添加名称。'
        }
      },
      {
        path: 'src/mcp.js',
        title: '通用 AI MCP 接口服务',
        brief: '让 Claude Code、Codex、Antigravity、Cursor 等所有 AI 都能直接读写地图和弹窗',
        details: {
          summary:
            '基于标准 JSON-RPC 2.0 实现的 MCP Server，提供 vibemap_get_map、vibemap_upsert_folders、vibemap_update_architecture、vibemap_open_window 四个工具。',
          deployLocation: '随 AI 客户端按需拉起 (stdio)',
          ports: ['stdio'],
          dependencies: ['src/core.js', 'src/launcher.js'],
          debugTip: 'AI 更新后会自动通过 /api/notify 通知桌面窗口秒级刷新。'
        }
      },
      {
        path: 'src/server.js',
        title: '本地实时同步与 Web 服务',
        brief: '提供前端界面渲染、文件监听 (fs.watch) 与 SSE 秒级热更新推送',
        details: {
          summary: '监听 127.0.0.1:19527，当磁盘文件变化或 AI 调用工具时，立即通过 SSE 推送给桌面窗口。',
          deployLocation: '本机后台常驻 (127.0.0.1:19527)',
          ports: [':19527'],
          dependencies: ['http', 'fs.watch'],
          debugTip: '端口如果已被占用会自动复用现有实例。'
        }
      },
      {
        path: 'src/public',
        title: '双模式可视化前端界面',
        brief: '实现「文件夹逐层展开模式」与「架构讲解白板模式」的可交互界面',
        details: {
          summary: '包含底部悬停解说栏、跟随气泡、右键详情卡片、可拖拽架构画布与链路演示器。',
          deployLocation: '桌面端 WebView2 窗口内',
          ports: [],
          dependencies: ['HTML5', 'SVG', 'CSS'],
          debugTip: '白板节点拖拽后坐标会自动锁定，不怕 AI 更新时冲掉你的排版。'
        }
      },
      {
        path: 'desktop',
        title: 'Windows 独立桌面悬浮窗壳',
        brief: '基于 .NET + WebView2 的原生桌面窗口，支持一键置顶、迷你悬浮球收起和自动唤醒',
        details: {
          summary: '编译出轻巧的 VibeMap.exe，平时可以缩小成桌面边缘胶囊，需要看架构时一键展开。',
          deployLocation: '本机 Windows 桌面',
          ports: [],
          dependencies: ['.NET 9 WPF', 'WebView2'],
          debugTip: '运行 desktop/build.ps1 可重新编译 VibeMap.exe。'
        }
      },
      {
        path: 'examples',
        title: '内置示例项目库',
        brief: '存放演示用的 VoiceFlow 实时语音流水线示例项目',
        details: {
          summary: '用于直观演示文件夹悬停、右键详情、过期检测以及架构白板连线效果。',
          deployLocation: '本机沙盒目录',
          ports: [],
          dependencies: [],
          debugTip: '可在顶部下拉框随时切换回示例项目。'
        }
      }
    ],
    'Antigravity'
  );

  core.updateArchitecture(
    selfRoot,
    {
      projectName: 'VibeMap · 项目地图与架构白板系统',
      purpose:
        '解决 Vibe Coding 代码写多了看不懂、维护难的问题。给所有 AI 配一张共享的「项目活地图」，AI 边写代码边维护地图，人随时打开就能看懂目录职责和整体架构。',
      implementationSummary:
        '项目目录下保存结构化的 .vibemap/map.json；任何 AI 通过 MCP 协议或 CLI 读写地图；本地 Server 实时比对磁盘真实文件防止 AI 瞎编，并通过 SSE 实时渲染到独立桌面悬浮窗。',
      techStack: ['Node.js', 'MCP Protocol', 'SSE 实时推送', '.NET 9 WebView2', 'SVG Whiteboard'],
      nodes: [
        {
          id: 'ai-agents',
          label: '各类 AI 编程助手',
          category: 'external',
          folderPath: 'src/mcp.js',
          host: 'Claude / Codex / Gemini',
          port: 'MCP / CLI',
          brief: '在写代码的同时，调用工具读取或更新项目地图',
          x: 60,
          y: 80
        },
        {
          id: 'mcp-cli',
          label: 'MCP & CLI 统一接口层',
          category: 'pipeline',
          folderPath: 'src/mcp.js',
          host: '本机进程',
          port: 'stdio',
          brief: '向所有 AI 暴露标准化的地图查询、目录标注、白板更新和弹窗指令',
          x: 380,
          y: 80
        },
        {
          id: 'core-engine',
          label: 'Core 地图内核与真实文件校验',
          category: 'service',
          folderPath: 'src/core.js',
          host: '本机磁盘',
          port: '.vibemap/map.json',
          brief: '将地图说明与真实文件夹对照，自动识别未标注文件与代码已改但说明过期的节点',
          x: 380,
          y: 260
        },
        {
          id: 'live-server',
          label: '本地热更新服务 (Server)',
          category: 'service',
          folderPath: 'src/server.js',
          host: '127.0.0.1',
          port: ':19527',
          brief: '监听文件变化与 AI 通知，通过 SSE 毫秒级推送给桌面端',
          x: 720,
          y: 170
        },
        {
          id: 'desktop-win',
          label: 'VibeMap 桌面悬浮小窗口',
          category: 'frontend',
          folderPath: 'src/public',
          host: 'Windows 桌面',
          port: 'WebView2',
          brief: '提供「文件夹逐层展开」和「架构讲解白板」双视图，支持置顶与收起成胶囊',
          x: 1040,
          y: 170
        }
      ],
      edges: [
        {
          from: 'ai-agents',
          to: 'mcp-cli',
          label: '调用 MCP 工具或 CLI',
          protocol: 'JSON-RPC'
        },
        {
          from: 'mcp-cli',
          to: 'core-engine',
          label: '读写节点说明与架构图',
          protocol: 'map.json'
        },
        {
          from: 'core-engine',
          to: 'live-server',
          label: '合并真实文件树与同步状态',
          protocol: 'fs.watch'
        },
        {
          from: 'mcp-cli',
          to: 'live-server',
          label: '触发实时刷新 / 唤醒窗口',
          protocol: 'POST :19527'
        },
        {
          from: 'live-server',
          to: 'desktop-win',
          label: '实时渲染双视图画面',
          protocol: 'SSE 流'
        }
      ],
      flows: [
        {
          id: 'flow-ai-update',
          name: 'AI 改代码并自动同步地图流程',
          description: '当你让 AI 加一个新功能时，VibeMap 是怎么工作的',
          steps: [
            {
              nodeId: 'ai-agents',
              note: '第 1 步：AI 接手任务，先调 vibemap_get_map 一秒读懂当前项目架构和文件夹分工'
            },
            {
              nodeId: 'mcp-cli',
              note: '第 2 步：AI 改完代码后，调 vibemap_upsert_folders 和 vibemap_update_architecture 更新说明'
            },
            {
              nodeId: 'core-engine',
              note: '第 3 步：内核更新 .vibemap/map.json，并记录当前文件的最新修改时间戳'
            },
            {
              nodeId: 'live-server',
              note: '第 4 步：本地服务收到通知，立即通过 SSE 向桌面端广播更新事件'
            },
            {
              nodeId: 'desktop-win',
              note: '第 5 步：你桌面的小窗口自动刷新，你能直接看到 AI 改了哪、接了什么端口'
            }
          ]
        }
      ],
      changeNote: '初始化 VibeMap 自身项目地图与架构白板'
    },
    'Antigravity'
  );

  return selfRoot;
}

const demoRoot = seedDemoProject();
const selfRoot = seedSelfProject();
// Set VoiceFlow demo as initial active project so user immediately sees the TTS pipeline example from their chat!
core.setActiveProject(demoRoot, false);
console.log('Seeded projects:', { demoRoot, selfRoot });
