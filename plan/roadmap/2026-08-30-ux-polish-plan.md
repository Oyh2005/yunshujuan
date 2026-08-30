# 云舒卷 · 体验流畅度优化计划（2026-08-30）

> 定位：用户反馈「用起来不够流畅，尤其页面切换」后的专项优化计划。
> 关联：`plan/handoff/2026-08-27-HANDOFF-NEXT-AGENT.md`（交接）、`plan/roadmap/2026-08-29-next-steps-plan.md`（下一步规划）

---

## 一、页面切换专项（✅ 已完成 2026-08-30）

### 现状诊断（逐项核实过代码）

| # | 问题 | 代码依据 | 状态 |
| --- | --- | --- | --- |
| 1 | **路由全 lazy 无预加载**：首次切页现场下载 chunk，Suspense fallback 闪现 | `router/index.tsx` 全部 `lazy()`，无 hover/空闲预取 | ✅ 已修复 |
| 2 | **无退出动画**：旧页硬切消失，只有新页 0.18s 纯透明度淡入 | `index.css` `.page-enter`（`page-fade-in 0.18s`） | ✅ 已修复 |
| 3 | **无滚动位置恢复**：切页后浏览器保留旧滚动位置，新页内容高度不同时滚动条位置错乱（"跳"的感觉） | 全项目无 `ScrollRestoration`/`scrollTo(0,0)` | ✅ 已修复 |
| 4 | **切页后数据重取**：页面组件重挂载 → 全部 useEffect 重新请求 → 骨架/加载态重播 | `MainLayout` `key={pathname}` 重挂载（chat 归一化特例保留，必要） | ✅ SWR 缓存缓解（P1-3） |
| 5 | Suspense fallback 是居中三行小骨架，弱网下观感单薄 | `LoadingSkeleton.tsx`（h-64 居中） | ✅ 已修复 |

### 已实施（2026-08-30）

1. **路由预加载**：`router/pages.ts` 抽取页面加载器映射（lazy 工厂与预取共用同一 `import()`）；
   侧边栏导航 hover/聚焦精确预取 + MainLayout 空闲 2s 兜底预取高频页（笔记/对话/动态/回顾）
2. **页面过渡升级**：`AnimatePresence mode="wait"`，120ms 淡出 → 淡入（保留 chat key 归一化，防闪屏守卫不受影响）；`App.tsx` 加 `MotionConfig reducedMotion="user"`（尊重系统减弱动态效果）
3. **滚动恢复**：路由 pathname 变化 `window.scrollTo(0, 0)`（chat 会话切换 key 不变不触发）
4. **LoadingSkeleton 美化**：全高卡片骨架
5. 清理废弃 `.page-enter` CSS

### 验证方式

- ✅ `npx tsc -b --noEmit` + `npx eslint src`（全量 0 问题）
- 本机手测：首访切页（骨架）、热切页（无骨架、有过渡）、chat 会话切换（无重挂载）、滚动位置、移动端

---

## 二、体验优化总清单（按感知 × 成本排序）

### P0 — 高感知低成本（各 ≤ 半天）

| # | 项 | 现状 → 方案 | 难度 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 字体加载本地化 | `index.css` 顶部 `@import` Google Fonts，国内网络常超时阻塞首屏 → 系统字体栈优先（苹方/微软雅黑/宋体），Noto/JetBrains 保留为本地候选 | 低 | ✅ 已实施 |
| 2 | 页面标题随路由 | 仅番茄钟页改 `document.title` → 路由级统一标题（MainLayout 全路由 + 登录/注册 + 分享页笔记标题） | 低 | ✅ 已实施 |
| 3 | AI 首答路由判断并行化 | RAG 前置与 Agent 首轮 LLM 调用串行（偶发 2~3.8s 卡顿）→ 并行发起 | 中 | ✅ 已实施（2026-08-30）：HyDE 生成与直接检索并行（Agent 首轮依赖 rag_context 无法直接并行，见下方「二轮实施说明」） |
| 4 | 思考等待反馈升级 | 固定 spinner → 分步骤占位文案轮播（检索中/思考中…） | 低 | ✅ 已实施 |

