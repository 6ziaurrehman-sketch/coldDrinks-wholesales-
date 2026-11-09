Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap "public/logo.png"

# Count most frequent colors (or average color of the emblem)
$colors = @{}
for ($y = 50; $y -lt 450; $y += 5) {
    for ($x = 50; $x -lt 450; $x += 5) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 200) {
            $hex = "#{0:X2}{1:X2}{2:X2}" -f $p.R, $p.G, $p.B
            if ($colors.ContainsKey($hex)) {
                $colors[$hex]++
            } else {
                $colors[$hex] = 1
            }
        }
    }
}

# Print top 10 colors
$colors.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10 | ForEach-Object {
    Write-Host $_.Key "Count:" $_.Value
}

$bmp.Dispose()
