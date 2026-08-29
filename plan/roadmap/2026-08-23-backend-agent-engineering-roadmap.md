# RAG Notebook 后端与 Agent 工程化演进路线图

> 创建日期：2026-08-23  
> 目标：以当前 RAG Notebook 为基础，分阶段补齐现代后端、分布式任务、RAG、Agent、可观测性、测试和部署能力。  
> 原则：每个阶段都能独立运行、测试和回滚；同类中间件只选择一种主方案，避免把项目变成无法维护的“技术栈展览馆”。

---

## 1. 文档使用方式

本文将改造拆成多个可独立交付的里程碑。实施时应遵守以下规则：

1. 一次只实施一个里程碑，完成验收后再进入下一阶段。
2. 每个阶段单独建立分支或 Pull Request。
3. 新基础设施必须提供健康检查、配置示例和最小测试。
4. 不在 FastAPI 请求进程中执行不可控的长任务。
5. 所有用户数据、向量、任务和 Agent 状态都必须带 `user_id`。
6. 本地开发优先使用 Docker Compose，生产环境再考虑 Kubernetes。
7. Chroma、Qdrant、RabbitMQ 等组件通过接口隔离，业务层不直接依赖具体实现。
8. 每引入一个组件，都要说明它解决什么问题，以及不使用它时的降级路径。

状态标记：

| 标记 | 含义 |
| --- | --- |
| ✅ 已有 | 当前代码已经实际使用 |
| 🟡 部分具备 | 有依赖或初步实现，但尚未工程化 |
| ⬜ 待增加 | 当前项目没有，需要新增 |
| 🔵 可选 | 达到特定规模或需求后再引入 |
| 🚫 暂缓 | 当前阶段不建议引入 |

---

## 2. 当前项目基线

### 2.1 已经具备的能力

| 领域 | 当前实现 | 状态 | 主要位置 |
| --- | --- | --- | --- |
| Web API | FastAPI、Uvicorn、REST、OpenAPI | ✅ 已有 | `backend/main.py`、`backend/app/router/` |
| 前端 | React、TypeScript、Vite、Tailwind、Zustand | ✅ 已有 | `front/src/` |
| 关系数据库 | MySQL + SQLAlchemy Async | ✅ 已有 | `backend/app/db/db_config.py` |
| 数据模型 | 用户、笔记、模板、回顾、会话、消息 | ✅ 已有 | `backend/app/models/` |
| Redis | 异步连接池、缓存、JWT 黑名单、限流 | ✅ 已有 | `backend/app/db/redis_config.py`、`backend/app/cache/` |
| 身份认证 | JWT、Bearer Token、用户级数据隔离 | ✅ 已有 | `backend/app/utils/auth_utils.py` |
| 向量数据库 | ChromaDB，两套 Collection | ✅ 已有 | `backend/app/rag/vector_store.py`、`backend/app/services/note_service.py` |
| 文档处理 | TXT、PDF、Markdown、PPTX、DOCX | ✅ 已有 | `backend/app/rag/document_handler/` |
| 多模态 PDF | 图片提取、视觉描述、图片去重 | ✅ 已有 | `backend/app/utils/pdf_multimodal_loader.py` |
| 混合检索 | 向量检索 + BM25 动态权重 | ✅ 已有 | `backend/app/rag/retrievers/hybrid_retriever.py` |
| RAG 增强 | HyDE、跨笔记/知识库检索、重排序 | ✅ 已有 | `backend/app/rag/rag_service.py` |
| 重排序 | CrossEncoder 本地模型 | ✅ 已有 | `backend/app/rag/reorder_service.py` |
| LangChain | Prompt、LCEL、Retriever、Tool、AgentExecutor | ✅ 已有 | `backend/app/agent/`、`backend/app/rag/` |
| Agent 工具 | 搜索笔记、创建笔记、回顾和统计等 8 个工具 | ✅ 已有 | `backend/app/agent/agent_tools.py` |
| 流式通信 | SSE 对话流和上传进度 | ✅ 已有 | `backend/app/router/chat.py`、`knowledge_service.py` |
| 异步并发 | asyncio、后台 Task、ThreadPoolExecutor | ✅ 已有 | `background_init.py`、`knowledge_service.py` |
| 模型协议 | OpenAI Compatible 聊天、视觉、嵌入 | ✅ 已有 | `backend/app/utils/factory.py` |
| 测试 | pytest、SQLite/FakeRedis/FakeChroma/FakeLLM | ✅ 已有 | `backend/tests/` |
| 健康检查 | MySQL 和 Redis readiness | 🟡 部分具备 | `backend/app/router/health.py` |
| 限流 | Redis 计数器，默认关闭 | 🟡 部分具备 | `backend/app/core/rate_limit.py` |
| 日志 | 应用日志封装 | 🟡 部分具备 | `backend/app/core/logger_handler.py` |

### 2.2 容易被误认为“已经完成”的能力

