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
AI_API_KEY=your_server_side_key
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini
AI_PROVIDER=openai
```

这些变量只在 Next.js 后端 Route Handler 中读取，不会暴露到浏览器。

## Vercel 部署

推荐使用 Vercel 部署。项目已经按 Next.js App Router 组织，`vercel.json` 指定了 `nextjs` 框架，解析接口使用 Node.js Runtime。

1. 在 Vercel 新建项目并导入当前仓库。
2. Framework Preset 选择 `Next.js`。
3. Build Command 使用默认的 `npm run build`。
4. 在 Project Settings -> Environment Variables 中添加：

```txt
AI_API_KEY=你的服务端 API Key
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini
AI_PROVIDER=openai
```

5. 保存后重新部署。浏览器端不会拿到 `AI_API_KEY`，截图只会上传到 `/api/parse-holdings` 进行本次解析。

如果使用 OpenAI 兼容中转站，保持 `AI_PROVIDER=openai`，把 `AI_API_URL` 改成中转站的 base URL 或 chat completions URL 即可。如果使用 Anthropic，把 `AI_PROVIDER` 改成 `anthropic`，并配置对应的 `AI_API_URL` 和模型名。

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
