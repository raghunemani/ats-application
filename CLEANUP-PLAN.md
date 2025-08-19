# 🧹 Project Cleanup Plan

## 📁 Files to KEEP (Essential for Project)

### Core Project Files
- ✅ `README.md` - Main project documentation
- ✅ `.gitignore` - Git ignore rules
- ✅ `staticwebapp.config.json` - Azure Static Web Apps configuration

### Frontend Application
- ✅ `frontend/package.json` - Dependencies
- ✅ `frontend/vite.config.ts` - Build configuration
- ✅ `frontend/tsconfig.json` - TypeScript config
- ✅ `frontend/index.html` - Main HTML file
- ✅ `frontend/src/main.tsx` - React entry point
- ✅ `frontend/src/App.tsx` - Main component
- ✅ `frontend/src/App.css` - Styles
- ✅ `frontend/src/index.css` - Global styles

### Backend API
- ✅ `backend/package.json` - Dependencies
- ✅ `backend/host.json` - Azure Functions config
- ✅ `backend/tsconfig.json` - TypeScript config
- ✅ `backend/local.settings.json` - Local development settings
- ✅ `backend/src/functions/healthCheck.ts` - Health check endpoint
- ✅ `backend/src/shared/types.ts` - Shared types
- ✅ `backend/src/shared/config.ts` - Configuration

### Infrastructure (Essential)
- ✅ `infrastructure/main.bicep` - Main deployment template
- ✅ `infrastructure/parameters.dev.json` - Dev parameters
- ✅ `infrastructure/parameters.prod.json` - Prod parameters
- ✅ `infrastructure/deploy.ps1` - PowerShell deployment
- ✅ `infrastructure/deploy.sh` - Bash deployment

### CI/CD
- ✅ `.github/workflows/azure-static-web-apps-ci-cd.yml` - GitHub Actions

### Project Specifications
- ✅ `.kiro/specs/application-tracking-system/requirements.md`
- ✅ `.kiro/specs/application-tracking-system/design.md`
- ✅ `.kiro/specs/application-tracking-system/tasks.md`

## 🗑️ Files to REMOVE (Cleanup/Debug/Duplicate)

### Infrastructure Cleanup Files
- ❌ `infrastructure/TROUBLESHOOTING.md` - Debug file
- ❌ `infrastructure/azure-portal-screenshots-guide.md` - Debug guide
- ❌ `infrastructure/azure-portal-github-setup.md` - Debug guide
- ❌ `infrastructure/setup-github-actions.ps1` - Debug script
- ❌ `infrastructure/connect-github-correct.md` - Debug guide
- ❌ `infrastructure/check-github-connection.ps1` - Debug script
- ❌ `infrastructure/connect-github.ps1` - Debug script
- ❌ `infrastructure/connect-github.md` - Debug guide
- ❌ `infrastructure/quick-check-commands.md` - Debug guide
- ❌ `infrastructure/verify-deployment.ps1` - Debug script
- ❌ `infrastructure/test-naming.ps1` - Debug script
- ❌ `infrastructure/KEY-VAULT-FIX.md` - Debug documentation
- ❌ `infrastructure/test-deploy.ps1` - Debug script
- ❌ `infrastructure/diagnose-deployment.ps1` - Debug script
- ❌ `infrastructure/LOCATION-FIX.md` - Debug documentation
- ❌ `infrastructure/check-location.ps1` - Debug script
- ❌ `infrastructure/FIXES-APPLIED.md` - Debug documentation
- ❌ `infrastructure/get-secrets.ps1` - Can be recreated when needed
- ❌ `infrastructure/validate.sh` - Duplicate (keep .ps1 version)
- ❌ `infrastructure/validate.ps1` - Debug script
- ❌ `infrastructure/README.md` - Duplicate documentation

## 📂 Keep ats_tracking_optimized Directory
- ✅ Keep entire `ats_tracking_optimized/` directory as it's the clean, working version

## 🎯 Final Clean Structure

After cleanup, the project will have:
```
project-root/
├── README.md
├── .gitignore
├── staticwebapp.config.json
├── frontend/
├── backend/
├── infrastructure/
│   ├── main.bicep
│   ├── parameters.dev.json
│   ├── parameters.prod.json
│   ├── deploy.ps1
│   └── deploy.sh
├── .github/workflows/
├── .kiro/specs/
└── ats_tracking_optimized/ (complete working version)
```

This keeps only the essential files while maintaining the optimized version for deployment.