| 能力 | 实际状态 |
| --- | --- |
| LangGraph | 依赖树里存在 LangGraph，Middleware 也引用了 Runtime，但主要 Agent 流程仍是 LangChain `AgentExecutor`，没有 StateGraph、Checkpoint、节点恢复和人工中断。 |
| 消息队列 | `TaskQueue`、`asyncio.create_task` 和线程池只是进程内任务，不是 RabbitMQ、Kafka 这类可靠消息队列；进程退出后任务可能丢失。 |
| OpenTelemetry | 部分 OTel 包随依赖进入环境，但没有完成 FastAPI、数据库、Redis、LLM 和 Worker 的统一埋点及导出。 |
| 数据库迁移 | 当前只有自定义的“创建表、补缺失列”逻辑，没有 Alembic 版本化迁移。 |
| 容器化 | 当前没有项目级 Dockerfile 和 Docker Compose。 |
| 生产级文件存储 | 当前主要使用本地目录，没有 MinIO/S3 对象存储抽象。 |
| 生产级向量服务 | ChromaDB 适合本地开发，但尚未引入独立的 Qdrant/Milvus 服务。 |
| Agent 评估 | 有普通单元测试，但没有 RAG/Agent 数据集、忠实度、召回率、轨迹和成本回归评估。 |

### 2.3 当前尚未加入的主要组件

- Docker、Docker Compose、Nginx。
- Alembic 数据库迁移。
- RabbitMQ、Celery、Celery Beat、Flower。
- MinIO 或其他 S3 兼容对象存储。
- Qdrant、Milvus 或 pgvector 等独立向量服务。
- 真正的 LangGraph StateGraph 与持久化 Checkpoint。
- MCP Client/Server。
- Prompt Injection 防护、工具权限策略和人工审批节点。
- OpenTelemetry 完整埋点。
- Prometheus、Grafana、Loki、Tempo/Jaeger。
- Langfuse、LangSmith 或 Phoenix 等 AI 可观测平台。
- Testcontainers、RAGAS/DeepEval、压力测试。
- CI/CD、镜像扫描、自动部署。

---

## 3. 推荐的目标技术栈

本路线图为每一类能力指定一个主方案。同类替代品只作为备选，不同时引入。

| 领域 | 主方案 | 备选 | 选择说明 |
| --- | --- | --- | --- |
| Web | FastAPI | — | 继续沿用现有实现 |
| ORM | SQLAlchemy Async | — | 继续沿用 |
| 数据库迁移 | Alembic | — | 替换手写迁移逻辑 |
| 主数据库 | MySQL | PostgreSQL | 先不迁库，降低改造风险 |
| 缓存和临时状态 | Redis | — | 当前已经使用 |
| 消息代理 | RabbitMQ | Redis Broker | RabbitMQ 更适合学习可靠消息和路由 |
| 后台任务 | Celery | Dramatiq、Taskiq、ARQ | Celery 生态和工程案例更完整 |
| 定时任务 | Celery Beat | APScheduler | 与 Celery Worker 统一 |
| Worker 监控 | Flower | — | 查看任务、队列和失败状态 |
| 对象存储 | MinIO | S3、OSS、COS | 本地可部署，兼容 S3 API |
| 向量数据库 | Qdrant | Chroma、Milvus、pgvector | 支持独立服务、过滤和扩展 |
| RAG/工具抽象 | LangChain | — | 继续使用 |
| Agent 编排 | LangGraph | — | 支持状态图、恢复、分支和人工审批 |
| 工具协议 | MCP | OpenAPI Tool | 统一外部工具连接方式 |
| 模型网关 | 自定义 ModelGateway，后期 LiteLLM | LiteLLM | 先做轻量抽象，再判断是否独立部署 |
| 网关 | Nginx | Traefik | Nginx 更常见 |
| 容器编排 | Docker Compose | Kubernetes | 当前阶段 Compose 足够 |
| 指标 | Prometheus + Grafana | — | 标准监控组合 |
| 日志 | 结构化 JSON + Loki | ELK/OpenSearch | Loki 更轻量 |
| 链路追踪 | OpenTelemetry + Tempo/Jaeger | — | 统一 API、Worker、数据库和 LLM 链路 |
| AI 追踪 | Langfuse | LangSmith、Phoenix | 支持自托管 |
| 自动测试 | pytest + Testcontainers | — | 同时覆盖 Fake 和真实中间件 |
| RAG 评估 | RAGAS 或 DeepEval | Promptfoo | 建立 AI 回归基线 |
| CI/CD | GitHub Actions | GitLab CI、Jenkins | 与常见开源工作流一致 |

---

## 4. 目标架构

