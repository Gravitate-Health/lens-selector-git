const request = require('supertest');
const express = require('express');

// Mock the lensService BEFORE importing routes
jest.mock('../src/services/lensService', () => ({
  getLenses: jest.fn(),
  getLensByName: jest.fn(),
  getLensNames: jest.fn(),
  clearCache: jest.fn()
}));

const lensesRouter = require('../src/routes/lenses');
const { getLenses, getLensByName, getLensNames, clearCache } = require('../src/services/lensService');

describe('Lenses API Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/lenses', lensesRouter);
    jest.clearAllMocks();
    clearCache();
  });

  describe('GET /lenses', () => {
    test('returns list of lens names', async () => {
      const mockLensNames = ['pregnancy-lens', 'drug-interaction-lens'];
      getLensNames.mockResolvedValue(mockLensNames);

      const response = await request(app).get('/lenses');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('lenses');
      expect(Array.isArray(response.body.lenses)).toBe(true);
      expect(response.body.lenses).toEqual(mockLensNames);
    });

    test('handles error when getting lenses', async () => {
      getLensNames.mockRejectedValue(new Error('Repository not found'));

      const response = await request(app).get('/lenses');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('Repository not found');
    });

    test('handles missing GIT_REPO_URL', async () => {
      getLensNames.mockRejectedValue(new Error('GIT_REPO_URL environment variable is required'));

      const response = await request(app).get('/lenses');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('GIT_REPO_URL');
    });
  });

  describe('GET /lenses/:name', () => {
    test('returns specific lens by name', async () => {
      const mockLens = {
        resourceType: 'Library',
        url: 'http://hl7.eu/fhir/ig/gravitate-health/Library/pregnancy-lens',
        name: 'pregnancy-lens',
        status: 'draft',
        content: [{ data: 'base64content' }]
      };

      getLensByName.mockResolvedValue(mockLens);

      const response = await request(app).get('/lenses/pregnancy-lens');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockLens);
      expect(response.body.resourceType).toBe('Library');
      expect(response.body.name).toBe('pregnancy-lens');
    });

    test('returns 404 when lens not found', async () => {
      const error = new Error('Lens not found');
      error.statusCode = 404;
      getLensByName.mockRejectedValue(error);

      const response = await request(app).get('/lenses/non-existent-lens');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Lens not found');
    });

    test('returns 500 on server error', async () => {
      getLensByName.mockRejectedValue(new Error('Server error'));

      const response = await request(app).get('/lenses/some-lens');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to fetch lens');
    });
  });

  describe('Error Responses', () => {
    test('returns proper error format', async () => {
      getLensNames.mockRejectedValue(new Error('Test error'));

      const response = await request(app).get('/lenses');

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
    });
  });
});
