Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 'public/logo.png'

# Find edge pixels around the emblem
$edgeColors = @()
for ($angle = 0; $angle -lt 360; $angle += 30) {
    $rad = $angle * [Math]::PI / 180.0
    # Search from outside towards center
    for ($r = 240; $r -ge 100; $r -= 2) {
        $x = [int](250 + $r * [Math]::Cos($rad))
        $y = [int](250 + $r * [Math]::Sin($rad))
        if ($x -ge 0 -and $x -lt $bmp.Width -and $y -ge 0 -and $y -lt $bmp.Height) {
            $p = $bmp.GetPixel($x, $y)
            if ($p.A -gt 150) {
                $hex = "#{0:X2}{1:X2}{2:X2}" -f $p.R, $p.G, $p.B
                Write-Host "Angle $angle deg: ($x, $y) Alpha=$($p.A) Hex=$hex"
                break
            }
        }
    }
}
$bmp.Dispose()
