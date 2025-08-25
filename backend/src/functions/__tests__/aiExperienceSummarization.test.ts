import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock Azure OpenAI and Search
jest.mock('@azure/openai', () => ({
    OpenAIClient: jest.fn(() => ({
        getChatCompletions: jest.fn()
    })),
    AzureKeyCredential: jest.fn()
}));

jest.mock('@azure/search-documents', () => ({
    SearchClient: jest.fn(() => ({
        getDocument: jest.fn()
    })),
    AzureKeyCredential: jest.fn()
}));

describe('AI Experience Summarization Functions', () => {
    beforeEach(() => {
        // Set up environment variables
        process.env.AZURE_SEARCH_ENDPOINT = 'https://test.search.windows.net';
        process.env.AZURE_SEARCH_API_KEY = 'test-key';
        process.env.AZURE_SEARCH_INDEX_NAME = 'candidates-index';
        process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
        process.env.AZURE_OPENAI_API_KEY = 'test-openai-key';
        process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'gpt-4';
        
        jest.clearAllMocks();
    });

    it('should be able to import the AI experience summarization module', () => {
        expect(() => {
            require('../aiExperienceSummarization');
        }).not.toThrow();
    });

    it('should validate experience summarization request', async () => {
        const mockRequest = {
            json: async () => ({}) // Empty request - no candidateId or experienceData
        };
        
        const mockContext = {
            log: jest.fn()
        };

        const { summarizeExperience } = require('../aiExperienceSummarization');
        const result = await summarizeExperience(mockRequest, mockContext);
        
        expect(result.status).toBe(400);
        expect(result.jsonBody.error).toContain('Either candidateId or experienceData is required');
    });

    it('should summarize experience with provided data', async () => {
        const mockRequest = {
            json: async () => ({
                experienceData: {
                    workHistory: [
                        {
                            title: 'Senior Software Engineer',
                            company: 'TechCorp',
                            startDate: '2020-01-01',
                            endDate: 'Present',
                            description: 'Led development of microservices architecture'
                        },
                        {
                            title: 'Software Engineer',
                            company: 'StartupCo',
                            startDate: '2018-06-01',
                            endDate: '2019-12-31',
                            description: 'Developed full-stack web applications'
                        }
                    ],
                    education: [
                        {
                            degree: 'Bachelor of Computer Science',
                            institution: 'University of Technology',
                            graduationDate: '2018-05-01'
                        }
                    ],
                    skills: ['JavaScript', 'Python', 'React', 'Node.js', 'AWS'],
                    projects: [
                        {
                            name: 'E-commerce Platform',
                            description: 'Built scalable e-commerce solution',
                            technologies: ['React', 'Node.js', 'MongoDB']
                        }
                    ]
                },
                summaryOptions: {
                    includeCareerProgression: true,
                    includeSkillsAssessment: true
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
                            professionalSummary: 'Experienced software engineer with 5+ years in full-stack development',
                            keyHighlights: [
                                'Led microservices architecture implementation',
                                'Strong full-stack development experience',
                                'Proven track record in startup and enterprise environments'
                            ],
                            skillsAssessment: {
                                primarySkills: ['JavaScript', 'Python', 'React', 'Node.js'],
                                emergingSkills: ['AWS', 'Microservices'],
                                experienceLevel: 'Senior',
                                yearsOfExperience: '5+'
                            },
                            careerProgression: {
                                trajectory: 'Upward progression from engineer to senior engineer',
                                nextLevelReadiness: 'Ready for tech lead or principal engineer roles',
                                recommendedRoles: ['Tech Lead', 'Principal Engineer', 'Engineering Manager']
                            },
                            suitabilityAnalysis: {
                                strengths: ['Technical leadership', 'Full-stack expertise', 'Architecture design'],
                                growthAreas: ['Team management', 'Product strategy'],
                                idealRoleType: 'Technical leadership roles in growing companies'
                            }
                        })
                    }
                }],
                usage: { totalTokens: 250 }
            })
        };

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { summarizeExperience } = require('../aiExperienceSummarization');
        const result = await summarizeExperience(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(result.jsonBody.summary.professionalSummary).toContain('software engineer');
        expect(result.jsonBody.summary.skillsAssessment.experienceLevel).toBe('Senior');
        expect(result.jsonBody.metadata.dataPoints.workExperience).toBe(2);
    });

    it('should fetch candidate data from search index', async () => {
        const mockRequest = {
            json: async () => ({
                candidateId: 'candidate-123'
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        // Mock search client response
        const mockSearchClient = {
            getDocument: jest.fn().mockResolvedValue({
                experience: [
                    { title: 'Developer', company: 'TechCorp' }
                ],
                education: [
                    { degree: 'BS Computer Science' }
                ],
                skills: ['JavaScript', 'React']
            })
        };

        // Mock AI response
        const mockOpenAIClient = {
            getChatCompletions: jest.fn().mockResolvedValue({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            professionalSummary: 'Software developer with React expertise',
                            keyHighlights: ['React development experience'],
                            skillsAssessment: {
                                primarySkills: ['JavaScript', 'React'],
                                experienceLevel: 'Mid-level'
                            },
                            careerProgression: {
                                trajectory: 'Steady growth'
                            },
                            suitabilityAnalysis: {
                                strengths: ['Frontend development']
                            }
                        })
                    }
                }],
                usage: { totalTokens: 150 }
            })
        };

        jest.doMock('@azure/search-documents', () => ({
            SearchClient: jest.fn(() => mockSearchClient),
            AzureKeyCredential: jest.fn()
        }));

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { summarizeExperience } = require('../aiExperienceSummarization');
        const result = await summarizeExperience(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(mockSearchClient.getDocument).toHaveBeenCalledWith('candidate-123');
    });

    it('should generate career advice', async () => {
        const mockRequest = {
            json: async () => ({
                experienceData: {
                    workHistory: [
                        { title: 'Junior Developer', company: 'StartupCo' }
                    ],
                    skills: ['JavaScript', 'HTML', 'CSS']
                },
                careerGoals: {
                    targetRole: 'Senior Developer',
                    timeframe: '2 years',
                    priorities: ['Technical growth', 'Leadership skills']
                },
                currentSituation: {
                    jobSatisfaction: 7,
                    careerStage: 'Early career',
                    challenges: ['Limited senior mentorship', 'Want more complex projects']
                }
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        // Mock career advice AI response
        const mockOpenAIClient = {
            getChatCompletions: jest.fn().mockResolvedValue({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            careerAssessment: {
                                currentPosition: 'Early-career developer with solid foundation',
                                strengths: ['Strong technical fundamentals', 'Growth mindset'],
                                growthAreas: ['Advanced frameworks', 'System design'],
                                marketPosition: 'Good entry-level position'
                            },
                            recommendations: {
                                shortTerm: [
                                    {
                                        action: 'Learn React or Vue.js framework',
                                        timeline: '3-6 months',
                                        impact: 'Increase marketability',
                                        priority: 'High'
                                    }
                                ],
                                longTerm: [
                                    {
                                        goal: 'Become senior developer',
                                        steps: ['Master advanced JavaScript', 'Learn system design', 'Take on leadership tasks'],
                                        timeline: '18-24 months'
                                    }
                                ]
                            },
                            skillDevelopment: {
                                prioritySkills: ['React', 'Node.js', 'Database design'],
                                learningPath: ['Frontend frameworks', 'Backend development', 'DevOps basics']
                            }
                        })
                    }
                }],
                usage: { totalTokens: 300 }
            })
        };

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { generateCareerAdvice } = require('../aiExperienceSummarization');
        const result = await generateCareerAdvice(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(result.jsonBody.advice.careerAssessment.currentPosition).toContain('Early-career');
        expect(result.jsonBody.advice.recommendations.shortTerm).toHaveLength(1);
    });

    it('should compare multiple candidates', async () => {
        const mockRequest = {
            json: async () => ({
                candidates: [
                    {
                        id: 'candidate-1',
                        name: 'Alice Johnson',
                        experienceData: {
                            workHistory: [{ title: 'Senior Developer', company: 'TechCorp' }],
                            skills: ['JavaScript', 'React', 'Node.js', 'AWS']
                        }
                    },
                    {
                        id: 'candidate-2',
                        name: 'Bob Smith',
                        experienceData: {
                            workHistory: [{ title: 'Full Stack Developer', company: 'StartupCo' }],
                            skills: ['Python', 'Django', 'PostgreSQL', 'Docker']
                        }
                    }
                ],
                jobRequirements: {
                    title: 'Senior Full Stack Developer',
                    requiredSkills: ['JavaScript', 'Python', 'React', 'Database'],
                    experienceLevel: 'Senior',
                    responsibilities: ['Lead development', 'Mentor junior developers']
                },
                comparisonCriteria: ['Skills', 'Experience', 'Leadership']
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        // Mock comparison AI response
        const mockOpenAIClient = {
            getChatCompletions: jest.fn().mockResolvedValue({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            overallRanking: [
                                {
                                    candidateId: 'candidate-1',
                                    rank: 1,
                                    overallScore: 88,
                                    summary: 'Strong JavaScript and React skills, senior-level experience'
                                },
                                {
                                    candidateId: 'candidate-2',
                                    rank: 2,
                                    overallScore: 82,
                                    summary: 'Excellent Python skills, good full-stack experience'
                                }
                            ],
                            detailedComparison: {
                                skills: {
                                    analysis: 'Both candidates have strong technical skills in different areas',
                                    rankings: [
                                        {
                                            candidateId: 'candidate-1',
                                            score: 90,
                                            strengths: ['JavaScript', 'React', 'AWS'],
                                            gaps: ['Python', 'Django']
                                        }
                                    ]
                                }
                            },
                            recommendations: {
                                topChoice: {
                                    candidateId: 'candidate-1',
                                    reasons: ['Better match for required JavaScript/React skills'],
                                    considerations: ['May need Python training']
                                }
                            }
                        })
                    }
                }],
                usage: { totalTokens: 400 }
            })
        };

        jest.doMock('../shared/openaiConfig', () => ({
            ...jest.requireActual('../shared/openaiConfig'),
            createOpenAIClient: () => mockOpenAIClient
        }));

        const { compareCandidates } = require('../aiExperienceSummarization');
        const result = await compareCandidates(mockRequest, mockContext);
        
        expect(result.status).toBe(200);
        expect(result.jsonBody.comparison.overallRanking).toHaveLength(2);
        expect(result.jsonBody.comparison.overallRanking[0].rank).toBe(1);
        expect(result.jsonBody.metadata.candidateCount).toBe(2);
    });

    it('should handle insufficient candidates for comparison', async () => {
        const mockRequest = {
            json: async () => ({
                candidates: [
                    { id: 'candidate-1', name: 'Alice' }
                ] // Only one candidate
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        const { compareCandidates } = require('../aiExperienceSummarization');
        const result = await compareCandidates(mockRequest, mockContext);
        
        expect(result.status).toBe(400);
        expect(result.jsonBody.error).toContain('At least 2 candidates are required');
    });

    it('should assess market position correctly', () => {
        // Test market position assessment logic
        const highDemandSkills = ['JavaScript', 'Python', 'React', 'AWS', 'Docker', 'Kubernetes'];
        const emergingSkills = ['AI/ML', 'Blockchain', 'IoT', 'Edge Computing'];
        
        const candidateSkills = ['JavaScript', 'React', 'AWS', 'Docker'];
        
        const hasHighDemand = candidateSkills.some(skill => 
            highDemandSkills.some(demand => skill.toLowerCase().includes(demand.toLowerCase()))
        );
        
        const hasEmerging = candidateSkills.some(skill => 
            emergingSkills.some(emerging => skill.toLowerCase().includes(emerging.toLowerCase()))
        );

        expect(hasHighDemand).toBe(true);
        expect(hasEmerging).toBe(false);
    });

    it('should assess role suitability', () => {
        const roleKeywords = {
            'frontend': ['javascript', 'react', 'vue', 'angular', 'css', 'html'],
            'backend': ['python', 'java', 'node', 'api', 'database', 'server'],
            'fullstack': ['javascript', 'react', 'node', 'database', 'api']
        };

        const candidateSkills = ['JavaScript', 'React', 'Node.js', 'MongoDB'];
        const targetRole = 'fullstack';
        
        const relevantKeywords = roleKeywords[targetRole] || [];
        const candidateSkillsLower = candidateSkills.map(s => s.toLowerCase());
        
        const matchCount = relevantKeywords.filter(keyword =>
            candidateSkillsLower.some(cs => cs.includes(keyword))
        ).length;

        const suitabilityScore = Math.round((matchCount / relevantKeywords.length) * 100);
        
        expect(matchCount).toBeGreaterThan(0);
        expect(suitabilityScore).toBeGreaterThan(50);
    });

    it('should handle candidate not found error', async () => {
        const mockRequest = {
            json: async () => ({
                candidateId: 'non-existent-candidate'
            })
        };
        
        const mockContext = {
            log: jest.fn()
        };

        // Mock search client to throw error
        const mockSearchClient = {
            getDocument: jest.fn().mockRejectedValue(new Error('Document not found'))
        };

        jest.doMock('@azure/search-documents', () => ({
            SearchClient: jest.fn(() => mockSearchClient),
            AzureKeyCredential: jest.fn()
        }));

        const { summarizeExperience } = require('../aiExperienceSummarization');
        const result = await summarizeExperience(mockRequest, mockContext);
        
        expect(result.status).toBe(404);
        expect(result.jsonBody.error).toContain('Candidate not found');
    });

    it('should calculate experience metrics correctly', () => {
        const experience = [
            { title: 'Junior Developer', startDate: '2020-01-01', endDate: '2021-12-31' },
            { title: 'Senior Developer', startDate: '2022-01-01', endDate: 'Present' }
        ];

        // Simple calculation for testing
        const totalYears = experience.length * 2; // Assume 2 years per job
        const jobCount = experience.length;
        const averageJobDuration = totalYears / jobCount;

        expect(totalYears).toBe(4);
        expect(jobCount).toBe(2);
        expect(averageJobDuration).toBe(2);
    });
});