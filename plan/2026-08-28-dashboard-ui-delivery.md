# 云舒卷首页 UI 改版

## 已实现

- 首页：淡紫欢迎横幅、云朵插画、快捷操作、最近记录、真实知识图谱预览、页宠成长、每日回顾、今日任务、连续记录。
- 保留云舒卷名称，增加首页导航；登录后进入首页，原笔记列表和所有功能路由继续保留。
- 顶部搜索打开已有命令面板，支持原有搜索及快捷键。
- 最近记录读取笔记/知识库接口；图谱只显示真实节点和关联；页宠与任务读取已有成长状态，不使用效果图中的示例数字。
- 支持空内容、部分接口失败重试、深色主题、中文/英文及桌面/手机布局。
- 悬浮页宠在所有页面（含首页）正常显示，事件处理不受影响。

## 关键文件

- 首页：front/src/pages/Dashboard.tsx
- 样式：front/src/styles/dashboard.css
- 回归检查：front/scripts/verify-dashboard.cjs
- 隔离测试截图：.codex-checks/dashboard/desktop.png、empty.png、dark.png、mobile.png
- 修改前备份：.codex-backups/20260828-215114-cloud-dashboard/

## 插画素材

- 模式：内置 image_gen 工具（非 CLI / API）。
- 项目素材：D:/项目/RAGNotebook-master/front/public/illustrations/study-cloud.png
- 原始生成文件：C:/Users/86189/.codex/generated_images/01a02f1b-48d9-7b42-86fc-c3a72f9587f3/exec-9c4f5bb3-98eb-4cf7-a48b-8a53ca690c9b.png
- 透明背景云朵、紫色围巾、绿芽、笔记本，依据用户参考图的风格重新生成，复用于首页横幅和成长卡片。

最终生成提示词：

Use case: stylized-concept. Asset type: production transparent PNG mascot illustration for a violet Chinese knowledge notebook dashboard. Create ONE adorable soft 3D cloud mascot as a clean isolated composition, full body: rounded puffy white cloud head/body, two tiny green sprout leaves on head, glossy black expressive eyes, rosy cheeks, smiling mouth, wearing a rich violet scarf/cape fastened with a small gold star. Sitting beside an open cream notebook, holding a violet pencil in one hand, a small lavender coffee mug and two stacked purple books beside it. High quality clay-like soft 3D render, gentle pastel lilac and warm cream lighting, subtle contact shadow. Facing slightly left, three quarter view. Full composition centered with generous safe transparent margin, approximately square canvas. GENUINELY TRANSPARENT alpha background, no scenery, no solid white rectangle, no checkerboard, no UI, no text, no letters, no watermark. Intended for hero artwork on the right side of a lilac dashboard, matching the friendly study cloud character aesthetic described.

## 验证

构建与本次修改文件的规范检查通过；首页 9 项、模板 12 项、原笔记页面 18 项隔离浏览器检查全部通过。

首页隔离浏览器检查涵盖真实数据映射、筛选、搜索面板、路由跳转、空状态、部分失败重试、四档屏宽和深色主题；所有应用接口均由测试数据隔离，未修改真实笔记。

测试截图中的笔记、用户名和成长数字为隔离测试数据，不会写入用户账户。
