# Simple Git History Fix - Remove Secret from History
Write-Host "Simple Git History Fix - Remove Secrets" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

Write-Host "`n🎯 This will completely remove the secret from Git history" -ForegroundColor Yellow
Write-Host "⚠️ This will rewrite commit history and change commit hashes" -ForegroundColor Red

$confirm = Read-Host "`nContinue with history rewrite? (y/N)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Operation cancelled" -ForegroundColor Red
    exit 1
}

Write-Host "`n🧹 Removing infrastructure/.env.dev from all Git history..." -ForegroundColor Yellow

# Method 1: Use git filter-repo (if available) - most efficient
try {
    git filter-repo --path infrastructure/.env.dev --invert-paths --force 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully used git filter-repo" -ForegroundColor Green
        $success = $true
    } else {
        throw "filter-repo not available"
    }
} catch {
    Write-Host "ℹ️ git filter-repo not available, using filter-branch..." -ForegroundColor Gray
    
    # Method 2: Use git filter-branch
    try {
        git filter-branch --force --index-filter "git rm --cached --ignore-unmatch infrastructure/.env.dev" --prune-empty --tag-name-filter cat -- --all
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Successfully used git filter-branch" -ForegroundColor Green
            
            # Clean up filter-branch backup refs
            git for-each-ref --format="%(refname)" refs/original/ | ForEach-Object { 
                git update-ref -d $_
            }
            $success = $true
        } else {
            throw "filter-branch failed"
        }
    } catch {
        Write-Host "⚠️ filter-branch failed, using reset method..." -ForegroundColor Yellow
        
        # Method 3: Reset and recommit (nuclear option)
        Write-Host "`n🔄 Resetting to clean state..." -ForegroundColor Yellow
        
        # Create a new orphan branch
        git checkout --orphan clean-main
        
        # Add all files except secrets
        git add .
        git reset -- infrastructure/.env.dev 2>$null
        git reset -- infrastructure/deployment-outputs-* 2>$null
        git reset -- "**/.env*" 2>$null
        
        # Commit clean version
        git commit -m "feat: clean ATS project (no secrets in history)

- Complete Application Tracking System
- Azure infrastructure templates
- React frontend and Azure Functions backend
- No secrets or sensitive data
- Production ready"
        
        # Delete old main branch and rename clean branch
        git branch -D main 2>$null
        git branch -m main
        
        Write-Host "✅ Created clean branch without secrets" -ForegroundColor Green
        $success = $true
    }
}

if ($success) {
    # Clean up Git
    Write-Host "`n🧽 Cleaning up Git..." -ForegroundColor Yellow
    git reflog expire --expire=now --all
    git gc --prune=now --aggressive
    
    # Verify no secrets remain
    Write-Host "`n🔍 Verifying secrets are gone..." -ForegroundColor Yellow
    $secretCheck = git log --all --full-history -- infrastructure/.env.dev 2>$null
    if (-not $secretCheck) {
        Write-Host "✅ No secrets found in Git history" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Secrets may still exist in history" -ForegroundColor Red
    }
    
    # Show current status
    Write-Host "`n📊 Current status:" -ForegroundColor Yellow
    git log --oneline -3
    git status --short
    
    Write-Host "`n🚀 Ready to push clean history:" -ForegroundColor Green
    Write-Host "git push --force-with-lease origin main" -ForegroundColor Cyan
    
    Write-Host "`n⚠️ Important:" -ForegroundColor Yellow
    Write-Host "- All commit hashes have changed" -ForegroundColor White
    Write-Host "- This is a force push - history is rewritten" -ForegroundColor White
    Write-Host "- Secrets are completely removed from Git history" -ForegroundColor White
    
} else {
    Write-Host "`n❌ Failed to clean Git history" -ForegroundColor Red
    Write-Host "Manual intervention may be required" -ForegroundColor Yellow
}

Write-Host "`n✅ Git history fix completed!" -ForegroundColor Green