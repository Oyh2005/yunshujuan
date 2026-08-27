# 云舒卷后端 · 生产启动脚本（多 worker）
# 用法：在 backend 目录下执行  .\start_prod.ps1
# 前置：MySQL 已启动；建议启动 Redis（rediszt3 服务），未启动时相关缓存自动降级
#
# 参数说明：
#   --workers 4    多进程（每 worker 独立加载模型，内存开销按机器评估增减）
#   --host 0.0.0.0 局域网可访问（仅本机可用可改 127.0.0.1）
#   --port 8000    与前端 vite 代理一致
# 开发调试请用：python -m uvicorn main:app --reload --port 8000

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    Write-Error "未找到虚拟环境 .venv，请先创建：python -m venv .venv 并安装依赖"
}

Write-Host "启动云舒卷后端（4 workers）: http://127.0.0.1:8000" -ForegroundColor Green
& ".\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
