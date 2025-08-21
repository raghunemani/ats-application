// Jest test setup file
// This file runs before all tests

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  // Uncomment to ignore specific console methods during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set only the NODE_ENV for tests
// Individual tests will set their own environment variables as needed
process.env.NODE_ENV = 'test';