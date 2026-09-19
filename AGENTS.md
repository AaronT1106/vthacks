# AI Coding Instructions

Before making any code changes:

1. Read README.md to understand the project.
2. Read PROMPT_LOG.md to understand previous requests and decisions.
3. Inspect the existing code before creating or modifying files.

## Development Rules

- Keep code simple and easy to explain.
- Avoid unnecessary abstractions.
- Use descriptive file names.
- Use descriptive function names.
- Use descriptive variable names.
- Keep functions small and focused on one purpose.
- Do not rewrite working existing code unless necessary.
- Only modify the files and sections needed for the current task.
- Preserve existing functionality unless specifically asked to change it.
- Do not create duplicate functions or components if an existing one can be reused.
- Do not add libraries unless they are actually needed.
- Prefer straightforward solutions over clever or overly complex solutions.
- Add comments only when they help explain non-obvious logic.
- Follow the existing project structure and naming style.

## Before Creating Something New

Check whether the project already contains:

- a similar component
- a similar function
- an existing API endpoint
- an existing utility
- an existing data structure

Reuse existing code when reasonable.

## After Completing a Task

Update PROMPT_LOG.md with a short entry that includes:

- what was requested
- what files were changed
- what was implemented
- any important decisions made

## MVP Priorities

Prioritize this end-to-end workflow:

1. Display hazards on an interactive map.
2. Allow the user to select a role, starting point, and destination.
3. Calculate a safer route around hazards.
4. Display the route's distance, travel time, risk, and confidence.
5. Explain why the route was recommended.

Complete the MVP workflow before implementing advanced features such as 3D visualization, automatic georeferencing, multiple computer-vision models, continuous data ingestion, simulations, or offline support.

## Component Responsibilities

- The frontend displays maps, hazards, routes, confidence scores, and explanations.
- FastAPI validates requests and coordinates backend services.
- Computer-vision models detect potential damage from imagery.
- The routing engine calculates paths and risk scores.
- The LLM explains structured results but does not calculate routes or invent evidence.
- Human operators must approve high-impact recommendations.

## Data and Safety Rules

- Clearly label mock, simulated, and real data.
- Do not present uncertain detections as confirmed hazards.
- Preserve timestamps, locations, confidence scores, evidence sources, and verification status.
- Use consistent field names between TypeScript and Python models.
- Never commit API keys, credentials, tokens, or `.env` files.

## Validation

After making changes, run the relevant available checks.

Frontend:

- `npm run lint`
- `npm run build`

Backend:

- Run relevant tests if they exist.
- Verify that the FastAPI application imports and starts successfully.

Record any checks that could not be completed in `PROMPT_LOG.md`.