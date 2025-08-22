// Unit tests for resume upload functionality using Blob Storage

import { HttpRequest, InvocationContext } from '@azure/functions';
import { uploadResume, getResumeUrl } from '../resumeUpload';

// Mock Azure Blob Storage
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(() => ({
      getContainerClient: jest.fn(() => ({
        createIfNotExists: jest.fn(),
        getBlobClient: jest.fn(() => ({
          download: jest.fn(),
        })),
        getBlockBlobClient: jest.fn(() => ({
          uploadData: jest.fn(),
          upload: jest.fn(),
          url: 'https://test.blob.core.windows.net/candidates/test-resume.pdf'
        }))
      }))
    }))
  }
}));

// Mock Azure AI Search
jest.mock('@azure/search-documents', () => ({
  SearchClient: jest.fn(() => ({
    mergeOrUploadDocuments: jest.fn()
  })),
  AzureKeyCredential: jest.fn()
}));

// Mock environment variables
process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test;EndpointSuffix=core.windows.net';
process.env.AZURE_SEARCH_ENDPOINT = 'https://test.search.windows.net';
process.env.AZURE_SEARCH_API_KEY = 'test-api-key';
process.env.AZURE_SEARCH_INDEX_NAME = 'candidates-index';

describe('Resume Upload Functions', () => {
  let mockContext: InvocationContext;

  beforeEach(() => {
    mockContext = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      invocationId: 'test-invocation-id',
      functionName: 'test-function',
      extraInputs: new Map(),
      extraOutputs: new Map(),
      retryContext: {
        retryCount: 0,
        maxRetryCount: 0
      },
      traceContext: {
        traceparent: 'test-trace-parent',
        tracestate: 'test-trace-state',
        attributes: {}
      },
      triggerMetadata: {},
      options: {
        trigger: {} as any,
        extraInputs: new Map(),
        extraOutputs: new Map()
      }
    } as unknown as InvocationContext;

    jest.clearAllMocks();
  });

  describe('uploadResume', () => {
    it('should upload resume successfully', async () => {
      const candidateData = {
        id: '12345678-1234-4567-8901-123456789012',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '123-456-7890',
        visaStatus: 'Citizen',
        availability: 'Immediate',
        skills: ['JavaScript', 'React'],
        location: 'New York',
        experienceSummary: 'Senior developer',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      // Mock blob storage response for candidate metadata
      const { BlobServiceClient } = require('@azure/storage-blob');
      const mockBlobClient = {
        download: jest.fn().mockResolvedValue({
          readableStreamBody: {
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback(Buffer.from(JSON.stringify(candidateData)));
              } else if (event === 'end') {
                callback();
              }
            })
          }
        })
      };

      const mockResumeBlobClient = {
        uploadData: jest.fn(),
        url: 'https://test.blob.core.windows.net/candidates/resume.pdf'
      };

      const mockMetadataBlobClient = {
        upload: jest.fn()
      };

      const mockContainerClient = {
        getBlobClient: jest.fn(() => mockBlobClient),
        getBlockBlobClient: jest.fn((blobName) => {
          if (blobName.includes('metadata.json')) {
            return mockMetadataBlobClient;
          }
          return mockResumeBlobClient;
        })
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn(() => mockContainerClient)
      };

      BlobServiceClient.fromConnectionString.mockReturnValue(mockBlobServiceClient);

      // Mock file data
      const mockFile = {
        name: 'resume.pdf',
        type: 'application/pdf',
        size: 1024 * 1024, // 1MB
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
      };

      const mockFormData = new Map();
      mockFormData.set('resume', mockFile);

      const mockRequest = {
        params: { id: '12345678-1234-4567-8901-123456789012' },
        formData: jest.fn().mockResolvedValue(mockFormData)
      } as unknown as HttpRequest;

      const response = await uploadResume(mockRequest, mockContext);

      expect(response.status).toBe(200);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.fileName).toBe('resume.pdf');
      expect(responseBody.data.candidateId).toBe('12345678-1234-4567-8901-123456789012');
    });

    it('should reject invalid file types', async () => {
      const candidateData = {
        id: '12345678-1234-4567-8901-123456789012',
        name: 'John Doe',
        email: 'john@example.com'
      };

      // Mock blob storage response
      const { BlobServiceClient } = require('@azure/storage-blob');
      const mockBlobClient = {
        download: jest.fn().mockResolvedValue({
          readableStreamBody: {
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback(Buffer.from(JSON.stringify(candidateData)));
              } else if (event === 'end') {
                callback();
              }
            })
          }
        })
      };

      const mockContainerClient = {
        getBlobClient: jest.fn(() => mockBlobClient)
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn(() => mockContainerClient)
      };

      BlobServiceClient.fromConnectionString.mockReturnValue(mockBlobServiceClient);

      // Mock invalid file type
      const mockFile = {
        name: 'resume.txt',
        type: 'text/plain',
        size: 1024,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
      };

      const mockFormData = new Map();
      mockFormData.set('resume', mockFile);

      const mockRequest = {
        params: { id: '12345678-1234-4567-8901-123456789012' },
        formData: jest.fn().mockResolvedValue(mockFormData)
      } as unknown as HttpRequest;

      const response = await uploadResume(mockRequest, mockContext);

      expect(response.status).toBe(400);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe('INVALID_FILE_TYPE');
    });

    it('should reject files that are too large', async () => {
      const candidateData = {
        id: '12345678-1234-4567-8901-123456789012',
        name: 'John Doe',
        email: 'john@example.com'
      };

      // Mock blob storage response
      const { BlobServiceClient } = require('@azure/storage-blob');
      const mockBlobClient = {
        download: jest.fn().mockResolvedValue({
          readableStreamBody: {
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback(Buffer.from(JSON.stringify(candidateData)));
              } else if (event === 'end') {
                callback();
              }
            })
          }
        })
      };

      const mockContainerClient = {
        getBlobClient: jest.fn(() => mockBlobClient)
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn(() => mockContainerClient)
      };

      BlobServiceClient.fromConnectionString.mockReturnValue(mockBlobServiceClient);

      // Mock file that's too large (15MB)
      const mockFile = {
        name: 'resume.pdf',
        type: 'application/pdf',
        size: 15 * 1024 * 1024, // 15MB
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
      };

      const mockFormData = new Map();
      mockFormData.set('resume', mockFile);

      const mockRequest = {
        params: { id: '12345678-1234-4567-8901-123456789012' },
        formData: jest.fn().mockResolvedValue(mockFormData)
      } as unknown as HttpRequest;

      const response = await uploadResume(mockRequest, mockContext);

      expect(response.status).toBe(400);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe('FILE_TOO_LARGE');
    });

    it('should return 404 for non-existent candidate', async () => {
      // Mock blob storage to throw 404 error
      const { BlobServiceClient } = require('@azure/storage-blob');
      const mockBlobClient = {
        download: jest.fn().mockRejectedValue({ statusCode: 404 })
      };

      const mockContainerClient = {
        getBlobClient: jest.fn(() => mockBlobClient)
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn(() => mockContainerClient)
      };

      BlobServiceClient.fromConnectionString.mockReturnValue(mockBlobServiceClient);

      const mockFile = {
        name: 'resume.pdf',
        type: 'application/pdf',
        size: 1024,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
      };

      const mockFormData = new Map();
      mockFormData.set('resume', mockFile);

      const mockRequest = {
        params: { id: 'non-existent-id' },
        formData: jest.fn().mockResolvedValue(mockFormData)
      } as unknown as HttpRequest;

      const response = await uploadResume(mockRequest, mockContext);

      expect(response.status).toBe(404);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe('CANDIDATE_NOT_FOUND');
    });
  });

  describe('getResumeUrl', () => {
    it('should return resume URL for existing candidate', async () => {
      const candidateData = {
        id: '12345678-1234-4567-8901-123456789012',
        name: 'John Doe',
        email: 'john@example.com',
        resumeUrl: 'https://test.blob.core.windows.net/candidates/resume.pdf',
        resumeFileName: 'resume.pdf'
      };

      // Mock blob storage response
      const { BlobServiceClient } = require('@azure/storage-blob');
      const mockBlobClient = {
        download: jest.fn().mockResolvedValue({
          readableStreamBody: {
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback(Buffer.from(JSON.stringify(candidateData)));
              } else if (event === 'end') {
                callback();
              }
            })
          }
        })
      };

      const mockContainerClient = {
        getBlobClient: jest.fn(() => mockBlobClient)
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn(() => mockContainerClient)
      };

      BlobServiceClient.fromConnectionString.mockReturnValue(mockBlobServiceClient);

      const mockRequest = {
        params: { id: '12345678-1234-4567-8901-123456789012' }
      } as unknown as HttpRequest;

      const response = await getResumeUrl(mockRequest, mockContext);

      expect(response.status).toBe(200);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.resumeUrl).toBe('https://test.blob.core.windows.net/candidates/resume.pdf');
      expect(responseBody.data.resumeFileName).toBe('resume.pdf');
    });

    it('should return 404 for candidate without resume', async () => {
      const candidateData = {
        id: '12345678-1234-4567-8901-123456789012',
        name: 'John Doe',
        email: 'john@example.com'
        // No resumeUrl
      };

      // Mock blob storage response
      const { BlobServiceClient } = require('@azure/storage-blob');
      const mockBlobClient = {
        download: jest.fn().mockResolvedValue({
          readableStreamBody: {
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback(Buffer.from(JSON.stringify(candidateData)));
              } else if (event === 'end') {
                callback();
              }
            })
          }
        })
      };

      const mockContainerClient = {
        getBlobClient: jest.fn(() => mockBlobClient)
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn(() => mockContainerClient)
      };

      BlobServiceClient.fromConnectionString.mockReturnValue(mockBlobServiceClient);

      const mockRequest = {
        params: { id: '12345678-1234-4567-8901-123456789012' }
      } as unknown as HttpRequest;

      const response = await getResumeUrl(mockRequest, mockContext);

      expect(response.status).toBe(404);
      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe('NO_RESUME_FOUND');
    });
  });
});