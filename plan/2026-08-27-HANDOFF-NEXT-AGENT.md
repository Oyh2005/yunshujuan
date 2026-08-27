# 云舒卷（RAG Notebook）开发交接文档（给下一个 Agent）

> 更新：2026-08-27（最新一轮：全站 UI 改版 + lint 清零 + 风格统一）
> 用途：新窗口继续开发前，**必读本文件**，然后按需读：
> - `plan/2026-08-27-COMPLETED-OPTIMIZATIONS.md` —— 全部功能/优化的交付物、验证、踩坑总汇总
> - `plan/2026-08-26-feature-expansion-plan.md` —— 六方向企划
> - `plan/2026-08-27-scale-up-plan.md` —— 高并发升级路线（方向 D 阶段二/三）
> - `plan/2026-08-27-wechat-mini-program-plan.md` —— 微信小程序版规划（未开工）

---

## 1. 项目背景

**云舒卷**：AI 驱动的个人知识管理平台（笔记 + RAG + 间隔回顾 + 社交 + 页宠养成）。
- 后端：FastAPI + LangChain + ChromaDB + MySQL + Redis（`backend/`）
- 前端：React 19 + TypeScript + Vite 8 + **Tailwind CSS 4**（CSS-first）+ **React Router 7** + Zustand + framer-motion（`front/`）
- **目录不是 git 仓库**，改动无法回滚，改前必读原文件；用户会手动改代码，开工前先核对最近改动

## 2. 当前已完成功能总览（勿重复开发）

| 模块 | 说明 | 位置 |
| --- | --- | --- |
| 笔记 | Tiptap 编辑器、双链 `[[标题]]`、标签/分类/置顶、语义搜索、批量操作、导出 zip/HTML、打印 PDF、知识卡片图、公开分享 | `pages/NoteEditor.tsx`、`components/note/NoteCard.tsx` |
| 笔记列表 | **网格/列表双视图**（localStorage 记忆）、长按多选、排序、无限滚动、分类管理 | `pages/NoteList.tsx`、`notePresentation.ts` |
| 知识库 | 多格式上传（SSE）、切片详情、网页剪藏（防 SSRF）、多模态 PDF | `pages/KnowledgeBase.tsx` |
| AI 对话 | Agent + RAG + SSE 流式（思考步骤/引用来源） | `pages/AIChat.tsx` |
| 会话管理 | 列表/历史/删除（**历史截断 60 条子查询倒序取 id 再正序，勿改回**） | `pages/Sessions.tsx` |
| 回顾/打卡/番茄钟 | 艾宾浩斯 + LLM 出题；streak + 每日任务；25+5 番茄钟（页宠联动） | `DailyReview/HabitPage/PomodoroPage.tsx` |
| 仪表盘/图谱 | 热力图/趋势/环形图（自绘 SVG）+ 排行榜；d3-force 知识图谱 | `StatsPage/GraphPage.tsx` |
| 社交 | 好友/关注、动态流（图文/点赞评论）、通知红点、知识广场、个人主页成就墙 | `pages/SocialFeed/FriendsPage/NotificationsPage/PlazaPage/UserProfilePage.tsx`、`backend/app/router/social_router.py` |
| 分享 | 免登录分享页 `/share/:id` + 浏览计数 | `PublicSharePage.tsx`、`share_router.py`（含 `/public` API） |
| 页宠「小卷」 | 9 情绪、拖拽、好感度等级、形象切换、**养成数据云端同步** | `components/pet/`、`stores/usePetStore.ts`、`hooks/useSettingsSync.ts` |
| 全局 | 主题、i18n 中英、错误边界、⌘K 命令面板、Ctrl+N、侧边栏分组折叠动画、底部账号菜单 | `Sidebar.tsx`、`CommandPalette.tsx` |

## 3. 环境与重要注意事项（踩坑记录）

### 运行环境
1. **dev server 3000**（vite 代理→后端 8000）；**后端 8000 用户手动启动**，改后端代码需提醒用户重启
2. 测试账号 `admin / admin1234`（另 `admin2` 供社交体验）；MySQL 库 `rag_notebook` 运行中
3. **Redis 服务名 `rediszt3` 当前为停止**——未启动时 `/user/detail/` 会 500（get_user_info_from_redis 无容错），其余功能正常；启动：`Start-Service rediszt3`（管理员）
4. 后端启动：开发 `cd backend && .venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000`；生产 `.\start_prod.ps1`（4 workers）

### 沙箱验证方式
5. **pytest 沙箱跑不了**（tmp_path PermissionError）→ 后端验证用 **py_compile + 临时 uvicorn 801x 实测**（探针脚本断言，测后 kill + 清理数据）
6. **vite build/dev 沙箱跑不了**（spawn EPERM）→ 前端用 `npx tsc -b --noEmit` + `npx eslint src --ext .ts,.tsx`；CSS 可用 Node 直接调 `@tailwindcss/postcss` 编译验证（见历史做法）
7. **npm install 需指定缓存**：`--cache "D:\项目\RAGNotebook-master\.npm-cache" --no-audit --no-fund`
8. PowerShell 传中文 body 会编码损坏，后端断言必须用 Python/UTF-8 客户端

### 后端踩坑
9. **`@cache_with_redis` 不能装饰 FastAPI 路由 handler**（破坏 Depends 注入签名 → 401/参数丢失）；service 层可用
10. SQLAlchemy `Result` 是**游标式一次性迭代**——复用前必须 `.all()`（曾导致排行榜空）
11. 全局异常处理器把业务 404 改写为「接口不存在」——调试看后端日志而非响应文案
12. `note_router.dependencies = [Depends(ensure_note_service)]`：笔记路由等后台初始化；`/note/graph` 必须注册在 `/{note_id}` 之前
13. LLM 审核：JSON 解析须容忍代码块/前后文本；审核前 `await init_manager.models_ready.wait()`

