Add-Type -AssemblyName System.Drawing

$srcPath = "public/logo.png"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source image $srcPath not found"
    exit 1
}

$srcBmp = New-Object System.Drawing.Bitmap $srcPath

$canvasSize = 1024
$scale = 1.22
$targetLogoSize = [int][Math]::Round(500 * $scale) # 610
$offsetX = [int][Math]::Round((1024 - $targetLogoSize) / 2) # 207
$offsetY = [int][Math]::Round((1024 - $targetLogoSize) / 2) # 207

# Create 1024x1024 canvas
$finalBmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($finalBmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# 1. Base vertical gradient (Royal Blue #0038A8 to Deep Navy #000C36)
$topColor = [System.Drawing.Color]::FromArgb(255, 0, 56, 168)
$botColor = [System.Drawing.Color]::FromArgb(255, 0, 12, 54)
$bgRect = New-Object System.Drawing.Rectangle 0, 0, $canvasSize, $canvasSize
$lgb = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, $topColor, $botColor, 90.0
$g.FillRectangle($lgb, $bgRect)
$lgb.Dispose()

# 2. Radial glow at top-center (#0088FF)
$glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glowRect = New-Object System.Drawing.Rectangle 162, 40, 700, 520
$glowPath.AddEllipse($glowRect)
$pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
$pgb.CenterColor = [System.Drawing.Color]::FromArgb(220, 0, 136, 255)
$pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 56, 168))
$g.FillPath($pgb, $glowPath)
$pgb.Dispose()
$glowPath.Dispose()

# 3. Exact matching spline points across the canvas
[System.Drawing.PointF[]]$splinePoints = @(
    (New-Object System.Drawing.PointF 0, 792),
    (New-Object System.Drawing.PointF 160, 772),
    (New-Object System.Drawing.PointF 317, 750),
    (New-Object System.Drawing.PointF 463, 735),
    (New-Object System.Drawing.PointF 512, 735),
    (New-Object System.Drawing.PointF 585, 723),
    (New-Object System.Drawing.PointF 634, 706),
    (New-Object System.Drawing.PointF 683, 683),
    (New-Object System.Drawing.PointF 732, 671),
    (New-Object System.Drawing.PointF 880, 638),
    (New-Object System.Drawing.PointF 1024, 605)
)

$wavePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$wavePath.StartFigure()
$wavePath.AddLine(0, 792, 0, 1024)
$wavePath.AddLine(0, 1024, 1024, 1024)
$wavePath.AddLine(1024, 1024, 1024, 605)
$wavePath.AddCurve($splinePoints, 0.4)
$wavePath.CloseFigure()

# Fill orange body
$orangeTop = [System.Drawing.Color]::FromArgb(255, 250, 149, 0)
$orangeBot = [System.Drawing.Color]::FromArgb(255, 255, 100, 0)
$waveRect = New-Object System.Drawing.Rectangle 0, 600, $canvasSize, 430
$wBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $waveRect, $orangeTop, $orangeBot, 45.0
$g.FillPath($wBrush, $wavePath)
$wBrush.Dispose()

# Yellow-gold crest ribbon along the top edge of the wave
$crestPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(240, 255, 235, 100)), 5.0
$crestPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$crestPath.AddCurve($splinePoints, 0.4)
$g.DrawPath($crestPen, $crestPath)
$crestPen.Dispose()
$crestPath.Dispose()
$wavePath.Dispose()

# 4. Prepare logo with squircle border cleanly erased
$logoScaled = New-Object System.Drawing.Bitmap $targetLogoSize, $targetLogoSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gl = [System.Drawing.Graphics]::FromImage($logoScaled)
$gl.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gl.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gl.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gl.DrawImage($srcBmp, 0, 0, $targetLogoSize, $targetLogoSize)
$gl.Dispose()
$srcBmp.Dispose()

# Feather out the squircle perimeter
$lRect = New-Object System.Drawing.Rectangle 0, 0, $targetLogoSize, $targetLogoSize
$lData = $logoScaled.LockBits($lRect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$lBytes = New-Object byte[] ([Math]::Abs($lData.Stride) * $targetLogoSize)
[System.Runtime.InteropServices.Marshal]::Copy($lData.Scan0, $lBytes, 0, $lBytes.Length)

$centerXL = $targetLogoSize / 2.0
$centerYL = 240.0 * $scale

$R_x = 210.0 * $scale
$R_y = 212.0 * $scale

for ($y = 0; $y -lt $targetLogoSize; $y++) {
    $dy = [Math]::Abs($y - $centerYL)
    $rowOff = $y * $lData.Stride
    for ($x = 0; $x -lt $targetLogoSize; $x++) {
        $dx = [Math]::Abs($x - $centerXL)
        $idx = $rowOff + ($x * 4)
        $a = $lBytes[$idx + 3]
        if ($a -gt 0) {
            $nx = $dx / $R_x
            $ny = $dy / $R_y
            $distNorm = [Math]::Pow([Math]::Pow($nx, 3.6) + [Math]::Pow($ny, 3.6), 1.0 / 3.6)
            
            if ($distNorm -ge 0.94) {
                $lBytes[$idx + 3] = 0
            } elseif ($distNorm -gt 0.80) {
                $t = ($distNorm - 0.80) / (0.94 - 0.80)
                $factor = 0.5 * (1.0 + [Math]::Cos($t * [Math]::PI))
                $newA = [byte][Math]::Round($a * $factor)
                $lBytes[$idx + 3] = $newA
            }
        }
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($lBytes, 0, $lData.Scan0, $lBytes.Length)
$logoScaled.UnlockBits($lData)

# Draw feathered logo on canvas
$g.DrawImage($logoScaled, $offsetX, $offsetY)
$logoScaled.Dispose()
$g.Dispose()

# Save final icons
$fgPath = "assets/images/android-icon-foreground.png"
$bgPath = "assets/images/android-icon-background.png"
$iconPath = "assets/images/icon.png"

$finalBmp.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Updated: $fgPath"

$finalBmp.Save($bgPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Updated: $bgPath"

$finalBmp.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Updated: $iconPath"

# Favicon 48x48
$favBmp = New-Object System.Drawing.Bitmap 48, 48, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gf = [System.Drawing.Graphics]::FromImage($favBmp)
$gf.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gf.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gf.DrawImage($finalBmp, 0, 0, 48, 48)
$gf.Dispose()
$favBmp.Save("assets/images/favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$favBmp.Dispose()
Write-Host "Updated: assets/images/favicon.png"

$finalBmp.Dispose()
Write-Host "All adjusted icons deployed successfully!"
