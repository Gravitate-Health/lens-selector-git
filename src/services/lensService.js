const { discoverLenses } = require('../utils/lensValidator');

// Cache to store lenses with TTL
const lensCache = new Map();

// Get CACHE_TTL from environment, default to 5 minutes
const CACHE_TTL = parseInt(process.env.CACHE_TTL_MINUTES || '5', 10) * 60 * 1000;

/**
 * Get all valid lenses from repository
 * Pulls latest version on each invocation
 * @param {string} repoUrl - Git repository URL (from env)
 * @param {string} branch - Branch/tag (from env, optional)
 * @param {string} lensFilePath - Path to lens file (from env, optional)
 * @returns {Promise<Array>} Array of valid lenses
 */
async function getLenses(repoUrl, branch, lensFilePath) {
  if (!repoUrl) {
    throw new Error('GIT_REPO_URL environment variable is required');
  }

  const cacheKey = `${repoUrl}:${branch}:${lensFilePath}`;

  // Check cache
  if (lensCache.has(cacheKey)) {
    const cached = lensCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('Returning cached lenses');
      return cached.lenses;
    } else {
      lensCache.delete(cacheKey);
    }
  }

  console.log(`Discovering lenses from ${repoUrl}`);

  try {
    const lenses = await discoverLenses(repoUrl, branch, lensFilePath);

    // Cache the result
    lensCache.set(cacheKey, {
      lenses,
      timestamp: Date.now()
    });

    return lenses;
  } catch (error) {
    console.error('Error discovering lenses:', error);
    throw error;
  }
}

/**
 * Get a specific lens by name
 * @param {string} repoUrl - Git repository URL (from env)
 * @param {string} branch - Branch/tag (from env, optional)
 * @param {string} lensFilePath - Path to lens file (from env, optional)
 * @param {string} lensName - Name of the lens to retrieve
 * @returns {Promise<Object>} The lens object
 */
async function getLensByName(repoUrl, branch, lensFilePath, lensName) {
  const lenses = await getLenses(repoUrl, branch, lensFilePath);

  const lens = lenses.find((l) => l.name === lensName || l.id === lensName);

  if (!lens) {
    const error = new Error(`Lens '${lensName}' not found`);
    error.statusCode = 404;
    throw error;
  }

  return lens.lens;
}

/**
 * Get list of all lens names/IDs
 * @param {string} repoUrl - Git repository URL (from env)
 * @param {string} branch - Branch/tag (from env, optional)
 * @param {string} lensFilePath - Path to lens file (from env, optional)
 * @returns {Promise<Array>} Array of lens IDs
 */
async function getLensNames(repoUrl, branch, lensFilePath) {
  const lenses = await getLenses(repoUrl, branch, lensFilePath);
  return lenses.map((l) => l.id);
}

/**
 * Clear the lens cache
 */
function clearCache() {
  lensCache.clear();
}

module.exports = {
  getLenses,
  getLensByName,
  getLensNames,
  clearCache
};