```text
                         ┌──────────────────────┐
                         │ React / Vite Frontend│
                         └──────────┬───────────┘
                                    │ HTTPS / SSE
                              ┌─────▼─────┐
                              │   Nginx   │
                              └─────┬─────┘
                                    │
                         ┌──────────▼──────────┐
                         │ FastAPI API Service │
                         └───┬──────┬──────┬───┘
                             │      │      │
                  ┌──────────▼┐  ┌──▼───┐  └──────────────┐
                  │   MySQL   │  │Redis │                 │
                  └───────────┘  └──────┘           ┌─────▼──────┐
                                                   │ RabbitMQ    │
                                                   └─────┬──────┘
                                                         │
                       ┌─────────────────────────────────┼───────────────┐
                       │                                 │               │
                ┌──────▼──────┐                  ┌───────▼─────┐ ┌──────▼─────┐
                │Document     │                  │Agent Worker │ │Scheduler    │
                │Worker       │                  │LangGraph    │ │Celery Beat  │
                └──┬───────┬──┘                  └───────┬─────┘ └────────────┘
                   │       │                             │
             ┌─────▼──┐ ┌──▼──────┐              ┌──────▼────────┐
             │ MinIO  │ │ Qdrant  │              │Model Gateway  │
             └────────┘ └─────────┘              └───────────────┘

        全链路：OpenTelemetry → Prometheus / Loki / Tempo → Grafana
        AI 链路：Langfuse 记录 Prompt、检索、工具、Token、费用和反馈
```

---

## 5. 分阶段实施计划

## 阶段 0：建立可重复运行的基线

### 目标

先保证项目在一台新机器上可以通过明确步骤运行和测试，为后续改造提供可比较的基线。

### 当前已有

- `pyproject.toml`、`uv.lock`、`requirements.txt`。
- 前端 `package.json`、`package-lock.json`。
- FastAPI health 路由。
- pytest Fake 测试体系。

### 待增加或整理

- 修复 README 与当前 `OPENAI_*` 配置不一致的问题。
- 明确 Python、Node、uv 的最低版本。
- 增加统一开发命令，例如 `Makefile`、`Taskfile.yml` 或 PowerShell 脚本。
- 增加 `.env.example` 配置说明与启动前检查。
- 记录当前测试数量、API 启动时间和关键接口延迟。
- 禁止生产环境自动创建 `admin/admin1234`。

### 建议交付物

- `docs/development-setup.md`。
- `docs/configuration.md`。
- 后端 `scripts/check_env.py` 或等价检查工具。
- 前端和后端统一的本地启动说明。

### 验收标准

- 新环境仅根据文档即可启动前后端。
- 测试不连接真实 MySQL、Redis、Chroma 和模型服务。
- `/health/live` 与 `/health/ready` 含义明确。
- README 不再出现已废弃的配置变量。

---

## 阶段 1：Docker Compose 与基础服务容器化

### 目标

通过一条命令启动 API、前端、MySQL 和 Redis，消除本地环境差异。

### 待增加

- `backend/Dockerfile`。
- `front/Dockerfile`。
- `docker-compose.yml`。
- `docker-compose.dev.yml`。
- `.dockerignore`。
- MySQL、Redis 数据卷。
- 服务级 healthcheck。
- 容器启动顺序和失败重启策略。

### 第一版 Compose 只包含

- `frontend`
- `backend`
- `mysql`
- `redis`

RabbitMQ、MinIO、Qdrant 等在后续阶段再加入，便于定位问题。

### 验收标准

- `docker compose up -d` 后可以访问前端和 FastAPI 文档。
- 容器重启后 MySQL 和 Redis 数据不丢失。
- Backend 不使用容器内的 `localhost` 连接其他服务。
- 配置中不提交真实 API Key 和密码。
- 所有服务都有健康状态。

---

## 阶段 2：配置、数据库迁移与后端基础工程

### 目标

把配置、数据库变更、日志、请求追踪和异常处理变成可维护的工程能力。

### 2.1 配置管理

待增加：

- 使用 Pydantic Settings 定义 `AppSettings`。
- 按模块拆分 Database、Redis、Model、Storage、Queue 配置。
- 启动时校验必填配置。
- 区分 `development`、`test`、`production`。
- 日志中禁止打印 API Key、Token 和密码。

建议目录：

```text
backend/app/settings/
├── __init__.py
├── app.py
├── database.py
├── redis.py
├── model.py
├── queue.py
└── storage.py
```

### 2.2 Alembic

待增加：

- 初始化 Alembic。
- 生成当前表结构的基线版本。
- 将新表、新列、索引变更统一交给 Alembic。
- 启动时不再自动执行不可审计的复杂迁移。
- CI 中执行 `alembic upgrade head` 验证。

### 2.3 日志与请求上下文

待增加：

- JSON 结构化日志。
- `request_id`、`user_id`、`session_id`、`job_id`。
- 统一异常码和错误响应。
- 请求耗时和慢请求日志。
- 敏感信息脱敏。

### 验收标准

- 每次数据库变更都有迁移版本。
- API 请求日志可以用 `request_id` 串联。
- 非法配置在启动阶段直接失败并给出明确原因。
- 生产日志不包含完整 Token、密码或模型 Key。

---

## 阶段 3：并发模型和稳定性治理

