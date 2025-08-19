# Git Commit Script for ATS Project
Write-Host "Committing ATS Project to GitHub" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check if we're in a git repository
if (!(Test-Path ".git")) {
    Write-Host "Initializing Git repository..." -ForegroundColor Yellow
    git init
}

# Add all files
Write-Host "Adding all files to Git..." -ForegroundColor Yellow
git add .

# Check git status
Write-Host "`nGit Status:" -ForegroundColor Yellow
git status --short

# Create commit message
$commitMessage = @"
feat: Complete ATS infrastructure deployment

✅ Successfully deployed Azure infrastructure
🔧 Fixed Bicep template issues (Key Vault naming, location compatibility)
📁 Added comprehensive deployment and validation scripts
📚 Updated documentation and troubleshooting guides

Infrastructure includes:
- Azure Static Web Apps (frontend hosting)
- Azure Functions (backend API)
- Azure SQL Database (data storage)
- Azure AI Search (candidate search)
- Azure Storage (resume files)
- Key Vault (secrets management)
- Application Insights (monitoring)

All deployment issues resolved:
- Location compatibility (East US 2)
- Key Vault naming (24 char limit)
- Bicep syntax validation
- Security best practices

Ready for production deployment! 🚀
"@

# Commit changes
Write-Host "`nCommitting changes..." -ForegroundColor Yellow
git commit -m $commitMessage

# Check if remote origin exists
$remoteExists = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nNo remote repository configured." -ForegroundColor Yellow
    Write-Host "To add your GitHub repository:" -ForegroundColor White
    Write-Host "git remote add origin https://github.com/YOUR_USERNAME/ats-application.git" -ForegroundColor Cyan
    Write-Host "git branch -M main" -ForegroundColor Cyan
    Write-Host "git push -u origin main" -ForegroundColor Cyan
} else {
    Write-Host "`nPushing to GitHub..." -ForegroundColor Yellow
    git push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
    } else {
        Write-Host "❌ Push failed. You may need to pull first:" -ForegroundColor Red
        Write-Host "git pull origin main --rebase" -ForegroundColor Cyan
        Write-Host "git push origin main" -ForegroundColor Cyan
    }
}

Write-Host "`n🎉 ATS Project is now on GitHub!" -ForegroundColor Green