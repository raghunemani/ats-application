// Unit tests for candidate API endpoints

import { HttpRequest, InvocationContext } from '@azure/functions';
import { getCandidates, getCandidateById, createCandidate, updateCandidate, deleteCandidate } from '../candidates';
import * as dbConfig from '../../database/config';

// Mock the database config module
jest.mock('../../database/config', () => ({
  initializeDatabase: jest.fn(),
  executeQuery: jest.fn(),
  executeQuerySingle: jest.fn(),
}));

// Mock crypto.randomUUID for consistent test IDs
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => '12345678-1234-4567-8901-123456789012')
  }
});

// Helper function to create mock HttpRequest
function createMockRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'GET',
    url: 'http://localhost/api/candidates',
    headers: {},
    query: new URLSearchParams(),
    params: {},
    user: null,
    body: null,
    rawBody: new Uint8Array(),
    bufferBody: Buffer.alloc(0),
    formData: async () => new FormData(),
    text: async () => '',
    json: async () => ({}),
    arrayBuffer: async () => new ArrayBuffer(0),
    ...overrides
  } as HttpRequest;
}

describe('Candidate API Functions', () => {
  let mockExecuteQuery: jest.MockedFunction<typeof dbConfig.executeQuery>;
  let mockExecuteQuerySingle: jest.MockedFunction<typeof dbConfig.executeQuerySingle>;
  let mockInitializeDatabase: jest.MockedFunction<typeof dbConfig.initializeDatabase>;
  let mockContext: InvocationContext;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Get references to mocked functions
    mockExecuteQuery = dbConfig.executeQuery as jest.MockedFunction<typeof dbConfig.executeQuery>;
    mockExecuteQuerySingle = dbConfig.executeQuerySingle as jest.MockedFunction<typeof dbConfig.executeQuerySingle>;
    mockInitializeDatabase = dbConfig.initializeDatabase as jest.MockedFunction<typeof dbConfig.initializeDatabase>;
    
    // Mock the InvocationContext
    mockContext = {
      log: jest.fn(),
      error: jest.fn()
    } as any;

    // Default successful database initialization
    mockInitializeDatabase.mockResolvedValue({} as any);
  });

  describe('getCandidates', () => {
    it('should return all candidates with default pagination', async () => {
      // Arrange: Set up mock data
      const mockDbCandidates = [
        {
          Id: '123',
          Name: 'John Doe',
          Email: 'john@example.com',
          Phone: '+1-555-0101',
          VisaStatus: 'H1B',
          Availability: 'TwoWeeks',
          Skills: '["JavaScript", "React"]',
          CreatedAt: new Date('2024-01-01'),
          UpdatedAt: new Date('2024-01-01')
        }
      ];

      mockExecuteQuery.mockResolvedValue(mockDbCandidates);

      // Create mock request
      const mockRequest = createMockRequest({
        query: new URLSearchParams(),
        url: 'http://localhost/api/candidates'
      });

      // Act: Call the function
      const response = await getCandidates(mockRequest, mockContext);

      // Assert: Check the response
      expect(response.status).toBe(200);
      expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
      
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data).toHaveLength(1);
      expect(responseBody.data[0].name).toBe('John Doe');
      expect(responseBody.data[0].skills).toEqual(['JavaScript', 'React']);
      expect(responseBody.pagination.page).toBe(1);
      expect(responseBody.pagination.pageSize).toBe(20);
    });

    it('should handle pagination parameters', async () => {
      // Arrange
      mockExecuteQuery.mockResolvedValue([]);

      const mockRequest = createMockRequest({
        query: new URLSearchParams([
          ['page', '2'],
          ['pageSize', '5']
        ]),
        url: 'http://localhost/api/candidates?page=2&pageSize=5'
      });

      // Act
      const response = await getCandidates(mockRequest, mockContext);

      // Assert
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY'),
        expect.objectContaining({
          offset: 5, // (page 2 - 1) * pageSize 5 = 5
          pageSize: 5
        })
      );

      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.pagination.page).toBe(2);
      expect(responseBody.pagination.pageSize).toBe(5);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      mockExecuteQuery.mockRejectedValue(new Error('Database connection failed'));

      const mockRequest = createMockRequest({
        query: new URLSearchParams(),
        url: 'http://localhost/api/candidates'
      });

      // Act
      const response = await getCandidates(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(500);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('getCandidateById', () => {
    it('should return candidate with full details', async () => {
      // Arrange
      const candidateId = '123e4567-e89b-12d3-a456-426614174000';
      
      const mockCandidate = {
        Id: candidateId,
        Name: 'John Doe',
        Email: 'john@example.com',
        VisaStatus: 'H1B',
        Skills: '["JavaScript", "React"]',
        CreatedAt: new Date(),
        UpdatedAt: new Date()
      };

      const mockExperience = [{
        Id: 'exp1',
        Company: 'Microsoft',
        Title: 'Senior Developer',
        StartDate: new Date('2020-01-01'),
        EndDate: null,
        Technologies: '["React", "TypeScript"]',
        Achievements: '["Led team of 5"]'
      }];

      const mockEducation = [{
        Id: 'edu1',
        Institution: 'University of Washington',
        Degree: 'Bachelor of Science',
        FieldOfStudy: 'Computer Science',
        GPA: 3.8
      }];

      mockExecuteQuerySingle.mockResolvedValue(mockCandidate);
      mockExecuteQuery
        .mockResolvedValueOnce(mockExperience) // First call for experience
        .mockResolvedValueOnce(mockEducation); // Second call for education

      const mockRequest = createMockRequest({
        params: { id: candidateId },
        url: `http://localhost/api/candidates/${candidateId}`
      });

      // Act
      const response = await getCandidateById(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(200);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.id).toBe(candidateId);
      expect(responseBody.data.experience).toHaveLength(1);
      expect(responseBody.data.experience[0].company).toBe('Microsoft');
      expect(responseBody.data.education).toHaveLength(1);
      expect(responseBody.data.education[0].institution).toBe('University of Washington');
    });

    it('should return 404 when candidate not found', async () => {
      // Arrange
      const candidateId = 'nonexistent-id';
      mockExecuteQuerySingle.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { id: candidateId },
        url: `http://localhost/api/candidates/${candidateId}`
      });

      // Act
      const response = await getCandidateById(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(404);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe('CANDIDATE_NOT_FOUND');
    });

    it('should return 400 when ID is missing', async () => {
      // Arrange
      const mockRequest = createMockRequest({
        params: {},
        url: 'http://localhost/api/candidates/'
      });

      // Act
      const response = await getCandidateById(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(400);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.error.code).toBe('MISSING_ID');
    });
  });

  describe('createCandidate', () => {
    it('should create a new candidate successfully', async () => {
      // Arrange
      const candidateData = {
        name: 'Jane Smith',
        email: 'jane@example.com',
        visaStatus: 'H1B',
        availability: 'Immediate',
        skills: ['Python', 'Django']
      };

      const createdCandidate = {
        Id: '12345678-1234-4567-8901-123456789012',
        Name: 'Jane Smith',
        Email: 'jane@example.com',
        VisaStatus: 'H1B',
        Availability: 'Immediate',
        Skills: '["Python", "Django"]',
        CreatedAt: new Date(),
        UpdatedAt: new Date()
      };

      // Mock: No existing candidate with same email
      mockExecuteQuerySingle
        .mockResolvedValueOnce(null) // Email check
        .mockResolvedValueOnce(createdCandidate); // Return created candidate

      mockExecuteQuery.mockResolvedValue([]); // Insert operations

      const mockRequest = createMockRequest({
        method: 'POST',
        text: jest.fn().mockResolvedValue(JSON.stringify(candidateData)),
        url: 'http://localhost/api/candidates'
      });

      // Act
      const response = await createCandidate(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(201);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.name).toBe('Jane Smith');
      expect(responseBody.data.skills).toEqual(['Python', 'Django']);
      expect(responseBody.message).toBe('Candidate created successfully');
    });

    it('should return 400 for missing required fields', async () => {
      // Arrange
      const incompleteData = {
        name: 'Jane Smith'
        // Missing email, visaStatus, availability
      };

      const mockRequest = createMockRequest({
        method: 'POST',
        text: jest.fn().mockResolvedValue(JSON.stringify(incompleteData)),
        url: 'http://localhost/api/candidates'
      });

      // Act
      const response = await createCandidate(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(400);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.error.code).toBe('MISSING_REQUIRED_FIELDS');
      expect(responseBody.error.message).toContain('email');
      expect(responseBody.error.message).toContain('visaStatus');
      expect(responseBody.error.message).toContain('availability');
    });
  });
});