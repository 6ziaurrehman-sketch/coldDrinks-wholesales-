Add-Type -AssemblyName System.Drawing

$srcPath = "public/logo.png"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source image $srcPath not found"
    exit 1
}

$srcBmp = New-Object System.Drawing.Bitmap $srcPath

# Deep royal blue colors matching the logo
$topColor = [System.Drawing.Color]::FromArgb(255, 0, 60, 180)     # #003CB4 (upper blue)
$bottomColor = [System.Drawing.Color]::FromArgb(255, 0, 22, 90)   # #00165A (deep navy bottom)

# 1. Generate android-icon-background.png (1024x1024 solid gradient matching the logo)
$bgSize = 1024
$bgBmp = New-Object System.Drawing.Bitmap $bgSize, $bgSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gb = [System.Drawing.Graphics]::FromImage($bgBmp)
$gb.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$rect = New-Object System.Drawing.Rectangle 0, 0, $bgSize, $bgSize
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $topColor, $bottomColor, 90.0
$gb.FillRectangle($brush, $rect)
$brush.Dispose()
$gb.Dispose()

$bgPath = "assets/images/android-icon-background.png"
$bgBmp.Save($bgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bgBmp.Dispose()
Write-Host "Created $bgPath (1024x1024 seamless blue gradient)"

# 2. Generate android-icon-foreground.png (1024x1024, emblem sized to 740x740 inside safe zone)
$canvasSize = 1024
$targetLogoSize = 740
$offset = [int](($canvasSize - $targetLogoSize) / 2)

$fgBmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($fgBmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Draw scaled logo centered
$destRect = New-Object System.Drawing.Rectangle $offset, $offset, $targetLogoSize, $targetLogoSize
$g.DrawImage($srcBmp, $destRect)
$g.Dispose()

$fgPath = "assets/images/android-icon-foreground.png"
$fgBmp.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$fgBmp.Dispose()
Write-Host "Created $fgPath (1024x1024, logo size: ${targetLogoSize}x${targetLogoSize}, offset: $offset)"

# 3. Generate icon.png (1024x1024 standard app icon with background included)
$iconBmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gi = [System.Drawing.Graphics]::FromImage($iconBmp)
$gi.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gi.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gi.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Fill background with matching gradient
$brushIcon = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $topColor, $bottomColor, 90.0
$gi.FillRectangle($brushIcon, $rect)
$brushIcon.Dispose()

# Draw logo filling nicely
$iconLogoSize = 880
$iconOffset = [int](($canvasSize - $iconLogoSize) / 2)
$destRectIcon = New-Object System.Drawing.Rectangle $iconOffset, $iconOffset, $iconLogoSize, $iconLogoSize
$gi.DrawImage($srcBmp, $destRectIcon)
$gi.Dispose()

$iconPath = "assets/images/icon.png"
$iconBmp.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$iconBmp.Dispose()
Write-Host "Created $iconPath (1024x1024, seamless background)"

$srcBmp.Dispose()
Write-Host "All seamless icon assets generated successfully!"
