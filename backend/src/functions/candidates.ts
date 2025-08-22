import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { Candidate, CandidateSearchDocument } from '../shared/types';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME || 'candidates-index';

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient('candidates');

const searchClient = new SearchClient<CandidateSearchDocument>(
    searchEndpoint,
    searchIndexName,
    new AzureKeyCredential(searchApiKey)
);

export async function getCandidates(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting candidates');

    try {
        const searchText = request.query.get('search') || '*';
        const results = await searchClient.search(searchText, {
            top: 50,
            includeTotalCount: true
        });

        const candidates: Candidate[] = [];
        for await (const result of results.results) {
            const candidate: Candidate = {
                id: result.document.candidateId,
                name: result.document.name,
                email: result.document.email,
                phone: result.document.phone,
                resumeFileName: result.document.resumeFileName,
                experienceSummary: result.document.experienceSummary,
                visaStatus: result.document.visaStatus as any,
                availability: result.document.availability as any,
                skills: result.document.skills,
                location: result.document.location,
                createdAt: result.document.createdAt,
                updatedAt: result.document.updatedAt
            };
            candidates.push(candidate);
        }

        return {
            status: 200,
            jsonBody: {
                candidates,
                total: results.count
            }
        };
    } catch (error) {
        context.log('Error getting candidates:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to get candidates' }
        };
    }
}

export async function createCandidate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Creating candidate');

    try {
        const candidateData = await request.json() as Omit<Candidate, 'id' | 'createdAt'>;
        
        const now = new Date().toISOString();
        const candidate: Candidate = {
            id: generateId(),
            ...candidateData,
            createdAt: now,
            updatedAt: now
        };

        // Store metadata in blob storage
        const blobName = `${candidate.id}.json`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.upload(JSON.stringify(candidate), JSON.stringify(candidate).length);

        // Index in Azure AI Search
        const searchDocument: CandidateSearchDocument = {
            candidateId: candidate.id,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            visaStatus: candidate.visaStatus,
            availability: candidate.availability,
            skills: candidate.skills,
            location: candidate.location,
            experienceSummary: candidate.experienceSummary,
            resumeFileName: candidate.resumeFileName,
            resumeContent: '', // Will be populated when resume is processed
            createdAt: candidate.createdAt,
            updatedAt: candidate.updatedAt
        };

        await searchClient.uploadDocuments([searchDocument]);

        return {
            status: 201,
            jsonBody: candidate
        };
    } catch (error) {
        context.log('Error creating candidate:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to create candidate' }
        };
    }
}

export async function updateCandidate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Updating candidate');

    try {
        const id = request.params.id;
        const updates = await request.json() as Partial<Candidate>;

        // Get existing candidate from blob storage
        const blobName = `${id}.json`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        const downloadResponse = await blockBlobClient.download();
        const existingData = await streamToString(downloadResponse.readableStreamBody);
        const existingCandidate = JSON.parse(existingData) as Candidate;

        // Update candidate
        const updatedCandidate: Candidate = {
            ...existingCandidate,
            ...updates,
            id, // Ensure ID doesn't change
            createdAt: existingCandidate.createdAt, // Preserve creation date
            updatedAt: new Date().toISOString()
        };

        // Update blob storage
        await blockBlobClient.upload(JSON.stringify(updatedCandidate), JSON.stringify(updatedCandidate).length);

        // Update search index
        const searchDocument: CandidateSearchDocument = {
            candidateId: updatedCandidate.id,
            name: updatedCandidate.name,
            email: updatedCandidate.email,
            phone: updatedCandidate.phone,
            visaStatus: updatedCandidate.visaStatus,
            availability: updatedCandidate.availability,
            skills: updatedCandidate.skills,
            location: updatedCandidate.location,
            experienceSummary: updatedCandidate.experienceSummary,
            resumeFileName: updatedCandidate.resumeFileName,
            resumeContent: '', // Will be updated when resume is processed
            createdAt: updatedCandidate.createdAt,
            updatedAt: updatedCandidate.updatedAt
        };

        await searchClient.mergeOrUploadDocuments([searchDocument]);

        return {
            status: 200,
            jsonBody: updatedCandidate
        };
    } catch (error) {
        context.log('Error updating candidate:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to update candidate' }
        };
    }
}

export async function deleteCandidate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Deleting candidate');

    try {
        const id = request.params.id;

        // Delete from blob storage
        const blobName = `${id}.json`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.delete();

        // Delete from search index
        await searchClient.deleteDocuments([{ 
            candidateId: id,
            name: '',
            email: '',
            phone: '',
            visaStatus: '',
            availability: '',
            skills: [],
            location: '',
            experienceSummary: '',
            resumeContent: '',
            createdAt: '',
            updatedAt: ''
        }]);

        return {
            status: 204
        };
    } catch (error) {
        context.log('Error deleting candidate:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to delete candidate' }
        };
    }
}

function generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
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
app.http('getCandidates', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'candidates',
    handler: getCandidates
});

app.http('createCandidate', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'candidates',
    handler: createCandidate
});

app.http('updateCandidate', {
    methods: ['PUT'],
    authLevel: 'anonymous',
    route: 'candidates/{id}',
    handler: updateCandidate
});

app.http('deleteCandidate', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'candidates/{id}',
    handler: deleteCandidate
});