require('dotenv').config();
const express = require('express');
const lensesRouter = require('./routes/lenses');
const { ensureMultipleRepos } = require('./utils/repoManager');
const { getAllRepoConfigs } = require('./utils/repoConfigParser');
const { forceUpdate, getCacheInfo } = require('./services/lensService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'lens-selector' });
});

// Cache info endpoint
app.get('/cache/info', (req, res) => {
  const cacheInfo = getCacheInfo();
  res.json(cacheInfo);
});

// Force update endpoint - clears cache and updates all repositories
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

// API routes
app.use('/lenses', lensesRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Start server and initialize repositories
app.listen(PORT, async () => {
  console.log(`Lens Selector Service running on port ${PORT}`);
  console.log('Environment configuration:');
  
  try {
    // Display configuration source
    if (process.env.REPOS_CONFIG) {
      console.log(`  REPOS_CONFIG: ${process.env.REPOS_CONFIG}`);
      console.log('  Multi-repo mode enabled');
    }
    
    if (process.env.GIT_REPO_URL) {
      console.log(`  GIT_REPO_URL: ${process.env.GIT_REPO_URL}`);
      console.log(`  GIT_BRANCH: ${process.env.GIT_BRANCH || 'not set (will use main/master)'}`);
      console.log(`  LENS_FILE_PATH: ${process.env.LENS_FILE_PATH || 'not set (will auto-discover)'}`);
    }
    
    // Display cache configuration
    const cacheInfo = getCacheInfo();
    if (cacheInfo.isInfinite) {
      console.log('\n  CACHE: INFINITE (updates disabled)');
      console.log('  Use POST /update endpoint to manually trigger updates');
    } else {
      console.log(`\n  CACHE TTL: ${cacheInfo.ttlMinutes} minutes`);
    }
    
    // Get all repository configurations
    const repoConfigs = await getAllRepoConfigs();
    
    console.log(`\nInitializing ${repoConfigs.length} repository/repositories...`);
    
    // Display each repository configuration
    repoConfigs.forEach((config, index) => {
      console.log(`\n  Repository ${index + 1}:`);
      console.log(`    URL: ${config.repoUrl}`);
      console.log(`    Branch: ${config.branch || 'default (main/master)'}`);
      console.log(`    Path: ${config.path || 'auto-discover'}`);
    });

    console.log('\nCloning/updating repositories...');
    
    // Clone or update all repositories
    const results = await ensureMultipleRepos(repoConfigs);
    
    // Display results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`\n✓ Successfully initialized ${successful.length}/${results.length} repositories`);
    
    if (failed.length > 0) {
      console.error(`\n✗ Failed to initialize ${failed.length} repositories:`);
      failed.forEach(result => {
        console.error(`  - ${result.repoUrl}: ${result.error}`);
      });
    }
    
    console.log('\nService is ready to accept requests');
    
  } catch (error) {
    console.error('\n✗ Failed to initialize repositories:', error.message);
    console.error('Service may not function correctly until configuration is fixed.');
  }
});
