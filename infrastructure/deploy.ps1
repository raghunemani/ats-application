# Azure Infrastructure Deployment Script
param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName,
    
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "staging", "prod")]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("East US 2", "West US 2", "Central US", "West Europe", "East Asia")]
    [string]$Location = "East US 2",
    
    [Parameter(Mandatory=$false)]
    [string]$SqlAdminPassword = "P@ssw0rd123!"
)

Write-Host "Azure Infrastructure Deployment Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Check if Azure CLI is installed
try {
    $azVersion = az version --output json | ConvertFrom-Json
    Write-Host "Azure CLI version: $($azVersion.'azure-cli')" -ForegroundColor Green
} catch {
    Write-Host "Error: Azure CLI is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

# Check if logged in to Azure
try {
    $account = az account show --output json | ConvertFrom-Json
    Write-Host "Logged in as: $($account.user.name)" -ForegroundColor Green
    Write-Host "Subscription: $($account.name) ($($account.id))" -ForegroundColor Green
} catch {
    Write-Host "Not logged in to Azure. Please run 'az login'" -ForegroundColor Red
    exit 1
}

# Convert location display name to location name if needed
$locationMap = @{
    "East US 2" = "eastus2"
    "West US 2" = "westus2"
    "Central US" = "centralus"
    "West Europe" = "westeurope"
    "East Asia" = "eastasia"
}

$locationName = $locationMap[$Location]
if (-not $locationName) {
    $locationName = $Location.ToLower().Replace(" ", "")
}

Write-Host "Using location: $Location ($locationName)" -ForegroundColor Gray

# Create resource group if it doesn't exist
Write-Host "`nChecking resource group: $ResourceGroupName" -ForegroundColor Yellow
$rgExists = az group exists --name $ResourceGroupName --output tsv
if ($rgExists -eq "false") {
    Write-Host "Creating resource group: $ResourceGroupName in $Location" -ForegroundColor Yellow
    az group create --name $ResourceGroupName --location $locationName --output table
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create resource group" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Resource group already exists" -ForegroundColor Green
}

# Deploy the Bicep template
$templateFile = Join-Path $PSScriptRoot "main.bicep"
$parametersFile = Join-Path $PSScriptRoot "parameters.$Environment.json"

Write-Host "`nDeploying infrastructure for environment: $Environment" -ForegroundColor Yellow
Write-Host "Template file: $templateFile"
Write-Host "Parameters file: $parametersFile"

# Check if files exist
if (!(Test-Path $templateFile)) {
    Write-Host "Error: Template file not found: $templateFile" -ForegroundColor Red
    exit 1
}

if (!(Test-Path $parametersFile)) {
    Write-Host "Error: Parameters file not found: $parametersFile" -ForegroundColor Red
    exit 1
}

# Generate a unique deployment name
$deploymentName = "ats-deployment-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

Write-Host "`nStarting deployment: $deploymentName" -ForegroundColor Yellow

# Deploy using Azure CLI
$deploymentResult = az deployment group create `
    --resource-group $ResourceGroupName `
    --template-file $templateFile `
    --parameters "@$parametersFile" `
    --parameters sqlAdminPassword="$SqlAdminPassword" `
    --parameters location="$locationName" `
    --name $deploymentName `
    --output json

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDeployment completed successfully!" -ForegroundColor Green
    
    # Parse and display outputs
    $deployment = $deploymentResult | ConvertFrom-Json
    if ($deployment.properties.outputs) {
        Write-Host "`nDeployment Outputs:" -ForegroundColor Yellow
        Write-Host "==================" -ForegroundColor Yellow
        
        $deployment.properties.outputs.PSObject.Properties | ForEach-Object {
            $key = $_.Name
            $value = $_.Value.value
            Write-Host "$key : $value" -ForegroundColor Cyan
        }
        
        # Save outputs to file for later use
        $outputsFile = Join-Path $PSScriptRoot "deployment-outputs-$Environment.json"
        $deployment.properties.outputs | ConvertTo-Json -Depth 10 | Out-File $outputsFile
        Write-Host "`nOutputs saved to: $outputsFile" -ForegroundColor Green
    }
} else {
    Write-Host "`nDeployment failed!" -ForegroundColor Red
    Write-Host "Check the Azure portal for detailed error information" -ForegroundColor Yellow
    exit 1
}

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Get connection strings: .\get-secrets.ps1 -ResourceGroupName '$ResourceGroupName' -Environment '$Environment' -SqlAdminPassword '$SqlAdminPassword'" -ForegroundColor White
Write-Host "2. Connect your GitHub repository to the Static Web App" -ForegroundColor White
Write-Host "3. Configure application settings with the connection strings" -ForegroundColor White
Write-Host "4. Set up the database schema" -ForegroundColor White
Write-Host "5. Configure Azure AI Search index" -ForegroundColor White