Add-Type -AssemblyName System.Drawing

$srcPath = "public/logo.png"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source image $srcPath not found"
    exit 1
}

$srcBmp = New-Object System.Drawing.Bitmap $srcPath

$canvasSize = 1024
$targetLogoSize = 864
$offsetX = [int](($canvasSize - $targetLogoSize) / 2) # 80
$offsetY = [int](($canvasSize - $targetLogoSize) / 2) # 80

# 1. First, render the scaled logo onto an intermediate 1024x1024 bitmap
$tempBmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gt = [System.Drawing.Graphics]::FromImage($tempBmp)
$gt.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gt.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gt.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gt.Clear([System.Drawing.Color]::Transparent)

$destRect = New-Object System.Drawing.Rectangle $offsetX, $offsetY, $targetLogoSize, $targetLogoSize
$gt.DrawImage($srcBmp, $destRect)
$gt.Dispose()
$srcBmp.Dispose()

# 2. Build final 1024x1024 full-bleed seamless bitmap
$finalBmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Lock bits for high-performance direct pixel manipulation
$rect = New-Object System.Drawing.Rectangle 0, 0, $canvasSize, $canvasSize
$srcData = $tempBmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$dstData = $finalBmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

$bytes = [Math]::Abs($srcData.Stride) * $canvasSize
$srcBytes = New-Object byte[] $bytes
$dstBytes = New-Object byte[] $bytes

[System.Runtime.InteropServices.Marshal]::Copy($srcData.Scan0, $srcBytes, 0, $bytes)

# For each row Y, find the leftmost and rightmost fully opaque pixel
$minOpaqueX = New-Object int[] $canvasSize
$maxOpaqueX = New-Object int[] $canvasSize

for ($y = 0; $y -lt $canvasSize; $y++) {
    $minOpaqueX[$y] = -1
    $maxOpaqueX[$y] = -1
    $rowOffset = $y * $srcData.Stride
    for ($x = 0; $x -lt $canvasSize; $x++) {
        $idx = $rowOffset + ($x * 4)
        $a = $srcBytes[$idx + 3]
        if ($a -ge 245) {
            if ($minOpaqueX[$y] -eq -1) { $minOpaqueX[$y] = $x }
            $maxOpaqueX[$y] = $x
        }
    }
}

# For each column X, find the topmost and bottommost fully opaque pixel
$minOpaqueY = New-Object int[] $canvasSize
$maxOpaqueY = New-Object int[] $canvasSize

for ($x = 0; $x -lt $canvasSize; $x++) {
    $minOpaqueY[$x] = -1
    $maxOpaqueY[$x] = -1
    for ($y = 0; $y -lt $canvasSize; $y++) {
        $idx = ($y * $srcData.Stride) + ($x * 4)
        $a = $srcBytes[$idx + 3]
        if ($a -ge 245) {
            if ($minOpaqueY[$x] -eq -1) { $minOpaqueY[$x] = $y }
            $maxOpaqueY[$x] = $y
        }
    }
}

