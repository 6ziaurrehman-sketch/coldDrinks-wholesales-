Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 'public/logo.png'
Write-Host "logo.png dimensions: $($bmp.Width) x $($bmp.Height)"

$minX = $bmp.Width; $maxX = 0; $minY = $bmp.Height; $maxY = 0
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
Write-Host "Non-transparent: X=[$minX, $maxX], Y=[$minY, $maxY]"
Write-Host "Width: $($maxX - $minX + 1), Height: $($maxY - $minY + 1)"
Write-Host "Center pixel: $($bmp.GetPixel([int]($bmp.Width/2), [int]($bmp.Height/2)))"

# Check several points around the perimeter of the circle in logo.png
# Radius is around 214 pixels from center (250, 250)
$cx = 250
$cy = 250
Write-Host "`nSampling along circular perimeter at radius 215 from center (250, 250):"
for ($angle = 0; $angle -lt 360; $angle += 30) {
  $rad = $angle * [Math]::PI / 180.0
  $px = [int]($cx + 215 * [Math]::Cos($rad))
  $py = [int]($cy + 215 * [Math]::Sin($rad))
  if ($px -ge 0 -and $px -lt $bmp.Width -and $py -ge 0 -and $py -lt $bmp.Height) {
    $p = $bmp.GetPixel($px, $py)
    Write-Host ("Angle {0,3} deg: ({1,3}, {2,3}) A={3,3} RGB=({4,3},{5,3},{6,3})" -f $angle, $px, $py, $p.A, $p.R, $p.G, $p.B)
  }
}

# Check outside the circle (radius 245)
Write-Host "`nSampling outside circular perimeter at radius 245:"
for ($angle = 0; $angle -lt 360; $angle += 45) {
  $rad = $angle * [Math]::PI / 180.0
  $px = [int]($cx + 245 * [Math]::Cos($rad))
  $py = [int]($cy + 245 * [Math]::Sin($rad))
  if ($px -ge 0 -and $px -lt $bmp.Width -and $py -ge 0 -and $py -lt $bmp.Height) {
    $p = $bmp.GetPixel($px, $py)
    Write-Host ("Angle {0,3} deg: ({1,3}, {2,3}) A={3,3} RGB=({4,3},{5,3},{6,3})" -f $angle, $px, $py, $p.A, $p.R, $p.G, $p.B)
  }
}

$bmp.Dispose()
