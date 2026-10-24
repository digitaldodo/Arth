Add-Type -AssemblyName System.Drawing

function Generate-ArthIcon {
    param(
        [int]$size,
        [string]$outputPath,
        [bool]$isMaskable = $false
    )

    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    # Set high rendering quality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background: Obsidian #0C0A09
    $bgColor = [System.Drawing.Color]::FromArgb(255, 12, 10, 9)
    $bgBrush = New-Object System.Drawing.SolidBrush $bgColor
    $graphics.FillRectangle($bgBrush, 0, 0, $size, $size)

    # Scale factor relative to 512
    # For maskable icons, scale factor is slightly reduced to guarantee 100% placement within center 80% circle
    $baseScale = $size / 512.0
    $glyphScale = if ($isMaskable) { $baseScale * 0.85 } else { $baseScale * 0.92 }

    $centerX = $size / 2.0
    $centerY = $size / 2.0

    # Transformation to center and scale
    $graphics.TranslateTransform($centerX, $centerY)
    $graphics.ScaleTransform($glyphScale, $glyphScale)

    # Color palette
    $paperColor = [System.Drawing.Color]::FromArgb(255, 251, 251, 249) # #FBFBF9 warm archival paper
    $emeraldColor = [System.Drawing.Color]::FromArgb(255, 16, 185, 129) # #10B981 ledger emerald
    $stoneColor = [System.Drawing.Color]::FromArgb(180, 168, 162, 158)  # #A8A29E muted hairline

    $paperBrush = New-Object System.Drawing.SolidBrush $paperColor
    $emeraldBrush = New-Object System.Drawing.SolidBrush $emeraldColor
    $stonePen = New-Object System.Drawing.Pen $stoneColor, 4.0

    # Draw geometric "A" with ledger ruling aesthetics
    # The coordinate system is centered at (0, 0)
    # Apex at (0, -115), Left leg at (-95, 105), Right leg at (95, 105)

    $mainPen = New-Object System.Drawing.Pen $paperColor, 26.0
    $mainPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $mainPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $mainPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter

    # Left leg
    $graphics.DrawLine($mainPen, [float]0, [float]-115, [float]-90, [float]105)
    # Right leg
    $graphics.DrawLine($mainPen, [float]0, [float]-115, [float]90, [float]105)

    # Primary crossbar (warm archival paper)
    $barPen = New-Object System.Drawing.Pen $paperColor, 20.0
    $barPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $barPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($barPen, [float]-52, [float]22, [float]52, [float]22)

    # Ledger ruling accent line (emerald)
    $emeraldPen = New-Object System.Drawing.Pen $emeraldColor, 12.0
    $emeraldPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $emeraldPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($emeraldPen, [float]-36, [float]62, [float]36, [float]62)

    # Sub-rule dot or accent below
    $dotBrush = New-Object System.Drawing.SolidBrush $emeraldColor
    $graphics.FillEllipse($dotBrush, [float]-5, [float]84, [float]10, [float]10)

    # Save PNG
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    # Cleanup
    $mainPen.Dispose()
    $barPen.Dispose()
    $emeraldPen.Dispose()
    $dotBrush.Dispose()
    $stonePen.Dispose()
    $paperBrush.Dispose()
    $emeraldBrush.Dispose()
    $bgBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()

    Write-Host "Generated: $outputPath ($size x $size)"
}

# Create icons directory if needed
$outDir = "frontend/public/icons"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

# 1. 192x192 standard icon
Generate-ArthIcon -size 192 -outputPath "$outDir/icon-192x192.png" -isMaskable $false

# 2. 512x512 standard icon
Generate-ArthIcon -size 512 -outputPath "$outDir/icon-512x512.png" -isMaskable $false

# 3. 512x512 maskable icon (guaranteed safe zone)
Generate-ArthIcon -size 512 -outputPath "$outDir/icon-512x512-maskable.png" -isMaskable $true

# 4. 180x180 Apple touch icon
Generate-ArthIcon -size 180 -outputPath "$outDir/apple-touch-icon.png" -isMaskable $false

# 5. Generate favicon.ico in public/
# Create 32x32 bitmap for favicon
$favBmp = New-Object System.Drawing.Bitmap 32, 32
$favG = [System.Drawing.Graphics]::FromImage($favBmp)
$favG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 12, 10, 9))
$favG.FillRectangle($bg, 0, 0, 32, 32)
$favPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 251, 251, 249)), 2.5
$favG.DrawLine($favPen, 16.0, 5.0, 7.0, 26.0)
$favG.DrawLine($favPen, 16.0, 5.0, 25.0, 26.0)
$barP = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 16, 185, 129)), 2.0
$favG.DrawLine($barP, 11.0, 18.0, 21.0, 18.0)
$favG.Dispose()
$bg.Dispose()
$favPen.Dispose()
$barP.Dispose()

# Save favicon.ico via Hicon
$hIcon = $favBmp.GetHicon()
$favIcon = [System.Drawing.Icon]::FromHandle($hIcon)
$fileStream = [System.IO.File]::OpenWrite("frontend/public/favicon.ico")
$favIcon.Save($fileStream)
$fileStream.Close()
$fileStream.Dispose()
$favIcon.Dispose()
$favBmp.Dispose()
Write-Host "Generated: frontend/public/favicon.ico (32 x 32)"
