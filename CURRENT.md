# CURRENT.md — 持仓分析工具

## 项目定位

持仓分析工具主线版本。上传手机股票持仓截图 → AI 视觉模型解析 → 前端展示持仓热力图和仓位占比。

**只做持仓分析，不涉及交易执行。**

---

## 快速启动

```bash
npm install
npm run dev        # http://localhost:3020
npm run build
npm run start
```

---

## 环境变量

复制 `.env.example` 为 `.env.local`：

```env
AI_API_KEY=your_server_side_key
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini
AI_PROVIDER=openai
```

---

## 目录结构

```txt
app/
  page.js                         — 主页面（上传/结果/分享）
  layout.js                       — 根布局
  globals.css                     — 全局样式
  annotate/page.js                — 标注辅助页
  api/
    parse-holdings/route.js       — 核心截图解析
    parse-holdings-native/route.js — 旧桥接接口（废弃）
    client-log/route.js           — 客户端日志
components/
  UploadPanel.js                  — 上传截图
  HoldingTreemap.js               — 持仓热力图
  ShareCardPanel.js               — 脱敏分享卡片
lib/
  holdings.js                     — 数据标准化和计算
  demoData.js                     — 示例数据
  clientLog.js                    — 日志上报
```

---

## 技术栈

- Next.js App Router
- Chart.js 4.4
- 支持 OpenAI 和 Anthropic 两种 AI 协议
- 部署平台：Vercel

---

## 项目边界

### 包含
- 持仓截图 OCR 解析
- 持仓热力图和占比图
- 脱敏分享卡片
- 示例数据预览

### 不包含
- 挂单价计算 / 止损单 / 限价单
- COMEX / GLD / IAU / SLV
- 交易执行功能
- 手动录入持仓（待开发）

---

## 下一步计划

1. 补齐板块分类体系（SECTOR_COLORS / SHADES / DISPLAY）
2. 增加 A股/美股/港股市场区分
3. 增加总资产/市值/现金汇总
4. 增加持仓盈亏（profit_pct / profit_val）
