// Core data models for the Application Tracking System

/**
 * Candidate interface - represents a job candidate in the IT staffing system
 * Stores comprehensive candidate information including personal details, 
 * skills, experience, and availability status
 */
export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  resumeUrl: string;
  experienceSummary: string;
  visaStatus: 'Citizen' | 'GreenCard' | 'H1B' | 'F1OPT' | 'RequiresSponsorship';
  availability: 'Immediate' | 'TwoWeeks' | 'OneMonth' | 'NotAvailable';
  skills: string[];
  experience: Experience[];
  education: Education[];
  location: string;
  salaryExpectation?: number;
  linkedInUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Experience interface - represents work experience for a candidate
 */
export interface Experience {
  id: string;
  company: string;
  title: string;
  startDate: Date;
  endDate?: Date; // null if current position
  duration: string; // e.g., "2 years 3 months"
  description: string;
  technologies: string[];
  achievements?: string[];
}

/**
 * Education interface - represents educational background for a candidate
 */
export interface Education {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: Date;
  endDate?: Date;
  gpa?: number;
  achievements?: string[];
}

/**
 * JobDescription interface - represents client job requirements
 * For IT staffing, this contains the job details from clients
 * Note: No salary range as this is client requirements, not what we pay candidates
 */
export interface JobDescription {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  preferredSkills: string[];
  location: string;
  workType: 'Remote' | 'Hybrid' | 'OnSite';
  employmentType: 'FullTime' | 'PartTime' | 'Contract' | 'Internship';
  visaRequirement: string; // What visa status is acceptable for this role
  experienceLevel: 'Entry' | 'Mid' | 'Senior' | 'Lead' | 'Executive';
  department: string;
  clientName: string; // IT Staffing - which client this job is for
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * EmailCampaign interface - represents an email outreach campaign
 * Used to send personalized emails to selected candidates about job opportunities
 */
export interface EmailCampaign {
  id: string;
  name: string;
  description?: string;
  jobDescriptionId: string;
  candidateIds: string[];
  emailTemplate: string;
  subject: string;
  status: 'Draft' | 'Sent' | 'Scheduled' | 'Failed';
  scheduledAt?: Date;
  sentAt?: Date;
  createdBy: string; // User who created the campaign
  analytics: CampaignAnalytics;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CampaignAnalytics interface - tracks email campaign performance metrics
 */
export interface CampaignAnalytics {
  totalSent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorDetails;
  timestamp: string;
}

export interface ErrorDetails {
  code: string;
  message: string;
  details?: any;
}

export interface ErrorResponse {
  error: ErrorDetails & {
    timestamp: string;
  };
}

// Database entity base interface
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Search and filtering types
export interface SearchFilters {
  skills?: string[];
  visaStatus?: string[];
  availability?: string[];
  location?: string;
  experienceLevel?: string[];
  salaryRange?: {
    min?: number;
    max?: number;
  };
}

export interface SearchResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}