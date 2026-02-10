# GIT Lens Selector Service

A service that discovers and validates FHIR Lens profiles from Git repositories and exposes them via a REST API conforming to the OpenAPI specification.

Supports both single-repository and multi-repository modes, allowing aggregation of lenses from multiple Git sources.

## Features

- **Multi-Repository Support**: Configure multiple Git repositories to aggregate lenses from different sources
- **Automatic Discovery**: Recursively scans repositories for valid FHIR Lens profiles (JSON files)
- **FHIR Lens Validation**: Validates lenses against the [FHIR Lens profile](https://build.fhir.org/ig/hl7-eu/gravitate-health/StructureDefinition-lens.html)
- **JavaScript Enhancement**: If a lens is missing base64-encoded content but has an accompanying JS file with an `enhance` function, the JS content is automatically encoded and included
- **Repository Management**: Automatically clones and updates Git repositories on each API invocation to ensure latest versions
- **Caching**: Implements intelligent caching to minimize redundant operations
- **Flexible Configuration**: Support for inline JSON, local file paths, or remote URLs for multi-repo configuration
- **Docker Ready**: Includes Dockerfile for easy deployment

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
Returns all available lens IDs from all configured repositories.

**Response:**
```json
{
  "lenses": ["lens-id-1", "lens-id-2", "lens-id-3"]
}
```

### GET /lenses/{name}
Returns a complete lens by name or ID from any configured repository.

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
- Docker (for containerized deployment)
- Git

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file with one of the following configurations:

   **Single Repository Mode** (legacy, backward compatible):
   ```env
   GIT_REPO_URL=https://github.com/Gravitate-Health/pregnancy-lens.git
   GIT_BRANCH=main
   LENS_FILE_PATH=pregnancy-lens.json
   PORT=3000
   CACHE_TTL_MINUTES=5
   ```

   **Multi-Repository Mode** (recommended):
   ```env
   REPOS_CONFIG=[{"repoUrl":"https://github.com/org/repo1.git","branch":"main"},{"repoUrl":"https://github.com/org/repo2.git","branch":"develop","path":"lenses/lens.json"}]
   PORT=3000
   CACHE_TTL_MINUTES=5
   ```

   **Or using a config file**:
   ```env
   REPOS_CONFIG=/path/to/repos-config.json
   PORT=3000
   CACHE_TTL_MINUTES=5
   ```

   **Or using a remote URL**:
   ```env
   REPOS_CONFIG=https://example.com/repos-config.json
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

#### Manual Docker build

```bash
docker build -t lens-selector:latest .
docker run -e GIT_REPO_URL=https://your-repo.git \
           -e GIT_BRANCH=main \
           -p 3000:3000 \
           lens-selector:latest
```

## Configuration

### Repository Configuration Modes

The service supports two configuration modes that can be used independently or combined:

#### 1. Multi-Repository Mode (Recommended)

Use the `REPOS_CONFIG` environment variable to specify multiple repositories. This can be provided in three ways:

**Inline JSON**:
```env
REPOS_CONFIG=[{"repoUrl":"https://github.com/org/repo1.git","branch":"main"},{"repoUrl":"https://github.com/org/repo2.git"}]
```

**Local File Path**:
```env
REPOS_CONFIG=/path/to/repos-config.json
```

**Remote URL**:
```env
REPOS_CONFIG=https://example.com/repos-config.json
```

**repos-config.json structure**:
```json
[
  {
    "repoUrl": "https://github.com/org/repo1.git",
    "branch": "main",
    "path": "lens.json"
  },
  {
    "repoUrl": "https://github.com/org/repo2.git",
    "branch": "develop"
  },
  {
    "repoUrl": "https://github.com/org/repo3.git"
  }
]
```

**Configuration Fields**:
- `repoUrl` (required): Git repository URL
- `branch` (optional): Git branch or tag (defaults to main/master)
- `path` (optional): Specific path to lens file (if not set, all JSON files are auto-discovered)

#### 2. Single Repository Mode (Legacy)

Use individual environment variables for a single repository:

```env
GIT_REPO_URL=https://github.com/Gravitate-Health/pregnancy-lens.git
GIT_BRANCH=main
LENS_FILE_PATH=pregnancy-lens.json
```

#### 3. Combined Mode

Both modes can be used together. The legacy single-repo configuration will be merged with the multi-repo configuration:

```env
REPOS_CONFIG=[{"repoUrl":"https://github.com/org/repo1.git"}]
GIT_REPO_URL=https://github.com/org/repo2.git
GIT_BRANCH=develop
```

This results in managing both repo1 and repo2.

### Environment Variables

#### Repository Configuration (choose one or both)

- `REPOS_CONFIG`: Multi-repository configuration (inline JSON, file path, or URL)
- `GIT_REPO_URL`: Single repository URL (legacy mode)

#### Optional Configuration

- `GIT_BRANCH`: Git branch or tag for legacy single-repo mode (defaults to main/master)
- `LENS_FILE_PATH`: Specific path to lens file for legacy single-repo mode (if not set, all JSON files are auto-discovered)
- `PORT`: HTTP server port (defaults to 3000)
- `CACHE_TTL_MINUTES`: Cache time-to-live in minutes (defaults to 5)
- `LENS_REPOS_TEMP_DIR`: Temporary directory for cloned repositories (defaults to /tmp/lens-repos)

## Lens Discovery Logic

When no `LENS_FILE_PATH` or `path` is specified for a repository, the service:

1. **Scans all JSON files** recursively in the repository
2. **Validates each file** against the FHIR Lens profile schema
3. **For invalid lenses**: Checks if there's an accompanying JS file in the same directory with an `enhance` function
4. **Automatic Enhancement**: If found, the JS file content is encoded to base64 and added as the lens's content.data field
5. **Returns**: Only valid lenses with complete base64-encoded content

## Multi-Repository Benefits

The multi-repository mode enables several powerful use cases:

- **Centralized Lens Management**: Aggregate lenses from multiple teams or organizations
- **Version Separation**: Manage production and development lenses separately
- **Gradual Migration**: Migrate from single-repo to multi-repo gradually
- **Flexible Deployment**: Deploy one service instance for multiple lens sources
- **Independent Updates**: Each repository can be updated independently with its own cache
- **Fallback Configuration**: If one repository fails, others continue to serve lenses

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

### Configuration Issues

#### No repository configuration found
- Ensure either `REPOS_CONFIG` or `GIT_REPO_URL` is set
- Check that `REPOS_CONFIG` points to a valid file, URL, or contains valid JSON
- Verify JSON syntax if using inline configuration

#### REPOS_CONFIG parsing errors
- Validate JSON syntax using a JSON validator
- Ensure the config is an array of objects
- Check that each object has a `repoUrl` field
- Verify file paths are absolute and files exist
- Confirm URLs are accessible and return valid JSON

### Repository Issues

#### Repository not found or authentication issues
- Ensure repository URLs are correct and publicly accessible
- For private repositories, consider using SSH with credentials or HTTPS with tokens
- Check network connectivity to Git servers

#### Some repositories fail but service still works
- This is expected behavior in multi-repo mode
- Check logs to identify which repositories failed
- Lenses from successful repositories will still be available
- Fix failing repositories and restart service or wait for cache expiration

### Discovery Issues

#### No lenses discovered
- Check that repositories contain valid FHIR Lens JSON files
- Verify the structure matches the FHIR Lens profile requirements
- Check service logs for validation errors
- Ensure JSON files are not in ignored directories (e.g., node_modules)

#### Duplicate lens names across repositories
- Lens names should be unique across all repositories
- If duplicates exist, the first one found will be returned
- Consider renaming lenses or restructuring repositories

### Enhancement Issues

#### Enhance function not being found
- Ensure the JS file is in the same directory as the lens JSON
- Verify the function is named `enhance` or exported as such
- Check file permissions and readability
- Review logs for specific enhancement errors

### Performance Issues

#### Memory issues with large repositories
- The service downloads and scans entire repositories
- Consider using `path` field to target specific files
- Increase Docker memory limits if needed
- Adjust `CACHE_TTL_MINUTES` to balance freshness and performance

#### Slow startup with many repositories
- Repositories are cloned/updated in parallel
- Initial clone is slower than subsequent updates
- Consider pre-cloning repositories in container initialization
- Check network bandwidth and Git server performance

## License

MIT

## Support

For issues and questions related to FHIR Lens profile validation, refer to:
- [FHIR Lens Profile Documentation](https://build.fhir.org/ig/hl7-eu/gravitate-health/StructureDefinition-lens.html)
- [FHIR Library Resource](https://www.hl7.org/fhir/library.html)

