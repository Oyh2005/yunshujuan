# 公开分享页 `/share/:id` 效果图 v1

> 状态：**概念稿，尚未实现**。现行实现在 `front/src/pages/PublicSharePage.tsx`。
> 本页免登录、不进 `MainLayout`，因此不受工作台壳约束，可以做成独立沉浸界面（skill 明确允许的例外）。
> 出图：1600×1000（16:10）+ 深色 + 移动端 390×844。

| 文件 | 说明 |
| --- | --- |
| `01-share-desktop.png` | 桌面首屏 |
| `02-share-dark.png` | 深色 |
| `03-share-mobile.png` | 移动端 |
| `share.html` | 可交互原型 |
| `study-cloud.png` | 从 `front/public/illustrations/` 复制 |

---

## 1. 现行实现为什么丑（三个真问题）

| # | 问题 | 依据 |
| --- | --- | --- |
| 1 | **渐变背离品牌**：用了 `from-[#1f6c9f] via-[#7c6cf0] to-[#d0579b]` 的**饱和渐变 + 白字**。产品调性是"淡紫、轻盈"，`design-system.md` 指定的柔和横幅是 `linear-gradient(120deg,#E2E7FF,#ECE4FE 51%,#FCECF2)`，**浅底深字**。这个重色块是"丑"的主因 | `PublicSharePage.tsx:56` |
| 2 | **没有作者**：分享页不显示谁写的。`Note` 表有 `user_id`，但 `share_router._fetch_public_note()` 只返回笔记字段，没 join 用户 | `backend/app/router/share_router.py:42-50` |
| 3 | **没有出口**：读完只有一行"本页面由云舒卷生成"，对未登录访客零转化，也没有回首页/注册的明确入口 | `PublicSharePage.tsx:123` |

## 2. 新版结构

```
┌ 吸顶顶栏 64px ─────────────────────────────────────────┐
│ ☁ 云舒卷                        [复制链接] [免费开始记录] │
├ 阅读进度条 2px ────────────────────────────────────────┤
│ 柔和横幅（浅底深字）                                     │
│   分类胶囊                                              │
│   标题 40px                                             │
│   作者头像+昵称 · 更新于 · 328 次浏览                     │
│   标签                                                  │
├ 正文 760px 阅读列 ────────────────────────────────────┤
│   h2 / p / ul / blockquote / pre                        │
│   ┌ 作者卡（头像 · 简介 · 查看主页）──────────────────┐ │
│   ┌ 引导卡（云朵插画 · 免费开始）───────────────────┐ │
├ 页脚：本页面由云舒卷生成 ──────────────────────────────┤
```

## 3. 关键设计决策

- **横幅改用产品调性**：`#E2E7FF → #ECE4FE → #FCECF2` 浅底 + 深色标题（深色模式 `#302746 → #332949 → #422D43`）。这是 skill 里写死的柔和横幅值，不是我编的。
- **阅读列 760px**：正文 15.5px / 行高 1.95，中文阅读的舒适宽度。比原来的 `max-w-3xl`（768px）略窄一点，但去掉了大色块压迫感。
- **作者卡放正文末尾**，不在横幅里堆信息——横幅只保留"谁 + 什么时候 + 多少浏览"，简洁。
- **底部引导卡**替代原来的一行灰字，给未登录访客一个明确出口。
- **阅读进度条**：2px，吸顶栏下方，纯装饰但能提升长文阅读体验。

## 4. 数据真实性

### 直接复用现有接口（`GET /public/note/{id}`）

`title`、`content`、`tags`、`category`、`created_at`、`updated_at`、`view_count` —— 全部已有。

### 本稿新增（需要接线）

| 项 | 需要什么 | 工作量 |
| --- | --- | --- |
| **作者信息**（头像、昵称、简介、公开笔记数、主页链接） | 后端 `_fetch_public_note()` 用 `Note.user_id` join `User` 表，返回 `author: { username, avatar, bio, public_note_count }`；前端 `PublicNote` 类型加 `author` 字段 | 后端约 10 行 + 前端类型与渲染 |
| **查看主页** 按钮 | 复用已有的公开主页路由 `/user/:userId`，需在 author 里返回 `user_id`（或直接复用 `uuid`） | 小 |

