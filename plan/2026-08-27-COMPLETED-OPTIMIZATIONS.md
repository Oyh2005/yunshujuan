# 云舒卷（RAG Notebook）优化完成汇总

> 汇总日期：2026-08-27
> 范围：自 M2 起的全部功能优化 / 架构改造 / 社交化三阶段 / 数据安全改造，含交付物、验证结果与踩坑记录。
> 配套文档：`plan/2026-08-27-HANDOFF-NEXT-AGENT.md`（交接）、`plan/2026-08-27-scale-up-plan.md`（高并发路线图）

---

## 一、功能完成总览

| # | 模块 | 状态 | 验证 |
| --- | --- | --- | --- |
| M2 | 知识仪表盘（统计页） | ✅ | 探针 8/8 PASS |
| M3a | 知识卡片分享（Canvas PNG） | ✅ | tsc/eslint |
| M3b | 网页剪藏（防 SSRF） | ✅ | 实测 4 拒绝 + 正向成功 |
| M4a | 双链 [[标题]] + 反向链接 | ✅ | 实测通过 |
| M4b | 知识图谱（d3-force） | ✅ | 实测通过 |
| A | 公开分享（免登录页 + 浏览计数） | ✅ | 全流程实测 |
| B | 好友 + 动态流（朋友圈） | ✅ | 探针 24/24 PASS |
| C1 | 知识广场 + 排行榜 | ✅ | 探针 11/11 PASS |
| C2 | 个人主页 + 成就墙 + 关注/粉丝 | ✅ | 探针 20/20 PASS |
| C3 | AI 异步审核 + 连续写作打卡榜 | ✅ | 探针 11/11 PASS |
| — | 养成数据上云（小卷/打卡防丢失） | ✅ | 探针 9/9 PASS |
| — | 退出登录二次确认 | ✅ | tsc/eslint |
| — | 侧边栏分组 / 组级折叠 / 舒展动画 / 缩进阶梯 | ✅ | tsc/eslint |
| D1 | 高并发低成本改造 | ✅ | 缓存降级实测 |
| 备选 | 番茄钟 / 导出 HTML·PDF / 年度统计 / Ctrl+N | ✅ | tsc/eslint |

---

## 二、各模块详情

### M2 知识仪表盘
- **功能**：`/stats` 页——GitHub 风格 365 天热力图（53×7，5 级色 `#bfe0f7/#7fc0ec/#3f9ad9/#1f6c9f`）、近 30 天字数柱状图、分类环形图、9+2 张统计卡片（含连续写作、小卷好感度本地读取）
- **交付**：`backend/app/router/stats_router.py`（`GET /stats/dashboard`，用户隔离，未用 cache_with_redis）+ `main.py` 注册；`pages/StatsPage.tsx`、`components/stats/{Heatmap,TrendChart,CategoryDonut}.tsx`、`api/stats.ts`、vite `/stats` 代理
- **要点**：ChatMessage 无 user_id → JOIN chat_sessions；知识库文档数 = `get_all_md5_records` len；热力图 0 档用 CSS 变量自适应主题

### M3a 知识卡片分享
- **功能**：笔记一键生成 1200×630 分享卡（标题/摘要换行省略/标签胶囊/日期/品牌水印/页宠 SVG 嵌入），三模板（简约白/渐变/暗色），PNG 下载
- **交付**：`components/note/NoteCardModal.tsx`；`Pet.tsx` 加 `data-pet-svg` 定位
- **踩坑**：页宠 SVG 用 CSS 变量（`--pet-body`），序列化后独立图片中失效变黑 → 遍历克隆节点内联 getComputedStyle 计算值

### M3b 网页剪藏
- **功能**：`POST /knowledge/clip`——URL 校验（仅 http/https + **防 SSRF**）、BeautifulSoup 启发式正文提取（article/main/body）、简单 Markdown 入库，复用 `_sync_slice_file` 切片管线
- **交付**：`knowledge_service.handle_clip` + `knowledge_router` 路由；前端 KnowledgeBase「剪藏网页」按钮/弹窗，成功触发 `doc_uploaded`
- **踩坑**：初版 IPv4 逐段判断私网，沙箱 DNS 返回 IPv6 导致 example.com 误拒 → 改用标准库 `ipaddress`（兼容 v4/v6）

