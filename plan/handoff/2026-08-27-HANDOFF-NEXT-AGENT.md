# 云舒卷（RAG Notebook）开发交接文档（给下一个 Agent）

> 更新：2026-08-29（最新一轮：性能优化三批 + 限流调整 + libmagic 修复 + 首页/AI/学习页 UI 改版 + Git 接入 + **AI 对话延迟优化（HyDE 限长 + RAG 上下文截断 + Agent 真流式）**）
> 用途：新窗口继续开发前，**必读本文件**，然后按需读：
> - `plan/handoff/2026-08-27-COMPLETED-OPTIMIZATIONS.md` —— 全部功能/优化的交付物、验证、踩坑总汇总
> - `plan/records/2026-08-29-ai-chat-latency-optimization.md` —— AI 对话延迟优化专题（发现→分析→解决全记录，含简历素材）
> - `plan/records/2026-08-29-ai-chat-latency-interview-qa.md` —— 同上项目的面试问答素材（数据怎么测的、预判追问应对）
> - `plan/fixes/2026-08-29-ai-chat-flash-fix.md` —— 新会话首问闪屏排查全记录（MainLayout key 重挂载根因 + 双层修复）
> - `plan/records/2026-08-29-client-cache-plan.md` —— 客户端缓存方案（HTTP 缓存头 + ETag 已实施 / 前端 SWR 已实施 / PWA 待做，含接口级配置清单）
> - `plan/roadmap/2026-08-29-next-steps-plan.md` —— 下一步规划（小程序/PWA/年度报告/体验打磨/稳定性/线上化，按触发条件分类）
> - `plan/roadmap/2026-08-26-feature-expansion-plan.md` —— 六方向企划
> - `plan/roadmap/2026-08-27-scale-up-plan.md` —— 高并发升级路线（方向 D 阶段二/三）
> - `plan/roadmap/2026-08-27-wechat-mini-program-plan.md` —— 微信小程序版规划（未开工）
> - `plan/fixes/2026-08-29-libmagic-chinese-path-fix.md` —— libmagic 中文路径问题排查记录
> - `docs/user-guide.md` —— 面向普通用户的产品说明（零技术术语）

---

## 1. 项目背景

**云舒卷**：AI 驱动的个人知识管理平台（笔记 + RAG + 间隔回顾 + 社交 + 页宠养成）。
- 后端：FastAPI + LangChain + ChromaDB + MySQL + Redis（`backend/`）
- 前端：React 19 + TypeScript + Vite 8 + **Tailwind CSS 4**（CSS-first）+ **React Router 7** + Zustand + framer-motion（`front/`）
- **✅ 已是 git 仓库**（2026-08-28 初始化）：远程 `origin → https://github.com/Oyh2005/yunshujuan.git`（分支 `main`）
- **⚠️ 本地领先远程 16 个提交未推送**——开新会话后优先提醒用户 `git push`（凭据/PAT 由用户本机操作）
- 用户会手动改代码，开工前先 `git status` 核对最近改动

## 2. 当前已完成功能总览（勿重复开发）

