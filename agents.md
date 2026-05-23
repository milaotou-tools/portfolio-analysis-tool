# AGENTS.md

## 项目概览

这是一个 Next.js App Router 项目，项目名是 `holding-analyzer`，用于上传手机股票持仓截图，并调用服务端视觉模型解析出持仓数据，再在前端展示：

- 持仓热力图
- 仓位占比图
- 脱敏分享卡片
- 一个可画线的视觉标注页 `/annotate`

用户不熟悉代码，沟通时请尽量用大白话解释，不要默认用户理解框架术语。

## 本地运行与部署

常用命令：

```bash
npm run dev
npm run build
npm run start
```

`npm run dev` 使用端口 `3020`：

```txt
http://localhost:3020
```

线上正式地址：

```txt
https://holding-analyzer.vercel.app
```

Vercel 项目信息位于 `.vercel/project.json`，项目名是 `holding-analyzer`。

发布线上时使用：

```bash
vercel deploy --prod
```

## 环境变量与视觉模型

视觉模型配置不应该写死到源码里，应该放在 `.env.local` 和 Vercel Production 环境变量中。

需要的变量：

```env
AI_API_KEY=阿里云百炼 API Key
AI_BASE_URL=模型接口地址（默认 DashScope 兼容接口）
AI_MODEL=模型名（默认 qwen-plus）
AI_PROVIDER=openai 或 anthropic（可选，默认 openai）
```

注意：

- 不要把真实 `AI_API_KEY` 写入文档、日志、提交信息或源码。
- `.env.local` 只用于本地。
- 线上必须在 Vercel 后台的 Environment Variables 里配置，并重新部署后才会生效。
- 默认使用阿里云百炼 DashScope 的 OpenAI 兼容接口（`/compatible-mode/v1`）。
- `AI_PROVIDER` 默认 `openai`，适用于所有 OpenAI-compatible 服务（DashScope、OpenAI、中转站等）。
- `AI_PROVIDER=anthropic` 切换为 Anthropic messages 调用格式。

## 主要目录与文件

```txt
app/
  page.js                         主页面，管理上传、结果页、分享页状态
  globals.css                     全局样式，包含持仓页、上传页、标注页样式
  layout.js                       App Router 根布局
  annotate/page.js                可在线画线的视觉标注页
  api/client-log/route.js         客户端日志收集接口
  api/parse-holdings/route.js     核心截图解析接口
  api/parse-holdings-native/route.js 旧的原生表单上传桥接接口

components/
  UploadPanel.js                  上传截图组件
  HoldingTreemap.js               持仓热力图组件
  ShareCardPanel.js               分享卡片组件

lib/
  clientLog.js                    客户端日志上报封装
  demoData.js                     示例持仓数据
  holdings.js                     持仓数据标准化和展示辅助函数
```

## 上传与解析流程

当前推荐流程：

1. 用户在上传页选择截图。
2. `UploadPanel.js` 只保存文件并显示预览，不自动解析。
3. 用户点击“上传并解析”。
4. `app/page.js` 的 `parseScreenshot` 用 `fetch("/api/parse-holdings")` 上传 `FormData`。
5. `app/api/parse-holdings/route.js` 校验图片类型和大小，调用视觉模型。
6. 模型返回 JSON 后，后端清洗为统一结构。
7. 前端调用 `normalizeResult` 后进入结果页。

重要历史坑：

- 不要让“上传并解析”按钮走原生 `<form action="/api/parse-holdings-native">` 整页提交。
- 手机浏览器上 `onInput` 和 `onChange` 可能重复触发，导致多次上传和 `Load failed`。
- 现在 `UploadPanel.js` 只保留 `onChange`，并且只有点击按钮才解析。
- `/api/parse-holdings-native` 是旧兜底桥接接口，尽量不要再作为主流程使用。

## 结果页 UI 逻辑

结果页由 `app/page.js` 控制：

- `holdingView === "heatmap"` 显示 `HoldingTreemap`
- `holdingView === "chart"` 显示占比环图和持仓排行

