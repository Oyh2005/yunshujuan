# 云舒卷 · 知识类页面 UI 效果图 v1

生成方式：内置 image_gen；未使用 CLI 或外部 API。
设计依据：cloud-notebook-ui Skill、当前首页桌面参考图和项目已有 study-cloud.png。

本轮只绘制效果图，没有修改网页代码或用户数据。页面记录、作者、计数、日期、图表均为示例；新增筛选、详情栏等属于设计建议，落地前需与现有功能确认。图片内细小文字和图表数值用于视觉示意，实际实现应以准确业务数据和可访问性规范为准。

## 页面

- [笔记](01-notes.png)
- [知识库](02-knowledge-base.png)
- [知识图谱](03-knowledge-graph.png)
- [统计](04-statistics.png)
- [知识广场](05-knowledge-plaza.png)

## 最终提示词

每张图的最终提示词 = 以下通用规范 + 对应页面规范。
参考图角色：Image 1 为当前首页风格参考；Image 2 为云朵角色形象参考，均不是待覆盖的页面。

### 通用规范

```text
Use case: ui-mockup.
Asset type: ONE high-fidelity desktop web application UI design preview, landscape 3:2, ideally 1536x1024 or larger. Flat front-facing screenshot, full artboard, no device frame, no perspective, no collage, not a poster.
Input images: Image 1 is the EXISTING implemented homepage, the exact reference for the application's design system, sidebar, colors, typography and atmosphere. Image 2 is the SAME cloud mascot character reference. These are style and identity references, not content that should be duplicated as a homepage.
Primary request: Design another page of this SAME Chinese knowledge notebook product named exactly "云舒卷". Preserve its polished, welcoming but productive pale violet UI. This is a UI concept preview with fictional sample data, NOT a screenshot of the real user's account.
Global visual system: background #F7F7FB, white content panels, primary violet #7C3AED, charcoal #252238 text, secondary #6B6478, thin borders #E7E3ED, 16-20px card corners, understated violet shadows. Small accents mint #E5F5EE/#237058, sky-blue, rose #FCEBF2/#A13E67, amber. Main buttons violet gradient #8253FF to #6235ED, white readable text. White surfaces occupy most of the page; NO all-purple wash. Professional crisp simplified Chinese sans-serif, clear hierarchy, readable short labels, comfortable whitespace.
Shared chrome on all five concepts: ~200px wide white left sidebar with violet cloud outline + "云舒卷" at top. Menu: "首页"; group "知识" with "笔记", "知识库", "知识图谱", "统计", "知识广场"; group "AI 助手" with "AI 对话", "会话管理"; group "学习成长" with "每日回顾", "每日任务"; bottom "设置" and round avatar. Only the current page is selected with pale lavender rounded background, purple text and slim purple left indicator. Keep the sidebar straight, aligned and legible; don't repeat page names as random floating text.
Topbar in the right workspace: centered white pill search "搜索笔记，或快速前往你的知识空间…" with search icon and Ctrl K hint, bell and circular lavender avatar on right. Content begins below, with generous 28px margins.
Character: SAME soft 3D white puffy cloud with green sprout, glossy purple-black eyes, pink cheeks, violet scarf/cape and gold star. Use sparingly as a small page-specific companion illustration (not a huge repeated homepage hero). Do not turn it into another animal or humanoid. Other icons are fine consistent line icons.
Constraints: render page labels verbatim and sharply. No browser chrome, no code, no lorem ipsum, no unnecessary neon, no giant 3D text, no heavy gradients on data cards, no duplicate full homepage. A small unobtrusive footer says "界面设计稿 · 示例数据". Prioritize real usable UI structure over excessive decorative elements.
```

### 笔记

