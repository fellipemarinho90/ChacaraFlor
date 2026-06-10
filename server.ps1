$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $Root "data"
$DbPath = Join-Path $DataDir "reservations.json"
$SettingsPath = Join-Path $DataDir "settings.json"
$Port = if ($env:PORT) { [int]$env:PORT } else { 4173 }
$Statuses = @("orcamento", "pre-reserva", "reservado", "pago", "cancelado")

function Get-DateKey($Date) {
  return $Date.ToString("yyyy-MM-dd")
}

function Initialize-Database {
  if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir | Out-Null
  }

  if (-not (Test-Path $DbPath)) {
    $sampleDate = (Get-Date).AddDays(5)
    $sample = @(
      [ordered]@{
        id = [guid]::NewGuid().ToString()
        clientName = "Exemplo de reserva"
        phone = "(00) 00000-0000"
        eventDate = Get-DateKey $sampleDate
        endDate = Get-DateKey $sampleDate
        eventType = "Aniversario"
        status = "pre-reserva"
        totalValue = 2500
        depositValue = 500
        payments = @()
        notes = "Registro de exemplo. Pode editar ou excluir."
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
        updatedAt = (Get-Date).ToUniversalTime().ToString("o")
      }
    )
    Save-Reservations $sample
  }

  if (-not (Test-Path $SettingsPath)) {
    Save-Settings ([ordered]@{
      employeeRate = 260
    })
  }
}

function Get-Reservations {
  $text = Get-Content -Raw -Path $DbPath -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ,@()
  }

  $items = $text | ConvertFrom-Json
  if ($null -eq $items) {
    return ,@()
  }

  return @(Convert-ToFlatList $items)
}

function Convert-ToFlatList($Items) {
  $list = @()

  foreach ($item in @($Items)) {
    if ($item -is [System.Array]) {
      $list += Convert-ToFlatList $item
    } else {
      $list += $item
    }
  }

  return $list
}

function Save-Reservations($Reservations) {
  $tmpPath = "$DbPath.tmp"
  $flatReservations = @(Convert-ToFlatList $Reservations)
  $json = ConvertTo-Json -InputObject $flatReservations -Depth 8
  [System.IO.File]::WriteAllText($tmpPath, $json, [System.Text.Encoding]::UTF8)
  if (Test-Path $DbPath) {
    Remove-Item -LiteralPath $DbPath -Force
  }
  Move-Item -LiteralPath $tmpPath -Destination $DbPath
}

function Get-Settings {
  $text = Get-Content -Raw -Path $SettingsPath -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($text)) {
    return [ordered]@{ employeeRate = 260 }
  }

  return $text | ConvertFrom-Json
}

function Save-Settings($Settings) {
  $tmpPath = "$SettingsPath.tmp"
  $json = ConvertTo-Json -InputObject $Settings -Depth 4
  [System.IO.File]::WriteAllText($tmpPath, $json, [System.Text.Encoding]::UTF8)
  if (Test-Path $SettingsPath) {
    Remove-Item -LiteralPath $SettingsPath -Force
  }
  Move-Item -LiteralPath $tmpPath -Destination $SettingsPath
}

function New-ApiError($Message, $StatusCode = 400) {
  $errorRecord = [System.Exception]::new($Message)
  $errorRecord.Data["StatusCode"] = $StatusCode
  throw $errorRecord
}

