Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 'assets/images/android-icon-background.png'
$semi = 0
$trans = 0
$opaque = 0
for ($x = 0; $x -lt $bmp.Width; $x += 16) {
  for ($y = 0; $y -lt $bmp.Height; $y += 16) {
    $p = $bmp.GetPixel($x, $y)
    if ($p.A -eq 0) { $trans++ }
    elseif ($p.A -lt 255) { $semi++ }
    else { $opaque++ }
  }
}
Write-Host "Transparent samples: $trans, Semi-transparent samples: $semi, Opaque samples: $opaque"

# Also check top border, left border, right border, bottom border
Write-Host "Sample edge pixels:"
Write-Host "Top-center (512, 0):" ($bmp.GetPixel(512, 0))
Write-Host "Left-center (0, 512):" ($bmp.GetPixel(0, 512))
Write-Host "Right-center (1023, 512):" ($bmp.GetPixel(1023, 512))
Write-Host "Bottom-center (512, 1023):" ($bmp.GetPixel(512, 1023))
$bmp.Dispose()