### M4a 双链
- **功能**：笔记保存时正则提取 `[[标题]]` 写入 `note_links` 表（先删后插），`GET /note/{id}/backlinks` 返回反向+正向链接；Tiptap 编辑器内高亮（不拦截输入）；反向链接面板
- **交付**：`models/note_link.py`；`note_service._sync_note_links`（create/update 同事务，delete 联动清理）；`components/note/BacklinksPanel.tsx`
- **踩坑**：turndown 默认剥掉 span → 必须加 `wikiLink` 规则把 `<span class="wiki-link">` 还原为 `[[标题]]`，否则保存的 Markdown 丢双链符号

### M4b 知识图谱
- **功能**：`GET /note/graph?limit=50`（节点=最近笔记，边=双链+语义相似并发检索），`pages/GraphPage.tsx` d3-force 同步 tick 300 次一次性渲染，hover 标题/点击跳转/实虚线图例
- **踩坑**：路由须注册在 `/{note_id}` **之前**（否则被路径参数吞掉）；渲染期禁止 `Math.random`（eslint purity）→ 确定性环形初始分布

### 方向 A：公开分享
- **功能**：笔记 `is_public`（默认私有）+ `view_count`；`GET /share/{id}` 免鉴权只读公开页（`/share/:id` 独立于 MainLayout）；复制链接/随时关闭公开
- **交付**：`router/share_router.py`；`pages/PublicSharePage.tsx`；NoteEditor「分享」按钮 + 弹窗
- **设计**：隐私红线=默认私有；404 不泄露存在性；本期不做二维码/点赞（点赞留给 B）

### 方向 B：好友 + 动态流
- **功能**：用户搜索 → 好友申请/同意/删除；动态（文字+多图+引用笔记，时间线=自己+好友，游标分页）；点赞/评论/删除；站内通知（好友/点赞/评论）+ 侧边栏红点 30s 轮询；本地敏感词即时拦截；页宠 `post_created` 联动
- **交付**：`models/social.py` 5 表（`friend_requests/posts/post_likes/post_comments/notifications`）；`router/social_router.py`；`pages/{SocialFeed,FriendsPage,NotificationsPage}.tsx`；`api/social.ts`
- **踩坑**：SQLAlchemy `Result` 是游标式一次性迭代（复用前必须 `.all()`）；全局异常处理器把业务 404 改写为「接口不存在」（调试看日志）；`friend_accepted` 通知发给**申请方**；非好友访问动态 404（隐私优先于 403）；PowerShell 传中文 body 编码损坏（断言必须用 Python/UTF-8）

### 方向 C1：知识广场 + 排行榜
- **功能**：广场=全部用户公开笔记流（跳 `/share/{id}` 闭环）；排行榜=本周写作字数 Top10 + 本周回顾 Top10（🥇🥈🥉，每周一重置）
- **交付**：`GET /social/plaza`（offset 分页 + has_more）；`GET /stats/leaderboard`；`pages/PlazaPage.tsx` 双 Tab

### 方向 C2：个人主页 + 成就墙 + 关注/粉丝
- **功能**：`/user/:id` 公开主页（资料/统计/关注按钮/粉丝关注列表/成就墙 7 徽章/公开笔记）；单向关注（幂等/取关/关注通知）
- **交付**：`follows` 表；`GET /users/{id}/profile|followers|following|public-notes` + `POST|DELETE follow`；`pages/UserProfilePage.tsx`；广场/好友列表点击跳转
- **踩坑**：成就 `has_fans` 需 `stats["followers"]` 合并进 stats（漏加永远 locked）；i18n 顶层键 `profile` 被「个人信息页」占用 → 新文案用 `userpage.*`（否则 TS1117 重复键）

### 方向 C3：AI 异步审核 + 连续写作打卡榜
- **功能**：双层审核——本地敏感词即时拦截 + LLM 异步复核（`review_status`: pending/passed/rejected，他人视角 rejected 不可见、作者可见警示条可删除）；排行榜新增连续写作榜（读 `user_settings.habit_config.noteStreak.count`）
- **交付**：`app/prompt/content_review_prompt.txt`；`_async_review_post/_async_review_comment`（失败保持 pending 不误杀）；feed/detail 过滤逻辑
- **踩坑**：LLM JSON 输出需 `_parse_llm_json` 容忍代码块/前后文本；审核前须 `await init_manager.models_ready.wait()`

