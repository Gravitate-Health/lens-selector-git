# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         External Systems                         │
│                                                                   │
│  ┌──────────────────┐        ┌──────────────────┐               │
│  │   Git Repository │        │   Client Apps    │               │
│  │   (Lenses)       │        │   (Web, Mobile)  │               │
│  │   - Repo 1       │        └────────┬─────────┘               │
│  │   - Repo 2       │                 │                          │
│  │   - Repo N       │                 │                          │
│  └────────┬─────────┘                 │                          │
│           │                           │                          │
└───────────┼───────────────────────────┼──────────────────────────┘
            │                           │
            │ Clone/Pull                │ HTTP/REST
            │ (Parallel)                │
            │                           │
┌───────────┼───────────────────────────┼──────────────────────────┐
│           ▼                           ▼                          │
│  ┌─────────────────────────────────────────────────┐            │
│  │     Lens Selector Service (Node.js/Express)    │            │
│  │          Multi-Repository Support               │            │
│  │                                                 │            │
│  │  ┌─────────────────────────────────────────┐   │            │
│  │  │         Express Routes                  │   │            │
│  │  │  - GET /health                          │   │            │
│  │  │  - GET /cache/info                      │   │            │
│  │  │  - POST /update (force refresh)         │   │            │
│  │  │  - GET /lenses (all repos)              │   │            │
│  │  │  - GET /lenses/{name} (any repo)        │   │            │
│  │  └──────────────┬──────────────────────────┘   │            │
│  │                 │                               │            │
│  │  ┌──────────────▼──────────────────────────┐   │            │
│  │  │   Lens Service                          │   │            │
│  │  │  - getLenses() (multi-repo)             │   │            │
│  │  │  - getLensesFromRepo() (single)         │   │            │
│  │  │  - getLensByName() (search all)         │   │            │
│  │  │  - Cache Management (per repo)          │   │            │
│  │  └──────────────┬──────────────────────────┘   │            │
│  │                 │                               │            │
│  │  ┌──────────────▼──────────────────────────┐   │            │
│  │  │   Repo Config Parser                    │   │            │
│  │  │  - parseRepoConfig()                    │   │            │
│  │  │  - getAllRepoConfigs()                  │   │            │
│  │  │  - Supports: JSON/File/URL              │   │            │
│  │  └──────────────┬──────────────────────────┘   │            │
│  │                 │                               │            │
│  │  ┌──────────────▼──────────────────────────┐   │            │
│  │  │   Repo Manager                          │   │            │
│  │  │  - ensureMultipleRepos()                │   │            │
│  │  │  - ensureRepo() (per repo)              │   │            │
│  │  │  - getRepoCacheKey()                    │   │            │
│  │  └──────────────┬──────────────────────────┘   │            │
│  │                 │                               │            │
│  │  ┌──────────────▼──────────────────────────┐   │            │
│  │  │   Lens Validator                        │   │            │
│  │  │  - validateFHIRLens()                   │   │            │
│  │  │  - discoverLenses()                     │   │            │
│  │  │  - findJsonFiles()                      │   │            │
│  │  │  - findEnhanceFiles()                   │   │            │
│  │  │  - jsToBase64()                         │   │            │
│  │  └──────────────┬──────────────────────────┘   │            │
│  │                 │                               │            │
│  └─────────────────┼───────────────────────────────┘            │
│                    │                                             │
│     ┌──────────────┼───────────────────────────┐                │
│     │              │                           │                │
│     ▼              ▼                           ▼                │
│  ┌────────────────────────┐  ┌──────────────────────────┐      │
│  │  File System           │  │  Environment Variables   │      │
│  │  /tmp/lens-repos/      │  │  - REPOS_CONFIG          │      │
│  │  ├─ repo1/             │  │  - GIT_REPO_URL (legacy) │      │
│  │  ├─ repo2/             │  │  - GIT_BRANCH (legacy)   │      │
│  │  └─ repoN/             │  │  - LENS_FILE_PATH        │      │
│  │  (Git clones)          │  │  - PORT                  │      │
│  └────────────────────────┘  └──────────────────────────┘      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  In-Memory Cache (Per Repository)                        │  │
│  │  Map: {repoUrl:branch:path => {lenses, timestamp}}       │  │
│  │  TTL: 5 minutes (configurable)                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow: Discover Lenses (Multi-Repo Mode)

