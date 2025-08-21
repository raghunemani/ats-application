// Azure Function for candidate management API endpoints
// This file handles all candidate-related HTTP requests

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { executeQuery, executeQuerySingle, initializeDatabase } from '../database/config';
import { Candidate } from '../shared/types';

/**
 * GET /api/candidates
 * Retrieves all candidates with optional pagination and filtering
 */
export async function getCandidates(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting all candidates');

    try {
        // Initialize database connection
        await initializeDatabase();

        // Get query parameters from the URL
        const page = parseInt(request.query.get('page') || '1');
        const pageSize = parseInt(request.query.get('pageSize') || '20');
        const visaStatus = request.query.get('visaStatus');

        // Build the SQL query
        let query = 'SELECT * FROM Candidates';
        let parameters: Record<string, any> = {};

        // Add filtering if visaStatus is provided
        if (visaStatus) {
            query += ' WHERE VisaStatus = @visaStatus';
            parameters.visaStatus = visaStatus;
        }

        // Add pagination
        const offset = (page - 1) * pageSize;
        query += ' ORDER BY CreatedAt DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY';
        parameters.offset = offset;
        parameters.pageSize = pageSize;

        // Execute the query
        const candidates = await executeQuery<any>(query, parameters);

        // Convert database format to TypeScript format
        const formattedCandidates: Candidate[] = candidates.map(dbCandidate => ({
            id: dbCandidate.Id,
            name: dbCandidate.Name,
            email: dbCandidate.Email,
            phone: dbCandidate.Phone,
            resumeUrl: dbCandidate.ResumeUrl,
            experienceSummary: dbCandidate.ExperienceSummary,
            visaStatus: dbCandidate.VisaStatus,
            availability: dbCandidate.Availability,
            skills: dbCandidate.Skills ? JSON.parse(dbCandidate.Skills) : [],
            experience: [], // We'll load this separately if needed
            education: [], // We'll load this separately if needed
            location: dbCandidate.Location,
            salaryExpectation: dbCandidate.SalaryExpectation,
            linkedInUrl: dbCandidate.LinkedInUrl,
            githubUrl: dbCandidate.GithubUrl,
            portfolioUrl: dbCandidate.PortfolioUrl,
            notes: dbCandidate.Notes,
            createdAt: dbCandidate.CreatedAt,
            updatedAt: dbCandidate.UpdatedAt
        }));

        // Return successful response
        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                data: formattedCandidates,
                pagination: {
                    page: page,
                    pageSize: pageSize,
                    hasMore: formattedCandidates.length === pageSize
                },
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        context.log('Error getting candidates:', error);
        
        return {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Failed to retrieve candidates',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            })
        };
    }
}

/**
 * GET /api/candidates/{id}
 * Retrieves a single candidate with full details including experience and education
 */
