# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         External Systems                         │
│                                                                   │
│  ┌──────────────────┐        ┌──────────────────┐               │
│  │   Git Repository │        │   Client Apps    │               │
│  │   (Lenses)       │        │   (Web, Mobile)  │               │
│  └────────┬─────────┘        └────────┬─────────┘               │
│           │                           │                          │
└───────────┼───────────────────────────┼──────────────────────────┘
            │                           │
            │ Clone/Pull                │ HTTP/REST
            │                           │
┌───────────┼───────────────────────────┼──────────────────────────┐
│           ▼                           ▼                          │
│  ┌─────────────────────────────────────────────────┐            │
│  │     Lens Selector Service (Node.js/Express)    │            │
│  │                                                 │            │
│  │  ┌─────────────────────────────────────────┐   │            │
│  │  │         Express Routes                  │   │            │
│  │  │  - GET /health                          │   │            │
│  │  │  - GET /lenses                          │   │            │
│  │  │  - GET /lenses/{name}                   │   │            │
│  │  └──────────────┬──────────────────────────┘   │            │
│  │                 │                               │            │
│  │  ┌──────────────▼──────────────────────────┐   │            │
│  │  │   Lens Service                          │   │            │
│  │  │  - getLenses()                          │   │            │
│  │  │  - getLensByName()                      │   │            │
│  │  │  - Cache Management (5 min TTL)         │   │            │
│  │  └──────────────┬──────────────────────────┘   │            │
│  │                 │                               │            │
│  │  ┌──────────────▼──────────────────────────┐   │            │
│  │  │   Lens Validator                        │   │            │
│  │  │  - validateFHIRLens()                   │   │            │
│  │  │  - discoverLenses()                     │   │            │
│  │  │  - findJsonFiles()                      │   │            │
│  │  │  - findEnhanceFiles()                   │   │            │
│  │  │  - jsToBase64()                         │   │            │
│  │  │  - ensureRepo()                         │   │            │
│  │  └──────────────┬──────────────────────────┘   │            │
│  │                 │                               │            │
│  └─────────────────┼───────────────────────────────┘            │
│                    │                                             │
│     ┌──────────────┼───────────────────────────┐                │
│     │              │                           │                │
│     ▼              ▼                           ▼                │
│  ┌────────────────────────┐  ┌──────────────────────────┐      │
│  │  File System           │  │  Environment Variables   │      │
│  │  /tmp/lens-repos/      │  │  - GIT_REPO_URL          │      │
│  │  (Git clones)          │  │  - GIT_BRANCH            │      │
│  │  (Cache)               │  │  - LENS_FILE_PATH        │      │
│  │                        │  │  - PORT                  │      │
│  └────────────────────────┘  └──────────────────────────┘      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  In-Memory Cache                                          │  │
│  │  Map: {repoUrl:branch:path => {lenses, timestamp}}       │  │
│  │  TTL: 5 minutes                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow: Discover Lenses

```
Client Request
      │
      ▼
GET /lenses
      │
      ▼
lensService.getLensNames()
      │
      ▼
Check Cache ─────────────► Hit ──────────► Return Cached
      │                                    Lens Names
      │ Miss                               
      │
      ▼
lensService.getLenses()
      │
      ▼
Call discoverLenses()
      │
      ▼
ensureRepo()
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
Return valid lenses array
      │
      ▼
Store in Cache
      │
      ▼
Return Lens Names
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

### Docker Compose
```
docker-compose.yml
├── lens-selector (service)
│   ├── Port: 3000 -> 3000
│   ├── Volume: lens-repos
│   └── Network: lens-network
└── Data volumes
    └── lens-repos (named)
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
Generate cache key: "repo:branch:path"
      │
      ▼
Look up in memory cache
      │
      ├─► Not in cache?
      │   │
      │   ├─► Discover lenses
      │   │
      │   ├─► Store in cache
      │   │
      │   ├─► Record timestamp
      │   │
      │   └─► Return lenses
      │
      └─► In cache?
          │
          ├─► Check age < 5 minutes?
          │   │
          │   ├─► Yes: Return cached lenses
          │   │
          │   └─► No: Remove from cache
          │       │
          │       └─► Discover lenses (start over)
          │
          └─► Return lenses
      │
      ▼
Serve response
```

---

This architecture ensures:
- ✅ Automatic repository updates
- ✅ Efficient caching for performance
- ✅ Flexible deployment options
- ✅ Scalable container orchestration
- ✅ Clear separation of concerns
