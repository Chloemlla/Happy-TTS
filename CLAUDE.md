# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Rules

### Git Commit Workflow

- **IMPORTANT**: After completing code changes, immediately create a git commit and push automatically (use `git push --force` if necessary)
- Commit message format: `type: brief description` (e.g., `fix:`, `feat:`, `refactor:`, `chore:`)
- If fixing GitHub issues/alerts, reference them in commit message (e.g., `fix: resolve memory leak #460 #461`)

## Project Overview

Synapse is a comprehensive full-stack web application platform centered around text-to-speech functionality, with extensive user authentication, security features, resource management, and data analytics capabilities. The platform uses a frontend-backend separation architecture with 42 route modules, 50+ service modules, and 100+ React components.

## Development Commands

### Development
```bash
npm run dev                 # Start backend + frontend concurrently
npm run dev:backend         # Backend only (nodemon + ts-node, port 3000)
npm run dev:frontend        # Frontend only (Vite HMR, port 3001)
npm run dev:docs            # Docusaurus docs (port 3002)
npm run dev:file            # File storage mode (no MongoDB required)
```

### Building
```bash
npm run build               # Full build: backend (with obfuscation) + frontend + docs
npm run build:simple        # Simplified build (faster, less optimization)
npm run build:minimal       # Minimal build (fastest)
npm run build:backend       # Backend: TypeScript compile + code obfuscation
npm run build:backend:clean # Clean build (removes dist/ first)
```

### Testing
```bash
npm run test                # Run all Jest tests
npm run test:coverage       # Generate coverage report
npm run test:auth           # Test authentication module only
npm run test:ci             # CI environment tests (runInBand)
npm run test:verbose        # Detailed test output
```

### API Documentation
```bash
npm run generate:openapi    # Generate openapi.json from route comments
npm run check:api-docs      # Verify API documentation completeness
```

### Analysis
```bash
npm run analyze:bundle      # Backend bundle size analysis
npm run analyze:frontend    # Frontend bundle analysis
npm run check:unused-deps   # Check for unused dependencies
```

## Architecture

### Request Flow & Security Layers

All requests pass through multiple security layers in this order:
```
Request → IP Ban Check → WAF → Rate Limiting → CORS → JWT Auth → Business Logic
                                                           ↓
                                                  Tamper Detection / Replay Protection
```

**Critical**: Each layer is independently configurable. The WAF can be disabled with `WAF_ENABLED=false` in production if needed, but this is not recommended.

### Storage Architecture

The application supports three storage modes controlled by `USER_STORAGE_MODE` environment variable:

1. **MongoDB** (`USER_STORAGE_MODE=mongo`): Default, requires `MONGO_URI`
2. **MySQL** (`USER_STORAGE_MODE=mysql`): Requires MySQL connection config
3. **File** (`USER_STORAGE_MODE=file`): JSON file storage in `data/` directory, no database required

**Important**: Storage mode affects user data, but some features (IP bans, audit logs, resources) may still require MongoDB. The IP ban system uses Redis if `REDIS_URL` is configured, otherwise falls back to MongoDB.

### Application Entry Point

`src/app.ts` is the main entry point where:
- Timezone is hardcoded to `Asia/Shanghai` (line 2)
- All 42 route modules are imported and registered
- All 37 rate limiters are applied to their respective routes
- Middleware stack is configured in specific order
- MongoDB/Redis connections are initialized
- WebSocket server is set up
- Swagger/OpenAPI documentation is served at `/api-docs`

### Configuration System

Configuration is centralized in `src/config/config.ts`:
- **Production requirements**: `ADMIN_PASSWORD` and `JWT_SECRET` must be set, or the app will throw errors on startup
- **Default values**: Development has defaults, but production enforces explicit configuration
- **Storage mode**: Determined by `USER_STORAGE_MODE` env var
- **IP ban storage**: Automatically uses Redis if `REDIS_URL` is set, otherwise MongoDB

### Route & Controller Pattern

Routes follow a consistent pattern:
1. Route file in `src/routes/` defines HTTP methods and paths
2. Controller in `src/controllers/` handles request/response logic
3. Service in `src/services/` implements business logic
4. Model in `src/models/` defines Mongoose schemas (if database is used)
5. Rate limiter from `src/middleware/routeLimiters.ts` is applied in `app.ts`

**Example**: For TTS functionality:
- Route: `src/routes/ttsRoutes.ts`
- Controller: `src/controllers/ttsController.ts`
- Service: `src/services/ttsService.ts`
- Rate limiter: `ttsLimiter` applied in `app.ts`