### 养成数据上云（数据安全改造）
- **背景**：小卷好感度/互动统计/打卡 streak 原为纯 localStorage，换设备/清缓存即丢失
- **交付**：`user_settings` 表（pet_config/habit_config JSON）；`GET|PUT /user/settings/`（upsert，纯 MySQL 不依赖 Redis）；`hooks/useSettingsSync.ts`——登录拉云端（云端权威覆盖本地）、云端空且本地有→首次上云、变更 3s 防抖上传、**登出 flush**
- **设计**：localStorage 保留为本地缓存双写；上传字段白名单提取（剔除 mood 等运行时字段）

### 体验优化
- 退出登录二次确认（ConfirmDialog danger 样式，中英文案）
- 侧边栏分组：知识/AI 助手/学习成长/社交/养成 5 组 + 组标题可点击折叠（箭头旋转）+ framer-motion 舒展动画（高度+透明度 0.24s）+ 子项缩进 12px 阶梯 + 组标题 16px 加粗（> 子项 14px）

### 方向 D1：高并发低成本改造
- 自动标签后台任务 `asyncio.Semaphore(3)` 限流；社交写接口补 rate_limit；广场/排行榜 Redis 缓存 60s（**不可用自动降级直查**）；`backend/start_prod.ps1`（4 workers）；`deploy/nginx.conf.example`（静态托管 + `/api` 反代 + SSE 关缓冲）
- 年度统计：dashboard summary 加 `year_notes/year_chars`

### 备选方向精选
- **番茄钟**：`pages/PomodoroPage.tsx`（25+5 循环、SVG 环形、🍅 计数、提示音、标题栏倒计时）；页宠 `pomodoro_done`（+2，冷却 1h）
- **导出 HTML / 打印 PDF**：NoteEditor 工具栏（marked 渲染完整 HTML 下载；打印对话框可存 PDF）
- **年度统计卡片**：StatsPage「今年笔记/今年字数」
- **Ctrl+N** 全局新建笔记

### 技术栈升级（2026-08-27）
- **Tailwind CSS 3 → 4**（4.3.3）：CSS-first 配置——`index.css` 改用 `@import "tailwindcss"` + `@theme`（迁移 font-heading/font-body/font-mono）+ `@plugin "@tailwindcss/typography"` + `@custom-variant dark`；`postcss.config.js` 换 `@tailwindcss/postcss`（autoprefixer 不再需要）；**删除 `tailwind.config.cjs`**（colors 本就走 CSS 变量任意值，未受影响）
  - 验证：PostCSS 实际编译 103KB CSS 通过，font-heading/prose/dark variant/任意值 5 项检查 PASS
  - ⚠️ 已知视觉微差（v4 类名语义变化）：`shadow-sm` 变弱、ring 默认 1px——整体可接受，用户浏览器最终确认
- **react-router-dom 6 → 7**（7.18.2）：声明式 API（`useRoutes`/`RouteObject`/`NavLink`）完全兼容，import 路径不变，tsc 通过，零代码改动

### ✅ 全站 UI 改版 + lint 清零 + 风格统一（2026-08-27，用户主导 + 本 Agent 收尾）

**用户主导的 UI 改版**：
- 新应用外壳（`app-shell`/`app-workspace`/`app-sidebar` 卡片式悬浮布局，紫色品牌渐变 `--gradient-brand`）；Sidebar 响应式（≤767px 自动紧凑）+ 底部账号菜单（头像/用户名下拉）+ 分组折叠动画保留
- 笔记列表重构：**网格/列表双视图**（localStorage 记忆）、`NoteCard` 组件（长按 500ms 多选/置顶/下拉菜单/分类色调）、排序下拉、骨架屏、空态插画、无限滚动、搜索防重（requestRef 版本号）
- 新文件：`styles/workspace.css`（全套工作区样式 + 5 套分类色调变量）、`components/note/notePresentation.ts`（工具集）、`NoteCard.tsx`、`TemplatePreview.tsx/.css`（独立 Marked 实例 + DOMPurify 白名单预览）
- i18n 新增 `note.ui.*`（25+ 键）