| 模块 | 说明 | 位置 |
| --- | --- | --- |
| 首页 Dashboard | 登录后进入 `/`：欢迎横幅/快捷操作/最近记录/图谱预览/页宠成长卡，部分失败可重试 | `pages/Dashboard.tsx`、`styles/dashboard.css` |
| 笔记 | Tiptap 编辑器、双链 `[[标题]]`、标签/分类/置顶、语义搜索、批量操作、导出 zip/HTML、打印 PDF、知识卡片图、公开分享 | `pages/NoteEditor.tsx`、`components/note/NoteCard.tsx` |
| 笔记列表 | **网格/列表双视图**（localStorage 记忆）、长按多选、排序、无限滚动、分类管理 | `pages/NoteList.tsx`、`notePresentation.ts` |
| 知识库 | 多格式上传（SSE）、切片详情、网页剪藏（防 SSRF）、多模态 PDF | `pages/KnowledgeBase.tsx` |
| AI 对话 | Agent + RAG + SSE 流式（思考步骤/引用来源）；**知识库工具**（`get_knowledge_docs_tool`/`get_knowledge_content_tool`，总结知识库可读文档列表与内容） | `pages/AIChat.tsx`、`components/ai/AiWorkspace.tsx`、`agent_tools.py` |
| 会话管理 | 列表/历史/删除（**历史截断 60 条子查询倒序取 id 再正序，勿改回**）；**自定义名称 + 置顶**（`PATCH /chat/session/{id}`，custom_title 优先于自动标题，置顶排序 pinned_at 降序） | `pages/Sessions.tsx`、`api/sessions.ts`、`components/common/PromptDialog.tsx` |
| 回顾/打卡/番茄钟 | 艾宾浩斯 + LLM 出题；streak + 每日任务；25+5 番茄钟（页宠联动） | `DailyReview/HabitPage/PomodoroPage.tsx`、`components/learning/LearningLayout.tsx` |
| 仪表盘/图谱 | 热力图/趋势/环形图（自绘 SVG）+ 排行榜；d3-force 知识图谱（语义关联按需加载） | `StatsPage/GraphPage.tsx` |
| 社交 | 好友/关注、动态流（图文/点赞评论）、通知红点、知识广场、个人主页成就墙 | `pages/SocialFeed/FriendsPage/NotificationsPage/PlazaPage/UserProfilePage.tsx`、`backend/app/router/social_router.py` |
| 分享 | 免登录分享页 `/share/:id` + 浏览计数 | `PublicSharePage.tsx`、`share_router.py`（含 `/public` API） |
| 页宠「小卷」 | 9 情绪、拖拽、好感度等级、形象切换、**养成数据云端同步** | `components/pet/`、`stores/usePetStore.ts`、`hooks/useSettingsSync.ts` |
| 全局 | 主题、i18n 中英、错误边界、⌘K 命令面板、Ctrl+N、侧边栏分组折叠动画、底部账号菜单 | `Sidebar.tsx`、`CommandPalette.tsx` |

**页面布局体系**（2026-08-28/29 建立）：`knowledge-pages.css`（知识库/广场/统计/图谱）+ `ai-pages.css`（AI 对话/会话）+ `learning-pages.css`（回顾/习惯/番茄钟）+ `dashboard.css`（首页），对应 `KnowledgeLayout`/`AiWorkspace`/`LearningLayout` 布局组件（含统一顶栏/搜索/页宠开关）。

## 3. 环境与重要注意事项（踩坑记录）

### 运行环境
1. **dev server 3000**（vite 代理→后端 8000）；**后端 8000 用户手动启动（--reload）**，改后端代码会自动重载，但保险起见提醒用户确认
2. 测试账号 `admin / admin1234`（另 `admin2` 供社交体验）；MySQL 库 `rag_notebook` 运行中
3. **Redis**：服务名 `rediszt3` 显示 Stopped，但**本机有 redis-server 进程监听 127.0.0.1:6379（实际可用）**。Redis 挂了也不再致命——限流/缓存/用户信息全部降级（见踩坑 15/16）。`.env` 中 `REDIS_HOST=127.0.0.1`（**勿改回 localhost**，见踩坑 19）、`REDIS_DB=0`
4. 后端启动：开发 `cd backend && .venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000`；生产 `.\start_prod.ps1`（4 workers）
5. **限流已开启**（`RATE_LIMIT_ENABLED=true`）：全局限流 300 次/分钟；普通读写接口 120 次/分钟；上传 10、剪藏 6、模板/社交写/聊天流 30。**限流 key 含端口**（`rate_limit:/path:port:ip`），同机多实例互不干扰
6. **模型配置**：对话=DeepSeek 云端（`deepseek-v4-flash`）；嵌入=本地 Ollama（`nomic-embed-text`）；重排序=本地 bge-reranker-v2-m3（**2026-08-29 已自动补全下载 2.17GB**，之前一直缺失导致重排序静默失败降级）

