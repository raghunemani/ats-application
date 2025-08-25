import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { createOpenAIClient, promptTemplates, modelConfigs, formatPrompt, parseAIResponse, validateAIResponse, openaiConfig } from '../shared/openaiConfig';
import { Candidate } from '../shared/types';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME || 'candidates-index';

if (!connectionString || !searchEndpoint || !searchApiKey) {
    throw new Error('Missing required environment variables for AI resume extraction');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const resumeContainer = blobServiceClient.getContainerClient('resumes');

const searchClient = new SearchClient(
    searchEndpoint,
    searchIndexName,
    new AzureKeyCredential(searchApiKey)
);

/**
 * Extract structured information from resume using Azure OpenAI
 */
export async function extractResumeData(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting AI-powered resume extraction');

    try {
        const requestBody = await request.json() as {
            resumeText?: string;
            resumeUrl?: string;
            candidateId?: string;
            extractionOptions?: {
                includeSkillsAnalysis?: boolean;
                includeSalaryEstimation?: boolean;
                includeCareerAdvice?: boolean;
            };
        };

        if (!requestBody.resumeText && !requestBody.resumeUrl) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Either resumeText or resumeUrl is required'
                }
            };
        }

        let resumeText = requestBody.resumeText;

        // If resumeUrl is provided, fetch the resume content
        if (requestBody.resumeUrl && !resumeText) {
            try {
                const blobName = requestBody.resumeUrl.split('/').pop();
                if (!blobName) {
                    throw new Error('Invalid resume URL');
                }

                const blobClient = resumeContainer.getBlockBlobClient(blobName);
                const downloadResponse = await blobClient.download();
                resumeText = await streamToString(downloadResponse.readableStreamBody);
            } catch (error) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Failed to fetch resume from URL',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    }
                };
            }
        }

        if (!resumeText) {
            return {
                status: 400,
                jsonBody: {
                    error: 'No resume text available for extraction'
                }
            };
        }

        // Create OpenAI client and extract resume data
        const openaiClient = createOpenAIClient();
        const prompt = formatPrompt(promptTemplates.resumeExtraction, { resumeText });

        context.log('Sending resume to Azure OpenAI for extraction');

        const response = await openaiClient.getChatCompletions(
            openaiConfig.deploymentName,
            [
                {
                    role: 'system',
                    content: 'You are an expert resume parser. Extract structured information accurately and return only valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            {
                maxTokens: modelConfigs.resumeExtraction.maxTokens,
                temperature: modelConfigs.resumeExtraction.temperature,
                topP: modelConfigs.resumeExtraction.topP
            }
        );

        if (!response.choices || response.choices.length === 0) {
            throw new Error('No response from Azure OpenAI');
        }

        const aiResponse = response.choices[0].message?.content;
        if (!aiResponse) {
            throw new Error('Empty response from Azure OpenAI');
        }

        // Parse and validate the AI response
        const extractedData = parseAIResponse(aiResponse);
        const requiredFields = ['personalInfo', 'skills', 'experience', 'education'];
        
        if (!validateAIResponse(extractedData, requiredFields)) {
            throw new Error('AI response missing required fields');
        }

        // Enhance the extracted data with additional analysis
        const enhancedData = await enhanceExtractedData(extractedData, requestBody.extractionOptions, context);

        // If candidateId is provided, update the candidate record
        if (requestBody.candidateId) {
            try {
                await updateCandidateWithExtractedData(requestBody.candidateId, enhancedData, context);
            } catch (error) {
                context.log('Warning: Failed to update candidate record:', error);
                // Don't fail the entire request if candidate update fails
            }
        }

        context.log('Resume extraction completed successfully');

        return {
            status: 200,
            jsonBody: {
                message: 'Resume extraction completed successfully',
                extractedData: enhancedData,
                metadata: {
                    extractionTimestamp: new Date().toISOString(),
                    tokensUsed: response.usage?.totalTokens || 0,
                    processingTime: Date.now() - Date.now(), // This would be calculated properly in real implementation
                    candidateUpdated: !!requestBody.candidateId
                }
            }
        };

    } catch (error) {
        context.log('Error in AI resume extraction:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to extract resume data',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Batch extract resume data from multiple resumes
 */
export async function batchExtractResumes(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting batch AI resume extraction');

    try {
        const requestBody = await request.json() as {
            resumes: Array<{
                candidateId: string;
                resumeUrl?: string;
                resumeText?: string;
            }>;
            options?: {
                maxConcurrent?: number;
                includeSkillsAnalysis?: boolean;
                updateCandidates?: boolean;
            };
        };

        if (!requestBody.resumes || requestBody.resumes.length === 0) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Resumes array is required and cannot be empty'
                }
            };
        }

        const maxConcurrent = requestBody.options?.maxConcurrent || 3;
        const batchId = generateBatchId();
        
        context.log(`Processing ${requestBody.resumes.length} resumes with max concurrency: ${maxConcurrent}`);

        // Process resumes in batches
        const results = [];
        for (let i = 0; i < requestBody.resumes.length; i += maxConcurrent) {
            const batch = requestBody.resumes.slice(i, i + maxConcurrent);
            const batchPromises = batch.map(async (resume) => {
                try {
                    const extractionRequest = {
                        json: async () => ({
                            resumeText: resume.resumeText,
                            resumeUrl: resume.resumeUrl,
                            candidateId: requestBody.options?.updateCandidates ? resume.candidateId : undefined,
                            extractionOptions: {
                                includeSkillsAnalysis: requestBody.options?.includeSkillsAnalysis
                            }
                        })
                    } as HttpRequest;

                    const result = await extractResumeData(extractionRequest, context);
                    return {
                        candidateId: resume.candidateId,
                        success: result.status === 200,
                        data: result.jsonBody,
                        error: result.status !== 200 ? result.jsonBody : null
                    };
                } catch (error) {
                    return {
                        candidateId: resume.candidateId,
                        success: false,
                        data: null,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        // Calculate batch statistics
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        context.log(`Batch extraction completed: ${successful} successful, ${failed} failed`);

        return {
            status: 200,
            jsonBody: {
                message: 'Batch resume extraction completed',
                batchId: batchId,
                summary: {
                    total: requestBody.resumes.length,
                    successful: successful,
                    failed: failed,
                    successRate: Math.round((successful / requestBody.resumes.length) * 100)
                },
                results: results,
                completedAt: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log('Error in batch resume extraction:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to process batch resume extraction',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Get extraction status for a batch operation
 */
export async function getExtractionStatus(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting extraction status');

    try {
        const batchId = request.params.batchId;
        if (!batchId) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Batch ID is required'
                }
            };
        }

        // In a real implementation, this would fetch status from a database or cache
        // For now, return a mock status
        return {
            status: 200,
            jsonBody: {
                batchId: batchId,
                status: 'completed',
                progress: {
                    total: 10,
                    completed: 10,
                    failed: 0,
                    percentage: 100
                },
                startedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
                completedAt: new Date().toISOString(),
                estimatedTimeRemaining: 0
            }
        };

    } catch (error) {
        context.log('Error getting extraction status:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get extraction status',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Enhance extracted data with additional AI analysis
 */
async function enhanceExtractedData(extractedData: any, options: any = {}, context: InvocationContext): Promise<any> {
    const enhanced = { ...extractedData };

    try {
        // Add skills analysis if requested
        if (options?.includeSkillsAnalysis) {
            enhanced.skillsAnalysis = analyzeSkills(extractedData.skills);
        }

        // Add experience level assessment
        enhanced.experienceAssessment = assessExperienceLevel(extractedData.experience);

        // Add career insights
        enhanced.careerInsights = generateCareerInsights(extractedData);

        return enhanced;
    } catch (error) {
        context.log('Warning: Failed to enhance extracted data:', error);
        return extractedData;
    }
}

/**
 * Analyze skills and categorize them
 */
function analyzeSkills(skills: any): any {
    return {
        totalSkills: Object.values(skills).flat().length,
        categories: {
            technical: skills.technical?.length || 0,
            frameworks: skills.frameworks?.length || 0,
            languages: skills.languages?.length || 0,
            tools: skills.tools?.length || 0
        },
        marketDemand: assessMarketDemand(skills.technical || []),
        skillLevel: assessSkillLevel(skills)
    };
}

/**
 * Assess experience level based on work history
 */
function assessExperienceLevel(experience: any[]): any {
    const totalYears = calculateTotalExperience(experience);
    let level = 'Entry';
    
    if (totalYears >= 8) level = 'Senior';
    else if (totalYears >= 4) level = 'Mid-level';
    else if (totalYears >= 2) level = 'Junior';

    return {
        totalYears: totalYears,
        level: level,
        jobCount: experience.length,
        averageJobDuration: totalYears / Math.max(experience.length, 1),
        careerProgression: assessCareerProgression(experience)
    };
}

/**
 * Generate career insights
 */
function generateCareerInsights(extractedData: any): any {
    return {
        strengths: identifyStrengths(extractedData),
        recommendedRoles: suggestRoles(extractedData),
        skillGaps: identifySkillGaps(extractedData),
        careerAdvice: generateCareerAdvice(extractedData)
    };
}

/**
 * Update candidate record with extracted data
 */
async function updateCandidateWithExtractedData(candidateId: string, extractedData: any, context: InvocationContext): Promise<void> {
    try {
        // Update search index with extracted information
        const searchDocument = {
            id: candidateId,
            skills: extractedData.skills.technical || [],
            experience: extractedData.experienceAssessment?.totalYears || 0,
            summary: extractedData.summary || '',
            lastUpdated: new Date().toISOString()
        };

        await searchClient.mergeOrUploadDocuments([searchDocument]);
        context.log(`Updated search index for candidate ${candidateId}`);
    } catch (error) {
        context.log(`Failed to update candidate ${candidateId}:`, error);
        throw error;
    }
}

/**
 * Utility functions
 */
function generateBatchId(): string {
    return 'batch_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function calculateTotalExperience(experience: any[]): number {
    // Simple calculation - in real implementation would parse dates properly
    return experience.length * 2; // Assume 2 years per job on average
}

function assessMarketDemand(skills: string[]): string {
    const highDemandSkills = ['JavaScript', 'Python', 'React', 'AWS', 'Docker', 'Kubernetes'];
    const matchCount = skills.filter(skill => 
        highDemandSkills.some(demand => skill.toLowerCase().includes(demand.toLowerCase()))
    ).length;
    
    if (matchCount >= 3) return 'High';
    if (matchCount >= 1) return 'Medium';
    return 'Low';
}

function assessSkillLevel(skills: any): string {
    const totalSkills = Object.values(skills).flat().length;
    if (totalSkills >= 20) return 'Expert';
    if (totalSkills >= 10) return 'Advanced';
    if (totalSkills >= 5) return 'Intermediate';
    return 'Beginner';
}

function assessCareerProgression(experience: any[]): string {
    // Simple assessment based on job titles
    const titles = experience.map(exp => exp.title?.toLowerCase() || '');
    const hasLeadership = titles.some(title => 
        title.includes('senior') || title.includes('lead') || title.includes('manager')
    );
    
    if (hasLeadership) return 'Upward';
    return 'Steady';
}

function identifyStrengths(data: any): string[] {
    const strengths = [];
    
    if (data.skills?.technical?.length >= 10) {
        strengths.push('Strong technical skill set');
    }
    
    if (data.experienceAssessment?.totalYears >= 5) {
        strengths.push('Extensive experience');
    }
    
    if (data.education?.length > 0) {
        strengths.push('Strong educational background');
    }
    
    return strengths;
}

function suggestRoles(data: any): string[] {
    const roles = [];
    const skills = data.skills?.technical || [];
    
    if (skills.some((s: string) => s.toLowerCase().includes('javascript'))) {
        roles.push('Frontend Developer', 'Full Stack Developer');
    }
    
    if (skills.some((s: string) => s.toLowerCase().includes('python'))) {
        roles.push('Backend Developer', 'Data Scientist');
    }
    
    return roles;
}

function identifySkillGaps(data: any): string[] {
    // Common skills that might be missing
    const commonSkills = ['Git', 'Docker', 'AWS', 'Testing'];
    const currentSkills = data.skills?.technical || [];
    
    return commonSkills.filter(skill => 
        !currentSkills.some((current: string) => 
            current.toLowerCase().includes(skill.toLowerCase())
        )
    );
}

function generateCareerAdvice(data: any): string[] {
    const advice = [];
    
    if (data.experienceAssessment?.totalYears < 2) {
        advice.push('Focus on building foundational skills and gaining more experience');
    }
    
    if (data.skillsAnalysis?.marketDemand === 'Low') {
        advice.push('Consider learning high-demand technologies like cloud platforms');
    }
    
    return advice;
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
app.http('extractResumeData', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ai/extract-resume',
    handler: extractResumeData
});

app.http('batchExtractResumes', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ai/extract-resume/batch',
    handler: batchExtractResumes
});

app.http('getExtractionStatus', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'ai/extract-resume/batch/{batchId}/status',
    handler: getExtractionStatus
});