### 目标

明确 asyncio、线程池、进程池和消息队列的职责，避免阻塞事件循环及任务失控。

### 并发职责

| 任务类型 | 推荐机制 | 示例 |
| --- | --- | --- |
| 异步 I/O | asyncio | MySQL、Redis、HTTP、LLM、Qdrant |
| 短同步阻塞 I/O | ThreadPoolExecutor | 同步文档 Loader、少量文件读取 |
| CPU 密集 | ProcessPoolExecutor 或独立 Worker | OCR、PDF 渲染、复杂解析 |
| 长任务、需重试 | Celery | 文档导入、Embedding、知识抽取 |
| 周期任务 | Celery Beat | 每日回顾、数据清理、失败补偿 |

### 待增加

- 统一的线程池/进程池生命周期管理。
- 并发上限和 asyncio Semaphore。
- LLM、数据库、Redis、向量库超时。
- Tenacity 指数退避重试。
- 请求取消和任务取消。
- 幂等键。
- 文件大小、任务时长和模型 Token 限制。
- 优雅关闭，停止接收任务后等待短任务结束。

### 验收标准

- CPU 密集任务不会阻塞 FastAPI 事件循环。
- 每个外部调用都有超时。
- 重试仅应用于可重试错误。
- 同一幂等键不会重复创建笔记或重复导入文档。
- 应用关闭时不再接收新任务，并能记录未完成任务。

---

## 阶段 4：RabbitMQ、Celery 和可靠后台任务

### 目标

将当前 `asyncio.create_task` 和进程内队列中的重要长任务迁移为可重试、可观测、可恢复的分布式任务。

### 新增组件

- RabbitMQ：Broker。
- Celery：Worker。
- Redis：任务进度和短期结果。
- Celery Beat：调度器。
- Flower：Worker 和队列监控。

### 建议队列划分

| 队列 | 任务 |
| --- | --- |
| `document` | 文档解析、PDF 图片提取、OCR |
| `embedding` | 文本切片、Embedding、向量写入 |
| `note` | 自动标签、关联推荐预计算 |
| `agent` | 超过同步时限的 Agent 任务 |
| `review` | 回顾问题生成、每日回顾调度 |
| `maintenance` | 清理临时文件、补偿和重建索引 |

### 统一任务状态

```text
PENDING → RUNNING → SUCCEEDED
                  ├→ FAILED
                  ├→ RETRYING
                  └→ CANCELLED
```

建议新增 `jobs` 表：

- `id`
- `user_id`
- `job_type`
- `status`
- `progress`
- `input_metadata`
- `result_metadata`
- `error_code`
- `error_message`
- `retry_count`
- `created_at` / `started_at` / `finished_at`

### API 变化

```text
POST /knowledge/jobs          创建导入任务
GET  /jobs/{job_id}           查询任务
GET  /jobs/{job_id}/events    SSE 进度
POST /jobs/{job_id}/cancel    请求取消
POST /jobs/{job_id}/retry     重试失败任务
```

### 迁移顺序

1. 笔记自动标签。
2. 多文件上传与解析。
3. Embedding 和向量写入。
4. 回顾问题生成。
5. 知识图谱抽取。
6. 长耗时 Agent 任务。

### 可靠性要求

- 消息确认。
- 有限次数重试。
- 指数退避。
- Dead Letter Queue。
- 任务幂等。
- Worker 崩溃后的重新投递。
- 任务执行超时。
- 错误结果可追踪。

### 验收标准

- API 进程重启不导致已入队任务丢失。
- Worker 失败后任务能重试或进入死信队列。
- 用户只能查看自己的任务。
- 前端可以实时看到任务进度。
- Flower 可以查看 Worker、队列和失败任务。

---

## 阶段 5：MinIO 对象存储

### 目标

将用户文件从本地目录迁移到统一对象存储，支持多实例 Backend 和 Worker。

### 待增加

- `ObjectStorage` 抽象接口。
- `MinioStorage` 实现。
- 本地 `LocalStorage` 实现用于测试。
- Bucket 初始化。
- 文件类型、大小、MD5 和权限校验。
- 预签名上传/下载 URL。
- 临时文件清理。

### 存储对象

- 用户上传的原始资料。
- PDF 提取图片。
- 用户头像。
- 笔记附件。
- Markdown/ZIP 导出文件。
- Agent 生成的文件。

### 数据库只保存

- Bucket。
- Object Key。
- 原始文件名。
- MIME 类型。
- 文件大小。
- MD5/ETag。
- 用户 ID。
- 创建时间。

### 验收标准

- Backend 和 Worker 不依赖同一块本地磁盘。
- 用户无法访问其他用户对象。
- 数据库不直接保存大文件。
- 对象删除有审计记录和补偿机制。
- 测试环境可以使用内存或本地 Fake Storage。

---

## 阶段 6：向量存储抽象与 Qdrant

### 目标

保留 Chroma 作为本地实现，同时支持独立部署的 Qdrant。

