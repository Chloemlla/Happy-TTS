# Repository Guidelines

Do not execute any installation commands; continue modifying the code directly.
Regarding the garbled characters issue you mentioned, I've confirmed it's not a file corruption problem. In PowerShell, you can read it directly like this:

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$OutputEncoding = [System.Text.Encoding]::UTF8

Get-Content -Encoding UTF8 src\controllers\ttsController.ts

## Project Structure & Module Organization

Synapse is a TypeScript full-stack TTS platform. Backend source lives in `src/`: `routes/` define HTTP endpoints, `controllers/` handle request/response logic, `services/` contain business logic, `models/` hold database schemas, and `middleware/` contains auth, WAF, rate limiting, and request guards. The backend entry point is `src/app.ts`, with startup helpers under `src/app/`.

Frontend code is in `frontend/src/`: routing in `App.tsx`, entry in `main.tsx`, reusable UI in `components/`, API clients in `api/`, and hooks in `hooks/`. Tests are primarily in `src/tests/`; frontend-adjacent tests may sit beside the relevant module.

## Build, Test, and Development Commands

- `npm run dev`: start backend and frontend together.
- `npm run dev:backend`: run the Express API with `nodemon` and `ts-node`.
- `npm run dev:frontend`: run the Vite frontend on port 3001.
- `npm run build:backend`: compile backend TypeScript, copy templates, and obfuscate output.
- `npm run build:minimal`: run the minimal full build path.
- `npm run test`: run Jest with open-handle detection.
- `npm run test:auth`: run authentication tests only.
- `cd frontend && npx tsc --noEmit`: preferred frontend verification for TypeScript-only changes.

Avoid installing dependencies unless the task requires it; prefer existing lockfiles and installed packages.

## Coding Style & Naming Conventions

Use TypeScript and follow the existing 2-space indentation style. Prefer functional service exports over classes. Use `camelCase` for functions and variables, `PascalCase` for React components and types, and suffixes such as `*Routes.ts`, `*Controller.ts`, `*Service.ts`, and `*.test.ts`. Keep middleware order in `src/app.ts` intact unless the security impact is reviewed.

## Testing Guidelines

Jest with `ts-jest` is configured through `jest.config.js` and `tsconfig.jest.json`. Place backend tests in `src/tests/` and name them after the module or behavior under test, for example `authController.test.ts` or `securityPipeline.test.ts`. Use focused commands such as `npm run test -- --testNamePattern="should generate audio"`.

## Commit & Pull Request Guidelines

Use conventional commit messages matching the project history: `feat: add feature`, `fix: resolve issue`, `docs: update guide`, or `chore: maintenance`. Reference related issues or alerts in the commit message when relevant. Pull requests should describe the change, list verification performed, link issues, and include screenshots for visible frontend changes.

After each modification to the code, a commit must be made and the changes pushed to the remote repository.

## Security & Configuration Tips

Production requires explicit `ADMIN_PASSWORD` and `JWT_SECRET`. TTS needs `OPENAI_API_KEY` and `OPENAI_BASE_URL`. Storage is selected with `USER_STORAGE_MODE` (`mongo`, `mysql`, or `file`). New routes must include an appropriate rate limiter and should not bypass JWT or admin authorization checks.
