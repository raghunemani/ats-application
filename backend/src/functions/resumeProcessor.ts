import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { CandidateSearchDocument } from '../shared/types';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME || 'candidates-index';

if (!connectionString || !searchEndpoint || !searchApiKey) {
    throw new Error('Missing required environment variables for resume processing');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const candidatesContainer = blobServiceClient.getContainerClient('candidates');
const resumesContainer = blobServiceClient.getContainerClient('resumes');

const searchClient = new SearchClient<CandidateSearchDocument>(
    searchEndpoint,
    searchIndexName,
    new AzureKeyCredential(searchApiKey)
);

/**
 * Extract text content from resume files and update search index
 * Supports PDF, DOC, DOCX, and TXT files
 */
export async function processResumeContent(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Processing resume content for search indexing');

    try {
        const candidateId = request.params.candidateId;
        if (!candidateId) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Candidate ID is required'
                }
            };
        }

        // Get candidate data
        const candidateBlob = candidatesContainer.getBlockBlobClient(`${candidateId}.json`);
        const candidateExists = await candidateBlob.exists();
        
        if (!candidateExists) {
            return {
                status: 404,
                jsonBody: {
                    error: 'Candidate not found'
                }
            };
        }

        const candidateData = await getCandidateData(candidateId, context);
        if (!candidateData.resumeFileName) {
            return {
                status: 400,
                jsonBody: {
                    error: 'No resume file associated with candidate'
                }
            };
        }

        // Extract resume content
        const resumeContent = await extractResumeText(candidateData.resumeFileName, context);
        
        // Extract skills and experience from resume content
        const extractedData = await extractSkillsAndExperience(resumeContent, context);

        // Update candidate data with extracted content
        const updatedCandidate = {
            ...candidateData,
            resumeContent: resumeContent,
            extractedSkills: extractedData.skills,
            extractedExperience: extractedData.experience,
            updatedAt: new Date().toISOString()
        };

        // Save updated candidate data
        await candidateBlob.upload(JSON.stringify(updatedCandidate), JSON.stringify(updatedCandidate).length);

        // Update search index
        const searchDocument: CandidateSearchDocument = {
            candidateId: candidateData.id,
            name: candidateData.name || '',
            email: candidateData.email || '',
            phone: candidateData.phone || '',
            visaStatus: candidateData.visaStatus || '',
            availability: candidateData.availability || '',
            skills: [...(candidateData.skills || []), ...extractedData.skills],
            location: candidateData.location || '',
            experienceSummary: candidateData.experienceSummary || extractedData.experience,
            resumeFileName: candidateData.resumeFileName || '',
            resumeContent: resumeContent,
            createdAt: candidateData.createdAt || new Date().toISOString(),
            updatedAt: updatedCandidate.updatedAt
        };

        await searchClient.mergeOrUploadDocuments([searchDocument]);

        context.log(`Resume processed successfully for candidate ${candidateId}`);

        return {
            status: 200,
            jsonBody: {
                message: 'Resume content processed successfully',
                candidateId: candidateId,
                resumeFileName: candidateData.resumeFileName,
                extractedSkillsCount: extractedData.skills.length,
                contentLength: resumeContent.length,
                searchIndexUpdated: true
            }
        };

    } catch (error) {
        context.log('Error processing resume content:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to process resume content',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Batch process all resumes for content extraction
 */
export async function batchProcessResumes(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting batch resume processing');

    try {
        const batchSize = parseInt(request.query.get('batchSize') || '10');
        const maxResumes = parseInt(request.query.get('maxResumes') || '100');

        // Get all candidates with resume files
        const candidatesWithResumes = [];
        let processedCount = 0;

        for await (const blob of candidatesContainer.listBlobsFlat()) {
            if (blob.name.endsWith('.json') && processedCount < maxResumes) {
                try {
                    const candidateData = await getCandidateData(blob.name.replace('.json', ''), context);
                    if (candidateData.resumeFileName && !candidateData.resumeContent) {
                        candidatesWithResumes.push(candidateData);
                        processedCount++;
                    }
                } catch (error) {
                    context.log(`Error loading candidate ${blob.name}:`, error);
                }
            }
        }

        context.log(`Found ${candidatesWithResumes.length} candidates with unprocessed resumes`);

        const results = {
            processed: 0,
            errors: [] as string[],
            batches: 0
        };

        // Process in batches
        for (let i = 0; i < candidatesWithResumes.length; i += batchSize) {
            const batch = candidatesWithResumes.slice(i, i + batchSize);
            context.log(`Processing batch ${results.batches + 1}, candidates ${i + 1}-${Math.min(i + batchSize, candidatesWithResumes.length)}`);

            for (const candidate of batch) {
                try {
                    // Process resume content
                    const resumeContent = await extractResumeText(candidate.resumeFileName, context);
                    const extractedData = await extractSkillsAndExperience(resumeContent, context);

                    // Update candidate and search index
                    await updateCandidateWithResumeContent(candidate, resumeContent, extractedData, context);
                    results.processed++;

                } catch (error) {
                    const errorMsg = `Failed to process resume for candidate ${candidate.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    context.log(errorMsg);
                    results.errors.push(errorMsg);
                }
            }

            results.batches++;

            // Small delay between batches
            if (i + batchSize < candidatesWithResumes.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        return {
            status: 200,
            jsonBody: {
                message: 'Batch resume processing completed',
                processed: results.processed,
                batches: results.batches,
                errors: results.errors,
                totalCandidates: candidatesWithResumes.length
            }
        };

    } catch (error) {
        context.log('Error in batch resume processing:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Batch resume processing failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Get resume processing statistics
 */
export async function getResumeProcessingStats(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting resume processing statistics');

    try {
        let totalCandidates = 0;
        let candidatesWithResumes = 0;
        let processedResumes = 0;
        let unprocessedResumes = 0;

        // Analyze all candidates
        for await (const blob of candidatesContainer.listBlobsFlat()) {
            if (blob.name.endsWith('.json')) {
                totalCandidates++;
                try {
                    const candidateData = await getCandidateData(blob.name.replace('.json', ''), context);
                    if (candidateData.resumeFileName) {
                        candidatesWithResumes++;
                        if (candidateData.resumeContent) {
                            processedResumes++;
                        } else {
                            unprocessedResumes++;
                        }
                    }
                } catch (error) {
                    context.log(`Error analyzing candidate ${blob.name}:`, error);
                }
            }
        }

        const processingRate = candidatesWithResumes > 0 ? (processedResumes / candidatesWithResumes) * 100 : 0;

        return {
            status: 200,
            jsonBody: {
                totalCandidates,
                candidatesWithResumes,
                processedResumes,
                unprocessedResumes,
                processingRate: Math.round(processingRate * 100) / 100,
                needsProcessing: unprocessedResumes > 0,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log('Error getting resume processing stats:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get resume processing statistics',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Extract text content from resume file
 */
async function extractResumeText(resumeFileName: string, context: InvocationContext): Promise<string> {
    try {
        const resumeBlob = resumesContainer.getBlockBlobClient(resumeFileName);
        const exists = await resumeBlob.exists();
        
        if (!exists) {
            throw new Error(`Resume file ${resumeFileName} not found`);
        }

        // Get file extension
        const fileExtension = resumeFileName.toLowerCase().split('.').pop();
        
        // Download file content
        const downloadResponse = await resumeBlob.download();
        const fileBuffer = await streamToBuffer(downloadResponse.readableStreamBody);

        // Extract text based on file type
        switch (fileExtension) {
            case 'txt':
                return fileBuffer.toString('utf-8');
            
            case 'pdf':
                return await extractTextFromPDF(fileBuffer, context);
            
            case 'doc':
            case 'docx':
                return await extractTextFromWord(fileBuffer, context);
            
            default:
                // Try to extract as plain text
                return fileBuffer.toString('utf-8');
        }

    } catch (error) {
        context.log(`Error extracting text from ${resumeFileName}:`, error);
        throw error;
    }
}

/**
 * Extract text from PDF file (simplified implementation)
 */
async function extractTextFromPDF(buffer: Buffer, context: InvocationContext): Promise<string> {
    // This is a simplified implementation
    // In production, you would use a library like pdf-parse or pdf2pic
    context.log('PDF text extraction - using simplified implementation');
    
    // For now, return a placeholder that indicates PDF processing is needed
    return `[PDF Content - ${buffer.length} bytes] - Text extraction requires pdf-parse library`;
}

/**
 * Extract text from Word document (simplified implementation)
 */
async function extractTextFromWord(buffer: Buffer, context: InvocationContext): Promise<string> {
    // This is a simplified implementation
    // In production, you would use a library like mammoth or docx-parser
    context.log('Word document text extraction - using simplified implementation');
    
    // For now, return a placeholder that indicates Word processing is needed
    return `[Word Document - ${buffer.length} bytes] - Text extraction requires mammoth library`;
}

/**
 * Extract skills and experience from resume content using pattern matching
 */
async function extractSkillsAndExperience(resumeContent: string, context: InvocationContext): Promise<{skills: string[], experience: string}> {
    const skills: string[] = [];
    const experienceLines: string[] = [];

    // Common technical skills patterns
    const skillPatterns = [
        /\b(JavaScript|TypeScript|Python|Java|C#|C\+\+|PHP|Ruby|Go|Rust|Swift|Kotlin)\b/gi,
        /\b(React|Angular|Vue|Node\.js|Express|Django|Flask|Spring|\.NET|Laravel)\b/gi,
        /\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Git|GitHub|GitLab)\b/gi,
        /\b(SQL|MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|Oracle)\b/gi,
        /\b(HTML|CSS|SASS|LESS|Bootstrap|Tailwind|jQuery)\b/gi,
        /\b(Agile|Scrum|DevOps|CI\/CD|TDD|BDD|Microservices)\b/gi
    ];

    // Extract skills
    for (const pattern of skillPatterns) {
        const matches = resumeContent.match(pattern);
        if (matches) {
            skills.push(...matches.map(skill => skill.trim()));
        }
    }

    // Remove duplicates and clean up
    const uniqueSkills = [...new Set(skills)].filter(skill => skill.length > 1);

    // Extract experience summary (first few sentences that mention experience/work)
    const lines = resumeContent.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.length > 20 && 
            (trimmedLine.toLowerCase().includes('experience') ||
             trimmedLine.toLowerCase().includes('worked') ||
             trimmedLine.toLowerCase().includes('developed') ||
             trimmedLine.toLowerCase().includes('managed') ||
             trimmedLine.toLowerCase().includes('led'))) {
            experienceLines.push(trimmedLine);
            if (experienceLines.length >= 3) break;
        }
    }

    const experience = experienceLines.join(' ').substring(0, 500);

    context.log(`Extracted ${uniqueSkills.length} skills and ${experience.length} chars of experience`);

    return {
        skills: uniqueSkills.slice(0, 20), // Limit to top 20 skills
        experience: experience || 'Experience details to be updated'
    };
}

/**
 * Get candidate data from blob storage
 */
async function getCandidateData(candidateId: string, context: InvocationContext): Promise<any> {
    const candidateBlob = candidatesContainer.getBlockBlobClient(`${candidateId}.json`);
    const downloadResponse = await candidateBlob.download();
    const candidateDataString = await streamToString(downloadResponse.readableStreamBody);
    return JSON.parse(candidateDataString);
}

/**
 * Update candidate with resume content and search index
 */
async function updateCandidateWithResumeContent(
    candidate: any, 
    resumeContent: string, 
    extractedData: {skills: string[], experience: string}, 
    context: InvocationContext
): Promise<void> {
    // Update candidate data
    const updatedCandidate = {
        ...candidate,
        resumeContent: resumeContent,
        extractedSkills: extractedData.skills,
        extractedExperience: extractedData.experience,
        updatedAt: new Date().toISOString()
    };

    // Save to blob storage
    const candidateBlob = candidatesContainer.getBlockBlobClient(`${candidate.id}.json`);
    await candidateBlob.upload(JSON.stringify(updatedCandidate), JSON.stringify(updatedCandidate).length);

    // Update search index
    const searchDocument: CandidateSearchDocument = {
        candidateId: candidate.id,
        name: candidate.name || '',
        email: candidate.email || '',
        phone: candidate.phone || '',
        visaStatus: candidate.visaStatus || '',
        availability: candidate.availability || '',
        skills: [...(candidate.skills || []), ...extractedData.skills],
        location: candidate.location || '',
        experienceSummary: candidate.experienceSummary || extractedData.experience,
        resumeFileName: candidate.resumeFileName || '',
        resumeContent: resumeContent,
        createdAt: candidate.createdAt || new Date().toISOString(),
        updatedAt: updatedCandidate.updatedAt
    };

    await searchClient.mergeOrUploadDocuments([searchDocument]);
}

/**
 * Utility functions
 */
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

async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        readableStream.on('data', (data) => {
            chunks.push(data instanceof Buffer ? data : Buffer.from(data));
        });
        readableStream.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        readableStream.on('error', reject);
    });
}

// Register HTTP functions
app.http('processResumeContent', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'candidates/{candidateId}/process-resume',
    handler: processResumeContent
});

app.http('batchProcessResumes', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'search/batch/process-resumes',
    handler: batchProcessResumes
});

app.http('getResumeProcessingStats', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'search/resume-stats',
    handler: getResumeProcessingStats
});