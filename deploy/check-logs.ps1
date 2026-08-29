# =============================================================================
# 云舒卷（RAG Notebook）日志巡检脚本 —— 稳定性三件套之一
# 扫描 backend/logs/agent_*.log，汇总近 N 小时的 ERROR / WARN / 慢查询，
# 输出摘要；配合计划任务可做每日巡检（-FailOnErrors 时错误数超阈值退出码 1）。
#
# 用法：
#   .\check-logs.ps1                     # 默认近 24 小时
#   .\check-logs.ps1 -Hours 168 -FailOnErrors -Threshold 20
# =============================================================================
param(
    [int]$Hours = 24,
    [switch]$FailOnErrors,
    [int]$Threshold = 20
)
$ErrorActionPreference = 'Stop'

$logsDir = Join-Path $PSScriptRoot '..\backend\logs'
if (-not (Test-Path $logsDir)) {
    Write-Host "日志目录不存在: $logsDir（服务可能尚未启动过）"
    exit 0
}

$cutoff = (Get-Date).AddHours(-$Hours)
$files = Get-ChildItem (Join-Path $logsDir 'agent_*.log') -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $cutoff }

if (-not $files) {
    Write-Host "近 $Hours 小时无日志文件（logs/agent_*.log）"
    exit 0
}

$errors = 0
$warnings = 0
$slowQueries = @()
$errorSamples = @()
$slowTotal = 0

foreach ($file in $files) {
    # FileShare.ReadWrite：后端进程正在写日志，必须共享读取
    $fs = [System.IO.File]::Open(
        $file.FullName,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::ReadWrite
    )
    $reader = [System.IO.StreamReader]::new($fs, [System.Text.Encoding]::UTF8)
    try {
        while ($null -ne ($line = $reader.ReadLine())) {
            # 解析时间戳 "2026-08-29 18:00:00,441 - ..."
            if ($line -match '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})') {
                try {
                    $ts = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture)
                } catch { continue }
                if ($ts -lt $cutoff) { continue }

                if ($line -match ' - ERROR - ') {
                    $errors++
                    if ($errorSamples.Count -lt 10) { $errorSamples += $line }
                } elseif ($line -match ' - WARNING - ') {
                    if ($line -match '慢查询 (\d+)ms') {
                        $slowQueries += [pscustomobject]@{ Time = $ts; Ms = [int]$Matches[1]; Line = $line }
                        $slowTotal++
                    } else {
                        $warnings++
                    }
                }
            }
        }
    } finally {
        $reader.Dispose()
        $fs.Dispose()
    }
}

Write-Host "════════ 日志巡检摘要（近 $Hours 小时）════════"
Write-Host ("ERROR      : {0}" -f $errors)
Write-Host ("WARN       : {0}" -f $warnings)
Write-Host ("慢查询(≥阈值): {0}" -f $slowTotal)
if ($slowQueries.Count -gt 0) {
    Write-Host ""
    Write-Host "── 最慢 5 条 ──"
    $slowQueries | Sort-Object Ms -Descending | Select-Object -First 5 | ForEach-Object {
        $clean = $_.Line -replace '^.*慢查询', '慢查询'
        Write-Host ("{0}  {1}" -f $_.Time.ToString('MM-dd HH:mm'), $clean.Substring(0, [Math]::Min(120, $clean.Length)))
    }
}
if ($errorSamples.Count -gt 0) {
    Write-Host ""
    Write-Host "── 错误样例（前 10 条）──"
    $errorSamples | ForEach-Object { Write-Host ($_.Substring(0, [Math]::Min(150, $_.Length))) }
}

if ($FailOnErrors -and $errors -ge $Threshold) {
    Write-Host ""
    Write-Host "⚠️  错误数 $errors 超过阈值 $Threshold，巡检不通过"
    exit 1
}
Write-Host "巡检完成 ✅"
exit 0
