// Core data models for the Application Tracking System
// Optimized for Blob Storage + Azure AI Search architecture

/**
 * Candidate interface - represents a job candidate stored in Blob Storage
 * Simplified structure for blob-based storage with metadata
 */
export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  resumeUrl?: string;
  resumeFileName?: string;
  experienceSummary: string;
  visaStatus: 'Citizen' | 'GreenCard' | 'H1B' | 'F1OPT' | 'RequiresSponsorship';
  availability: 'Immediate' | 'TwoWeeks' | 'OneMonth' | 'NotAvailable';
  skills: string[];
  location: string;
  notes?: string;
  createdAt: string; // ISO string for JSON serialization
  updatedAt: string; // ISO string for JSON serialization
}

/**
 * CandidateSearchDocument - represents a candidate document in Azure AI Search
 * Optimized for search operations with flattened data structure
 */
export interface CandidateSearchDocument {
  candidateId: string; // Primary key for search index
  name: string;
  email: string;
  phone: string;
  visaStatus: string;
  availability: string;
  skills: string[]; // Searchable array
  location: string;
  experienceSummary: string;
  resumeFileName?: string;
  resumeContent: string; // Extracted text content from resume for search
  createdAt: string;
  updatedAt: string;
}

/**
 * BlobMetadata - represents metadata stored with candidate blobs
 */
export interface BlobMetadata {
  candidateId: string;
  candidateName: string;
  originalFileName?: string;
  uploadedAt: string;
  fileType?: string;
  fileSize?: number;
}

/**
 * JobDescription interface - represents client job requirements
 * Simplified for search-based matching
 */
export interface JobDescription {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  preferredSkills: string[];
  location: string;
  visaRequirement: string;
  experienceLevel: 'Entry' | 'Mid' | 'Senior' | 'Lead' | 'Executive';
  clientName: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * SearchQuery - represents a search request for candidates
 */
export interface SearchQuery {
  jobDescription: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  visaStatus?: string[];
  availability?: string[];
  location?: string;
  experienceLevel?: string;
}

/**
 * SearchResult - represents search results from Azure AI Search
 */
export interface SearchResult {
  candidates: CandidateSearchResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * CandidateSearchResult - represents a candidate in search results with relevance score
 */
export interface CandidateSearchResult extends Candidate {
  relevanceScore: number;
  matchingSkills: string[];
  highlightedText?: string;
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

// Base entity interface for blob-stored entities
export interface BaseEntity {
  id: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// Azure AI Search configuration
export interface SearchConfig {
  endpoint: string;
  apiKey: string;
  indexName: string;
}

// Blob Storage configuration
export interface BlobConfig {
  connectionString: string;
  containerName: string;
}

// File upload types
export interface FileUploadResult {
  fileName: string;
  fileSize: number;
  fileType: string;
  blobUrl: string;
  uploadedAt: string;
}