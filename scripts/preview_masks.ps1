Add-Type -AssemblyName System.Drawing

$src = New-Object System.Drawing.Bitmap "assets/images/test_perfect_seamless.png"

# 1. Circle Mask
$circleBmp = New-Object System.Drawing.Bitmap 1024, 1024, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gc = [System.Drawing.Graphics]::FromImage($circleBmp)
$gc.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gc.Clear([System.Drawing.Color]::Transparent)

$cPath = New-Object System.Drawing.Drawing2D.GraphicsPath
# Android circular mask is diameter ~720px centered at (512, 512)
$cPath.AddEllipse(152, 152, 720, 720)
$gc.SetClip($cPath)
$gc.DrawImage($src, 0, 0, 1024, 1024)
$gc.ResetClip()
$gc.Dispose()
$circleBmp.Save("assets/images/preview_circle_mask.png", [System.Drawing.Imaging.ImageFormat]::Png)
$circleBmp.Dispose()

# 2. Squircle Mask (Samsung OneUI ~760px)
$sqBmp = New-Object System.Drawing.Bitmap 1024, 1024, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gsq = [System.Drawing.Graphics]::FromImage($sqBmp)
$gsq.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gsq.Clear([System.Drawing.Color]::Transparent)

$sqPath = New-Object System.Drawing.Drawing2D.GraphicsPath
# Rounded rectangle (x=132, y=132, w=760, h=760, r=220)
$r = 220
$rect = New-Object System.Drawing.Rectangle 132, 132, 760, 760
$sqPath.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
$sqPath.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
$sqPath.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
$sqPath.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
$sqPath.CloseFigure()
$gsq.SetClip($sqPath)
$gsq.DrawImage($src, 0, 0, 1024, 1024)
$gsq.ResetClip()
$gsq.Dispose()
$sqBmp.Save("assets/images/preview_squircle_mask.png", [System.Drawing.Imaging.ImageFormat]::Png)
$sqBmp.Dispose()

$src.Dispose()
Write-Host "Previews generated!"
