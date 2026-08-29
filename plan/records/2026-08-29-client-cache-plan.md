# 客户端缓存方案：把请求压力分摊到用户电脑

> 日期：2026-08-29
> 状态：✅ **方案 1（HTTP 缓存头 + ETag）与方案 2（前端 SWR）均已实施**；方案 3（PWA）待做
> 背景：用户高频刷新笔记页时，请求仍会到达服务器（Redis 缓存只减少"查库"），本方案把"请求"本身挡在用户浏览器本地
> 关联：`plan/roadmap/2026-08-27-scale-up-plan.md`（方向 D 高并发路线）、`plan/handoff/2026-08-27-HANDOFF-NEXT-AGENT.md` 待办「PWA 化 / 静态资源 gzip」、`plan/roadmap/2026-08-29-next-steps-plan.md`（下一步规划）

## 实施记录（方案 1：HTTP 缓存头 + ETag 版本化 ✅）

**已落地改动**：
- `backend/app/core/http_cache.py`（新增，域通用）：`get_domain_etag` / `bump_domain_version` / `is_not_modified` / `apply_http_cache`（域：note / chat；Redis 不可用自动降级为无缓存）
- `note_service._invalidate_note_caches`：写操作统一 INCR `note_version:{user_id}`（与现有缓存失效同点）
- `GET /note/list` → `private, max-age=30` + ETag（304 短路在查数据前）
- `GET /note/{id}` → `private, max-age=300` + ETag
- `GET /note/stats` → `private, max-age=60` + ETag
- `main.py` 媒体静态文件：自定义 StaticFiles 加 `private, max-age=86400`
- **会话列表（08-29 追加）**：`GET /chat/sessions/{user_id}` → `private, max-age=30` + ETag；`database_session_manager` 写操作（add_message/重命名/置顶/删除）统一 INCR `chat_version:{user_id}`
- **路由启发式（08-29 追加）**：闲聊/自我认知类问题跳过 RAG（`chat.py _should_skip_rag`：≤4 字符短查询 + 自我认知正则——向量分数对闲聊与知识问题无区分度，实测 0.54~0.59 重叠，启发式更可靠）；合并 `compute_route_score` 与 Top-1 检索为一次 `similarity_search`（省一次 embedding + 一次 Chroma 查询）

**实测验证（08-29）**：首次 200 + ETag → If-None-Match 匹配 304 空响应 → 写操作后旧 ETag 失效（200 + 新版本）→ 新 ETag 304 ✓；闲聊"你好/介绍一下你自己"跳过 RAG（20.5s→2.8s，无 retrieval/hyde/reorder 阶段），知识问题"总结我的知识库"仍走 RAG ✓；会话列表同上 ✓；笔记缓存回归 ✓

**未做（后续）**：方案 2（前端 SWR）/方案 3（PWA）。

---

## 实施记录（方案 2：前端 SWR 缓存 ✅）

**已落地改动**：
- `front/src/stores/useSwrCacheStore.ts`（新增）：内存 Map + localStorage 持久化；key 约定必须含 `:{userId}:` 片段（用户隔离 + `clearUser` 按用户清空）；存储不可用降级为内存
- 接入三个展示型页面（刷新秒开：先渲染本地缓存 → 后台静默请求 → 新数据替换）：
  - `NoteList`：首页（无筛选/搜索）预填 + 成功写缓存；`loadNotes` reset 分支**保留旧数据直到新数据到达**（SWR 语义，加载瞬间不闪）
  - `AIChat` 侧栏「最近对话」：预填 + 写缓存
  - `Sessions` 页列表：store 为空且缓存命中时预填 + 写缓存
- **刻意不做**：`NoteEditor`（编辑器场景，stale 内容可能覆盖用户输入——一致性优先，且详情已有 304 缓存）
- **失效策略**：靠后台刷新自愈（HTTP 层 ETag 保证刷新拿最新），不做事后清理——容忍 1~2 秒陈旧，避免复杂化

**实测验证（08-29）**：tsc 0 错误 / eslint 0 问题；浏览器刷新 NoteList / AI 页 / Sessions 页时数据立即出现（Network 面板可见后台刷新请求），无骨架屏闪烁

**未做（后续）**：方案 3（PWA / Service Worker，已列入 `next-steps-plan.md`）。

---

## 一、要解决的问题

现状链路：刷新页面 → 前端发请求 → 后端查 Redis（命中则不查 MySQL）→ 返回。

- Redis 把"查库"降下来了，但**每个刷新请求本身仍打到服务器**（HTTP 层、中间件、限流计数、序列化……）
- Redis 是纯内存操作，压力很小，但请求量级继续上涨时，任何一层都会成为瓶颈
- 目标：**大部分请求根本不出用户电脑**

## 二、三级请求模型

```
级别0：本地直接渲染（不发请求）    ← 浏览器缓存命中（max-age 内）
级别1：发轻量校验（304 无正文）    ← ETag/版本号一致，服务器只回状态码
级别2：全量请求（现状）            ← 缓存过期 / 数据真变了
```

