# VibeMap

自用的 Vibe Coding 项目小地图工具。

写代码全靠 AI 的时候，文件一多就容易忘了哪个文件夹干嘛的、跑在哪台机器、监听哪个端口。这个工具用来让 AI 和自己共同维护一张项目说明书，带一个独立的 Windows 桌面小窗口（`VibeMap.exe`）。

## 两个模式

1. **文件夹模式**
   - 像剥洋葱一样逐层点开目录树
   - 鼠标移上去底部显示一句话简介
   - 右键弹出详细卡片（职责、部署机器、端口、依赖、排错提示）
   - 自动比对本地真实文件，标记哪些改了代码但没更新说明

2. **架构白板模式**
   - 顶部写项目大名、实现方式、右上角写项目用途
   - 中间画模块卡片和端口调用连线，支持一键演示链路流向

## 平时怎么用

### 启动桌面窗口
直接双击 `VibeMap.exe`，或者命令行跑：
```bash
node src/cli.js open --project "E:\你的项目路径"
```

### 让 AI 帮你画图 / 更新地图
直接把项目里的 [`SKILL.md`](./SKILL.md) 丢给 AI（Claude Code / Codex / Gemini / Cursor 都行），让它调 CLI 或 MCP 更新 `.vibemap/map.json` 即可。

### MCP 接入（可选）
```json
{
  "mcpServers": {
    "vibemap": {
      "command": "node",
      "args": ["E:\\Inriel_Project\\LLM_sandbox\\VibeMap\\src\\mcp.js"]
    }
  }
}
```

## 重新编译桌面壳（如果有改 C#）
```powershell
cd desktop
dotnet build -c Release
Copy-Item -Force -Recurse "bin\Release\net9.0-windows\*" ".."
```
