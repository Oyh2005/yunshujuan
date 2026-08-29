# 高并发升级计划（方向 D：性能与扩容）

> 创建：2026-08-27
> 背景：当前架构为单机个人/小团队应用，若开放注册进入"用户多了"的社交场景，需按本计划分阶段升级。
> 原则：**每阶段独立可交付、不破坏现有功能、按需触发（用户量到了再上）**。

---

## 1. 当前架构瓶颈（按严重程度排序）

| # | 瓶颈 | 说明 | 影响 |
| --- | --- | --- | --- |
| 1 | **本地模型推理** | embedding（Ollama nomic-embed-text）与 reranker（bge-reranker CPU）单机算力有限 | 硬天花板：3~5 并发 RAG 即排队 |
| 2 | **单 worker** | uvicorn 默认单进程，CPU 密集任务（重排序/JSON/敏感词）阻塞事件循环 | CRUD 几十 QPS，高峰期卡顿 |
| 3 | **ChromaDB 本地模式** | 写串行、检索单线程，不支持水平扩展 | 批量上传并发互相等待 |
| 4 | **后台任务无队列** | `_auto_tag_and_review` 每篇笔记一个 LLM 调用，无并发限制 | 笔记创建高峰打爆模型服务 |
| 5 | **无限流 + 开发态部署** | `RATE_LIMIT_ENABLED=false`；前端仅 vite dev | 无防护、无法上生产 |

**能力基线**：普通 CRUD 单 worker 几十 QPS（多 worker 后 200~500）；AI 对话本地模型 1~3 并发；RAG 检索 3~5 并发。约 10 活跃用户轻松、100 在线明显卡、1000+ 需架构改造。

---

## 2. 阶段一：低成本改造（1~2 天，现有代码直接受益）

> 目标：不拆架构，把单机能力榨干到几百用户。**推荐最先做。**

### 2.1 生产部署形态
- [ ] uvicorn 多 worker 启动（`--workers 4`）或 gunicorn+uvicorn worker；新增 `backend/start_prod.sh`/`start_prod.ps1` 与 README 说明
- [ ] Nginx 配置示例：托管 `front/dist` 静态资源 + 反向代理 `/api` → 8000 + gzip + 静态缓存头（示例放 `deploy/nginx.conf.example`）
- [ ] 前端 `npm run build` 产物验证（沙箱跑不了 vite build，需用户环境执行）

### 2.2 限流与队列
- [ ] 打开全局限流：`RATE_LIMIT_ENABLED=true`（中间件 + 各路由 `Depends(rate_limit(...))` 已就绪）
- [ ] 后台任务加**信号量/队列**：`NoteService._auto_tag_and_review` 创建任务时经 `asyncio.Semaphore`（如 2~4 并发），防止高峰打爆 Ollama/API
- [ ] 社交接口补限流（发动态/评论/好友申请等写操作加 `rate_limit`）

### 2.3 缓存
- [ ] 笔记列表/详情加 Redis 缓存（`@cache_with_redis` 已可用于 service 层；注意**勿装饰路由 handler**——踩坑记录 5）
- [ ] 排行榜/广场接口加 30~60s 缓存（数据非实时，可容忍）

### 2.4 数据库
- [ ] MySQL 连接池按需调大（`db_config.py` pool_size/max_overflow，当前 10/20）
- [ ] 高频查询索引检查（notes.user_id、posts.user_id 已有 index，观察慢查询日志）

**验证**：临时 uvicorn 多 worker 起两个端口对比；`ab`/`wrk` 压测 CRUD 接口 QPS；后台任务并发创建 20 篇笔记观察模型服务是否被打爆。

---

## 3. 阶段二：模型服务拆分（1~2 周，几百→几千用户）

- [ ] **embedding/reranker 独立 API 服务**（或换供应商），不再本地 CPU 推理；RAG 管线改为 HTTP 调用
- [ ] **任务队列化**：AI 对话/自动标签/剪藏/网页处理全部入队（Celery/RQ 或自建 asyncio 队列 + worker），接口立即返回、异步出结果（SSE 轮询/推送）
- [ ] 重排序结果缓存（相同 query + 文档集命中直接返回）
- [ ] RAG 检索并发化（`asyncio.to_thread` 已有部分，补齐检索链路）

---

## 4. 阶段三：大规模架构（按月计，几千用户+）

- [ ] 向量库换独立部署（Milvus / Qdrant / pgvector）
- [ ] 服务拆分：用户 / 笔记 / 社交 / RAG 独立服务 + 消息队列削峰
- [ ] 对象存储（图片/文件，当前在本地磁盘 `backend/media`）
- [ ] K8s 水平扩展 + CDN

---

## 5. 决策建议

- **当前定位（个人 + 小圈子）**：不启动阶段二/三，避免过度投入
- **活跃用户接近 100**：启动阶段一（1~2 天工作量，收益最大）
- **活跃用户接近 1000**：启动阶段二
- 阶段一各项改造**不破坏现有功能**，可随时插队执行

## 6. 相关踩坑备忘

- `@cache_with_redis` 不能装饰 FastAPI 路由 handler（破坏 Depends 注入），只能用于 service 层方法
- vite dev 仅开发用，生产必须 `vite build` + Nginx（沙箱内 vite build 跑不了，需用户环境）
- 多 worker 下内存态单例（init_manager/Chroma）每 worker 一份，模型显存/内存开销 ×N，需按机器评估 worker 数
