const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

/**
 * Clone or update a git repository
 * @param {string} repoUrl - Git repository URL
 * @param {string} branch - Branch or tag name (optional, defaults to main/master)
 * @param {string} localPath - Local path to clone to
 * @returns {Promise<void>}
 */
async function ensureRepo(repoUrl, branch, localPath) {
  const git = simpleGit();

  try {
    if (fs.existsSync(localPath)) {
      // Update existing repo
      const repoGit = simpleGit(localPath);
      await repoGit.fetch('origin');
      if (branch) {
        await repoGit.checkout(branch);
      } else {
        await repoGit.checkout(['main']).catch(() => repoGit.checkout('master'));
      }
      await repoGit.pull('origin');
    } else {
      // Clone new repo
      if (branch) {
        await git.clone(repoUrl, localPath, ['--branch', branch, '--single-branch']);
      } else {
        await git.clone(repoUrl, localPath);
      }
    }
  } catch (error) {
    console.error(`Error managing repository ${repoUrl}:`, error.message);
    throw error;
  }
}

/**
 * Clone or update multiple git repositories in parallel
 * @param {Array<Object>} repoConfigs - Array of repo configurations {repoUrl, branch, path}
 * @returns {Promise<Array<Object>>} Array of results with {repoUrl, branch, localPath, success, error}
 */
async function ensureMultipleRepos(repoConfigs) {
  const results = await Promise.allSettled(
    repoConfigs.map(async (config) => {
      const localPath = getRepoLocalPath(config.repoUrl);
      await ensureRepo(config.repoUrl, config.branch, localPath);
      return {
        repoUrl: config.repoUrl,
        branch: config.branch,
        path: config.path,
        localPath,
        success: true
      };
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        repoUrl: repoConfigs[index].repoUrl,
        branch: repoConfigs[index].branch,
        path: repoConfigs[index].path,
        localPath: getRepoLocalPath(repoConfigs[index].repoUrl),
        success: false,
        error: result.reason.message
      };
    }
  });
}

/**
 * Get the local repository path for a given repo URL
 * @param {string} repoUrl - Git repository URL
 * @param {string} tempDir - Temporary directory (optional, defaults to env or /tmp/lens-repos)
 * @returns {string} Local path for the repository
 */
function getRepoLocalPath(repoUrl, tempDir) {
  const baseDir = tempDir || process.env.LENS_REPOS_TEMP_DIR || '/tmp/lens-repos';
  const repoName = repoUrl.split('/').pop().replace('.git', '');
  return path.join(baseDir, repoName);
}

/**
 * Get a unique identifier for a repository configuration
 * Used for caching
 * @param {string} repoUrl - Git repository URL
 * @param {string} branch - Branch name (optional)
 * @param {string} lensPath - Path to lens file (optional)
 * @returns {string} Unique cache key
 */
function getRepoCacheKey(repoUrl, branch, lensPath) {
  return `${repoUrl}:${branch || ''}:${lensPath || ''}`;
}

module.exports = {
  ensureRepo,
  ensureMultipleRepos,
  getRepoLocalPath,
  getRepoCacheKey
};