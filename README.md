# 持仓分析仪

Next.js 版手机持仓截图解析工具。

## 本地运行

```bash
npm install
npm run dev
```

开发服务默认运行在 `http://localhost:3020`。之前的静态预览服务可能还占着 `3017` 端口，所以这里单独使用 `3020`。

## 环境变量

复制 `.env.example` 为 `.env.local`，并配置服务端变量：

```bash
AI_API_KEY=你的阿里云百炼 API Key
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus
```

这些变量只在 Next.js 后端 Route Handler 中读取，不会暴露到浏览器。

## Vercel 部署

推荐使用 Vercel 部署。项目已经按 Next.js App Router 组织，`vercel.json` 指定了 `nextjs` 框架，解析接口使用 Node.js Runtime。

1. 在 Vercel 新建项目并导入当前仓库。
2. Framework Preset 选择 `Next.js`。
3. Build Command 使用默认的 `npm run build`。
4. 在 Project Settings -> Environment Variables 中添加：

```txt
AI_API_KEY=你的阿里云百炼 API Key
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus
```

5. 保存后重新部署。浏览器端不会拿到 `AI_API_KEY`，截图只会上传到 `/api/parse-holdings` 进行本次解析。

默认使用阿里云百炼 DashScope（OpenAI 兼容接口）。如需使用其他 OpenAI 兼容服务，修改 `AI_BASE_URL` 即可。如需使用 Anthropic，设置 `AI_PROVIDER=anthropic` 并配置对应的 `AI_BASE_URL` 和模型名。

## 主要结构

```txt
app/
  page.js
  layout.js
  globals.css
  api/parse-holdings/route.js
components/
  UploadPanel.js
  HoldingTreemap.js
  ShareCardPanel.js
lib/
  demoData.js
  holdings.js
```

旧版 `index.html` 保留为静态原型备份。
