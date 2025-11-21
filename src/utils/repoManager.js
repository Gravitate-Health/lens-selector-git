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

module.exports = {
  ensureRepo,
  getRepoLocalPath
};