```text
Page: 笔记. Active sidebar "笔记".
Main composition: compact pastel-lavender header strip, height about 145px, heading "笔记", subheading "收藏每一个想法，让灵感慢慢生长", count "共 24 篇笔记". On right a small familiar cloud holding a pencil by an open notebook. Top-right action "＋ 新建笔记", secondary "管理分类". This is a notes workspace, not the homepage.
Below: wide search field "搜索笔记内容…" plus subtle grid/list toggle, sort dropdown "最近更新". A chip row "全部 24", "工作", "学习", "生活", "技术", "其他"; 全部 selected violet.
Main area: six spacious white note cards, arranged THREE columns by TWO rows. Each card has a small softly colored note icon at upper left, pin or ellipsis at upper right, a dark strong title, two readable short lines of plain-text preview (NO visible markdown characters), two small tags and a date at bottom. Titles precisely: "RAG 学习笔记", "产品设计复盘", "大模型学习路线", "周末阅读清单", "前端组件整理", "英语学习计划". Tags e.g. "学习", "技术", "设计", "生活". One pinned card with tiny pin and slightly lavender border, other cards predominantly white. Mint/amber/blue/rose category accents remain subtle.
Bottom-left small actual sample total "显示 1–6 条，共 24 条", bottom-right neat pagination "1 2 3 4". Optional tiny cloud in lower margin only if there is room. No huge right pet rail; devote width to the notes grid.
```

### 知识库

```text
Page: 知识库. Active sidebar "知识库".
Main composition: clear heading "知识库", subtitle "把资料放进来，让知识连接起来", top-right violet button "＋ 上传资料", secondary outline "网页剪藏".
Below header a low wide pastel-blue-to-lilac upload band, at left large dashed-round upload target with small upload icon and text "拖拽文件到这里，或点击上传"; smaller text "支持 PDF、Word、Markdown、TXT". Familiar small cloud mascot on right holding a purple file folder. Keep the upload panel height about 165px, not a giant hero.
Under it three compact metric summaries in a row "资料总数 12", "知识片段 286", "最近更新 今天". Below filter chips "全部", "PDF", "文档", "Markdown", and field "搜索资料名称…".
Dominant white rounded document-table card occupies lower main workspace: header columns "资料名称", "类型", "知识片段", "状态", "更新时间", "操作". Six well-spaced aligned rows with file-type badges (PDF coral, DOC blue, MD violet): "用户研究方法与实践.pdf" / PDF / 48 / "已就绪"; "RAG 技术入门.pdf" / PDF / 62 / "已就绪"; "产品需求文档.docx" / DOC / 35 / "已就绪"; "知识管理工作流.md" / MD / 26 / "已就绪"; "机器学习笔记.pdf" / PDF / 84 / "已就绪"; "阅读摘录.txt" / TXT / 31 / "已就绪". Mint ready chips. Row actions "查看" plus small overflow menu; restrained trash action only within overflow, no destructive primary button.
Small helper panel under table with lightbulb "资料准备好后，去和 AI 聊聊吧" and text link "问问知识库 →". No invented storage quota, no fake errors or random progress indicators. Data table is the focal point.
```

### 知识图谱

```text
Page: 知识图谱. Active sidebar "知识图谱".
Main composition: title "知识图谱", subtitle "让零散的知识，成为彼此连接的星图"; top-right main button "加载语义关联" with small sparkles icon, outline "重置视图". Beneath title a subtle info line "当前展示已有双链，语义关联可按需加载" and legend "已有双链" solid, "语义关联" dashed. Small sample count "18 个节点 · 24 条关联". No oversized hero; give area to the graph.
Large white rounded graph canvas covering about 72% of right workspace width and 650px tall, with an extremely subtle lilac dot grid. It shows a beautiful LEGIBLE network of approx 16 circular small nodes with short pill labels and thin curved violet lines, arranged in 3 coherent clusters, plenty of separation. Central focused note "RAG 学习笔记" in a violet circle, neighbor labels "向量检索", "文档分块", "知识管理", "大模型", "产品设计", "用户研究", "学习方法", "阅读摘录", "前端组件". Mint, violet, sky blue and amber cluster tones. Do not make every node connect to one fake hub; show meaningful sparse interconnections. Solid lines only in the initial-state preview, dashed example appears only in the legend. Small floating vertical zoom + / − / fit controls bottom-left.
Slim right contextual card titled "节点详情", selected note title "RAG 学习笔记", category chips "技术", "学习"; brief two-line readable summary; a section "关联笔记" with "向量检索", "文档分块", "知识管理"; bottom violet-outline button "打开笔记 →". Below this card small soft-lilac helper with the familiar cloud holding a small magnifying glass, text "点击节点，发现新的联系". Mascot occupies only this small help panel, not the graph. Footer "界面设计稿 · 示例数据". Practical graph analyst workspace, airy and clean.
```

