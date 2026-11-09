Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap "assets/images/android-icon-background.png"
Write-Host "Size:" $bmp.Width "x" $bmp.Height
$c = $bmp.GetPixel(10, 10)
Write-Host ("Pixel (10,10): " + $c.ToString() + (" Hex: #{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B))
$cMid = $bmp.GetPixel([int]($bmp.Width/2), [int]($bmp.Height/2))
Write-Host ("Pixel Center: " + $cMid.ToString() + (" Hex: #{0:X2}{1:X2}{2:X2}" -f $cMid.R, $cMid.G, $cMid.B))
$bmp.Dispose()
