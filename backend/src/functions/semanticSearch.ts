import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { CandidateSearchDocument } from '../shared/types';

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
 * Semantic search using natural language queries
 * Leverages Azure AI Search semantic capabilities
 */
export async function semanticCandidateSearch(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Performing semantic candidate search');

    try {
        const query = request.query.get('q') || '';
        const top = Math.min(parseInt(request.query.get('top') || '20'), 50);
        const skip = parseInt(request.query.get('skip') || '0');

        if (!query || query.trim().length < 3) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Query must be at least 3 characters long'
                }
            };
        }

        context.log(`Semantic search query: "${query}"`);

        // Perform semantic search
        const searchOptions = {
            queryType: 'semantic' as const,
            semanticSearchOptions: {
                configurationName: 'candidate-semantic-config',
                captions: {
                    captionType: 'extractive' as const
                },
                answers: {
                    answerType: 'extractive' as const
                }
            },
            top: top,
            skip: skip,
            includeTotalCount: true,
            select: [
                'candidateId', 'name', 'email', 'phone', 'location', 
                'skills', 'experienceSummary', 'visaStatus', 'availability',
                'resumeFileName', 'createdAt', 'updatedAt'
            ] as const,
            facets: ['skills', 'location', 'visaStatus', 'availability']
        };

        const searchResults = await searchClient.search(query, searchOptions);

        // Process results with semantic ranking
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
                semanticScore: result.score || 0,
                captions: result.captions || [],
                highlights: result.highlights || {}
            };
            candidates.push(candidate);
        }

        context.log(`Semantic search found ${candidates.length} candidates`);

        return {
            status: 200,
            jsonBody: {
                query: query,
                candidates: candidates,
                totalCount: searchResults.count || 0,
                facets: searchResults.facets || {},
                answers: searchResults.answers || [],
                searchType: 'semantic'
            }
        };

    } catch (error) {
        context.log('Error in semantic search:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Semantic search failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Intelligent job matching using semantic understanding
 */
export async function intelligentJobMatching(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Performing intelligent job matching');

    try {
        const requestBody = await request.json() as {
            jobTitle: string;
            jobDescription: string;
            requiredSkills?: string[];
            preferredSkills?: string[];
            experienceLevel?: string;
            location?: string;
            visaRequirement?: string;
            maxResults?: number;
        };

        if (!requestBody.jobTitle || !requestBody.jobDescription) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Job title and description are required'
                }
            };
        }

        // Build semantic query from job requirements
        const queryParts = [
            requestBody.jobTitle,
            requestBody.jobDescription
        ];

        if (requestBody.requiredSkills && requestBody.requiredSkills.length > 0) {
            queryParts.push(`Required skills: ${requestBody.requiredSkills.join(', ')}`);
        }

        if (requestBody.experienceLevel) {
            queryParts.push(`Experience level: ${requestBody.experienceLevel}`);
        }

        const semanticQuery = queryParts.join('. ');

        // Build filters
        const filters = [];
        
        if (requestBody.location) {
            filters.push(`search.ismatch('${requestBody.location}', 'location')`);
        }

        if (requestBody.visaRequirement) {
            filters.push(`visaStatus eq '${requestBody.visaRequirement}'`);
        }

        // Perform semantic search with job context
        const searchOptions = {
            queryType: 'semantic' as const,
            semanticSearchOptions: {
                configurationName: 'candidate-semantic-config',
                captions: {
                    captionType: 'extractive' as const
                }
            },
            top: requestBody.maxResults || 20,
            includeTotalCount: true,
            filter: filters.length > 0 ? filters.join(' and ') : undefined,
            select: [
                'candidateId', 'name', 'email', 'phone', 'location',
                'skills', 'experienceSummary', 'visaStatus', 'availability',
                'resumeFileName', 'createdAt', 'updatedAt'
            ] as const,
            facets: ['skills', 'visaStatus', 'availability']
        };

        const searchResults = await searchClient.search(semanticQuery, searchOptions);

        // Process and score results
        const matchedCandidates = [];
        for await (const result of searchResults.results) {
            const skillsMatch = calculateSkillsMatch(
                result.document.skills,
                requestBody.requiredSkills || [],
                requestBody.preferredSkills || []
            );

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
                matchScore: {
                    semantic: result.score || 0,
                    skills: skillsMatch.score,
                    overall: calculateOverallScore(result.score || 0, skillsMatch.score)
                },
                matchDetails: {
                    requiredSkillsMatched: skillsMatch.requiredMatched,
                    preferredSkillsMatched: skillsMatch.preferredMatched,
                    totalSkillsMatched: skillsMatch.totalMatched,
                    captions: result.captions || []
                }
            };
            matchedCandidates.push(candidate);
        }

        // Sort by overall match score
        matchedCandidates.sort((a, b) => b.matchScore.overall - a.matchScore.overall);

        context.log(`Intelligent matching found ${matchedCandidates.length} candidates for job: ${requestBody.jobTitle}`);

        return {
            status: 200,
            jsonBody: {
                jobRequirements: {
                    title: requestBody.jobTitle,
                    description: requestBody.jobDescription,
                    requiredSkills: requestBody.requiredSkills || [],
                    preferredSkills: requestBody.preferredSkills || [],
                    experienceLevel: requestBody.experienceLevel,
                    location: requestBody.location,
                    visaRequirement: requestBody.visaRequirement
                },
                candidates: matchedCandidates,
                totalCount: searchResults.count || 0,
                facets: searchResults.facets || {},
                searchType: 'intelligent-matching'
            }
        };

    } catch (error) {
        context.log('Error in intelligent job matching:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Intelligent job matching failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Natural language query processing
 * Converts natural language to structured search queries
 */
export async function naturalLanguageSearch(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Processing natural language search');

    try {
        const naturalQuery = request.query.get('q') || '';
        
        if (!naturalQuery || naturalQuery.trim().length < 5) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Natural language query must be at least 5 characters long'
                }
            };
        }

        context.log(`Natural language query: "${naturalQuery}"`);

        // Parse natural language query
        const parsedQuery = parseNaturalLanguageQuery(naturalQuery);
        
        // Build search query based on parsed intent
        const searchQuery = buildSearchQueryFromIntent(parsedQuery);

        // Perform search with enhanced query
        const searchOptions = {
            queryType: 'semantic' as const,
            semanticSearchOptions: {
                configurationName: 'candidate-semantic-config'
            },
            top: 20,
            includeTotalCount: true,
            filter: searchQuery.filters.length > 0 ? searchQuery.filters.join(' and ') : undefined,
            select: [
                'candidateId', 'name', 'email', 'location',
                'skills', 'experienceSummary', 'visaStatus', 'availability'
            ] as const,
            facets: ['skills', 'location', 'visaStatus', 'availability']
        };

        const searchResults = await searchClient.search(searchQuery.query, searchOptions);

        // Process results
        const candidates = [];
        for await (const result of searchResults.results) {
            candidates.push({
                candidateId: result.document.candidateId,
                name: result.document.name,
                email: result.document.email,
                location: result.document.location,
                skills: result.document.skills,
                experienceSummary: result.document.experienceSummary,
                visaStatus: result.document.visaStatus,
                availability: result.document.availability,
                relevanceScore: result.score || 0,
                highlights: result.highlights || {}
            });
        }

        return {
            status: 200,
            jsonBody: {
                originalQuery: naturalQuery,
                parsedIntent: parsedQuery,
                enhancedQuery: searchQuery.query,
                appliedFilters: searchQuery.filters,
                candidates: candidates,
                totalCount: searchResults.count || 0,
                facets: searchResults.facets || {},
                searchType: 'natural-language'
            }
        };

    } catch (error) {
        context.log('Error in natural language search:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Natural language search failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Parse natural language query to extract intent and entities
 */
function parseNaturalLanguageQuery(query: string): {
    skills: string[];
    location: string[];
    experience: string[];
    availability: string[];
    visaStatus: string[];
    intent: string;
} {
    const lowerQuery = query.toLowerCase();
    
    // Extract skills
    const skillPatterns = [
        /\b(javascript|js|typescript|ts|python|java|c#|php|ruby|go|rust|swift|kotlin)\b/gi,
        /\b(react|angular|vue|node|express|django|flask|spring|laravel)\b/gi,
        /\b(aws|azure|gcp|docker|kubernetes|jenkins|git)\b/gi,
        /\b(sql|mysql|postgresql|mongodb|redis|elasticsearch)\b/gi
    ];
    
    const skills: string[] = [];
    for (const pattern of skillPatterns) {
        const matches = query.match(pattern);
        if (matches) {
            skills.push(...matches);
        }
    }

    // Extract location
    const locationKeywords = ['in', 'from', 'located', 'based'];
    const location: string[] = [];
    for (const keyword of locationKeywords) {
        const regex = new RegExp(`${keyword}\\s+([a-zA-Z\\s,]+?)(?:\\s|$|,)`, 'gi');
        const matches = query.match(regex);
        if (matches) {
            location.push(...matches.map(m => m.replace(keyword, '').trim()));
        }
    }

    // Extract experience level
    const experiencePatterns = [
        /\b(junior|senior|lead|principal|entry.level|mid.level)\b/gi,
        /\b(\d+)\s*years?\s*(of\s*)?experience\b/gi
    ];
    
    const experience: string[] = [];
    for (const pattern of experiencePatterns) {
        const matches = query.match(pattern);
        if (matches) {
            experience.push(...matches);
        }
    }

    // Extract availability
    const availability: string[] = [];
    if (lowerQuery.includes('immediate')) availability.push('Immediate');
    if (lowerQuery.includes('available now')) availability.push('Immediate');
    if (lowerQuery.includes('two weeks')) availability.push('TwoWeeks');

    // Extract visa status
    const visaStatus: string[] = [];
    if (lowerQuery.includes('citizen')) visaStatus.push('Citizen');
    if (lowerQuery.includes('green card')) visaStatus.push('GreenCard');
    if (lowerQuery.includes('h1b')) visaStatus.push('H1B');
    if (lowerQuery.includes('visa sponsor')) visaStatus.push('RequiresSponsorship');

    // Determine intent
    let intent = 'general-search';
    if (lowerQuery.includes('find') || lowerQuery.includes('search')) intent = 'candidate-search';
    if (lowerQuery.includes('match') || lowerQuery.includes('suitable')) intent = 'job-matching';
    if (lowerQuery.includes('hire') || lowerQuery.includes('recruit')) intent = 'recruitment';

    return {
        skills: [...new Set(skills)],
        location: [...new Set(location)],
        experience: [...new Set(experience)],
        availability,
        visaStatus,
        intent
    };
}

/**
 * Build search query from parsed natural language intent
 */
function buildSearchQueryFromIntent(parsedQuery: any): { query: string; filters: string[] } {
    const queryParts: string[] = [];
    const filters: string[] = [];

    // Add skills to query
    if (parsedQuery.skills.length > 0) {
        queryParts.push(parsedQuery.skills.join(' OR '));
    }

    // Add experience to query
    if (parsedQuery.experience.length > 0) {
        queryParts.push(parsedQuery.experience.join(' '));
    }

    // Add location filters
    if (parsedQuery.location.length > 0) {
        const locationFilter = parsedQuery.location
            .map((loc: string) => `search.ismatch('${loc.trim()}', 'location')`)
            .join(' or ');
        filters.push(`(${locationFilter})`);
    }

    // Add availability filters
    if (parsedQuery.availability.length > 0) {
        const availFilter = parsedQuery.availability
            .map((avail: string) => `availability eq '${avail}'`)
            .join(' or ');
        filters.push(`(${availFilter})`);
    }

    // Add visa status filters
    if (parsedQuery.visaStatus.length > 0) {
        const visaFilter = parsedQuery.visaStatus
            .map((visa: string) => `visaStatus eq '${visa}'`)
            .join(' or ');
        filters.push(`(${visaFilter})`);
    }

    const query = queryParts.length > 0 ? queryParts.join(' AND ') : '*';

    return { query, filters };
}

/**
 * Calculate skills match score
 */
function calculateSkillsMatch(
    candidateSkills: string[],
    requiredSkills: string[],
    preferredSkills: string[]
): {
    score: number;
    requiredMatched: string[];
    preferredMatched: string[];
    totalMatched: string[];
} {
    const candidateSkillsLower = candidateSkills.map(s => s.toLowerCase());
    
    const requiredMatched = requiredSkills.filter(skill =>
        candidateSkillsLower.some(cs => cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs))
    );
    
    const preferredMatched = preferredSkills.filter(skill =>
        candidateSkillsLower.some(cs => cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs))
    );

    const totalMatched = [...requiredMatched, ...preferredMatched];
    
    // Calculate score (required skills weighted more heavily)
    const requiredScore = requiredSkills.length > 0 ? (requiredMatched.length / requiredSkills.length) * 0.7 : 0;
    const preferredScore = preferredSkills.length > 0 ? (preferredMatched.length / preferredSkills.length) * 0.3 : 0;
    
    const score = requiredScore + preferredScore;

    return {
        score: Math.round(score * 100) / 100,
        requiredMatched,
        preferredMatched,
        totalMatched
    };
}

/**
 * Calculate overall match score combining semantic and skills scores
 */
function calculateOverallScore(semanticScore: number, skillsScore: number): number {
    // Combine semantic relevance (60%) with skills match (40%)
    const overall = (semanticScore * 0.6) + (skillsScore * 0.4);
    return Math.round(overall * 100) / 100;
}

// Register HTTP functions
app.http('semanticCandidateSearch', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/semantic',
    handler: semanticCandidateSearch
});

app.http('intelligentJobMatching', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'search/intelligent-match',
    handler: intelligentJobMatching
});

app.http('naturalLanguageSearch', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/natural',
    handler: naturalLanguageSearch
});