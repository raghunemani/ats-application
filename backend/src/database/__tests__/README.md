# Database Tests

This directory contains unit tests for the database utilities and configuration.

## What These Tests Do

### 1. **DatabaseUtils Tests**
Tests the utility functions that help with database operations:

- **ID Generation**: Tests that `generateId()` creates valid, unique GUIDs
- **JSON Conversion**: Tests `toJsonString()` and `fromJsonString()` functions
- **Error Handling**: Tests that invalid data is handled gracefully

### 2. **Configuration Tests**
Tests the database configuration function:

- **Environment Detection**: Tests development vs production settings
- **Environment Variables**: Tests that config reads from environment variables
- **Default Values**: Tests fallback values when environment variables are missing

## Running the Tests

### Run All Tests
```bash
cd backend
npm test
```

### Run Tests in Watch Mode (automatically re-run when files change)
```bash
npm run test:watch
```

### Run Only Database Tests
```bash
npm test -- --testPathPattern=database
```

### Run Tests with Coverage Report
```bash
npm test -- --coverage
```

## Test Results Explanation

### ✅ **Passing Test Example:**
```
✓ should generate a valid GUID format (2 ms)
```
This means the test passed - the function works correctly.

### ❌ **Failing Test Example:**
```
✗ should generate a valid GUID format (5 ms)
  Expected: "12345678-1234-4567-8901-123456789012"
  Received: "invalid-guid-format"
```
This means the test failed - the function has a bug.

## What Each Test Validates

### **ID Generation Tests:**
- **Format**: Ensures IDs follow GUID format (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
- **Uniqueness**: Ensures each generated ID is different
- **Length**: Ensures IDs are always 36 characters long

### **JSON Conversion Tests:**
- **Objects**: Can convert JavaScript objects to JSON strings
- **Arrays**: Can convert arrays to JSON strings  
- **Null Handling**: Handles null/undefined values safely
- **Parsing**: Can convert JSON strings back to JavaScript objects
- **Error Handling**: Doesn't crash on invalid JSON

### **Configuration Tests:**
- **Environment Detection**: Uses correct settings for dev/production
- **Variable Reading**: Reads database connection info from environment
- **Defaults**: Uses sensible defaults when variables are missing
- **Security**: Uses secure authentication in production

## Why These Tests Matter

1. **Catch Bugs Early**: Tests find problems before users do
2. **Prevent Regressions**: Tests ensure changes don't break existing functionality  
3. **Documentation**: Tests show how functions should be used
4. **Confidence**: Tests give confidence that code works correctly

## Test Coverage

Good test coverage means most of your code is tested:
- **90%+ coverage**: Excellent
- **80-90% coverage**: Good  
- **70-80% coverage**: Acceptable
- **<70% coverage**: Needs improvement

## Common Test Patterns

### **Arrange, Act, Assert Pattern:**
```typescript
it('should generate unique IDs', () => {
  // Arrange: Set up test data
  const id1 = DatabaseUtils.generateId();
  const id2 = DatabaseUtils.generateId();
  
  // Act: (already done above)
  
  // Assert: Check the result
  expect(id1).not.toBe(id2);
});
```

### **Error Testing Pattern:**
```typescript
it('should handle invalid JSON gracefully', () => {
  // Arrange: Mock console to avoid noise
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  
  // Act: Try to parse invalid JSON
  const result = DatabaseUtils.fromJsonString('invalid json');
  
  // Assert: Should return null and log error
  expect(result).toBeNull();
  expect(consoleSpy).toHaveBeenCalled();
  
  // Cleanup: Restore console
  consoleSpy.mockRestore();
});
```

## Next Steps

After these tests pass, you can:
1. Add more complex integration tests
2. Test actual database connections (with test database)
3. Add performance tests
4. Add end-to-end tests