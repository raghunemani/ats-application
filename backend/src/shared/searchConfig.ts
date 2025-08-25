/**
 * Azure AI Search Index Configuration for Candidates
 * Optimized for recruiter search scenarios and job matching
 */

export const CANDIDATES_INDEX_NAME = 'candidates-index';

/**
 * Search index schema for candidate documents
 * Using simplified field definitions compatible with Azure Search SDK
 */
export const candidatesIndexDefinition = {
  name: CANDIDATES_INDEX_NAME,
  fields: [
    // Primary key
    {
      name: 'candidateId',
      type: 'Edm.String',
      key: true,
      searchable: false,
      filterable: true,
      sortable: false,
      facetable: false
    },
    
    // Basic candidate information
    {
      name: 'name',
      type: 'Edm.String',
      searchable: true,
      filterable: true,
      sortable: true,
      facetable: false,
      analyzer: 'standard.lucene'
    },
    
    {
      name: 'email',
      type: 'Edm.String',
      searchable: true,
      filterable: true,
      sortable: false,
      facetable: false
    },
    
    {
      name: 'phone',
      type: 'Edm.String',
      searchable: false,
      filterable: false,
      sortable: false,
      facetable: false
    },
    
    // Location and availability
    {
      name: 'location',
      type: 'Edm.String',
      searchable: true,
      filterable: true,
      sortable: true,
      facetable: true,
      analyzer: 'standard.lucene'
    },
    
    {
      name: 'visaStatus',
      type: 'Edm.String',
      searchable: false,
      filterable: true,
      sortable: false,
      facetable: true
    },
    
    {
      name: 'availability',
      type: 'Edm.String',
      searchable: false,
      filterable: true,
      sortable: false,
      facetable: true
    },
    
    // Skills and experience - optimized for search
    {
      name: 'skills',
      type: 'Collection(Edm.String)',
      searchable: true,
      filterable: true,
      sortable: false,
      facetable: true
    },
    
    {
      name: 'experienceSummary',
      type: 'Edm.String',
      searchable: true,
      filterable: false,
      sortable: false,
      facetable: false,
      analyzer: 'standard.lucene'
    },
    
    // Resume content for full-text search
    {
      name: 'resumeContent',
      type: 'Edm.String',
      searchable: true,
      filterable: false,
      sortable: false,
      facetable: false,
      analyzer: 'standard.lucene'
    },
    
    {
      name: 'resumeFileName',
      type: 'Edm.String',
      searchable: false,
      filterable: false,
      sortable: false,
      facetable: false
    },
    
    // Metadata for sorting and filtering
    {
      name: 'createdAt',
      type: 'Edm.DateTimeOffset',
      searchable: false,
      filterable: true,
      sortable: true,
      facetable: false
    },
    
    {
      name: 'updatedAt',
      type: 'Edm.DateTimeOffset',
      searchable: false,
      filterable: true,
      sortable: true,
      facetable: false
    }
  ]
};

/**
 * Search suggester configuration for autocomplete
 */
export const candidatesSuggester = {
  name: 'candidate-suggester',
  searchMode: 'analyzingInfixMatching',
  sourceFields: ['name', 'skills', 'location', 'experienceSummary']
};

/**
 * Common search parameters for different search scenarios
 */
export const searchProfiles = {
  // General candidate search
  general: {
    searchMode: 'any',
    queryType: 'simple',
    top: 50,
    skip: 0,
    includeTotalCount: true,
    facets: ['skills', 'location', 'visaStatus', 'availability']
  },
  
  // Job-specific candidate matching
  jobMatch: {
    searchMode: 'all',
    queryType: 'full',
    top: 20,
    skip: 0,
    includeTotalCount: true,
    facets: ['skills', 'visaStatus', 'availability'],
    highlightFields: ['skills', 'experienceSummary', 'resumeContent']
  },
  
  // Semantic search for natural language queries
  semantic: {
    searchMode: 'any',
    queryType: 'semantic',
    top: 20,
    skip: 0,
    includeTotalCount: true,
    facets: ['skills', 'location', 'visaStatus']
  }
};

/**
 * Field mappings for different search result formats
 */
export const searchResultFields = {
  summary: ['candidateId', 'name', 'location', 'skills', 'visaStatus', 'availability', 'updatedAt'] as const,
  detailed: ['candidateId', 'name', 'email', 'phone', 'location', 'skills', 'experienceSummary', 'visaStatus', 'availability', 'resumeFileName', 'createdAt', 'updatedAt'] as const,
  minimal: ['candidateId', 'name', 'skills', 'location'] as const
};

/**
 * Scoring profile for relevance tuning
 */
export const skillsBoostScoringProfile = {
  name: 'skillsBoost',
  textWeights: {
    skills: 3.0,
    experienceSummary: 2.0,
    resumeContent: 1.5,
    name: 1.0
  }
};