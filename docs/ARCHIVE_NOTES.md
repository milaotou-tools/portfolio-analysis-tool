# 版本归档说明

## 唯一主线

**`portfolio-analysis-tool`** 是本项目的唯一主线版本。

- 本地目录：`D:\AIProjects\01-active\portfolio-analysis-tool`
- GitHub 仓库：`https://github.com/milaotou001/portfolio-analysis-tool`
- 分支：`main`

所有新功能开发和 bug 修复只在此仓库进行。

---

## 已归档的旧版本

以下仓库和目录均为历史版本或参考资料，**不再继续开发**：

| 旧版本 | 位置 | 归档原因 |
|--------|------|----------|
| portfolio-analyzer-v12 | GitHub `milaotou001/portfolio-analyzer-v12` | Next.js 重写早期版本，page.js 编码损坏，已被主线取代 |
| portfolio-analyzer | GitHub `milaotou001/portfolio-analyzer` | 单体 HTML 原型（v8.0），功能丰富但不可维护 |
| other-files | GitHub `milaotou001/other-files` | 杂物仓库，仅含 proxy.py 和提示词模板 |
| local-A（桌面本地） | `D:\AIProjects\00-triage\portfolio-tool-candidates\local\local-A` | 无版本控制的本地工作副本 |
| local-B（Codex 分支） | `D:\AIProjects\00-triage\portfolio-tool-candidates\local\local-B` | Codex worktree 分支，代码已迁移至主线 |
| 考古区 reports | `D:\AIProjects\00-triage\portfolio-tool-candidates\reports\` | 版本考古分析报告（只读） |

旧远程已在主线中保存为 `old-v12`，便于追溯：

```
old-v12 = https://github.com/milaotou001/portfolio-analyzer-v12.git
```

---

## 旧版本功能迁移规则

1. **禁止**从任何旧版本直接复制粘贴或继续开发；
2. 旧版本中确有价值的持仓分析功能，必须通过明确的 `RECOVERY_LIST` 逐项评估和迁移；
3. 迁移参考文档：`D:\AIProjects\00-triage\portfolio-tool-candidates\reports\RECOVERY_LIST.md`；
4. 每项迁移需独立分支、独立 PR、独立验证。

---

## 项目功能边界

本工具**只做持仓分析**，以下功能不在范围内：

- 挂单价计算
- COMEX 相关
- GLD / IAU / SLV
- 限价单 / 止损单 / 接回价
- 任何交易执行功能
