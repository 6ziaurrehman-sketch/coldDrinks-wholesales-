Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 'public/logo.png'

# Find edge pixels where Alpha transitions from 0 to 255
Write-Host "Checking border pixels of public/logo.png:"
for ($y = 40; $y -lt 460; $y += 20) {
  for ($x = 40; $x -lt 460; $x++) {
    $p1 = $bmp.GetPixel($x, $y)
    $p0 = $bmp.GetPixel($x - 1, $y)
    if ($p0.A -eq 0 -and $p1.A -gt 0) {
      Write-Host "Left edge at ($x, $y): A=$($p1.A) RGB=($($p1.R), $($p1.G), $($p1.B))"
      break
    }
  }
}
$bmp.Dispose()
