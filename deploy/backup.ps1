# =============================================================================
# 云舒卷（RAG Notebook）备份脚本 —— 稳定性三件套之一
# 备份内容：MySQL 全库 dump + media（头像/动态图片）+ data（ChromaDB 向量库/
#           md5 记录/PDF 提取图片），压缩为 tar.gz 存入时间戳目录，自动清理旧备份。
#
# 用法：
#   .\backup.ps1                          # 默认备份到 ..\backups，保留 14 天
#   .\backup.ps1 -BackupDir D:\backups -KeepDays 30
#
# 计划任务（管理员 PowerShell）：
#   $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
#               -Argument "-NoProfile -ExecutionPolicy Bypass -File D:\项目\RAGNotebook-master\deploy\backup.ps1"
#   $trigger = New-ScheduledTaskTrigger -Daily -At 03:00
#   Register-ScheduledTask -TaskName "yunshujuan-backup" -Action $action -Trigger $trigger
# =============================================================================
param(
    [string]$BackupDir = (Join-Path $PSScriptRoot '..\backups'),
    [int]$KeepDays = 14
)
$ErrorActionPreference = 'Stop'

# ── 读 backend/.env（显式 UTF-8，避免 PowerShell 默认 GBK 解码含中文注释的文件）──
$envFile = Join-Path $PSScriptRoot '..\backend\.env'
$vars = @{}
if (Test-Path $envFile) {
    foreach ($line in [System.IO.File]::ReadAllLines($envFile, [System.Text.Encoding]::UTF8)) {
        $line = $line.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            $kv = $line -split '=', 2
            if ($kv.Length -eq 2) { $vars[$kv[0].Trim()] = $kv[1].Trim() }
        }
    }
}
$mysqlUser = if ($vars['MYSQL_USER']) { $vars['MYSQL_USER'] } else { 'root' }
$mysqlPass = if ($vars['MYSQL_PASSWORD']) { $vars['MYSQL_PASSWORD'] } else { '' }
$mysqlHost = if ($vars['MYSQL_HOST']) { $vars['MYSQL_HOST'] } else { 'localhost' }
$mysqlPort = if ($vars['MYSQL_PORT']) { $vars['MYSQL_PORT'] } else { '3306' }
$mysqlDb   = if ($vars['MYSQL_DATABASE']) { $vars['MYSQL_DATABASE'] } else { 'chat_history' }
$backendDir = Join-Path $PSScriptRoot '..\backend'

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $BackupDir $stamp
New-Item -ItemType Directory -Force -Path $target | Out-Null
Write-Host "备份目录: $target"

# ── 1. MySQL dump（--result-file 直接写文件，避免 PowerShell 管道编码问题）──
$dumpFile = Join-Path $target 'mysql-dump.sql'
$env:MYSQL_PWD = $mysqlPass   # 用环境变量传密码，避免命令行暴露
try {
    & mysqldump -h $mysqlHost -P $mysqlPort -u $mysqlUser `
        --single-transaction --routines --triggers `
        --result-file="$dumpFile" $mysqlDb 2>&1 | Out-Null
    if (-not (Test-Path $dumpFile)) { throw "mysqldump 未生成文件（检查 mysqldump 是否在 PATH）" }
    Write-Host ("MySQL dump OK: {0:N1} MB" -f ((Get-Item $dumpFile).Length / 1MB))
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}

# ── 2. media 目录（头像/动态图片）──
& tar -czf (Join-Path $target 'media.tar.gz') -C $backendDir media 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning "media 打包失败（目录可能为空或不存在，忽略）" }

# ── 3. data 目录（ChromaDB 向量库 + md5 记录 + PDF 提取图片）──
& tar -czf (Join-Path $target 'data.tar.gz') -C $backendDir data 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning "data 打包失败（目录可能为空或不存在，忽略）" }

# ── 4. 清理超过 KeepDays 的旧备份 ──
$cutoff = (Get-Date).AddDays(-$KeepDays)
$removed = 0
Get-ChildItem $BackupDir -Directory -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^\d{8}-\d{6}$' -and $_.LastWriteTime -lt $cutoff
} | ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force
    $removed++
}
if ($removed -gt 0) { Write-Host "已清理 $removed 个过期备份（> $KeepDays 天）" }

Write-Host "备份完成 ✅"
