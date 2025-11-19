# GIT Lens Selector Service

A service that discovers and validates FHIR Lens profiles from Git repositories and exposes them via a REST API conforming to the OpenAPI specification.

## Features

- **Automatic Discovery**: Recursively scans repositories for valid FHIR Lens profiles (JSON files)
- **FHIR Lens Validation**: Validates lenses against the [FHIR Lens profile](https://build.fhir.org/ig/hl7-eu/gravitate-health/StructureDefinition-lens.html)
- **JavaScript Enhancement**: If a lens is missing base64-encoded content but has an accompanying JS file with an `enhance` function, the JS content is automatically encoded and included
- **Repository Management**: Automatically clones and updates Git repositories on each API invocation to ensure latest versions
- **Caching**: Implements intelligent caching to minimize redundant operations
- **Docker Ready**: Includes Dockerfile and docker-compose configuration for easy deployment

## API Endpoints

All endpoints conform to the OpenAPI specification in `openapi.yaml`.

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "lens-selector"
}
```

### GET /lenses
Returns all available lens IDs.

**Response:**
```json
{
  "lenses": ["lens-id-1", "lens-id-2", "lens-id-3"]
}
```

### GET /lenses/{name}
Returns a complete lens by name or ID.

**Parameters:**
- `name` (path, required): The lens ID or name

**Response:** (Full FHIR Library resource as JSON)
```json
{
  "resourceType": "Library",
  "id": "pregnancy-lens",
  "url": "http://hl7.eu/fhir/ig/gravitate-health/Library/pregnancy-lens",
  "name": "pregnancy-lens",
  "title": "Pregnancy Lens",
  "status": "draft",
  "version": "1.0.0",
  "date": "2024-06-12T12:23:10.005Z",
  "content": [
    {
      "data": "base64_encoded_content..."
    }
  ]
}
```

## Installation

### Prerequisites
- Node.js 18+ (for local development)
- Docker & Docker Compose (for containerized deployment)
- Git

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file (see `.env.example`):
   ```env
   GIT_REPO_URL=https://github.com/Gravitate-Health/pregnancy-lens.git
   GIT_BRANCH=main
   LENS_FILE_PATH=pregnancy-lens.json
   PORT=3000
   CACHE_TTL_MINUTES=5
   ```

4. Start the service:
   ```bash
   npm start
   ```

   Or with auto-reload:
   ```bash
   npm run dev
   ```

### Docker Deployment

#### Using docker-compose (Recommended)

1. Create `.env` file with required variables
2. Build and run:
   ```bash
   docker-compose up
   ```

#### Manual Docker build

```bash
docker build -t lens-selector:latest .
docker run -e GIT_REPO_URL=https://your-repo.git \
           -e GIT_BRANCH=main \
           -p 3000:3000 \
           lens-selector:latest
```

## Configuration

See `.env.example` for all available environment variables.

### Required Environment Variables

- `GIT_REPO_URL`: Git repository URL where lenses are stored

### Optional Environment Variables

- `GIT_BRANCH`: Git branch or tag to use (defaults to main/master)
- `LENS_FILE_PATH`: Specific path to lens file within repo (if not set, all JSON files are auto-discovered)
- `PORT`: HTTP server port (defaults to 3000)
- `CACHE_TTL_MINUTES`: Cache time-to-live in minutes (defaults to 5)

## Lens Discovery Logic

When no `LENS_FILE_PATH` is specified, the service:

1. **Scans all JSON files** recursively in the repository
2. **Validates each file** against the FHIR Lens profile schema
3. **For invalid lenses**: Checks if there's an accompanying JS file in the same directory with an `enhance` function
4. **Automatic Enhancement**: If found, the JS file content is encoded to base64 and added as the lens's content.data field
5. **Returns**: Only valid lenses with complete base64-encoded content

## FHIR Lens Profile Validation

A valid lens must contain:

- `resourceType`: "Library" (required)
- `id`: Unique identifier (required)
- `url`: Canonical URL (required)
- `name`: Human-readable name (required)
- `status`: Publication status (required)
- `content`: Array with at least one item containing base64-encoded `data` field (required)

## Cache Behavior

The service maintains an in-memory cache of discovered lenses with a configurable TTL (Time To Live). By default, the cache is set to 5 minutes, which balances performance with data freshness. You can configure this via the `CACHE_TTL_MINUTES` environment variable.

**Cache TTL**: Configurable via `CACHE_TTL_MINUTES` environment variable (default: 5 minutes)
- Shorter TTL = more frequent repository updates, higher load
- Longer TTL = better performance, potentially stale data

The cache is automatically invalidated based on the repository URL, branch, and lens file path.

To clear the cache programmatically, restart the service.

## Project Structure

```
lens-selector/
├── src/
│   ├── index.js              # Express app entry point
│   ├── routes/
│   │   └── lenses.js         # API route handlers
│   ├── services/
│   │   └── lensService.js    # Business logic and caching
│   └── utils/
│       └── lensValidator.js  # FHIR Lens validation and discovery
├── __tests__/
│   ├── lensValidator.test.js # Validator unit tests
│   ├── lensService.test.js   # Service layer tests
│   └── lenses.routes.test.js # API route tests
├── Dockerfile                # Container image definition
├── docker-compose.yml        # Multi-container orchestration
├── package.json              # Node.js dependencies
├── jest.config.js            # Jest test configuration
├── openapi.yaml              # OpenAPI specification
├── .env.example              # Environment variable template
├── README.md                 # This file
└── TESTING.md                # Testing documentation
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test -- __tests__/lensValidator.test.js
```

For detailed testing documentation, see [TESTING.md](TESTING.md).

**Test Suite Includes:**
- FHIR Lens validation tests
- Service layer caching tests
- API route tests
- Integration tests with pregnancy-lens repository

### Building Docker Image

```bash
docker build -t lens-selector:1.0.0 .
```

### Tagging for Registry

```bash
docker tag lens-selector:1.0.0 your-registry/lens-selector:1.0.0
docker push your-registry/lens-selector:1.0.0
```

## Troubleshooting

### Repository not found or authentication issues
- Ensure `GIT_REPO_URL` is correct and publicly accessible
- For private repositories, consider using SSH or HTTPS with credentials

### No lenses discovered
- Check that the repository actually contains valid FHIR Lens JSON files
- Verify the structure matches the FHIR Lens profile requirements
- Check service logs for validation errors

### Enhance function not being found
- Ensure the JS file is in the same directory as the lens JSON
- Verify the function is named `enhance` or exported as such
- Check file permissions and readability

### Memory issues with large repositories
- The service downloads and scans the entire repository
- Consider using `LENS_FILE_PATH` to target specific files
- Increase Docker memory limits if needed

## License

MIT

## Support

For issues and questions related to FHIR Lens profile validation, refer to:
- [FHIR Lens Profile Documentation](https://build.fhir.org/ig/hl7-eu/gravitate-health/StructureDefinition-lens.html)
- [FHIR Library Resource](https://www.hl7.org/fhir/library.html)

---

**Project**: Gravitate Health  
**Component**: Lens Selector Service  
**Version**: 1.0.0