function Get-SanitizedReservation($InputData) {
  $clientName = [string]$InputData.clientName
  $cpf = [string]$InputData.cpf
  $eventDate = [string]$InputData.eventDate
  $endDate = if ([string]::IsNullOrWhiteSpace([string]$InputData.endDate)) { $eventDate } else { [string]$InputData.endDate }
  $status = [string]$InputData.status
  $totalValue = 0
  $depositValue = 0
  $email = [string]$InputData.email
  $payments = @()

  if ($null -ne $InputData.totalValue -and $InputData.totalValue -ne "") {
    $totalValue = [decimal]$InputData.totalValue
  }

  if ($null -ne $InputData.depositValue -and $InputData.depositValue -ne "") {
    $depositValue = [decimal]$InputData.depositValue
  }

  if ([string]::IsNullOrWhiteSpace($clientName)) {
    New-ApiError "Informe o nome do cliente."
  }

  if ($eventDate -notmatch "^\d{4}-\d{2}-\d{2}$") {
    New-ApiError "Informe uma data valida."
  }

  if ($endDate -notmatch "^\d{4}-\d{2}-\d{2}$") {
    New-ApiError "Informe uma data final valida."
  }

  if ($endDate -lt $eventDate) {
    New-ApiError "A data final nao pode ser antes da data inicial."
  }

  if ($Statuses -notcontains $status) {
    New-ApiError "Status invalido."
  }

  if ($null -ne $InputData.payments) {
    foreach ($payment in @($InputData.payments)) {
      $paymentDate = [string]$payment.date
      $paymentValue = 0
      $paymentStatus = [string]$payment.status

      if ([string]::IsNullOrWhiteSpace($paymentStatus)) {
        $paymentStatus = "pendente"
      }

      if ($paymentDate -notmatch "^\d{4}-\d{2}-\d{2}$") {
        New-ApiError "Informe uma data valida para cada pagamento."
      }

      if ($paymentStatus -notin @("pendente", "pago")) {
        New-ApiError "Status de pagamento invalido."
      }

      if ($null -ne $payment.value -and $payment.value -ne "") {
        $paymentValue = [decimal]$payment.value
      }

      $payments += [ordered]@{
        date = $paymentDate
        value = $paymentValue
        status = $paymentStatus
      }
    }
  }

  return [ordered]@{
    clientName = $clientName.Trim()
    cpf = $cpf.Trim()
    email = $email.Trim()
    phone = ([string]$InputData.phone).Trim()
    eventDate = $eventDate.Trim()
    endDate = $endDate.Trim()
    eventType = ([string]$InputData.eventType).Trim()
    status = $status.Trim()
    totalValue = $totalValue
    depositValue = $depositValue
    payments = @($payments)
    notes = ([string]$InputData.notes).Trim()
  }
}

function Find-Conflict($Reservations, $InputData, $Id) {
  foreach ($reservation in $Reservations) {
    $reservationStart = [string]$reservation.eventDate
    $reservationEnd = if ([string]::IsNullOrWhiteSpace([string]$reservation.endDate)) { $reservationStart } else { [string]$reservation.endDate }
    $overlaps = $reservationStart -le $InputData.endDate -and $InputData.eventDate -le $reservationEnd
    $differentRecord = $reservation.id -ne $Id
    $blocksDate = @("cancelado", "orcamento") -notcontains $reservation.status
    $newRecordBlocksDate = @("cancelado", "orcamento") -notcontains $InputData.status

    if ($overlaps -and $differentRecord -and $blocksDate -and $newRecordBlocksDate) {
      return $reservation
    }
  }

  return $null
}

function Get-ContentType($Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".png" { return "image/png" }
    default { return "application/octet-stream" }
  }
}

