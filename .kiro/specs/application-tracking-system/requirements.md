# Requirements Document

## Introduction

The Application Tracking System (ATS) is a recruiter-focused platform designed to help hiring managers and recruiters efficiently manage candidate information and match candidates to job opportunities. The system will store candidate resumes, experience summaries, contact details, VISA status, and availability information in Azure cloud storage. It features AI-powered search capabilities using Azure AI Search to find relevant candidates based on job descriptions, and automated email campaign functionality to reach out to matched candidates. The system is designed as a low-code solution hosted on Azure Static Web Apps for cost efficiency.

## Requirements

### Requirement 1

**User Story:** As a recruiter, I want to store and manage candidate information including resumes and personal details, so that I can maintain a comprehensive database of potential candidates.

#### Acceptance Criteria

1. WHEN a recruiter adds a new candidate THEN the system SHALL require candidate name, contact details, and resume upload
2. WHEN a recruiter adds candidate information THEN the system SHALL allow optional fields for experience summary, VISA status, and current availability
3. WHEN a candidate resume is uploaded THEN the system SHALL store the file securely in Azure Blob Storage
4. WHEN a recruiter views candidate details THEN the system SHALL display all stored information including downloadable resume

### Requirement 2

**User Story:** As a recruiter, I want to search for candidates using job descriptions, so that I can quickly find relevant candidates for open positions.

#### Acceptance Criteria

1. WHEN a recruiter enters a job description THEN the system SHALL use Azure AI Search to find matching candidates
2. WHEN search results are returned THEN the system SHALL display candidate name, relevant experience summary, contact details, and VISA status
3. WHEN a recruiter performs a search THEN the system SHALL rank candidates by relevance to the job description
4. WHEN search is completed THEN the system SHALL allow filtering results by VISA status and availability

### Requirement 3

**User Story:** As a recruiter, I want to launch email campaigns to reach out to matched candidates, so that I can efficiently communicate with multiple candidates about job opportunities.

#### Acceptance Criteria

1. WHEN a recruiter selects candidates from search results THEN the system SHALL allow creating an email campaign
2. WHEN an email campaign is created THEN the system SHALL use Gen AI to generate personalized email content based on job description and candidate profile
3. WHEN emails are sent THEN the system SHALL track delivery status and responses
4. WHEN a campaign is launched THEN the system SHALL log all email activities for audit purposes

### Requirement 4

**User Story:** As a recruiter, I want the system to be hosted on Azure with minimal cost, so that I can maintain the platform within budget constraints.

#### Acceptance Criteria

1. WHEN the system is deployed THEN it SHALL be hosted on Azure Static Web Apps for cost efficiency
2. WHEN data is stored THEN it SHALL use Azure Blob Storage for resume files and Azure SQL Database for structured data
3. WHEN the system scales THEN it SHALL automatically adjust resources based on usage to minimize costs
4. WHEN monitoring costs THEN the system SHALL provide usage analytics to track Azure resource consumption

### Requirement 5

**User Story:** As a recruiter, I want to manage candidate VISA status and availability, so that I can match candidates to positions based on their eligibility and timeline.

#### Acceptance Criteria

1. WHEN a recruiter adds candidate information THEN the system SHALL allow selection of VISA status from predefined options (Citizen, Green Card, H1B, F1 OPT, Requires Sponsorship)
2. WHEN availability is updated THEN the system SHALL store current availability status (Immediately Available, 2 weeks notice, 1 month notice, Not Available)
3. WHEN searching candidates THEN the system SHALL allow filtering by VISA status and availability
4. WHEN candidate details are viewed THEN the system SHALL prominently display VISA status and availability information

### Requirement 6

**User Story:** As a recruiter, I want the system to leverage Gen AI and MCP servers for enhanced functionality, so that I can benefit from advanced AI capabilities for candidate matching and communication.

#### Acceptance Criteria

1. WHEN processing resumes THEN the system SHALL use Gen AI to extract and summarize relevant experience
2. WHEN generating email content THEN the system SHALL use Gen AI to create personalized outreach messages
3. WHEN integrating with external services THEN the system SHALL use MCP servers for standardized communication
4. WHEN AI features are used THEN the system SHALL provide transparency about AI-generated content

### Requirement 7

**User Story:** As a recruiter, I want a low-code interface for system configuration and management, so that I can customize the system without requiring extensive technical knowledge.

#### Acceptance Criteria

1. WHEN configuring search parameters THEN the system SHALL provide a visual interface for setting up AI search criteria
2. WHEN customizing email templates THEN the system SHALL offer drag-and-drop email builder functionality
3. WHEN managing candidate fields THEN the system SHALL allow adding custom fields through configuration interface
4. WHEN setting up integrations THEN the system SHALL provide guided setup wizards for connecting external services