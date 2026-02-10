const fs = require('fs');
const axios = require('axios');

/**
 * Parse repository configuration from various sources
 * Supports: local file path, remote URL, or inline JSON string
 * 
 * @param {string} configSource - Path, URL, or JSON string
 * @returns {Promise<Array>} Array of repo configuration objects
 */
async function parseRepoConfig(configSource) {
  if (!configSource) {
    return [];
  }

  try {
    // Try to parse as inline JSON first
    if (configSource.trim().startsWith('[') || configSource.trim().startsWith('{')) {
      const parsed = JSON.parse(configSource);
      return Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch (e) {
    // Not inline JSON, continue to other methods
  }

  try {
    // Check if it's a URL
    if (configSource.startsWith('http://') || configSource.startsWith('https://')) {
      console.log(`Fetching repo config from URL: ${configSource}`);
      const response = await axios.get(configSource);
      const data = response.data;
      return Array.isArray(data) ? data : [data];
    }
  } catch (e) {
    console.error(`Failed to fetch repo config from URL: ${e.message}`);
    throw new Error(`Failed to fetch repository configuration from URL: ${configSource}`);
  }

  try {
    // Try as local file path
    if (fs.existsSync(configSource)) {
      console.log(`Reading repo config from file: ${configSource}`);
      const content = fs.readFileSync(configSource, 'utf8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch (e) {
    console.error(`Failed to read repo config from file: ${e.message}`);
    throw new Error(`Failed to read repository configuration from file: ${configSource}`);
  }

  throw new Error(`Invalid REPOS_CONFIG: not a valid file path, URL, or JSON string: ${configSource}`);
}

/**
 * Normalize and validate a repository configuration object
 * @param {Object} repoConfig - Raw repo config
 * @param {number} index - Index in the array (for error messages)
 * @returns {Object} Normalized repo config
 */
function normalizeRepoConfig(repoConfig, index = 0) {
  if (!repoConfig || typeof repoConfig !== 'object') {
    throw new Error(`Repository config at index ${index} must be an object`);
  }

  if (!repoConfig.repoUrl && !repoConfig.repo_url && !repoConfig.url) {
    throw new Error(`Repository config at index ${index} missing 'repoUrl' field`);
  }

  // Support multiple field name variations
  const repoUrl = repoConfig.repoUrl || repoConfig.repo_url || repoConfig.url;
  const branch = repoConfig.branch || repoConfig.git_branch || null;
  const path = repoConfig.path || repoConfig.lens_file_path || repoConfig.lensFilePath || null;

  return {
    repoUrl,
    branch,
    path
  };
}

/**
 * Get all repository configurations from environment and REPOS_CONFIG
 * Merges legacy single-repo env vars with multi-repo config
 * 
 * @returns {Promise<Array>} Array of normalized repo configurations
 */
async function getAllRepoConfigs() {
  const configs = [];

  // Check for multi-repo config first
  const reposConfig = process.env.REPOS_CONFIG;
  
  if (reposConfig) {
    try {
      const parsedConfigs = await parseRepoConfig(reposConfig);
      const normalized = parsedConfigs.map((config, index) => 
        normalizeRepoConfig(config, index)
      );
      configs.push(...normalized);
      console.log(`Loaded ${normalized.length} repository configurations from REPOS_CONFIG`);
    } catch (error) {
      console.error(`Error parsing REPOS_CONFIG: ${error.message}`);
      throw error;
    }
  }

  // Add legacy single-repo config if present
  const legacyRepoUrl = process.env.GIT_REPO_URL;
  
  if (legacyRepoUrl) {
    const legacyConfig = {
      repoUrl: legacyRepoUrl,
      branch: process.env.GIT_BRANCH || null,
      path: process.env.LENS_FILE_PATH || null
    };
    
    // Check if this repo is already in the multi-repo config
    const isDuplicate = configs.some(config => 
      config.repoUrl === legacyConfig.repoUrl &&
      config.branch === legacyConfig.branch &&
      config.path === legacyConfig.path
    );
    
    if (!isDuplicate) {
      configs.push(legacyConfig);
      console.log('Added legacy single-repo configuration from environment variables');
    } else {
      console.log('Legacy repo config already present in REPOS_CONFIG, skipping duplicate');
    }
  }

  if (configs.length === 0) {
    throw new Error(
      'No repository configuration found. ' +
      'Please set either REPOS_CONFIG or GIT_REPO_URL environment variable.'
    );
  }

  return configs;
}

module.exports = {
  parseRepoConfig,
  normalizeRepoConfig,
  getAllRepoConfigs
};
