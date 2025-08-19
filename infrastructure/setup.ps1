# Setup script for infrastructure deployment
Write-Host "ATS Infrastructure Setup" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Check if running on Windows with WSL available
if (Get-Command wsl -ErrorAction SilentlyContinue) {
    Write-Host "WSL detected - making shell scripts executable..." -ForegroundColor Yellow
    wsl chmod +x deploy.sh
    wsl chmod +x validate.sh
    Write-Host "✓ Shell scripts are now executable in WSL" -ForegroundColor Green
}

# Validate Bicep template
Write-Host "`nValidating Bicep template..." -ForegroundColor Yellow
.\validate.ps1 -Environment "dev"

Write-Host "`nSetup complete! You can now deploy using:" -ForegroundColor Green
Write-Host "  PowerShell: .\deploy.ps1 -ResourceGroupName 'ats-dev-rg' -Environment 'dev'" -ForegroundColor White
Write-Host "  Bash/WSL:   ./deploy.sh -g 'ats-dev-rg' -e 'dev'" -ForegroundColor White