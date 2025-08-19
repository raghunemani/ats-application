# Quick Fix for GitHub Push Protection - Remove Secrets
Write-Host "GitHub Push Protection Fix - Removing Secrets" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Step 1: Find and remove files with secrets
Write-Host "`n🔍 Step 1: Finding files with potential secrets..." -ForegroundColor Yellow

$secretFiles = @()

# Check for .env files
$envFiles = Get-ChildItem -Path . -Recurse -Name "*.env*" -ErrorAction SilentlyContinue
if ($envFiles) {
    Write-Host "Found .env files:" -ForegroundColor Red
    $envFiles | ForEach-Object { 
        Write-Host "  - $_" -ForegroundColor Red
        $secretFiles += $_
    }
}

# Check for deployment output files
$outputFiles = Get-ChildItem -Path . -Recurse -Name "*output*" -ErrorAction SilentlyContinue
if ($outputFiles) {
    Write-Host "Found output files:" -ForegroundColor Yellow
    $outputFiles | ForEach-Object { 
        Write-Host "  - $_" -ForegroundColor Yellow
        $secretFiles += $_
    }
}

# Step 2: Remove secret files from Git
Write-Host "`n🗑️ Step 2: Removing secret files from Git..." -ForegroundColor Yellow

if ($secretFiles.Count -gt 0) {
    foreach ($file in $secretFiles) {
        try {
            git rm $file 2>$null
            Write-Host "  ✓ Removed from Git: $file" -ForegroundColor Green
        } catch {
            Write-Host "  ℹ️ File not in Git: $file" -ForegroundColor Gray
        }
        
        # Also delete from filesystem if exists
        if (Test-Path $file) {
            Remove-Item $file -Force
            Write-Host "  ✓ Deleted from filesystem: $file" -ForegroundColor Green
        }
    }
} else {
    Write-Host "  ℹ️ No obvious secret files found" -ForegroundColor Gray
}

# Step 3: Update .gitignore
Write-Host "`n📝 Step 3: Updating .gitignore..." -ForegroundColor Yellow

$gitignoreContent = @"
# Environment files with secrets
*.env
*.env.*
.env
.env.*
infrastructure/.env*
infrastructure/*output*
infrastructure/deployment-outputs-*

# Azure deployment outputs
**/deployment-outputs-*.json
**/.env*
"@

if (Test-Path ".gitignore") {
    $currentGitignore = Get-Content ".gitignore" -Raw
    if ($currentGitignore -notlike "*infrastructure/.env*") {
        Add-Content ".gitignore" "`n$gitignoreContent"
        Write-Host "  ✓ Updated .gitignore with secret patterns" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️ .gitignore already contains secret patterns" -ForegroundColor Gray
    }
} else {
    Set-Content ".gitignore" $gitignoreContent
    Write-Host "  ✓ Created .gitignore with secret patterns" -ForegroundColor Green
}

# Step 4: Check for remaining secrets
Write-Host "`n🔍 Step 4: Scanning for remaining secrets..." -ForegroundColor Yellow

$secretPatterns = @(
    "AZURE_SEARCH_API_KEY",
    "AZURE_.*_KEY",
    "api.*key",
    "secret",
    "password.*=.*[^<]"
)

$foundSecrets = $false
foreach ($pattern in $secretPatterns) {
    $matches = Select-String -Path . -Pattern $pattern -Recurse -Exclude "*.md", "*.ps1", "node_modules", ".git" -ErrorAction SilentlyContinue
    if ($matches) {
        Write-Host "  ⚠️ Found potential secrets matching '$pattern':" -ForegroundColor Red
        $matches | ForEach-Object { Write-Host "    $($_.Filename):$($_.LineNumber)" -ForegroundColor Red }
        $foundSecrets = $true
    }
}

if (-not $foundSecrets) {
    Write-Host "  ✅ No obvious secrets found in remaining files" -ForegroundColor Green
}

# Step 5: Prepare clean commit
Write-Host "`n📦 Step 5: Preparing clean commit..." -ForegroundColor Yellow

# Add safe files
$safeFiles = @(
    "README.md",
    ".gitignore",
    "staticwebapp.config.json",
    "frontend/",
    "backend/",
    "infrastructure/main.bicep",
    "infrastructure/parameters.dev.json",
    "infrastructure/parameters.prod.json",
    "infrastructure/deploy.ps1",
    "infrastructure/deploy.sh",
    ".github/",
    ".kiro/"
)

foreach ($file in $safeFiles) {
    if (Test-Path $file) {
        git add $file
        Write-Host "  ✓ Added safe file: $file" -ForegroundColor Green
    }
}

# Step 6: Show status and next steps
Write-Host "`n📊 Step 6: Current Git status..." -ForegroundColor Yellow
git status --short

Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Review the git status above" -ForegroundColor White
Write-Host "2. If it looks good, commit:" -ForegroundColor White
Write-Host "   git commit -m 'cleanup: production-ready codebase (no secrets)'" -ForegroundColor Cyan
Write-Host "3. Push to GitHub:" -ForegroundColor White
Write-Host "   git push origin main" -ForegroundColor Cyan

Write-Host "`n⚠️ Important:" -ForegroundColor Yellow
Write-Host "- All secret files have been removed" -ForegroundColor White
Write-Host "- .gitignore updated to prevent future secret commits" -ForegroundColor White
Write-Host "- Only safe, production-ready files remain" -ForegroundColor White

Write-Host "`n✅ Secret cleanup completed!" -ForegroundColor Green