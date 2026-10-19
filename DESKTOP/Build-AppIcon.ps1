$ErrorActionPreference = 'Stop'

$png = (Resolve-Path (Join-Path $PSScriptRoot 'src-tauri\assets\tray-icon.png')).Path
$ico = (Resolve-Path (Join-Path $PSScriptRoot 'src-tauri\icons\icon.ico')).Path

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::new($png)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()

try {
    foreach ($size in $sizes) {
        $bitmap = [System.Drawing.Bitmap]::new(
            $size,
            $size,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($source, 0, 0, $size, $size)
        $graphics.Dispose()

        $stream = [System.IO.MemoryStream]::new()
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $images += ,@($size, $stream.ToArray())
        $stream.Dispose()
        $bitmap.Dispose()
    }

    $source.Dispose()
    $output = [System.IO.File]::Open($ico, [System.IO.FileMode]::Create)
    $writer = [System.IO.BinaryWriter]::new($output)
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)

    $offset = 6 + (16 * $images.Count)
    foreach ($item in $images) {
        $size = [int]$item[0]
        $bytes = [byte[]]$item[1]
        $dimension = if ($size -eq 256) { [byte]0 } else { [byte]$size }
        $writer.Write($dimension)
        $writer.Write($dimension)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$bytes.Length)
        $writer.Write([uint32]$offset)
        $offset += $bytes.Length
    }

    foreach ($item in $images) {
        $writer.Write([byte[]]$item[1])
    }

    $writer.Flush()
    $writer.Dispose()
    $output.Dispose()
}
finally {
    if ($source) {
        try { $source.Dispose() } catch {}
    }
}

Write-Host "Icone gerado em: $ico"