## 三、方案清单（按性价比排序）

### 方案 1：HTTP 响应缓存头 + ETag 版本化（推荐先做，后端小改动）

**原理**：给响应加 `Cache-Control`，浏览器自动缓存，前端零改动。

| 数据 | 建议头 | 效果 |
|---|---|---|
| 笔记列表 | `private, max-age=30`（与 Redis TTL 对齐） | 30 秒内刷新**不发请求** |
| 笔记详情 | `private, max-age=300` | 5 分钟内刷新不发请求 |
| 头像/媒体 | `private, max-age=86400` | 一天零请求 |
| 静态资源（vite 产物带 hash） | `public, max-age=31536000, immutable` | 一年零请求（配合 nginx） |

**关键设计——失效机制（ETag 版本化）**：
- Redis 维护 `note_version:{user_id}`，**写操作时 +1**（与现有 `_invalidate_note_caches` 同点触发）
- 列表/详情响应带 `ETag: "v{note_version}"`；浏览器下次请求带 `If-None-Match`
- 版本没变 → 回 **304 空响应**（服务器开销 = 一次 Redis GET，微秒级）
- 版本变了 → 正常返回新数据

**效果**：写操作立即生效 与 刷新零开销 同时成立。

### 方案 2：前端状态层缓存（stale-while-revalidate，体验最好）

- 笔记列表/详情存 Zustand store + localStorage 持久化（项目已有 persist 先例：`usePetStore`/`useSettingsSync`）
- 刷新页面：**先渲染本地缓存（秒开）→ 后台静默请求 → 有更新再覆盖**
- 用户感知：页面瞬间出现，不转圈
- 成本：前端改动中等；需要定义本地数据 vs 服务器数据的合并策略

### 方案 3：Service Worker / PWA（量大/离线场景，已列入待办）

- `vite-plugin-pwa`，拦截请求按策略走缓存（network-first / stale-while-revalidate）
- 收益：离线可用 + 全局缓存策略；做了它，方案 1/2 的部分能力被覆盖
- 与交接文档待办「PWA 化」合并实施

### 方案 4：IndexedDB（大对象缓存，现阶段不做）

- 适合知识库文档内容、搜索索引等大数据本地副本
- 成本高，当前数据量不需要，留作远期

## 四、推荐路线图

```
现在（改动最小）：方案 1 —— 响应头 + ETag 版本化（后端 ~1 天）
   ↓ 顺手：nginx 静态资源 immutable（配合现有 dist 部署）
下一轮（有空）：方案 2 —— 列表/详情 store 持久化 + 静默刷新
   ↓
远期：方案 3 —— PWA 化（天然承接 SW 缓存）
```

## 五、接口级配置清单（实施时对照）

| 接口 | 缓存头 | ETag | 备注 |
| --- | --- | --- | --- |
| `GET /note/list` | `private, max-age=30` | `note_version:{user_id}` | 与 Redis 30s 对齐 |
| `GET /note/{id}` | `private, max-age=300` | `note_version:{user_id}` | 详情 5 分钟 |
| `GET /note/stats` | `private, max-age=60` | — | 或依赖现有 Redis 60s |
| `GET /media/**`（头像等） | `private, max-age=86400` | — | 文件名已带 uuid |
| `GET /chat/sessions/{user_id}` | `private, max-age=30` | 可选 | 会话列表 |
| 静态资源（dist/*.js/css） | `public, max-age=31536000, immutable` | — | nginx 层配置 |
| `POST /chat/agent/query/stream` | **不缓存** | — | 流式实时 |
| 社交动态/通知 | **不缓存**（或 max-age=0） | — | 实时性优先 |

**写操作触发的版本递增点**（现有失效点复用）：笔记创建/更新/删除/置顶/批量操作 → `note_version:{user_id}` INCR（与 `_invalidate_note_caches` 同处）。

## 六、三个必须注意的坑

1. **必须 `private`**：笔记是用户私有数据；`public` 会让 CDN/代理缓存泄露。只有静态资源和公开分享页可用 `public`
2. **不能缓存**：AI 对话 SSE 流式、社交动态流——保持实时
3. **多端一致性**：客户端缓存解决"本机压力"，解决不了"别人改数据"——ETag 版本化是方案 1 的**必要组成部分**：版本一变，所有用户的本地缓存立即失效（下次校验 304 变为全量 200）

## 七、预期收益

| 指标 | 现状 | 方案 1 后 |
| --- | --- | --- |
| 用户 30 秒内反复刷新笔记页 | 每次都发全量请求 | **0 请求**（max-age 内） |
| 用户 30 秒后刷新（数据没变） | 全量请求 + 序列化 | **304 空响应**（一次 Redis GET） |
| 服务器笔记接口压力 | 与刷新频率线性 | **与"数据变更频率"挂钩**（写少读多场景趋近零） |

注：收益建立在"读多写少"的典型知识管理场景；若数据高频变更，缓存命中率自然下降（TTL/版本机制自动适配）。
