Add-Type -AssemblyName System.Drawing

$srcPath = "public/logo.png"
$srcBmp = New-Object System.Drawing.Bitmap $srcPath

$canvasSize = 1024
$scale = 1.75
$targetLogoSize = [int][Math]::Round(500 * $scale) # 875
$offsetX = [int][Math]::Round((1024 - $targetLogoSize) / 2) # 74
$offsetY = [int][Math]::Round((1024 - $targetLogoSize) / 2) # 74

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
$glowRect = New-Object System.Drawing.Rectangle 62, -150, 900, 750
$glowPath.AddEllipse($glowRect)
$pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
$pgb.CenterColor = [System.Drawing.Color]::FromArgb(200, 0, 136, 255)
$pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 56, 168))
$g.FillPath($pgb, $glowPath)
$pgb.Dispose()
$glowPath.Dispose()

# 3. Bottom Orange Wave extending full edge-to-edge
# Curve points matching the logo's orange wave scaled by 1.75:
# (0, 868) -> (214, 853) -> (512, 832) -> (686, 790) -> (826, 739) -> (1024, 695)
$wavePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$wavePath.StartFigure()
$wavePath.AddLine(0, 868, 0, 1024)
$wavePath.AddLine(0, 1024, 1024, 1024)
$wavePath.AddLine(1024, 1024, 1024, 695)

# Smooth Bezier curve connecting right to left
# From (1024, 695) -> (826, 739) -> (512, 832) -> (0, 868)
$wavePath.AddBezier(1024, 695, 900, 715, 750, 765, 512, 832)
$wavePath.AddBezier(512, 832, 350, 850, 150, 865, 0, 868)
$wavePath.CloseFigure()

# Fill orange body
$orangeTop = [System.Drawing.Color]::FromArgb(255, 250, 149, 0)
$orangeBot = [System.Drawing.Color]::FromArgb(255, 255, 100, 0)
$waveRect = New-Object System.Drawing.Rectangle 0, 680, $canvasSize, 350
$wBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $waveRect, $orangeTop, $orangeBot, 45.0
$g.FillPath($wBrush, $wavePath)
$wBrush.Dispose()

# Yellow-gold crest ribbon along the top edge of the wave
$crestPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 255, 230, 100)), 7.0
$g.DrawBezier($crestPen, 1024, 695, 900, 715, 750, 765, 512, 832)
$g.DrawBezier($crestPen, 512, 832, 350, 850, 150, 865, 0, 868)
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
$centerYL = 240.0 * $scale # 420.0

# Superellipse parameters:
# In 500x500 logo:
# Side radius is ~212, corner radius is ~249.
# With power n=3.6:
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
            
            # Fade starts at 0.82 and completely reaches 0 at 0.94
            # This completely discards the outer 6% (where cyan border stroke lives)
            if ($distNorm -ge 0.94) {
                $lBytes[$idx + 3] = 0
            } elseif ($distNorm -gt 0.82) {
                $t = ($distNorm - 0.82) / (0.94 - 0.82)
                # Smooth cosine curve
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

$testOut = "assets/images/test_perfect_seamless.png"
$finalBmp.Save($testOut, [System.Drawing.Imaging.ImageFormat]::Png)
$finalBmp.Dispose()
Write-Host "Generated: $testOut"
