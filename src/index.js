require('dotenv').config();
const express = require('express');
const lensesRouter = require('./routes/lenses');
const { ensureRepo, getRepoLocalPath } = require('./utils/repoManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'lens-selector' });
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

// Start server
app.listen(PORT, () => {
  console.log(`Lens Selector Service running on port ${PORT}`);
  console.log('Environment configuration:');
  console.log(`  GIT_REPO_URL: ${process.env.GIT_REPO_URL || 'not set'}`);
  console.log(`  GIT_BRANCH: ${process.env.GIT_BRANCH || 'not set (will use main/master)'}`);
  console.log(`  LENS_FILE_PATH: ${process.env.LENS_FILE_PATH || 'not set (will auto-discover)'}`);
  console.log(`Cloning from repository...`);
  const localPath = getRepoLocalPath(process.env.GIT_REPO_URL);
  ensureRepo(process.env.GIT_REPO_URL, process.env.GIT_BRANCH, localPath);
});
