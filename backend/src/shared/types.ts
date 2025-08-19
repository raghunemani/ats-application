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
  createdAt: Date;
  updatedAt: Date;
}

export interface Experience {
  company: string;
  title: string;
  duration: string;
  description: string;
  technologies: string[];
}

export interface JobDescription {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  preferredSkills: string[];
  location: string;
  visaRequirement: string;
  createdAt: Date;
}

export interface EmailCampaign {
  id: string;
  name: string;
  jobDescriptionId: string;
  candidateIds: string[];
  emailTemplate: string;
  subject: string;
  status: 'Draft' | 'Sent' | 'Scheduled';
  sentAt?: Date;
  analytics: CampaignAnalytics;
}

export interface CampaignAnalytics {
  totalSent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}