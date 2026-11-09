Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 'assets/images/android-icon-foreground.png'
Write-Host "Foreground Dimensions: $($bmp.Width) x $($bmp.Height)"

# Find the bounding box of non-transparent pixels in foreground
$minX = $bmp.Width
$maxX = 0
$minY = $bmp.Height
$maxY = 0

for ($y = 0; $y -lt $bmp.Height; $y++) {
  for ($x = 0; $x -lt $bmp.Width; $x++) {
    $p = $bmp.GetPixel($x, $y)
    if ($p.A -gt 10) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}

Write-Host "Non-transparent bounds: X=[$minX, $maxX], Y=[$minY, $maxY]"
Write-Host "Content width: $($maxX - $minX + 1), height: $($maxY - $minY + 1)"

# Check what the outer pixels of the content look like
Write-Host "Sample pixels on content boundary:"
Write-Host "Top of content ($([int](($minX+$maxX)/2)), $minY):" ($bmp.GetPixel([int](($minX+$maxX)/2), $minY))
Write-Host "Left of content ($minX, $([int](($minY+$maxY)/2))):" ($bmp.GetPixel($minX, [int](($minY+$maxY)/2)))
Write-Host "Bottom of content ($([int](($minX+$maxX)/2)), $maxY):" ($bmp.GetPixel([int](($minX+$maxX)/2), $maxY))
Write-Host "Right of content ($maxX, $([int](($minY+$maxY)/2))):" ($bmp.GetPixel($maxX, [int](($minY+$maxY)/2)))

$bmp.Dispose()
