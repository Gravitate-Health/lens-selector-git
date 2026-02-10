const express = require('express');
const { getLenses, getLensByName, getLensNames } = require('../services/lensService');

const router = express.Router();

/**
 * GET /lenses
 * Returns all lens IDs from all configured repositories
 */
router.get('/', async (req, res) => {
  try {
    const lensNames = await getLensNames();

    res.json({
      lenses: lensNames
    });
  } catch (error) {
    console.error('Error fetching lenses:', error);
    res.status(500).json({
      error: 'Failed to fetch lenses',
      message: error.message
    });
  }
});

/**
 * GET /lenses/:name
 * Returns a specific lens from any configured repository
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const lens = await getLensByName(name);

    res.json(lens);
  } catch (error) {
    console.error('Error fetching lens:', error);

    if (error.statusCode === 404) {
      res.status(404).json({
        error: 'Lens not found',
        message: error.message
      });
    } else {
      res.status(500).json({
        error: 'Failed to fetch lens',
        message: error.message
      });
    }
  }
});

module.exports = router;