### P1 — 中成本高频场景（各 1~2 天）

| # | 项 | 方案 | 难度 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 长列表 memo 化 | NoteCard `React.memo` + 列表侧稳定回调（useCallback） | 低~中 | ✅ 笔记列表已实施；动态/会话行同类可复用 |
| 2 | 列表滚动位置记忆 | 列表 → 详情 → 返回，恢复滚动位置（sessionStorage） | 中 | ✅ 笔记列表已实施 |
| 3 | **SWR 缓存补全** | Dashboard/好友/通知/广场等读接口接入 `useSwrCacheStore` | 中 | ✅ 好友页 + 通知页已实施（含删除/清空/已读后同步缓存）；Dashboard 暂缓（多接口拼装，收益待评估） |
| 4 | 图片渐进加载 | 聊天/动态图片占位底色 + 加载态，避免白块跳动 | 中 | ✅ 已实施（ProgressiveImage 组件） |
| 5 | 乐观更新核对 | 点赞/关注/私信已读等已覆盖的核对一遍，未覆盖补上 | 中 | ✅ 已实施（点赞/关注/通知全部已读乐观化 + 失败回滚） |
| 6 | 移动端滚动优化 | `overscroll-behavior`、减少低端机 `backdrop-filter` | 低 | ✅ 已实施 |

### P2 — 后续单独立项

| # | 项 | 说明 | 难度 |
| --- | --- | --- | --- |
| 1 | 列表虚拟化 | 笔记/动态千条级滚动上限 | 高 |
| 2 | 图片上传压缩管线 | 前端压缩再传（聊天图/头像） | 中 |
| 3 | 下拉刷新 + 断网提示 | 动态流/广场手动刷新；`navigator.onLine` 提示条 | 中 |
| 4 | PWA 安装引导 | 首次访问提示安装到桌面 | 低 |
| 5 | 性能监控 | Web Vitals 上报现有 telemetry | 中 |

---

## 二轮实施说明（2026-08-30 下午，P0-3/P0-4/P1-4/5/6 全部完成）

### P0-3 AI 首答提速：HyDE 生成与直接检索并行（后端 `rag_service.py`）

- **方案**：`retrieve_document` 双路并行——`asyncio.create_task` 后台跑 HyDE 生成（DeepSeek，限长 ~1.7s，偶发慢），同时用原始查询立即执行「直接检索」（本地向量库，快）；
  HyDE 在等待上限 `_HYDE_WAIT_CAP=2.5s` 内返回 → 再做增强检索并与直接结果**合并去重**（笔记/知识库各自按内容去重，笔记在前），召回更全、重排序候选更多；
  超过上限 → 取消慢调用，直接用直接检索结果（延迟有界）；直接检索无结果（知识库为空）→ 不等 HyDE 直接返回空。
- **实测（临时 uvicorn 8015 探针 `.probe_ux_p03.py`）**：直接检索 0.16s 在 HyDE 生成（2.36s）期间完成并先行推送事件，增强检索 + 合并 0.08s；
  thinking 事件流：并行双路检索 → 直接检索完成 → 假设性文档生成完成（增强检索）→ 合并完成（1 笔记 + 4 知识库文档）→ 重排序 → 首字。闲聊正确跳过 RAG。
- **遗留瓶颈（不在本项范围）**：重排序（bge-reranker 本地 CPU，5 文档 ~1.4~7.8s）与 Agent 首轮 LLM 调用（DeepSeek 波动 2.7~11.2s）。

### P0-4 思考等待反馈升级（前端 `AIChat.tsx` + `hooks/useRotatingPlaceholder.ts`）

