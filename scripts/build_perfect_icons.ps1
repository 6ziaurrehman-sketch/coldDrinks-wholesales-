Add-Type -AssemblyName System.Drawing

$srcPath = "public/logo.png"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source image $srcPath not found"
    exit 1
}

$srcBmp = New-Object System.Drawing.Bitmap $srcPath

# 1. Colors matching the logo's deep royal blue
$topColor = [System.Drawing.Color]::FromArgb(255, 0, 60, 180)     # #003CB4 (upper royal blue)
$bottomColor = [System.Drawing.Color]::FromArgb(255, 0, 22, 90)   # #00165A (deep navy bottom)

# 2. GENERATE android-icon-background.png (1024x1024 100% OPAQUE solid gradient)
$bgSize = 1024
$bgBmp = New-Object System.Drawing.Bitmap $bgSize, $bgSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gb = [System.Drawing.Graphics]::FromImage($bgBmp)
$gb.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$gb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$gb.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

# Brush rectangle extends slightly beyond canvas to prevent GDI+ edge antialiasing
$brushRect = New-Object System.Drawing.Rectangle -10, -10, ($bgSize + 20), ($bgSize + 20)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $brushRect, $topColor, $bottomColor, 90.0
$gb.FillRectangle($brush, 0, 0, $bgSize, $bgSize)
$brush.Dispose()
$gb.Dispose()

# Verify zero transparent pixels in background
$bgEdgeTL = $bgBmp.GetPixel(0, 0)
$bgEdgeBR = $bgBmp.GetPixel(($bgSize - 1), ($bgSize - 1))
Write-Host "Background verification - TL Alpha: $($bgEdgeTL.A), BR Alpha: $($bgEdgeBR.A)"

$bgPath = "assets/images/android-icon-background.png"
$bgBmp.Save($bgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bgBmp.Dispose()
Write-Host "Saved: $bgPath (1024x1024 100% opaque gradient)"

# 3. GENERATE android-icon-foreground.png (1024x1024 with transparent canvas, emblem sized to 660x660 in safe zone)
$canvasSize = 1024
$targetLogoSize = 660
$offset = [int](($canvasSize - $targetLogoSize) / 2)

$fgBmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($fgBmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$destRect = New-Object System.Drawing.Rectangle $offset, $offset, $targetLogoSize, $targetLogoSize
$g.DrawImage($srcBmp, $destRect)
$g.Dispose()

$fgPath = "assets/images/android-icon-foreground.png"
$fgBmp.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$fgBmp.Dispose()
Write-Host "Saved: $fgPath (1024x1024, emblem size ${targetLogoSize}x${targetLogoSize} centered inside 72dp safe zone)"

# 4. GENERATE icon.png (1024x1024 legacy & package installer icon, full-bleed gradient with logo)
$iconBmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gi = [System.Drawing.Graphics]::FromImage($iconBmp)
$gi.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gi.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gi.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Background fill
$brushIcon = New-Object System.Drawing.Drawing2D.LinearGradientBrush $brushRect, $topColor, $bottomColor, 90.0
$gi.FillRectangle($brushIcon, 0, 0, $canvasSize, $canvasSize)
$brushIcon.Dispose()

# Draw logo centered
$iconLogoSize = 820
$iconOffset = [int](($canvasSize - $iconLogoSize) / 2)
$destRectIcon = New-Object System.Drawing.Rectangle $iconOffset, $iconOffset, $iconLogoSize, $iconLogoSize
$gi.DrawImage($srcBmp, $destRectIcon)
$gi.Dispose()

$iconPath = "assets/images/icon.png"
$iconBmp.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$iconBmp.Dispose()
Write-Host "Saved: $iconPath (1024x1024 full bleed app icon)"

# 5. GENERATE splash-icon.png (512x512)
$splashSize = 512
$splashBmp = New-Object System.Drawing.Bitmap $splashSize, $splashSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gs = [System.Drawing.Graphics]::FromImage($splashBmp)
$gs.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gs.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gs.Clear([System.Drawing.Color]::Transparent)

$destRectSplash = New-Object System.Drawing.Rectangle 0, 0, $splashSize, $splashSize
$gs.DrawImage($srcBmp, $destRectSplash)
$gs.Dispose()

$splashPath = "assets/images/splash-icon.png"
$splashBmp.Save($splashPath, [System.Drawing.Imaging.ImageFormat]::Png)
$splashBmp.Dispose()
Write-Host "Saved: $splashPath (512x512)"

$srcBmp.Dispose()
Write-Host "`nAll icon assets generated and verified successfully!"
