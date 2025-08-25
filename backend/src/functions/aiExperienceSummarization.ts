import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { createOpenAIClient, promptTemplates, modelConfigs, formatPrompt, parseAIResponse, validateAIResponse, openaiConfig } from '../shared/openaiConfig';

const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME || 'candidates-index';

if (!searchEndpoint || !searchApiKey) {
    throw new Error('Missing required environment variables for AI experience summarization');
}

const searchClient = new SearchClient(
    searchEndpoint,
    searchIndexName,
    new AzureKeyCredential(searchApiKey)
);

/**
 * Summarize candidate experience using Azure OpenAI
 */
export async function summarizeExperience(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting AI-powered experience summarization');

    try {
        const requestBody = await request.json() as {
            candidateId?: string;
            experienceData?: {
                workHistory: any[];
                education: any[];
                skills: any[];
                projects?: any[];
                certifications?: any[];
            };
            summaryOptions?: {
                includeCareerProgression?: boolean;
                includeSkillsAssessment?: boolean;
                includeSuitabilityAnalysis?: boolean;
                targetRole?: string;
                focusAreas?: string[];
            };
        };

        let experienceData = requestBody.experienceData;

        // If candidateId is provided, fetch experience data from search index
        if (requestBody.candidateId && !experienceData) {
            try {
                const searchResult = await searchClient.getDocument(requestBody.candidateId) as any;
                experienceData = {
                    workHistory: searchResult.experience || [],
                    education: searchResult.education || [],
                    skills: searchResult.skills || [],
                    projects: searchResult.projects || [],
                    certifications: searchResult.certifications || []
                };
            } catch (error) {
                return {
                    status: 404,
                    jsonBody: {
                        error: 'Candidate not found or no experience data available',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    }
                };
            }
        }

        if (!experienceData) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Either candidateId or experienceData is required'
                }
            };
        }

        // Prepare experience data for AI analysis
        const formattedExperienceData = JSON.stringify(experienceData, null, 2);

        // Create OpenAI client and generate summary
        const openaiClient = createOpenAIClient();
        const prompt = formatPrompt(promptTemplates.experienceSummarization, { 
            experienceData: formattedExperienceData 
        });

        context.log('Sending experience data to Azure OpenAI for summarization');

        const response = await openaiClient.getChatCompletions(
            openaiConfig.deploymentName,
            [
                {
                    role: 'system',
                    content: 'You are an expert career counselor and recruiter. Analyze professional experience and provide insightful, actionable summaries.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            {
                maxTokens: modelConfigs.experienceSummarization.maxTokens,
                temperature: modelConfigs.experienceSummarization.temperature,
                topP: modelConfigs.experienceSummarization.topP
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
        const summaryData = parseAIResponse(aiResponse);
        const requiredFields = ['professionalSummary', 'keyHighlights', 'skillsAssessment', 'careerProgression'];
        
        if (!validateAIResponse(summaryData, requiredFields)) {
            throw new Error('AI response missing required summary fields');
        }

        // Enhance summary with additional analysis if requested
        const enhancedSummary = await enhanceSummaryData(
            summaryData, 
            experienceData, 
            requestBody.summaryOptions,
            context
        );

        context.log('Experience summarization completed successfully');

        return {
            status: 200,
            jsonBody: {
                message: 'Experience summarization completed successfully',
                summary: enhancedSummary,
                metadata: {
                    summarizedAt: new Date().toISOString(),
                    tokensUsed: response.usage?.totalTokens || 0,
                    candidateId: requestBody.candidateId,
                    dataPoints: {
                        workExperience: experienceData.workHistory?.length || 0,
                        education: experienceData.education?.length || 0,
                        skills: experienceData.skills?.length || 0,
                        projects: experienceData.projects?.length || 0,
                        certifications: experienceData.certifications?.length || 0
                    }
                }
            }
        };

    } catch (error) {
        context.log('Error in AI experience summarization:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to summarize experience',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Generate career advice based on experience analysis
 */
export async function generateCareerAdvice(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting AI-powered career advice generation');

    try {
        const requestBody = await request.json() as {
            candidateId?: string;
            experienceData?: any;
            careerGoals?: {
                targetRole?: string;
                targetIndustry?: string;
                timeframe?: string;
                priorities?: string[];
            };
            currentSituation?: {
                jobSatisfaction?: number;
                careerStage?: string;
                challenges?: string[];
            };
        };

        // Get experience data (similar to summarizeExperience)
        let experienceData = requestBody.experienceData;
        if (requestBody.candidateId && !experienceData) {
            try {
                const searchResult = await searchClient.getDocument(requestBody.candidateId) as any;
                experienceData = {
                    workHistory: searchResult.experience || [],
                    education: searchResult.education || [],
                    skills: searchResult.skills || []
                };
            } catch (error) {
                return {
                    status: 404,
                    jsonBody: {
                        error: 'Candidate not found',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    }
                };
            }
        }

        if (!experienceData) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Experience data is required for career advice'
                }
            };
        }

        const careerAdvicePrompt = `
You are an expert career counselor. Provide personalized career advice based on the following information:

Experience Data:
${JSON.stringify(experienceData, null, 2)}

Career Goals:
${JSON.stringify(requestBody.careerGoals || {}, null, 2)}

Current Situation:
${JSON.stringify(requestBody.currentSituation || {}, null, 2)}

Please provide comprehensive career advice in JSON format:
{
  "careerAssessment": {
    "currentPosition": "Assessment of current career position",
    "strengths": ["Key career strengths"],
    "growthAreas": ["Areas for improvement"],
    "marketPosition": "How they stand in the job market"
  },
  "recommendations": {
    "shortTerm": [
      {
        "action": "Specific action to take",
        "timeline": "When to do it",
        "impact": "Expected impact",
        "priority": "High/Medium/Low"
      }
    ],
    "longTerm": [
      {
        "goal": "Long-term career goal",
        "steps": ["Steps to achieve it"],
        "timeline": "Expected timeframe",
        "resources": ["Resources needed"]
      }
    ]
  },
  "skillDevelopment": {
    "prioritySkills": ["Skills to focus on developing"],
    "learningPath": ["Suggested learning progression"],
    "certifications": ["Recommended certifications"],
    "resources": ["Learning resources and platforms"]
  },
  "careerPaths": [
    {
      "path": "Career path option",
      "description": "Description of this path",
      "requirements": ["What's needed for this path"],
      "timeline": "Expected progression timeline",
      "pros": ["Advantages of this path"],
      "cons": ["Potential challenges"]
    }
  ],
  "networking": {
    "strategies": ["Networking strategies"],
    "events": ["Types of events to attend"],
    "platforms": ["Professional platforms to focus on"],
    "connections": ["Types of people to connect with"]
  },
  "jobSearchStrategy": {
    "targetCompanies": ["Types of companies to target"],
    "applicationStrategy": "How to approach job applications",
    "interviewPrep": ["Interview preparation tips"],
    "negotiation": ["Salary negotiation advice"]
  }
}
`;

        const openaiClient = createOpenAIClient();
        
        const response = await openaiClient.getChatCompletions(
            openaiConfig.deploymentName,
            [
                {
                    role: 'system',
                    content: 'You are an expert career counselor with deep knowledge of various industries and career paths. Provide actionable, personalized advice.'
                },
                {
                    role: 'user',
                    content: careerAdvicePrompt
                }
            ],
            {
                maxTokens: 2000,
                temperature: 0.4,
                topP: 0.8
            }
        );

        if (!response.choices || response.choices.length === 0) {
            throw new Error('No response from Azure OpenAI');
        }

        const aiResponse = response.choices[0].message?.content;
        if (!aiResponse) {
            throw new Error('Empty response from Azure OpenAI');
        }

        const adviceData = parseAIResponse(aiResponse);

        return {
            status: 200,
            jsonBody: {
                message: 'Career advice generated successfully',
                advice: adviceData,
                metadata: {
                    generatedAt: new Date().toISOString(),
                    tokensUsed: response.usage?.totalTokens || 0,
                    candidateId: requestBody.candidateId
                }
            }
        };

    } catch (error) {
        context.log('Error generating career advice:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to generate career advice',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Compare multiple candidates and provide insights
 */
export async function compareCandidates(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting AI-powered candidate comparison');

    try {
        const requestBody = await request.json() as {
            candidates: Array<{
                id: string;
                name?: string;
                experienceData?: any;
            }>;
            jobRequirements?: {
                title: string;
                requiredSkills: string[];
                preferredSkills?: string[];
                experienceLevel: string;
                responsibilities: string[];
            };
            comparisonCriteria?: string[];
        };

        if (!requestBody.candidates || requestBody.candidates.length < 2) {
            return {
                status: 400,
                jsonBody: {
                    error: 'At least 2 candidates are required for comparison'
                }
            };
        }

        // Fetch candidate data if not provided
        const candidatesWithData = await Promise.all(
            requestBody.candidates.map(async (candidate) => {
                if (!candidate.experienceData) {
                    try {
                        const searchResult = await searchClient.getDocument(candidate.id) as any;
                        candidate.experienceData = {
                            workHistory: searchResult.experience || [],
                            education: searchResult.education || [],
                            skills: searchResult.skills || []
                        };
                    } catch (error) {
                        context.log(`Failed to fetch data for candidate ${candidate.id}:`, error);
                    }
                }
                return candidate;
            })
        );

        const comparisonPrompt = `
You are an expert recruiter comparing candidates for a position. Analyze and compare the following candidates:

Job Requirements:
${JSON.stringify(requestBody.jobRequirements || {}, null, 2)}

Candidates:
${JSON.stringify(candidatesWithData, null, 2)}

Comparison Criteria: ${requestBody.comparisonCriteria?.join(', ') || 'Skills, Experience, Education, Cultural Fit'}

Please provide a comprehensive comparison in JSON format:
{
  "overallRanking": [
    {
      "candidateId": "candidate_id",
      "rank": 1,
      "overallScore": 85,
      "summary": "Brief summary of why they rank here"
    }
  ],
  "detailedComparison": {
    "skills": {
      "analysis": "Skills comparison analysis",
      "rankings": [
        {
          "candidateId": "candidate_id",
          "score": 90,
          "strengths": ["Skill strengths"],
          "gaps": ["Skill gaps"]
        }
      ]
    },
    "experience": {
      "analysis": "Experience comparison analysis",
      "rankings": [
        {
          "candidateId": "candidate_id",
          "score": 85,
          "relevantExperience": "Relevant experience summary",
          "experienceLevel": "Assessment of experience level"
        }
      ]
    },
    "education": {
      "analysis": "Education comparison analysis",
      "rankings": [
        {
          "candidateId": "candidate_id",
          "score": 80,
          "educationHighlights": "Education highlights"
        }
      ]
    }
  },
  "recommendations": {
    "topChoice": {
      "candidateId": "candidate_id",
      "reasons": ["Why they're the top choice"],
      "considerations": ["Things to consider"]
    },
    "alternatives": [
      {
        "candidateId": "candidate_id",
        "scenario": "When this candidate might be better",
        "advantages": ["Their advantages"]
      }
    ]
  },
  "interviewStrategy": {
    "focusAreas": ["Areas to focus on during interviews"],
    "differentiatingQuestions": ["Questions to help differentiate candidates"],
    "assessmentCriteria": ["Key criteria for final assessment"]
  }
}
`;

        const openaiClient = createOpenAIClient();
        
        const response = await openaiClient.getChatCompletions(
            openaiConfig.deploymentName,
            [
                {
                    role: 'system',
                    content: 'You are an expert recruiter with extensive experience in candidate evaluation and comparison. Provide objective, detailed analysis.'
                },
                {
                    role: 'user',
                    content: comparisonPrompt
                }
            ],
            {
                maxTokens: 2500,
                temperature: 0.2,
                topP: 0.7
            }
        );

        if (!response.choices || response.choices.length === 0) {
            throw new Error('No response from Azure OpenAI');
        }

        const aiResponse = response.choices[0].message?.content;
        if (!aiResponse) {
            throw new Error('Empty response from Azure OpenAI');
        }

        const comparisonData = parseAIResponse(aiResponse);

        return {
            status: 200,
            jsonBody: {
                message: 'Candidate comparison completed successfully',
                comparison: comparisonData,
                metadata: {
                    comparedAt: new Date().toISOString(),
                    tokensUsed: response.usage?.totalTokens || 0,
                    candidateCount: candidatesWithData.length,
                    jobTitle: requestBody.jobRequirements?.title
                }
            }
        };

    } catch (error) {
        context.log('Error in candidate comparison:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to compare candidates',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Enhance summary data with additional analysis
 */
async function enhanceSummaryData(summaryData: any, experienceData: any, options: any = {}, context: InvocationContext): Promise<any> {
    const enhanced = { ...summaryData };

    try {
        // Add market analysis if requested
        if (options?.includeSkillsAssessment) {
            enhanced.marketAnalysis = analyzeMarketPosition(experienceData.skills);
        }

        // Add role suitability if target role is specified
        if (options?.targetRole) {
            enhanced.roleSuitability = assessRoleSuitability(experienceData, options.targetRole);
        }

        // Add focus area analysis
        if (options?.focusAreas) {
            enhanced.focusAreaAnalysis = analyzeFocusAreas(experienceData, options.focusAreas);
        }

        return enhanced;
    } catch (error) {
        context.log('Warning: Failed to enhance summary data:', error);
        return summaryData;
    }
}

/**
 * Analyze market position based on skills
 */
function analyzeMarketPosition(skills: any[]): any {
    const highDemandSkills = ['JavaScript', 'Python', 'React', 'AWS', 'Docker', 'Kubernetes', 'TypeScript'];
    const emergingSkills = ['AI/ML', 'Blockchain', 'IoT', 'Edge Computing'];
    
    const hasHighDemand = skills.some(skill => 
        highDemandSkills.some(demand => skill.toLowerCase().includes(demand.toLowerCase()))
    );
    
    const hasEmerging = skills.some(skill => 
        emergingSkills.some(emerging => skill.toLowerCase().includes(emerging.toLowerCase()))
    );

    return {
        marketPosition: hasHighDemand ? 'Strong' : 'Moderate',
        demandLevel: hasHighDemand ? 'High' : 'Medium',
        futureProof: hasEmerging ? 'High' : 'Medium',
        recommendations: hasHighDemand ? 
            ['Leverage current high-demand skills'] : 
            ['Consider learning high-demand technologies']
    };
}

/**
 * Assess suitability for a specific role
 */
function assessRoleSuitability(experienceData: any, targetRole: string): any {
    // Simple role matching logic
    const roleKeywords = {
        'frontend': ['javascript', 'react', 'vue', 'angular', 'css', 'html'],
        'backend': ['python', 'java', 'node', 'api', 'database', 'server'],
        'fullstack': ['javascript', 'react', 'node', 'database', 'api'],
        'devops': ['aws', 'docker', 'kubernetes', 'ci/cd', 'jenkins'],
        'data': ['python', 'sql', 'analytics', 'machine learning', 'statistics']
    };

    const roleType = targetRole.toLowerCase();
    const relevantKeywords = roleKeywords[roleType] || [];
    const candidateSkills = experienceData.skills || [];
    
    const matchCount = relevantKeywords.filter(keyword =>
        candidateSkills.some((skill: string) => skill.toLowerCase().includes(keyword))
    ).length;

    const suitabilityScore = Math.round((matchCount / relevantKeywords.length) * 100);

    return {
        suitabilityScore: suitabilityScore,
        matchedSkills: matchCount,
        totalRequiredSkills: relevantKeywords.length,
        recommendation: suitabilityScore >= 70 ? 'Highly Suitable' : 
                      suitabilityScore >= 50 ? 'Suitable with training' : 'Not suitable'
    };
}

/**
 * Analyze specific focus areas
 */
function analyzeFocusAreas(experienceData: any, focusAreas: string[]): any {
    return focusAreas.map(area => ({
        area: area,
        relevantExperience: findRelevantExperience(experienceData, area),
        strengthLevel: assessStrengthInArea(experienceData, area),
        recommendations: getAreaRecommendations(area)
    }));
}

function findRelevantExperience(experienceData: any, area: string): string[] {
    // Simple implementation - would be more sophisticated in real app
    const workHistory = experienceData.workHistory || [];
    return workHistory
        .filter((job: any) => 
            job.description?.toLowerCase().includes(area.toLowerCase()) ||
            job.title?.toLowerCase().includes(area.toLowerCase())
        )
        .map((job: any) => job.title || 'Relevant Position');
}

function assessStrengthInArea(experienceData: any, area: string): string {
    const relevantExp = findRelevantExperience(experienceData, area);
    if (relevantExp.length >= 3) return 'Strong';
    if (relevantExp.length >= 1) return 'Moderate';
    return 'Limited';
}

function getAreaRecommendations(area: string): string[] {
    const recommendations: Record<string, string[]> = {
        'leadership': ['Take on team lead roles', 'Pursue management training'],
        'technical': ['Stay updated with latest technologies', 'Contribute to open source'],
        'communication': ['Practice public speaking', 'Write technical blogs'],
        'project management': ['Get PMP certification', 'Lead cross-functional projects']
    };
    
    return recommendations[area.toLowerCase()] || ['Gain more experience in this area'];
}

// Register HTTP functions
app.http('summarizeExperience', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ai/summarize-experience',
    handler: summarizeExperience
});

app.http('generateCareerAdvice', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ai/career-advice',
    handler: generateCareerAdvice
});

app.http('compareCandidates', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ai/compare-candidates',
    handler: compareCandidates
});