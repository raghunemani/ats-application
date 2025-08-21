-- Azure SQL Database Schema for Application Tracking System
-- This script creates the core tables that match our TypeScript interfaces
SET
    ANSI_NULLS ON;

SET
    QUOTED_IDENTIFIER ON;

-- =============================================
-- Table: Candidates
-- Stores core candidate information
-- =============================================
CREATE TABLE Candidates (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID (),
    Name NVARCHAR (255) NOT NULL,
    Email NVARCHAR (255) NOT NULL UNIQUE,
    Phone NVARCHAR (50),
    ResumeUrl NVARCHAR (1000),
    ExperienceSummary NVARCHAR (MAX),
    VisaStatus NVARCHAR (50) NOT NULL CHECK (
        VisaStatus IN (
            'Citizen',
            'GreenCard',
            'H1B',
            'F1OPT',
            'RequiresSponsorship'
        )
    ),
    Availability NVARCHAR (50) NOT NULL CHECK (
        Availability IN (
            'Immediate',
            'TwoWeeks',
            'OneMonth',
            'NotAvailable'
        )
    ),
    Skills NVARCHAR (MAX), -- JSON array of skills
    Location NVARCHAR (255),
    SalaryExpectation DECIMAL(10, 2),
    LinkedInUrl NVARCHAR (500),
    GithubUrl NVARCHAR (500),
    PortfolioUrl NVARCHAR (500),
    Notes NVARCHAR (MAX),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    -- Indexes for performance
    INDEX IX_Candidates_Email (Email),
    INDEX IX_Candidates_VisaStatus (VisaStatus),
    INDEX IX_Candidates_Availability (Availability)
);

-- =============================================
-- Table: CandidateExperience
-- Stores work experience for candidates
-- =============================================
CREATE TABLE CandidateExperience (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID (),
    CandidateId UNIQUEIDENTIFIER NOT NULL,
    Company NVARCHAR (255) NOT NULL,
    Title NVARCHAR (255) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE, -- NULL if current position
    Duration NVARCHAR (100), -- e.g., "2 years 3 months"
    Description NVARCHAR (MAX),
    Technologies NVARCHAR (MAX), -- JSON array of technologies
    Achievements NVARCHAR (MAX), -- JSON array of achievements
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    -- Foreign key constraint
    CONSTRAINT FK_CandidateExperience_Candidate FOREIGN KEY (CandidateId) REFERENCES Candidates (Id) ON DELETE CASCADE,
    -- Indexes
    INDEX IX_CandidateExperience_CandidateId (CandidateId)
);

-- =============================================
-- Table: CandidateEducation
-- Stores education information for candidates
-- =============================================
CREATE TABLE CandidateEducation (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID (),
    CandidateId UNIQUEIDENTIFIER NOT NULL,
    Institution NVARCHAR (255) NOT NULL,
    Degree NVARCHAR (255) NOT NULL,
    FieldOfStudy NVARCHAR (255) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE,
    GPA DECIMAL(3, 2), -- e.g., 3.85
    Achievements NVARCHAR (MAX), -- JSON array of achievements
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    -- Foreign key constraint
    CONSTRAINT FK_CandidateEducation_Candidate FOREIGN KEY (CandidateId) REFERENCES Candidates (Id) ON DELETE CASCADE,
    -- Indexes
    INDEX IX_CandidateEducation_CandidateId (CandidateId)
);

-- =============================================
-- Table: JobDescriptions
-- Stores client job requirements (IT staffing focused)
-- =============================================
CREATE TABLE JobDescriptions (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID (),
    Title NVARCHAR (255) NOT NULL,
    Description NVARCHAR (MAX) NOT NULL,
    Requirements NVARCHAR (MAX), -- JSON array of requirements
    PreferredSkills NVARCHAR (MAX), -- JSON array of preferred skills
    Location NVARCHAR (255),
    WorkType NVARCHAR (50) NOT NULL CHECK (WorkType IN ('Remote', 'Hybrid', 'OnSite')),
    EmploymentType NVARCHAR (50) NOT NULL CHECK (
        EmploymentType IN ('FullTime', 'PartTime', 'Contract', 'Internship')
    ),
    VisaRequirement NVARCHAR (255), -- What visa status is acceptable
    ExperienceLevel NVARCHAR (50) NOT NULL CHECK (
        ExperienceLevel IN ('Entry', 'Mid', 'Senior', 'Lead', 'Executive')
    ),
    Department NVARCHAR (255),
    ClientName NVARCHAR (255) NOT NULL, -- IT Staffing - which client
    Priority NVARCHAR (50) NOT NULL CHECK (Priority IN ('Low', 'Medium', 'High', 'Urgent')),
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    -- Indexes for performance
    INDEX IX_JobDescriptions_ClientName (ClientName),
    INDEX IX_JobDescriptions_Priority (Priority),
    INDEX IX_JobDescriptions_IsActive (IsActive)
);