### 沙箱验证方式
5. **pytest 沙箱跑不了**（tmp_path PermissionError）→ 后端验证用 **py_compile + 临时 uvicorn 801x 实测**（探针脚本断言，测后 kill + 清理数据）
6. **vite build/dev 沙箱跑不了**（spawn EPERM）→ 前端用 `npx tsc -b --noEmit` + `npx eslint src --ext .ts,.tsx`；CSS 可用 Node 直接调 `@tailwindcss/postcss` 编译验证（见历史做法）
7. **npm install 需指定缓存**：`--cache "D:\项目\RAGNotebook-master\.npm-cache" --no-audit --no-fund`
8. PowerShell 传中文 body 会编码损坏，后端断言必须用 Python/UTF-8 客户端

### 后端踩坑
9. **`@cache_with_redis` 不能装饰 FastAPI 路由 handler**（破坏 Depends 注入签名 → 401/参数丢失）；service 层可用；返回 tuple 的方法也不能直接用（序列化问题），手动 `RedisCache.get_or_set` 或 get/set_redis_cache
10. SQLAlchemy `Result` 是**游标式一次性迭代**——复用前必须 `.all()`（曾导致排行榜空）
11. 全局异常处理器把业务 404 改写为「接口不存在」——调试看后端日志而非响应文案
12. `note_router.dependencies = [Depends(ensure_note_service)]`：笔记路由等后台初始化；`/note/graph` 必须注册在 `/{note_id}` 之前
13. LLM 审核：JSON 解析须容忍代码块/前后文本；审核前 `await init_manager.models_ready.wait()`
14. **⚠️ 项目路径含中文**（`D:\项目\...`）：libmagic 等 C 库的 fopen 用 ANSI 解释 UTF-8 路径 → 打不开文件。知识库上传已做修复（`_get_magic_mime` 复制 mgc 到英文临时路径），**新接入 C 库依赖时注意**；详见 `plan/fixes/2026-08-29-libmagic-chinese-path-fix.md`
15. **Redis 容错已全面铺开**：限流/缓存装饰器/`get_user_info_from_redis` 全部 try/except 降级；连接池 `socket_connect_timeout=0.5s` + `socket_timeout=2s`（Redis 挂时快速失败，不拖慢请求）
16. **redis_config 必须保留自身的 `load_dotenv()`**（曾因 import 顺序导致 REDIS_DB 静默用默认值 3 而非 .env 的 0，配置漂移难排查）
16b. **⚠️ 限流 key TTL 兜底（08-29）**：`rate_limit.py` 的 `incr` 不更新 TTL——若 key 过期时间意外丢失（Redis 重启恢复旧数据等），计数永久累积（TTL=-1）→ **全站永久 429「请求过于频繁」**。已修复：incr 后查 TTL，<0 时补 `expire`（保留计数）。**遇全站 429 先查 `redis-cli KEYS "rate_limit:*"` 的 TTL，-1 即此问题，DEL 即可恢复**
17. **⚠️ PowerShell `Get-Content` 默认 GBK 解码**：改 `.env` 等含中文注释的文件会永久乱码（曾踩坑，已手动重建 .env）。**改配置文件用编辑器或 Python/.NET 显式 UTF-8**
18. 探针脚本注意：`call(method, path, token)` 位置参数会把 token 传成 body 导致 401 假象——用关键字 `token=token`

