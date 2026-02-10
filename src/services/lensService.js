const { discoverLenses } = require('../utils/lensValidator');
const { ensureRepo, ensureMultipleRepos, getRepoLocalPath, getRepoCacheKey } = require('../utils/repoManager');
const { getAllRepoConfigs } = require('../utils/repoConfigParser');
const path = require('path');
const fs = require('fs');

// Cache to store lenses with TTL
const lensCache = new Map();

// Get CACHE_TTL from environment, default to 5 minutes
// -1 means infinite cache (useful for tagged releases)
const CACHE_TTL_MINUTES = parseInt(process.env.CACHE_TTL_MINUTES || '5', 10);
const CACHE_TTL = CACHE_TTL_MINUTES === -1 ? -1 : CACHE_TTL_MINUTES * 60 * 1000;
const IS_INFINITE_CACHE = CACHE_TTL === -1;

/**
 * Get all valid lenses from a single repository
 * @param {string} repoUrl - Git repository URL
 * @param {string} branch - Branch/tag (optional)
 * @param {string} lensFilePath - Path to lens file (optional)
 * @returns {Promise<Array>} Array of valid lenses
 */
async function getLensesFromRepo(repoUrl, branch, lensFilePath) {
  if (!repoUrl) {
    throw new Error('Repository URL is required');
  }

  const cacheKey = getRepoCacheKey(repoUrl, branch, lensFilePath);

  // Check cache
  if (lensCache.has(cacheKey)) {
    const cached = lensCache.get(cacheKey);
    // If infinite cache, always return cached value
    if (IS_INFINITE_CACHE) {
      console.log(`Returning cached lenses for ${repoUrl} (infinite cache)`);
      return cached.lenses;
    }
    // Otherwise check TTL
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Returning cached lenses for ${repoUrl}`);
      return cached.lenses;
    } else {
      lensCache.delete(cacheKey);
    }
  }

  console.log(`Discovering lenses from ${repoUrl}`);

  try {
    // Step 1: Ensure repository is cloned/updated
    const localPath = getRepoLocalPath(repoUrl);
    await ensureRepo(repoUrl, branch, localPath);
    
    // Step 2: try given path first
    let lenses = [];
    if (lensFilePath) {
      // If specific path is provided, use it
      const fullPath = path.join(localPath, lensFilePath);
      if (fs.existsSync(fullPath)) {
        lenses = [fullPath];
      } else {
        console.warn(`Specified lens file not found: ${lensFilePath}, autodetecting lenses instead.`);
      }
    }

    // Step 3: EOC Auto Discover lenses
    if (lenses.length === 0) {
      lenses = await discoverLenses(localPath);
    }

    // Cache the result
    lensCache.set(cacheKey, {
      lenses,
      timestamp: Date.now()
    });

    return lenses;
  } catch (error) {
    console.error(`Error discovering lenses from ${repoUrl}:`, error);
    throw error;
  }
}

/**
 * Get all valid lenses from all configured repositories
 * Uses multi-repo configuration from REPOS_CONFIG and/or legacy env vars
 * @returns {Promise<Array>} Array of valid lenses from all repos
 */
async function getLenses() {
  try {
    // Get all repo configurations
    const repoConfigs = await getAllRepoConfigs();
    
    console.log(`Processing ${repoConfigs.length} repository configuration(s)`);

    // Process all repositories and collect lenses
    const allLenses = [];
    const errors = [];

    for (const config of repoConfigs) {
      try {
        const lenses = await getLensesFromRepo(config.repoUrl, config.branch, config.path);
        
        // Add repository metadata to each lens
        const lensesWithRepoInfo = lenses.map(lens => ({
          ...lens,
          sourceRepo: config.repoUrl,
          sourceBranch: config.branch,
          sourcePath: config.path
        }));
        
        allLenses.push(...lensesWithRepoInfo);
        console.log(`Found ${lenses.length} lens(es) from ${config.repoUrl}`);
      } catch (error) {
        console.error(`Failed to get lenses from ${config.repoUrl}:`, error.message);
        errors.push({
          repoUrl: config.repoUrl,
          error: error.message
        });
        // Continue processing other repos even if one fails
      }
    }

    if (allLenses.length === 0 && errors.length > 0) {
      throw new Error(
        `Failed to retrieve lenses from any repository. Errors: ${
          errors.map(e => `${e.repoUrl}: ${e.error}`).join('; ')
        }`
      );
    }

    return allLenses;
  } catch (error) {
    console.error('Error getting lenses:', error);
    throw error;
  }
}

/**
 * Legacy function for backward compatibility
 * Get all valid lenses from a single repository (deprecated, use getLenses() instead)
 * @deprecated Use getLenses() which supports multi-repo configuration
 * @param {string} repoUrl - Git repository URL (from env)
 * @param {string} branch - Branch/tag (from env, optional)
 * @param {string} lensFilePath - Path to lens file (from env, optional)
 * @returns {Promise<Array>} Array of valid lenses
 */
async function getLensesSingleRepo(repoUrl, branch, lensFilePath) {
  if (!repoUrl) {
    throw new Error('GIT_REPO_URL environment variable is required');
  }

  return getLensesFromRepo(repoUrl, branch, lensFilePath);
}

/**
 * Get a specific lens by name from all configured repositories
 * @param {string} lensName - Name of the lens to retrieve
 * @returns {Promise<Object>} The lens object
 */
async function getLensByName(lensName) {
  const lenses = await getLenses();

  const lens = lenses.find((l) => l.name === lensName);

  if (!lens) {
    const error = new Error(`Lens '${lensName}' not found`);
    error.statusCode = 404;
    throw error;
  }

  return lens.lens;
}

/**
 * Legacy function for backward compatibility
 * Get a specific lens by name from a single repository (deprecated)
 * @deprecated Use getLensByName(lensName) which supports multi-repo configuration
 * @param {string} repoUrl - Git repository URL (from env)
 * @param {string} branch - Branch/tag (from env, optional)
 * @param {string} lensFilePath - Path to lens file (from env, optional)
 * @param {string} lensName - Name of the lens to retrieve
 * @returns {Promise<Object>} The lens object
 */
async function getLensByNameSingleRepo(repoUrl, branch, lensFilePath, lensName) {
  const lenses = await getLensesFromRepo(repoUrl, branch, lensFilePath);

  const lens = lenses.find((l) => l.name === lensName);

  if (!lens) {
    const error = new Error(`Lens '${lensName}' not found`);
    error.statusCode = 404;
    throw error;
  }

  return lens.lens;
}

/**
 * Get list of all lens names/IDs from all configured repositories
 * @returns {Promise<Array>} Array of lens IDs
 */
async function getLensNames() {
  const lenses = await getLenses();
  return lenses.map((l) => l.name);
}

/**
 * Legacy function for backward compatibility
 * Get list of all lens names/IDs from a single repository (deprecated)
 * @deprecated Use getLensNames() which supports multi-repo configuration
 * @param {string} repoUrl - Git repository URL (from env)
 * @param {string} branch - Branch/tag (from env, optional)
 * @param {string} lensFilePath - Path to lens file (from env, optional)
 * @returns {Promise<Array>} Array of lens IDs
 */
async function getLensNamesSingleRepo(repoUrl, branch, lensFilePath) {
  const lenses = await getLensesFromRepo(repoUrl, branch, lensFilePath);
  return lenses.map((l) => l.name);
}

/**
 * Clear the lens cache
 * Useful for testing or when forcing a cache refresh
 */
function clearCache() {
  lensCache.clear();
  console.log('Lens cache cleared');
}

/**
 * Force update all repositories and clear cache
 * Useful for manual updates via API or cron jobs
 * @returns {Promise<Object>} Update results
 */
async function forceUpdate() {
  console.log('Force update triggered - clearing cache and updating repositories');
  
  // Clear cache
  clearCache();
  
  try {
    // Get all repo configurations
    const repoConfigs = await getAllRepoConfigs();
    
    console.log(`Force updating ${repoConfigs.length} repository/repositories...`);
    
    // Update all repositories
    const { ensureMultipleRepos } = require('../utils/repoManager');
    const results = await ensureMultipleRepos(repoConfigs);
    
    // Separate successful and failed updates
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    const summary = {
      timestamp: new Date().toISOString(),
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      repositories: results.map(r => ({
        repoUrl: r.repoUrl,
        branch: r.branch,
        success: r.success,
        error: r.error || null
      }))
    };
    
    console.log(`Force update completed: ${successful.length}/${results.length} repositories updated successfully`);
    
    return summary;
  } catch (error) {
    console.error('Error during force update:', error);
    throw error;
  }
}

/**
 * Get cache configuration info
 * @returns {Object} Cache configuration
 */
function getCacheInfo() {
  return {
    ttlMinutes: CACHE_TTL_MINUTES,
    isInfinite: IS_INFINITE_CACHE,
    cachedRepositories: lensCache.size
  };
}

module.exports = {
  getLenses,
  getLensesFromRepo,
  getLensesSingleRepo,
  getLensByName,
  getLensByNameSingleRepo,
  getLensNames,
  getLensNamesSingleRepo,
  clearCache,
  forceUpdate,
  getCacheInfo
};
