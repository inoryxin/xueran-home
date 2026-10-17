<#
  许雪然 · 二次元主页 —— 一键装成 Firefox 的「主页 + 新标签页」
  ------------------------------------------------------------------
  这个脚本只动当前用户的东西，不需要管理员：
    1. 在 Firefox 配置里写 user.js（主页地址 + 允许侧载扩展自动启用）
    2. 把 tools\newtaboverride-*.xpi 复制到配置的 extensions\（AMO 签名版，Firefox 允许侧载）
    3. 在「启动」文件夹放一个快捷方式，登录时自动起本地静态服务（tools\serve.py）
    4. 立刻把服务拉起来
  重跑是安全的（会先备份 user.js，写入的内容带标记块，可反复执行）。

  用法：
    powershell -ExecutionPolicy Bypass -File tools\install-firefox-home.ps1
    powershell -ExecutionPolicy Bypass -File tools\install-firefox-home.ps1 -DryRun   # 只看会做什么

  想卸载：删掉 user.js 里 // >>> xueran-home 那段、配置里 extensions\newtaboverride*.xpi、
          「启动」文件夹里的快捷方式即可（主页换回你想用的）。
#>
param(
  [int]$Port = 8888,
  [switch]$DryRun,
  [switch]$SkipStartup
)

$ErrorActionPreference = 'Stop'
$proj = Split-Path -Parent $PSScriptRoot
$siteUrl = "http://127.0.0.1:$Port/"
$fileUrl = 'file:///' + ((Join-Path $proj 'index.html') -replace '\\', '/')
$markStart = '// >>> xueran-home（这段由 tools\install-firefox-home.ps1 维护）'
$markEnd = '// <<< xueran-home'

function Say($msg) { Write-Host $msg }
function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

if (-not (Test-Path -LiteralPath (Join-Path $proj 'index.html'))) {
  throw "在 $proj 里没找到 index.html —— 请把本脚本放在项目的 tools\ 目录下运行。"
}
Say "项目目录 : $proj"
Say "模式     : $(if ($DryRun) { '只预览，不写入 (-DryRun)' } else { '真的写入' })"

# ---------------------------------------------------------------- 1. Python
Step '1/5 找 Python（本地服务要用）'
$pyw = $null
foreach ($cand in @(
  (Get-Command pythonw.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source),
  'C:\Python314\pythonw.exe', 'C:\Python313\pythonw.exe', 'C:\Python312\pythonw.exe',
  "$env:LOCALAPPDATA\Programs\Python\Python313\pythonw.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python312\pythonw.exe"
)) { if ($cand -and (Test-Path -LiteralPath $cand)) { $pyw = $cand; break } }

$useServer = [bool]$pyw
if ($useServer) { Say "  ✓ 找到 $pyw" }
else {
  Say '  ✗ 没找到 pythonw.exe —— 改成把主页指向本地文件（file://），'
  Say '    这样主页能看，但 Firefox 的新标签页需要本地服务，就先不装了。'
}

# ---------------------------------------------------------- 2. Firefox 配置
Step '2/5 找 Firefox 配置目录'
$ini = Join-Path $env:APPDATA 'Mozilla\Firefox\profiles.ini'
if (-not (Test-Path -LiteralPath $ini)) {
  throw "没找到 $ini —— 先打开一次 Firefox，再回来跑这个脚本。"
}
$secs = @{}; $cur = ''
foreach ($line in (Get-Content -LiteralPath $ini -Encoding UTF8)) {
  if ($line -match '^\s*\[(.+?)\]\s*$') { $cur = $Matches[1]; $secs[$cur] = @{}; continue }
  if ($cur -and $line -match '^\s*([^=]+?)\s*=\s*(.*)$') { $secs[$cur][$Matches[1]] = $Matches[2].Trim() }
}
$root = Join-Path $env:APPDATA 'Mozilla\Firefox'
$profiles = @()
foreach ($name in $secs.Keys) {
  $s = $secs[$name]
  if (-not $s.ContainsKey('Path')) { continue }
  if ($name -like 'BackgroundTasksProfiles*') { continue }
  $p = if ($s['IsRelative'] -eq '0') { $s['Path'] } else { Join-Path $root $s['Path'] }
  if (Test-Path -LiteralPath $p) {
    $score = 0
    if ($name -like 'Install*') { $score += 2 }
    if ($s['Default'] -eq '1') { $score += 1 }
    if ($p -like '*default-release*') { $score += 3 }
    $profiles += [pscustomobject]@{ Path = $p; Name = $name; Score = $score }
  }
}
if (-not $profiles.Count) { throw 'profiles.ini 里没解析出可用的配置目录。' }
$targets = $profiles | Sort-Object Score -Descending | Select-Object -First 1
Say "  ✓ 目标配置: $($targets.Path)"

# ------------------------------------------------------------- 3. user.js
Step '3/5 写 user.js'
$homepage = if ($useServer) { $siteUrl } else { $fileUrl }
$block = @(
  $markStart,
  "user_pref(`"browser.startup.homepage`", `"$homepage`");",
  'user_pref("browser.startup.page", 1);            // 1 = 启动时打开主页',
  'user_pref("extensions.autoDisableScopes", 0);    // 让侧载的签名扩展自动启用'
) + $markEnd