# Build the seamless fill:
# Inside the logo where alpha >= 250, copy the exact original pixels
# Outside or where alpha < 250, clamp/extend outward smoothly from the nearest solid logo pixels
for ($y = 0; $y -lt $canvasSize; $y++) {
    $rowOffset = $y * $srcData.Stride
    $leftX = $minOpaqueX[$y]
    $rightX = $maxOpaqueX[$y]

    for ($x = 0; $x -lt $canvasSize; $x++) {
        $idx = $rowOffset + ($x * 4)
        $a = $srcBytes[$idx + 3]

        if ($a -ge 250) {
            # Fully inside original artwork
            $dstBytes[$idx] = $srcBytes[$idx]         # B
            $dstBytes[$idx + 1] = $srcBytes[$idx + 1] # G
            $dstBytes[$idx + 2] = $srcBytes[$idx + 2] # R
            $dstBytes[$idx + 3] = 255                 # A
        } else {
            # Outside or edge: find sample source coordinate
            # If row has opaque pixels: clamp X to [leftX, rightX]
            $sampleX = $x
            $sampleY = $y

            if ($leftX -ge 0 -and $rightX -ge 0) {
                # Clamp X into safe opaque margin (inset by 4 pixels to avoid boundary anti-aliasing)
                $safeL = [Math]::Min($leftX + 4, $rightX)
                $safeR = [Math]::Max($rightX - 4, $leftX)
                if ($sampleX -lt $safeL) { $sampleX = $safeL }
                if ($sampleX -gt $safeR) { $sampleX = $safeR }
            } else {
                # Row is completely outside (e.g. top or bottom margin):
                # Clamp Y into nearest row that has opaque pixels
                $nearestY = $y
                if ($y -lt ($canvasSize / 2)) {
                    # Top margin: find first row with opaque pixels
                    for ($ty = 0; $ty -lt $canvasSize; $ty++) {
                        if ($minOpaqueX[$ty] -ge 0) { $nearestY = $ty + 4; break }
                    }
                } else {
                    # Bottom margin: find last row with opaque pixels
                    for ($ty = ($canvasSize - 1); $ty -ge 0; $ty--) {
                        if ($minOpaqueX[$ty] -ge 0) { $nearestY = $ty - 4; break }
                    }
                }
                $sampleY = $nearestY
                $rL = $minOpaqueX[$sampleY]
                $rR = $maxOpaqueX[$sampleY]
                if ($rL -ge 0 -and $rR -ge 0) {
                    $safeL = [Math]::Min($rL + 4, $rR)
                    $safeR = [Math]::Max($rR - 4, $rL)
                    if ($sampleX -lt $safeL) { $sampleX = $safeL }
                    if ($sampleX -gt $safeR) { $sampleX = $safeR }
                }
            }

            # Clamp Y against column limits as well for smooth corners
            $topY = $minOpaqueY[$sampleX]
            $botY = $maxOpaqueY[$sampleX]
            if ($topY -ge 0 -and $botY -ge 0) {
                $safeT = [Math]::Min($topY + 4, $botY)
                $safeB = [Math]::Max($botY - 4, $topY)
                if ($sampleY -lt $safeT) { $sampleY = $safeT }
                if ($sampleY -gt $safeB) { $sampleY = $safeB }
            }

            $sIdx = ($sampleY * $srcData.Stride) + ($sampleX * 4)

            # If the pixel was semi-transparent, blend it smoothly with the extended background
            if ($a -gt 0) {
                $alphaRatio = $a / 255.0
                $invAlpha = 1.0 - $alphaRatio
                $dstBytes[$idx] = [byte][Math]::Round(($srcBytes[$idx] * $alphaRatio) + ($srcBytes[$sIdx] * $invAlpha))
                $dstBytes[$idx + 1] = [byte][Math]::Round(($srcBytes[$idx + 1] * $alphaRatio) + ($srcBytes[$sIdx + 1] * $invAlpha))
                $dstBytes[$idx + 2] = [byte][Math]::Round(($srcBytes[$idx + 2] * $alphaRatio) + ($srcBytes[$sIdx + 2] * $invAlpha))
                $dstBytes[$idx + 3] = 255
            } else {
                $dstBytes[$idx] = $srcBytes[$sIdx]
                $dstBytes[$idx + 1] = $srcBytes[$sIdx + 1]
                $dstBytes[$idx + 2] = $srcBytes[$sIdx + 2]
                $dstBytes[$idx + 3] = 255
            }
        }
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($dstBytes, 0, $dstData.Scan0, $bytes)
$tempBmp.UnlockBits($srcData)
$finalBmp.UnlockBits($dstData)
$tempBmp.Dispose()

# Save final seamless full-bleed images
$fgPath = "assets/images/android-icon-foreground.png"
$bgPath = "assets/images/android-icon-background.png"
$iconPath = "assets/images/icon.png"

$finalBmp.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Generated: $fgPath (1024x1024 100% full-bleed seamless)"

$finalBmp.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Generated: $iconPath (1024x1024 100% full-bleed seamless app icon)"

# Generate android-icon-background.png as the matching full-bleed background
# (Sampling the top, mid, and bottom of the final image)
$bgBmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gb = [System.Drawing.Graphics]::FromImage($bgBmp)
$gb.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Draw the final image directly as the background layer as well
# This ensures that whether Android launcher uses single-layer or multi-layer adaptive icon,
# the background and foreground align with mathematical 0.0000% error!
$gb.DrawImage($finalBmp, 0, 0, $canvasSize, $canvasSize)
$gb.Dispose()
$bgBmp.Save($bgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bgBmp.Dispose()
Write-Host "Generated: $bgPath (1024x1024 matching background layer)"

$finalBmp.Dispose()
Write-Host "Full bleed seamless icons generated successfully!"
