// Azure Function for handling resume file uploads to Azure Blob Storage

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';

// Helper functions for Azure services
const getBlobServiceClient = (): BlobServiceClient => {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is required');
    }
    return BlobServiceClient.fromConnectionString(connectionString);
};

const getSearchClient = (): SearchClient<any> => {
    const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
    const apiKey = process.env.AZURE_SEARCH_API_KEY;
    const indexName = process.env.AZURE_SEARCH_INDEX_NAME || 'candidates-index';
    
    if (!endpoint || !apiKey) {
        throw new Error('AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_API_KEY environment variables are required');
    }
    
    return new SearchClient(endpoint, indexName, new AzureKeyCredential(apiKey));
};

const CANDIDATES_CONTAINER = 'candidates';

/**
 * POST /api/candidates/{id}/resume
 * Uploads a resume file to Azure Blob Storage and updates the candidate metadata
 */
export async function uploadResume(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Uploading resume file');

    try {
        // Step 1: Get candidate ID from URL
        const candidateId = request.params.id;
        if (!candidateId) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: { code: 'MISSING_ID', message: 'Candidate ID is required' },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 2: Check if candidate exists in Blob Storage
        const blobServiceClient = getBlobServiceClient();
        const containerClient = blobServiceClient.getContainerClient(CANDIDATES_CONTAINER);
        
        const metadataBlobName = `${candidateId}/metadata.json`;
        const metadataBlobClient = containerClient.getBlobClient(metadataBlobName);
        
        let existingCandidate: any;
        try {
            const downloadResponse = await metadataBlobClient.download();
            const metadataContent = await streamToString(downloadResponse.readableStreamBody!);
            existingCandidate = JSON.parse(metadataContent);
        } catch (blobError: any) {
            if (blobError.statusCode === 404) {
                return {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: { code: 'CANDIDATE_NOT_FOUND', message: `Candidate with ID ${candidateId} not found` },
                        timestamp: new Date().toISOString()
                    })
                };
            }
            throw blobError;
        }

        // Step 3: Get the file from the request
        const formData = await request.formData();
        const file = formData.get('resume') as File;

        if (!file) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: { code: 'NO_FILE_PROVIDED', message: 'Resume file is required' },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 4: Validate file type and size
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!allowedTypes.includes(file.type)) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'INVALID_FILE_TYPE',
                        message: 'Only PDF, DOC, and DOCX files are allowed',
                        allowedTypes: ['PDF', 'DOC', 'DOCX']
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Check file size (limit to 10MB)
        const maxSizeBytes = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSizeBytes) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'FILE_TOO_LARGE',
                        message: `File size must be less than 10MB. Current size: ${Math.round(file.size / 1024 / 1024 * 100) / 100}MB`
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 5: Generate unique filename and upload to blob storage
        const fileExtension = getFileExtension(file.name);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedCandidateName = existingCandidate.name.replace(/[^a-zA-Z0-9]/g, '-');
        const resumeBlobName = `${candidateId}/resume-${timestamp}${fileExtension}`;

        // Step 6: Upload file to blob storage
        const resumeBlobClient = containerClient.getBlockBlobClient(resumeBlobName);
        
        // Convert File to ArrayBuffer for upload
        const fileBuffer = await file.arrayBuffer();
        await resumeBlobClient.uploadData(fileBuffer, {
            blobHTTPHeaders: {
                blobContentType: file.type
            },
            metadata: {
                candidateId: candidateId,
                candidateName: existingCandidate.name,
                originalFileName: file.name,
                uploadedAt: new Date().toISOString()
            }
        });

        // Step 7: Get the resume URL
        const resumeUrl = resumeBlobClient.url;

        // Step 8: Update candidate metadata with resume information
        existingCandidate.resumeFileName = file.name;
        existingCandidate.resumeUrl = resumeUrl;
        existingCandidate.updatedAt = new Date().toISOString();

        // Save updated metadata back to blob storage
        const updatedMetadataBlob = containerClient.getBlockBlobClient(metadataBlobName);
        await updatedMetadataBlob.upload(
            JSON.stringify(existingCandidate, null, 2), 
            JSON.stringify(existingCandidate).length,
            { blobHTTPHeaders: { blobContentType: 'application/json' } }
        );

        // Step 9: Update Azure AI Search index with resume information
        try {
            const searchClient = getSearchClient();
            
            // TODO: Extract text content from resume file for search indexing
            // For now, we'll just update the resume filename
            const searchDocument = {
                candidateId: candidateId,
                resumeFileName: file.name,
                resumeContent: '', // Will be populated by AI text extraction later
                updatedAt: existingCandidate.updatedAt
            };

            await searchClient.mergeOrUploadDocuments([searchDocument]);
        } catch (searchError) {
            context.log('Warning: Failed to update search index:', searchError);
            // Continue execution - search index update is not critical for file upload
        }

        // Step 10: Return success response
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                data: {
                    candidateId: candidateId,
                    candidateName: existingCandidate.name,
                    resumeUrl: resumeUrl,
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                    uploadedAt: new Date().toISOString()
                },
                message: 'Resume uploaded successfully',
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        context.log('Error uploading resume:', error);
        
        return {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: {
                    code: 'UPLOAD_ERROR',
                    message: 'Failed to upload resume',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            })
        };
    }
}

/**
 * Helper function to get file extension from filename
 */
function getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
        return '';
    }
    return filename.substring(lastDotIndex);
}

/**
 * GET /api/candidates/{id}/resume
 * Gets the resume download URL for a candidate from Blob Storage
 */
export async function getResumeUrl(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting resume URL');

    try {
        // Step 1: Get candidate ID from URL
        const candidateId = request.params.id;
        if (!candidateId) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: { code: 'MISSING_ID', message: 'Candidate ID is required' },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 2: Get candidate metadata from Blob Storage
        const blobServiceClient = getBlobServiceClient();
        const containerClient = blobServiceClient.getContainerClient(CANDIDATES_CONTAINER);
        
        const metadataBlobName = `${candidateId}/metadata.json`;
        const metadataBlobClient = containerClient.getBlobClient(metadataBlobName);
        
        let candidate: any;
        try {
            const downloadResponse = await metadataBlobClient.download();
            const metadataContent = await streamToString(downloadResponse.readableStreamBody!);
            candidate = JSON.parse(metadataContent);
        } catch (blobError: any) {
            if (blobError.statusCode === 404) {
                return {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: { code: 'CANDIDATE_NOT_FOUND', message: `Candidate with ID ${candidateId} not found` },
                        timestamp: new Date().toISOString()
                    })
                };
            }
            throw blobError;
        }

        if (!candidate.resumeUrl) {
            return {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: { code: 'NO_RESUME_FOUND', message: 'No resume found for this candidate' },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 3: Return the resume URL
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                data: {
                    candidateId: candidate.id,
                    candidateName: candidate.name,
                    resumeUrl: candidate.resumeUrl,
                    resumeFileName: candidate.resumeFileName
                },
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        context.log('Error getting resume URL:', error);
        
        return {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: {
                    code: 'BLOB_ERROR',
                    message: 'Failed to get resume URL',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            })
        };
    }
}

// Helper function to convert stream to string
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

// Register the functions with Azure Functions runtime
app.http('uploadResume', {
    methods: ['POST'],
    route: 'candidates/{id}/resume',
    authLevel: 'anonymous',
    handler: uploadResume
});

app.http('getResumeUrl', {
    methods: ['GET'],
    route: 'candidates/{id}/resume',
    authLevel: 'anonymous',
    handler: getResumeUrl
});