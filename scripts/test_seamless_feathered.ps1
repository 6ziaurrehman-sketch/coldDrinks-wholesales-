Add-Type -AssemblyName System.Drawing

$srcPath = "public/logo.png"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source image $srcPath not found"
    exit 1
}

$srcBmp = New-Object System.Drawing.Bitmap $srcPath

$canvasSize = 1024
$targetLogoSize = 720
$offsetX = [int](($canvasSize - $targetLogoSize) / 2) # 152
$offsetY = [int](($canvasSize - $targetLogoSize) / 2) # 152

# Scale factor
$scale = $targetLogoSize / 500.0

# 1. Create final bitmap
$finalBmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($finalBmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# A. Base Linear Gradient (Royal Blue #0038A8 -> Deep Navy #000C36)
$topColor = [System.Drawing.Color]::FromArgb(255, 0, 56, 168)
$botColor = [System.Drawing.Color]::FromArgb(255, 0, 12, 54)
$bgRect = New-Object System.Drawing.Rectangle 0, 0, $canvasSize, $canvasSize
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, $topColor, $botColor, 90.0
$g.FillRectangle($brush, $bgRect)
$brush.Dispose()

# B. Top-center Radial Glow (#0079E1)
$glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glowRect = New-Object System.Drawing.Rectangle 112, -100, 800, 800
$glowPath.AddEllipse($glowRect)
$pbg = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
$pbg.CenterColor = [System.Drawing.Color]::FromArgb(180, 0, 121, 225)
$pbg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 56, 168))
$g.FillPath($pbg, $glowPath)
$pbg.Dispose()
$glowPath.Dispose()

# C. Bottom Orange Wave extending edge-to-edge
$wavePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$wavePath.StartFigure()
$wavePath.AddLine(0, 880, 0, 1024)
$wavePath.AddLine(0, 1024, 1024, 1024)
$wavePath.AddLine(1024, 1024, 1024, 860)
# Smooth wave across bottom matching the logo
$wavePath.AddBezier(1024, 860, 800, 840, 512, 920, 250, 870)
$wavePath.AddBezier(250, 870, 150, 850, 50, 860, 0, 880)
$wavePath.CloseFigure()

$orangeTop = [System.Drawing.Color]::FromArgb(255, 250, 149, 0)
$orangeBot = [System.Drawing.Color]::FromArgb(255, 255, 106, 0)
$waveRect = New-Object System.Drawing.Rectangle 0, 830, $canvasSize, 200
$waveBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $waveRect, $orangeTop, $orangeBot, 45.0
$g.FillPath($waveBrush, $wavePath)
$waveBrush.Dispose()
$wavePath.Dispose()

# D. Now draw the scaled logo with feathered alpha mask around the squircle edges
# This completely erases the squircle outline and blends the logo seamlessly!
$logoBmp = New-Object System.Drawing.Bitmap $targetLogoSize, $targetLogoSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gl = [System.Drawing.Graphics]::FromImage($logoBmp)
$gl.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gl.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gl.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gl.DrawImage($srcBmp, 0, 0, $targetLogoSize, $targetLogoSize)
$gl.Dispose()

# Lock bits on logoBmp to feather the outer squircle edges
$lRect = New-Object System.Drawing.Rectangle 0, 0, $targetLogoSize, $targetLogoSize
$lData = $logoBmp.LockBits($lRect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$lBytes = New-Object byte[] ([Math]::Abs($lData.Stride) * $targetLogoSize)
[System.Runtime.InteropServices.Marshal]::Copy($lData.Scan0, $lBytes, 0, $lBytes.Length)

# Distance transform or squircle edge feathering:
# Center of logoBmp is (halfSize, halfSize)
$halfSize = $targetLogoSize / 2.0
$squircleR = 210.0 * $scale # radius in logoBmp coords
$featherDist = 28.0 * $scale # feather width

for ($y = 0; $y -lt $targetLogoSize; $y++) {
    $dy = [Math]::Abs($y - $halfSize)
    $rowOff = $y * $lData.Stride
    for ($x = 0; $x -lt $targetLogoSize; $x++) {
        $dx = [Math]::Abs($x - $halfSize)
        $idx = $rowOff + ($x * 4)
        $a = $lBytes[$idx + 3]
        if ($a -gt 0) {
            # Superellipse / squircle distance approximation: (dx/R)^4 + (dy/R)^4
            # For squircle with n=3.5:
            $nx = $dx / $squircleR
            $ny = $dy / $squircleR
            $distNorm = [Math]::Pow([Math]::Pow($nx, 3.5) + [Math]::Pow($ny, 3.5), 1.0 / 3.5)
            
            if ($distNorm -gt 0.88) {
                # In the feather zone: blend alpha from 1.0 at 0.88 to 0.0 at 1.0
                $factor = [Math]::Max(0.0, [Math]::Min(1.0, (1.0 - $distNorm) / (1.0 - 0.88)))
                # Smoothstep
                $factor = $factor * $factor * (3.0 - 2.0 * $factor)
                $newA = [byte][Math]::Round($a * $factor)
                $lBytes[$idx + 3] = $newA
            }
        }
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($lBytes, 0, $lData.Scan0, $lBytes.Length)
$logoBmp.UnlockBits($lData)

# Draw the feathered logo onto the seamless background
$g.DrawImage($logoBmp, $offsetX, $offsetY)
$logoBmp.Dispose()
$g.Dispose()
$srcBmp.Dispose()

# Save test image
$testPath = "assets/images/test_seamless_icon.png"
$finalBmp.Save($testPath, [System.Drawing.Imaging.ImageFormat]::Png)
$finalBmp.Dispose()
Write-Host "Generated $testPath"
