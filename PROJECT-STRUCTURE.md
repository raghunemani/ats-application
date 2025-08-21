# Application Tracking System - Project Structure

## Task 2 Completed: Core Data Models and Database Schema

### Essential Files for Task 2:

```
application-tracking-system/
├── backend/
│   ├── src/
│   │   ├── database/
│   │   │   ├── __tests__/
│   │   │   │   ├── config.test.ts          # Unit tests for database utilities
│   │   │   │   └── README.md               # Test documentation
│   │   │   ├── config.ts                   # Database connection utilities
│   │   │   └── schema.sql                  # Azure SQL Database schema
│   │   ├── shared/
│   │   │   ├── config.ts                   # Shared configuration
│   │   │   └── types.ts                    # TypeScript interfaces
│   │   ├── functions/
│   │   │   └── healthCheck.ts              # Health check function
│   │   └── __tests__/
│   │       └── setup.ts                    # Jest test setup
│   ├── jest.config.js                      # Jest configuration
│   ├── package.json                        # Dependencies and scripts
│   ├── tsconfig.json                       # TypeScript configuration
│   ├── host.json                           # Azure Functions configuration
│   └── local.settings.json                 # Local development settings
├── .kiro/
│   └── specs/
│       └── application-tracking-system/    # Project specifications
├── frontend/                               # React frontend (basic setup)
├── infrastructure/                         # Azure deployment scripts
└── README.md                              # Project documentation
```

## Task 2 Deliverables:

### ✅ Sub-task 2.1: TypeScript Interfaces
- **File**: `backend/src/shared/types.ts`
- **Contains**: Candidate, JobDescription, EmailCampaign, Experience, Education interfaces
- **Features**: IT staffing focused, proper VISA status handling, JSON field support

### ✅ Sub-task 2.2: Database Schema
- **File**: `backend/src/database/schema.sql`
- **Contains**: 6 tables with relationships, indexes, and constraints
- **Tables**: Candidates, CandidateExperience, CandidateEducation, JobDescriptions, EmailCampaigns, CampaignCandidates
- **Features**: Azure SQL optimized, JSON field support, proper foreign keys

### ✅ Sub-task 2.3: Database Connection Utilities
- **File**: `backend/src/database/config.ts`
- **Contains**: Connection pooling, query utilities, health checks
- **Features**: Environment-based config, Azure MSI support, error handling

### ✅ Sub-task 2.4: Unit Tests
- **File**: `backend/src/database/__tests__/config.test.ts`
- **Contains**: Comprehensive tests for all database utilities
- **Coverage**: ID generation, JSON conversion, configuration, error handling

## How to Use:

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Run Tests
```bash
npm test
```

### 3. Deploy Database Schema
```bash
# Connect to Azure SQL Database using Azure Data Studio
# Run the schema.sql file
```

### 4. Configure Environment Variables
```bash
# Set in local.settings.json or environment
DB_SERVER=your-server.database.windows.net
DB_NAME=ApplicationTrackingSystem
DB_USER=your-username
DB_PASSWORD=your-password
```

## Next Steps:
- Task 3: Build candidate management backend API
- Task 4: Implement Azure AI Search integration
- Task 5: Integrate Azure OpenAI Service for Gen AI features

## Files Removed:
- Duplicate schema files (schema-simple.sql, triggers.sql)
- Empty migration and repository directories
- Deployment documentation files
- Unnecessary configuration files

This clean structure focuses on the essential Task 2 deliverables and provides a solid foundation for the next development phases.