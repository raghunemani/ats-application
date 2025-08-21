// Unit tests for database configuration and utilities

import { DatabaseUtils, getDatabaseConfig } from '../config';

describe('DatabaseUtils', () => {
  describe('generateId', () => {
    it('should generate a valid GUID format', () => {
      const id = DatabaseUtils.generateId();
      
      // GUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(guidRegex);
    });

    it('should generate unique IDs', () => {
      const id1 = DatabaseUtils.generateId();
      const id2 = DatabaseUtils.generateId();
      
      expect(id1).not.toBe(id2);
    });

    it('should always generate IDs with correct length', () => {
      const id = DatabaseUtils.generateId();
      expect(id).toHaveLength(36); // 32 chars + 4 hyphens
    });
  });

  describe('toJsonString', () => {
    it('should convert object to JSON string', () => {
      const obj = { name: 'test', skills: ['JavaScript', 'TypeScript'] };
      const result = DatabaseUtils.toJsonString(obj);
      
      expect(result).toBe('{"name":"test","skills":["JavaScript","TypeScript"]}');
    });

    it('should handle arrays correctly', () => {
      const arr = ['skill1', 'skill2', 'skill3'];
      const result = DatabaseUtils.toJsonString(arr);
      
      expect(result).toBe('["skill1","skill2","skill3"]');
    });

    it('should handle null/undefined values', () => {
      expect(DatabaseUtils.toJsonString(null)).toBe('');
      expect(DatabaseUtils.toJsonString(undefined)).toBe('');
    });

    it('should handle empty objects', () => {
      const result = DatabaseUtils.toJsonString({});
      expect(result).toBe('{}');
    });

    it('should handle nested objects', () => {
      const obj = {
        candidate: {
          name: 'John',
          skills: ['React', 'Node.js']
        }
      };
      const result = DatabaseUtils.toJsonString(obj);
      const expected = '{"candidate":{"name":"John","skills":["React","Node.js"]}}';
      expect(result).toBe(expected);
    });
  });

  describe('fromJsonString', () => {
    it('should parse valid JSON string to object', () => {
      const jsonString = '{"name":"test","skills":["JavaScript","TypeScript"]}';
      const result = DatabaseUtils.fromJsonString(jsonString);
      
      expect(result).toEqual({ name: 'test', skills: ['JavaScript', 'TypeScript'] });
    });

    it('should parse arrays correctly', () => {
      const jsonString = '["skill1","skill2","skill3"]';
      const result = DatabaseUtils.fromJsonString(jsonString);
      
      expect(result).toEqual(['skill1', 'skill2', 'skill3']);
    });

    it('should handle empty/null strings', () => {
      expect(DatabaseUtils.fromJsonString('')).toBeNull();
      expect(DatabaseUtils.fromJsonString(null as any)).toBeNull();
      expect(DatabaseUtils.fromJsonString(undefined as any)).toBeNull();
    });

    it('should handle invalid JSON gracefully', () => {
      // Mock console.error to avoid test output noise
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const result = DatabaseUtils.fromJsonString('invalid json {');
      
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error parsing JSON string:', 
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle empty objects', () => {
      const result = DatabaseUtils.fromJsonString('{}');
      expect(result).toEqual({});
    });

    it('should handle nested objects', () => {
      const jsonString = '{"candidate":{"name":"John","skills":["React","Node.js"]}}';
      const result = DatabaseUtils.fromJsonString(jsonString);
      
      expect(result).toEqual({
        candidate: {
          name: 'John',
          skills: ['React', 'Node.js']
        }
      });
    });

    it('should handle numbers and booleans', () => {
      const jsonString = '{"age":30,"isActive":true,"salary":null}';
      const result = DatabaseUtils.fromJsonString(jsonString);
      
      expect(result).toEqual({
        age: 30,
        isActive: true,
        salary: null
      });
    });
  });

  describe('JSON round-trip conversion', () => {
    it('should maintain data integrity through conversion cycle', () => {
      const originalData = {
        name: 'John Doe',
        skills: ['JavaScript', 'TypeScript', 'React'],
        experience: {
          years: 5,
          companies: ['Microsoft', 'Google']
        },
        isActive: true,
        salary: null
      };

      // Convert to JSON string and back
      const jsonString = DatabaseUtils.toJsonString(originalData);
      const parsedData = DatabaseUtils.fromJsonString(jsonString);

      expect(parsedData).toEqual(originalData);
    });
  });
});

describe('getDatabaseConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return development config by default', () => {
    delete process.env.NODE_ENV;
    delete process.env.DB_SERVER;
    delete process.env.DB_NAME;
    
    const config = getDatabaseConfig();
    
    expect(config.server).toBe('localhost');
    expect(config.database).toBe('ApplicationTrackingSystem');
    expect(config.options.trustServerCertificate).toBe(true);
    expect(config.authentication).toBeUndefined();
  });

  it('should return production config when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    
    const config = getDatabaseConfig();
    
    expect(config.options.trustServerCertificate).toBe(false);
    expect(config.authentication?.type).toBe('azure-active-directory-msi-app-service');
  });

  it('should use environment variables when provided', () => {
    process.env.DB_SERVER = 'test-server.database.windows.net';
    process.env.DB_NAME = 'TestDatabase';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpassword';
    
    const config = getDatabaseConfig();
    
    expect(config.server).toBe('test-server.database.windows.net');
    expect(config.database).toBe('TestDatabase');
    expect(config.user).toBe('testuser');
    expect(config.password).toBe('testpassword');
  });

  it('should have correct default options', () => {
    const config = getDatabaseConfig();
    
    expect(config.options.encrypt).toBe(true);
    expect(config.options.enableArithAbort).toBe(true);
    expect(config.options.connectionTimeout).toBe(30000);
    expect(config.options.requestTimeout).toBe(60000);
  });

  it('should have correct pool configuration', () => {
    const config = getDatabaseConfig();
    
    expect(config.pool.max).toBe(10);
    expect(config.pool.min).toBe(0);
    expect(config.pool.idleTimeoutMillis).toBe(30000);
  });

  it('should handle missing environment variables gracefully', () => {
    delete process.env.DB_SERVER;
    delete process.env.DB_NAME;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.NODE_ENV;
    
    const config = getDatabaseConfig();
    
    expect(config.server).toBe('localhost');
    expect(config.database).toBe('ApplicationTrackingSystem');
    expect(config.user).toBeUndefined();
    expect(config.password).toBeUndefined();
  });

  it('should configure authentication correctly for different environments', () => {
    // Test development environment
    process.env.NODE_ENV = 'development';
    let config = getDatabaseConfig();
    expect(config.authentication).toBeUndefined();
    
    // Test production environment
    process.env.NODE_ENV = 'production';
    config = getDatabaseConfig();
    expect(config.authentication).toBeDefined();
    expect(config.authentication?.type).toBe('azure-active-directory-msi-app-service');
  });
});