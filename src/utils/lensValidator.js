const fs = require('fs');
const path = require('path');

/**
 * FHIR Lens JSON Schema (simplified validation)
 * Based on: https://build.fhir.org/ig/hl7-eu/gravitate-health/StructureDefinition-lens.html
 */
const FHIR_LENS_SCHEMA = {
  type: 'object',
  properties: {
    resourceType: { type: 'string', enum: ['Library'] },
    id: { type: 'string' },
    url: { type: 'string' },
    name: { type: 'string' },
    status: { type: 'string' },
    content: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          data: { type: 'string' } // base64 encoded
        }
      }
    }
  },
  required: ['resourceType', 'id', 'url', 'name', 'status', 'content']
};

/**
 * Validates if a JSON object conforms to FHIR Lens profile
 * @param {Object} lens - The lens object to validate
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
function validateFHIRLens(lens) {
  const errors = [];

  if (!lens || typeof lens !== 'object') {
    return { isValid: false, errors: ['Lens must be a JSON object'] };
  }

  if (lens.resourceType !== 'Library') {
    errors.push('resourceType must be "Library"');
  }

  if (!lens.url || typeof lens.url !== 'string') {
    errors.push('url is required and must be a string');
  }

  if (!lens.name || typeof lens.name !== 'string') {
    errors.push('name is required and must be a string');
  }

  if (!lens.status || typeof lens.status !== 'string') {
    errors.push('status is required and must be a string');
  }

  if (!Array.isArray(lens.content)) {
    errors.push('content must be an array');
  } else {
    let hasBase64Content = false;
    for (const item of lens.content) {
      if (item.data && typeof item.data === 'string') {
        hasBase64Content = true;
        break;
      }
    }
    if (!hasBase64Content) {
      errors.push('content must include at least one item with base64 encoded data');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Recursively find all JSON files in a directory
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of file paths
 */
function findJsonFiles(dir) {
  const jsonFiles = [];

  function traverse(currentDir) {
    const files = fs.readdirSync(currentDir);

    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        traverse(filePath);
      } else if (path.extname(file) === '.json') {
        jsonFiles.push(filePath);
      }
    }
  }

  traverse(dir);
  return jsonFiles;
}

/**
 * Find JavaScript files with an enhance function
 * @param {string} dir - Directory to search
 * @returns {Object} Map of dir path to js file path
 */
function findEnhanceFiles(dir) {
  const enhanceFiles = {};

  function traverse(currentDir) {
    const files = fs.readdirSync(currentDir);

    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        traverse(filePath);
      } else if (path.extname(file) === '.js') {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.includes('function\s+enhance') 
            || content.includes('const\s+enhance') 
            || content.includes('export.*enhance')
            || content.includes('let\s+enhance\s+=.*()')) {
            enhanceFiles[path.dirname(filePath)] = filePath;
          }
        } catch (e) {
          // Skip files that can't be read
        }
      }
    }
  }

  traverse(dir);
  return enhanceFiles;
}

/**
 * Convert JavaScript file content to base64
 * @param {string} filePath - Path to the JS file
 * @returns {string} Base64 encoded content
 */
function jsToBase64(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return Buffer.from(content).toString('base64');
}

function isLensMissingBase64Content(jsonData) {
  // Determine if the lens is missing base64 content and needs enhancement.
  // Cases:
  // - content is missing or not an array
  // - content is an empty array
  // - content has length === 1 and the single item has missing/empty data
  // - content has multiple items but none have a non-empty string `data`
  if (!jsonData.content || !Array.isArray(jsonData.content) || jsonData.content.length === 0) {
    return true;
  }

  if (jsonData.content.length === 1) {
    const item = jsonData.content[0];
    if (!item || typeof item.data !== 'string' || item.data.length === 0) {
      return true;
    }
    return false;
  }

  // length > 1: check if any item has non-empty string data
  const hasAnyData = jsonData.content.some(c => c && typeof c.data === 'string' && c.data.length > 0);
  return !hasAnyData;
}


/**
 * Discover and validate lenses from a folder
 * @param {string} lensFilePath - path to folder with lenses
 * @returns {Promise<Array>} Array of valid lenses with metadata
 */
async function discoverLenses(lensFilePath) {

  try {
    let lensFiles = [];
    let enhanceFiles = {};

    lensFiles = findJsonFiles(lensFilePath);
    enhanceFiles = findEnhanceFiles(lensFilePath);

    const validLenses = [];

    for (const filePath of lensFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(content);

        const validation = validateFHIRLens(jsonData);

        if (validation.isValid) {
          console.log(`Valid lens found: ${jsonData.id} in file ${filePath}`);
          // Lens is valid
          validLenses.push({
            id: jsonData.id,
            name: jsonData.name,
            url: jsonData.url,
            version: jsonData.version || 'unknown',
            status: jsonData.status,
            path: filePath,
            hasBase64: true,
            lens: jsonData
          });
        } else if ((validation.errors.length===1 && validation.errors[0].includes("content")) && isLensMissingBase64Content(jsonData)) {

          const fileDir = path.dirname(filePath);
          const enhanceFile = enhanceFiles[fileDir];

          console.debug(`Lens ${jsonData.id} is missing base64 content. Looking for enhance JS in ${fileDir}`);

          if (enhanceFile) {
            console.log(`Enhancing lens ${jsonData.id} with JS file ${enhanceFile}`);
            try {
              const base64Content = jsToBase64(enhanceFile);
              jsonData.content = jsonData.content || [];
              if (jsonData.content.length === 0) {
                jsonData.content.push({});
              }
              jsonData.content[0].data = base64Content;

              const revalidation = validateFHIRLens(jsonData);
              if (revalidation.isValid) {
                validLenses.push({
                  id: jsonData.id,
                  name: jsonData.name,
                  url: jsonData.url,
                  version: jsonData.version || 'unknown',
                  status: jsonData.status,
                  path: filePath,
                  hasBase64: true,
                  enhancedWithJs: enhanceFile,
                  lens: jsonData
                });
              }
            } catch (jsError) {
              console.debug(`Failed to enhance lens with JS: ${jsError.message}`);
            }
          }
        } else {
          console.debug(`Invalid lens in file ${filePath}: ${validation.errors.join('; ')}`);
        }
      } catch (error) {
        console.debug(`Error processing file ${filePath}: ${error.message}`);
      }
    }

    return validLenses;
  } catch (error) {
    console.error(`Error discovering lenses:`, error.message);
    throw error;
  }
}

module.exports = {
  validateFHIRLens,
  discoverLenses,
  findJsonFiles,
  findEnhanceFiles,
  jsToBase64
};
