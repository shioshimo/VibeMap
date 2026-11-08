---
name: vibemap
description: 维护和展示项目的可视化「文件夹逐层地图」与「架构讲解白板」。当你创建新项目、接手已有项目、或修改了项目的模块/目录/端口/架构时，使用此技能读取或同步更新项目的 VibeMap 地图，并可随时调出独立桌面小窗口给用户查看。
---

# VibeMap 技能说明（AI 与人类共用的项目活地图）

VibeMap 让用户无需逐行翻看源码，就能通过**文件夹模式（逐层展开 + 悬停一句话简介 + 右键详细卡片）**和**架构讲解模式（顶部大名 + 右上角项目用途 + 实现方式白板画布）**一眼看懂项目。

## 1. 什么时候用

1. **接手项目时**：先读地图（`vibemap_get_map` 或 `cli.js status`），1 秒搞懂目录分工、端口、部署位置（如本机 vs `muri-oci`），以及是否有「代码已改动但说明过期 (`stale`)」或「新增未标注 (`unmapped`)」的文件。
2. **新建或修改功能后**：改完代码顺手更新对应文件夹/文件的 `brief`（悬停一句话简介）和 `details`（右键详情），如果加了新服务或改了端口连线，同步更新 `architecture` 白板。
3. **需要给用户讲解或展示时**：调用 `vibemap_open_window` 或 `cli.js open` 直接把独立桌面小窗口弹出来展示给用户。

## 2. 调用方式

### 方式 A：通过 MCP 工具（如已挂载 `vibemap` MCP）
- `vibemap_open_window({ projectRoot })`：唤起桌面小窗口并切换到该项目
- `vibemap_get_map({ projectRoot })`：读取当前地图 + 真实磁盘文件对照结果
- `vibemap_upsert_folders({ projectRoot, agentName, nodes })`：批量更新文件夹/文件说明
- `vibemap_update_architecture({ projectRoot, agentName, projectName, purpose, implementationSummary, techStack, nodes, edges, flows })`：更新架构讲解白板

### 方式 B：通过通用命令行 CLI（所有 AI 均可直接执行）
```powershell
# 1. 查看项目地图与文件同步状态
node "E:\Inriel_Project\LLM_sandbox\VibeMap\src\cli.js" status "<项目绝对路径>"

# 2. 单独更新某个文件夹或文件的说明
node "E:\Inriel_Project\LLM_sandbox\VibeMap\src\cli.js" upsert-node --root "<项目绝对路径>" --path "tts" --title "TTS 语音合成" --brief "专门把文字转成语音音频流" --summary "接收切分短句，优先查缓存，未命中则调用模型合成音频" --deploy "muri-oci:9002" --ports ":9002" --deps "edge-tts,FFmpeg" --tip "没声音先检查 9002 端口连通性"

# 3. 唤起独立桌面小窗口给用户看
node "E:\Inriel_Project\LLM_sandbox\VibeMap\src\cli.js" open "<项目绝对路径>"
```

## 3. 编写说明的铁律（防废话）
- **悬停简介 (`brief`)**：控制在 1 句话（40 字以内），直接说「它是干嘛的」。
- **右键详情 (`details.summary`)**：控制在 2～3 句话，讲清楚输入什么、怎么处理、输出到哪，**严禁贴大段源代码**。
- **架构白板 (`architecture.nodes`)**：只放 3～8 个核心模块，标清楚 `host`（运行在哪）和 `port`（哪个端口），让外行或几个月后的自己扫一眼就能看明白。
