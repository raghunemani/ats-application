# Azure Resource Group Cleanup and Redeploy Script
param(
    [Parameter(Mandatory=$true)]
    [string]$OldResourceGroupName,
    
    [Parameter(Mandatory=$true)]
    [string]$NewResourceGroupName,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "staging", "prod")]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("East US 2", "West US 2", "Central US", "West Europe", "East Asia")]
    [string]$Location = "East US 2",
    
    [Parameter(Mandatory=$false)]
    [string]$SqlAdminPassword = "CleanDeployment123!"
)

Write-Host "Azure Resource Group Cleanup and Redeploy" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Check if Azure CLI is installed and logged in
try {
    $account = az account show --output json | ConvertFrom-Json
    Write-Host "✅ Logged in as: $($account.user.name)" -ForegroundColor Green
    Write-Host "   Subscription: $($account.name)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Not logged in to Azure. Run 'az login'" -ForegroundColor Red
    exit 1
}

# Step 1: Delete old resource group
Write-Host "`n🗑️ Step 1: Deleting old resource group..." -ForegroundColor Yellow
$oldRgExists = az group exists --name $OldResourceGroupName --output tsv

if ($oldRgExists -eq "true") {
    Write-Host "   Found resource group: $OldResourceGroupName" -ForegroundColor White
    
    # List resources before deletion
    $resources = az resource list --resource-group $OldResourceGroupName --output json | ConvertFrom-Json
    if ($resources.Count -gt 0) {
        Write-Host "   Resources to be deleted:" -ForegroundColor Gray
        $resources | ForEach-Object {
            Write-Host "   - $($_.name) ($($_.type))" -ForegroundColor Gray
        }
    }
    
    # Confirm deletion
    $confirm = Read-Host "`n   ⚠️ Delete resource group '$OldResourceGroupName' and ALL its resources? (y/N)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Write-Host "   Deleting resource group..." -ForegroundColor Yellow
        az group delete --name $OldResourceGroupName --yes --no-wait
        
        # Wait for deletion to complete
        Write-Host "   Waiting for deletion to complete..." -ForegroundColor Gray
        do {
            Start-Sleep -Seconds 10
            $stillExists = az group exists --name $OldResourceGroupName --output tsv
            Write-Host "   ." -NoNewline -ForegroundColor Gray
        } while ($stillExists -eq "true")
        
        Write-Host "`n   ✅ Resource group deleted successfully" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Deletion cancelled by user" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ℹ️ Resource group '$OldResourceGroupName' does not exist" -ForegroundColor Gray
}

# Step 2: Deploy using clean scripts
Write-Host "`n🚀 Step 2: Deploying with clean scripts..." -ForegroundColor Yellow

# Check if we should use optimized version
$optimizedPath = "ats_tracking_optimized/infrastructure"
$mainPath = "infrastructure"

if (Test-Path $optimizedPath) {
    Write-Host "   Using optimized deployment scripts" -ForegroundColor Green
    $deployPath = $optimizedPath
    $deployScript = Join-Path $deployPath "deploy.ps1"
} elseif (Test-Path $mainPath) {
    Write-Host "   Using main deployment scripts" -ForegroundColor Green
    $deployPath = $mainPath
    $deployScript = Join-Path $deployPath "deploy.ps1"
} else {
    Write-Host "   ❌ No deployment scripts found" -ForegroundColor Red
    exit 1
}

# Convert location to Azure format
$locationMap = @{
    "East US 2" = "eastus2"
    "West US 2" = "westus2"
    "Central US" = "centralus"
    "West Europe" = "westeurope"
    "East Asia" = "eastasia"
}
$locationName = $locationMap[$Location]

Write-Host "   Deployment details:" -ForegroundColor White
Write-Host "   - Resource Group: $NewResourceGroupName" -ForegroundColor Gray
Write-Host "   - Environment: $Environment" -ForegroundColor Gray
Write-Host "   - Location: $Location ($locationName)" -ForegroundColor Gray
Write-Host "   - Script Path: $deployScript" -ForegroundColor Gray

# Execute deployment
Write-Host "`n   Starting deployment..." -ForegroundColor Yellow
try {
    & $deployScript -ResourceGroupName $NewResourceGroupName -Environment $Environment -Location $Location -SqlAdminPassword $SqlAdminPassword
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Deployment completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "`n❌ Deployment failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "`n❌ Deployment failed with error: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Verify deployment
Write-Host "`n🔍 Step 3: Verifying deployment..." -ForegroundColor Yellow
$newResources = az resource list --resource-group $NewResourceGroupName --output json | ConvertFrom-Json

if ($newResources.Count -gt 0) {
    Write-Host "   ✅ Successfully deployed $($newResources.Count) resources:" -ForegroundColor Green
    $newResources | ForEach-Object {
        Write-Host "   ✓ $($_.name) ($($_.type))" -ForegroundColor Green
    }
} else {
    Write-Host "   ❌ No resources found in new resource group" -ForegroundColor Red
}

# Summary
Write-Host "`n" + "="*50 -ForegroundColor Cyan
Write-Host "CLEANUP AND REDEPLOY SUMMARY" -ForegroundColor Cyan
Write-Host "="*50 -ForegroundColor Cyan

Write-Host "🗑️ Old Resource Group: $OldResourceGroupName - DELETED" -ForegroundColor Yellow
Write-Host "🆕 New Resource Group: $NewResourceGroupName - CREATED" -ForegroundColor Green
Write-Host "📊 Resources Deployed: $($newResources.Count)" -ForegroundColor White
Write-Host "🌍 Location: $Location" -ForegroundColor White

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Connect GitHub repository to new Static Web App" -ForegroundColor White
Write-Host "2. Update application settings with new connection strings" -ForegroundColor White
Write-Host "3. Test the deployed application" -ForegroundColor White

Write-Host "`n🎉 Azure cleanup and redeploy completed successfully!" -ForegroundColor Green