### Authentication Architecture

Multi-factor authentication system with five methods:
1. **Password**: Username/email + bcrypt hashed password (12 rounds)
2. **TOTP**: Time-based one-time passwords (Google Authenticator compatible)
3. **Passkey/WebAuthn**: Biometric authentication (fingerprint/face)
4. **Email verification**: Registration verification + password reset
5. **Backup codes**: MFA recovery codes

**JWT Token Flow**:
- Tokens expire in 24 hours (configurable via `jwtExpiresIn`)
- Middleware: `src/middleware/authenticateToken.ts`
- Optional authentication: Some routes use `authenticateToken` with `optional: true`
- Token stored in `Authorization: Bearer <token>` header

### Rate Limiting System

37 independent rate limiters defined in `src/middleware/routeLimiters.ts`:
- Each major route has its own limiter with specific window/max settings
- Applied per-route in `app.ts` during route registration
- Uses express-rate-limit with memory store (or Redis if configured)
- Examples: `authLimiter`, `ttsLimiter`, `adminLimiter`, `passkeyLimiter`

**Important**: When adding new routes, always add a corresponding rate limiter and apply it in `app.ts`.

### Frontend Architecture

Frontend is in `frontend/` directory:
- **Entry**: `frontend/src/main.tsx`
- **Router**: `frontend/src/App.tsx` defines all routes with lazy loading
- **Components**: 100+ components in `frontend/src/components/`
- **API calls**: Centralized in `frontend/src/api/`
- **Build**: Vite 7 with Tailwind CSS 3

**Adding new pages**:
1. Create component in `frontend/src/components/`
2. Add lazy import in `App.tsx`
3. Add `<Route>` definition in `App.tsx`
4. Add title mapping in `routeConfig.titles`
5. Add navigation link in `MobileNav` component if needed

### Testing Configuration

Jest with ts-jest preset:
- **Setup**: `src/tests/setup.ts` runs before all tests
- **Path aliases**: `@/` maps to `src/`, `@frontend/` maps to `frontend/src/`
- **Config**: `jest.config.js` with custom transform patterns
- **Timeout**: 30 seconds per test
- **Workers**: Single worker for performance tests (maxWorkers: 1)

**Important**: Tests use `tsconfig.jest.json` (not `tsconfig.json`) for compilation.

## Critical Environment Variables

### Required in Production
- `ADMIN_PASSWORD`: Admin account password (app will crash without it)
- `JWT_SECRET`: JWT signing key (app will crash without it)
- `OPENAI_API_KEY`: Required for TTS functionality
- `OPENAI_BASE_URL`: OpenAI API endpoint (supports custom proxies)

### Storage Configuration
- `USER_STORAGE_MODE`: `mongo` | `mysql` | `file` (default: `file`)
- `MONGO_URI`: MongoDB connection string (if using MongoDB)
- `REDIS_URL`: Redis connection string (optional, for caching and IP bans)

### Security Configuration
- `WAF_ENABLED`: Set to `false` to disable WAF (default: `true`)
- `AES_KEY`: AES encryption key for sensitive data
- `SIGNING_KEY`: Path to signing key file (default: `secrets/signing_key.pem`)

