Add-Type -AssemblyName System.Drawing
$ink = [System.Drawing.ColorTranslator]::FromHtml('#163f45')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#d9efb0')
function New-BrandImage([int]$width, [int]$height, [int]$size, [bool]$foreground = $false, [bool]$splash = $false) {
    $bitmap = [System.Drawing.Bitmap]::new($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear($(if ($splash) { [System.Drawing.Color]::White } else { [System.Drawing.Color]::Transparent }))
    $left = ($width - $size) / 2; $top = ($height - $size) / 2
    if (-not $foreground) {
        $shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
        $radius = $size / 3
        $shape.AddArc($left, $top, $radius, $radius, 180, 90)
        $shape.AddArc($left + $size - $radius, $top, $radius, $radius, 270, 90)
        $shape.AddArc($left + $size - $radius, $top + $size - $radius, $radius, $radius, 0, 90)
        $shape.AddArc($left, $top + $size - $radius, $radius, $radius, 90, 90)
        $shape.CloseFigure()
        $brush = [System.Drawing.SolidBrush]::new($ink)
        $graphics.FillPath($brush, $shape); $brush.Dispose(); $shape.Dispose()
    }
    $glyph = $size * 0.72
    $graphics.TranslateTransform(($width - $glyph) / 2, ($height - $glyph) / 2)
    $graphics.ScaleTransform($glyph / 24, $glyph / 24)
    $pen = [System.Drawing.Pen]::new($accent, 1.7)
    $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $route = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $route.AddLine(6, 4, 6, 16); $route.AddArc(6, 12, 8, 8, 180, -180); $route.AddLine(14, 16, 14, 8)
    $graphics.DrawPath($pen, $route)
    $graphics.DrawLines($pen, [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(10,8), [System.Drawing.PointF]::new(14,4), [System.Drawing.PointF]::new(18,8)))
    $graphics.DrawLine($pen, 3, 4, 9, 4)
    $pen.Dispose(); $route.Dispose(); $graphics.Dispose()
    return $bitmap
}
foreach ($size in @(192,512)) {
    $image = New-BrandImage $size $size $size
    $image.Save("public/icons/icon-$size.png", [System.Drawing.Imaging.ImageFormat]::Png); $image.Dispose()
}
$densities = @{ mdpi=48; hdpi=72; xhdpi=96; xxhdpi=144; xxxhdpi=192 }
foreach ($density in $densities.Keys) {
    $size = $densities[$density]; $dir = "android/app/src/main/res/mipmap-$density"
    $image = New-BrandImage $size $size $size
    foreach ($name in @('ic_launcher','ic_launcher_round')) { $image.Save("$dir/$name.png", [System.Drawing.Imaging.ImageFormat]::Png) }; $image.Dispose()
    $canvas = [int]($size * 108 / 48)
    $image = New-BrandImage $canvas $canvas ([int]($canvas * 0.65)) $true
    $image.Save("$dir/ic_launcher_foreground.png", [System.Drawing.Imaging.ImageFormat]::Png); $image.Dispose()
}
Get-ChildItem -Path 'android/app/src/main/res' -Filter splash.png -Recurse | ForEach-Object {
    $old = [System.Drawing.Image]::FromFile($_.FullName); $width=$old.Width; $height=$old.Height; $old.Dispose()
    $image = New-BrandImage $width $height ([int]([Math]::Min($width,$height) * 0.25)) $false $true
    $image.Save($_.FullName, [System.Drawing.Imaging.ImageFormat]::Png); $image.Dispose()
}
$sizes = @(16,32,48,64,128,256); $pngs = @()
foreach ($size in $sizes) {
    $image = New-BrandImage $size $size $size; $stream = [System.IO.MemoryStream]::new()
    $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png); $pngs += ,$stream.ToArray(); $stream.Dispose(); $image.Dispose()
}
$stream = [System.IO.File]::Create((Join-Path (Get-Location) 'public/icons/icon.ico')); $writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count); $offset=6+16*$sizes.Count
for ($i=0;$i -lt $sizes.Count;$i++) {
    $dimension=$(if ($sizes[$i] -eq 256) {0} else {$sizes[$i]})
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$pngs[$i].Length); $writer.Write([uint32]$offset); $offset+=$pngs[$i].Length
}
foreach ($png in $pngs) { $writer.Write([byte[]]$png) }; $writer.Dispose()
