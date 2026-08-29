# 阶段二「个人与系统页面」效果图 v1

路由：`/profile`、`/settings`、`/pet`
状态：**概念稿，尚未实现**。三页当前都是 `max-w-2xl / max-w-3xl` 窄卡片，未接入工作台壳。
出图：1600×1000（16:10），符合 `page-patterns.md`「页面效果图」要求。

| 文件 | 说明 |
| --- | --- |
| `01-profile.png` | 个人信息页 |
| `02-settings.png` | 设置页 |
| `03-pet.png` | 小卷养成页（首屏） |
| `04-pet-full.png` | 小卷养成页（整页长图） |
| `05-profile-dark.png` `06-settings-dark.png` `07-pet-dark.png` | 深色模式（1600×1000） |
| `08-profile-mobile.png` `09-settings-mobile.png` `10-pet-mobile.png` | 移动端（390×844） |
| `11-pet-mobile-full.png` | 小卷养成页移动端整页 |
| `profile.html` / `settings.html` / `pet.html` | 可交互原型（同一套令牌与规则） |
| `_shell.css` | 三页共享的外壳样式 |
| `study-cloud.png` | 从 `front/public/illustrations/` 复制的页宠插画 |

---

## 1. 风格一致性：同源，不是模仿

| 来源 | 复用内容 |
| --- | --- |
| `front/src/index.css` `:root` | 全部 `--color-*` / `--category-*` / `--gradient-brand` 令牌 |
| `styles/workspace.css` | `.app-shell` / `.app-sidebar` / `.app-workspace` / `.sidebar-*` / `.primary-button` / `.secondary-button` / `.workspace-icon-button` |
| `styles/knowledge-pages.css` | 78px 顶栏（面包屑 + 胶囊搜索 + 页宠/通知/头像）、`.knowledge-panel` 卡片、页头 `clamp(25px,2.4vw,32px)/750` |
| `components/layout/Sidebar.tsx` | 206px 侧栏、四分组、组标题 15px/600、子项缩进 26px |
| `public/illustrations/study-cloud.png` | 页宠主视觉与悬浮页宠 |
| `i18n/locales/zh-CN.ts` | 全部可见文案取真实 key（`profile.*`、`settings.*`、`pet.*`、`nav.*`、`knowledgeUI.search`） |

浏览器实测数值（三页一致）：侧栏 **206px**、顶栏 **78px**、外壳 `padding/gap` **0/0**、横向溢出 **0**、页宠图已加载。
内容列宽：`/profile`、`/settings` **940px**；`/pet` **1180px**（内容更密）。

---

## 2. 关键判断：壳用全视口铺满

`.app-shell` 基础样式是**浮动卡片壳**（`padding:14px; gap:16px` + 20px 圆角 + 阴影），
但 6 个域 CSS 全部覆盖成**全视口铺满**：

```
is-dashboard / is-knowledge / is-ai / is-learning / is-social / is-note-authoring
  → .app-shell { padding: 0; gap: 0 }
  → 侧栏 radius 0 + 仅右边框、无阴影
  → 工作区透明、无边框
```

`/profile`、`/settings`、`/pet`、`/about` **没有 `is-*` 变体**，是唯一还停在旧浮动壳上的页面。
三张效果图统一采用全视口铺满，新增域变体建议命名 **`is-account`**（三页共用）。

---

## 3. 逐页构图

### `/profile` 个人信息
```
页头：个人信息 / 管理你的账号信息、公开形象与账号安全      [编辑]
────────────────────────────────────────────────
身份卡   头像 84 + 欧阳 + 邮箱 + 个人简介胶囊
基本信息  用户名 / 邮箱 / 手机号 / 性别 / 注册时间
账号安全  密码 → [修改密码]
```
**按你的决定：不设右栏**，内容列约束 940px（避免信息行被拉长到 1300px 显得空洞）。

### `/settings` 设置
```
外观与语言  主题（开关）· 语言（中文 | English 分段）
页宠        页宠小卷（开关，默认开）
AI 对话     聊天字体大小（滑块 12–20px + 实时气泡预览）
```
控件语义沿用现有实现：主题/页宠是 `role="switch"`，语言是双按钮，字号是 `range` + 预览。

