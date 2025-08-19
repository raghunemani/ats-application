# 🚀 Execute Both Tasks: Azure + GitHub Cleanup

## 📋 Task Overview

### Task 1: Azure Resource Group Recreation
- Delete existing resource group
- Redeploy using cleaned scripts
- Verify new deployment

### Task 2: GitHub Project Cleanup  
- Remove debug and temporary files
- Keep only production-ready code
- Clean commit history

## 🎯 Execution Order

### Phase 1: Azure Cleanup and Redeploy

#### Step 1: Run Azure Cleanup Script
```powershell
# Execute the cleanup and redeploy script
.\azure-cleanup-and-redeploy.ps1 -OldResourceGroupName "ats-dev-rg" -NewResourceGroupName "ats-clean-rg" -Environment "dev" -Location "East US 2"
```

**What this does:**
- ✅ Deletes old resource group `ats-dev-rg`
- ✅ Creates new resource group `ats-clean-rg`
- ✅ Deploys using clean scripts
- ✅ Verifies deployment success

#### Step 2: Verify Azure Deployment
```bash
# Check new resources
az resource list --resource-group "ats-clean-rg" --output table

# Should show 7 resources:
# - Storage Account
# - SQL Server & Database  
# - Search Service
# - Static Web App
# - Key Vault
# - Application Insights
```

### Phase 2: GitHub Cleanup

#### Step 3: Remove Cleanup Files
```bash
# Remove temporary and debug files
git rm CLEANUP-COMPLETED.md
git rm CLEANUP-PLAN.md
git rm azure-cleanup-and-redeploy.ps1
git rm github-cleanup-guide.md
git rm EXECUTE-BOTH-TASKS.md
git rm -r ats_tracking_optimized/
```

#### Step 4: Commit Clean Version
```bash
# Stage all changes
git add .

# Commit with clean message
git commit -m "cleanup: production-ready codebase

- Remove debug and troubleshooting files
- Remove temporary deployment scripts  
- Keep only essential project files
- Ready for production deployment"

# Push to GitHub
git push origin main
```

## 📊 Expected Results

### Azure (After Task 1)
```
New Resource Group: ats-clean-rg
├── ✅ Storage Account (clean deployment)
├── ✅ SQL Server & Database (fresh instance)
├── ✅ Search Service (new index)
├── ✅ Static Web App (ready for GitHub connection)
├── ✅ Key Vault (secure secrets storage)
└── ✅ Application Insights (monitoring ready)
```

### GitHub (After Task 2)
```
Clean Repository Structure:
├── ✅ README.md (updated documentation)
├── ✅ frontend/ (React.js application)
├── ✅ backend/ (Azure Functions API)
├── ✅ infrastructure/ (essential deployment files only)
├── ✅ .github/workflows/ (CI/CD pipeline)
├── ✅ .kiro/specs/ (project specifications)
├── ✅ staticwebapp.config.json
└── ✅ .gitignore
```

## 🔍 Verification Checklist

### Azure Verification
- [ ] Old resource group deleted
- [ ] New resource group created
- [ ] All 7 resources deployed successfully
- [ ] Static Web App has valid URL
- [ ] No deployment errors

### GitHub Verification  
- [ ] No debug files in repository
- [ ] No temporary directories
- [ ] Clean file structure
- [ ] Updated README.md
- [ ] Professional appearance

## ⚠️ Important Notes

### Before Starting
1. **Backup Important Data**: If you have any data in the old resource group, back it up first
2. **Update Connection Strings**: After Azure redeploy, you'll need new connection strings
3. **GitHub Repository**: Make sure you have no uncommitted changes

### After Completion
1. **Connect GitHub to New Static Web App**: Use Azure Portal to reconnect
2. **Update Application Settings**: Configure new connection strings
3. **Test Deployment**: Verify everything works with clean setup

## 🚨 Troubleshooting

### If Azure Cleanup Fails
```powershell
# Manual cleanup if script fails
az group delete --name "ats-dev-rg" --yes --no-wait

# Wait for deletion, then redeploy manually
cd ats_tracking_optimized/infrastructure
.\deploy.ps1 -ResourceGroupName "ats-clean-rg" -Environment "dev"
```

### If GitHub Cleanup Issues
```bash
# Reset to clean state if needed
git reset --hard HEAD~1  # Undo last commit if needed
git clean -fd            # Remove untracked files
```

## 🎉 Success Criteria

Both tasks are successful when:

### Azure Success
- ✅ Clean resource group with 7 resources
- ✅ No conflicts or naming issues
- ✅ Static Web App accessible
- ✅ All services running properly

### GitHub Success  
- ✅ Repository contains only essential files
- ✅ No debug or temporary files
- ✅ Clean, professional structure
- ✅ Ready for team collaboration

## 📞 Next Steps After Completion

1. **Connect GitHub Repository** to new Static Web App
2. **Configure Application Settings** with new connection strings
3. **Test End-to-End Functionality**
4. **Set up Database Schema**
5. **Configure Search Index**

**Ready to execute both tasks for a completely clean setup!** 🚀