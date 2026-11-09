Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 1024, 1024, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

$rect = New-Object System.Drawing.Rectangle -10, -10, 1044, 1044
$c1 = [System.Drawing.Color]::FromArgb(255, 0, 60, 180)
$c2 = [System.Drawing.Color]::FromArgb(255, 0, 22, 90)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 90.0
$g.FillRectangle($brush, 0, 0, 1024, 1024)
$g.Dispose()
$brush.Dispose()

Write-Host "Top-left:     $($bmp.GetPixel(0, 0))"
Write-Host "Top-center:   $($bmp.GetPixel(512, 0))"
Write-Host "Bottom-right: $($bmp.GetPixel(1023, 1023))"
Write-Host "Left-center:  $($bmp.GetPixel(0, 512))"
$bmp.Dispose()
