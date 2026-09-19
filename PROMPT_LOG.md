# Prompt and Development Log

This file tracks important requests, changes, and project decisions.

AI assistants should read this file before making changes and add a short entry after completing a task.

---

## Initial Project Setup

### Request

Set up the frontend and backend for the disaster-response hackathon project.

### Current Tech Stack

#### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Mapbox GL
- deck.gl
- Three.js
- React Three Fiber

#### Backend

- Python 3.12
- FastAPI
- Uvicorn
- OpenCV
- NumPy
- Pillow
- NetworkX
- OSMnx
- Supabase
- python-dotenv
- python-multipart

#### System Dependencies

- PROJ

### Current Project Goal

Build an AI disaster-response system that:

1. Compares before and after satellite or aerial imagery.
2. Detects damaged infrastructure and dangerous areas.
3. Understands how the damage affects roads and critical infrastructure.
4. Calculates safer routes around damaged areas.
5. Gives different recommendations depending on the user, including:
   - Civilian
   - Ambulance
   - Firefighter
   - Supply truck
   - Emergency coordinator
6. Explains why a route or decision was recommended.
7. Displays damage, risks, routes, and heatmaps on an interactive map.

### Important Development Decisions

- Keep the code simple and easy to explain.
- Use descriptive file, function, and variable names.
- Avoid unnecessary abstractions.
- Do not rewrite working code unless necessary.
- Build the MVP before adding advanced features.
- Use real routing algorithms instead of relying only on an LLM.
- Use AI mainly for damage analysis, reasoning, and explanations.

---

## Refined Product Vision and MVP Scope

### Request

Clarify Pathfinder AI's production vision and define the scope of the hackathon MVP.

### Product Vision

Pathfinder AI is a disaster-response decision-support platform that combines satellite or aerial imagery, weather data, road networks, emergency reports, and critical-facility locations.

The full system will:

- Align incoming imagery with real-world coordinates.
- Use specialized computer-vision models to detect flooding, fires, blocked roads, damaged bridges, and destroyed buildings.
- Update a live infrastructure map as conditions change.
- Preserve timestamps, locations, confidence scores, evidence sources, and verification status.
- Determine how hazards affect hospitals, shelters, neighborhoods, evacuation routes, and supply chains.
- Provide role-specific routes and recommendations.
- Consider travel time, hazard severity, uncertainty, and changing conditions.
- Use an LLM to explain recommendations, cite evidence, compare alternatives, and generate briefings.
- Require human approval for high-impact recommendations.

The long-term production vision may also include:

- Databricks ingestion and processing pipelines
- Automatic georeferencing
- Multiple computer-vision models
- Continuously changing hazard predictions
- Probabilistic risk modeling
- What-if simulations
- Offline field support
- Large-scale geographic coverage
- Security and monitoring
- Fault-tolerant deployment

### Hackathon MVP

The hackathon MVP will focus on one complete workflow:

1. Display a disaster area on an interactive map.
2. Display detected or simulated hazards.
3. Allow the user to select a role.
4. Allow the user to select a starting point and destination.
5. Calculate a safer route around hazardous areas.
6. Display the route's distance, estimated travel time, risk, and confidence.
7. Show which hazards the route avoids.
8. Explain why the route was recommended.

### MVP Development Order

1. Build the main situation-map interface.
2. Add mock hazard and route data.
3. Define the frontend and backend data models.
4. Connect the frontend to a minimal FastAPI endpoint.
5. Implement basic risk-aware routing.
6. Add explanations based on structured route and hazard data.
7. Replace mock data with real data when possible.
8. Add stretch features only after the complete workflow works.

### Important Decisions

- Finish the complete MVP workflow before adding stretch features.
- Clearly label mock, simulated, and real information.
- Routing algorithms determine routes and risk scores.
- The LLM explains structured results but does not calculate routes.
- The LLM must not invent hazards, evidence, confidence scores, or data sources.
- Uncertain detections must not be presented as confirmed hazards.
- Preserve timestamps, coordinates, confidence scores, evidence sources, and verification status.
- High-impact recommendations must support human review and approval.
- Frontend and backend models should use consistent field names.
- API keys, tokens, credentials, and `.env` files must not be committed.

### Initial Component Responsibilities

- The frontend displays maps, hazards, routes, confidence scores, and explanations.
- FastAPI validates requests and coordinates backend services.
- Computer-vision models identify potential damage from imagery.
- The routing engine calculates paths and risk scores.
- Supabase stores application data and metadata.
- Databricks handles large-scale ingestion, processing, model tracking, and data fusion when integrated.
- The LLM turns structured results into understandable explanations.
- Human operators review and approve high-impact recommendations.

---

## DisasterLens Frontend MVP Dashboard

### Request

Build the initial frontend-only DisasterLens dashboard and simulated route-analysis demo without changing the backend or adding dependencies.

### Files Changed

- Replaced the starter page and global styling in `frontend/app/`.
- Added focused dashboard components in `frontend/src/components/`.
- Added centralized typed mock data in `frontend/src/data/mock-disaster-data.ts`.
- Updated `README.md` with setup, Mapbox, and demo instructions.

### Implemented

- Added a responsive dark mission-control dashboard with an incident header, route controls, dominant map, and intelligence panel.
- Added role-specific mock recommendations, simulated analysis feedback, hazard details, working layer toggles, live-source statuses, and an animated What Changed feed.
- Added Mapbox support through optional `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` plus a fully interactive local fallback map.
- Added a short React Three Fiber globe introduction with reduced-motion support and a skip control.
- Kept all simulated disaster information visibly labeled as mock data and left the backend unchanged.

### Validation

- `npm run lint` passed after removing one unused import.
- `npx tsc --noEmit` passed.
- `npm run build -- --webpack` passed and produced a static home route.
- The local development server compiled the home page and returned HTTP 200.
- The default Turbopack build could not complete in the sandbox because its CSS worker was not permitted to bind a local port; the Webpack production build passed instead.
- Browser-based visual QA could not be completed because no browser connection was available in the session.
