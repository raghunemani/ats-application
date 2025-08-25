import { OpenAIClient, AzureKeyCredential } from '@azure/openai';

// Azure OpenAI configuration
export const openaiConfig = {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
    apiKey: process.env.AZURE_OPENAI_API_KEY || '',
    deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4',
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview'
};

// Validate configuration
export function validateOpenAIConfig(): void {
    if (!openaiConfig.endpoint) {
        throw new Error('AZURE_OPENAI_ENDPOINT environment variable is required');
    }
    if (!openaiConfig.apiKey) {
        throw new Error('AZURE_OPENAI_API_KEY environment variable is required');
    }
    if (!openaiConfig.deploymentName) {
        throw new Error('AZURE_OPENAI_DEPLOYMENT_NAME environment variable is required');
    }
}

// Create OpenAI client instance
export function createOpenAIClient(): OpenAIClient {
    validateOpenAIConfig();
    return new OpenAIClient(
        openaiConfig.endpoint,
        new AzureKeyCredential(openaiConfig.apiKey)
    );
}

// Common prompt templates
export const promptTemplates = {
    resumeExtraction: `
You are an expert resume parser. Extract structured information from the following resume text.

Resume Text:
{resumeText}

Please extract and return the following information in JSON format:
{
  "personalInfo": {
    "name": "Full name",
    "email": "Email address",
    "phone": "Phone number",
    "location": "City, State/Country"
  },
  "summary": "Professional summary or objective",
  "skills": {
    "technical": ["List of technical skills"],
    "soft": ["List of soft skills"],
    "languages": ["Programming languages"],
    "frameworks": ["Frameworks and libraries"],
    "tools": ["Tools and technologies"]
  },
  "experience": [
    {
      "title": "Job title",
      "company": "Company name",
      "location": "Location",
      "startDate": "Start date",
      "endDate": "End date or 'Present'",
      "description": "Job description",
      "achievements": ["Key achievements"],
      "technologies": ["Technologies used"]
    }
  ],
  "education": [
    {
      "degree": "Degree type",
      "field": "Field of study",
      "institution": "Institution name",
      "location": "Location",
      "graduationDate": "Graduation date",
      "gpa": "GPA if mentioned"
    }
  ],
  "certifications": [
    {
      "name": "Certification name",
      "issuer": "Issuing organization",
      "date": "Date obtained",
      "expiryDate": "Expiry date if applicable"
    }
  ],
  "projects": [
    {
      "name": "Project name",
      "description": "Project description",
      "technologies": ["Technologies used"],
      "url": "Project URL if available"
    }
  ]
}

Only return valid JSON. If information is not available, use null or empty arrays as appropriate.
`,

    emailGeneration: `
You are an expert recruiter writing personalized outreach emails. Create a professional, engaging email to a candidate.

Candidate Information:
Name: {candidateName}
Current Role: {currentRole}
Skills: {skills}
Experience Level: {experienceLevel}

Job Information:
Position: {jobTitle}
Company: {companyName}
Key Requirements: {jobRequirements}
Location: {jobLocation}
Salary Range: {salaryRange}

Email Context:
- Tone: {tone} (professional, friendly, casual)
- Purpose: {purpose} (initial outreach, follow-up, interview invitation)
- Personalization Level: {personalizationLevel} (high, medium, low)

Please generate a personalized email that:
1. Has an engaging subject line
2. Addresses the candidate by name
3. Mentions specific skills or experience relevant to the role
4. Clearly describes the opportunity
5. Includes a clear call-to-action
6. Maintains the specified tone
7. Is concise but informative (200-300 words)

Return the response in JSON format:
{
  "subject": "Email subject line",
  "body": "Email body content",
  "callToAction": "Specific call-to-action",
  "personalizationNotes": "Notes about personalization used"
}
`,

    experienceSummarization: `
You are an expert at summarizing professional experience. Create a concise, impactful summary of the candidate's experience.

Candidate Experience Data:
{experienceData}

Please create:
1. A professional summary (2-3 sentences)
2. Key highlights (3-5 bullet points)
3. Skills assessment based on experience
4. Career progression analysis
5. Suitability for different role levels

Return the response in JSON format:
{
  "professionalSummary": "2-3 sentence summary of overall experience",
  "keyHighlights": [
    "Most impressive achievement or experience",
    "Notable skills or expertise",
    "Career progression or growth",
    "Unique value proposition"
  ],
  "skillsAssessment": {
    "primarySkills": ["Top 5 skills based on experience"],
    "emergingSkills": ["Skills being developed"],
    "experienceLevel": "Junior/Mid-level/Senior/Expert",
    "yearsOfExperience": "Estimated years of experience"
  },
  "careerProgression": {
    "trajectory": "Career growth pattern",
    "nextLevelReadiness": "Assessment of readiness for next level",
    "recommendedRoles": ["Suitable role types"]
  },
  "suitabilityAnalysis": {
    "strengths": ["Key strengths"],
    "growthAreas": ["Areas for development"],
    "idealRoleType": "Best fit role characteristics"
  }
}
`,

    jobMatching: `
You are an expert at matching candidates to job requirements. Analyze the compatibility between a candidate and a job.

Candidate Profile:
{candidateProfile}

Job Requirements:
{jobRequirements}

Please analyze and provide:
1. Overall match score (0-100)
2. Detailed skill matching
3. Experience level compatibility
4. Cultural fit assessment
5. Recommendations for both candidate and employer

Return the response in JSON format:
{
  "overallMatchScore": 85,
  "matchAnalysis": {
    "skillsMatch": {
      "score": 90,
      "matchedSkills": ["Skills that match"],
      "missingSkills": ["Required skills candidate lacks"],
      "additionalSkills": ["Extra skills candidate has"]
    },
    "experienceMatch": {
      "score": 80,
      "levelCompatibility": "Assessment of experience level fit",
      "relevantExperience": ["Relevant experience areas"],
      "experienceGaps": ["Experience gaps"]
    },
    "locationMatch": {
      "score": 95,
      "compatibility": "Location compatibility assessment"
    }
  },
  "recommendations": {
    "forCandidate": [
      "Recommendations for the candidate"
    ],
    "forEmployer": [
      "Recommendations for the employer"
    ]
  },
  "interviewFocus": [
    "Key areas to focus on during interview"
  ],
  "riskFactors": [
    "Potential concerns or risks"
  ]
}
`
};

// AI model configurations
export const modelConfigs = {
    resumeExtraction: {
        maxTokens: 2000,
        temperature: 0.1,
        topP: 0.1
    },
    emailGeneration: {
        maxTokens: 800,
        temperature: 0.7,
        topP: 0.9
    },
    experienceSummarization: {
        maxTokens: 1000,
        temperature: 0.3,
        topP: 0.8
    },
    jobMatching: {
        maxTokens: 1500,
        temperature: 0.2,
        topP: 0.7
    }
};

// Utility functions
export function formatPrompt(template: string, variables: Record<string, any>): string {
    let formattedPrompt = template;
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        formattedPrompt = formattedPrompt.replace(new RegExp(placeholder, 'g'), String(value));
    }
    return formattedPrompt;
}

export function parseAIResponse<T>(response: string): T {
    try {
        // Clean up the response to extract JSON
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in AI response');
        }
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export function validateAIResponse(response: any, requiredFields: string[]): boolean {
    for (const field of requiredFields) {
        if (!(field in response)) {
            return false;
        }
    }
    return true;
}