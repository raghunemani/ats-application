// Unit tests for resume upload functionality

import { HttpRequest, InvocationContext } from '@azure/functions';
import { uploadResume, getResumeUrl } from '../resumeUpload';
import * as dbConfig from '../../database/config';

// Mock the database config module
jest.mock('../../database/config', () => ({
  initializeDatabase: jest.fn(),
  executeQuery: jest.fn(),
  executeQuerySingle: jest.fn(),
}));

// Mock Azure Blob Storage
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn()
  }
}));

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

describe('Resume Upload Functions', () => {
  let mockExecuteQuery: jest.MockedFunction<typeof dbConfig.executeQuery>;
  let mockExecuteQuerySingle: jest.MockedFunction<typeof dbConfig.executeQuerySingle>;
  let mockInitializeDatabase: jest.MockedFunction<typeof dbConfig.initializeDatabase>;
  let mockContext: InvocationContext;
  let mockUploadData: jest.Mock;
  let mockGetBlockBlobClient: jest.Mock;
  let mockCreateIfNotExists: jest.Mock;
  let mockGetContainerClient: jest.Mock;
  let mockFromConnectionString: jest.Mock;

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

    // Set up Azure Storage mocks
    mockUploadData = jest.fn().mockResolvedValue({ requestId: 'test-request-id' });
    mockGetBlockBlobClient = jest.fn();
    mockCreateIfNotExists = jest.fn().mockResolvedValue({});
    mockGetContainerClient = jest.fn();
    mockFromConnectionString = jest.fn();

    const mockBlobClient = {
      url: 'https://storage.blob.core.windows.net/resumes/test-file.pdf',
      uploadData: mockUploadData
    };

    const mockContainerClient = {
      createIfNotExists: mockCreateIfNotExists,
      getBlockBlobClient: mockGetBlockBlobClient.mockReturnValue(mockBlobClient)
    };

    const mockBlobServiceClient = {
      getContainerClient: mockGetContainerClient.mockReturnValue(mockContainerClient)
    };

    // Import and mock the BlobServiceClient
    const { BlobServiceClient } = require('@azure/storage-blob');
    BlobServiceClient.fromConnectionString = mockFromConnectionString.mockReturnValue(mockBlobServiceClient);

    // Mock environment variable
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test;EndpointSuffix=core.windows.net';
  });

  afterEach(() => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
  });

  describe('uploadResume', () => {
    it('should upload resume successfully', async () => {
      // Arrange
      const candidateId = '123e4567-e89b-12d3-a456-426614174000';
      const existingCandidate = {
        Id: candidateId,
        Name: 'John Doe',
        Email: 'john@example.com'
      };

      mockExecuteQuerySingle.mockResolvedValue(existingCandidate);
      mockExecuteQuery.mockResolvedValue([]); // Update operation

      // Create mock file
      const mockFile = {
        name: 'resume.pdf',
        type: 'application/pdf',
        size: 1024 * 1024, // 1MB
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
      } as any as File;

      // Create mock FormData with proper get method
      const mockFormData = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'resume') return mockFile;
          return null;
        })
      };

      const mockRequest = createMockRequest({
        method: 'POST',
        params: { id: candidateId },
        formData: jest.fn().mockResolvedValue(mockFormData),
        url: `http://localhost/api/candidates/${candidateId}/resume`
      });

      // Act
      const response = await uploadResume(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(200);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.candidateId).toBe(candidateId);
      expect(responseBody.data.fileName).toBe('resume.pdf');
      expect(responseBody.data.fileType).toBe('application/pdf');
      expect(responseBody.message).toBe('Resume uploaded successfully');

      // Verify blob storage operations
      expect(mockFromConnectionString).toHaveBeenCalled();
      expect(mockGetContainerClient).toHaveBeenCalledWith('resumes');
      expect(mockCreateIfNotExists).toHaveBeenCalled();
      expect(mockUploadData).toHaveBeenCalled();

      // Verify database update was called
      expect(mockExecuteQuery).toHaveBeenCalled();
      
      // Verify the parameters contain the right data
      const updateCall = mockExecuteQuery.mock.calls[0];
      expect(updateCall[0]).toContain('UPDATE Candidates');
      expect(updateCall[0]).toContain('ResumeUrl');
      expect(updateCall[1]).toMatchObject({
        candidateId: candidateId,
        resumeUrl: 'https://storage.blob.core.windows.net/resumes/test-file.pdf'
      });
    });

    it('should return 400 when candidate ID is missing', async () => {
      // Arrange
      const mockRequest = createMockRequest({
        method: 'POST',
        params: {},
        url: 'http://localhost/api/candidates//resume'
      });

      // Act
      const response = await uploadResume(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(400);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.error.code).toBe('MISSING_ID');
    });

    it('should return 404 when candidate not found', async () => {
      // Arrange
      const candidateId = 'nonexistent-id';
      mockExecuteQuerySingle.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        method: 'POST',
        params: { id: candidateId },
        formData: jest.fn().mockResolvedValue({
          get: jest.fn().mockReturnValue(null)
        }),
        url: `http://localhost/api/candidates/${candidateId}/resume`
      });

      // Act
      const response = await uploadResume(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(404);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.error.code).toBe('CANDIDATE_NOT_FOUND');
    });
  });

  describe('getResumeUrl', () => {
    it('should return resume URL successfully', async () => {
      // Arrange
      const candidateId = '123e4567-e89b-12d3-a456-426614174000';
      const candidateWithResume = {
        Id: candidateId,
        Name: 'John Doe',
        Email: 'john@example.com',
        ResumeUrl: 'https://storage.blob.core.windows.net/resumes/resume.pdf'
      };

      mockExecuteQuerySingle.mockResolvedValue(candidateWithResume);

      const mockRequest = createMockRequest({
        params: { id: candidateId },
        url: `http://localhost/api/candidates/${candidateId}/resume`
      });

      // Act
      const response = await getResumeUrl(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(200);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.candidateId).toBe(candidateId);
      expect(responseBody.data.resumeUrl).toBe('https://storage.blob.core.windows.net/resumes/resume.pdf');
    });

    it('should return 404 when candidate not found', async () => {
      // Arrange
      const candidateId = 'nonexistent-id';
      mockExecuteQuerySingle.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { id: candidateId },
        url: `http://localhost/api/candidates/${candidateId}/resume`
      });

      // Act
      const response = await getResumeUrl(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(404);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.error.code).toBe('CANDIDATE_NOT_FOUND');
    });

    it('should return 404 when no resume found', async () => {
      // Arrange
      const candidateId = '123e4567-e89b-12d3-a456-426614174000';
      const candidateWithoutResume = {
        Id: candidateId,
        Name: 'John Doe',
        Email: 'john@example.com',
        ResumeUrl: null
      };

      mockExecuteQuerySingle.mockResolvedValue(candidateWithoutResume);

      const mockRequest = createMockRequest({
        params: { id: candidateId },
        url: `http://localhost/api/candidates/${candidateId}/resume`
      });

      // Act
      const response = await getResumeUrl(mockRequest, mockContext);

      // Assert
      expect(response.status).toBe(404);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.error.code).toBe('NO_RESUME_FOUND');
    });
  });
});