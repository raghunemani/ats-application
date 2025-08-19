# Application Tracking System (ATS)

A modern, AI-powered Application Tracking System built on Azure cloud services, designed to help recruiters efficiently manage candidates and match them to job opportunities.

## Features

- **Candidate Management**: Store and manage candidate information, resumes, and personal details
- **AI-Powered Search**: Use Azure AI Search to find relevant candidates based on job descriptions
- **Email Campaigns**: Automated email outreach with AI-generated personalized content
- **Low-Code Interface**: Visual configuration tools for search parameters and email templates
- **Azure Integration**: Built on Azure Static Web Apps, Functions, and AI services for cost efficiency

## Architecture

- **Frontend**: React.js with TypeScript hosted on Azure Static Web Apps
- **Backend**: Azure Functions with TypeScript for serverless API
- **Database**: Azure SQL Database for structured data
- **Storage**: Azure Blob Storage for resume files
- **Search**: Azure AI Search for intelligent candidate matching
- **AI**: Azure OpenAI Service for resume parsing and email generation
- **Email**: Azure Logic Apps with SendGrid integration

## Project Structure

```
├── README.md                           # Project documentation
├── .gitignore                         # Git ignore rules
├── staticwebapp.config.json           # Azure Static Web Apps configuration
├── frontend/                          # React.js frontend application
│   ├── package.json                   # Frontend dependencies
│   ├── vite.config.ts                 # Vite build configuration
│   ├── tsconfig.json                  # TypeScript configuration
│   ├── index.html                     # Main HTML file
│   └── src/                           # Source code
│       ├── main.tsx                   # React entry point
│       ├── App.tsx                    # Main App component
│       ├── App.css                    # Component styles
│       └── index.css                  # Global styles
├── backend/                           # Azure Functions backend API
│   ├── package.json                   # Backend dependencies
│   ├── host.json                      # Azure Functions configuration
│   ├── tsconfig.json                  # TypeScript configuration
│   ├── local.settings.json            # Local development settings
│   └── src/                           # Source code
│       ├── functions/                 # Azure Functions
│       │   └── healthCheck.ts         # Health check endpoint
│       └── shared/                    # Shared utilities
│           ├── types.ts               # TypeScript type definitions
│           └── config.ts              # Configuration management
├── infrastructure/                    # Azure deployment templates
│   ├── main.bicep                     # Main Bicep infrastructure template
│   ├── parameters.dev.json            # Development environment parameters
│   ├── parameters.prod.json           # Production environment parameters
│   ├── deploy.ps1                     # PowerShell deployment script
│   └── deploy.sh                      # Bash deployment script
├── .github/workflows/                 # CI/CD pipeline
│   └── azure-static-web-apps-ci-cd.yml # GitHub Actions workflow
├── .kiro/specs/                       # Project specifications
│   └── application-tracking-system/
│       ├── requirements.md            # Project requirements
│       ├── design.md                  # System design document
│       └── tasks.md                   # Implementation tasks
└── ats_tracking_optimized/            # Clean deployment version
    └── (Complete working version with optimized naming)
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Azure CLI or Azure PowerShell
- Azure subscription
- Git

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ats-application
   ```

2. **Install dependencies**
   ```bash
   # Frontend
   cd frontend
   npm install
   
   # Backend
   cd ../backend
   npm install
   ```

3. **Configure local settings**
   - Copy `backend/local.settings.json` and update with your Azure service connection strings
   - Update environment variables for local development

4. **Run the application**
   ```bash
   # Start backend (from backend directory)
   npm start
   
   # Start frontend (from frontend directory)
   npm run dev
   ```

### Deployment

#### Option 1: Use Optimized Version (Recommended)
```bash
# Navigate to the clean, tested version
cd ats_tracking_optimized

# Follow the deployment guide
# See ats_tracking_optimized/FINAL-EXECUTION-STEPS.md
```

#### Option 2: Use Main Infrastructure
```powershell
# PowerShell (Windows)
cd infrastructure
.\deploy.ps1 -ResourceGroupName "ats-dev-rg" -Environment "dev" -Location "East US 2" -SqlAdminPassword "YourSecurePassword123!"

# Bash (Linux/macOS/WSL)
chmod +x deploy.sh
./deploy.sh -g "ats-dev-rg" -e "dev" -l "East US 2" -p "YourSecurePassword123!"
```

#### Post-Deployment Steps
1. **Connect GitHub Repository** to Azure Static Web App
2. **Set up Database Schema** using SQL scripts
3. **Configure Azure AI Search Index** for candidate search
4. **Set up Application Settings** with connection strings

## Development Workflow

This project follows a spec-driven development approach:

1. **Requirements**: Defined in `.kiro/specs/application-tracking-system/requirements.md`
2. **Design**: Detailed in `.kiro/specs/application-tracking-system/design.md`
3. **Tasks**: Implementation plan in `.kiro/specs/application-tracking-system/tasks.md`

## Contributing

1. Review the requirements and design documents
2. Follow the task implementation plan
3. Write tests for new functionality
4. Submit pull requests for review

## License

This project is licensed under the MIT License.