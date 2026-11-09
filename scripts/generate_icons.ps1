Add-Type -AssemblyName System.Drawing

$srcPath = "public/logo.png"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source image $srcPath not found"
    exit 1
}

$srcBmp = New-Object System.Drawing.Bitmap $srcPath

# 1. Generate android-icon-foreground.png (1024x1024 with transparent background, logo inside 620x620 safe zone)
$canvasSize = 1024
$targetLogoSize = 620
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

# 2. Generate icon.png (1024x1024 standard app icon with safe margin 800x800)
$iconSize = 1024
$iconLogoSize = 820
$iconOffset = [int](($iconSize - $iconLogoSize) / 2)
$iconBmp = New-Object System.Drawing.Bitmap $iconSize, $iconSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gi = [System.Drawing.Graphics]::FromImage($iconBmp)
$gi.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gi.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gi.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gi.Clear([System.Drawing.Color]::Transparent)

$destRectIcon = New-Object System.Drawing.Rectangle $iconOffset, $iconOffset, $iconLogoSize, $iconLogoSize
$gi.DrawImage($srcBmp, $destRectIcon)
$gi.Dispose()

$iconPath = "assets/images/icon.png"
$iconBmp.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$iconBmp.Dispose()
Write-Host "Created $iconPath (1024x1024, logo size: ${iconLogoSize}x${iconLogoSize})"

# 3. Generate splash-icon.png (high-res 512x512)
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
Write-Host "Created $splashPath (512x512)"

$srcBmp.Dispose()
Write-Host "All icon assets generated successfully!"
