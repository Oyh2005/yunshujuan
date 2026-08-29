# 稳定性三件套 + PWA 化交付记录（2026-08-29）

> 关联：`plan/roadmap/2026-08-29-next-steps-plan.md`（稳定性类「上线公测前必做」+ PWA）
> 状态：全部完成并验证（PWA 构建部分需本机验证，沙箱跑不了 vite build）

---

## 一、备份策略（`deploy/backup.ps1`）

- **内容**：
  1. MySQL 全库 dump（`mysqldump --single-transaction --routines --triggers --result-file`，密码走 `MYSQL_PWD` 环境变量不暴露命令行；`.env` 用显式 UTF-8 读取避免 GBK 乱码）
  2. `backend/media`（头像/动态图片）→ tar.gz
  3. `backend/data`（ChromaDB 向量库 + md5 记录 + PDF 提取图片）→ tar.gz
  4. 自动清理超过 `-KeepDays`（默认 14）的旧备份
- **用法**：`.\deploy\backup.ps1 [-BackupDir D:\backups] [-KeepDays 30]`；脚本头含计划任务注册示例（每日 03:00）
- **验证**：实测生成 3 个文件（mysql-dump.sql 53KB / data.tar.gz 115KB / media.tar.gz 121KB），exit 0

## 二、前端错误监控（自建接口，不上第三方）

- **后端**：
  - 表 `error_reports`（`app/models/error_report.py`，重启自动建表/迁移）
  - `POST /telemetry/error`（`app/router/telemetry_router.py`，限流 30/60）
    - **允许匿名**（登录页/公共页也可能出错）：新增 `get_optional_user_id`（`security_optional = HTTPBearer(auto_error=False)`，token 有效记 user_id，无效返回 None 不抛 401）
    - 入库失败不影响前端响应（try/except 降级——监控本身不能成为故障源）
    - 字段长度后端截断（kind 30 / message 500 / stack 8KB / page 200）
- **前端**（`src/api/telemetry.ts` + ErrorBoundary + main.tsx）：
  - **独立 axios 实例**：不走全局拦截器（401 跳登录 / 429 toast 都不适合错误上报）
  - 三类来源：ErrorBoundary `componentDidCatch`（boundary）、`window.error`（unhandled）、`unhandledrejection`（rejection）
  - **前端 30s 同类节流** + 后端限流双保险，防错误风暴
- **验证**：探针 `.probe_telemetry.py`（临时 uvicorn 8019）ALL PASS——匿名 200 / 带 token 200 / 超长字段 400 RequestValidationError（项目全局处理器惯例，非 422）/ 落库验证（kind 正确 + 含 user_id）

## 三、日志巡检（`deploy/check-logs.ps1`）

- 扫描 `backend/logs/agent_*.log` 近 `-Hours` 小时（默认 24），统计 ERROR / WARN / 慢查询（≥ SLOW_QUERY_THRESHOLD_MS 阈值），输出最慢 5 条 + 错误样例前 10 条
- `-FailOnErrors -Threshold N`：错误数超阈值退出码 1（计划任务告警用）
- **踩坑**：日志文件被后端进程占用——必须 `FileShare.ReadWrite` 共享读取（`ReadAllLines` 直接崩）
- **验证**：实测输出真实统计（24h：178 ERROR / 498 WARN / 0 慢查询，含已知 Redis 降级与 502 检索失败样例），exit 0

## 四、PWA 化（vite-plugin-pwa 1.3.0）

- `vite.config.ts` 接入 `VitePWA`：
  - `registerType: 'autoUpdate'`；manifest（云舒卷/standalone/主题色 #7C5CFC/图标复用新 icon.png 1254×1254 any+maskable）
  - **缓存策略与现有 ETag/304 体系协同**：SW 只预缓存构建产物（globPatterns）+ `/media` 运行时 CacheFirst（1 天，与后端 Cache-Control 头一致）；**API 请求一律不缓存**（交给浏览器 HTTP 缓存，ETag 保证新鲜度，避免 SW 缓存污染数据）
  - `navigateFallback: /index.html` + denylist（`/media/`、`/telemetry/`、`/file/`）；`cleanupOutdatedCaches`
- dev 模式不注册 SW（devOptions 默认关闭），开发不受影响
- **⚠️ 验证限制**：vite build 沙箱 spawn EPERM 跑不了（交接文档已知边界）——配置已过 tsc 类型检查，**需本机 `npm run build` 验证**：生成 `dist/sw.js` + manifest、Lighthouse/Chrome DevTools Application 面板检查 Service Worker 注册与离线缓存

## 五、验证汇总

| 检查项 | 结果 |
| --- | --- |
| 后端 py_compile（5 个文件） | ✅ |
| /telemetry/error 探针（8019，已清理） | ✅ ALL PASS |
| backup.ps1 实测（含 mysqldump/tar） | ✅ 3 文件生成 |
| check-logs.ps1 实测（真实日志） | ✅ 统计正确 |
| PowerShell 脚本兼容性 | ✅ 已加 UTF-8 BOM（无 BOM 时解析器报错，Windows PowerShell 5.1 计划任务必须） |
| `npx tsc -b --noEmit` | ✅ 0 错误（含 vite.config.ts） |
| `npx eslint src --ext .ts,.tsx` | ✅ 0 问题 |
| vite build（PWA 产物） | ⚠️ 沙箱无法执行，需本机验证 |

## 六、待用户确认
- 重启后端 8000（新表 error_reports 自动创建 + /telemetry/error 路由）
- 本机 `npm run build` 验证 PWA（dist/sw.js/manifest/离线缓存）
- 计划任务可选：备份（每日 03:00）+ 巡检（每日 09:00，脚本头有示例）
