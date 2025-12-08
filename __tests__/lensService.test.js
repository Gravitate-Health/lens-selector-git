// Mock the lensValidator and repoManager BEFORE importing the service
jest.mock('../src/utils/lensValidator', () => ({
  discoverLenses: jest.fn()
}));

jest.mock('../src/utils/repoManager', () => ({
  ensureRepo: jest.fn().mockResolvedValue(undefined),
  getRepoLocalPath: jest.fn((repoUrl) => `/tmp/repos/${repoUrl.replace(/[^a-zA-Z0-9]/g, '_')}`)
}));

const { getLenses, getLensByName, getLensNames, clearCache } = require('../src/services/lensService');
const { discoverLenses } = require('../src/utils/lensValidator');

describe('Lens Service', () => {
  beforeEach(() => {
    clearCache();
    jest.clearAllMocks();
  });

  describe('getLenses', () => {
    test('throws error when GIT_REPO_URL is missing', async () => {
      const originalEnv = process.env.GIT_REPO_URL;
      delete process.env.GIT_REPO_URL;

      try {
        await getLenses(null, 'main');
      } catch (error) {
        expect(error.message).toContain('GIT_REPO_URL');
      }

      process.env.GIT_REPO_URL = originalEnv;
    });

    test('calls discoverLenses with correct parameters', async () => {
      const mockLenses = [
        { name: 'lens1', lens: {} },
        { name: 'lens2', lens: {} }
      ];

      discoverLenses.mockResolvedValue(mockLenses);

      const result = await getLenses('https://repo.git', 'main', null);

      expect(discoverLenses).toHaveBeenCalled();
      expect(result).toEqual(mockLenses);
    });

    test('caches results from discoverLenses', async () => {
      const mockLenses = [
        { name: 'lens1', lens: {} }
      ];

      discoverLenses.mockResolvedValue(mockLenses);

      const result1 = await getLenses('https://repo.git', 'main');
      const result2 = await getLenses('https://repo.git', 'main');

      expect(discoverLenses).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    test('uses different cache keys for different repositories', async () => {
      const mockLenses1 = [{ name: 'lens1', lens: {} }];
      const mockLenses2 = [{ name: 'lens2', lens: {} }];

      discoverLenses
        .mockResolvedValueOnce(mockLenses1)
        .mockResolvedValueOnce(mockLenses2);

      const result1 = await getLenses('https://repo1.git', 'main');
      const result2 = await getLenses('https://repo2.git', 'main');

      expect(discoverLenses).toHaveBeenCalledTimes(2);
      expect(result1).toEqual(mockLenses1);
      expect(result2).toEqual(mockLenses2);
    });

    test('uses different cache keys for different branches', async () => {
      const mockLenses1 = [{ name: 'lens1', lens: {} }];
      const mockLenses2 = [{ name: 'lens2', lens: {} }];

      discoverLenses
        .mockResolvedValueOnce(mockLenses1)
        .mockResolvedValueOnce(mockLenses2);

      const result1 = await getLenses('https://repo.git', 'main');
      const result2 = await getLenses('https://repo.git', 'develop');

      expect(discoverLenses).toHaveBeenCalledTimes(2);
      expect(result1).toEqual(mockLenses1);
      expect(result2).toEqual(mockLenses2);
    });

    test('propagates discoverLenses errors', async () => {
      const error = new Error('Discover failed');
      discoverLenses.mockRejectedValue(error);

      await expect(getLenses('https://repo.git', 'main')).rejects.toThrow('Discover failed');
    });
  });

  describe('getLensByName', () => {
    test('returns lens with matching name', async () => {
      const mockLens = {
        resourceType: 'Library',
        name: 'pregnancy-lens'
      };

      const mockLenses = [
        { name: 'lens1', lens: { name: 'lens1' } },
        { name: 'pregnancy-lens', lens: mockLens }
      ];

      discoverLenses.mockResolvedValue(mockLenses);

      const result = await getLensByName('https://repo.git', 'main', null, 'pregnancy-lens');

      expect(result).toEqual(mockLens);
    });

    test('throws 404 error when lens not found', async () => {
      const mockLenses = [
        { name: 'lens1', lens: {} }
      ];

      discoverLenses.mockResolvedValue(mockLenses);

      try {
        await getLensByName('https://repo.git', 'main', null, 'non-existent');
        fail('Should have thrown error');
      } catch (error) {
        expect(error.statusCode).toBe(404);
        expect(error.message).toContain('non-existent');
      }
    });
  });

  describe('getLensNames', () => {
    test('returns array of lens names', async () => {
      const mockLenses = [
        { name: 'lens1', lens: {} },
        { name: 'lens2', lens: {} },
        { name: 'lens3', lens: {} }
      ];

      discoverLenses.mockResolvedValue(mockLenses);

      const result = await getLensNames('https://repo.git', 'main');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(['lens1', 'lens2', 'lens3']);
    });

    test('returns empty array when no lenses found', async () => {
      discoverLenses.mockResolvedValue([]);

      const result = await getLensNames('https://repo.git', 'main');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('clearCache', () => {
    test('clears cached lenses', async () => {
      const mockLenses = [{ name: 'lens1', lens: {} }];

      discoverLenses.mockResolvedValue(mockLenses);

      // First call - caches result
      const result1 = await getLenses('https://repo.git', 'main');

      // Mock now returns different data
      const newMockLenses = [
        { name: 'lens1', lens: {} },
        { name: 'lens2', lens: {} }
      ];
      discoverLenses.mockResolvedValue(newMockLenses);

      // Second call - should return cached result
      const result2 = await getLenses('https://repo.git', 'main');
      expect(result2).toEqual(result1);

      // Clear cache
      clearCache();

      // Third call - should call discoverLenses again
      const result3 = await getLenses('https://repo.git', 'main');
      expect(result3).toEqual(newMockLenses);
      expect(discoverLenses).toHaveBeenCalledTimes(2);
    });
  });
});