### 待增加

定义 `VectorStoreRepository`：

- `add_documents`
- `delete_by_document`
- `delete_by_user`
- `similarity_search`
- `similarity_search_with_score`
- `get_documents`
- `health_check`

实现：

- `ChromaVectorStoreRepository`。
- `QdrantVectorStoreRepository`。
- `FakeVectorStoreRepository`。

### Collection 规划

- `knowledge_chunks`：上传文档。
- `note_chunks`：用户笔记。
- 后期可增加 `memory_chunks` 和 `entity_chunks`。

统一 Metadata：

- `user_id`
- `document_id`
- `chunk_id`
- `source_type`
- `filename`
- `page`
- `content_hash`
- `embedding_version`

### 迁移要求

- 编写 Chroma → Qdrant 重建脚本。
- 支持双写验证阶段。
- 支持按用户重建索引。
- Embedding 模型变化时使用版本号，而不是覆盖旧向量。

### 验收标准

- 业务层不直接 import Chroma。
- 通过配置可以切换 Chroma/Qdrant。
- 用户过滤在存储层强制执行。
- Qdrant 不可用时返回明确的 readiness 状态。
- 可以对单个用户或单个文档重建向量。

---

## 阶段 7：LangGraph Agent 重构

### 目标

将路由层前置 RAG + LangChain AgentExecutor 改造成可观测、可恢复、有条件分支的 LangGraph 工作流。

### 当前流程

```text
路由判断 → 可选 RAG 前置管线 → AgentExecutor → 工具 → SSE
```

### 目标 StateGraph

```text
START
  │
  ▼
load_context
  │
  ▼
classify_intent
  ├── 普通聊天 ─────────────────────────┐
  ├── 知识问题 → rewrite_query          │
  │                → retrieve           │
  │                → rerank             │
  │                → grade_context      │
  │                → generate           │
  └── 工具任务 → plan_tools → tool_node │
                         │               │
                         └→ verify_result│
                                         ▼
                                   save_memory
                                         │
                                        END
```

### Agent State 建议字段

- `user_id`
- `session_id`
- `messages`
- `intent`
- `rewritten_query`
- `retrieved_documents`
- `reranked_documents`
- `rag_context`
- `tool_calls`
- `tool_results`
- `answer`
- `citations`
- `error`
- `retry_count`

### 待增加

- StateGraph。
- 条件边和错误边。
- Checkpointer。
- Thread/Session ID 映射。
- 中断和恢复。
- 人工审批节点。
- 最大节点次数和最大工具调用次数。
- 子图：RAG 子图、工具子图、写作子图。
- SSE 事件与 Graph Node 事件统一。

### Checkpoint 选择

第一步可以使用内存 Checkpoint 完成流程测试；随后使用数据库持久化实现。不要把内存 Checkpoint 当成生产方案。

### 迁移策略

1. 保留原 AgentExecutor。
2. 新增 `/chat/graph/query/stream`。
3. 对同一测试集比较旧流程和新流程。
4. 新流程稳定后切换默认入口。
5. 最后移除旧 AgentExecutor。

### 验收标准

- Agent 中断后可以从 Checkpoint 恢复。
- 每个节点的输入、输出和耗时可追踪。
- 工具异常不会导致整条会话不可恢复。
- RAG 是否执行由 Graph 条件边决定。
- SSE 能展示当前节点，但不泄露模型内部隐藏推理。

---

## 阶段 8：Agent 工具、MCP 与安全边界

### 目标

把工具从“可调用函数集合”升级成有权限、超时、审计、幂等和审批机制的工具平台。

### 工具分类

| 类别 | 示例 |
| --- | --- |
| 只读工具 | 搜索笔记、知识库查询、统计、时间 |
| 可逆写工具 | 创建草稿、添加标签 |
| 高影响工具 | 删除笔记、批量修改、发送外部消息 |
| 外部工具 | Web 搜索、GitHub、邮件、日历 |
| 受限工具 | SQL、文件系统、代码执行 |

### 每个工具必须具备

- Pydantic 输入模型。
- 用户身份和资源归属校验。
- 超时与取消。
- 输出大小限制。
- 审计日志。
- 幂等键。
- 错误类型。
- 是否需要人工审批。
- 是否允许重试。

### MCP 实施

先实现两个内部 MCP Server：

1. Note MCP：搜索、读取、创建笔记。
2. Knowledge MCP：知识库检索、文档详情、引用来源。

再实现 MCP Client，将允许的外部 MCP 工具注册到 Agent。

### Guardrails

- Prompt Injection 检测。
- 文档内容与系统指令隔离。
- 敏感信息脱敏。
- SSRF 防护。
- 文件路径白名单和沙箱。
- SQL 只读策略。
- 危险工具人工确认。
- 最大工具调用次数。
- 结构化输出校验。

### 验收标准

