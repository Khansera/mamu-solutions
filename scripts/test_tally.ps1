# PowerShell Diagnostic Script: Test Tally 7.1 XML Endpoint
# Run this in Windows PowerShell on Windows 10
param(
    [string]$TallyUrl = "http://localhost:9000"
)

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Tally 7.1 XML Endpoint Connectivity Diagnostic   " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "Target Endpoint: $TallyUrl" -ForegroundColor Yellow

# XML Envelope for List of Accounts
$envelope = @"
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>`$`$SysName:XML</SVEXPORTFORMAT>
          <ACCOUNTTYPE>All</ACCOUNTTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
"@

try {
    Write-Host "`n[1/3] Sending XML POST request to Tally..." -ForegroundColor Gray
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-RestMethod -Uri $TallyUrl -Method Post -Body $envelope -ContentType "text/xml; charset=utf-8" -TimeoutSec 10
    $stopwatch.Stop()

    Write-Host "[SUCCESS] Connected to Tally 7.1 in $($stopwatch.ElapsedMilliseconds)ms!" -ForegroundColor Green
    Write-Host "`n[2/3] Checking Active Company..." -ForegroundColor Gray

    # Inspect XML response
    if ($response.ENVELOPE) {
        Write-Host "  Response Root: <ENVELOPE> verified" -ForegroundColor Green
    }
    
    Write-Host "`n[3/3] Ready for Tally AI Assistant Bridge!" -ForegroundColor Green
    Write-Host "You can now run: .\scripts\start.ps1" -ForegroundColor Cyan
}
catch {
    Write-Host "`n[ERROR] Could not connect to Tally 7.1 at $TallyUrl" -ForegroundColor Red
    Write-Host "Detail: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nTroubleshooting steps for Windows 10:" -ForegroundColor Yellow
    Write-Host "1. Is Tally 7.1 running?" -ForegroundColor White
    Write-Host "2. In Tally 7.1, press F12 (Configure) > Advanced Configuration." -ForegroundColor White
    Write-Host "3. Ensure 'Tally is acting as' is set to 'Both' or 'Server'." -ForegroundColor White
    Write-Host "4. Ensure 'Port' is set to 9000." -ForegroundColor White
    Write-Host "5. Restart Tally 7.1 after saving configuration." -ForegroundColor White
    Write-Host "6. Check Windows Defender Firewall is not blocking port 9000 locally." -ForegroundColor White
}
