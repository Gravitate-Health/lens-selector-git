const fs = require('fs');
const axios = require('axios');
const { parseRepoConfig, normalizeRepoConfig, getAllRepoConfigs } = require('../src/utils/repoConfigParser');

// Mock axios
jest.mock('axios');

// Mock fs
jest.mock('fs');

describe('Repo Config Parser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseRepoConfig', () => {
    test('parses inline JSON array', async () => {
      const jsonString = '[{"repoUrl":"https://repo1.git","branch":"main"}]';
      const result = await parseRepoConfig(jsonString);
      
      expect(result).toEqual([
        { repoUrl: 'https://repo1.git', branch: 'main' }
      ]);
    });

    test('parses inline JSON object and converts to array', async () => {
      const jsonString = '{"repoUrl":"https://repo1.git","branch":"main"}';
      const result = await parseRepoConfig(jsonString);
      
      expect(result).toEqual([
        { repoUrl: 'https://repo1.git', branch: 'main' }
      ]);
    });

    test('fetches config from URL', async () => {
      const mockData = [
        { repoUrl: 'https://repo1.git', branch: 'main' }
      ];
      
      axios.get.mockResolvedValue({ data: mockData });
      
      const result = await parseRepoConfig('https://example.com/repos.json');
      
      expect(axios.get).toHaveBeenCalledWith('https://example.com/repos.json');
      expect(result).toEqual(mockData);
    });

    test('fetches config from URL and converts object to array', async () => {
      const mockData = { repoUrl: 'https://repo1.git', branch: 'main' };
      
      axios.get.mockResolvedValue({ data: mockData });
      
      const result = await parseRepoConfig('https://example.com/repo.json');
      
      expect(result).toEqual([mockData]);
    });

    test('reads config from local file', async () => {
      const mockConfig = [
        { repoUrl: 'https://repo1.git', branch: 'main' }
      ];
      
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      const result = await parseRepoConfig('/path/to/repos.json');
      
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/repos.json');
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/repos.json', 'utf8');
      expect(result).toEqual(mockConfig);
    });

    test('returns empty array for null input', async () => {
      const result = await parseRepoConfig(null);
      expect(result).toEqual([]);
    });

    test('returns empty array for undefined input', async () => {
      const result = await parseRepoConfig(undefined);
      expect(result).toEqual([]);
    });

    test('throws error for invalid file path', async () => {
      fs.existsSync.mockReturnValue(false);
      
      await expect(parseRepoConfig('/invalid/path.json'))
        .rejects.toThrow('Invalid REPOS_CONFIG');
    });

    test('throws error when URL fetch fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      
      await expect(parseRepoConfig('https://example.com/repos.json'))
        .rejects.toThrow('Failed to fetch repository configuration from URL');
    });
  });

  describe('normalizeRepoConfig', () => {
    test('normalizes config with standard field names', () => {
      const config = {
        repoUrl: 'https://repo1.git',
        branch: 'main',
        path: 'lens.json'
      };
      
      const result = normalizeRepoConfig(config);
      
      expect(result).toEqual({
        repoUrl: 'https://repo1.git',
        branch: 'main',
        path: 'lens.json'
      });
    });

    test('normalizes config with alternative field names', () => {
      const config = {
        repo_url: 'https://repo1.git',
        git_branch: 'develop',
        lens_file_path: 'lenses/lens.json'
      };
      
      const result = normalizeRepoConfig(config);
      
      expect(result).toEqual({
        repoUrl: 'https://repo1.git',
        branch: 'develop',
        path: 'lenses/lens.json'
      });
    });

    test('normalizes config with "url" field', () => {
      const config = {
        url: 'https://repo1.git',
        branch: 'main'
      };
      
      const result = normalizeRepoConfig(config);
      
      expect(result).toEqual({
        repoUrl: 'https://repo1.git',
        branch: 'main',
        path: null
      });
    });

    test('sets null for missing optional fields', () => {
      const config = {
        repoUrl: 'https://repo1.git'
      };
      
      const result = normalizeRepoConfig(config);
      
      expect(result).toEqual({
        repoUrl: 'https://repo1.git',
        branch: null,
        path: null
      });
    });

    test('throws error for config without repoUrl', () => {
      const config = {
        branch: 'main'
      };
      
      expect(() => normalizeRepoConfig(config, 0))
        .toThrow("Repository config at index 0 missing 'repoUrl' field");
    });

    test('throws error for non-object config', () => {
      expect(() => normalizeRepoConfig('not an object', 0))
        .toThrow('Repository config at index 0 must be an object');
    });

    test('throws error for null config', () => {
      expect(() => normalizeRepoConfig(null, 1))
        .toThrow('Repository config at index 1 must be an object');
    });
  });

  describe('getAllRepoConfigs', () => {
    beforeEach(() => {
      // Clear all env vars before each test
      delete process.env.REPOS_CONFIG;
      delete process.env.GIT_REPO_URL;
      delete process.env.GIT_BRANCH;
      delete process.env.LENS_FILE_PATH;
    });

    test('returns configs from REPOS_CONFIG only', async () => {
      process.env.REPOS_CONFIG = '[{"repoUrl":"https://repo1.git","branch":"main"}]';
      
      const result = await getAllRepoConfigs();
      
      expect(result).toEqual([
        { repoUrl: 'https://repo1.git', branch: 'main', path: null }
      ]);
    });

    test('returns legacy config only when no REPOS_CONFIG', async () => {
      process.env.GIT_REPO_URL = 'https://legacy.git';
      process.env.GIT_BRANCH = 'main';
      process.env.LENS_FILE_PATH = 'lens.json';
      
      const result = await getAllRepoConfigs();
      
      expect(result).toEqual([
        { repoUrl: 'https://legacy.git', branch: 'main', path: 'lens.json' }
      ]);
    });

    test('merges REPOS_CONFIG and legacy config', async () => {
      process.env.REPOS_CONFIG = '[{"repoUrl":"https://repo1.git","branch":"main"}]';
      process.env.GIT_REPO_URL = 'https://legacy.git';
      process.env.GIT_BRANCH = 'develop';
      
      const result = await getAllRepoConfigs();
      
      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { repoUrl: 'https://repo1.git', branch: 'main', path: null },
        { repoUrl: 'https://legacy.git', branch: 'develop', path: null }
      ]);
    });

    test('avoids duplicate when legacy config already in REPOS_CONFIG', async () => {
      process.env.REPOS_CONFIG = '[{"repoUrl":"https://repo.git","branch":"main","path":null}]';
      process.env.GIT_REPO_URL = 'https://repo.git';
      process.env.GIT_BRANCH = 'main';
      
      const result = await getAllRepoConfigs();
      
      expect(result).toHaveLength(1);
      expect(result).toEqual([
        { repoUrl: 'https://repo.git', branch: 'main', path: null }
      ]);
    });

    test('throws error when no configuration is provided', async () => {
      await expect(getAllRepoConfigs())
        .rejects.toThrow('No repository configuration found');
    });

    test('handles multiple repos in REPOS_CONFIG', async () => {
      const multiRepoConfig = [
        { repoUrl: 'https://repo1.git', branch: 'main' },
        { repoUrl: 'https://repo2.git', branch: 'develop' },
        { repoUrl: 'https://repo3.git' }
      ];
      
      process.env.REPOS_CONFIG = JSON.stringify(multiRepoConfig);
      
      const result = await getAllRepoConfigs();
      
      expect(result).toHaveLength(3);
      expect(result[0].repoUrl).toBe('https://repo1.git');
      expect(result[1].repoUrl).toBe('https://repo2.git');
      expect(result[2].repoUrl).toBe('https://repo3.git');
    });
  });
});
