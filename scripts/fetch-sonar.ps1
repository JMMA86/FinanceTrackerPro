# Fetch SonarQube Issues Script
# Alternative to curl for Windows environments

param(
    [string]$ProjectKey = "financetrackerpro",
    [string]$SonarUrl = "http://localhost:9000",
    [string]$OutputFile = ".opencode/sonar-issues.json",
    [string[]]$Severities = @("BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"),
    [switch]$IncludeHotspots = $true,
    [string]$Token = $env:SONAR_TOKEN
)

Write-Host "Checking SonarQube server..." -ForegroundColor Cyan

# Prepare headers for authentication
$headers = @{}
if ($Token) {
    # SonarQube uses Basic Auth with token as username and empty password
    $base64Token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Token}:"))
    $headers["Authorization"] = "Basic $base64Token"
    Write-Host "Using authentication token" -ForegroundColor Gray
}

# Check if SonarQube is running
try {
    $statusUrl = "$SonarUrl/api/system/status"
    $status = Invoke-RestMethod -Uri $statusUrl -Method Get -ErrorAction Stop -TimeoutSec 5
    Write-Host "OK SonarQube is running (status: $($status.status))" -ForegroundColor Green
}
catch {
    Write-Host "ERROR SonarQube server not reachable at $SonarUrl" -ForegroundColor Red
    Write-Host "Make sure SonarQube is running" -ForegroundColor Yellow
    exit 1
}

# Build API URL
$severitiesParam = $Severities -join ","
$apiUrl = "$SonarUrl/api/issues/search"
$queryParams = @{
    componentKeys = $ProjectKey
    resolved = "false"
    ps = "500"
    severities = $severitiesParam
}