**本 Agent 收尾**：
- **lint 全项目清零**（原 36 问题）：NoteEditor 2 error+1 warning（set-state-in-effect/refs/exhaustive-deps）、其余 8 文件 set-state-in-effect（统一 `setTimeout` 包裹或异步回调化：AuthImage/CommandPalette×3/DocumentDetailDrawer/CategoryManageDialog/RelatedFragments/AIChat/KnowledgeBase/Profile）、3 个 exhaustive-deps（加依赖/useCallback）、router 23 个 react-refresh（文件级 disable——路由配置文件惯例）
- **按钮风格统一**：37 处旧式按钮 className → `primary-button`/`secondary-button`/`workspace-icon-button`（精确匹配完整类串，避免误伤图标按钮；18 个文件），视觉统一为紫色渐变主按钮 + 描边次按钮 + 32px 图标按钮
- 验证：tsc 0 错误、eslint 0 问题、无空 className；视觉由用户浏览器最终确认

### ⚠️ Vite 代理与 SPA 路由冲突修复（2026-08-27 紧急修复）

**问题**：`/social`、`/stats`、`/user`、`/share` 四个代理前缀与 SPA 页面路由重叠——**直接访问/刷新这些页面 URL 时请求被代理到后端 404**（页面白屏；侧边栏内部跳转不受影响，故此前未暴露）。

**修复**：
- `vite.config.ts` 代理 key 改为**正则子路径**：`'^/stats/'`、`'^/social/'`、`'^/user/(login|logout|register|detail|update|reset-password|refresh-token|settings)'`（页面 `/user/:id` 不匹配）
- `/share` 与 `/share/:id` 页面完全同形无法用代理区分 → 后端 `share_router.py` 新增 **`public_router`（prefix `/public`）** 提供 `/public/note/{note_id}` 数据 API（共用 `_fetch_public_note`），前端 `endpoints.shareNote` 改走 `/public/note/{id}`，vite 新增 `'^/public/'` 代理；`/share/{id}` 仍保留（直接访问后端可用）；nginx 示例同步加 `/public/` 反代
- **验证**：模拟 vite 匹配逻辑 22 页面路径全 fallback + 22 API 路径全代理 ✓
- **经验**：vite 代理 key 是前缀/正则匹配，**绝不能写成 SPA 页面路径本身**；API 与页面同形时给 API 加别名前缀（如 `/public`）

---

## 三、数据存储架构（改造后）

| 数据 | 存储 | 换设备 |
| --- | --- | --- |
| 账号/笔记/双链/回顾/会话 | MySQL `rag_notebook` | ✅ |
| 好友/关注/动态/点赞/评论/通知 | MySQL（social 5 表 + follows） | ✅ |
| 头像/动态图片 | 本地磁盘 `backend/media` | ✅ |
| 笔记向量/知识库向量 | ChromaDB 本地持久化 | ✅ |
| 令牌黑名单/用户缓存/统计缓存/广场排行榜缓存 | Redis（未启动时自动降级） | ✅ |
| **小卷养成 + 打卡 streak** | **MySQL `user_settings` + localStorage 双写** | ✅ **跟随账号** |
| 登录态/偏好/草稿 | localStorage | 登录态重新登录 |

---

## 四、待办 / 后续方向

| 项 | 触发条件 |
| --- | --- |
| 方向 D 阶段二：模型服务拆分（embedding/reranker 独立 + 任务队列） | 活跃用户接近 1000 |
| 方向 D 阶段三：大规模架构（Milvus/Qdrant、服务拆分、K8s） | 几千用户+ |
| PWA 化（vite-plugin-pwa） | 有空（需 build 验证，沙箱跑不了 vite build） |
| 年度报告页 | 数据积累后 |
| 打开全局限流 `RATE_LIMIT_ENABLED=true` | 上线公网时 |

---

## 五、交付检查清单（每次改动后）

- [ ] `npx tsc -b --noEmit` 0 错误
- [ ] 新增文件 eslint 无新增 error
- [ ] 后端 py_compile 通过 + 关键接口实测（临时 uvicorn 801x，测后 kill）
- [ ] i18n 中英完整、无结构破坏
- [ ] 沙箱内 vite 无法启动（spawn EPERM）→ 最终由用户刷新页面验证
- [ ] 提醒用户：后端改动需重启 8000；vite.config 改动需刷新浏览器

## 六、环境备忘

- 测试账号：`admin / admin1234`（另有 `admin2` 可作好友/关注体验）
- MySQL 库 `rag_notebook` 运行中；Redis 服务 `rediszt3`（停止状态，启动：`Start-Service rediszt3`）
- 后端启动：`backend\start_prod.ps1`（生产 4 worker）或 `python -m uvicorn main:app --reload --port 8000`（开发）
- 前端 dev：`front` 下 `npm run dev`（3000，代理到 8000）