- 新增 `useRotatingPlaceholder` hook：active 期间每 1.6s 轮播文案，返回 `{text, tick}`（tick 供"多久无新事件"判定，避免渲染期 `Date.now()`）。
- 两处空档升级：① 首个 thinking 事件到达前（路由判断/管线启动）→「正在分析你的问题…/检索相关知识…/思考如何回答…/组织语言…」轮播；
  ② 阶段事件后超 ~3.2s 无新事件（Agent 首轮模型调用空档）→ ThinkingPanel 内「正在思考中…/正在调用模型…/马上就好…」轮播行（`ai-thinking-live`）。
- 事件到达（onThinking/onResponse）即刷新 activityTick，恢复真实进度展示。

### P1-4 图片渐进加载（`components/common/ProgressiveImage.tsx` + 全局 CSS）

- 新组件替代聊天气泡图/引用缩略图/转发预览（`MessagesPage.tsx`）与动态图片（`SocialFeed.tsx`）的裸 `<img>`：
  加载中 = 占位底色 + 微光动画（`.progressive-img:not(.is-loaded)` shimmer），加载完成淡入，失败停止微光 + 降透明（不闪裂图图标）。
- 纯 CSS 占位兜底，JS 仅 `onLoad/onError` 切换类；props 原样透传（onClick/onContextMenu/loading 等不受影响）。

### P1-5 乐观更新核对（结论：点赞/关注/通知全部已读补上；其余原本已覆盖）

- **点赞**（`SocialFeed.tsx`）：乐观翻转 + 计数 ±1，成功以服务端校准（不一致才调），失败回滚 + toast；新增单飞守卫 `likingRef`（在途期间忽略重复点击，防乐观态与服务端响应互相覆盖）。
- **关注**（`UserProfilePage.tsx`）：乐观翻转 is_following + 粉丝数，失败回滚；按钮文案直接显示翻转后状态（不再显示"加载中"）。
- **通知全部已读**（`NotificationsPage.tsx`）：乐观置已读（含 SWR 缓存同步），失败回滚快照。
- **核对已覆盖无需改**：私聊发送（乐观 sending 态）、单条通知已读（handleOpen 先 commitItems）、私信会话未读清零（openConversation 本地即清）、动态发布后刷新时间线。
- **确认无需乐观**：私信 markRead（后台同步语义，服务端为准 + WS read 推送）。

### P1-6 移动端滚动优化（全局 + 各域 CSS）

- `html, body { overscroll-behavior: none; }` + `.app-workspace` none + 内层滚动容器（`.ai-conversation-scroll`/`.messages-chat-body`/`.sidebar-navigation`）`contain`：禁用滚动链与边缘回弹，内层滚动不再带跑整页。
- 移动端（≤767px）`backdrop-filter: none`：`.share-topbar`、`.dashboard-art-caption`、`.note-authoring-backdrop`、`.social-modal-backdrop`/`.messages-forward-modal`/`.messages-image-preview`、`.sidebar-mobile-backdrop`（暗色半透明底保留，省低端机 GPU 合成）。

### 验证

- ✅ `npx tsc -b --noEmit` + `npx eslint src`（全量 0 问题）；index.css 经 `@tailwindcss/postcss` 编译通过
- ✅ 后端 `py_compile` + 临时 uvicorn 8015 探针实测（SSE 时间线断言 PASS，探针会话已清理）；新增 3 个单测（合并去重/慢 HyDE 兜底/空结果跳过等待）——pytest 沙箱跑不了，需本机跑 `backend/tests/rag/test_rag_service.py`

---

## 三、建议节奏

```
本周：页面切换专项（预加载 + 过渡 + 滚动 + 骨架）→ P0-1 字体本地化 → P0-2 页面标题
下周：P1-3 SWR 补全 → P1-2 滚动记忆 → P1-1 memo → P0-3 AI 并行 → P0-4 占位文案 → P1-4/5/6
按需：P1 其余 → P2 立项
```