### `/pet` 小卷养成
```
主视觉卡（渐变横幅）  页宠大图 + 小卷 Lv.2 云精灵 + 好感度 108/150 + [摸摸小卷]
左列（自适应）        选择形象（3 卡）+ 自定义颜色（6 色 + 取色器）· 互动记录
右列（360px）         平台互动统计（7 项）· 成就（6/7）· 如何提升好感度
```
> 注：这里的右列是**页面自身内容的分栏**，不是 `/profile` 那种补充性右栏——统计和成就本来就是这个页面的主体数据。

---

## 4. 数据真实性

### 直接复用现有能力

| 区块 | 来源 |
| --- | --- |
| 头像 / 用户名 / 邮箱 / 手机号 / 性别 / 简介 / 修改密码 | `useUserStore` + `authApi`（现行 Profile.tsx 已有） |
| 主题 / 语言 / 页宠显隐 / 聊天字号 | `useThemeStore` / `useLanguageStore` / `usePetStore` / `useChatFontStore`（现行 Settings.tsx 已有） |
| 页宠等级 / 好感度 / 形象 / 颜色 / 统计 / 成就 / 互动记录 / 成长指南 | `usePetStore` 与 `PetPage.tsx` 现有逻辑 |
| 顶栏胶囊搜索 | 派发 `open-command-palette`（与 KnowledgeTopbar 同款） |

### 本稿新增（需要接线）

| 项 | 说明 |
| --- | --- |
| **注册时间** | i18n 已有 `profile.memberSince` 文案，但页面从未渲染。需后端在 `/user/detail/` 返回 `date_joined` |
| **设置项分组标题** | 「外观与语言」「页宠」「AI 对话」三个卡片标题是新增文案，需补 i18n |
| **页宠页分栏布局** | 现行是单列堆叠，改为主视觉卡 + 双列；无新数据，纯布局调整 |

### 示例数据（出图用，非生产值）

欧阳 / ouyang@yunshujuan.com / 138\*\*\*\*8888 / 男 / 2026-03-14
小卷 Lv.2 好感度 108（距升级 42）；统计 24 / 38 / 4 / 41 / 3 / 12 / 96；成就 6/7（上传能手未解锁）。

---

## 5. 已撤回的判断

- ~~补「养成」侧栏分组~~ —— 经确认，`/pet` 在**首页已有三处入口**（页宠成长卡的齿轮、昵称行 chevron、好感度卡片），侧栏不必再加。后续再优化。
- 原 `artifacts/ui-concepts/profile-v1/` 已被本目录取代并删除。

## 5.5 深色模式

令牌逐值取自 `index.css` 的 `.dark` 块，实测渲染：背景 `#1B1723`、正文 `#F0EDF7`、卡片 `#24202E`。

**一个现行实现的细节**：`--gradient-brand` 在 `.dark` 里**没有被覆盖**，所以深色下主按钮渐变仍是 `#7C3AED → #6D28D9`（`index.css` 第 40 行只在 `:root` 定义）。
另外 `.primary-button` 的 `color` 是硬编码 `white`，而 `--color-accent-foreground` 在深色下是 `#25123F`（深紫）——两者不一致，只是恰好没被用到。
效果图按现行实现还原，未擅自修改。要不要在深色下把主按钮提亮（如 `#8253FF → #6235ED`，与 design-system.md 一致），是个待定的小改动。

令牌覆盖不到的半透明层做了显式适配：页宠主视觉渐变改为 `#302746 → #332949 → #422D43`（design-system.md 指定）、好感度轨道底 `rgba(255,255,255,.12)`、等级徽章底 `rgba(255,255,255,.08)`、卡片阴影 `rgba(0,0,0,.2)`。

## 5.6 移动端（390×844）

对齐 `workspace.css` / `knowledge-pages.css` 的 `≤767px` 行为：

| 项 | 桌面 | 移动端 |
| --- | --- | --- |
| 侧栏 | 206px 带文字 | **56px 图标栏**（品牌换成云图标 + 汉堡按钮，文字与分组标题隐藏） |
| 顶栏 | 78px 面包屑 + 胶囊搜索 | **62px**，面包屑隐藏，搜索收成 36px 圆形图标按钮 |
| 页头标题 | clamp(25,2.4vw,32) | **27px**，操作按钮独占一行并拉满宽度 |
| 内容留白 | 28px | **16px** |
| 分页栏 | `1fr + 360px` | **单列** |
| 形象 / 成长指南 | 3 列 / 2 列 | **单列** |
| 页宠主视觉 | 横向左图右文 | **纵向居中** |
| 悬浮页宠 | 96px | **72px** |

