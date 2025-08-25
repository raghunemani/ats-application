import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME || 'candidates-index';

if (!connectionString || !searchEndpoint || !searchApiKey) {
    throw new Error('Missing required environment variables for search analytics');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const analyticsContainer = blobServiceClient.getContainerClient('search-analytics');

const searchClient = new SearchClient(
    searchEndpoint,
    searchIndexName,
    new AzureKeyCredential(searchApiKey)
);

/**
 * Log search query for analytics
 */
export async function logSearchQuery(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Logging search query for analytics');

    try {
        const requestBody = await request.json() as {
            query: string;
            searchType: string;
            filters?: any;
            resultsCount: number;
            userId?: string;
            sessionId?: string;
            timestamp?: string;
        };

        if (!requestBody.query || !requestBody.searchType) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Query and searchType are required'
                }
            };
        }

        // Create analytics entry
        const analyticsEntry = {
            id: generateId(),
            query: requestBody.query,
            searchType: requestBody.searchType,
            filters: requestBody.filters || {},
            resultsCount: requestBody.resultsCount,
            userId: requestBody.userId || 'anonymous',
            sessionId: requestBody.sessionId || generateSessionId(),
            timestamp: requestBody.timestamp || new Date().toISOString(),
            queryLength: requestBody.query.length,
            hasFilters: Object.keys(requestBody.filters || {}).length > 0
        };

        // Store analytics entry
        const fileName = `${new Date().toISOString().split('T')[0]}/query-${analyticsEntry.id}.json`;
        const blobClient = analyticsContainer.getBlockBlobClient(fileName);
        await blobClient.upload(JSON.stringify(analyticsEntry), JSON.stringify(analyticsEntry).length);

        context.log(`Search query logged: ${requestBody.query} (${requestBody.searchType})`);

        return {
            status: 200,
            jsonBody: {
                message: 'Search query logged successfully',
                entryId: analyticsEntry.id
            }
        };

    } catch (error) {
        context.log('Error logging search query:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to log search query',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Get search analytics dashboard data
 */
export async function getSearchAnalytics(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting search analytics data');

    try {
        const days = parseInt(request.query.get('days') || '7');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        context.log(`Analyzing search data for last ${days} days`);

        const analytics = {
            totalQueries: 0,
            uniqueUsers: new Set<string>(),
            searchTypes: {} as Record<string, number>,
            topQueries: {} as Record<string, number>,
            averageResultsCount: 0,
            queriesWithResults: 0,
            queriesWithoutResults: 0,
            dailyStats: {} as Record<string, number>,
            popularFilters: {} as Record<string, number>
        };

        let totalResultsCount = 0;

        // Process analytics files
        for await (const blob of analyticsContainer.listBlobsFlat()) {
            if (blob.name.endsWith('.json')) {
                try {
                    const blobDate = new Date(blob.properties.lastModified!);
                    if (blobDate >= startDate) {
                        const blobClient = analyticsContainer.getBlockBlobClient(blob.name);
                        const downloadResponse = await blobClient.download();
                        const analyticsData = JSON.parse(await streamToString(downloadResponse.readableStreamBody));

                        // Update analytics
                        analytics.totalQueries++;
                        analytics.uniqueUsers.add(analyticsData.userId);
                        
                        // Search types
                        analytics.searchTypes[analyticsData.searchType] = 
                            (analytics.searchTypes[analyticsData.searchType] || 0) + 1;
                        
                        // Top queries
                        const queryKey = analyticsData.query.toLowerCase();
                        analytics.topQueries[queryKey] = (analytics.topQueries[queryKey] || 0) + 1;
                        
                        // Results stats
                        totalResultsCount += analyticsData.resultsCount;
                        if (analyticsData.resultsCount > 0) {
                            analytics.queriesWithResults++;
                        } else {
                            analytics.queriesWithoutResults++;
                        }
                        
                        // Daily stats
                        const dateKey = analyticsData.timestamp.split('T')[0];
                        analytics.dailyStats[dateKey] = (analytics.dailyStats[dateKey] || 0) + 1;
                        
                        // Popular filters
                        if (analyticsData.hasFilters && analyticsData.filters) {
                            Object.keys(analyticsData.filters).forEach(filterKey => {
                                analytics.popularFilters[filterKey] = 
                                    (analytics.popularFilters[filterKey] || 0) + 1;
                            });
                        }
                    }
                } catch (error) {
                    context.log(`Error processing analytics file ${blob.name}:`, error);
                }
            }
        }

        // Calculate averages and sort data
        analytics.averageResultsCount = analytics.totalQueries > 0 ? 
            Math.round((totalResultsCount / analytics.totalQueries) * 100) / 100 : 0;

        const topQueriesSorted = Object.entries(analytics.topQueries)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

        const searchTypesSorted = Object.entries(analytics.searchTypes)
            .sort(([,a], [,b]) => b - a)
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

        const popularFiltersSorted = Object.entries(analytics.popularFilters)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

        return {
            status: 200,
            jsonBody: {
                period: {
                    days: days,
                    startDate: startDate.toISOString(),
                    endDate: new Date().toISOString()
                },
                summary: {
                    totalQueries: analytics.totalQueries,
                    uniqueUsers: analytics.uniqueUsers.size,
                    averageResultsCount: analytics.averageResultsCount,
                    successRate: analytics.totalQueries > 0 ? 
                        Math.round((analytics.queriesWithResults / analytics.totalQueries) * 100) : 0
                },
                searchTypes: searchTypesSorted,
                topQueries: topQueriesSorted,
                dailyStats: analytics.dailyStats,
                popularFilters: popularFiltersSorted,
                resultStats: {
                    queriesWithResults: analytics.queriesWithResults,
                    queriesWithoutResults: analytics.queriesWithoutResults
                }
            }
        };

    } catch (error) {
        context.log('Error getting search analytics:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get search analytics',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Get search performance metrics
 */
export async function getSearchPerformanceMetrics(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting search performance metrics');

    try {
        // Get search index statistics
        const searchIndexClient = new (require('@azure/search-documents').SearchIndexClient)(
            searchEndpoint,
            new AzureKeyCredential(searchApiKey)
        );
        
        const indexStats = await searchIndexClient.getIndexStatistics(searchIndexName);
        const serviceStats = await searchIndexClient.getServiceStatistics();

        // Perform test queries to measure performance
        const testQueries = [
            '*',
            'JavaScript developer',
            'Python engineer',
            'React frontend',
            'AWS cloud'
        ];

        const performanceTests = [];
        for (const query of testQueries) {
            const startTime = Date.now();
            try {
                const result = await searchClient.search(query, { top: 10 });
                const endTime = Date.now();
                const responseTime = endTime - startTime;
                
                let resultCount = 0;
                for await (const _ of result.results) {
                    resultCount++;
                }

                performanceTests.push({
                    query,
                    responseTime,
                    resultCount,
                    totalCount: result.count || 0,
                    success: true
                });
            } catch (error) {
                const endTime = Date.now();
                performanceTests.push({
                    query,
                    responseTime: endTime - startTime,
                    resultCount: 0,
                    totalCount: 0,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        // Calculate performance metrics
        const successfulTests = performanceTests.filter(t => t.success);
        const averageResponseTime = successfulTests.length > 0 ?
            successfulTests.reduce((sum, test) => sum + test.responseTime, 0) / successfulTests.length : 0;

        return {
            status: 200,
            jsonBody: {
                indexStatistics: {
                    documentCount: indexStats.documentCount,
                    storageSize: indexStats.storageSize
                },
                serviceStatistics: {
                    counters: serviceStats.counters
                },
                performanceMetrics: {
                    averageResponseTime: Math.round(averageResponseTime),
                    successRate: (successfulTests.length / testQueries.length) * 100,
                    testResults: performanceTests
                },
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log('Error getting search performance metrics:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get search performance metrics',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Get search trends and insights
 */
export async function getSearchTrends(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting search trends and insights');

    try {
        const days = parseInt(request.query.get('days') || '30');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const trends = {
            skillsTrends: {} as Record<string, number>,
            locationTrends: {} as Record<string, number>,
            searchVolumeTrend: {} as Record<string, number>,
            queryComplexityTrend: {} as Record<string, number>
        };

        // Analyze search patterns
        for await (const blob of analyticsContainer.listBlobsFlat()) {
            if (blob.name.endsWith('.json')) {
                try {
                    const blobDate = new Date(blob.properties.lastModified!);
                    if (blobDate >= startDate) {
                        const blobClient = analyticsContainer.getBlockBlobClient(blob.name);
                        const downloadResponse = await blobClient.download();
                        const analyticsData = JSON.parse(await streamToString(downloadResponse.readableStreamBody));

                        // Extract skills from queries
                        const skillsInQuery = extractSkillsFromQuery(analyticsData.query);
                        skillsInQuery.forEach(skill => {
                            trends.skillsTrends[skill] = (trends.skillsTrends[skill] || 0) + 1;
                        });

                        // Extract locations from filters
                        if (analyticsData.filters && analyticsData.filters.location) {
                            const location = analyticsData.filters.location;
                            trends.locationTrends[location] = (trends.locationTrends[location] || 0) + 1;
                        }

                        // Track search volume by day
                        const dateKey = analyticsData.timestamp.split('T')[0];
                        trends.searchVolumeTrend[dateKey] = (trends.searchVolumeTrend[dateKey] || 0) + 1;

                        // Track query complexity
                        const complexity = categorizeQueryComplexity(analyticsData.query, analyticsData.filters);
                        trends.queryComplexityTrend[complexity] = (trends.queryComplexityTrend[complexity] || 0) + 1;
                    }
                } catch (error) {
                    context.log(`Error processing trends file ${blob.name}:`, error);
                }
            }
        }

        // Sort and limit results
        const topSkills = Object.entries(trends.skillsTrends)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 15)
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

        const topLocations = Object.entries(trends.locationTrends)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

        return {
            status: 200,
            jsonBody: {
                period: {
                    days: days,
                    startDate: startDate.toISOString(),
                    endDate: new Date().toISOString()
                },
                trends: {
                    topSkills: topSkills,
                    topLocations: topLocations,
                    searchVolume: trends.searchVolumeTrend,
                    queryComplexity: trends.queryComplexityTrend
                },
                insights: generateSearchInsights(trends)
            }
        };

    } catch (error) {
        context.log('Error getting search trends:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get search trends',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Extract skills from search query
 */
function extractSkillsFromQuery(query: string): string[] {
    const skillPatterns = [
        /\b(JavaScript|TypeScript|Python|Java|C#|PHP|Ruby|Go|Rust|Swift|Kotlin)\b/gi,
        /\b(React|Angular|Vue|Node\.js|Express|Django|Flask|Spring|\.NET|Laravel)\b/gi,
        /\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Git)\b/gi,
        /\b(SQL|MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch)\b/gi
    ];

    const skills: string[] = [];
    for (const pattern of skillPatterns) {
        const matches = query.match(pattern);
        if (matches) {
            skills.push(...matches.map(skill => skill.toLowerCase()));
        }
    }

    return [...new Set(skills)];
}

/**
 * Categorize query complexity
 */
function categorizeQueryComplexity(query: string, filters: any): string {
    const queryWords = query.split(' ').length;
    const hasFilters = filters && Object.keys(filters).length > 0;
    
    if (queryWords <= 2 && !hasFilters) return 'simple';
    if (queryWords <= 5 && !hasFilters) return 'medium';
    if (queryWords > 5 || hasFilters) return 'complex';
    
    return 'medium';
}

/**
 * Generate insights from search trends
 */
function generateSearchInsights(trends: any): string[] {
    const insights: string[] = [];
    
    // Most popular skill
    const topSkill = Object.entries(trends.skillsTrends)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0];
    if (topSkill) {
        insights.push(`Most searched skill: ${topSkill[0]} (${topSkill[1]} searches)`);
    }
    
    // Query complexity distribution
    const complexQueries = trends.queryComplexityTrend.complex || 0;
    const totalQueries = Object.values(trends.queryComplexityTrend as Record<string, number>).reduce((sum: number, count: number) => sum + count, 0);
    if (totalQueries > 0) {
        const complexPercentage = Math.round((complexQueries / totalQueries) * 100);
        insights.push(`${complexPercentage}% of searches use complex queries with filters`);
    }
    
    // Search volume trend
    const volumeEntries = Object.entries(trends.searchVolumeTrend);
    if (volumeEntries.length >= 2) {
        const recent = volumeEntries.slice(-3).reduce((sum, [,count]) => sum + (count as number), 0);
        const previous = volumeEntries.slice(-6, -3).reduce((sum, [,count]) => sum + (count as number), 0);
        if (previous > 0) {
            const change = Math.round(((recent - previous) / previous) * 100);
            if (change > 10) {
                insights.push(`Search volume increased by ${change}% in recent days`);
            } else if (change < -10) {
                insights.push(`Search volume decreased by ${Math.abs(change)}% in recent days`);
            }
        }
    }
    
    return insights;
}

/**
 * Utility functions
 */
function generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function generateSessionId(): string {
    return 'session_' + Math.random().toString(36).substring(2);
}

async function streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        readableStream.on('data', (data) => {
            chunks.push(data instanceof Buffer ? data : Buffer.from(data));
        });
        readableStream.on('end', () => {
            resolve(Buffer.concat(chunks).toString());
        });
        readableStream.on('error', reject);
    });
}

// Register HTTP functions
app.http('logSearchQuery', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'search/analytics/log',
    handler: logSearchQuery
});

app.http('getSearchAnalytics', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/analytics',
    handler: getSearchAnalytics
});

app.http('getSearchPerformanceMetrics', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/performance',
    handler: getSearchPerformanceMetrics
});

app.http('getSearchTrends', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/trends',
    handler: getSearchTrends
});