### 前端踩坑（重要）
14. **⚠️ vite 代理 key 绝不能写成 SPA 页面路径本身**：`'/social'` 会连页面 `/social` 一起代理到后端 404（白屏）。现用正则子路径：`'^/social/'`、`'^/stats/'`、`'^/user/(login|logout|...)'`；分享 API 走 `/public` 别名（与页面 `/share/:id` 同形，代理无法区分）。**新增 API 前缀时先检查是否与页面路由冲突**
15. **Tailwind 4 类名语义变化**：`shadow-sm` 变弱、ring 默认 1px、无 `tailwind.config.cjs`（CSS-first：`@theme`/`@plugin`/`@custom-variant dark` 在 `index.css`）；JSX 全部用 `var(--color-*)` 任意值
16. **set-state-in-effect 规则**（React 19）：effect 体内禁止同步 setState；统一解法 = `setTimeout(0)` 包裹 或 异步回调内 setState。**全项目已清零，新代码必须保持**
17. **渲染期禁止**：写 ref（`handleSaveRef.current = x` 放 effect）、`Math.random`（purity 规则）、useMemo 内 mutation
18. **AuthImage**（带 token 头像）：StrictMode 双调用 effect，`mountedRef.current = true` 必须每次 effect 开头重置（曾因丢失导致头像不显示）
19. `usePetStore` 内部不要 `getState()` 自引用（TS7022）；`pet.config`/`habit.config` 双写云端（`useSettingsSync`，3s 防抖 + 登出 flush）
20. 修改 vite.config.ts 后 dev server 自动重启，浏览器需刷新

## 4. 剩余任务（按优先级）

### ✅ 全部里程碑已完成（M2/M3/M4、方向 A/B/C1/C2/C3、数据上云、D 阶段一、备选精选、UI 改版、lint 清零、风格统一）

> 每项的交付物/验证/踩坑见 `plan/2026-08-27-COMPLETED-OPTIMIZATIONS.md`，此处不重复。

### 最近一轮（用户主导 UI 改版 + 本 Agent 收尾）要点
- **用户重写了**：`MainLayout`/`Sidebar`（app-shell 卡片式布局、移动端 ≤767px 自动紧凑、底部账号菜单）、`NoteList`（网格/列表视图）、新增 `styles/workspace.css`（全站样式体系 + 分类色调）、`components/note/{NoteCard,TemplatePreview,notePresentation}`、i18n `note.ui.*`
- **本 Agent 收尾**：NoteEditor 2 error + 1 warning 修复；全项目 lint 清零（8 文件 set-state-in-effect + 3 exhaustive-deps + router react-refresh 文件级 disable）；37 处按钮统一为 `primary-button`/`secondary-button`/`workspace-icon-button`；AuthImage mountedRef 修复；侧边栏父级 15px > 子级 14px + 子项缩进 26px 阶梯

### 🔜 待办（按触发条件）
| 项 | 触发条件 | 参考 |
| --- | --- | --- |
| 方向 D 阶段二：模型服务拆分（embedding/reranker 独立 + 任务队列） | 活跃用户接近 1000 | `scale-up-plan.md` |
| 方向 D 阶段三：大规模架构 | 几千用户 | `scale-up-plan.md` |
| 微信小程序版（Taro + 微信登录） | 用户决定开工 | `wechat-mini-program-plan.md` |
| PWA 化 / 年度报告页 | 有空 | — |
| 打开全局限流 `RATE_LIMIT_ENABLED=true` | 上线公网 | — |

## 5. 设计约定（新体系）

- **样式体系**：`styles/workspace.css` 提供全站类——按钮用 `primary-button`（紫色渐变主按钮）/`secondary-button`（描边次按钮）/`workspace-icon-button`（32px 图标按钮）、下拉菜单 `workspace-menu*`、页面容器 `app-shell/app-workspace`、侧边栏 `app-sidebar/sidebar-*`；笔记页用 `notes-page` 系列。**新 UI 一律用这些类，勿回退旧式内联类**
- 颜色全部走 CSS 变量（`var(--color-*)` / `var(--category-*-bg|text)` / `--gradient-brand`），明暗主题在 `index.css` `:root`/`.dark`
- 侧边栏层次：组标题 15px 半粗靠左，子项 14px 缩进 26px（阶梯），折叠时子项居中覆盖
- 新功能文案必须中英双语（`i18n/locales/zh-CN.ts` + `en-US.ts` 结构一致，改后跑 tsc）；笔记相关文案放 `note.ui.*`
- 删除类操作必须二次确认（`ConfirmDialog`）
- 页面入口：Sidebar `navGroups`（分组）+ router lazy + i18n `nav.*`
- 与页宠联动：成功回调里 `usePetStore.getState().trigger('事件')`（事件类型见 usePetStore.ts，含 note_saved/review_done/doc_uploaded/ai_done/post_created/pomodoro_done）
- 动画：framer-motion（舒展/弹窗）或 CSS transform/opacity；页面入场 `FadeIn`

## 6. 交付检查清单（每次改动后）

- [ ] `npx tsc -b --noEmit` 0 错误
- [ ] `npx eslint src --ext .ts,.tsx` **0 问题**（全项目已清零，保持）
- [ ] 后端 `py_compile` 通过 + 关键接口临时 uvicorn 实测（探针断言，测后清理）
- [ ] i18n 中英完整、无结构破坏
- [ ] 新增 API 前缀检查 vite 代理冲突（见踩坑 14）
- [ ] 提醒用户：后端改动需重启 8000；前端改动刷新浏览器；vite.config 改动尤其需要