- Agent 不能通过工具访问其他用户的数据。
- 高影响操作必须在执行前确认。
- 工具输入输出均可审计。
- MCP 断开时不会导致核心笔记功能不可用。
- 恶意文档内容不能覆盖系统提示词或工具策略。

---

## 阶段 9：模型网关、记忆和成本治理

### 目标

统一模型调用策略，实现多模型路由、失败降级、Token/费用统计和分层记忆。

### ModelGateway

统一接口：

- `chat` / `chat_stream`
- `embedding`
- `vision`
- `structured_output`

统一能力：

- 超时。
- 重试。
- 并发限制。
- 模型降级。
- Token 统计。
- 成本统计。
- Trace ID。
- Prompt 版本。
- 模型供应商错误归一化。

### 推荐路由

| 场景 | 模型策略 |
| --- | --- |
| Agent 规划 | 高能力工具调用模型 |
| 普通问答 | 中等成本模型 |
| 自动标签 | 低成本模型 |
| 输入补全 | 低延迟模型 |
| Embedding | 独立嵌入模型 |
| PDF 视觉 | 独立多模态模型 |

### 记忆分层

- 短期记忆：当前 Graph State。
- 会话记忆：消息历史与会话摘要。
- 长期记忆：MySQL + Vector Store。
- 用户偏好：结构化用户设置。

### 待增加

- 历史消息压缩。
- 会话摘要。
- 用户事实抽取。
- Memory 去重、过期、删除。
- 用户主动清除记忆能力。

### 验收标准

- 可以查看每次请求使用的模型、Token 和费用。
- 主模型失败时按策略降级。
- 历史消息不会无限增长。
- 删除用户数据时同步删除长期记忆和向量。

---

## 阶段 10：可观测性

### 目标

让一次请求能够从 Nginx、FastAPI、数据库、Redis、RabbitMQ、Worker、Qdrant一直追踪到 LLM 和 Agent 节点。

### 10.1 常规可观测性

新增：

- OpenTelemetry SDK 和 FastAPI Instrumentation。
- MySQL、Redis、HTTP Client、Celery 埋点。
- Prometheus。
- Grafana。
- Loki。
- Tempo 或 Jaeger。

核心指标：

- API QPS、P50/P95/P99。
- HTTP 错误率。
- MySQL 连接池和慢查询。
- Redis 命中率与延迟。
- RabbitMQ 队列长度。
- Worker 成功率、重试率、运行时间。
- 文档解析和 Embedding 耗时。
- Qdrant 查询耗时。

### 10.2 AI 可观测性

推荐 Langfuse，记录：

- Prompt 版本。
- 模型名。
- Token 与费用。
- 首 Token 延迟。
- 检索和重排序结果。
- Agent 节点轨迹。
- 工具调用。
- 引用来源。
- 用户评分。

### 隐私要求

- 默认不记录完整 Token。
- 对用户内容和模型输入进行可配置采样。
- 对手机号、邮箱、API Key 等信息脱敏。
- 用户删除数据时同步处理追踪数据。

### 验收标准

- 输入一个 Trace ID 可以定位完整调用链。
- Grafana 有 API、队列、Worker、模型和 RAG 面板。
- 任务积压和模型错误可以触发告警。
- 可观测系统异常不影响核心业务。

---

## 阶段 11：测试、评估与 CI/CD

### 目标

把“代码可以运行”提升为“功能、基础设施和 AI 效果能够持续回归”。

### 测试分层

| 层级 | 工具 | 目标 |
| --- | --- | --- |
| 单元测试 | pytest + Fake | 快速验证业务逻辑 |
| 组件测试 | Testcontainers | 验证真实 MySQL、Redis、RabbitMQ、MinIO、Qdrant |
| API 测试 | httpx ASGITransport | 验证接口契约 |
| 集成测试 | Docker Compose | 验证完整数据流 |
| 压力测试 | k6 或 Locust | 验证并发与稳定性 |
| RAG 评估 | RAGAS/DeepEval | 验证召回、忠实度和相关性 |
| Agent 评估 | 轨迹断言和任务成功率 | 验证节点与工具策略 |

### AI 评估数据集

建立版本化数据集：

- 直接事实问题。
- 跨文档问题。
- 无答案问题。
- 权限隔离问题。
- Prompt Injection 样本。
- 工具调用任务。
- 多轮对话任务。
- 引用正确性样本。

指标：

- Recall@K。
- MRR/NDCG。
- Context Relevance。
- Faithfulness。
- Answer Relevance。
- Citation Accuracy。
- Agent Task Success Rate。
- 平均工具调用次数。
- 延迟和 Token 成本。

### CI/CD

GitHub Actions 建议步骤：

1. Ruff。
2. 类型检查。
3. 单元测试。
4. Testcontainers 集成测试。
5. 前端 lint/build。
6. Docker 镜像构建。
7. Trivy 镜像扫描。
8. Alembic 迁移验证。
9. RAG/Agent 小型回归集。
10. 推送镜像和部署测试环境。

### 验收标准

