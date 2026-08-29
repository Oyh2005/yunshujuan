# 社交私聊 P0 交付记录（2026-08-29）：仅好友私聊 + WebSocket 实时

> 关联：`plan/roadmap/2026-08-29-social-messaging-plan.md`（功能清单计划）
> 用户决策：仅好友可私聊 + WebSocket 实时（非轮询/SSE）
> 状态：全部完成并验证（前端 WS 交互需本机双账号实测）

---

## 一、数据模型（重启自动建表/迁移）
- `chat_conversations`：user_a/user_b **归一化配对**（字典序小者在前）+ UNIQUE(user_a,user_b) 防重复会话；last_message_at/last_message(500)/last_sender_id
- `private_messages`：自增主键（游标分页）、conversation_id/sender_id 索引、read 已读标记
- ⚠️ **表名避坑**：私聊消息表不能叫 `chat_messages`——已被 AI 对话消息表（chat_history.py 的 ChatMessage）占用，SQLAlchemy 直接报 "Table already defined"；改用 `private_messages`/`PrivateMessage`

## 二、REST API（social_router.py 追加，prefix /social/chat）
| 接口 | 说明 |
| --- | --- |
| `GET /chat/conversations` | 会话列表：对方信息（批量 _get_user_briefs）+ 最后消息 + 未读数，按最后消息倒序 |
| `GET /chat/conversations/{peer}/messages?cursor=&limit=` | 历史消息游标分页（id 倒序取 limit+1 判 has_more，返回正序） |
| `POST /chat/conversations/{peer}/messages` | 发消息：**仅好友**（`_friend_ids` 校验，非好友 403）+ 本地敏感词拦截（复用 `_assert_clean`）+ 无会话自动创建 + 落库后 WS 推送消息与未读数 |
| `POST /chat/conversations/{peer}/read` | 标记已读（UPDATE read=True）+ WS 通知对方 read + 返回最新未读 |
| `GET /chat/unread-count` | 未读总数（侧边栏红点） |
| profile 扩展 | `GET /social/users/{id}/profile` 的 follow 块新增 `is_friend`（前端私信按钮显示条件） |

## 三、WebSocket 实时通道
- **端点** `/ws/chat?token=<jwt>`（`app/router/ws_router.py`，浏览器 WS 无法带 header，token 走 query；校验失败 close 4001）
- **连接管理** `app/core/ws_manager.py`：user_id → set[WebSocket]（多标签页广播），断开静默清理；发送失败不抛（推送不能成为故障源）
- **协议**：客户端 30s `ping` → 服务端 `pong`；服务端 60s 无消息断开（心跳超时）
- **推送**：`{type:"message", conversation_id, message}` 新消息、`{type:"read", conversation_id}` 对方已读、`{type:"unread", count}` 未读总数
- **离线消息**：照常落库 + 未读数，重连后 REST 拉取历史 + 未读刷新
- **部署**：`deploy/nginx.conf.example` 补 `/ws/` 代理（Upgrade/Connection 头 + map 指令示例 + 300s 读超时）；vite 代理加 `'/ws/'`（`ws: true`）

## 四、前端
- `api/messages.ts`：messagesApi（命名避开 AI 对话的 chatApi；端点键 chat* 在 endpoints.ts）
- `hooks/useChatSocket.ts`：连接/指数退避重连（1s→30s 封顶）/30s 心跳/事件回调（onMessage/onRead，ref 同步放 effect 守 purity 规则）；`unread` 事件直接更新全局 store
- `stores/useChatStore.ts`：私聊未读全局状态（WS 即时 + Sidebar 30s 轮询兜底）
- `pages/MessagesPage.tsx`（`/messages`，SocialLayout 内）：
  - 左会话列表（头像/最后消息/时间/未读徽标）+ 右聊天窗（气泡 mine/theirs、时间、已读/未读标记、加载更早、Enter 发送）
  - `?with={peerId}` 直达会话（好友列表/个人主页入口跳转）
  - WS：当前会话新消息即时追加 + 自动已读；其他会话刷新列表（unread+1）
  - **移动端**：两栏切换（`has-chat` 时列表隐藏 + 返回按钮），767px/600px 断点
- Sidebar：社交组新增「私信」入口（MessagesSquare 图标）+ 私聊未读徽标（accent 色，区别于通知红点）
- 入口：好友列表行「发私信」按钮（`/messages?with=`）、个人主页好友时「发私信」按钮
- i18n：`nav.messages`、`userpage.message` 中英配对

## 五、验证
| 检查项 | 结果 |
| --- | --- |
| py_compile（5 文件） | ✅ |
| 探针 `.probe_chat.py`（临时 uvicorn 8020，websockets 16.0 客户端） | ✅ **15 项 ALL PASS**：登录/非好友 403/建好友/WS ping-pong/发消息实时推送/unread 事件/会话列表/未读总数/历史/标记已读+read 事件/游标分页 6 条/敏感词 400/非法 token 拒绝/自动清理 |
| `npx tsc -b --noEmit` | ✅ 0 错误 |
| `npx eslint src --ext .ts,.tsx` | ✅ 0 问题 |
| CSS 语法（postcss.parse） | ✅ |
| vite 代理冲突 | ✅ 新前缀 `/ws/` 已加 ws: true；REST 走已有 `^/social/` |
| 前端 WS 交互（双账号实时聊天） | ⚠️ 需本机验证：admin/admin2 互发消息、红点、已读状态 |

## 六、待用户确认
- 重启后端 8000（新表自动创建 + /ws/chat + REST 接口）
- 前端刷新后：admin 与 admin2 互加好友 → 好友列表「发私信」→ 双窗口实时互聊（WS 推送）、未读红点、已读状态
- 上线公测前：nginx 的 map 指令需放到 http 上下文（配置示例已注释说明）
