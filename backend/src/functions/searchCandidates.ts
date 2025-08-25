import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { CandidateSearchDocument, SearchQuery, SearchResult } from '../shared/types';
import { searchProfiles, searchResultFields } from '../shared/searchConfig';

const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME || 'candidates-index';

if (!searchEndpoint || !searchApiKey) {
    throw new Error('Azure Search configuration missing');
}

const searchClient = new SearchClient<CandidateSearchDocument>(
    searchEndpoint,
    searchIndexName,
    new AzureKeyCredential(searchApiKey)
);

/**
 * Advanced candidate search with multiple search modes and filtering
 */
export async function searchCandidates(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Searching candidates');

    try {
        // Parse search parameters
        const searchText = request.query.get('q') || '*';
        const searchMode = request.query.get('mode') || 'general';
        const page = parseInt(request.query.get('page') || '1');
        const pageSize = Math.min(parseInt(request.query.get('size') || '20'), 100);
        const skip = (page - 1) * pageSize;

        // Get filters from query parameters
        const filters = buildSearchFilters(request);
        const orderBy = buildOrderBy(request);

        context.log(`Search: "${searchText}", Mode: ${searchMode}, Page: ${page}, Size: ${pageSize}`);

        // Get search profile configuration
        const profile = searchProfiles[searchMode as keyof typeof searchProfiles] || searchProfiles.general;
        
        // Build search options
        const searchOptions = {
            top: pageSize,
            skip: skip,
            filter: filters.length > 0 ? filters.join(' and ') : undefined,
            orderBy: orderBy.length > 0 ? orderBy : undefined,
            select: searchResultFields.detailed,
            includeTotalCount: true,
            facets: profile.facets
        };

        // Perform search
        const searchResults = await searchClient.search(searchText, searchOptions);

        // Process results
        const candidates = [];
        for await (const result of searchResults.results) {
            const candidate = {
                candidateId: result.document.candidateId,
                name: result.document.name,
                email: result.document.email,
                phone: result.document.phone,
                location: result.document.location,
                skills: result.document.skills,
                experienceSummary: result.document.experienceSummary,
                visaStatus: result.document.visaStatus,
                availability: result.document.availability,
                resumeFileName: result.document.resumeFileName,
                createdAt: result.document.createdAt,
                updatedAt: result.document.updatedAt,
                relevanceScore: result.score || 0,
                highlights: result.highlights || {}
            };
            candidates.push(candidate);
        }

        // Build response
        const response: SearchResult = {
            candidates: candidates as any,
            totalCount: searchResults.count || 0,
            page: page,
            pageSize: pageSize,
            hasMore: (searchResults.count || 0) > skip + pageSize
        };

        // Add facets if available
        if (searchResults.facets) {
            (response as any).facets = searchResults.facets;
        }

        context.log(`Found ${candidates.length} candidates (${searchResults.count} total)`);

        return {
            status: 200,
            jsonBody: response
        };

    } catch (error) {
        context.log('Error searching candidates:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Search failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Job-specific candidate matching with relevance scoring
 */
export async function matchCandidatesForJob(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Matching candidates for job');

    try {
        const requestBody = await request.json() as SearchQuery;
        
        if (!requestBody.jobDescription) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Job description is required'
                }
            };
        }

        // Build search query from job requirements
        const searchTerms = [];
        
        // Add job description
        searchTerms.push(requestBody.jobDescription);
        
        // Add required skills with boost
        if (requestBody.requiredSkills && requestBody.requiredSkills.length > 0) {
            const skillsQuery = requestBody.requiredSkills.map(skill => `skills:"${skill}"`).join(' OR ');
            searchTerms.push(`(${skillsQuery})`);
        }

        const searchText = searchTerms.join(' AND ');
        
        // Build filters
        const filters = [];
        
        if (requestBody.visaStatus && requestBody.visaStatus.length > 0) {
            const visaFilter = requestBody.visaStatus.map(status => `visaStatus eq '${status}'`).join(' or ');
            filters.push(`(${visaFilter})`);
        }
        
        if (requestBody.availability && requestBody.availability.length > 0) {
            const availabilityFilter = requestBody.availability.map(avail => `availability eq '${avail}'`).join(' or ');
            filters.push(`(${availabilityFilter})`);
        }
        
        if (requestBody.location) {
            filters.push(`search.ismatch('${requestBody.location}', 'location')`);
        }

        // Search options optimized for job matching
        const searchOptions = {
            top: 20,
            skip: 0,
            filter: filters.length > 0 ? filters.join(' and ') : undefined,
            select: searchResultFields.detailed,
            includeTotalCount: true,
            facets: ['skills', 'visaStatus', 'availability']
        };

        // Perform search
        const searchResults = await searchClient.search(searchText, searchOptions);

        // Process and score results
        const candidates = [];
        for await (const result of searchResults.results) {
            const candidate = {
                candidateId: result.document.candidateId,
                name: result.document.name,
                email: result.document.email,
                phone: result.document.phone,
                location: result.document.location,
                skills: result.document.skills,
                experienceSummary: result.document.experienceSummary,
                visaStatus: result.document.visaStatus,
                availability: result.document.availability,
                resumeFileName: result.document.resumeFileName,
                createdAt: result.document.createdAt,
                updatedAt: result.document.updatedAt,
                relevanceScore: result.score || 0,
                matchingSkills: calculateMatchingSkills(result.document.skills, requestBody.requiredSkills || []),
                highlights: result.highlights || {}
            };
            candidates.push(candidate);
        }

        context.log(`Found ${candidates.length} matching candidates`);

        return {
            status: 200,
            jsonBody: {
                candidates,
                totalCount: searchResults.count || 0,
                searchQuery: {
                    jobDescription: requestBody.jobDescription,
                    requiredSkills: requestBody.requiredSkills,
                    filters: {
                        visaStatus: requestBody.visaStatus,
                        availability: requestBody.availability,
                        location: requestBody.location
                    }
                },
                facets: searchResults.facets || {}
            }
        };

    } catch (error) {
        context.log('Error matching candidates for job:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Job matching failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Get search suggestions for autocomplete
 */
export async function getSearchSuggestions(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting search suggestions');

    try {
        const searchText = request.query.get('q') || '';
        const suggesterName = 'candidate-suggester';
        
        if (searchText.length < 2) {
            return {
                status: 200,
                jsonBody: {
                    suggestions: []
                }
            };
        }

        // Get suggestions from search service
        const suggestResult = await searchClient.suggest(searchText, suggesterName, {
            top: 10,
            highlightPreTag: '<mark>',
            highlightPostTag: '</mark>'
        });

        const suggestions = suggestResult.results.map(result => ({
            text: result.text,
            document: result.document
        }));

        return {
            status: 200,
            jsonBody: {
                suggestions,
                query: searchText
            }
        };

    } catch (error) {
        context.log('Error getting search suggestions:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get suggestions',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Get search facets for filtering UI
 */
export async function getSearchFacets(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting search facets');

    try {
        // Perform empty search to get all facets
        const searchResults = await searchClient.search('*', {
            top: 0,
            facets: ['skills', 'location', 'visaStatus', 'availability'],
            includeTotalCount: true
        });

        return {
            status: 200,
            jsonBody: {
                facets: searchResults.facets || {},
                totalCandidates: searchResults.count || 0
            }
        };

    } catch (error) {
        context.log('Error getting search facets:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get facets',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Build search filters from request parameters
 */
function buildSearchFilters(request: HttpRequest): string[] {
    const filters: string[] = [];

    // Skills filter
    const skills = request.query.get('skills');
    if (skills) {
        const skillList = skills.split(',').map(s => s.trim());
        const skillFilter = skillList.map(skill => `skills/any(s: s eq '${skill}')`).join(' or ');
        filters.push(`(${skillFilter})`);
    }

    // Location filter
    const location = request.query.get('location');
    if (location) {
        filters.push(`search.ismatch('${location}', 'location')`);
    }

    // Visa status filter
    const visaStatus = request.query.get('visaStatus');
    if (visaStatus) {
        const visaList = visaStatus.split(',').map(v => v.trim());
        const visaFilter = visaList.map(visa => `visaStatus eq '${visa}'`).join(' or ');
        filters.push(`(${visaFilter})`);
    }

    // Availability filter
    const availability = request.query.get('availability');
    if (availability) {
        const availList = availability.split(',').map(a => a.trim());
        const availFilter = availList.map(avail => `availability eq '${avail}'`).join(' or ');
        filters.push(`(${availFilter})`);
    }

    // Date range filters
    const createdAfter = request.query.get('createdAfter');
    if (createdAfter) {
        filters.push(`createdAt ge ${createdAfter}`);
    }

    const updatedAfter = request.query.get('updatedAfter');
    if (updatedAfter) {
        filters.push(`updatedAt ge ${updatedAfter}`);
    }

    return filters;
}

/**
 * Build order by clause from request parameters
 */
function buildOrderBy(request: HttpRequest): string[] {
    const orderBy: string[] = [];
    
    const sortBy = request.query.get('sortBy');
    const sortOrder = request.query.get('sortOrder') || 'asc';

    if (sortBy) {
        switch (sortBy) {
            case 'name':
                orderBy.push(`name ${sortOrder}`);
                break;
            case 'location':
                orderBy.push(`location ${sortOrder}`);
                break;
            case 'created':
                orderBy.push(`createdAt ${sortOrder}`);
                break;
            case 'updated':
                orderBy.push(`updatedAt ${sortOrder}`);
                break;
            case 'relevance':
                // Relevance is default, no explicit order needed
                break;
        }
    }

    return orderBy;
}

/**
 * Calculate matching skills between candidate and job requirements
 */
function calculateMatchingSkills(candidateSkills: string[], requiredSkills: string[]): string[] {
    if (!candidateSkills || !requiredSkills) return [];
    
    return candidateSkills.filter(skill => 
        requiredSkills.some(required => 
            skill.toLowerCase().includes(required.toLowerCase()) ||
            required.toLowerCase().includes(skill.toLowerCase())
        )
    );
}

// Register HTTP functions
app.http('searchCandidates', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/candidates',
    handler: searchCandidates
});

app.http('matchCandidatesForJob', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'search/match',
    handler: matchCandidatesForJob
});

app.http('getSearchSuggestions', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/suggestions',
    handler: getSearchSuggestions
});

app.http('getSearchFacets', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/facets',
    handler: getSearchFacets
});