// Mock the lensValidator and repoManager BEFORE importing the service
jest.mock('../src/utils/lensValidator', () => ({
  discoverLenses: jest.fn()
}));

jest.mock('../src/utils/repoManager', () => ({
  ensureRepo: jest.fn().mockResolvedValue(undefined),
  ensureMultipleRepos: jest.fn(),
  getRepoLocalPath: jest.fn((repoUrl) => `/tmp/repos/${repoUrl.replace(/[^a-zA-Z0-9]/g, '_')}`),
  getRepoCacheKey: jest.fn((repoUrl, branch, path) => `${repoUrl}:${branch || ''}:${path || ''}`)
}));

jest.mock('../src/utils/repoConfigParser', () => ({
  getAllRepoConfigs: jest.fn()
}));

const { getLenses, getLensesFromRepo, getLensByName, getLensNames, clearCache, forceUpdate, getCacheInfo } = require('../src/services/lensService');
const { discoverLenses } = require('../src/utils/lensValidator');
const { getAllRepoConfigs } = require('../src/utils/repoConfigParser');
const { ensureMultipleRepos } = require('../src/utils/repoManager');

describe('Lens Service', () => {
  beforeEach(() => {
    clearCache();
    jest.clearAllMocks();
  });

  describe('getLensesFromRepo (single repo)', () => {
    test('throws error when repoUrl is missing', async () => {
      await expect(getLensesFromRepo(null, 'main')).rejects.toThrow('Repository URL is required');
    });

    test('calls discoverLenses with correct parameters', async () => {
      const mockLenses = [
        { name: 'lens1', lens: {} },
        { name: 'lens2', lens: {} }
      ];

      discoverLenses.mockResolvedValue(mockLenses);

      const result = await getLensesFromRepo('https://repo.git', 'main', null);

      expect(discoverLenses).toHaveBeenCalled();
      expect(result).toEqual(mockLenses);
    });

    test('caches results from discoverLenses', async () => {
      const mockLenses = [
        { name: 'lens1', lens: {} }
      ];

      discoverLenses.mockResolvedValue(mockLenses);

      const result1 = await getLensesFromRepo('https://repo.git', 'main');
      const result2 = await getLensesFromRepo('https://repo.git', 'main');

      expect(discoverLenses).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    test('uses different cache keys for different repositories', async () => {
      const mockLenses1 = [{ name: 'lens1', lens: {} }];
      const mockLenses2 = [{ name: 'lens2', lens: {} }];

      discoverLenses
        .mockResolvedValueOnce(mockLenses1)
        .mockResolvedValueOnce(mockLenses2);

      const result1 = await getLensesFromRepo('https://repo1.git', 'main');
      const result2 = await getLensesFromRepo('https://repo2.git', 'main');

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

      const result1 = await getLensesFromRepo('https://repo.git', 'main');
      const result2 = await getLensesFromRepo('https://repo.git', 'develop');

      expect(discoverLenses).toHaveBeenCalledTimes(2);
      expect(result1).toEqual(mockLenses1);
      expect(result2).toEqual(mockLenses2);
    });

    test('propagates discoverLenses errors', async () => {
      const error = new Error('Discover failed');
      discoverLenses.mockRejectedValue(error);

      await expect(getLensesFromRepo('https://repo.git', 'main')).rejects.toThrow('Discover failed');
    });
  });

  describe('getLenses (multi-repo)', () => {
    test('aggregates lenses from multiple repositories', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null },
        { repoUrl: 'https://repo2.git', branch: 'develop', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);

      const mockLenses1 = [{ name: 'lens1', lens: { name: 'lens1' } }];
      const mockLenses2 = [{ name: 'lens2', lens: { name: 'lens2' } }];

      discoverLenses
        .mockResolvedValueOnce(mockLenses1)
        .mockResolvedValueOnce(mockLenses2);

      const result = await getLenses();

      expect(getAllRepoConfigs).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('lens1');
      expect(result[0].sourceRepo).toBe('https://repo1.git');
      expect(result[1].name).toBe('lens2');
      expect(result[1].sourceRepo).toBe('https://repo2.git');
    });

    test('continues processing when one repo fails', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null },
        { repoUrl: 'https://repo2.git', branch: 'main', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);

      const mockLenses = [{ name: 'lens2', lens: { name: 'lens2' } }];

      discoverLenses
        .mockRejectedValueOnce(new Error('Repo 1 failed'))
        .mockResolvedValueOnce(mockLenses);

      const result = await getLenses();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('lens2');
    });

    test('throws error when all repos fail', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null },
        { repoUrl: 'https://repo2.git', branch: 'main', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);

      discoverLenses
        .mockRejectedValueOnce(new Error('Repo 1 failed'))
        .mockRejectedValueOnce(new Error('Repo 2 failed'));

      await expect(getLenses()).rejects.toThrow('Failed to retrieve lenses from any repository');
    });

    test('throws error when getAllRepoConfigs fails', async () => {
      getAllRepoConfigs.mockRejectedValue(new Error('No repo config'));

      await expect(getLenses()).rejects.toThrow('No repo config');
    });
  });

  describe('getLensByName', () => {
    test('returns lens with matching name from multi-repo', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);

      const mockLens = {
        resourceType: 'Library',
        name: 'pregnancy-lens'
      };

      const mockLenses = [
        { name: 'lens1', lens: { name: 'lens1' } },
        { name: 'pregnancy-lens', lens: mockLens }
      ];

      discoverLenses.mockResolvedValue(mockLenses);

      const result = await getLensByName('pregnancy-lens');

      expect(result).toEqual(mockLens);
    });

    test('throws 404 error when lens not found', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);

      const mockLenses = [
        { name: 'lens1', lens: {} }
      ];

      discoverLenses.mockResolvedValue(mockLenses);

      try {
        await getLensByName('non-existent');
        fail('Should have thrown error');
      } catch (error) {
        expect(error.statusCode).toBe(404);
        expect(error.message).toContain('non-existent');
      }
    });
  });

  describe('getLensNames', () => {
    test('returns array of lens names from all repos', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null },
        { repoUrl: 'https://repo2.git', branch: 'main', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);

      const mockLenses1 = [
        { name: 'lens1', lens: {} },
        { name: 'lens2', lens: {} }
      ];

      const mockLenses2 = [
        { name: 'lens3', lens: {} }
      ];

      discoverLenses
        .mockResolvedValueOnce(mockLenses1)
        .mockResolvedValueOnce(mockLenses2);

      const result = await getLensNames();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(['lens1', 'lens2', 'lens3']);
    });

    test('returns empty array when no lenses found', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);
      discoverLenses.mockResolvedValue([]);

      const result = await getLensNames();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('clearCache', () => {
    test('clears cached lenses', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);

      const mockLenses = [{ name: 'lens1', lens: {} }];

      discoverLenses.mockResolvedValue(mockLenses);

      // First call - caches result
      const result1 = await getLenses();

      // Mock now returns different data
      const newMockLenses = [
        { name: 'lens1', lens: {} },
        { name: 'lens2', lens: {} }
      ];
      discoverLenses.mockResolvedValue(newMockLenses);

      // Second call - should return cached result
      const result2 = await getLenses();
      expect(result2.length).toEqual(result1.length);

      // Clear cache
      clearCache();

      // Third call - should call discoverLenses again
      const result3 = await getLenses();
      expect(result3.length).toEqual(2);
      expect(discoverLenses).toHaveBeenCalledTimes(2);
    });
  });

  describe('forceUpdate', () => {
    test('clears cache and updates all repositories', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);

      ensureMultipleRepos.mockResolvedValue([
        { repoUrl: 'https://repo1.git', branch: 'main', success: true }
      ]);

      const result = await forceUpdate();

      expect(result).toHaveProperty('timestamp');
      expect(result.total).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(getAllRepoConfigs).toHaveBeenCalled();
      expect(ensureMultipleRepos).toHaveBeenCalled();
    });

    test('reports failures correctly', async () => {
      const repoConfigs = [
        { repoUrl: 'https://repo1.git', branch: 'main', path: null },
        { repoUrl: 'https://repo2.git', branch: 'main', path: null }
      ];

      getAllRepoConfigs.mockResolvedValue(repoConfigs);

      ensureMultipleRepos.mockResolvedValue([
        { repoUrl: 'https://repo1.git', branch: 'main', success: true },
        { repoUrl: 'https://repo2.git', branch: 'main', success: false, error: 'Clone failed' }
      ]);

      const result = await forceUpdate();

      expect(result.total).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.repositories[1].error).toBe('Clone failed');
    });
  });

  describe('getCacheInfo', () => {
    test('returns cache configuration', () => {
      const cacheInfo = getCacheInfo();

      expect(cacheInfo).toHaveProperty('ttlMinutes');
      expect(cacheInfo).toHaveProperty('isInfinite');
      expect(cacheInfo).toHaveProperty('cachedRepositories');
      expect(typeof cacheInfo.ttlMinutes).toBe('number');
      expect(typeof cacheInfo.isInfinite).toBe('boolean');
    });
  });
});
