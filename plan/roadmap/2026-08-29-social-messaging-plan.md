# 社交功能完善计划：好友私聊 + 动态增强（2026-08-29）

> 定位：社交模块（方向 B 已完成）的二期扩展。用户确认：**仅好友可私聊** + **WebSocket 实时推送**。
> 关联：`plan/roadmap/2026-08-26-feature-expansion-plan.md`（六方向企划，社交属方向 B 已交付）、交接文档 §2 社交行

---

## 现状盘点（勿重复开发）

已有 24 个接口 + 5 页面：广场 / 用户搜索 / 好友（列表/申请/响应/删除）/ 关注 / 动态（发/feed/我的/详情/点赞/评论/删除）/ 通知（列表/未读数/已读）/ 个人主页（资料/粉丝/关注/公开笔记）/ 排行榜 / AI 内容审核。
**缺失**：私聊、动态收藏、@提及、动态编辑、图片查看器、备注名、拉黑、已读回执。

## 一、P0 好友私聊（本期核心，约 2.5~3 天）

### 数据模型（自动建表/迁移）
```
chat_conversations
  id UUID PK | user_a / user_b（归一化排序：字典序小者在前，UNIQUE(user_a,user_b)）
  last_message_at | last_message（预览 500）| last_sender_id | created_at

chat_messages
  id INT PK 自增（游标分页）| conversation_id (idx) | sender_id (idx)
  content TEXT | read BOOL (idx) | created_at (idx)
```

### REST API（`social_router.py` 或新 `chat_router.py`）
| 接口 | 说明 |
| --- | --- |
| `GET /social/chat/conversations` | 会话列表：对方用户信息 + 最后消息 + 未读数 |
| `GET /social/chat/conversations/{user_id}/messages?cursor=&limit=` | 历史消息（游标分页，倒序加载） |
| `POST /social/chat/conversations/{user_id}/messages` | 发消息：**仅好友校验**（非好友 403）；无会话自动创建；本地敏感词即时拦截；落库后 WS 推送 |
| `POST /social/chat/conversations/{user_id}/read` | 标记该会话已读（WS 通知对方已读） |
| `GET /social/chat/unread-count` | 私聊未读总数（并入侧边栏红点） |
| `DELETE /social/chat/conversations/{user_id}` | 删除会话（仅隐藏自己视角，可选） |

### WebSocket 实时通道
- 端点：`/ws/chat?token=<jwt>`（浏览器 WS 无法带 header，token 走 query；校验失败 close 4001）
- 连接管理：`user_id → set[WebSocket]`（多标签页广播）；断线自动清理
- 协议（JSON）：
  - 服务端→客户端：`{type:'message', ...}` 新消息、`{type:'read', conversation_id}`、`{type:'unread', count}`
  - 客户端→服务端：`{type:'ping'}` 心跳（30s；服务端 60s 无消息断开）
- 离线消息：照常落库 + 未读数，重连后 REST 拉取 + 未读刷新
- ⚠️ 部署：`deploy/nginx.conf.example` 补 WebSocket upgrade 配置（`map $http_upgrade` + `proxy_set_header Upgrade/Connection`）；vite 代理加 `'/ws/'` 前缀（`ws: true`）

### 前端
- `useChatSocket` hook：连接/自动重连（指数退避）/事件订阅/心跳
- 新页面 `/messages`（SocialLayout 内）：会话列表 + 聊天窗（气泡/时间/未读/已读状态），移动端两栏切换；路由 lazy + Sidebar 社交组入口 + i18n `nav.messages`
- 入口：好友列表行「发消息」、个人主页「私信」按钮
- 未读红点：WS `unread` 事件即时更新 + 现有 30s 轮询兜底（`unread-count` 并入）

## 二、P1 动态增强（约 1 天）
| 功能 | 说明 |
| --- | --- |
| 动态收藏 | `post_favorites` 表 + 收藏/取消 + 「我的收藏」列表 |
| 图片查看器 | 动态多图点击放大（纯前端 Modal） |
| 动态编辑 | 自己动态 30 分钟内可修改 |
| @提及 | 动态/评论解析 `@用户名` → 被提及者收通知（复用 notifications 表） |

## 三、P2 关系管理（按需）
好友备注名（仅自己可见）/ 拉黑（互不可见 + 禁私聊）/ 私聊已读回执展示。

## 四、P3 远期
群聊、图片/语音消息、消息搜索、WebSocket 心跳优化为二进制帧。

## 五、验证方案
- 后端：py_compile + 临时 uvicorn 探针（好友/非好友发消息、会话创建、未读数、WS 连接与推送用 `websockets` 库客户端断言）
- 前端：tsc + eslint；WS 前端逻辑无法沙箱实测 → 标注本机验证（浏览器双账号 admin/admin2 互聊）
- 交付检查清单照常（i18n 中英、限流、代理冲突检查——`/ws/` 新前缀）

## 六、实施顺序
1. 数据模型 + REST API + 探针
2. WebSocket 端点 + 连接管理 + 探针（websockets 客户端）
3. useChatSocket + /messages 页面 + 入口打通 + 红点
4. nginx 示例更新 + 交接文档 + 交付记录