### 前端踩坑（重要）
19. **⚠️ vite 代理 key 绝不能写成 SPA 页面路径本身**：`'/social'` 会连页面 `/social` 一起代理到后端 404（白屏）。现用正则子路径：`'^/social/'`、`'^/stats/'`、`'^/user/(login|logout|...)'`；分享 API 走 `/public` 别名（与页面 `/share/:id` 同形，代理无法区分）。**新增 API 前缀时先检查是否与页面路由冲突**
20. **Tailwind 4 类名语义变化**：`shadow-sm` 变弱、ring 默认 1px、无 `tailwind.config.cjs`（CSS-first：`@theme`/`@plugin`/`@custom-variant dark` 在 `index.css`）；JSX 全部用 `var(--color-*)` 任意值
21. **set-state-in-effect 规则**（React 19）：effect 体内禁止同步 setState；统一解法 = `setTimeout(0)` 包裹 或 异步回调内 setState。**全项目已清零，新代码必须保持**
22. **渲染期禁止**：写 ref（`handleSaveRef.current = x` 放 effect）、`Math.random`（purity 规则）、useMemo 内 mutation
23. **AuthImage**（带 token 头像）：StrictMode 双调用 effect，`mountedRef.current = true` 必须每次 effect 开头重置（曾因丢失导致头像不显示）
24. `usePetStore` 内部不要 `getState()` 自引用（TS7022）；`pet.config`/`habit.config` 双写云端（`useSettingsSync`，3s 防抖 + 登出 flush）
25. 修改 vite.config.ts 后 dev server 自动重启，浏览器需刷新
26. **429 前端提示已直白化**：拦截器全局 toast「请求过于频繁」；各页面错误横幅区分 429（`error === 'rate'`）显示限流文案而非「加载失败」
27. **⚠️ AIChat 新会话首问防闪屏**：首问回答完 onDone 自动 `navigate('/chat/:id')`。**真正的闪屏根因（08-29 深挖）**：`MainLayout` 的 `<div key={location.pathname}>` 在路径变化时强制卸载重挂载整个页面——AIChat 的守卫 ref 随组件销毁重置、消息清空、历史重载、淡入动画重播。**修复双层**：① MainLayout key 归一化（`/chat` 与 `/chat/:id` 同 key `/chat`，会话切换不重挂载；其他页面不变）② AIChat 内 `activeSessionRef`（内存消息归属）+ `messagesRef`（effect 同步快照）守卫，历史加载 effect 开头判断「内存消息即该会话刚聊的」则跳过重载。**改 AIChat 历史加载逻辑时保留此守卫**；渲染期写 ref 会触发 eslint refs 规则，同步 ref 必须放 effect 里。⚠️ **守卫误判修复**：activeSessionRef 必须在**历史加载成功后**才更新（切到其他会话再切回时不误判跳过加载，导致会话内容"消失"）；加载失败时置 null 禁止守卫命中
28. **⚠️ 回答落库不依赖客户端连接**（08-29）：`add_message` 原在主生成器里——用户切出页面（SSE 断开 → 生成器 close）后永不执行，会话创建但 0 条消息（标题仍"新的对话"）。**已移到 `run_agent` 内（agent_done.set() 之前）**：独立任务不随连接取消，断开后回答照常完整入库。**完整管线已独立**：`chat.py stream_with_rag_thinking` 重构为 `run_pipeline` 独立任务（RAG 前置 → Agent 流式 → 落库全在任务内），主生成器只转发队列事件——**RAG 阶段断开（Agent 未启动）也会跑完入库**（实测：2s 断开 → 60s 后历史完整；RAG 失败不阻断 Agent）。错误路径仍不写历史。改这两处时勿把落库移回生成器

## 4. 剩余任务（按优先级）

### ⚠️ 立即事项
- **本地 16 个提交未推送 `origin/main`**——提醒用户执行 `git push`（凭据/PAT 由用户本机操作，沙箱无凭据）

### ✅ 全部里程碑已完成（M2/M3/M4、方向 A/B/C1/C2/C3、数据上云、D 阶段一、备选精选、UI 改版、lint 清零、风格统一）

> 每项的交付物/验证/踩坑见 `plan/handoff/2026-08-27-COMPLETED-OPTIMIZATIONS.md`，此处不重复。

### 最近两轮工作要点
**① 首页 + 知识页改版（08-28）**：Dashboard 首页（淡紫横幅/云朵插画/快捷操作/最近记录/图谱预览/成长卡）；KnowledgeBase/Plaza/Stats/Graph 统一 `KnowledgeLayout` + `knowledge-pages.css`；图谱语义关联按需加载（`include_semantic` + `semantic_status`）；空标签兜底；页宠拖拽边界钳制

