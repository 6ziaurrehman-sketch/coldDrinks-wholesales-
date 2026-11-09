Add-Type -AssemblyName System.Drawing
$files = @(
  'assets/images/android-icon-foreground.png',
  'assets/images/android-icon-background.png',
  'assets/images/icon.png',
  'public/logo.png'
)
foreach ($f in $files) {
  if (Test-Path $f) {
    $bmp = New-Object System.Drawing.Bitmap $f
    Write-Host "==============================="
    Write-Host "File: $f"
    Write-Host "Dimensions: $($bmp.Width) x $($bmp.Height)"
    $tl = $bmp.GetPixel(0, 0)
    $br = $bmp.GetPixel($bmp.Width - 1, $bmp.Height - 1)
    $center = $bmp.GetPixel([int]($bmp.Width / 2), [int]($bmp.Height / 2))
    Write-Host "Top-Left: R=$($tl.R) G=$($tl.G) B=$($tl.B) A=$($tl.A)"
    Write-Host "Bottom-Right: R=$($br.R) G=$($br.G) B=$($br.B) A=$($br.A)"
    Write-Host "Center: R=$($center.R) G=$($center.G) B=$($center.B) A=$($center.A)"
    $bmp.Dispose()
  } else {
    Write-Host "File not found: $f"
  }
}