function Send-Response($Stream, $StatusCode, $ContentType, [byte[]]$Body) {
  $reason = switch ($StatusCode) {
    200 { "OK" }
    201 { "Created" }
    400 { "Bad Request" }
    403 { "Forbidden" }
    404 { "Not Found" }
    405 { "Method Not Allowed" }
    409 { "Conflict" }
    500 { "Internal Server Error" }
    default { "OK" }
  }

  $header = "HTTP/1.1 $StatusCode $reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

function Send-Json($Stream, $StatusCode, $Data) {
  $json = ConvertTo-Json -InputObject $Data -Depth 8
  Send-Response $Stream $StatusCode "application/json; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes($json))
}

function Read-HttpRequest($Stream) {
  $buffer = New-Object byte[] 65536
  $memory = New-Object System.IO.MemoryStream
  $headerEnd = -1

  do {
    $read = $Stream.Read($buffer, 0, $buffer.Length)
    if ($read -le 0) {
      break
    }

    $memory.Write($buffer, 0, $read)
    $text = [System.Text.Encoding]::UTF8.GetString($memory.ToArray())
    $headerEnd = $text.IndexOf("`r`n`r`n")
  } while ($headerEnd -lt 0)

  $bytes = $memory.ToArray()
  $requestText = [System.Text.Encoding]::UTF8.GetString($bytes)
  $headerText = $requestText.Substring(0, $headerEnd)
  $lines = $headerText -split "`r`n"
  $requestLine = $lines[0] -split " "
  $headers = @{}

  foreach ($line in $lines[1..($lines.Length - 1)]) {
    $separator = $line.IndexOf(":")
    if ($separator -gt 0) {
      $name = $line.Substring(0, $separator).Trim().ToLowerInvariant()
      $value = $line.Substring($separator + 1).Trim()
      $headers[$name] = $value
    }
  }

  $bodyStart = $headerEnd + 4
  $contentLength = 0
  if ($headers.ContainsKey("content-length")) {
    $contentLength = [int]$headers["content-length"]
  }

  while (($bytes.Length - $bodyStart) -lt $contentLength) {
    $read = $Stream.Read($buffer, 0, $buffer.Length)
    if ($read -le 0) {
      break
    }
    $memory.Write($buffer, 0, $read)
    $bytes = $memory.ToArray()
  }

  $body = ""
  if ($contentLength -gt 0) {
    $body = [System.Text.Encoding]::UTF8.GetString($bytes, $bodyStart, $contentLength)
  }

  return @{
    Method = $requestLine[0]
    Path = [System.Uri]::UnescapeDataString(($requestLine[1] -split "\?")[0])
    Body = $body
  }
}

function Handle-ApiRequest($Stream, $Request) {
  $parts = @($Request.Path.Split("/", [System.StringSplitOptions]::RemoveEmptyEntries))
  $id = if ($parts.Length -ge 3) { $parts[2] } else { $null }

  if ($Request.Method -eq "GET" -and $null -eq $id) {
    Send-Json $Stream 200 (@(Get-Reservations))
    return
  }

   if ($Request.Method -eq "POST" -and $parts.Length -eq 4 -and $parts[3] -eq "contract") {
     $reservations = @(Get-Reservations)
     $target = $reservations | Where-Object { $_.id -eq $id } | Select-Object -First 1
     if ($null -eq $target) {
       Send-Json $Stream 404 @{ message = "Reserva nao encontrada." }
       return
     }
     try {
       $contractPath = Generate-Contract -Reservation $target
       if ($contractPath) {
         Send-Json $Stream 200 @{ contractPath = $contractPath; message = "Contrato gerado com sucesso." }
       } else {
         Send-Json $Stream 500 @{ message = "Falha ao gerar contrato." }
       }
     } catch {
       Send-Json $Stream 500 @{ message = "Erro ao gerar contrato: $($_.Exception.Message)" }
     }
     return
   }

   if ($Request.Method -eq "POST" -and $null -eq $id) {
    $inputData = $Request.Body | ConvertFrom-Json
    $clean = Get-SanitizedReservation $inputData
    $reservations = @(Get-Reservations)
    $conflict = Find-Conflict $reservations $clean $null

    if ($null -ne $conflict) {
      Send-Json $Stream 409 @{ message = "A data ja esta bloqueada por $($conflict.clientName)." }
      return
    }

      $reservation = [ordered]@{
        id = [guid]::NewGuid().ToString()
        clientName = $clean.clientName
        cpf = $clean.cpf
        email = $clean.email
        phone = $clean.phone
        eventDate = $clean.eventDate
        endDate = $clean.endDate
        eventType = $clean.eventType
        status = $clean.status
        totalValue = $clean.totalValue
        depositValue = $clean.depositValue
        payments = $clean.payments
        notes = $clean.notes
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
        updatedAt = (Get-Date).ToUniversalTime().ToString("o")
      }

      Save-Reservations (@($reservations) + $reservation)
      Send-Json $Stream 201 $reservation
     return
  }

  if ($Request.Method -eq "PUT" -and $null -ne $id) {
    $inputData = $Request.Body | ConvertFrom-Json
    $clean = Get-SanitizedReservation $inputData
    $reservations = @(Get-Reservations)
    $index = -1

    for ($i = 0; $i -lt $reservations.Length; $i++) {
      if ($reservations[$i].id -eq $id) {
        $index = $i
        break
      }
    }

    if ($index -lt 0) {
      Send-Json $Stream 404 @{ message = "Reserva nao encontrada." }
      return
    }

    $conflict = Find-Conflict $reservations $clean $id
    if ($null -ne $conflict) {
      Send-Json $Stream 409 @{ message = "A data ja esta bloqueada por $($conflict.clientName)." }
      return
    }

      $reservation = [ordered]@{
        id = $id
        clientName = $clean.clientName
        cpf = $clean.cpf
        email = $clean.email
        phone = $clean.phone
        eventDate = $clean.eventDate
        endDate = $clean.endDate
        eventType = $clean.eventType
        status = $clean.status
        totalValue = $clean.totalValue
        depositValue = $clean.depositValue
        payments = $clean.payments
        notes = $clean.notes
        createdAt = $reservations[$index].createdAt
        updatedAt = (Get-Date).ToUniversalTime().ToString("o")
      }

      $reservations[$index] = [pscustomobject]$reservation
      Save-Reservations $reservations
      Send-Json $Stream 200 $reservation
    return
  }

  if ($Request.Method -eq "DELETE" -and $null -ne $id) {
    $reservations = @(Get-Reservations)
    $nextReservations = @($reservations | Where-Object { $_.id -ne $id })

    if ($nextReservations.Length -eq $reservations.Length) {
      Send-Json $Stream 404 @{ message = "Reserva nao encontrada." }
      return
    }

    Save-Reservations $nextReservations
    Send-Json $Stream 200 @{ ok = $true }
    return
  }

  Send-Json $Stream 405 @{ message = "Metodo nao permitido." }
}

function Handle-SettingsApi($Stream, $Request) {
  if ($Request.Method -eq "GET") {
    Send-Json $Stream 200 (Get-Settings)
    return
  }

  if ($Request.Method -eq "PUT") {
    $inputData = $Request.Body | ConvertFrom-Json
    $employeeRate = 0

    if ($null -ne $inputData.employeeRate -and $inputData.employeeRate -ne "") {
      $employeeRate = [decimal]$inputData.employeeRate
    }

    if ($employeeRate -lt 0) {
      New-ApiError "O valor do funcionario nao pode ser negativo."
    }

    $settings = [ordered]@{
      employeeRate = $employeeRate
    }
    Save-Settings $settings
    Send-Json $Stream 200 $settings
    return
  }

  Send-Json $Stream 405 @{ message = "Metodo nao permitido." }
}

function Handle-AvailabilityApi($Stream, $Request) {
  if ($Request.Method -ne "GET") {
    Send-Json $Stream 405 @{ message = "Metodo nao permitido." }
    return
  }

  $reservations = @(Get-Reservations)
  $filtered = $reservations | Where-Object { @("cancelado", "orcamento") -notcontains $_.status }

  $blockedSet = @{}
  foreach ($r in $filtered) {
    $d = [datetime]::ParseExact($r.eventDate, "yyyy-MM-dd", $null)
    $end = if ([string]::IsNullOrWhiteSpace($r.endDate)) { $r.eventDate } else { $r.endDate }
    $e = [datetime]::ParseExact($end, "yyyy-MM-dd", $null)
    while ($d -le $e) {
      $key = Get-DateKey $d
      if (-not $blockedSet.ContainsKey($key)) { $blockedSet[$key] = @() }
      if ($blockedSet[$key].Count -lt 2) { $blockedSet[$key] += $r.clientName }
      $d = $d.AddDays(1)
    }
  }

  $blockedDates = @($blockedSet.Keys | Sort-Object)
  $reservationsList = $filtered | ForEach-Object {
    [ordered]@{
      clientName = $_.clientName
      eventDate = $_.eventDate
      endDate = if ([string]::IsNullOrWhiteSpace($_.endDate)) { $_.eventDate } else { $_.endDate }
      status = $_.status
    }
  }

  Send-Json $Stream 200 @{
    period = [ordered]@{ start = "1900-01-01"; end = "2100-12-31" }
    blockedDates = $blockedDates
    reservations = @($reservationsList)
  }
}

function Handle-StaticRequest($Stream, $Request) {
  $relativePath = if ($Request.Path -eq "/") { "index.html" } else { $Request.Path.TrimStart("/") }
  $filePath = [System.IO.Path]::GetFullPath((Join-Path $Root $relativePath))
  $rootPath = [System.IO.Path]::GetFullPath($Root)

  if (-not $filePath.StartsWith($rootPath)) {
    Send-Response $Stream 403 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Forbidden"))
    return
  }

  if (-not (Test-Path $filePath -PathType Leaf)) {
    Send-Response $Stream 404 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Arquivo nao encontrado."))
    return
  }

  $body = [System.IO.File]::ReadAllBytes($filePath)
  Send-Response $Stream 200 (Get-ContentType $filePath) $body
}

function Generate-Contract($Reservation) {
   try {
        $templatePath = Join-Path $Root "CONTRATO DE LOCAÇAO MODELO.docx"
        if (-not (Test-Path $templatePath)) {
            Write-Warning "Modelo de contrato DOCX não encontrado em $templatePath"
            return $null
        }
       
       $totalValue = [decimal]$Reservation.totalValue
       
       $reservationDate = [datetime]::ParseExact($Reservation.eventDate, "yyyy-MM-dd", $null)
       $dateExtenso = $reservationDate.ToString("d 'de' MMMM 'de' yyyy", [Globalization.CultureInfo]::new("pt-BR"))
       $dayOfWeek = $reservationDate.ToString("dddd", [Globalization.CultureInfo]::new("pt-BR"))
       
       function NumberToWordsPTBR([decimal]$number) {
           $integerPart = [math]::Floor($number)
           $decimalPart = [math]::Round(($number - $integerPart) * 100)
           $units = @("", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
                      "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove")
           $tens = @("", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa")
           $hundreds = @("", "cem", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos")
           function ConvertHundreds([int]$num) {
               if ($num -eq 0) { return "" }
               if ($num -eq 100) { return "cem" }
               $result = ""
               if ($num -ge 100) { $result += $hundreds[$([math]::Floor($num/100))]; $num %= 100; if ($num -gt 0) { $result += " e " } }
               if ($num -lt 20) { $result += $units[$num] } elseif ($num -lt 100) { $result += $tens[$([math]::Floor($num/10))]; if (($num % 10) -gt 0) { $result += " e " + $units[$num % 10] } }
               return $result
           }
           if ($integerPart -eq 0) { $result = "zero" } else {
               $parts = @()
               if ($integerPart -ge 1000000) { $millions = [math]::Floor($integerPart/1000000); if ($millions -eq 1) { $parts += "um milhão" } else { $parts += (NumberToWordsPTBR $millions) + " milhões" }; $integerPart %= 1000000 }
               if ($integerPart -ge 1000) { $thousands = [math]::Floor($integerPart/1000); if ($thousands -eq 1) { $parts += "mil" } else { $parts += (NumberToWordsPTBR $thousands) + " mil" }; $integerPart %= 1000 }
               if ($integerPart -gt 0) { $parts += (ConvertHundreds $integerPart) }
               $result = $parts -join " e "
           }
           if ($decimalPart -gt 0) { $decimalWords = if ($decimalPart -eq 1) { "centavo" } else { "centavos" }; $result += " e " + (NumberToWordsPTBR $decimalPart) + " $decimalWords" }
           return $result
       }
       
       $totalValueExtenso = NumberToWordsPTBR $totalValue
       
       $parcelasDesc = ""
       $payments = @($Reservation.payments)
       if ($payments.Count -gt 0) {
           $descParts = @()
           $firstPayment = $payments[0]
           $firstVal = [decimal]$firstPayment.value
           $descParts += "1ª parcela de R$ {0:N2} no ato da assinatura do contrato" -f $firstVal
           for ($i = 1; $i -lt $payments.Count; $i++) {
               $p = $payments[$i]
               $pVal = [decimal]$p.value
               if ([string]::IsNullOrWhiteSpace($p.date)) {
                   $descParts += "$($i+1)ª parcela de R$ {0:N2}" -f $pVal
               } else {
                   $pDate = [datetime]::ParseExact($p.date, "yyyy-MM-dd", $null)
                   $pDateStr = $pDate.ToString("dd/MM/yyyy")
                   $descParts += "$($i+1)ª parcela de R$ {0:N2} com vencimento em $pDateStr" -f $pVal
               }
           }
            $parcelasDesc = ($descParts | ForEach-Object { "- $_" }) -join "`r`n"
        } else {
            $parcelasDesc = "- Pagamento único de R$ {0:N2} no ato da assinatura do contrato" -f $totalValue
        }
       
        $contractsDir = Join-Path $Root "data\contratos"
       if (-not (Test-Path $contractsDir)) { New-Item -ItemType Directory -Path $contractsDir | Out-Null }
       
       $safeClientName = $Reservation.clientName -replace "[\\/:*?""<>|]", "_"
       $contractFilename = "CONTRATO DE LOCAÇAO CHÁCARA - $safeClientName.docx"
       [string]$contractFilePath = Join-Path $contractsDir $contractFilename
       
       Copy-Item -LiteralPath $templatePath -Destination $contractFilePath -Force
       
        $replacements = @{
           "{NOMECLIENTE}" = $Reservation.clientName
           "{CPFCLIENTE}" = $Reservation.cpf
           "{DATARESERVAEXTENSO}" = $dateExtenso
           "{DIASEMANA}" = $dayOfWeek
           "{VALORTOTAL}" = ("{0:N2}" -f $totalValue)
           "{VALORTOTALEXTENSO}" = $totalValueExtenso
           "{PARCELAS}" = $parcelasDesc
       }
       
       $word = New-Object -ComObject Word.Application
       $word.Visible = $false
       $word.DisplayAlerts = 0
       $doc = $word.Documents.Open($contractFilePath)
       
        foreach ($key in $replacements.Keys) {
            $replacement = [string]$replacements[$key]
            $range = $doc.Range()
            $range.Find.ClearFormatting()
            $range.Find.Replacement.ClearFormatting()
            $null = $range.Find.Execute([ref] $key, [ref] $false, [ref] $false, [ref] $false, [ref] $false, [ref] $false, [ref] $true, [ref] 1, [ref] $false, [ref] $replacement, [ref] 2)
        }
       
       $doc.Save()
       $doc.Close()
       $word.Quit()
       [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
       [GC]::Collect()
       [GC]::WaitForPendingFinalizers()
       
       return $contractFilePath
    } catch {
        $errMsg = "Erro ao gerar contrato: $_"
        Write-Error $errMsg
        $errMsg | Out-File -FilePath (Join-Path $Root "contrato_error.log") -Encoding UTF8 -Append
        if ($word) { try { if ($doc) { $doc.Close() } } catch {}; try { $word.Quit() } catch {}; [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null }
        return $null
    }
}

function Get-LocalAddresses {
   [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
     ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
     Where-Object { $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and -not [System.Net.IPAddress]::IsLoopback($_.Address) } |
     ForEach-Object { $_.Address.ToString() }
 }

Initialize-Database

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()

Write-Host "Sistema Flor do Cerrado rodando."
Write-Host "Neste computador: http://localhost:$Port"
foreach ($address in Get-LocalAddresses) {
  Write-Host "Na mesma rede: http://$address`:$Port"
}
Write-Host ""
Write-Host "Mantenha esta janela aberta. Pressione Ctrl+C para parar."

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $request = Read-HttpRequest $stream

    if ($request.Path -eq "/disponibilidade") {
      $request.Path = "/api/availability"
      Handle-AvailabilityApi $stream $request
    } elseif ($request.Path.StartsWith("/api/availability")) {
      Handle-AvailabilityApi $stream $request
    } elseif ($request.Path.StartsWith("/api/settings")) {
      Handle-SettingsApi $stream $request
    } elseif ($request.Path.StartsWith("/api/reservations")) {
      Handle-ApiRequest $stream $request
    } else {
      Handle-StaticRequest $stream $request
    }
  } catch {
    try {
      $statusCode = if ($_.Exception.Data.Contains("StatusCode")) { [int]$_.Exception.Data["StatusCode"] } else { 500 }
      Send-Json $stream $statusCode @{ message = $_.Exception.Message }
    } catch {
      # Conexao ja fechada pelo cliente, ignora
    }
  } finally {
    try { $client.Close() } catch { }
  }
}