```
Client Request
      │
      ▼
GET /lenses or /lenses/:name
      │
      ▼
lensService.getLenses() or getLensByName()
      │
      ▼
getAllRepoConfigs()
  ├─► Parse REPOS_CONFIG (if set)
  │   ├─► Inline JSON?
  │   ├─► File path? ─► Read from disk
  │   └─► URL? ─► Fetch from remote
  │
  ├─► Parse legacy env vars (if set)
  │   └─► GIT_REPO_URL, GIT_BRANCH, LENS_FILE_PATH
  │
  └─► Merge and deduplicate
      │
      ▼
For each repository config:
      │
      ▼
  getLensesFromRepo(repoUrl, branch, path)
      │
      ▼
  Check Cache ─────────────► Hit ──────────► Return Cached
      │                                      Lenses for this repo
      │ Miss
      │
      ▼
  ensureRepo(repoUrl, branch, localPath)
    ├─► Check if repo exists locally
    ├─► If not: git clone
    └─► If yes: git fetch + git pull
      │
      ▼
  If LENS_FILE_PATH specified:
    └─► Use specific file path
      │
      ▼
  If NOT specified:
    └─► findJsonFiles() ─► Recursively scan directory
      │
      ▼
  For each JSON file:
    │
    ├─► Parse JSON
    │
    ├─► validateFHIRLens(jsonData)
    │   │
    │   ├─► Valid? ──► Add to results
    │   │
    │   └─► Invalid?
    │       │
    │       ├─► Check if missing only base64 content
    │       │
    │       ├─► If yes: findEnhanceFiles()
    │       │   │
    │       │   └─► Found JS with enhance function?
    │       │       │
    │       │       ├─► Yes: jsToBase64() ─► Add content
    │       │       │   │
    │       │       │   └─► Revalidate ─► Add to results
    │       │       │
    │       │       └─► No: Skip file
    │       │
    │       └─► Log error & skip
    │
    └─► Continue next file
      │
      ▼
  Add repository metadata to lenses
    (sourceRepo, sourceBranch, sourcePath)
      │
      ▼
  Store in Cache (per repo)
      │
      ▼
  Return lenses for this repo
      │
      ▼
Aggregate lenses from all repos
      │
      ▼
Return combined lens list or specific lens
      │
      ▼
JSON Response
```

## Container Architecture

```
┌────────────────────────────────────────────┐
│        Docker Container                    │
│  lens-selector:latest                      │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  node:18-alpine                      │  │
│  │  ┌────────────────────────────────┐  │  │
│  │  │  npm (Package Manager)         │  │  │
│  │  │  ┌──────────────────────────┐  │  │  │
│  │  │  │  node_modules/           │  │  │  │
│  │  │  │  - express               │  │  │  │
│  │  │  │  - axios                 │  │  │  │
│  │  │  │  - simple-git            │  │  │  │
│  │  │  │  - dotenv                │  │  │  │
│  │  │  └──────────────────────────┘  │  │  │
│  │  │  ┌──────────────────────────┐  │  │  │
│  │  │  │  /app/                   │  │  │  │
│  │  │  │  ├── src/                │  │  │  │
│  │  │  │  ├── package.json        │  │  │  │
│  │  │  └──────────────────────────┘  │  │  │
│  │  └────────────────────────────────┘  │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  Port 3000 (Exposed)                 │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  Volumes                             │  │
│  │  /tmp/lens-repos  (mounted)          │  │
│  └──────────────────────────────────────┘  │
│                                            │
└────────────────────────────────────────────┘
         │
         │ Port 3000
         │
      Host Machine
```

## FHIR Lens Validation Flow

```
Input: JSON Object
      │
      ▼
Check resourceType === "Library"
      │
      ├─► No ──────► Error: "resourceType must be Library"
      │
      └─► Yes
      │
      ▼
Check id exists (string)
      │
      ├─► No ──────► Error: "id is required"
      │
      └─► Yes
      │
      ▼
Check url exists (string)
      │
      ├─► No ──────► Error: "url is required"
      │
      └─► Yes
      │
      ▼
Check name exists (string)
      │
      ├─► No ──────► Error: "name is required"
      │
      └─► Yes
      │
      ▼
Check status exists (string)
      │
      ├─► No ──────► Error: "status is required"
      │
      └─► Yes
      │
      ▼
Check content is array
      │
      ├─► No ──────► Error: "content must be array"
      │
      └─► Yes
      │
      ▼
Find item with data.base64
      │
      ├─► Not found ──────► Error: "missing base64 content"
      │
      └─► Found
      │
      ▼
Return: { isValid: true, errors: [] }
```

