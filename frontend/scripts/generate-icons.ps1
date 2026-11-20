Add-Type -AssemblyName System.Drawing

function New-SpendSenseIcon {
    param([int]$Size, [string]$Path, [bool]$Maskable = $false)
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::FromArgb(12, 10, 9))
    $scale = $Size / 320.0 * $(if ($Maskable) { 0.82 } else { 0.92 })
    $graphics.TranslateTransform($Size / 2.0, $Size / 2.0)
    $graphics.ScaleTransform($scale, $scale)

    $mark = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $mark.StartFigure()
    $mark.AddBezier(78, -112, 42, -145, -8, -150, -49, -132)
    $mark.AddBezier(-49, -132, -110, -106, -118, -43, -70, -15)
    $mark.AddBezier(-70, -15, -42, 1, 13, 9, 43, 22)
    $mark.AddBezier(43, 22, 94, 44, 97, 97, 54, 126)
    $mark.AddBezier(54, 126, 14, 154, -49, 146, -82, 111)
    $main = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(251, 251, 249), 24)
    $main.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $main.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $main.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawPath($main, $mark)

    $accent = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(16, 185, 129), 12)
    $accent.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $accent.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($accent, -38, 43, 38, 43)
    $graphics.ResetTransform()
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $accent.Dispose(); $main.Dispose(); $mark.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
    Write-Host "Generated $Path ($Size x $Size)"
}

$web = 'frontend/public/icons'
New-Item -ItemType Directory -Force -Path $web | Out-Null
New-SpendSenseIcon 192 "$web/icon-192x192.png"
New-SpendSenseIcon 512 "$web/icon-512x512.png"
New-SpendSenseIcon 512 "$web/icon-512x512-maskable.png" $true
New-SpendSenseIcon 180 "$web/apple-touch-icon.png"

$android = 'android/app/src/main/res'
foreach ($entry in @(@{ density='mdpi'; size=48 }, @{ density='hdpi'; size=72 }, @{ density='xhdpi'; size=96 }, @{ density='xxhdpi'; size=144 }, @{ density='xxxhdpi'; size=192 })) {
    $folder = Join-Path $android "mipmap-$($entry.density)"
    New-SpendSenseIcon $entry.size (Join-Path $folder 'ic_launcher.png')
    New-SpendSenseIcon $entry.size (Join-Path $folder 'ic_launcher_round.png')
}

$fav = [System.Drawing.Bitmap]::new(32, 32)
$fg = [System.Drawing.Graphics]::FromImage($fav)
$fg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$fg.Clear([System.Drawing.Color]::FromArgb(12, 10, 9))
$fp = [System.Drawing.Drawing2D.GraphicsPath]::new()
$fp.StartFigure()
$fp.AddBezier(24, 4, 20, 1, 13, 1, 9, 4)
$fp.AddBezier(9, 4, 1, 9, 3, 14, 12, 16)
$fp.AddBezier(12, 16, 22, 18, 29, 22, 22, 28)
$fp.AddBezier(22, 28, 17, 32, 9, 30, 5, 27)
$white = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(251, 251, 249), 2.8)
$white.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $white.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$fg.DrawPath($white, $fp)
$green = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(16, 185, 129), 1.5)
$green.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $green.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$fg.DrawLine($green, 10, 18, 19, 18)
$hIcon = $fav.GetHicon(); $icon = [System.Drawing.Icon]::FromHandle($hIcon)
$file = [System.IO.File]::Create('frontend/public/favicon.ico'); $icon.Save($file); $file.Dispose()
$icon.Dispose(); $green.Dispose(); $white.Dispose(); $fp.Dispose(); $fg.Dispose(); $fav.Dispose()