export async function getCandidateById(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting candidate by ID');

    try {
        // Get the candidate ID from the URL path
        const candidateId = request.params.id;
        
        if (!candidateId) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'MISSING_ID',
                        message: 'Candidate ID is required'
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Initialize database connection
        await initializeDatabase();

        // Step 1: Get the main candidate record
        const candidateQuery = 'SELECT * FROM Candidates WHERE Id = @candidateId';
        const candidateResult = await executeQuerySingle<any>(candidateQuery, { candidateId });

        if (!candidateResult) {
            return {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'CANDIDATE_NOT_FOUND',
                        message: `Candidate with ID ${candidateId} not found`
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 2: Get candidate's experience records
        const experienceQuery = `
            SELECT * FROM CandidateExperience 
            WHERE CandidateId = @candidateId 
            ORDER BY StartDate DESC
        `;
        const experienceResults = await executeQuery<any>(experienceQuery, { candidateId });

        // Step 3: Get candidate's education records
        const educationQuery = `
            SELECT * FROM CandidateEducation 
            WHERE CandidateId = @candidateId 
            ORDER BY EndDate DESC
        `;
        const educationResults = await executeQuery<any>(educationQuery, { candidateId });

        // Step 4: Transform and combine all the data
        const fullCandidate: Candidate = {
            // Basic candidate info
            id: candidateResult.Id,
            name: candidateResult.Name,
            email: candidateResult.Email,
            phone: candidateResult.Phone,
            resumeUrl: candidateResult.ResumeUrl,
            experienceSummary: candidateResult.ExperienceSummary,
            visaStatus: candidateResult.VisaStatus,
            availability: candidateResult.Availability,
            skills: candidateResult.Skills ? JSON.parse(candidateResult.Skills) : [],
            location: candidateResult.Location,
            salaryExpectation: candidateResult.SalaryExpectation,
            linkedInUrl: candidateResult.LinkedInUrl,
            githubUrl: candidateResult.GithubUrl,
            portfolioUrl: candidateResult.PortfolioUrl,
            notes: candidateResult.Notes,
            createdAt: candidateResult.CreatedAt,
            updatedAt: candidateResult.UpdatedAt,

            // Transform experience records
            experience: experienceResults.map(exp => ({
                id: exp.Id,
                company: exp.Company,
                title: exp.Title,
                startDate: exp.StartDate,
                endDate: exp.EndDate,
                duration: exp.Duration,
                description: exp.Description,
                technologies: exp.Technologies ? JSON.parse(exp.Technologies) : [],
                achievements: exp.Achievements ? JSON.parse(exp.Achievements) : []
            })),

            // Transform education records
            education: educationResults.map(edu => ({
                id: edu.Id,
                institution: edu.Institution,
                degree: edu.Degree,
                fieldOfStudy: edu.FieldOfStudy,
                startDate: edu.StartDate,
                endDate: edu.EndDate,
                gpa: edu.GPA,
                achievements: edu.Achievements ? JSON.parse(edu.Achievements) : []
            }))
        };

        // Return the complete candidate profile
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                data: fullCandidate,
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        context.log('Error getting candidate by ID:', error);
        
        return {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Failed to retrieve candidate',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            })
        };
    }
}

// Register the functions with Azure Functions runtime
app.http('getCandidates', {
    methods: ['GET'],
    route: 'candidates',
    authLevel: 'anonymous',
    handler: getCandidates
});

/**
 * POST /api/candidates
 * Creates a new candidate with experience and education records
 */
export async function createCandidate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Creating new candidate');

    try {
        // Step 1: Get and validate the request body
        const requestBody = await request.text();
        if (!requestBody) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'MISSING_BODY',
                        message: 'Request body is required'
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 2: Parse the JSON data
        let candidateData: any;
        try {
            candidateData = JSON.parse(requestBody);
        } catch (parseError) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'INVALID_JSON',
                        message: 'Request body must be valid JSON'
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 3: Validate required fields
        const requiredFields = ['name', 'email', 'visaStatus', 'availability'];
        const missingFields = requiredFields.filter(field => !candidateData[field]);
        
        if (missingFields.length > 0) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'MISSING_REQUIRED_FIELDS',
                        message: `Missing required fields: ${missingFields.join(', ')}`
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 4: Validate enum values
        const validVisaStatuses = ['Citizen', 'GreenCard', 'H1B', 'F1OPT', 'RequiresSponsorship'];
        const validAvailabilities = ['Immediate', 'TwoWeeks', 'OneMonth', 'NotAvailable'];

        if (!validVisaStatuses.includes(candidateData.visaStatus)) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'INVALID_VISA_STATUS',
                        message: `Invalid visa status. Must be one of: ${validVisaStatuses.join(', ')}`
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        if (!validAvailabilities.includes(candidateData.availability)) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'INVALID_AVAILABILITY',
                        message: `Invalid availability. Must be one of: ${validAvailabilities.join(', ')}`
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 5: Initialize database connection
        await initializeDatabase();

        // Step 6: Check if email already exists
        const existingCandidate = await executeQuerySingle<any>(
            'SELECT Id FROM Candidates WHERE Email = @email',
            { email: candidateData.email }
        );

        if (existingCandidate) {
            return {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'EMAIL_ALREADY_EXISTS',
                        message: `A candidate with email ${candidateData.email} already exists`
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 7: Generate IDs and prepare data
        const candidateId = crypto.randomUUID();
        const now = new Date();

        // Step 8: Prepare candidate insert query
        const candidateInsertQuery = `
            INSERT INTO Candidates (
                Id, Name, Email, Phone, ResumeUrl, ExperienceSummary, 
                VisaStatus, Availability, Skills, Location, SalaryExpectation,
                LinkedInUrl, GithubUrl, PortfolioUrl, Notes, CreatedAt, UpdatedAt
            ) VALUES (
                @id, @name, @email, @phone, @resumeUrl, @experienceSummary,
                @visaStatus, @availability, @skills, @location, @salaryExpectation,
                @linkedInUrl, @githubUrl, @portfolioUrl, @notes, @createdAt, @updatedAt
            )
        `;

        const candidateParams = {
            id: candidateId,
            name: candidateData.name,
            email: candidateData.email,
            phone: candidateData.phone || null,
            resumeUrl: candidateData.resumeUrl || null,
            experienceSummary: candidateData.experienceSummary || null,
            visaStatus: candidateData.visaStatus,
            availability: candidateData.availability,
            skills: candidateData.skills ? JSON.stringify(candidateData.skills) : null,
            location: candidateData.location || null,
            salaryExpectation: candidateData.salaryExpectation || null,
            linkedInUrl: candidateData.linkedInUrl || null,
            githubUrl: candidateData.githubUrl || null,
            portfolioUrl: candidateData.portfolioUrl || null,
            notes: candidateData.notes || null,
            createdAt: now,
            updatedAt: now
        };

        // Step 9: Insert the main candidate record
        await executeQuery(candidateInsertQuery, candidateParams);

        // Step 10: Insert experience records if provided
        if (candidateData.experience && Array.isArray(candidateData.experience)) {
            for (const exp of candidateData.experience) {
                const experienceId = crypto.randomUUID();
                const experienceInsertQuery = `
                    INSERT INTO CandidateExperience (
                        Id, CandidateId, Company, Title, StartDate, EndDate, 
                        Duration, Description, Technologies, Achievements, CreatedAt, UpdatedAt
                    ) VALUES (
                        @id, @candidateId, @company, @title, @startDate, @endDate,
                        @duration, @description, @technologies, @achievements, @createdAt, @updatedAt
                    )
                `;

                const experienceParams = {
                    id: experienceId,
                    candidateId: candidateId,
                    company: exp.company,
                    title: exp.title,
                    startDate: exp.startDate,
                    endDate: exp.endDate || null,
                    duration: exp.duration || null,
                    description: exp.description || null,
                    technologies: exp.technologies ? JSON.stringify(exp.technologies) : null,
                    achievements: exp.achievements ? JSON.stringify(exp.achievements) : null,
                    createdAt: now,
                    updatedAt: now
                };

                await executeQuery(experienceInsertQuery, experienceParams);
            }
        }

        // Step 11: Insert education records if provided
        if (candidateData.education && Array.isArray(candidateData.education)) {
            for (const edu of candidateData.education) {
                const educationId = crypto.randomUUID();
                const educationInsertQuery = `
                    INSERT INTO CandidateEducation (
                        Id, CandidateId, Institution, Degree, FieldOfStudy, 
                        StartDate, EndDate, GPA, Achievements, CreatedAt, UpdatedAt
                    ) VALUES (
                        @id, @candidateId, @institution, @degree, @fieldOfStudy,
                        @startDate, @endDate, @gpa, @achievements, @createdAt, @updatedAt
                    )
                `;

                const educationParams = {
                    id: educationId,
                    candidateId: candidateId,
                    institution: edu.institution,
                    degree: edu.degree,
                    fieldOfStudy: edu.fieldOfStudy,
                    startDate: edu.startDate,
                    endDate: edu.endDate || null,
                    gpa: edu.gpa || null,
                    achievements: edu.achievements ? JSON.stringify(edu.achievements) : null,
                    createdAt: now,
                    updatedAt: now
                };

                await executeQuery(educationInsertQuery, educationParams);
            }
        }

        // Step 12: Return the created candidate with full details
        // We'll reuse our getCandidateById logic to return the complete record
        const createdCandidate = await executeQuerySingle<any>(
            'SELECT * FROM Candidates WHERE Id = @candidateId',
            { candidateId }
        );

        return {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                data: {
                    id: createdCandidate.Id,
                    name: createdCandidate.Name,
                    email: createdCandidate.Email,
                    phone: createdCandidate.Phone,
                    resumeUrl: createdCandidate.ResumeUrl,
                    experienceSummary: createdCandidate.ExperienceSummary,
                    visaStatus: createdCandidate.VisaStatus,
                    availability: createdCandidate.Availability,
                    skills: createdCandidate.Skills ? JSON.parse(createdCandidate.Skills) : [],
                    location: createdCandidate.Location,
                    salaryExpectation: createdCandidate.SalaryExpectation,
                    linkedInUrl: createdCandidate.LinkedInUrl,
                    githubUrl: createdCandidate.GithubUrl,
                    portfolioUrl: createdCandidate.PortfolioUrl,
                    notes: createdCandidate.Notes,
                    createdAt: createdCandidate.CreatedAt,
                    updatedAt: createdCandidate.UpdatedAt
                },
                message: 'Candidate created successfully',
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        context.log('Error creating candidate:', error);
        
        return {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Failed to create candidate',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            })
        };
    }
}

app.http('getCandidateById', {
    methods: ['GET'],
    route: 'candidates/{id}',
    authLevel: 'anonymous',
    handler: getCandidateById
});

/**
 * PUT /api/candidates/{id}
 * Updates an existing candidate
 */
export async function updateCandidate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Updating candidate');

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

        // Step 2: Get and parse request body
        const requestBody = await request.text();
        if (!requestBody) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: { code: 'MISSING_BODY', message: 'Request body is required' },
                    timestamp: new Date().toISOString()
                })
            };
        }

        let updateData: any;
        try {
            updateData = JSON.parse(requestBody);
        } catch (parseError) {
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 3: Initialize database and check if candidate exists
        await initializeDatabase();
        
        const existingCandidate = await executeQuerySingle<any>(
            'SELECT * FROM Candidates WHERE Id = @candidateId',
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

        // Step 4: Validate enum values if provided
        if (updateData.visaStatus) {
            const validVisaStatuses = ['Citizen', 'GreenCard', 'H1B', 'F1OPT', 'RequiresSponsorship'];
            if (!validVisaStatuses.includes(updateData.visaStatus)) {
                return {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: { code: 'INVALID_VISA_STATUS', message: `Invalid visa status. Must be one of: ${validVisaStatuses.join(', ')}` },
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        if (updateData.availability) {
            const validAvailabilities = ['Immediate', 'TwoWeeks', 'OneMonth', 'NotAvailable'];
            if (!validAvailabilities.includes(updateData.availability)) {
                return {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: { code: 'INVALID_AVAILABILITY', message: `Invalid availability. Must be one of: ${validAvailabilities.join(', ')}` },
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Step 5: Check for email conflicts (if email is being updated)
        if (updateData.email && updateData.email !== existingCandidate.Email) {
            const emailConflict = await executeQuerySingle<any>(
                'SELECT Id FROM Candidates WHERE Email = @email AND Id != @candidateId',
                { email: updateData.email, candidateId }
            );

            if (emailConflict) {
                return {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: { code: 'EMAIL_ALREADY_EXISTS', message: `A candidate with email ${updateData.email} already exists` },
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Step 6: Build dynamic UPDATE query
        const updateFields: string[] = [];
        const updateParams: Record<string, any> = { candidateId, updatedAt: new Date() };

        // Only update fields that are provided in the request
        const updatableFields = [
            'name', 'email', 'phone', 'resumeUrl', 'experienceSummary',
            'visaStatus', 'availability', 'location', 'salaryExpectation',
            'linkedInUrl', 'githubUrl', 'portfolioUrl', 'notes'
        ];

        updatableFields.forEach(field => {
            if (updateData[field] !== undefined) {
                // Convert camelCase to PascalCase for database
                const dbField = field.charAt(0).toUpperCase() + field.slice(1);
                updateFields.push(`${dbField} = @${field}`);
                updateParams[field] = updateData[field];
            }
        });

        // Handle skills array separately (needs JSON conversion)
        if (updateData.skills !== undefined) {
            updateFields.push('Skills = @skills');
            updateParams.skills = Array.isArray(updateData.skills) ? JSON.stringify(updateData.skills) : null;
        }

        // Always update the UpdatedAt timestamp
        updateFields.push('UpdatedAt = @updatedAt');

        if (updateFields.length === 1) { // Only UpdatedAt field
            return {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: { code: 'NO_FIELDS_TO_UPDATE', message: 'No valid fields provided for update' },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 7: Execute the update
        const updateQuery = `
            UPDATE Candidates 
            SET ${updateFields.join(', ')}
            WHERE Id = @candidateId
        `;

        await executeQuery(updateQuery, updateParams);

        // Step 8: Return the updated candidate
        const updatedCandidate = await executeQuerySingle<any>(
            'SELECT * FROM Candidates WHERE Id = @candidateId',
            { candidateId }
        );

        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                data: {
                    id: updatedCandidate.Id,
                    name: updatedCandidate.Name,
                    email: updatedCandidate.Email,
                    phone: updatedCandidate.Phone,
                    resumeUrl: updatedCandidate.ResumeUrl,
                    experienceSummary: updatedCandidate.ExperienceSummary,
                    visaStatus: updatedCandidate.VisaStatus,
                    availability: updatedCandidate.Availability,
                    skills: updatedCandidate.Skills ? JSON.parse(updatedCandidate.Skills) : [],
                    location: updatedCandidate.Location,
                    salaryExpectation: updatedCandidate.SalaryExpectation,
                    linkedInUrl: updatedCandidate.LinkedInUrl,
                    githubUrl: updatedCandidate.GithubUrl,
                    portfolioUrl: updatedCandidate.PortfolioUrl,
                    notes: updatedCandidate.Notes,
                    createdAt: updatedCandidate.CreatedAt,
                    updatedAt: updatedCandidate.UpdatedAt
                },
                message: 'Candidate updated successfully',
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        context.log('Error updating candidate:', error);
        
        return {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Failed to update candidate',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            })
        };
    }
}

/**
 * DELETE /api/candidates/{id}
 * Deletes a candidate and all related records
 */
export async function deleteCandidate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Deleting candidate');

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

        // Step 3: Delete the candidate (CASCADE will handle related records)
        const deleteQuery = 'DELETE FROM Candidates WHERE Id = @candidateId';
        await executeQuery(deleteQuery, { candidateId });

        // Step 4: Return success response
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                data: {
                    id: existingCandidate.Id,
                    name: existingCandidate.Name,
                    email: existingCandidate.Email
                },
                message: 'Candidate deleted successfully',
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        context.log('Error deleting candidate:', error);
        
        return {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Failed to delete candidate',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            })
        };
    }
}

// Register all the functions with Azure Functions runtime
app.http('getCandidates', {
    methods: ['GET'],
    route: 'candidates',
    authLevel: 'anonymous',
    handler: getCandidates
});

app.http('getCandidateById', {
    methods: ['GET'],
    route: 'candidates/{id}',
    authLevel: 'anonymous',
    handler: getCandidateById
});

app.http('createCandidate', {
    methods: ['POST'],
    route: 'candidates',
    authLevel: 'anonymous',
    handler: createCandidate
});

app.http('updateCandidate', {
    methods: ['PUT'],
    route: 'candidates/{id}',
    authLevel: 'anonymous',
    handler: updateCandidate
});

app.http('deleteCandidate', {
    methods: ['DELETE'],
    route: 'candidates/{id}',
    authLevel: 'anonymous',
    handler: deleteCandidate
});