# Build query string
$queryString = ($queryParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"
$fullUrl = "$apiUrl`?$queryString"

Write-Host "Fetching issues from SonarQube..." -ForegroundColor Cyan
Write-Host "  Project: $ProjectKey" -ForegroundColor Gray
Write-Host "  Severities: $severitiesParam" -ForegroundColor Gray

try {
    # Fetch regular issues
    if ($headers.Count -gt 0) {
        $response = Invoke-RestMethod -Uri $fullUrl -Method Get -Headers $headers -ErrorAction Stop
    } else {
        $response = Invoke-RestMethod -Uri $fullUrl -Method Get -ErrorAction Stop
    }

    # Fetch Security Hotspots separately
    $hotspots = @()
    if ($IncludeHotspots) {
        Write-Host "Fetching Security Hotspots..." -ForegroundColor Cyan
        $hotspotsUrl = "$SonarUrl/api/hotspots/search"
        $hotspotsQuery = "projectKey=$ProjectKey&status=TO_REVIEW&ps=500"
        $hotspotsFullUrl = "$hotspotsUrl`?$hotspotsQuery"

        try {
            if ($headers.Count -gt 0) {
                $hotspotsResponse = Invoke-RestMethod -Uri $hotspotsFullUrl -Method Get -Headers $headers -ErrorAction Stop
            } else {
                $hotspotsResponse = Invoke-RestMethod -Uri $hotspotsFullUrl -Method Get -ErrorAction Stop
            }
            $hotspots = $hotspotsResponse.hotspots
        }
        catch {
            Write-Host "  Warning: Could not fetch Security Hotspots" -ForegroundColor Yellow
        }
    }

    # Fetch Quality Gate status (includes new code coverage conditions)
    $qualityGate = $null
    Write-Host "Fetching Quality Gate status..." -ForegroundColor Cyan
    try {
        $qgUrl = "$SonarUrl/api/qualitygates/project_status?projectKey=$ProjectKey"
        if ($headers.Count -gt 0) {
            $qgResponse = Invoke-RestMethod -Uri $qgUrl -Method Get -Headers $headers -ErrorAction Stop
        } else {
            $qgResponse = Invoke-RestMethod -Uri $qgUrl -Method Get -ErrorAction Stop
        }
        $qualityGate = $qgResponse.projectStatus
    }
    catch {
        Write-Host "  Warning: Could not fetch Quality Gate status" -ForegroundColor Yellow
    }

    # Fetch coverage metrics (overall + new code)
    $coverageMetrics = $null
    Write-Host "Fetching coverage metrics..." -ForegroundColor Cyan
    try {
        $metricsKeys = "coverage,new_coverage,line_coverage,new_line_coverage,lines_to_cover,new_lines_to_cover,uncovered_lines,new_uncovered_lines"
        $measuresUrl = "$SonarUrl/api/measures/component?component=$ProjectKey&metricKeys=$metricsKeys"
        if ($headers.Count -gt 0) {
            $measuresResponse = Invoke-RestMethod -Uri $measuresUrl -Method Get -Headers $headers -ErrorAction Stop
        } else {
            $measuresResponse = Invoke-RestMethod -Uri $measuresUrl -Method Get -ErrorAction Stop
        }
        # Flatten measures array into a key/value object for readability
        $coverageMetrics = @{}
        foreach ($measure in $measuresResponse.component.measures) {
            if ($measure.PSObject.Properties.Name -contains "value") {
                $coverageMetrics[$measure.metric] = $measure.value
            } elseif ($measure.PSObject.Properties.Name -contains "periods") {
                $coverageMetrics[$measure.metric] = $measure.periods[0].value
            }
        }
    }
    catch {
        Write-Host "  Warning: Could not fetch coverage metrics" -ForegroundColor Yellow
    }

    # Create output directory if needed
    $outputDir = Split-Path -Path $OutputFile -Parent
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }

    # Combine all data
    $combinedResponse = @{
        total      = $response.total + $hotspots.Count
        issues     = $response.issues
        hotspots   = $hotspots
        paging     = $response.paging
        qualityGate = $qualityGate
        coverage   = $coverageMetrics
    }

    # Save to file
    $combinedResponse | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputFile -Encoding UTF8

    # Summary
    $total = $response.total
    $hotspotsCount = $hotspots.Count
    $blocker = ($response.issues | Where-Object { $_.severity -eq "BLOCKER" }).Count
    $critical = ($response.issues | Where-Object { $_.severity -eq "CRITICAL" }).Count
    $major = ($response.issues | Where-Object { $_.severity -eq "MAJOR" }).Count
    $minor = ($response.issues | Where-Object { $_.severity -eq "MINOR" }).Count
    $info = ($response.issues | Where-Object { $_.severity -eq "INFO" }).Count

    Write-Host ""
    Write-Host "OK Issues fetched successfully" -ForegroundColor Green
    Write-Host "  Regular Issues: $total" -ForegroundColor White
    Write-Host "  Security Hotspots: $hotspotsCount" -ForegroundColor White
    Write-Host "  Total Combined: $($total + $hotspotsCount)" -ForegroundColor White
    Write-Host ""

    if ($blocker -gt 0) {
        Write-Host "  Blocker: $blocker" -ForegroundColor Red
    } else {
        Write-Host "  Blocker: $blocker" -ForegroundColor Gray
    }

    if ($critical -gt 0) {
        Write-Host "  Critical: $critical" -ForegroundColor Yellow
    } else {
        Write-Host "  Critical: $critical" -ForegroundColor Gray
    }

    if ($major -gt 0) {
        Write-Host "  Major: $major" -ForegroundColor Cyan
    } else {
        Write-Host "  Major: $major" -ForegroundColor Gray
    }

    if ($minor -gt 0) {
        Write-Host "  Minor: $minor" -ForegroundColor DarkGray
    } else {
        Write-Host "  Minor: $minor" -ForegroundColor Gray
    }

    if ($info -gt 0) {
        Write-Host "  Info: $info" -ForegroundColor DarkGray
    } else {
        Write-Host "  Info: $info" -ForegroundColor Gray
    }

    if ($hotspotsCount -gt 0) {
        Write-Host "  Security Hotspots: $hotspotsCount" -ForegroundColor Magenta
    }

    # Quality Gate summary
    if ($qualityGate) {
        Write-Host ""
        $qgColor = if ($qualityGate.status -eq "OK") { "Green" } else { "Red" }
        Write-Host "  Quality Gate: $($qualityGate.status)" -ForegroundColor $qgColor
        $failingConditions = $qualityGate.conditions | Where-Object { $_.status -ne "OK" }
        foreach ($cond in $failingConditions) {
            Write-Host "    FAIL $($cond.metricKey): actual=$($cond.actualValue) threshold=$($cond.errorThreshold)" -ForegroundColor Red
        }
    }

    # Coverage summary
    if ($coverageMetrics -and $coverageMetrics.Count -gt 0) {
        Write-Host ""
        Write-Host "  Coverage (overall): $($coverageMetrics['coverage'])%" -ForegroundColor White
        if ($coverageMetrics['new_coverage']) {
            $newCovColor = if ([double]$coverageMetrics['new_coverage'] -ge 80) { "Green" } else { "Red" }
            Write-Host "  Coverage (new code): $($coverageMetrics['new_coverage'])%" -ForegroundColor $newCovColor
        }
    }

    Write-Host ""
    Write-Host "  Output: $OutputFile" -ForegroundColor Gray

    # Return exit code based on severity
    if ($blocker -gt 0) {
        Write-Host ""
        Write-Host "WARNING BLOCKER issues found - merge blocked!" -ForegroundColor Red
        exit 1
    }

    if ($critical -gt 0) {
        Write-Host ""
        Write-Host "WARNING CRITICAL issues found - review required!" -ForegroundColor Yellow
        exit 0
    }

    Write-Host ""
    Write-Host "OK No blocking issues" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "ERROR Failed to fetch issues" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red

    # Check if project exists
    try {
        $searchUrl = "$SonarUrl/api/components/search"
        $searchQuery = "qualifiers=TRK&q=$ProjectKey"
        if ($headers.Count -gt 0) {
            $projects = Invoke-RestMethod -Uri "$searchUrl`?$searchQuery" -Method Get -Headers $headers
        } else {
            $projects = Invoke-RestMethod -Uri "$searchUrl`?$searchQuery" -Method Get
        }
        if ($projects.components.Count -eq 0) {
            Write-Host ""
            Write-Host "  Project not found in SonarQube" -ForegroundColor Yellow
            Write-Host "  Run npm run sonar first to analyze the project" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "  Could not check project status" -ForegroundColor Gray
    }

    exit 1
}
