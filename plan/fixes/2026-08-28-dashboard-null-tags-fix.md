# 首页渲染异常：空标签修复

## 根因与复现

后端 `NoteResponse.tags` 允许 `null`，`NoteService._doc_to_response` 在笔记没有标签时也会返回 `null`。前端 `Note.tags` 却声明为必填数组，首页直接执行 `note.tags.slice(...)`。任何一篇无标签笔记都会导致整个首页进入 ErrorBoundary。

在隔离浏览器中以符合后端定义的 `tags: null` 数据运行原首页，已复现截图同款错误页，并捕获堆栈：`TypeError: Cannot read properties of null (reading 'slice')`，位置为 Dashboard 最近记录映射。

## 修复

- 首页和笔记卡片使用空数组处理 null / 缺失标签；有标签时保持原显示。
- 修正前端 Note 类型为 `tags?: string[] | null`，让编译检查能识别该情况。
- 浏览器回归脚本增加 null、缺失、空数组、正常与空标签混合四种数据，验证首页、分类切换和笔记列表。
- 测试同时捕获 ErrorBoundary 输出；只监听 pageerror 会漏掉 React 已捕获的渲染异常。

## 验证范围

前端构建与修改文件的 ESLint 通过。首页 12 项浏览器检查通过，包含新增四种标签数据。测试使用隔离模拟数据，不读取用户登录凭据、不修改真实笔记；未直接操作用户现有浏览器标签页。

修复前截图：`.codex-checks/dashboard/failure.png`。
修复后模拟数据截图：`.codex-checks/dashboard/nullable-tags.png`。
修改前备份：`.codex-backups/20260828-dashboard-null-tags`。
