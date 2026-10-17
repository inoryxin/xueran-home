# 许雪然主页 · 素材准备脚本
# 从 D:\XXR\键盘 读取原始素材，处理后输出到 <项目>\assets
# 用法:  pwsh -File prepare-assets.ps1
param(
  [string]$Src = 'D:\XXR\键盘',
  [string]$Out = (Join-Path $PSScriptRoot '..\assets')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Out = [System.IO.Path]::GetFullPath($Out)
if (-not (Test-Path -LiteralPath $Out)) { New-Item -ItemType Directory -Path $Out -Force | Out-Null }

function New-TransparentBitmap([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  return $bmp
}

# ---- 1. 计算 alpha 非透明区域的包围盒 ----
function Get-AlphaBounds([System.Drawing.Bitmap]$img, [int]$threshold = 12) {
  $w = $img.Width; $h = $img.Height
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $data = $img.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $stride = $data.Stride
    $bytes = New-Object byte[] ($stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
    for ($y = 0; $y -lt $h; $y++) {
      $rowBase = $y * $stride
      for ($x = 0; $x -lt $w; $x++) {
        $a = $bytes[$rowBase + $x * 4 + 3]
        if ($a -gt $threshold) {
          if ($x -lt $minX) { $minX = $x }
          if ($x -gt $maxX) { $maxX = $x }
          if ($y -lt $minY) { $minY = $y }
          if ($y -gt $maxY) { $maxY = $y }
        }
      }
    }
    if ($maxX -lt 0) { return $rect }
    return New-Object System.Drawing.Rectangle($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))
  } finally {
    $img.UnlockBits($data)
  }
}

# ---- 2. 裁掉透明边框并缩放到目标宽度/高度 ----
function Export-Trimmed([string]$srcPath, [string]$dstPath, [int]$targetW = 0, [int]$targetH = 0, [int]$pad = 6) {
  $img = [System.Drawing.Bitmap]::FromFile($srcPath)
  try {
    $b = Get-AlphaBounds $img
    $x = [math]::Max(0, $b.X - $pad); $y = [math]::Max(0, $b.Y - $pad)
    $rw = [math]::Min($img.Width - $x, $b.Width + $pad * 2)
    $rh = [math]::Min($img.Height - $y, $b.Height + $pad * 2)
    $src = New-Object System.Drawing.Rectangle($x, $y, $rw, $rh)
    $scale = 1.0
    if ($targetW -gt 0) { $scale = [math]::Min($scale, $targetW / $rw) }
    if ($targetH -gt 0) { $scale = [math]::Min($scale, $targetH / $rh) }
    if ($scale -gt 1) { $scale = 1 }
    $dw = [math]::Max(1, [int][math]::Round($rw * $scale))
    $dh = [math]::Max(1, [int][math]::Round($rh * $scale))
    $dst = New-TransparentBitmap $dw $dh
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $dw, $dh)), $src, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $dst.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $dst.Dispose()
    Write-Output ("  {0,-22} -> {1}  ({2}x{3}, {4} KB)" -f (Split-Path $srcPath -Leaf), (Split-Path $dstPath -Leaf), $dw, $dh, [int]((Get-Item $dstPath).Length / 1KB))
  } finally {
    $img.Dispose()
  }
}

# ---- 3. 壁纸转 JPEG（缩小 + 压缩） ----
function Export-Jpeg([string]$srcPath, [string]$dstPath, [int]$maxW = 1920, [int]$quality = 88) {
  $img = [System.Drawing.Bitmap]::FromFile($srcPath)
  try {
    $scale = [math]::Min(1.0, $maxW / $img.Width)
    $dw = [math]::Max(1, [int][math]::Round($img.Width * $scale))
    $dh = [math]::Max(1, [int][math]::Round($img.Height * $scale))
    $dst = New-Object System.Drawing.Bitmap($dw, $dh)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $dw, $dh)
    $g.Dispose()
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int]$quality)
    $dst.Save($dstPath, $codec, $ep)
    $dst.Dispose()
    Write-Output ("  {0,-22} -> {1}  ({2}x{3}, {4} KB)" -f (Split-Path $srcPath -Leaf), (Split-Path $dstPath -Leaf), $dw, $dh, [int]((Get-Item $dstPath).Length / 1KB))
  } finally {
    $img.Dispose()
  }
}

Write-Output '== 许雪然主页 :: 素材准备 =='

Write-Output '[1/4] Logo（去边 + 裁切）'
Export-Trimmed (Join-Path $Src 'logo.png') (Join-Path $Out 'logo.png') -targetW 1400 -pad 8

Write-Output '[2/4] 立绘（桌面坐姿 · 透明底）'
Export-Trimmed (Join-Path $Src '桌子坐p.png') (Join-Path $Out 'xueran-desk.png') -targetH 1300 -pad 4

Write-Output '[3/4] Q 版看板娘'
$chibiOut = Join-Path $Out 'chibi'
if (-not (Test-Path -LiteralPath $chibiOut)) { New-Item -ItemType Directory -Path $chibiOut -Force | Out-Null }
foreach ($name in @('Q1.png', 'Q2.png', 'Q3.png', 'Q5.png', 'Q6.png', 'Q7.png', 'Q8.png', 'Q10.png', 'yaoshikou.png')) {
  if (Test-Path -LiteralPath (Join-Path $Src $name)) {
    $dst = Join-Path $chibiOut ('chibi-' + ($name -replace '\.png$', '').ToLower() + '.png')
    Export-Trimmed (Join-Path $Src $name) $dst -targetH 620 -pad 4
  }
}

Write-Output '[4/4] 背景'
Write-Output '  主页现在只用纯色渐变配色（默认「樱花」），不再需要图片壁纸；'
Write-Output '  D:\XXR\键盘 里的桌子坐.png / 月.png / 123.png 原图保持不动，需要时再转。'

Write-Output '完成 ✿'