### 统计

```text
Page: 统计. Active sidebar "统计".
Main composition: heading "知识统计", short warm subtitle "看见每一次积累，也看见正在成长的你". Top-right outlined year selector "2026 年" and small refresh icon. Small familiar cloud beside the heading, celebrating with a little gold star, not a full hero.
At top four clean compact metric cards with tiny colored icons, labels and strong numbers: "笔记总数 24", "累计字数 36,820", "知识库资料 12", "累计回顾 18". At right of these or in a slim secondary row show understated additional metrics "本周回顾 5", "AI 对话 32", "连续记录 6 天". No business revenue or unrelated analytics.
Center full-width white rounded panel "记录热力图", year summary "每一天的小记录，都在积累力量"; tidy GitHub-style annual heatmap with week grid, month labels "1月" through "12月", pale-to-violet intensity squares, sparse realistic pattern, small legend "少" to "多". The chart must look like a real aligned calendar grid, not random decorative pixels.
Bottom two white chart panels in a 60/40 split. Left "字数趋势": smooth violet line/area chart, subtle translucent fill, fine gridlines, labeled x-axis "1月 2月 3月 4月 5月 6月 7月 8月", sensible y-axis 0/2k/4k/6k. Right "分类占比": large clean donut chart with violet/mint/amber/rose segments and center "24 篇笔记"; legend counts "学习 10", "技术 6", "工作 4", "生活 4". Differentiate series with muted accents; high legibility.
Bottom small warm-amber streak strip with a flame icon and text "连续记录 6 天，每一点坚持都算数". Consistent spacing and borders. Sample stats only; no false claims of actual account measurements.
```

### 知识广场

```text
Page: 知识广场. Active sidebar "知识广场".
Main composition: short lavender-to-blush header banner, heading "知识广场", subtitle "分享你的思考，遇见新的灵感". Familiar small cloud sitting with an open book near right edge, soft tiny sparkles. No giant marketing poster. Existing capabilities are public notes browsing and leaderboards; do not add shopping or paid courses.
Below header tabs "公开笔记" (active) and "排行榜". Main workspace splits roughly 72%/28%. Left is a two-column by two-row arrangement of generous white public-note cards; each has small colored author avatar and name, light date, bold title, short 2-line excerpt, category tags, and tiny read-count icon. Four short titles: "把知识连成一张网", "我的 RAG 实践笔记", "如何建立阅读习惯", "从零搭建知识工作流". Sample authors "小林", "木木", "阿宁", "星野". Very restrained soft-colored header accents, no stock photography, no fake like buttons or follow controls unless merely existing public navigation. Bottom button "加载更多".
Right column: white panel "本周学习榜" with three mini tabs "写作", "回顾", "连续记录", ranked avatar list 1–5 and modest scores. Top three have tiny gold/silver/bronze markers without heavy metallic decoration. Secondary lavender tip card "让好想法被看见", text "在笔记设置中开启公开，分享你的知识", a subtle line icon/book. At bottom a compact cloud-friendly quote "每一份分享，都是新的连接。".
Maintain clear author/text/metadata hierarchy, lots of white, no noisy social-network advertising, no oversized mascot blocking cards. Footer "界面设计稿 · 示例数据".
```

