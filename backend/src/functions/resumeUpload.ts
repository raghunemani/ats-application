// Azure Function for handling resume file uploads to Azure Blob Storage

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { executeQuery, executeQuerySingle, initializeDatabase } from '../database/config';

/**
 * POST /api/candidates/{id}/resume
 * Uploads a resume file to Azure Blob Storage and updates the candidate record
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

        // Step 2: Initialize database and check if candidate exists
        await initializeDatabase();
        
        const existingCandidate = await executeQuerySingle<any>(
            'SELECT Id, Name, Email FROM Candidates WHERE Id = @candidateId',
            { candidateId }
        );

        if (!existingCandidate) {
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

        // Step 5: Set up Azure Blob Storage connection
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) {
            context.log('Azure Storage connection string not configured');
            return {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: { code: 'STORAGE_NOT_CONFIGURED', message: 'File storage is not properly configured' },
                    timestamp: new Date().toISOString()
                })
            };
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerName = 'resumes';
        const containerClient = blobServiceClient.getContainerClient(containerName);

        // Step 6: Create container if it doesn't exist
        await containerClient.createIfNotExists({
            access: 'blob' // Public read access for resumes
        });

        // Step 7: Generate unique filename
        const fileExtension = getFileExtension(file.name);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedCandidateName = existingCandidate.Name.replace(/[^a-zA-Z0-9]/g, '-');
        const blobName = `${candidateId}/${sanitizedCandidateName}-${timestamp}${fileExtension}`;

        // Step 8: Upload file to blob storage
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        // Convert File to ArrayBuffer for upload
        const fileBuffer = await file.arrayBuffer();
        const uploadResponse = await blockBlobClient.uploadData(fileBuffer, {
            blobHTTPHeaders: {
                blobContentType: file.type
            },
            metadata: {
                candidateId: candidateId,
                candidateName: existingCandidate.Name,
                originalFileName: file.name,
                uploadedAt: new Date().toISOString()
            }
        });

        // Step 9: Get the public URL of the uploaded file
        const resumeUrl = blockBlobClient.url;

        // Step 10: Update candidate record with new resume URL
        const updateQuery = `
            UPDATE Candidates 
            SET ResumeUrl = @resumeUrl, UpdatedAt = @updatedAt
            WHERE Id = @candidateId
        `;

        await executeQuery(updateQuery, {
            resumeUrl: resumeUrl,
            updatedAt: new Date(),
            candidateId: candidateId
        });

        // Step 11: Return success response
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                data: {
                    candidateId: candidateId,
                    candidateName: existingCandidate.Name,
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
 * Gets the resume download URL for a candidate
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

        // Step 2: Get candidate and resume URL from database
        await initializeDatabase();
        
        const candidate = await executeQuerySingle<any>(
            'SELECT Id, Name, Email, ResumeUrl FROM Candidates WHERE Id = @candidateId',
            { candidateId }
        );

        if (!candidate) {
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

        if (!candidate.ResumeUrl) {
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
                    candidateId: candidate.Id,
                    candidateName: candidate.Name,
                    resumeUrl: candidate.ResumeUrl
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
                    code: 'DATABASE_ERROR',
                    message: 'Failed to get resume URL',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            })
        };
    }
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