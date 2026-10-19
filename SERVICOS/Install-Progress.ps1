$ErrorActionPreference = "Continue"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installer = Join-Path $PSScriptRoot "Install-StartupTasks.ps1"
$logDir = Join-Path $root "LOGS"
$diagnosticLog = Join-Path $logDir "installer-ui.log"
$queue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
$processStarted = $false

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Diagnostic {
  param([string] $Line)

  try {
    Add-Content -LiteralPath $diagnosticLog -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Line) -Encoding UTF8
  } catch {
    # O acompanhamento visual continua mesmo se o arquivo de diagnostico nao puder ser gravado.
  }
}

Write-Diagnostic "Janela de instalacao iniciada. Raiz: $root"

$form = New-Object System.Windows.Forms.Form
$form.Text = "API DANFE - Instalação"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(760, 570)
$form.MinimumSize = New-Object System.Drawing.Size(680, 480)
$form.BackColor = [System.Drawing.Color]::FromArgb(245, 248, 251)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Instalando os serviços da API DANFE"
$title.Location = New-Object System.Drawing.Point(28, 22)
$title.Size = New-Object System.Drawing.Size(690, 34)
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 16)
$title.ForeColor = [System.Drawing.Color]::FromArgb(17, 39, 68)
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Acompanhe abaixo cada etapa. O processo pode demorar durante a instalação das dependências."
$subtitle.Location = New-Object System.Drawing.Point(30, 60)
$subtitle.Size = New-Object System.Drawing.Size(690, 24)
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(78, 96, 117)
$form.Controls.Add($subtitle)

$statusCaption = New-Object System.Windows.Forms.Label
$statusCaption.Text = "STATUS"
$statusCaption.Location = New-Object System.Drawing.Point(30, 104)
$statusCaption.Size = New-Object System.Drawing.Size(100, 20)
$statusCaption.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 8)
$statusCaption.ForeColor = [System.Drawing.Color]::FromArgb(16, 111, 87)
$form.Controls.Add($statusCaption)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Preparando instalação..."
$status.Location = New-Object System.Drawing.Point(30, 124)
$status.Size = New-Object System.Drawing.Size(690, 28)
$status.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11)
$status.ForeColor = [System.Drawing.Color]::FromArgb(17, 39, 68)
$form.Controls.Add($status)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(30, 164)
$progress.Size = New-Object System.Drawing.Size(690, 14)
$progress.Style = "Marquee"
$progress.MarqueeAnimationSpeed = 24
$form.Controls.Add($progress)

$logCaption = New-Object System.Windows.Forms.Label
$logCaption.Text = "ATIVIDADE DO INSTALADOR"
$logCaption.Location = New-Object System.Drawing.Point(30, 202)
$logCaption.Size = New-Object System.Drawing.Size(300, 20)
$logCaption.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 8)
$logCaption.ForeColor = [System.Drawing.Color]::FromArgb(16, 111, 87)
$form.Controls.Add($logCaption)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(30, 226)
$logBox.Size = New-Object System.Drawing.Size(690, 238)
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.BackColor = [System.Drawing.Color]::FromArgb(24, 32, 48)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(232, 241, 249)
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$logBox.BorderStyle = "FixedSingle"
$form.Controls.Add($logBox)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Text = "Aguardando..."
$closeButton.Location = New-Object System.Drawing.Point(590, 486)
$closeButton.Size = New-Object System.Drawing.Size(130, 36)
$closeButton.Enabled = $false
$closeButton.FlatStyle = "Flat"
$closeButton.BackColor = [System.Drawing.Color]::FromArgb(16, 111, 87)
$closeButton.ForeColor = [System.Drawing.Color]::White
$closeButton.Add_Click({ $form.Close() })
$form.Controls.Add($closeButton)

