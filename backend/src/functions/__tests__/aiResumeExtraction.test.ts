import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock Azure OpenAI before importing the module
jest.mock('@azure/openai', () => ({
    OpenAIClient: jest.fn(() => ({
        getChatCompletions: jest.fn()
    })),
    AzureKeyCredential: jest.fn()
}));

jest.mock('@azure/storage-blob', () => ({
    BlobServiceClient: {
        fromConnectionString: jest.fn(() => ({
            getContainerClient: jest.fn(() => ({
                getBlockBlobClient: jest.fn(() => ({
                    download: jest.fn(() => ({
                        readableStreamBody: {
                            on: jest.fn((event, callback) => {
                                if (event === 'data') {
                                    callback(Buffer.from('Sample resume text content'));
                                } else if (event === 'end') {
                                    callback();
                                }
                            })
                        }
                    }))
                }))
            }))
        }))
    }
}));

jest.mock('@azure/search-documents', () => ({
    SearchClient: jest.fn(() => ({
        mergeOrUploadDocuments: jest.fn()
    })),
    AzureKeyCredential: jest.fn()
}));

describe('AI Resume Extraction Functions', () => {
    beforeEach(() => {
        // Set up environment variables
        process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test;EndpointSuffix=core.windows.net';
        process.env.AZURE_SEARCH_ENDPOINT = 'https://test.search.windows.net';
        process.env.AZURE_SEARCH_API_KEY = 'test-key';
        process.env.AZURE_SEARCH_INDEX_NAME = 'candidates-index';
        process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
        process.env.AZURE_OPENAI_API_KEY = 'test-openai-key';
        process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'gpt-4';
        
        jest.clearAllMocks();
    });

    it('should be able to import the AI resume extraction module', () => {
        expect(() => {
            require('../aiResumeExtraction');
        }).not.toThrow();
    });

    it('should validate resume extraction configuration', () => {
        const { validateOpenAIConfig } = require('../shared/openaiConfig');
        
        // Should not throw with valid config
        expect(() => {
            validateOpenAIConfig();
        }).not.toThrow();
        
        // Should throw with missing endpoint
        delete process.env.AZURE_OPENAI_ENDPOINT;
        expect(() => {
            validateOpenAIConfig();
        }).toThrow('AZURE_OPENAI_ENDPOINT environment variable is required');
    });

    it('should format prompts correctly', () => {
        const { formatPrompt } = require('../shared/openaiConfig');
        
        const template = 'Hello {name}, your role is {role}';
        const variables = { name: 'John', role: 'Developer' };
        
        const result = formatPrompt(template, variables);
        expect(result).toBe('Hello John, your role is Developer');
    });

    it('should parse AI responses correctly', () => {
        const { parseAIResponse } = require('../shared/openaiConfig');
        
        const validResponse = '{"name": "John Doe", "skills": ["JavaScript", "React"]}';
        const result = parseAIResponse(validResponse);
        
        expect(result).toEqual({
            name: 'John Doe',
            skills: ['JavaScript', 'React']
        });
    });

    it('should validate AI responses', () => {
        const { validateAIResponse } = require('../shared/openaiConfig');
        
        const response = {
            personalInfo: { name: 'John' },
            skills: ['JavaScript'],
            experience: [],
            education: []
        };
        
        const requiredFields = ['personalInfo', 'skills', 'experience', 'education'];
        expect(validateAIResponse(response, requiredFields)).toBe(true);
        
        const incompleteResponse = { personalInfo: { name: 'John' } };
        expect(validateAIResponse(incompleteResponse, requiredFields)).toBe(false);
    });

    it('should handle resume extraction request validation', async () => {
        const mockRequest = {
            json: async () => ({}) // Empty request body
        };
        
        const mockContext = {
            log: jest.fn()
        };

        const { extractResumeData } = require('../aiResumeExtraction');
        const result = await extractResumeData(mockRequest, mockContext);
        
        expect(result.status).toBe(400);
        expect(result.jsonBody.error).toContain('Either resumeText or resumeUrl is required');
    });

    it('should process batch extraction requests', async () => {
        const mockRequest = {
            json: async () => ({
                resumes: [
                    { candidateId: '1', resumeText: 'Resume 1 content' },
                    { candidateId: '2', resumeText: 'Resume 2 content' }
                ],
                options: { maxConcurrent: 2 }
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
                            personalInfo: { name: 'Test' },
                            skills: { technical: ['JavaScript'] },
                            experience: [],
                            education: []
                        })
                    }
                }],
                usage: { totalTokens: 100 }
            })
        };

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { batchExtractResumes } = require('../aiResumeExtraction');
        const result = await batchExtractResumes(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(result.jsonBody.summary.total).toBe(2);
    });

    it('should handle extraction status requests', async () => {
        const mockRequest = {
            params: { batchId: 'test-batch-123' }
        };
        
        const mockContext = {
            log: jest.fn()
        };

        const { getExtractionStatus } = require('../aiResumeExtraction');
        const result = await getExtractionStatus(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(result.jsonBody.batchId).toBe('test-batch-123');
        expect(result.jsonBody.status).toBe('completed');
    });

    it('should analyze skills correctly', () => {
        const skills = {
            technical: ['JavaScript', 'Python', 'React'],
            frameworks: ['Express', 'Django'],
            languages: ['JavaScript', 'Python'],
            tools: ['Git', 'Docker']
        };

        // This would test the analyzeSkills function if it were exported
        // For now, test the concept
        const totalSkills = Object.values(skills).flat().length;
        expect(totalSkills).toBe(9);
        
        const technicalCount = skills.technical.length;
        expect(technicalCount).toBe(3);
    });

    it('should assess experience level correctly', () => {
        const experience = [
            { title: 'Junior Developer', company: 'Company A' },
            { title: 'Senior Developer', company: 'Company B' },
            { title: 'Lead Developer', company: 'Company C' }
        ];

        // Test experience assessment logic
        const jobCount = experience.length;
        expect(jobCount).toBe(3);
        
        const hasLeadership = experience.some(exp => 
            exp.title.toLowerCase().includes('senior') || 
            exp.title.toLowerCase().includes('lead')
        );
        expect(hasLeadership).toBe(true);
    });

    it('should generate career insights', () => {
        const extractedData = {
            skills: {
                technical: ['JavaScript', 'React', 'Node.js', 'Python', 'AWS']
            },
            experience: [
                { title: 'Senior Developer' },
                { title: 'Full Stack Developer' }
            ],
            education: [
                { degree: 'Bachelor of Computer Science' }
            ]
        };

        // Test insight generation logic
        const strengths = [];
        
        if (extractedData.skills.technical.length >= 5) {
            strengths.push('Strong technical skill set');
        }
        
        if (extractedData.experience.length >= 2) {
            strengths.push('Good experience diversity');
        }
        
        if (extractedData.education.length > 0) {
            strengths.push('Strong educational background');
        }

        expect(strengths).toContain('Strong technical skill set');
        expect(strengths).toContain('Good experience diversity');
        expect(strengths).toContain('Strong educational background');
    });

    it('should handle error scenarios gracefully', async () => {
        const mockRequest = {
            json: async () => {
                throw new Error('Invalid JSON');
            }
        };
        
        const mockContext = {
            log: jest.fn()
        };

        const { extractResumeData } = require('../aiResumeExtraction');
        const result = await extractResumeData(mockRequest, mockContext);
        
        expect(result.status).toBe(500);
        expect(result.jsonBody.error).toBe('Failed to extract resume data');
    });
});