foreach ($t in $targets) {
  $ujs = Join-Path $t.Path 'user.js'
  $old = if (Test-Path -LiteralPath $ujs) { Get-Content -LiteralPath $ujs -Raw -Encoding UTF8 } else { '' }
  # 去掉上一次写的标记块（保证可重复执行）
  $kept = [regex]::Replace($old, [regex]::Escape($markStart) + '[\s\S]*?' + [regex]::Escape($markEnd), '').TrimEnd()
  if ($old -and $old -notmatch [regex]::Escape($markStart)) {
    $bak = "$ujs.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    if ($DryRun) { Say "  [DryRun] 会备份原有 user.js → $(Split-Path $bak -Leaf)" }
    else {
      Copy-Item -LiteralPath $ujs -Destination $bak -Force
      Say "  · 已备份原有 user.js → $(Split-Path $bak -Leaf)"
    }
  }
  $new = (@($kept, '', ($block -join "`r`n")) | Where-Object { $_ -ne $null }) -join "`r`n"
  if ($DryRun) { Say "  [DryRun] 会写 $ujs （主页 = $homepage）" }
  else {
    Set-Content -LiteralPath $ujs -Value $new -Encoding UTF8
    Say "  ✓ 写入 $ujs （主页 = $homepage）"
  }
}

# ------------------------------------------------- 4. 侧载新标签页扩展
Step '4/5 装新标签页扩展（New Tab Override）'
$xpi = Get-ChildItem -LiteralPath (Join-Path $proj 'tools') -Filter 'newtaboverride-*.xpi' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $useServer) { Say '  · 跳过（没有本地服务，新标签页用不了）' }
elseif (-not $xpi) { Say '  ✗ tools\ 里没找到 newtaboverride-*.xpi，跳过' }
else {
  foreach ($t in $targets) {
    $extDir = Join-Path $t.Path 'extensions'
    $dst = Join-Path $extDir 'newtaboverride@agenedia.com.xpi'
    if ($DryRun) { Say "  [DryRun] 会复制 $($xpi.Name) → $dst" }
    else {
      if (-not (Test-Path -LiteralPath $extDir)) { New-Item -ItemType Directory -Path $extDir -Force | Out-Null }
      Copy-Item -LiteralPath $xpi.FullName -Destination $dst -Force
      Say "  ✓ 已放入 $dst"
    }
  }
}

# ----------------------------------------------- 5. 启动服务 / 开机自启
Step '5/5 本地服务 + 开机自启'
if (-not $useServer) { Say '  · 跳过（没有 Python）' }
else {
  $lnkPath = Join-Path ([Environment]::GetFolderPath('Startup')) '许雪然主页服务.lnk'
  if ($SkipStartup) { Say '  · -SkipStartup：不建开机自启' }
  elseif ($DryRun) { Say "  [DryRun] 会在启动文件夹建快捷方式: $lnkPath" }
  else {
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut($lnkPath)
    $lnk.TargetPath = $pyw
    $lnk.Arguments = '"' + (Join-Path $proj 'tools\serve.py') + '"'
    $lnk.WorkingDirectory = $proj
    $lnk.WindowStyle = 7
    $lnk.Description = '许雪然二次元主页的本地静态服务'
    $lnk.Save()
    Say "  ✓ 开机自启: $lnkPath"
  }
  if ($DryRun) { Say "  [DryRun] 会立刻启动服务 $siteUrl" }
  else {
    $alive = $false
    try { $null = Invoke-WebRequest -UseBasicParsing -Uri $siteUrl -TimeoutSec 3; $alive = $true } catch { }
    if ($alive) { Say "  · 服务已经在跑了: $siteUrl" }
    else {
      $cmd = '"' + $pyw + '" "' + (Join-Path $proj 'tools\serve.py') + '"'
      $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
      Start-Sleep -Seconds 3
      try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $siteUrl -TimeoutSec 5
        Say "  ✓ 服务已启动 (HTTP $($resp.StatusCode)): $siteUrl"
      } catch { Say "  ✗ 服务好像没起来，手动双击「启动主页服务.cmd」看看报错" }
    }
  }
}

# ------------------------------------------------------------------ 收尾
Step '完成 ✿ 接下来手动做两件事'
Say '  1) 重启 Firefox（user.js 只在启动时读一次）'
Say '  2) 第一次开新标签页会显示 New Tab Override 的设置页，'
Say '     在「类型」里选「Firefox 主页」保存一下 —— 以后新标签页就是这个页面了'
if (-not $useServer) { Say '  （没有本地服务，第 2 步可忽略，新标签页保持默认）' }
Say ''
Say "  主页地址: $(if ($useServer) { $siteUrl } else { $fileUrl })"
Say "  本地文件: $fileUrl"
Say '  想卸载/改设置：见 README.md「给别人用 / 分享」那一节'