$logsButton = New-Object System.Windows.Forms.Button
$logsButton.Text = "Abrir logs"
$logsButton.Location = New-Object System.Drawing.Point(30, 486)
$logsButton.Size = New-Object System.Drawing.Size(110, 36)
$logsButton.Enabled = $false
$logsButton.FlatStyle = "Flat"
$logsButton.BackColor = [System.Drawing.Color]::White
$logsButton.ForeColor = [System.Drawing.Color]::FromArgb(16, 111, 87)
$logsButton.Add_Click({
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Start-Process explorer.exe -ArgumentList "`"$logDir`""
})
$form.Controls.Add($logsButton)

function Add-LogLine {
  param([string] $Line)

  if ([string]::IsNullOrWhiteSpace($Line)) {
    return
  }

  Write-Diagnostic $Line
  $logBox.AppendText("$Line`r`n")
  $logBox.SelectionStart = $logBox.TextLength
  $logBox.ScrollToCaret()

  if ($Line -match "dependencias") {
    $status.Text = "Instalando e validando dependências..."
  } elseif ($Line -match "servico nativo|WinSW|backend como servico") {
    $status.Text = "Configurando o serviço nativo do backend..."
  } elseif ($Line -match "tarefa|inicializacao|Inicializar") {
    $status.Text = "Configurando a inicialização com o Windows..."
  } elseif ($Line -match "Iniciando agora") {
    $status.Text = "Iniciando backend e painel..."
  } elseif ($Line -match "OK:") {
    $status.Text = "Etapa concluída. Continuando..."
  }
}

if (-not (Test-Path $installer)) {
  Add-LogLine "ERRO: instalador não encontrado: $installer"
  $status.Text = "Falha: arquivo de instalação ausente."
  $status.ForeColor = [System.Drawing.Color]::FromArgb(177, 38, 38)
  $closeButton.Text = "Fechar"
  $closeButton.Enabled = $true
  $form.Add_Shown({ $form.Activate() })
  [void] $form.ShowDialog()
  exit 1
}

$process = New-Object System.Diagnostics.Process
$process.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
$process.StartInfo.FileName = "powershell.exe"
$process.StartInfo.Arguments = "-NoLogo -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File `"$installer`""
$process.StartInfo.WorkingDirectory = $root
$process.StartInfo.UseShellExecute = $false
$process.StartInfo.CreateNoWindow = $true
$process.StartInfo.RedirectStandardOutput = $true
$process.StartInfo.RedirectStandardError = $true

$outputHandler = [System.Diagnostics.DataReceivedEventHandler]{
  param($sender, $event)
  if ($null -ne $event.Data) {
    $queue.Enqueue($event.Data)
  }
}
$errorHandler = [System.Diagnostics.DataReceivedEventHandler]{
  param($sender, $event)
  if ($null -ne $event.Data) {
    $queue.Enqueue("ERRO: " + $event.Data)
  }
}
$process.add_OutputDataReceived($outputHandler)
$process.add_ErrorDataReceived($errorHandler)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
  $line = $null
  while ($queue.TryDequeue([ref] $line)) {
    Add-LogLine $line
  }

  if ($process.HasExited) {
    while ($queue.TryDequeue([ref] $line)) {
      Add-LogLine $line
    }

    $timer.Stop()
    $progress.Style = "Continuous"
    $progress.Value = 100
    $logsButton.Enabled = $true
    if ($process.ExitCode -eq 0) {
      $status.Text = "Instalação concluída com sucesso."
      $status.ForeColor = [System.Drawing.Color]::FromArgb(16, 111, 87)
      Add-LogLine ""
      Add-LogLine "Concluído. Backend e painel foram iniciados."
      $closeButton.Text = "Concluir"
    } else {
      $status.Text = "A instalação terminou com erro."
      $status.ForeColor = [System.Drawing.Color]::FromArgb(177, 38, 38)
      Add-LogLine ""
      Add-LogLine "Consulte a pasta LOGS para ver os detalhes."
      $closeButton.Text = "Fechar"
    }
    $closeButton.Enabled = $true
  }
})

$form.Add_Shown({
  Add-LogLine "Iniciando o instalador administrativo..."
  Add-LogLine "Pasta do sistema: $root"
  Add-LogLine ""
  $form.Activate()
  try {
    [void] $process.Start()
    $processStarted = $true
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()
    $timer.Start()
  } catch {
    Write-Diagnostic ("Falha ao iniciar o processo: " + $_.Exception.Message)
    $timer.Stop()
    $status.Text = "Não foi possível iniciar a instalação."
    $status.ForeColor = [System.Drawing.Color]::FromArgb(177, 38, 38)
    Add-LogLine "ERRO: $($_.Exception.Message)"
    $closeButton.Text = "Fechar"
    $closeButton.Enabled = $true
  }
})

$form.Add_FormClosing({
  if ($processStarted -and $null -ne $process -and -not $process.HasExited) {
    $_.Cancel = $true
    [System.Windows.Forms.MessageBox]::Show(
      "A instalação ainda está em andamento. Aguarde a conclusão para fechar esta janela.",
      "API DANFE",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
  }
})

try {
  [void] $form.ShowDialog()
} catch {
  Write-Diagnostic ("Falha na janela: " + $_.Exception.Message)
  try {
    [System.Windows.Forms.MessageBox]::Show(
      "O instalador encontrou um erro, mas os detalhes foram salvos em:`r`n$diagnosticLog",
      "API DANFE - Instalação",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  } catch {
    # Sem outra janela disponivel para mostrar o erro.
  }
}