> 作者信息对分享页几乎是刚需——"别人分享的笔记"总得知道是谁写的。如果不想动后端，可以砍掉作者卡和横幅里的作者行，只保留日期和浏览数，页面依然成立。

### 示例数据（出图用，非生产值）

欧阳 / 共公开 12 篇笔记 / 更新于 2026-08-28 / 328 次浏览 / 标签 RAG·知识管理·向量检索。

## 5. 实测数值（效果图）

| 项 | 桌面 | 移动端 |
| --- | --- | --- |
| 顶栏高度 | 64px | 58px |
| 阅读列宽 | 760px | 通栏 |
| 标题字号 | 40px | 27px |
| 正文字号 / 行高 | 15.5px / 1.95 | 15px / 1.9 |
| 横向溢出 | 0 | 0 |
| 引导卡 | 横向 | 纵向 |

深色：背景 `#1B1723`、正文 `#F0EDF7`、横幅 `#302746 → #332949 → #422D43`。

---

# 代码落地（已完成，未提交）

## 改动清单

| 文件 | 动作 |
| --- | --- |
| `backend/app/router/share_router.py` | `_fetch_public_note()` 用 `Note.user_id` join `User`，返回 `author`：`id / username / avatar / bio / public_note_count` |
| `front/src/api/share.ts` | 新增 `PublicAuthor` 类型，`PublicNote` 加 `author: PublicAuthor \| null` |
| `front/src/styles/share-page.css` | 新增（顶栏 / 阅读进度 / 柔和横幅 / 760px 阅读列 / 作者卡 / 引导卡 / 空状态 + 深色 + ≤767px） |
| `front/src/pages/PublicSharePage.tsx` | 重写 |
| `front/src/i18n/locales/{zh-CN,en-US}.ts` | `share.*` 新增 10 个键 |

**隐私**：author 只返回 `id / username / avatar / bio / public_note_count`，不含 email、手机号、user_id 外的任何字段。作者主动公开笔记，昵称头像属预期公开范围（公开主页 `/user/:userId` 本就展示这些内容）。

## 实现要点

- **阅读进度条**用 `ref` 直接改 DOM 宽度（rAF 节流），不进 state，避免滚动时反复重渲染。
- **作者信息容错**：`note.author` 为 null 时，横幅退化成"云舒卷"占位，文末不渲染作者卡。后端没升级也不会白屏。
- **Markdown 补了 `remarkGfm`**（原来只有 `rehypeHighlight`），表格/删除线等 GFM 语法现在能正确渲染——符合项目"新增 markdown 渲染处必须带 remarkGfm"的约定。
- **深色能生效**：`.dark` 类由 `App.tsx`（根组件）统一 toggle，与路由无关，所以免登录的分享页同样继承主题。
- **404 与"未公开"同表现**，并在提示里写明原因（隐私设计，不泄露笔记是否存在）。

## 真实环境验证

后端热重载后实测 `GET /public/note/{id}` 返回：
```json
"author": {"id":"dbef94274b3f4a7e9e4bc1a9","username":"admin",
           "avatar":"/media/img/....jpg","bio":"短短的简介介绍不了我(=^▽^=)",
           "public_note_count":1}
```

| 检查项 | 分享页 | 404 / 未公开 |
| --- | --- | --- |
| 顶栏高度 | 64px | 64px |
| 阅读列宽 | 760px | — |
| 标题 / 作者 | 新世界 / admin · 共公开 1 篇笔记 | 笔记不存在或未公开 |
| 作者卡 / 引导卡 | 有 | 无（不误导） |
| 横幅渐变 | `#E2E7FF → #ECE4FE → #FCECF2` | — |
| 横向溢出 | 0 | 0 |
| 深色 | bg `#1B1723`、横幅 `#302746→`、卡片 `#24202E` | 同 |
| 移动端 390×844 | 顶栏 58、标题 27px、引导卡/作者卡转纵向、溢出 0 | 标题 20px、溢出 0 |

`npx tsc -b --noEmit` 与 `npx eslint src --ext .ts,.tsx` 均 **0 问题**。
真实渲染截图见 `real/`（6 张）。

## 待确认

1. 后端 join 要不要保留？（不想要就 revert `share_router.py`，前端会自动退化，不会白屏）
2. 底部引导卡的文案与按钮语气。
3. 长笔记是否需要目录（TOC）？建议"h2 超过 3 个才显示"，短笔记不显示。
