#!/bin/bash

# Azure Infrastructure Deployment Script (Bash)
set -e

# Default values
LOCATION="East US 2"
SQL_ADMIN_PASSWORD="P@ssw0rd123!"

# Function to display usage
usage() {
    echo "Usage: $0 -g <resource-group> -e <environment> [-l <location>] [-p <sql-password>]"
    echo "  -g: Resource group name (required)"
    echo "  -e: Environment (dev|staging|prod) (required)"
    echo "  -l: Azure location (default: East US 2)"
    echo "  -p: SQL admin password (default: P@ssw0rd123!)"
    exit 1
}

# Parse command line arguments
while getopts "g:e:l:p:h" opt; do
    case $opt in
        g) RESOURCE_GROUP="$OPTARG" ;;
        e) ENVIRONMENT="$OPTARG" ;;
        l) LOCATION="$OPTARG" ;;
        p) SQL_ADMIN_PASSWORD="$OPTARG" ;;
        h) usage ;;
        *) usage ;;
    esac
done

# Validate required parameters
if [ -z "$RESOURCE_GROUP" ] || [ -z "$ENVIRONMENT" ]; then
    echo "Error: Resource group and environment are required"
    usage
fi

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo "Error: Environment must be dev, staging, or prod"
    exit 1
fi

echo "Azure Infrastructure Deployment Script"
echo "====================================="

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "Error: Azure CLI is not installed"
    echo "Please install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in to Azure
if ! az account show &> /dev/null; then
    echo "Not logged in to Azure. Please run 'az login'"
    exit 1
fi

# Display current account
ACCOUNT_INFO=$(az account show --output json)
ACCOUNT_NAME=$(echo $ACCOUNT_INFO | jq -r '.user.name')
SUBSCRIPTION_NAME=$(echo $ACCOUNT_INFO | jq -r '.name')
SUBSCRIPTION_ID=$(echo $ACCOUNT_INFO | jq -r '.id')

echo "Logged in as: $ACCOUNT_NAME"
echo "Subscription: $SUBSCRIPTION_NAME ($SUBSCRIPTION_ID)"

# Create resource group if it doesn't exist
echo ""
echo "Checking resource group: $RESOURCE_GROUP"
if ! az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    echo "Creating resource group: $RESOURCE_GROUP in $LOCATION"
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table
else
    echo "Resource group already exists"
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="$SCRIPT_DIR/main.bicep"
PARAMETERS_FILE="$SCRIPT_DIR/parameters.$ENVIRONMENT.json"

echo ""
echo "Deploying infrastructure for environment: $ENVIRONMENT"
echo "Template file: $TEMPLATE_FILE"
echo "Parameters file: $PARAMETERS_FILE"

# Check if files exist
if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "Error: Template file not found: $TEMPLATE_FILE"
    exit 1
fi

if [ ! -f "$PARAMETERS_FILE" ]; then
    echo "Error: Parameters file not found: $PARAMETERS_FILE"
    exit 1
fi

# Generate deployment name
DEPLOYMENT_NAME="ats-deployment-$(date +%Y%m%d-%H%M%S)"

echo ""
echo "Starting deployment: $DEPLOYMENT_NAME"

# Deploy using Azure CLI
DEPLOYMENT_RESULT=$(az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE_FILE" \
    --parameters "@$PARAMETERS_FILE" \
    --parameters sqlAdminPassword="$SQL_ADMIN_PASSWORD" \
    --name "$DEPLOYMENT_NAME" \
    --output json)

if [ $? -eq 0 ]; then
    echo ""
    echo "Deployment completed successfully!"
    
    # Display outputs
    echo ""
    echo "Deployment Outputs:"
    echo "=================="
    
    echo "$DEPLOYMENT_RESULT" | jq -r '.properties.outputs | to_entries[] | "\(.key): \(.value.value)"'
    
    # Save outputs to file
    OUTPUTS_FILE="$SCRIPT_DIR/deployment-outputs-$ENVIRONMENT.json"
    echo "$DEPLOYMENT_RESULT" | jq '.properties.outputs' > "$OUTPUTS_FILE"
    echo ""
    echo "Outputs saved to: $OUTPUTS_FILE"
    
    echo ""
    echo "Next steps:"
    echo "1. Connect your GitHub repository to the Static Web App"
    echo "2. Configure application settings with the connection strings above"
    echo "3. Set up the database schema"
    echo "4. Configure Azure AI Search index"
else
    echo ""
    echo "Deployment failed!"
    echo "Check the Azure portal for detailed error information"
    exit 1
fi