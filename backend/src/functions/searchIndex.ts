import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SearchIndexClient, AzureKeyCredential, SearchIndex } from '@azure/search-documents';

const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const CANDIDATES_INDEX_NAME = 'candidates-index';

if (!searchEndpoint || !searchApiKey) {
    throw new Error('Azure Search configuration missing. Please set AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_API_KEY environment variables.');
}

const searchIndexClient = new SearchIndexClient(
    searchEndpoint,
    new AzureKeyCredential(searchApiKey)
);

/**
 * Create the candidates search index with proper schema
 */
function createCandidatesIndex(): SearchIndex {
    return {
        name: CANDIDATES_INDEX_NAME,
        fields: [
            {
                name: 'candidateId',
                type: 'Edm.String',
                key: true,
                searchable: false,
                filterable: true,
                sortable: false,
                facetable: false
            },
            {
                name: 'name',
                type: 'Edm.String',
                searchable: true,
                filterable: true,
                sortable: true,
                facetable: false
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
            {
                name: 'location',
                type: 'Edm.String',
                searchable: true,
                filterable: true,
                sortable: true,
                facetable: true
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
                facetable: false
            },
            {
                name: 'resumeContent',
                type: 'Edm.String',
                searchable: true,
                filterable: false,
                sortable: false,
                facetable: false
            },
            {
                name: 'resumeFileName',
                type: 'Edm.String',
                searchable: false,
                filterable: false,
                sortable: false,
                facetable: false
            },
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
}

/**
 * Initialize or update the candidates search index
 */
export async function initializeSearchIndex(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Initializing candidates search index');

    try {
        const indexDefinition = createCandidatesIndex();
        
        // Check if index exists
        let indexExists = false;
        try {
            await searchIndexClient.getIndex(CANDIDATES_INDEX_NAME);
            indexExists = true;
            context.log('Index already exists');
        } catch (error) {
            context.log('Index does not exist, will create new one');
        }

        // Create or update index
        if (indexExists) {
            const forceUpdate = request.query.get('force') === 'true';
            
            if (forceUpdate) {
                context.log('Force update requested, recreating index');
                await searchIndexClient.deleteIndex(CANDIDATES_INDEX_NAME);
                await searchIndexClient.createIndex(indexDefinition);
                context.log('Index recreated successfully');
            } else {
                context.log('Index already exists, use ?force=true to recreate');
            }
        } else {
            // Create new index
            await searchIndexClient.createIndex(indexDefinition);
            context.log('Index created successfully');
        }

        return {
            status: 200,
            jsonBody: {
                message: 'Search index initialized successfully',
                indexName: CANDIDATES_INDEX_NAME,
                endpoint: searchEndpoint,
                fieldsCount: indexDefinition.fields?.length || 0
            }
        };

    } catch (error) {
        context.log('Error initializing search index:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to initialize search index',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Get search index information and statistics
 */
export async function getSearchIndexInfo(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting search index information');

    try {
        const index = await searchIndexClient.getIndex(CANDIDATES_INDEX_NAME);
        
        // Get index statistics
        const stats = await searchIndexClient.getIndexStatistics(CANDIDATES_INDEX_NAME);

        return {
            status: 200,
            jsonBody: {
                indexName: index.name,
                fieldsCount: index.fields?.length || 0,
                documentCount: stats.documentCount,
                storageSize: stats.storageSize,
                fields: index.fields?.map(f => ({
                    name: f.name,
                    type: f.type
                }))
            }
        };

    } catch (error) {
        context.log('Error getting search index info:', error);
        
        if (error instanceof Error && error.message.includes('NotFound')) {
            return {
                status: 404,
                jsonBody: {
                    error: 'Search index not found',
                    message: 'Please initialize the search index first'
                }
            };
        }

        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get search index information',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Delete the search index (use with caution)
 */
export async function deleteSearchIndex(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Deleting search index');

    try {
        const confirm = request.query.get('confirm');
        if (confirm !== 'true') {
            return {
                status: 400,
                jsonBody: {
                    error: 'Confirmation required',
                    message: 'Add ?confirm=true to the request to confirm deletion'
                }
            };
        }

        await searchIndexClient.deleteIndex(CANDIDATES_INDEX_NAME);
        context.log('Search index deleted successfully');

        return {
            status: 200,
            jsonBody: {
                message: 'Search index deleted successfully',
                indexName: CANDIDATES_INDEX_NAME
            }
        };

    } catch (error) {
        context.log('Error deleting search index:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to delete search index',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Health check for search service
 */
export async function searchHealthCheck(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Performing search service health check');

    try {
        // Test connection to search service
        const serviceStats = await searchIndexClient.getServiceStatistics();
        
        // Check if our index exists
        let indexExists = false;
        let indexStats = null;
        
        try {
            await searchIndexClient.getIndex(CANDIDATES_INDEX_NAME);
            indexStats = await searchIndexClient.getIndexStatistics(CANDIDATES_INDEX_NAME);
            indexExists = true;
        } catch (error) {
            // Index doesn't exist, which is okay for health check
        }

        return {
            status: 200,
            jsonBody: {
                status: 'healthy',
                searchService: {
                    endpoint: searchEndpoint,
                    counters: serviceStats.counters
                },
                candidatesIndex: {
                    exists: indexExists,
                    documentCount: indexStats?.documentCount || 0,
                    storageSize: indexStats?.storageSize || 0
                },
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log('Search service health check failed:', error);
        return {
            status: 503,
            jsonBody: {
                status: 'unhealthy',
                error: 'Search service unavailable',
                details: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            }
        };
    }
}

// Register HTTP functions
app.http('initializeSearchIndex', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'search/index/initialize',
    handler: initializeSearchIndex
});

app.http('getSearchIndexInfo', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/index/info',
    handler: getSearchIndexInfo
});

app.http('deleteSearchIndex', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'search/index',
    handler: deleteSearchIndex
});

app.http('searchHealthCheck', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/health',
    handler: searchHealthCheck
});