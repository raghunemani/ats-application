import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createOpenAIClient, promptTemplates, modelConfigs, formatPrompt, parseAIResponse, validateAIResponse, openaiConfig } from '../shared/openaiConfig';

/**
 * Generate personalized email content using Azure OpenAI
 */
export async function generatePersonalizedEmail(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting AI-powered email generation');

    try {
        const requestBody = await request.json() as {
            candidateInfo: {
                name: string;
                currentRole?: string;
                skills?: string[];
                experienceLevel?: string;
                location?: string;
            };
            jobInfo: {
                title: string;
                companyName: string;
                requirements?: string[];
                location?: string;
                salaryRange?: string;
                description?: string;
            };
            emailContext: {
                tone?: 'professional' | 'friendly' | 'casual';
                purpose?: 'initial_outreach' | 'follow_up' | 'interview_invitation' | 'offer_letter';
                personalizationLevel?: 'high' | 'medium' | 'low';
                templateType?: 'standard' | 'technical' | 'executive';
            };
            customInstructions?: string;
        };

        // Validate required fields
        if (!requestBody.candidateInfo?.name || !requestBody.jobInfo?.title || !requestBody.jobInfo?.companyName) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Candidate name, job title, and company name are required'
                }
            };
        }

        // Set defaults
        const emailContext = {
            tone: requestBody.emailContext?.tone || 'professional',
            purpose: requestBody.emailContext?.purpose || 'initial_outreach',
            personalizationLevel: requestBody.emailContext?.personalizationLevel || 'medium'
        };

        // Prepare variables for prompt
        const promptVariables = {
            candidateName: requestBody.candidateInfo.name,
            currentRole: requestBody.candidateInfo.currentRole || 'Professional',
            skills: requestBody.candidateInfo.skills?.join(', ') || 'Various technical skills',
            experienceLevel: requestBody.candidateInfo.experienceLevel || 'Experienced',
            jobTitle: requestBody.jobInfo.title,
            companyName: requestBody.jobInfo.companyName,
            jobRequirements: requestBody.jobInfo.requirements?.join(', ') || 'Role-specific requirements',
            jobLocation: requestBody.jobInfo.location || 'Various locations',
            salaryRange: requestBody.jobInfo.salaryRange || 'Competitive salary',
            tone: emailContext.tone,
            purpose: emailContext.purpose,
            personalizationLevel: emailContext.personalizationLevel
        };

        // Create OpenAI client and generate email
        const openaiClient = createOpenAIClient();
        let prompt = formatPrompt(promptTemplates.emailGeneration, promptVariables);

        // Add custom instructions if provided
        if (requestBody.customInstructions) {
            prompt += `\n\nAdditional Instructions: ${requestBody.customInstructions}`;
        }

        context.log('Sending email generation request to Azure OpenAI');

        const response = await openaiClient.getChatCompletions(
            openaiConfig.deploymentName,
            [
                {
                    role: 'system',
                    content: 'You are an expert recruiter and email writer. Create professional, engaging, and personalized recruitment emails that get responses.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            {
                maxTokens: modelConfigs.emailGeneration.maxTokens,
                temperature: modelConfigs.emailGeneration.temperature,
                topP: modelConfigs.emailGeneration.topP
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
        const emailData = parseAIResponse<{
            subject: string;
            body: string;
            callToAction: string;
            personalizationNotes?: string;
        }>(aiResponse);
        const requiredFields = ['subject', 'body', 'callToAction'];
        
        if (!validateAIResponse(emailData, requiredFields)) {
            throw new Error('AI response missing required email fields');
        }

        // Enhance email data with metadata
        const enhancedEmailData = {
            ...emailData,
            metadata: {
                generatedAt: new Date().toISOString(),
                tokensUsed: response.usage?.totalTokens || 0,
                candidateName: requestBody.candidateInfo.name,
                jobTitle: requestBody.jobInfo.title,
                companyName: requestBody.jobInfo.companyName,
                emailContext: emailContext,
                wordCount: emailData.body.split(' ').length,
                estimatedReadTime: Math.ceil(emailData.body.split(' ').length / 200) // Average reading speed
            }
        };

        context.log('Email generation completed successfully');

        return {
            status: 200,
            jsonBody: {
                message: 'Email generated successfully',
                email: enhancedEmailData
            }
        };

    } catch (error) {
        context.log('Error in AI email generation:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to generate email',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Generate multiple email variations for A/B testing
 */
export async function generateEmailVariations(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting email variations generation');

    try {
        const requestBody = await request.json() as {
            candidateInfo: any;
            jobInfo: any;
            variationCount?: number;
            variationTypes?: Array<'tone' | 'length' | 'approach' | 'personalization'>;
        };

        const variationCount = Math.min(requestBody.variationCount || 3, 5); // Max 5 variations
        const variationTypes = requestBody.variationTypes || ['tone', 'approach'];

        const variations = [];
        const baseRequest = {
            candidateInfo: requestBody.candidateInfo,
            jobInfo: requestBody.jobInfo,
            emailContext: {}
        };

        // Generate different variations
        for (let i = 0; i < variationCount; i++) {
            const variation: any = { ...baseRequest };
            
            // Apply different variation strategies
            if (variationTypes.includes('tone')) {
                const tones = ['professional', 'friendly', 'casual'];
                variation.emailContext = { tone: tones[i % tones.length] };
            }
            
            if (variationTypes.includes('approach')) {
                const approaches = ['direct', 'storytelling', 'benefit-focused'];
                variation.customInstructions = `Use a ${approaches[i % approaches.length]} approach in the email.`;
            }

            if (variationTypes.includes('length')) {
                const lengths = ['concise (150 words)', 'standard (250 words)', 'detailed (350 words)'];
                variation.customInstructions = (variation.customInstructions || '') + ` Keep the email ${lengths[i % lengths.length]}.`;
            }

            // Generate email for this variation
            const mockRequest = {
                json: async () => variation
            } as HttpRequest;

            const result = await generatePersonalizedEmail(mockRequest, context);
            
            if (result.status === 200) {
                variations.push({
                    variationId: i + 1,
                    variationType: variationTypes[i % variationTypes.length],
                    email: (result.jsonBody as any).email
                });
            }
        }

        return {
            status: 200,
            jsonBody: {
                message: 'Email variations generated successfully',
                variations: variations,
                metadata: {
                    totalVariations: variations.length,
                    generatedAt: new Date().toISOString()
                }
            }
        };

    } catch (error) {
        context.log('Error generating email variations:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to generate email variations',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Analyze and improve existing email content
 */
export async function analyzeEmailContent(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting email content analysis');

    try {
        const requestBody = await request.json() as {
            emailContent: {
                subject: string;
                body: string;
            };
            analysisType?: 'engagement' | 'personalization' | 'compliance' | 'all';
        };

        if (!requestBody.emailContent?.subject || !requestBody.emailContent?.body) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Email subject and body are required for analysis'
                }
            };
        }

        const analysisType = requestBody.analysisType || 'all';
        
        // Create analysis prompt
        const analysisPrompt = `
Analyze the following recruitment email and provide detailed feedback:

Subject: ${requestBody.emailContent.subject}
Body: ${requestBody.emailContent.body}

Please analyze the email for:
1. Engagement potential (subject line effectiveness, opening, call-to-action)
2. Personalization level (how personalized it feels)
3. Professional tone and clarity
4. Compliance considerations (avoiding discriminatory language)
5. Improvement suggestions

Return the analysis in JSON format:
{
  "overallScore": 85,
  "analysis": {
    "engagement": {
      "score": 80,
      "subjectLineScore": 75,
      "openingScore": 85,
      "callToActionScore": 80,
      "feedback": "Detailed feedback on engagement"
    },
    "personalization": {
      "score": 70,
      "personalElements": ["List of personal elements found"],
      "missedOpportunities": ["Areas where more personalization could help"],
      "feedback": "Personalization feedback"
    },
    "professionalism": {
      "score": 90,
      "toneAssessment": "Professional and appropriate",
      "clarityScore": 85,
      "feedback": "Professionalism feedback"
    },
    "compliance": {
      "score": 95,
      "potentialIssues": ["Any compliance concerns"],
      "recommendations": ["Compliance recommendations"],
      "feedback": "Compliance feedback"
    }
  },
  "improvements": [
    "Specific improvement suggestions"
  ],
  "rewriteSuggestions": {
    "subject": "Improved subject line",
    "opening": "Improved opening paragraph",
    "callToAction": "Improved call-to-action"
  }
}
`;

        const openaiClient = createOpenAIClient();
        
        const response = await openaiClient.getChatCompletions(
            openaiConfig.deploymentName,
            [
                {
                    role: 'system',
                    content: 'You are an expert email marketing analyst specializing in recruitment communications. Provide detailed, actionable feedback.'
                },
                {
                    role: 'user',
                    content: analysisPrompt
                }
            ],
            {
                maxTokens: 1500,
                temperature: 0.3,
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

        const analysisData = parseAIResponse(aiResponse);

        return {
            status: 200,
            jsonBody: {
                message: 'Email analysis completed successfully',
                analysis: analysisData,
                metadata: {
                    analyzedAt: new Date().toISOString(),
                    tokensUsed: response.usage?.totalTokens || 0,
                    analysisType: analysisType
                }
            }
        };

    } catch (error) {
        context.log('Error in email analysis:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to analyze email content',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Generate email templates for different scenarios
 */
export async function generateEmailTemplates(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Starting email template generation');

    try {
        const requestBody = await request.json() as {
            templateTypes?: string[];
            companyInfo?: {
                name: string;
                industry?: string;
                culture?: string;
            };
            customization?: {
                tone?: string;
                style?: string;
                branding?: string;
            };
        };

        const templateTypes = requestBody.templateTypes || [
            'initial_outreach',
            'follow_up',
            'interview_invitation',
            'rejection_friendly',
            'offer_letter'
        ];

        const templates = [];

        for (const templateType of templateTypes) {
            const templatePrompt = `
Create a professional email template for: ${templateType}

Company: ${requestBody.companyInfo?.name || '[Company Name]'}
Industry: ${requestBody.companyInfo?.industry || '[Industry]'}
Tone: ${requestBody.customization?.tone || 'professional'}

The template should:
1. Use placeholders for personalization (e.g., {candidateName}, {jobTitle})
2. Be appropriate for the ${templateType} scenario
3. Include a compelling subject line
4. Have a clear call-to-action
5. Be professional yet engaging

Return in JSON format:
{
  "templateName": "${templateType}",
  "subject": "Subject line with placeholders",
  "body": "Email body with placeholders",
  "placeholders": ["List of all placeholders used"],
  "usage": "When to use this template",
  "tips": ["Tips for customizing this template"]
}
`;

            const openaiClient = createOpenAIClient();
            
            const response = await openaiClient.getChatCompletions(
                openaiConfig.deploymentName,
                [
                    {
                        role: 'system',
                        content: 'You are an expert at creating recruitment email templates. Create professional, effective templates with proper placeholders.'
                    },
                    {
                        role: 'user',
                        content: templatePrompt
                    }
                ],
                {
                    maxTokens: 800,
                    temperature: 0.4,
                    topP: 0.8
                }
            );

            if (response.choices && response.choices.length > 0) {
                const aiResponse = response.choices[0].message?.content;
                if (aiResponse) {
                    try {
                        const templateData = parseAIResponse(aiResponse);
                        templates.push(templateData);
                    } catch (error) {
                        context.log(`Failed to parse template for ${templateType}:`, error);
                    }
                }
            }
        }

        return {
            status: 200,
            jsonBody: {
                message: 'Email templates generated successfully',
                templates: templates,
                metadata: {
                    generatedAt: new Date().toISOString(),
                    templateCount: templates.length,
                    companyInfo: requestBody.companyInfo
                }
            }
        };

    } catch (error) {
        context.log('Error generating email templates:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to generate email templates',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

// Register HTTP functions
app.http('generatePersonalizedEmail', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ai/generate-email',
    handler: generatePersonalizedEmail
});

app.http('generateEmailVariations', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ai/generate-email/variations',
    handler: generateEmailVariations
});

app.http('analyzeEmailContent', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ai/analyze-email',
    handler: analyzeEmailContent
});

app.http('generateEmailTemplates', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ai/email-templates',
    handler: generateEmailTemplates
});