const request = require('supertest');
const express = require('express');

// Mock the lensService BEFORE importing
jest.mock('../src/services/lensService', () => ({
  forceUpdate: jest.fn(),
  getCacheInfo: jest.fn()
}));

const { forceUpdate, getCacheInfo } = require('../src/services/lensService');

describe('Update API Endpoints', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Add the endpoints directly since we're testing them in isolation
    app.get('/cache/info', (req, res) => {
      const cacheInfo = getCacheInfo();
      res.json(cacheInfo);
    });

    app.post('/update', async (req, res) => {
      try {
        console.log('Update endpoint called - triggering force update');
        const result = await forceUpdate();
        res.json({
          status: 'success',
          message: 'Repositories updated successfully',
          ...result
        });
      } catch (error) {
        console.error('Error in update endpoint:', error);
        res.status(500).json({
          status: 'error',
          message: 'Failed to update repositories',
          error: error.message
        });
      }
    });

    jest.clearAllMocks();
  });

  describe('GET /cache/info', () => {
    test('returns cache information', async () => {
      const mockCacheInfo = {
        ttlMinutes: 5,
        isInfinite: false,
        cachedRepositories: 2
      };

      getCacheInfo.mockReturnValue(mockCacheInfo);

      const response = await request(app).get('/cache/info');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCacheInfo);
      expect(getCacheInfo).toHaveBeenCalled();
    });

    test('returns infinite cache configuration', async () => {
      const mockCacheInfo = {
        ttlMinutes: -1,
        isInfinite: true,
        cachedRepositories: 0
      };

      getCacheInfo.mockReturnValue(mockCacheInfo);

      const response = await request(app).get('/cache/info');

      expect(response.status).toBe(200);
      expect(response.body.isInfinite).toBe(true);
      expect(response.body.ttlMinutes).toBe(-1);
    });
  });

  describe('POST /update', () => {
    test('successfully triggers force update', async () => {
      const mockUpdateResult = {
        timestamp: '2026-02-10T10:00:00.000Z',
        total: 2,
        successful: 2,
        failed: 0,
        repositories: [
          { repoUrl: 'https://repo1.git', branch: 'main', success: true, error: null },
          { repoUrl: 'https://repo2.git', branch: 'v1.0.0', success: true, error: null }
        ]
      };

      forceUpdate.mockResolvedValue(mockUpdateResult);

      const response = await request(app).post('/update');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Repositories updated successfully');
      expect(response.body.total).toBe(2);
      expect(response.body.successful).toBe(2);
      expect(response.body.failed).toBe(0);
      expect(forceUpdate).toHaveBeenCalled();
    });

    test('reports partial failures', async () => {
      const mockUpdateResult = {
        timestamp: '2026-02-10T10:00:00.000Z',
        total: 2,
        successful: 1,
        failed: 1,
        repositories: [
          { repoUrl: 'https://repo1.git', branch: 'main', success: true, error: null },
          { repoUrl: 'https://repo2.git', branch: 'main', success: false, error: 'Clone failed' }
        ]
      };

      forceUpdate.mockResolvedValue(mockUpdateResult);

      const response = await request(app).post('/update');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(1);
    });

    test('handles force update errors', async () => {
      forceUpdate.mockRejectedValue(new Error('Repository update failed'));

      const response = await request(app).post('/update');

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to update repositories');
      expect(response.body.error).toBe('Repository update failed');
    });
  });
});