### Authentication
- `RP_ID`: WebAuthn Relying Party ID (domain name)
- `RP_ORIGIN`: WebAuthn Relying Party Origin (full URL)
- `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile secret
- `RESEND_API_KEY`: Resend email service API key

## Code Patterns & Conventions

### Middleware Order Matters

The middleware stack in `app.ts` is carefully ordered:
1. Helmet (security headers)
2. IP ban check
3. WAF (if enabled)
4. CORS
5. Body parsers
6. Rate limiters (per-route)
7. JWT authentication (per-route)
8. Route handlers

**Never reorder these** without understanding the security implications.

### Service Layer Pattern

Services in `src/services/` should:
- Handle all business logic
- Interact with databases/external APIs
- Be reusable across multiple controllers
- Export functions, not classes (functional style)
- Handle errors and throw meaningful exceptions

### MongoDB Connection Management

MongoDB connection is managed by `src/services/mongoService.ts`:
- Lazy connection (connects on first use)
- Connection pooling configured
- Automatic reconnection on failure
- All models should use the connection from this service

**Important**: Don't create separate mongoose connections in other files.

### Code Obfuscation

Production builds use `javascript-obfuscator`:
- Backend code in `dist/` is obfuscated to `dist-obfuscated/`
- Configuration in `package.json` under `javascript-obfuscator` key
- Obfuscation runs automatically during `npm run build:backend`
- Source maps are disabled in production (`sourceMap: false` in tsconfig)

## Docker Deployment

Multi-stage Dockerfile with 4 stages:
1. **frontend-builder**: Builds React app
2. **docs-builder**: Builds Docusaurus docs
3. **backend-builder**: Compiles TypeScript + obfuscates + generates OpenAPI
4. **production**: Alpine-based runtime with only production dependencies

**Ports**:
- 3000: Backend API + Swagger UI
- 3001: Frontend static files (served by `serve`)
- 3002: Docusaurus documentation (served by `serve`)

## Common Development Tasks

### Adding a New API Endpoint

1. Create route file in `src/routes/` (e.g., `myFeatureRoutes.ts`)
2. Create controller in `src/controllers/` (e.g., `myFeatureController.ts`)
3. Create service in `src/services/` if needed (e.g., `myFeatureService.ts`)
4. Create model in `src/models/` if database is needed (e.g., `myFeatureModel.ts`)
5. Add rate limiter in `src/middleware/routeLimiters.ts` (e.g., `myFeatureLimiter`)
6. Import and register route in `src/app.ts`
7. Apply rate limiter to route in `src/app.ts`
8. Run `npm run generate:openapi` to update API documentation

### Switching Storage Modes

To switch from MongoDB to file storage:
```bash
# Set environment variable
USER_STORAGE_MODE=file npm run dev

# Or in .env file
USER_STORAGE_MODE=file
```

**Note**: Some features may have reduced functionality in file mode. Check service implementations for storage-specific logic.

### Running Tests for Specific Module

```bash
npm run test:auth                    # Authentication tests only
npm run test -- --testPathPattern=tts  # TTS-related tests
npm run test -- --testNamePattern="should generate audio"  # Specific test name
```

### Debugging Production Issues

1. Check logs in `data/logs/` (Winston logs by date)
2. Check `logs/combined.log` and `logs/error.log`
3. Use `/health` endpoint to check MongoDB/WebSocket status
4. Use `POST /server_status` with `SERVER_PASSWORD` to get system metrics
5. Check admin dashboard at `/admin` for system overview

## Security Considerations

### Admin Routes Protection

All admin routes require:
1. Valid JWT token
2. User role = `admin`
3. Rate limiting (stricter than regular routes)

**Never** bypass admin authentication checks.

### Password Security

- Passwords are hashed with bcrypt (12 rounds)
- Never log passwords or tokens
- Never return password hashes in API responses
- Use `select: false` in Mongoose schemas for sensitive fields

### IP Banning

IP bans are checked before any other middleware:
- Supports individual IPs and CIDR ranges
- Stored in Redis (if available) or MongoDB
- Synchronized across instances via Redis pub/sub
- Manual bans via admin dashboard
- Automatic bans based on rate limit violations

### WAF Rules

WAF in `src/middleware/wafMiddleware.ts` detects:
- SQL injection attempts
- XSS attacks
- Path traversal
- Command injection
- Common attack patterns

**Can be disabled** with `WAF_ENABLED=false` but not recommended for production.

## Troubleshooting

### MongoDB Connection Issues

If MongoDB fails to connect:
1. Check `MONGO_URI` format: `mongodb://user:pass@host:port/database?authSource=admin`
2. Verify MongoDB is running and accessible
3. Check firewall rules
4. Try file storage mode: `USER_STORAGE_MODE=file`

### Build Failures

If build fails:
1. Clear dist: `rm -rf dist dist-obfuscated`
2. Check TypeScript errors: `npx tsc --noEmit`
3. Try clean build: `npm run build:backend:clean`
4. Check Node.js version (requires 18.20.8+)

### Test Failures

If tests fail:
1. Run test cleanup: `npm run test:clean`
2. Check test database: `npm run test:db-init`
3. Run tests with verbose output: `npm run test:verbose`
4. Check for open handles: Tests use `forceExit: true` and `detectOpenHandles: true`

### Frontend Build Issues

If frontend build fails:
1. Clear node_modules: `cd frontend && rm -rf node_modules && npm install`
2. Check Vite config: `frontend/vite.config.ts`
3. Try minimal build: `npm run build:minimal`
4. Check for TypeScript errors in frontend: `cd frontend && npx tsc --noEmit`