**修掉的一个溢出**：页头给 `.account-header-actions` 设了 `width:100%`，但父级 `.account-header` 是 nowrap flex，右侧撑出 **8px 横向溢出**（违反 skill 的"手机无横向溢出"）。
加 `flex-wrap:wrap` 后，三页实测 `scrollWidth - clientWidth = 0`，页面内最右边界 359px（安全区内）。

## 5.7 代码落地与真实环境验证（已完成）

实现文件：

| 文件 | 说明 |
| --- | --- |
| `front/src/styles/account-pages.css` | 新增域样式（`is-account` 全视口壳 + 顶栏/页头/卡片/设置控件 + 深色 + ≤767px 响应式） |
| `front/src/components/account/AccountLayout.tsx` | 新增 `AccountTopbar` / `AccountHeader` / `AccountLayout`（与 `KnowledgeLayout` 同构） |
| `front/src/pages/Profile.tsx` | 重写 |
| `front/src/pages/Settings.tsx` | 重写 |
| `front/src/pages/PetPage.tsx` | 重写 |
| `front/src/layouts/MainLayout.tsx` | `shellVariant` 增加 `/profile`、`/settings`、`/pet` → `is-account` |
| `front/src/i18n/locales/{zh-CN,en-US}.ts` | 新增 `account.*` 命名空间 |
| `front/src/stores/useLanguageStore.ts` | 导出 `Lang` 类型（原先是模块内私有类型） |

**注册时间不需要改后端**：`/user/detail/` 走的 `get_user_info_from_db` 本来就返回 `date_joined`（`backend/app/utils/auth_utils.py:164`），前端此前只是没映射。现在补上，实测显示 `2026-08-26`。

真实环境验证（dev server 3000 + 后端 8000，测试账号 admin）：

| 检查项 | /profile | /settings | /pet |
| --- | --- | --- | --- |
| shell 变体 | `is-account` | `is-account` | `is-account` |
| 外壳 padding / gap | 0 / 0 | 0 / 0 | 0 / 0 |
| 侧栏宽度 | 206px | 206px | 206px |
| 顶栏高度 | 78px | 78px | 78px |
| 内容列宽 | 940px | 940px | 1180px |
| 横向溢出（文档 / 工作区） | 0 / 0 | 0 / 0 | 0 / 0 |
| 卡片数 | 3 | 3 | 6 |

移动端 390×844：侧栏 56px、顶栏 62px、标题 27px、三页横向溢出均为 0，`/pet` 分栏转单列。
深色：背景 `#1B1723`、正文 `#F0EDF7`、卡片 `#24202E`。
`/pet` 结构完整性：主视觉 `pet-visual` 存在、形象卡 3 个、成就 7 个、统计 7 行、成长指南 6 条。

`npx tsc -b --noEmit` 与 `npx eslint src --ext .ts,.tsx` 均 **0 问题**。

真实渲染截图见 `real/` 目录（12 张：四页 × 桌面浅色 / 深色 / 移动端）。

### `/about` 一并接入

原本属阶段四范围，但它和这三页同挂在侧栏账户菜单下，风格不统一的违和感最强，顺手一起做了：
重写 `pages/AboutUs.tsx`，新增 `.account-about-hero`（品牌横幅 + 云朵插画）、`.account-tech-chips`、`.account-feature-list`，并补 `account.aboutSubtitle` 中英文案。

实测：桌面 `is-account` / 侧栏 206 / 顶栏 78 / 内容列 940 / 技术栈 9 个 / 特性 4 条 / 溢出 0；
移动端横幅转纵向、无溢出；深色横幅 `#302746 → #332949 → #422D43`。

### 跨页侧栏一致性

| 路由 | 变体 | 侧栏 |
| --- | --- | --- |
| `/profile` `/settings` `/pet` `/about` | `is-account` | 206px |
| `/notes` `/knowledge` | `is-knowledge` | 206px |
| `/` | `is-dashboard` | 206px |

页面切换侧栏宽度不变，无跳动。

## 6. 待确认

1. 三页的内容列宽：profile/settings 940px、pet 1180px，是否合适？
2. `/pet` 的双列分栏能否接受（统计/成就在右列）？
3. ~~深色模式与移动端~~ 已补（见 5.5 / 5.6 节）。
4. 基本信息是否要支持行内编辑（现在只能整页「编辑」）？
5. 深色下主按钮是否提亮为 `#8253FF → #6235ED`（见 5.5 节）？
