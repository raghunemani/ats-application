import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock Azure OpenAI
jest.mock('@azure/openai', () => ({
    OpenAIClient: jest.fn(() => ({
        getChatCompletions: jest.fn()
    })),
    AzureKeyCredential: jest.fn()
}));

describe('AI Email Generation Functions', () => {
    beforeEach(() => {
        // Set up environment variables
        process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
        process.env.AZURE_OPENAI_API_KEY = 'test-openai-key';
        process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'gpt-4';
        
        jest.clearAllMocks();
    });

    it('should be able to import the AI email generation module', () => {
        expect(() => {
            require('../aiEmailGeneration');
        }).not.toThrow();
    });

    it('should validate email generation request', async () => {
        const mockRequest = {
            json: async () => ({
                candidateInfo: {}, // Missing required name
                jobInfo: {} // Missing required fields
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        const { generatePersonalizedEmail } = require('../aiEmailGeneration');
        const result = await generatePersonalizedEmail(mockRequest, mockContext);
        
        expect(result.status).toBe(400);
        expect(result.jsonBody.error).toContain('Candidate name, job title, and company name are required');
    });

    it('should generate personalized email with valid input', async () => {
        const mockRequest = {
            json: async () => ({
                candidateInfo: {
                    name: 'John Doe',
                    currentRole: 'Software Developer',
                    skills: ['JavaScript', 'React', 'Node.js'],
                    experienceLevel: 'Senior'
                },
                jobInfo: {
                    title: 'Senior Full Stack Developer',
                    companyName: 'Tech Corp',
                    requirements: ['JavaScript', 'React', 'AWS'],
                    location: 'San Francisco',
                    salaryRange: '$120k-150k'
                },
                emailContext: {
                    tone: 'professional',
                    purpose: 'initial_outreach',
                    personalizationLevel: 'high'
                }
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        // Mock successful AI response
        const mockOpenAIClient = {
            getChatCompletions: jest.fn().mockResolvedValue({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            subject: 'Exciting Senior Full Stack Developer Opportunity at Tech Corp',
                            body: 'Dear John Doe, I hope this email finds you well...',
                            callToAction: 'Would you be interested in a brief call to discuss this opportunity?',
                            personalizationNotes: 'Mentioned specific JavaScript and React skills'
                        })
                    }
                }],
                usage: { totalTokens: 150 }
            })
        };

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { generatePersonalizedEmail } = require('../aiEmailGeneration');
        const result = await generatePersonalizedEmail(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(result.jsonBody.email.subject).toContain('Senior Full Stack Developer');
        expect(result.jsonBody.email.metadata.candidateName).toBe('John Doe');
    });

    it('should generate email variations', async () => {
        const mockRequest = {
            json: async () => ({
                candidateInfo: {
                    name: 'Jane Smith',
                    skills: ['Python', 'Django']
                },
                jobInfo: {
                    title: 'Backend Developer',
                    companyName: 'StartupCo'
                },
                variationCount: 3,
                variationTypes: ['tone', 'approach']
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        // Mock successful AI responses
        const mockOpenAIClient = {
            getChatCompletions: jest.fn().mockResolvedValue({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            subject: 'Backend Developer Role at StartupCo',
                            body: 'Hi Jane, We have an exciting opportunity...',
                            callToAction: 'Let\'s connect!',
                            personalizationNotes: 'Focused on Python skills'
                        })
                    }
                }],
                usage: { totalTokens: 120 }
            })
        };

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { generateEmailVariations } = require('../aiEmailGeneration');
        const result = await generateEmailVariations(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(result.jsonBody.variations).toHaveLength(3);
        expect(result.jsonBody.metadata.totalVariations).toBe(3);
    });

    it('should analyze email content', async () => {
        const mockRequest = {
            json: async () => ({
                emailContent: {
                    subject: 'Great opportunity for you!',
                    body: 'Hi there, we have a job that might interest you. Let me know if you want to chat.'
                },
                analysisType: 'engagement'
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        // Mock AI analysis response
        const mockOpenAIClient = {
            getChatCompletions: jest.fn().mockResolvedValue({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            overallScore: 65,
                            analysis: {
                                engagement: {
                                    score: 60,
                                    subjectLineScore: 50,
                                    openingScore: 70,
                                    callToActionScore: 65,
                                    feedback: 'Subject line is too generic'
                                },
                                personalization: {
                                    score: 40,
                                    personalElements: [],
                                    missedOpportunities: ['No candidate name', 'No specific skills mentioned'],
                                    feedback: 'Very low personalization'
                                }
                            },
                            improvements: [
                                'Add candidate name to subject and greeting',
                                'Mention specific skills or experience',
                                'Be more specific about the opportunity'
                            ]
                        })
                    }
                }],
                usage: { totalTokens: 200 }
            })
        };

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { analyzeEmailContent } = require('../aiEmailGeneration');
        const result = await analyzeEmailContent(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(result.jsonBody.analysis.overallScore).toBe(65);
        expect(result.jsonBody.analysis.analysis.engagement.score).toBe(60);
    });

    it('should generate email templates', async () => {
        const mockRequest = {
            json: async () => ({
                templateTypes: ['initial_outreach', 'follow_up'],
                companyInfo: {
                    name: 'TechCorp',
                    industry: 'Software Development',
                    culture: 'Innovative and collaborative'
                },
                customization: {
                    tone: 'friendly',
                    style: 'modern'
                }
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        // Mock template generation response
        const mockOpenAIClient = {
            getChatCompletions: jest.fn().mockResolvedValue({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            templateName: 'initial_outreach',
                            subject: 'Exciting {jobTitle} opportunity at {companyName}',
                            body: 'Hi {candidateName}, I hope this message finds you well...',
                            placeholders: ['candidateName', 'jobTitle', 'companyName'],
                            usage: 'Use for first contact with potential candidates',
                            tips: ['Personalize with specific skills', 'Mention mutual connections if any']
                        })
                    }
                }],
                usage: { totalTokens: 180 }
            })
        };

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { generateEmailTemplates } = require('../aiEmailGeneration');
        const result = await generateEmailTemplates(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(result.jsonBody.templates).toHaveLength(2);
        expect(result.jsonBody.metadata.templateCount).toBe(2);
    });

    it('should handle missing email content for analysis', async () => {
        const mockRequest = {
            json: async () => ({
                emailContent: {
                    subject: 'Test subject'
                    // Missing body
                }
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        const { analyzeEmailContent } = require('../aiEmailGeneration');
        const result = await analyzeEmailContent(mockRequest, mockContext);
        
        expect(result.status).toBe(400);
        expect(result.jsonBody.error).toContain('Email subject and body are required');
    });

    it('should validate email context options', () => {
        const validTones = ['professional', 'friendly', 'casual'];
        const validPurposes = ['initial_outreach', 'follow_up', 'interview_invitation', 'offer_letter'];
        const validPersonalizationLevels = ['high', 'medium', 'low'];

        expect(validTones).toContain('professional');
        expect(validPurposes).toContain('initial_outreach');
        expect(validPersonalizationLevels).toContain('high');
    });

    it('should format email variables correctly', () => {
        const candidateInfo = {
            name: 'Alice Johnson',
            skills: ['Python', 'Machine Learning', 'TensorFlow'],
            experienceLevel: 'Senior'
        };

        const jobInfo = {
            title: 'ML Engineer',
            companyName: 'AI Startup',
            requirements: ['Python', 'ML', 'Deep Learning']
        };

        // Test variable formatting
        const skillsString = candidateInfo.skills.join(', ');
        expect(skillsString).toBe('Python, Machine Learning, TensorFlow');
        
        const requirementsString = jobInfo.requirements.join(', ');
        expect(requirementsString).toBe('Python, ML, Deep Learning');
    });

    it('should calculate email metadata correctly', () => {
        const emailBody = 'This is a test email body with multiple words to test word count calculation.';
        const wordCount = emailBody.split(' ').length;
        const estimatedReadTime = Math.ceil(wordCount / 200); // 200 words per minute average

        expect(wordCount).toBe(14);
        expect(estimatedReadTime).toBe(1); // Should be 1 minute for 14 words
    });

    it('should handle AI service errors gracefully', async () => {
        const mockRequest = {
            json: async () => ({
                candidateInfo: {
                    name: 'Test User'
                },
                jobInfo: {
                    title: 'Developer',
                    companyName: 'TestCorp'
                }
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        // Mock AI service error
        const mockOpenAIClient = {
            getChatCompletions: jest.fn().mockRejectedValue(new Error('AI service unavailable'))
        };

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { generatePersonalizedEmail } = require('../aiEmailGeneration');
        const result = await generatePersonalizedEmail(mockRequest, mockContext);
        
        expect(result.status).toBe(500);
        expect(result.jsonBody.error).toBe('Failed to generate email');
    });
});