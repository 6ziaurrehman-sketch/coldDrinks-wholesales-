Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap "assets/images/android-icon-foreground.png"
Write-Host "Foreground Size:" $bmp.Width "x" $bmp.Height
$c = $bmp.GetPixel(10, 10)
Write-Host ("Corner (10,10): Alpha=" + $c.A + " Hex: #{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B)

# Check bounding box of non-transparent pixels
$minX = $bmp.Width; $maxX = 0; $minY = $bmp.Height; $maxY = 0
for ($y = 0; $y -lt $bmp.Height; $y += 10) {
    for ($x = 0; $x -lt $bmp.Width; $x += 10) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 10) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Host ("Non-transparent bounding box: X=[$minX, $maxX] Y=[$minY, $maxY] Width=" + ($maxX - $minX) + " Height=" + ($maxY - $minY))
$bmp.Dispose()
