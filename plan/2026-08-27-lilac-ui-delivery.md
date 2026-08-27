# 轻紫色工作台改版

用户取消黑色主题，采用此前效果图的「轻紫 + 雾白 + 青绿 / 杏色点缀」方案。

## 范围

- 沿用当前 React 19 / Tailwind CSS 4，不改依赖、后端或用户数据。
- `front/src/index.css`：浅色 / 深色主题令牌、强调色前景与悬停色；其余页面只同步已有主色按钮的颜色，避免暗色文字对比不足或悬停变蓝。
- `front/src/styles/workspace.css`：浮动侧栏、圆角主面板、响应式卡片、列表、空状态和骨架屏。
- `Sidebar.tsx`：保留全部导航、通知数量和分组折叠；头像菜单包含个人信息 / 设置 / 关于 / 退出，退出仍需确认。
- `NoteList.tsx` / `NoteCard.tsx` / `notePresentation.ts`：卡片与列表切换、后端排序、真实总数、分类色、搜索防抖与过期响应保护、加载 / 失败重试 / 空状态、可键盘操作的卡片、置顶和多选操作。
- 页宠仅调整默认轮廓配色，未改拖拽、互动、养成或自定义形象逻辑，也未将点击互动改成聊天入口。
- 新增界面文案提供中英两种语言；编辑器内容字体保持不变。

## 备份

修改前的整个 `front/src` 已复制到：

`D:\项目\RAGNotebook-master\.codex-backups\20260827-221359-lilac-theme\src`

当前目录不是 Git 仓库。恢复时应逐文件对照，避免覆盖后续开发；备份中不包含本次新增文件。

## 验证

- `npm run build`：通过。保留编辑器 bundle 超过 500 kB 的体积提示。
- 核心修改文件 ESLint：通过。
- `node scripts/test-note-presentation.cjs`：29 个摘要 / 排序 / 分类及浅深主题文本对比度断言。
- `node scripts/verify-lilac-ui.cjs`：18 项隔离 UI 检查，覆盖桌面 / 手机、两种主题、搜索及竞态、服务端排序、分页 / 去重、置顶、长按和键盘、多选分类 / 删除确认 / 下载、账户菜单、中英文、加载 / 空状态 / 错误重试。

UI 测试需要本地前端服务和 Playwright，可通过 `PLAYWRIGHT_MODULE` 指定现有模块路径、`BROWSER_EXECUTABLE` 指定浏览器。默认使用系统 Edge 无头模式。所有应用 API 均被拦截，测试笔记仅存在于测试进程内，不会写入真实数据库。

截图和测试结果：`.codex-checks/lilac-ui/`。截图使用测试数据，不代表用户真实笔记。