**② 性能优化三批（08-29，均已验证）**：
- 限流：开启 + 按路径/端口计数 + Redis 降级 + 配额 300/120/30/10/6
- 数据库：tag 过滤下沉 SQL、复合索引 `(user_id, is_pinned, updated_at)`、asyncmy 驱动、pool_pre_ping/recycle、慢查询日志（`SLOW_QUERY_THRESHOLD_MS`）
- 缓存：笔记列表 30s + 详情 300s（写操作失效）、重排序结果 10min、`/user/detail/` Redis 容错
- **HTTP 客户端缓存（08-29）**：`app/core/http_cache.py`（域通用 note/chat）——`{domain}_version:{user_id}` ETag 版本化（写操作 INCR）+ `Cache-Control: private, max-age`（笔记列表 30/详情 300/stats 60/会话列表 30）+ If-None-Match 304 短路（查数据前判断）；media 静态文件 86400。实测 304/写后失效全通过。**新读接口沿用此模式**
- **AI 路由启发式（08-29）**：`chat.py _should_skip_rag`——≤4 字符短查询 + 自我认知正则（"你是谁/介绍一下你…"）跳过 RAG 前置（向量分数对闲聊与知识问题无区分度，实测 0.54~0.59 重叠）；合并 compute_route_score 与 Top-1 检索为一次 similarity_search（省一次 embedding）。实测闲聊 20.5s→2.8s
- 修复：N+1（好友/粉丝/关注批量查询）、Redis 配置漂移（load_dotenv）、localhost→127.0.0.1、libmagic 中文路径（上传降级）

**③ AI/学习页布局（08-29）**：`AiWorkspace`/`LearningLayout` + `ai-pages.css`/`learning-pages.css`（AIChat/Sessions/DailyReview/HabitPage/PomodoroPage）

**④ AI 对话延迟优化（08-29，实测验证）**：
- **HyDE 限长**：`rag_service.generate_hypothetical_document` 提示词改「简短假设性回答（150字以内）」+ `self.chat_model.bind(max_tokens=150)`。不限长时 DeepSeek 生成 1000~2000 字假设文档耗时 8~40s，限长后 ~1.8s（检索质量不受影响，实测仍返回 1 笔记 + 4 知识库文档）
- **RAG 上下文截断**：`chat.py` 注入 Agent 的 `rag_context` 每文档截断至 600 字（重排序仍用全文）
- 实测对比（带 RAG 典型问题）：总耗时 24.0s→12.6~15.1s、最坏 49.3s→8.7s（HyDE 40.4s→2.6s）
- **Agent 真流式（08-29 晚）**：`agent.py get_agent_stream_response` 弃用 `astream` 假流式（完整响应生成后按 15 字/30ms 播放），改用 `astream_events(version="v1")` 监听 `on_chat_model_stream` 逐 token 转发（planning 阶段无 content 不会误转发；DeepSeek 推理内容在 reasoning_content 不进 content）；完整回答仍拼接供会话落库；工具日志改监听 `on_tool_end`。前端零改动（useSSE 已有 3 条缓冲 + rAF 合并）。实测同查询：总耗时 15.1s→7.9s，reorder 后到首字 8.7s→2.9s，回答 token 级实时播放
- **剩余瓶颈**：Agent 首轮 tool-calling LLM 调用 2.7~11.2s（DeepSeek 服务端波动为主，非本地可控）；路由判断偶发 2~3.8s（Chroma 波动）
- 探针脚本（可复用复测）：`backend/.probe_ai_perf.py`（SSE 时间线）、`backend/.probe_verify*.py`（DeepSeek 对照实验）

**⑤ 会话自定义名称 + 置顶（08-29，实测验证）**：
- **表结构**：`chat_sessions` 新增 `custom_title`（用户自定义名，优先于自动标题）、`is_pinned`、`pinned_at`（重启自动 ALTER 迁移）
- **API**：`PATCH /chat/session/{id}`，body 支持 `{title?, is_pinned?}`——只更新显式传入字段（Pydantic `model_fields_set` 判断）；`title=''` 清除自定义名回退自动标题；无字段更新返回 400；越权 404
- **列表排序**：`get_user_sessions` 置顶优先（pinned_at 降序）→ 其余 updated_at 降序；返回 `title`（展示名）+ `custom_title`/`is_pinned`/`pinned_at`
- **前端**：Sessions 页每行置顶/重命名/删除三按钮（hover 显示，置顶态高亮+淡紫底）；重命名弹窗 = 新组件 `components/common/PromptDialog.tsx`（通用输入弹窗，可复用）；AIChat 侧栏最近会话同步置顶排序 + 置顶标记
- **踩坑**：`run_sync` 提交后访问过期属性触发 MissingGreenlet → commit 后需 `await db.refresh(session)`；`func` 需显式 import

