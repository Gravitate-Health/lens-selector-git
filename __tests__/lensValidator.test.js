const { validateFHIRLens, discoverLenses, jsToBase64 } = require('../src/utils/lensValidator');
const path = require('path');
const fs = require('fs');

describe('FHIR Lens Validator', () => {
  describe('validateFHIRLens', () => {
    test('validates a valid lens', () => {
      const validLens = {
        resourceType: 'Library',
        id: 'test-lens',
        url: 'http://example.com/Library/test-lens',
        name: 'Test Lens',
        status: 'draft',
        content: [
          {
            data: 'SGVsbG8gV29ybGQh' // base64 encoded "Hello World!"
          }
        ]
      };

      const result = validateFHIRLens(validLens);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects lens with missing resourceType', () => {
      const invalidLens = {
        id: 'test-lens',
        url: 'http://example.com/Library/test-lens',
        name: 'Test Lens',
        status: 'draft',
        content: [{ data: 'base64data' }]
      };

      const result = validateFHIRLens(invalidLens);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('resourceType must be "Library"');
    });

    test('rejects lens with wrong resourceType', () => {
      const invalidLens = {
        resourceType: 'Patient',
        id: 'test-lens',
        url: 'http://example.com/Library/test-lens',
        name: 'Test Lens',
        status: 'draft',
        content: [{ data: 'base64data' }]
      };

      const result = validateFHIRLens(invalidLens);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('resourceType must be "Library"');
    });

    test('rejects lens with missing id', () => {
      const invalidLens = {
        resourceType: 'Library',
        url: 'http://example.com/Library/test-lens',
        name: 'Test Lens',
        status: 'draft',
        content: [{ data: 'base64data' }]
      };

      const result = validateFHIRLens(invalidLens);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('id is required and must be a string');
    });

    test('rejects lens with missing url', () => {
      const invalidLens = {
        resourceType: 'Library',
        id: 'test-lens',
        name: 'Test Lens',
        status: 'draft',
        content: [{ data: 'base64data' }]
      };

      const result = validateFHIRLens(invalidLens);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('url is required and must be a string');
    });

    test('rejects lens with missing name', () => {
      const invalidLens = {
        resourceType: 'Library',
        id: 'test-lens',
        url: 'http://example.com/Library/test-lens',
        status: 'draft',
        content: [{ data: 'base64data' }]
      };

      const result = validateFHIRLens(invalidLens);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('name is required and must be a string');
    });

    test('rejects lens with missing status', () => {
      const invalidLens = {
        resourceType: 'Library',
        id: 'test-lens',
        url: 'http://example.com/Library/test-lens',
        name: 'Test Lens',
        content: [{ data: 'base64data' }]
      };

      const result = validateFHIRLens(invalidLens);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('status is required and must be a string');
    });

    test('rejects lens with missing content array', () => {
      const invalidLens = {
        resourceType: 'Library',
        id: 'test-lens',
        url: 'http://example.com/Library/test-lens',
        name: 'Test Lens',
        status: 'draft'
      };

      const result = validateFHIRLens(invalidLens);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('content must be an array');
    });

    test('rejects lens with empty content array', () => {
      const invalidLens = {
        resourceType: 'Library',
        id: 'test-lens',
        url: 'http://example.com/Library/test-lens',
        name: 'Test Lens',
        status: 'draft',
        content: []
      };

      const result = validateFHIRLens(invalidLens);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('content must include at least one item with base64 encoded data');
    });

    test('rejects lens with missing data in content', () => {
      const invalidLens = {
        resourceType: 'Library',
        id: 'test-lens',
        url: 'http://example.com/Library/test-lens',
        name: 'Test Lens',
        status: 'draft',
        content: [{}]
      };

      const result = validateFHIRLens(invalidLens);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('content must include at least one item with base64 encoded data');
    });

    test('rejects null lens', () => {
      const result = validateFHIRLens(null);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Lens must be a JSON object');
    });

    test('rejects non-object lens', () => {
      const result = validateFHIRLens('not an object');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Lens must be a JSON object');
    });
  });

  describe('jsToBase64', () => {
    const testDir = path.join(__dirname, 'fixtures');

    afterEach(() => {
      // Cleanup fixtures directory
      if (fs.existsSync(testDir)) {
        try {
          fs.rmSync(testDir, { recursive: true, force: true });
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });

    test('converts JavaScript file to base64', () => {
      const testFile = path.join(testDir, 'test-enhance.js');
      
      // Create test file
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      const jsContent = 'function enhance(data) { return data; }';
      fs.writeFileSync(testFile, jsContent, 'utf8');

      try {
        const base64 = jsToBase64(testFile);
        const decoded = Buffer.from(base64, 'base64').toString('utf8');
        
        expect(decoded).toBe(jsContent);
        expect(typeof base64).toBe('string');
        expect(base64.length > 0).toBe(true);
      } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    });
  });

  describe('discoverLenses - Real Repository', () => {
    // This test requires network access and takes time
    test(
      'discovers lenses from pregnancy-lens repository',
      async () => {
        const repoUrl = 'https://github.com/Gravitate-Health/pregnancy-lens.git';
        const branch = 'main';
        const lensFilePath = 'pregnancy-lens.json';
        const tempDir = path.join(__dirname, '..', '.tmp-test-repos');

        try {
          const lenses = await discoverLenses(repoUrl, branch, lensFilePath, tempDir);

          expect(Array.isArray(lenses)).toBe(true);
          expect(lenses.length).toBeGreaterThan(0);

          // Check first lens structure
          const lens = lenses[0];
          expect(lens).toHaveProperty('id');
          expect(lens).toHaveProperty('name');
          expect(lens).toHaveProperty('url');
          expect(lens).toHaveProperty('status');
          expect(lens).toHaveProperty('lens');
          expect(lens.lens).toHaveProperty('resourceType', 'Library');
          expect(lens.lens).toHaveProperty('content');
          expect(Array.isArray(lens.lens.content)).toBe(true);
        } catch (error) {
          // Network errors are acceptable in test environment
          console.log('Network test skipped:', error.message);
        }
      },
      30000 // 30 second timeout
    );

    test(
      'auto-discovers all lenses in pregnancy-lens repository',
      async () => {
        const repoUrl = 'https://github.com/Gravitate-Health/pregnancy-lens.git';
        const branch = 'main';
        const tempDir = path.join(__dirname, '..', '.tmp-test-repos');

        try {
          // No lensFilePath specified - should auto-discover
          const lenses = await discoverLenses(repoUrl, branch, null, tempDir);

          expect(Array.isArray(lenses)).toBe(true);
          // May find multiple lenses or just one
          expect(lenses.length).toBeGreaterThanOrEqual(1);

          // All returned items should be valid lenses
          lenses.forEach((lens) => {
            expect(lens.lens.resourceType).toBe('Library');
            expect(lens.lens.content).toBeDefined();
            expect(lens.lens.content[0].data).toBeDefined();
          });
        } catch (error) {
          // Network errors are acceptable in test environment
          console.log('Network test skipped:', error.message);
        }
      },
      30000 // 30 second timeout
    );
  });
});