- 每次合并都执行自动测试。
- 数据库迁移可以从空库升级到最新版本。
- RAG/Agent 指标下降超过阈值时阻止发布。
- 镜像存在高危漏洞时阻止发布。

---

## 阶段 12：生产部署与网关

### 目标

补齐反向代理、安全头、证书、备份、扩缩容和灾难恢复。

### 待增加

- Nginx。
- HTTPS。
- API 请求体和上传大小限制。
- CORS 白名单。
- 安全响应头。
- Backend/Worker 水平扩展。
- 数据库、Redis、RabbitMQ、MinIO、Qdrant 备份。
- 恢复演练。
- Secret 管理。
- 发布回滚策略。

### 安全整改

- 移除默认管理员密码。
- 生产环境强制随机 SECRET_KEY。
- 限流默认启用。
- 上传文件白名单和内容检测。
- 管理接口单独授权。
- 所有数据访问强制用户隔离。
- 依赖和镜像定期扫描。

### 验收标准

- HTTPS 和安全头正确。
- Backend 多副本下会话、文件、向量和任务正常。
- 单个 Worker 下线不会丢失任务。
- 完成一次备份恢复演练。
- 可以在限定时间内回滚上一版本。

---

## 6. 后期可选扩展

这些组件有价值，但不应在核心路线完成前加入。

### 6.1 知识图谱与 GraphRAG

状态：已有设计文档，尚未实施。

可增加：

- MySQL 图模型或 Neo4j。
- 实体、关系、别名和来源证据。
- Obsidian 风格双链。
- GraphRAG 检索。
- 图谱可视化。

建议先用 MySQL 实现一期，确定查询需求后再判断是否需要 Neo4j。

### 6.2 Elasticsearch/OpenSearch

仅在以下需求明确时引入：

- 复杂全文搜索。
- 拼写纠正和高亮。
- 大量日志搜索。
- 全文和向量统一检索。

如果 Qdrant + MySQL + Loki 已满足需求，不必增加。

### 6.3 Kafka

RabbitMQ 已足够处理当前后台任务。只有出现以下需求时考虑 Kafka：

- 大量事件流。
- 多消费者重放。
- 行为分析。
- CDC。
- 实时数据管道。

不要让 RabbitMQ 和 Kafka承担相同任务。

### 6.4 Kubernetes

Docker Compose 稳定后再考虑：

- 多节点部署。
- 自动扩缩容。
- 滚动发布。
- GPU Worker 调度。
- 更成熟的 Secret 和配置管理。

### 6.5 Keycloak、Vault、服务发现

- Keycloak：需要 OAuth2/OIDC、企业 SSO 时引入。
- Vault：Secret 数量多、需要动态凭据时引入。
- Consul/Nacos：拆分为大量微服务后再引入。

---

## 7. 推荐目录演进

```text
RAGNotebook-master/
├── backend/
│   ├── app/
│   │   ├── api/                 # API 路由与依赖
│   │   ├── agent/
│   │   │   ├── graphs/          # LangGraph
│   │   │   ├── nodes/
│   │   │   ├── tools/
│   │   │   ├── state/
│   │   │   ├── guardrails/
│   │   │   └── memory/
│   │   ├── domain/              # 领域模型和业务规则
│   │   ├── repositories/        # MySQL/向量存储接口
│   │   ├── services/
│   │   ├── infrastructure/
│   │   │   ├── database/
│   │   │   ├── redis/
│   │   │   ├── queue/
│   │   │   ├── storage/
│   │   │   ├── vector/
│   │   │   ├── model_gateway/
│   │   │   └── observability/
│   │   ├── workers/
│   │   │   ├── document_tasks.py
│   │   │   ├── embedding_tasks.py
│   │   │   ├── note_tasks.py
│   │   │   └── review_tasks.py
│   │   └── settings/
│   ├── alembic/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── contract/
│   │   └── evaluation/
│   └── Dockerfile
├── front/
│   └── Dockerfile
├── deploy/
│   ├── nginx/
│   ├── prometheus/
│   ├── grafana/
│   ├── loki/
│   └── otel/
├── docs/
├── plan/
├── scripts/
├── docker-compose.yml
└── docker-compose.dev.yml
```

目录迁移应渐进进行，不要为了“看起来整洁”一次性搬动全部现有文件。

---

## 8. 推荐 Pull Request 拆分