**⑥ Agent 知识库工具（08-29，实测验证）**：
- **背景**：「总结我的知识库」只输出笔记、漏掉 4 份知识库文档且文档名靠模型猜测——根因是 Agent 工具集只有笔记工具，拿不到知识库数据
- **新增**：`agent_tools.py` 加 `get_knowledge_docs_tool`（文档列表：文件名/切片数/预览）+ `get_knowledge_content_tool`（按文档取切片内容，`max_chunks` 默认 5，超出提示剩余切片数）；`agent.py` 默认工具集注册（现共 10 个）
- **`get_note_stats_tool` 扩展**：附带返回知识库文档数（标注与笔记不同源）
- **`main_prompt.txt`**：明确「笔记 vs 知识库文档」两个独立数据源，总结知识库须两部分覆盖；回答风格要求「直接给结论、不叙述工具调用过程」
- 实测：问「总结我的知识库」→ Agent 依次调 docs 工具 + 4 次 content 工具，完整总结 4 份文档（内容准确，含各文档要点/价值判断），不再编造文档名
- **AI 消息 HTML 渲染（08-29 追加）**：LLM 会输出 `<details><summary>答案</summary>` 折叠结构，AIChat 原 ReactMarkdown 无 rehype-raw → 标签以纯文本显示。修复：新增 `AssistantMarkdown` 组件（AIChat.tsx）——DOMPurify 白名单清洗（允许 details/summary/常用标签，禁 data/aria 属性）+ `rehypeRaw` 渲染；`main_prompt` 正向引导折叠结构可用 details。**注意：新渲染 AI 消息一律走 AssistantMarkdown（sanitize + raw），勿直接用 ReactMarkdown**
- **GFM 表格渲染（08-29 追加）**：react-markdown 默认不支持 GFM 表格——AI/笔记里的 markdown 表格被当普通段落，行内换行按段落 soft-break 规则渲染为空格（看起来像单行 `|` 拼接）。**已装 `remark-gfm`**：AIChat `AssistantMarkdown` 与 TiptapEditor preview 均加 `remarkPlugins={[remarkGfm]}`（表格/删除线/任务列表）。**新增 markdown 渲染处记得带 remarkGfm**

### 🔜 待办（按触发条件）
| 项 | 触发条件 | 参考 |
| --- | --- | --- |
| 方向 D 阶段二：模型服务拆分（embedding/reranker 独立 + 任务队列） | 活跃用户接近 1000 | `scale-up-plan.md` |
| 方向 D 阶段三：大规模架构 | 几千用户 | `scale-up-plan.md` |
| 路由阈值 0.5 过松：「你好」类闲聊也触发 RAG 白等 HyDE；合并 `compute_route_score` 与 Top-1 检索（省一次 embedding）；路由判断偶发 2~3.8s 待定位 | 有空 | 交接文档 §4 ④ |
| 微信小程序版（Taro + 微信登录） | 用户决定开工 | `wechat-mini-program-plan.md` |
| PWA 化 / 年度报告页 | 有空 | — |
| 游标分页（笔记/动态深翻页）、社交列表缓存、静态资源 gzip 上线 | 有空 | 性能优化建议清单 |

## 5. 设计约定（新体系）

- **样式体系**：`styles/workspace.css` 提供全站类——按钮用 `primary-button`（紫色渐变主按钮）/`secondary-button`（描边次按钮）/`workspace-icon-button`（32px 图标按钮）、下拉菜单 `workspace-menu*`、页面容器 `app-shell/app-workspace`、侧边栏 `app-sidebar/sidebar-*`；笔记页用 `notes-page` 系列。**新 UI 一律用这些类，勿回退旧式内联类**
- **页面布局**：知识页（知识库/广场/统计/图谱）用 `KnowledgeLayout` + `knowledge-pages.css`；AI 页（对话/会话）用 `AiWorkspace` + `ai-pages.css`；学习页（回顾/习惯/番茄钟）用 `LearningLayout` + `learning-pages.css`；首页 `dashboard.css`。**新页面按所属域接入对应布局，不新起一套**
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
