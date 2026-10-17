<#
  许雪然 · 二次元主页 —— 把本页面设为 Edge / Chrome 的主页
  ------------------------------------------------------------------
  为什么不能全自动：Chromium 系浏览器的「主页 / 启动页」属于受保护设置
  （Secure Preferences 里有 MAC 校验），外部改配置文件会被浏览器回滚；
  组策略 / 注册表那条路又需要管理员权限。所以这里做「最小点击」方案：

    1. 把本页面的 file:// 网址复制到剪贴板
    2. 打开对应浏览器的「启动 / 主页」设置页
    3. 弹个提示告诉你粘哪儿

  用法（一般直接双击目录里的「设置成主页.cmd」）：
    powershell -ExecutionPolicy Bypass -File tools\set-homepage.ps1
    powershell -ExecutionPolicy Bypass -File tools\set-homepage.ps1 -Browser chrome
    powershell -ExecutionPolicy Bypass -File tools\set-homepage.ps1 -NoOpen    # 只复制网址，不开设置页
#>
param(
  [ValidateSet('auto', 'edge', 'chrome')][string]$Browser = 'auto',
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- 找到页面
$roots = @((Split-Path -Parent $PSScriptRoot), $PSScriptRoot)
$proj = $roots | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'index.html')) } | Select-Object -First 1
if (-not $proj) { throw '没找到 index.html —— 请把本脚本放在项目的 tools\ 目录里。' }
$file = Join-Path $proj 'index.html'
$url = ([System.Uri]$file).AbsoluteUri      # 会正确处理空格、中文
Write-Host "页面网址 : $url"

# ------------------------------------------------------------ 找浏览器
$edge = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$chrome = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

# 顺带从注册表兜一下（装在别处的情况）
if (-not $edge) {
  try { $edge = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -ErrorAction Stop).'(default)' } catch {}
}
if (-not $chrome) {
  try { $chrome = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction Stop).'(default)' } catch {}
}

function Get-DefaultBrowserKind {
  try {
    $pid_ = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice' -ErrorAction Stop).ProgId
    if ($pid_ -like '*Edge*') { return 'edge' }
    if ($pid_ -like '*Chrome*') { return 'chrome' }
  } catch {}
  return ''
}

$pick = $Browser
if ($pick -eq 'auto') {
  $def = Get-DefaultBrowserKind
  if ($def -eq 'edge' -and $edge) { $pick = 'edge' }
  elseif ($def -eq 'chrome' -and $chrome) { $pick = 'chrome' }
  elseif ($edge) { $pick = 'edge' }
  elseif ($chrome) { $pick = 'chrome' }
  else { $pick = 'none' }
}

$exe = if ($pick -eq 'edge') { $edge } else { $chrome }
$settingsPage = if ($pick -eq 'edge') { 'edge://settings/startHomeNTP' } else { 'chrome://settings/onStartup' }
$browserName = if ($pick -eq 'edge') { 'Edge' } elseif ($pick -eq 'chrome') { 'Chrome' } else { '（没找到 Edge / Chrome）' }

Write-Host "浏览器   : $browserName"
if ($edge)   { Write-Host "  已装 Edge  : $edge" }
if ($chrome) { Write-Host "  已装 Chrome: $chrome" }

# ------------------------------------------------------------ 复制到剪贴板
$copied = $false
try { Set-Clipboard -Value $url; $copied = $true }
catch { try { $url | clip.exe; $copied = $true } catch {} }
Write-Host $(if ($copied) { '网址已复制到剪贴板 ✓' } else { '⚠ 复制剪贴板失败，请手动复制上面的网址' })

# ---------------------------------------------------------------- 开设置页
if (-not $NoOpen -and $exe) {
  try { Start-Process -FilePath $exe -ArgumentList $settingsPage | Out-Null; Write-Host "已打开设置页: $settingsPage" }
  catch { Write-Host "⚠ 没能自动打开设置页，手动打开：$settingsPage" }
}

# ------------------------------------------------------------------ 提示框
$msg = @"
网址已经复制到剪贴板：
$url

在刚打开的 $browserName 设置页里（$settingsPage）：

  1) 选「打开以下页面」（或"打开特定网页"）
  2) 点「添加新页面」
  3) Ctrl + V 粘贴，然后点「添加」

顺便想设"主页按钮"的话，这个页面向下还有「主页按钮」，
打开它、把同一个网址粘进去就行。

提示：本页面是本地文件，不需要联网服务器；
      网站图标要联网才能自动抓，抓不到就用名称的第一个字。
"@
try {
  $ws = New-Object -ComObject WScript.Shell
  $ws.Popup($msg, 0, '许雪然主页 · 设为 ' + $browserName + ' 主页', 64) | Out-Null
} catch {
  Write-Host ''
  Write-Host $msg
}
