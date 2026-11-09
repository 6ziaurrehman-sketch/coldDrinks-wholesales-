Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap "public/logo.png"
Write-Host "Logo Size:" $bmp.Width "x" $bmp.Height

# Check bounding box in public/logo.png
$minX = $bmp.Width; $maxX = 0; $minY = $bmp.Height; $maxY = 0
for ($y = 0; $y -lt $bmp.Height; $y += 5) {
    for ($x = 0; $x -lt $bmp.Width; $x += 5) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 10) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Host ("Non-transparent bounding box in public/logo.png: X=[$minX, $maxX] Y=[$minY, $maxY] Width=" + ($maxX - $minX) + " Height=" + ($maxY - $minY))
$bmp.Dispose()