## Deployment Topology

### Local Development
```
Developer Machine
├── npm start
└── localhost:3000
```

### Kubernetes
```
Kubernetes Cluster
├── Deployment
│   ├── Replicas: 2+
│   ├── Pod
│   │   └── Container: lens-selector
│   │       ├── Image: lens-selector:latest
│   │       ├── Port: 3000
│   │       └── Env: ConfigMap
│   └── Pod
│       └── Container: lens-selector
├── Service
│   ├── Type: LoadBalancer
│   ├── Port: 80
│   └── TargetPort: 3000
└── ConfigMap
    ├── git-repo-url
    ├── git-branch
    └── lens-file-path
```

## File Access Pattern

```
Client Request
      │
      ▼
Service receives request
      │
      ▼
Access .env (environment variables)
      │
      ▼
Create git operation context
      │
      ▼
Access /tmp/lens-repos/ (repository cache)
      │
      ├─► Repo exists?
      │   ├─► No: Clone from GIT_REPO_URL
      │   └─► Yes: Fetch & pull latest
      │
      ▼
Read repository files
      │
      ├─► *.json files (lens profiles)
      │   └─► Parse & validate
      │
      └─► *.js files (enhancement)
          └─► Check for enhance function
      │
      ▼
Read content as binary
      │
      ▼
Encode to base64
      │
      ▼
Store in memory cache
      │
      ▼
Return to client
```

## Cache Lifecycle

```
Request arrives
      │
      ▼
Generate cache key: "repo:branch:path" (per repository)
      │
      ▼
Look up in memory cache
      │
      ├─► Not in cache?
      │   │
      │   ├─► Discover lenses for this repo
      │   │
      │   ├─► Store in cache with repo key
      │   │
      │   ├─► Record timestamp
      │   │
      │   └─► Return lenses
      │
      └─► In cache?
          │
          ├─► Infinite cache mode (TTL = -1)?
          │   │
          │   ├─► Yes: Always return cached (never expires)
          │   │
          │   └─► No: Check age < TTL (default 5 minutes)?
          │       │
          │       ├─► Yes: Return cached lenses
          │       │
          │       └─► No: Remove from cache
          │           │
          │           └─► Discover lenses (start over)
          │
          └─► Return lenses
      │
      ▼
Aggregate across all repos (if multi-repo mode)
      │
      ▼
Serve response
```

## Manual Update Flow (POST /update)

```
POST /update request
      │
      ▼
forceUpdate() service method
      │
      ├─► Clear all cache entries
      │
      ├─► Get all repo configurations
      │
      ├─► Call ensureMultipleRepos()
      │   │
      │   └─► For each repository:
      │       ├─► git fetch origin
      │       ├─► git checkout <branch/tag>
      │       └─► git pull origin
      │
      ├─► Collect results (success/failure per repo)
      │
      └─► Return summary
          │
          ├─► timestamp
          ├─► total repositories
          ├─► successful count
          ├─► failed count
          └─► detailed results per repo
      │
      ▼
JSON response to client
```

## Configuration Modes

### Mode 1: Single Repository (Legacy)
```
Environment Variables:
├── GIT_REPO_URL=https://github.com/org/repo.git
├── GIT_BRANCH=main
└── LENS_FILE_PATH=lens.json

Behavior:
└── Manages one repository
```

### Mode 2: Multi-Repository
```
Environment Variable:
└── REPOS_CONFIG=[{...}, {...}]
    │
    ├── Inline JSON
    ├── File path: /path/to/config.json
    └── Remote URL: https://example.com/config.json

Behavior:
└── Manages multiple repositories
    ├── Parallel cloning/updating
    ├── Aggregated lens discovery
    └── Independent caching per repo
```

### Mode 3: Combined (Legacy + Multi-Repo)
```
Environment Variables:
├── REPOS_CONFIG=[{...}]
├── GIT_REPO_URL=https://github.com/org/legacy.git
└── GIT_BRANCH=main

Behavior:
└── Merges both configurations
    ├── Processes all repos from REPOS_CONFIG
    ├── Adds legacy repo if not duplicate
    └── Returns aggregated lenses
```

---

This architecture ensures:
- ✅ Automatic repository updates
- ✅ Efficient caching for performance
- ✅ Flexible deployment options
- ✅ Scalable container orchestration
- ✅ Clear separation of concerns