当前设计选择：

- “持仓热力图 / 仓位占比”标题已隐藏。
- 图表外层半透明大框已去掉。
- “热力图 / 占比”切换按钮保留，独立放在底部居中。
- 切换按钮不能放在 `.card-title` 内，因为 `.holdings-card .card-title` 被隐藏了。

相关 CSS：

- `.holdings-card`
- `.holdings-card .card-title`
- `.holdings-view-controls`
- `.view-switch`
- `.heatmap`
- `.allocation-view`
- `.chart-holder`
- `.allocation-list`

## 热力图组件

`components/HoldingTreemap.js` 负责：

- 根据持仓占比生成矩形布局。
- 最多展示前 12 个持仓。
- 根据 `pnlPct` 生成红/绿/灰底色。
- 根据格子大小隐藏或压缩代码、占比、涨跌文字。

常改位置：

- 格子内文字：股票名、代码、涨跌、占比。
- `heatColor(value)`：热力图红绿配色。
- `treemapLayout`：矩形布局和小格子的文字密度判断。

## 占比图

占比图在 `app/page.js` 中用 Chart.js doughnut 实现。

当前展示方式：

- 左侧/上方为环图。
- 中心显示持仓数量。
- 旁边显示前 8 个持仓排行。
- Chart.js 自带 legend 已关闭，避免挤占空间。

常改位置：

- 环图颜色数组 `colors`
- `cutout`、`radius`、`borderWidth`
- `.allocation-view`
- `.allocation-row`

## 标注页 `/annotate`

`app/annotate/page.js` 是一个辅助页面，不是正式业务流程。

用途：

- 给用户一个线上可打开的网址。
- 用户可以直接在页面示意图上用鼠标或手指画线。
- 用户截图发回来后，开发者按圈选区域继续调 UI。

地址：

```txt
https://holding-analyzer.vercel.app/annotate
```

标注页样式都在 `app/globals.css` 后半段，类名多以 `annotate-`、`mock-`、`map-tag` 开头。

## 客户端日志

`lib/clientLog.js` 会把关键事件发到：

```txt
/api/client-log
```

常见事件：

- `page.handleFile.accepted`
- `page.handleFile.invalid`
- `page.parse.start`
- `page.parse.response`
- `page.parse.error`

排查线上问题时可以用：

```bash
vercel logs --environment production --since 2h --no-branch --expand --limit 50
```

之前 `Load failed` 就是通过日志确认发生在客户端上传请求阶段，而不是 PowerShell 或 Vercel 整站挂掉。

## Git 与临时文件

当前工作分支曾使用：

```txt
codex/竖构图探索
```

远端仓库：

```txt
https://github.com/milaotou001/portfolio-analysis-tool.git
```

临时生成过两张视觉示意图：

```txt
holdings-page-visual-map.png
holdings-page-visual-map.svg
```

这两张是辅助沟通产物，不属于正式应用代码，默认不要提交。

## 开发注意事项

- 修改上传逻辑时，优先保证手机 Safari/微信内置浏览器不发生整页跳转。
- 任何会上传文件的流程都要留在当前页面用 `fetch`。
- 修改 Vercel 环境变量后必须重新部署。
- 不要在回复中展示密钥、token、完整 API Key。
- 如果用户说“打不开”，先分清：
  - 首页打不开
  - 点上传后打不开
  - 解析接口失败
  - 模型返回格式不对
  - 浏览器缓存旧版本
- 如果线上问题无法复现，优先查 `vercel logs` 和 `client-log`。

## 验证清单

每次改完建议至少执行：

```bash
npm run build
```

上传链路相关改动，发布后要验证：

- 首页能打开。
- 选择截图后不自动上传。
- 点击“上传并解析”只发起一次解析。
- 失败时页面显示错误，不跳转到 API 页面。
- 成功时进入结果页。
- 底部“热力图 / 占比”按钮可见且可切换。
