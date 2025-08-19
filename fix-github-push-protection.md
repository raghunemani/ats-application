# 🔒 Fix GitHub Push Protection - Secret Detected

## 🚨 Issue
GitHub detected an Azure Search Admin Key in `infrastructure/.env.dev:7` and blocked the push for security reasons.

## 🔍 Problem Details
- **File**: `infrastructure/.env.dev`
- **Line**: 7
- **Secret Type**: Azure Search Admin Key
- **Commit**: `1fd5c8367b9b06d6459e460c05cca52c0aade51e`

## 🛠️ Solution Steps

### Step 1: Remove the Secret File
```bash
# Check if the file exists
ls -la infrastructure/.env.dev

# Remove the file containing secrets
git rm infrastructure/.env.dev

# Or if it's not tracked, just delete it
rm infrastructure/.env.dev
```

### Step 2: Clean Git History (Remove Secret from Commits)
```bash
# Option A: Amend the last commit (if it's the most recent)
git add .
git commit --amend -m "cleanup: production-ready codebase - remove debug files (no secrets)"

# Option B: Reset and recommit (if multiple commits involved)
git reset --soft HEAD~1
git add .
git commit -m "cleanup: production-ready codebase - remove debug files"
```

### Step 3: Verify No Secrets Remain
```bash
# Search for potential secrets in all files
grep -r "search.*key\|api.*key\|secret\|password" . --exclude-dir=.git --exclude-dir=node_modules

# Check specific patterns
grep -r "AZURE_SEARCH_API_KEY\|AZURE_.*_KEY" . --exclude-dir=.git --exclude-dir=node_modules
```

### Step 4: Update .gitignore to Prevent Future Issues
```bash
# Add to .gitignore if not already present
echo "# Environment files with secrets" >> .gitignore
echo "*.env" >> .gitignore
echo "*.env.*" >> .gitignore
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore
echo "infrastructure/.env*" >> .gitignore
```

### Step 5: Try Push Again
```bash
git push origin main
```

## 🔧 Alternative: Force Allow Secret (Not Recommended)

If you need to temporarily allow the secret (NOT recommended for production):

1. **Go to the GitHub URL provided**:
   ```
   https://github.com/raghunemani/ats-application/security/secret-scanning/unblock-secret/31V8DhFC65OGflczXfhYJ6jsawT
   ```

2. **Click "Allow secret"** (temporary bypass)

3. **Immediately remove the secret after push**

## 🎯 Recommended Approach: Clean Commit

### Complete Clean Process
```bash
# 1. Remove any .env files
find . -name "*.env*" -type f -delete

# 2. Check what files are staged
git status

# 3. Remove any files with secrets
git rm infrastructure/.env.dev 2>/dev/null || true

# 4. Add safe files only
git add README.md
git add .gitignore
git add staticwebapp.config.json
git add frontend/
git add backend/
git add infrastructure/main.bicep
git add infrastructure/parameters.dev.json
git add infrastructure/parameters.prod.json
git add infrastructure/deploy.ps1
git add infrastructure/deploy.sh
git add .github/
git add .kiro/

# 5. Commit without secrets
git commit -m "cleanup: production-ready codebase

- Remove debug and troubleshooting files
- Remove temporary deployment scripts  
- Keep only essential project files
- No secrets or sensitive data included
- Ready for production deployment"

# 6. Push clean version
git push origin main
```

## 🔍 Files to Check and Clean

### Likely Files with Secrets:
- `infrastructure/.env.dev` ❌ (contains secrets)
- `infrastructure/.env.prod` ❌ (if exists)
- `infrastructure/deployment-outputs-*.json` ❌ (may contain keys)
- Any files with "output", "secret", "key" in name ❌

### Safe Files to Keep:
- `infrastructure/main.bicep` ✅
- `infrastructure/parameters.dev.json` ✅ (no actual secrets)
- `infrastructure/deploy.ps1` ✅
- All frontend/ and backend/ files ✅

## 🛡️ Security Best Practices

### For Future Development:
1. **Never commit .env files** with real secrets
2. **Use .env.example** with placeholder values
3. **Store real secrets** in Azure Key Vault or GitHub Secrets
4. **Use local.settings.json** for local development only
5. **Add .env* to .gitignore** always

### Example .env.example (Safe to Commit):
```bash
# Example environment file - replace with actual values
AZURE_SEARCH_API_KEY=your_search_api_key_here
AZURE_SQL_CONNECTION_STRING=your_connection_string_here
AZURE_STORAGE_CONNECTION_STRING=your_storage_connection_here
```

## ✅ Verification

After fixing, verify:
```bash
# Check no secrets in repository
git log --oneline -5
git show HEAD --name-only
grep -r "api.*key\|secret" . --exclude-dir=.git --exclude-dir=node_modules || echo "No secrets found"
```

## 🎉 Expected Result

After following these steps:
- ✅ No secrets in Git history
- ✅ Clean commit without sensitive data
- ✅ Successful push to GitHub
- ✅ Repository ready for production

**Fix the secret issue first, then retry the push!** 🔒