| PR | 内容 | 前置依赖 |
| --- | --- | --- |
| PR-01 | 开发环境文档、配置校验、移除默认生产账号 | 无 |
| PR-02 | Backend/Frontend/MySQL/Redis Docker Compose | PR-01 |
| PR-03 | Pydantic Settings 与结构化日志 | PR-01 |
| PR-04 | Alembic 基线迁移 | PR-03 |
| PR-05 | 超时、重试、幂等和并发限制 | PR-03 |
| PR-06 | RabbitMQ + Celery + Flower 基础框架 | PR-02 |
| PR-07 | 自动标签任务迁移到 Celery | PR-06 |
| PR-08 | 文档处理和 Embedding 任务迁移 | PR-07 |
| PR-09 | Celery Beat 回顾调度和维护任务 | PR-06 |
| PR-10 | MinIO 与 ObjectStorage 抽象 | PR-02 |
| PR-11 | VectorStoreRepository 抽象 | PR-03 |
| PR-12 | Qdrant 实现和重建脚本 | PR-11 |
| PR-13 | LangGraph State 和最小聊天图 | PR-03 |
| PR-14 | RAG 子图、工具子图、Checkpoint | PR-13 |
| PR-15 | 工具权限、审批和审计 | PR-14 |
| PR-16 | Note/Knowledge MCP Server | PR-15 |
| PR-17 | ModelGateway、模型降级和成本统计 | PR-14 |
| PR-18 | OpenTelemetry + Prometheus + Grafana | PR-06 |
| PR-19 | Loki/Tempo + Langfuse | PR-18 |
| PR-20 | Testcontainers 和真实中间件集成测试 | PR-12 |
| PR-21 | RAG/Agent 评估集 | PR-14 |
| PR-22 | Nginx、安全配置和 CI/CD | 前述核心 PR |

每个 PR 应尽量满足：

- 只解决一个主要问题。
- 包含测试。
- 包含配置示例。
- 包含迁移或回滚说明。
- 不要求下一个 PR 才能恢复项目运行。

---

## 9. 明确不应同时做的事情

- 不同时引入 Celery、Dramatiq、ARQ 和 Taskiq。
- 不同时让 RabbitMQ 和 Kafka 处理同一种任务。
- 不同时迁移主数据库、消息队列、向量库和 Agent 框架。
- 不在没有存储抽象时直接把所有 Chroma 调用替换为 Qdrant。
- 不在没有评估集时直接删除旧 AgentExecutor。
- 不把 ProcessPoolExecutor 当成可靠消息队列。
- 不把 Redis Pub/Sub 当成需要持久化和确认的任务队列。
- 不因依赖树里存在 LangGraph/OTel 包，就认为对应能力已经落地。
- 不在 Docker Compose 尚未稳定时直接迁移 Kubernetes。
- 不为展示技术栈而加入没有实际业务用途的组件。

---

## 10. 总体完成定义

当以下条件全部满足时，可认为本轮后端与 Agent 工程化改造完成：

- [ ] Docker Compose 可以启动完整开发环境。
- [ ] 数据库变更全部通过 Alembic 管理。
- [ ] Redis 有统一封装、Key 规范、TTL 和监控。
- [ ] 长任务通过 RabbitMQ + Celery 执行。
- [ ] Worker 支持重试、幂等、超时和死信处理。
- [ ] 文件通过 MinIO/ObjectStorage 管理。
- [ ] 向量层支持 Chroma/Qdrant 切换。
- [ ] 核心 Agent 使用 LangGraph StateGraph。
- [ ] Agent 支持 Checkpoint、中断、恢复和人工审批。
- [ ] 工具有权限、超时、审计和危险等级。
- [ ] 至少提供 Note 和 Knowledge 两类 MCP 能力。
- [ ] 模型调用有统一网关、降级、Token 和费用统计。
- [ ] OpenTelemetry 可以串联 API、队列、Worker、检索和模型调用。
- [ ] Grafana 和 Langfuse 能看到系统及 AI 指标。
- [ ] Testcontainers 覆盖主要中间件。
- [ ] RAG/Agent 有版本化评估集和发布阈值。
- [ ] CI/CD 自动执行测试、构建、扫描和迁移验证。
- [ ] 生产环境启用 HTTPS、CORS 白名单、限流和 Secret 管理。
- [ ] 完成备份恢复与版本回滚演练。

---

## 11. 最小推荐实施顺序

如果目标是“一步步加入并且每一步都能学到东西”，推荐严格按照以下顺序：

1. 修复开发环境和文档基线。
2. Docker Compose：Backend + Frontend + MySQL + Redis。
3. Pydantic Settings、结构化日志、Request ID。
4. Alembic。
5. 超时、重试、幂等和并发边界。
6. RabbitMQ + Celery + Flower。
7. 将自动标签和文档处理迁移到 Worker。
8. MinIO。
9. VectorStore 抽象和 Qdrant。
10. LangGraph 最小状态图。
11. RAG/工具子图和持久化 Checkpoint。
12. Agent 工具安全、人工审批和 MCP。
13. ModelGateway、成本统计和记忆治理。
14. OpenTelemetry、Prometheus、Grafana、Loki、Tempo。
15. Langfuse 和 RAG/Agent 评估。
16. Testcontainers、压力测试和 CI/CD。
17. Nginx 与生产安全。
18. 最后再选择知识图谱、Kafka或 Kubernetes 等扩展。

按照该顺序实施，前半段建立可靠的后端基础设施，中段完成分布式任务和存储升级，后半段再重构 Agent 并补齐可观测、评估和生产部署能力。
