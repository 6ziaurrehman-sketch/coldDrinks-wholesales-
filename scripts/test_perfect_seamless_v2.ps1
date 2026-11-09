Add-Type -AssemblyName System.Drawing

$srcPath = "public/logo.png"
$srcBmp = New-Object System.Drawing.Bitmap $srcPath

$canvasSize = 1024
$scale = 1.70
$targetLogoSize = [int][Math]::Round(500 * $scale) # 850
$offsetX = [int][Math]::Round((1024 - $targetLogoSize) / 2) # 87
$offsetY = [int][Math]::Round((1024 - $targetLogoSize) / 2) # 87

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
$glowRect = New-Object System.Drawing.Rectangle 87, -130, 850, 720
$glowPath.AddEllipse($glowRect)
$pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
$pgb.CenterColor = [System.Drawing.Color]::FromArgb(210, 0, 136, 255)
$pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 56, 168))
$g.FillPath($pgb, $glowPath)
$pgb.Dispose()
$glowPath.Dispose()

# 3. Bottom Orange Wave extending full edge-to-edge
# Refined curve matching the logo wave:
# Right: (1024, 760) -> Center: (512, 855) -> Left: (0, 890)
$wavePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$wavePath.StartFigure()
$wavePath.AddLine(0, 890, 0, 1024)
$wavePath.AddLine(0, 1024, 1024, 1024)
$wavePath.AddLine(1024, 1024, 1024, 760)

# Smooth Bezier curve connecting right to left
$wavePath.AddBezier(1024, 760, 880, 785, 720, 835, 512, 855)
$wavePath.AddBezier(512, 855, 360, 875, 180, 888, 0, 890)
$wavePath.CloseFigure()

# Fill orange body
$orangeTop = [System.Drawing.Color]::FromArgb(255, 250, 149, 0)
$orangeBot = [System.Drawing.Color]::FromArgb(255, 255, 100, 0)
$waveRect = New-Object System.Drawing.Rectangle 0, 740, $canvasSize, 300
$wBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $waveRect, $orangeTop, $orangeBot, 45.0
$g.FillPath($wBrush, $wavePath)
$wBrush.Dispose()

# Yellow-gold crest ribbon along the top edge of the wave
$crestPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 255, 235, 100)), 6.0
$g.DrawBezier($crestPen, 1024, 760, 880, 785, 720, 835, 512, 855)
$g.DrawBezier($crestPen, 512, 855, 360, 875, 180, 888, 0, 890)
$crestPen.Dispose()
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
            } elseif ($distNorm -gt 0.82) {
                $t = ($distNorm - 0.82) / (0.94 - 0.82)
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

$testOut = "assets/images/test_perfect_seamless_v2.png"
$finalBmp.Save($testOut, [System.Drawing.Imaging.ImageFormat]::Png)
$finalBmp.Dispose()
Write-Host "Generated: $testOut"

# Re-run previews
$src = New-Object System.Drawing.Bitmap $testOut
$circleBmp = New-Object System.Drawing.Bitmap 1024, 1024, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gc = [System.Drawing.Graphics]::FromImage($circleBmp)
$gc.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gc.Clear([System.Drawing.Color]::Transparent)
$cPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$cPath.AddEllipse(152, 152, 720, 720)
$gc.SetClip($cPath)
$gc.DrawImage($src, 0, 0, 1024, 1024)
$gc.ResetClip()
$gc.Dispose()
$circleBmp.Save("assets/images/preview_circle_mask_v2.png", [System.Drawing.Imaging.ImageFormat]::Png)
$circleBmp.Dispose()

$sqBmp = New-Object System.Drawing.Bitmap 1024, 1024, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gsq = [System.Drawing.Graphics]::FromImage($sqBmp)
$gsq.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gsq.Clear([System.Drawing.Color]::Transparent)
$sqPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 220
$rect = New-Object System.Drawing.Rectangle 132, 132, 760, 760
$sqPath.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
$sqPath.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
$sqPath.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
$sqPath.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
$sqPath.CloseFigure()
$gsq.SetClip($sqPath)
$gsq.DrawImage($src, 0, 0, 1024, 1024)
$gsq.ResetClip()
$gsq.Dispose()
$sqBmp.Save("assets/images/preview_squircle_mask_v2.png", [System.Drawing.Imaging.ImageFormat]::Png)
$sqBmp.Dispose()
$src.Dispose()
Write-Host "v2 previews generated!"