-- =============================================
-- Table: EmailCampaigns
-- Stores email campaign information
-- =============================================
CREATE TABLE EmailCampaigns (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID (),
    Name NVARCHAR (255) NOT NULL,
    Description NVARCHAR (MAX),
    JobDescriptionId UNIQUEIDENTIFIER NOT NULL,
    EmailTemplate NVARCHAR (MAX) NOT NULL,
    Subject NVARCHAR (500) NOT NULL,
    Status NVARCHAR (50) NOT NULL CHECK (
        Status IN ('Draft', 'Sent', 'Scheduled', 'Failed')
    ),
    ScheduledAt DATETIME2,
    SentAt DATETIME2,
    CreatedBy NVARCHAR (255) NOT NULL, -- User identifier
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    -- Foreign key constraint
    CONSTRAINT FK_EmailCampaigns_JobDescription FOREIGN KEY (JobDescriptionId) REFERENCES JobDescriptions (Id) ON DELETE CASCADE,
    -- Indexes
    INDEX IX_EmailCampaigns_Status (Status),
    INDEX IX_EmailCampaigns_JobDescriptionId (JobDescriptionId)
);

-- =============================================
-- Table: CampaignCandidates
-- Junction table for campaign-candidate relationships with analytics
-- =============================================
CREATE TABLE CampaignCandidates (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID (),
    CampaignId UNIQUEIDENTIFIER NOT NULL,
    CandidateId UNIQUEIDENTIFIER NOT NULL,
    -- Email analytics tracking
    EmailSent BIT NOT NULL DEFAULT 0,
    EmailDelivered BIT NOT NULL DEFAULT 0,
    EmailOpened BIT NOT NULL DEFAULT 0,
    EmailClicked BIT NOT NULL DEFAULT 0,
    EmailReplied BIT NOT NULL DEFAULT 0,
    -- Timestamps for analytics
    SentAt DATETIME2,
    DeliveredAt DATETIME2,
    OpenedAt DATETIME2,
    ClickedAt DATETIME2,
    RepliedAt DATETIME2,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE (),
    -- Foreign key constraints
    CONSTRAINT FK_CampaignCandidates_Campaign FOREIGN KEY (CampaignId) REFERENCES EmailCampaigns (Id) ON DELETE CASCADE,
    CONSTRAINT FK_CampaignCandidates_Candidate FOREIGN KEY (CandidateId) REFERENCES Candidates (Id) ON DELETE CASCADE,
    -- Unique constraint to prevent duplicate entries
    CONSTRAINT UQ_CampaignCandidates_Campaign_Candidate UNIQUE (CampaignId, CandidateId),
    -- Indexes
    INDEX IX_CampaignCandidates_CampaignId (CampaignId),
    INDEX IX_CampaignCandidates_CandidateId (CandidateId)
);

-- =============================================
-- Create triggers for UpdatedAt timestamps
-- =============================================
-- Trigger for Candidates table
CREATE TRIGGER TR_Candidates_UpdatedAt ON Candidates AFTER
UPDATE AS BEGIN
SET
    NOCOUNT ON;

UPDATE Candidates
SET
    UpdatedAt = GETUTCDATE ()
FROM
    Candidates c
    INNER JOIN inserted i ON c.Id = i.Id;

END;

GO
-- Trigger for CandidateExperience table
CREATE TRIGGER TR_CandidateExperience_UpdatedAt ON CandidateExperience AFTER
UPDATE AS BEGIN
SET
    NOCOUNT ON;

UPDATE CandidateExperience
SET
    UpdatedAt = GETUTCDATE ()
FROM
    CandidateExperience ce
    INNER JOIN inserted i ON ce.Id = i.Id;

END;

GO
-- Trigger for CandidateEducation table
CREATE TRIGGER TR_CandidateEducation_UpdatedAt ON CandidateEducation AFTER
UPDATE AS BEGIN
SET
    NOCOUNT ON;

UPDATE CandidateEducation
SET
    UpdatedAt = GETUTCDATE ()
FROM
    CandidateEducation ce
    INNER JOIN inserted i ON ce.Id = i.Id;

END;

GO
-- Trigger for JobDescriptions table
CREATE TRIGGER TR_JobDescriptions_UpdatedAt ON JobDescriptions AFTER
UPDATE AS BEGIN
SET
    NOCOUNT ON;

UPDATE JobDescriptions
SET
    UpdatedAt = GETUTCDATE ()
FROM
    JobDescriptions jd
    INNER JOIN inserted i ON jd.Id = i.Id;

END;

GO
-- Trigger for EmailCampaigns table
CREATE TRIGGER TR_EmailCampaigns_UpdatedAt ON EmailCampaigns AFTER
UPDATE AS BEGIN
SET
    NOCOUNT ON;

UPDATE EmailCampaigns
SET
    UpdatedAt = GETUTCDATE ()
FROM
    EmailCampaigns ec
    INNER JOIN inserted i ON ec.Id = i.Id;

END;

GO 

PRINT 'Database schema created successfully!';

PRINT 'Tables created: Candidates, CandidateExperience, CandidateEducation, JobDescriptions, EmailCampaigns, CampaignCandidates';

PRINT 'Triggers created for automatic UpdatedAt timestamp management';