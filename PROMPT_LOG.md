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

---

## Mock Route Analysis API Integration � 2026-09-19

### Request

Define a minimal route-analysis contract, implement one FastAPI POST endpoint, and connect the existing Analyze Route button and results panel while preserving the dashboard design and adding no dependencies.

### Files Changed

- `backend/main.py`: FastAPI application, validated request/response models, and `POST /api/analyze-route`.
- `backend/mock_data.py`: existing role-specific demo metrics and supported location fixtures.
- `backend/test_main.py`: endpoint and request-validation tests using unittest and the already available FastAPI TestClient/httpx.
- `frontend/src/data/mock-disaster-data.ts`: request/response interfaces reusing existing responder, route, and recommendation types; removed local recommendation fixtures now owned by the backend.
- `frontend/src/lib/route-analysis.ts`: POST request helper and HTTP error handling.
- `frontend/next.config.ts`: same-origin API proxy to the backend, defaulting to `http://127.0.0.1:8000`, with optional server-side `BACKEND_URL`.
- `frontend/src/components/disaster-dashboard.tsx`: actual request flow, loading/error states, 15-second timeout, cancellation, stale-result protection, and backend-driven change-feed entries.
- `frontend/src/components/route-recommendation-panel.tsx`: response/error rendering and risk badge derived from the returned risk.
- `frontend/src/components/disaster-map.tsx`: display returned route geometry in both map modes and align route endpoints with selected locations; retained existing map styling/layers.
- `README.md`: API contract, backend startup, proxy configuration, and updated demo instructions.
- `PROMPT_LOG.md`: this entry.

### Contract and Decisions

- Request fields: `startingPoint`, `destination`, and `responderType`, using the existing UI option IDs.
- Response echoes the request and returns `dataSource: "mock"`, the existing `RouteRecommendation` structure, and a `Route` with `[longitude, latitude]` coordinates.
- Both languages use the same camelCase field names. FastAPI rejects missing/extra fields, unsupported IDs/roles, wrong types, and malformed JSON with HTTP 422.
- Role-specific metrics are preset values, not calculated journey estimates. Roles share illustrative corridor geometry; the selected destination determines the corridor and both endpoints match the request. Explanations identify the chosen locations and explicitly state mock limitations and human-verification requirements.
- Input changes clear results and cancel in-flight requests. Failures are shown in the existing results panel, with retry through Analyze Route; no silent frontend fallback is used.
- The Next.js rewrite avoids cross-origin browser requests and requires no CORS middleware. No dependencies or credentials were added. No real routing, live hazard analysis, LLM inference, or dispatch was implemented.

### Validation

- `python -m unittest -v` from `backend/`: passed three tests, covering all 20 supported journey/role combinations plus invalid fields, extra fields, malformed JSON, and method rejection.
- Uvicorn imported the application and started successfully on `127.0.0.1:8000`; direct HTTP POST returned the expected mock response.
- End-to-end HTTP check passed through the existing Next.js server at `localhost:3000` to FastAPI.
- In-memory Node checks using the actual frontend request helper passed request serialization, response handling, HTTP 422/503 handling, and cancellation. React server rendering confirmed returned metrics, MEDIUM risk, mock labeling, explanation, and alert content in the existing panel.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and static generation. The sandboxed attempt compiled but hit `spawn EPERM` when starting the TypeScript worker; approved execution outside the sandbox succeeded.
- `git diff --check`: passed.
- Browser visual/interaction QA could not run because the computer-use inventory contained no connected browsers. Live HTTP and programmatic rendering checks were completed instead; mouse interaction and visual layout remain unverified in a browser.

---

## Role-Specific Route Analysis Details — 2026-09-19

### Request

Expand the existing Pathfinder AI mock route-analysis flow so each responder role receives a transparent, role-specific recommendation. Show the recommended route, metrics, avoided hazards, concise explanation, and one rejected alternative without changing the dashboard design, Mapbox configuration, environment files, or dependencies.

### Files Changed

- `backend/mock_data.py`: added explicit avoided hazards, selection reason, and rejected alternative for every responder role.
- `backend/main.py`: extended the validated API response model and returned the new role-specific fields.
- `backend/test_main.py`: verified complete responses for all journey/role combinations and distinct behavior for all five roles.
- `frontend/src/data/mock-disaster-data.ts`: extended the shared TypeScript response type and renamed the visible Supply Vehicle label to Supply Truck.
- `frontend/src/components/route-recommendation-panel.tsx`: displayed hazards avoided and the rejected alternative inside the existing results panel.
- `README.md`: updated the API contract and role-specific mock behavior.
- `PROMPT_LOG.md`: this entry.

### Implementation and Decisions

- Kept route-analysis decisions in the existing FastAPI mock endpoint. The frontend only displays the structured response.
- Civilian prioritizes minimum exposure; ambulance prioritizes fast hospital access; firefighter prioritizes apparatus access; supply truck prioritizes heavy-vehicle clearance; emergency coordinator prioritizes network-wide awareness.
- Every result explicitly lists the same two simulated hazards as avoided and returns one role-specific alternative with a risk level and a concrete rejection reason.
- Metrics remain preset mock values and route geometry remains illustrative. Explanations state that human verification is required.
- Preserved the existing dashboard and map behavior. No dependencies were added, and Mapbox configuration and `.env.local` were not modified.

### Validation

- `python -m unittest -v` from `backend/`: passed four tests, including all 20 supported start/destination/role combinations, request validation, and distinct role profiles.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and static page generation. The sandboxed build compiled but its TypeScript worker was blocked with `spawn EPERM`; the approved outside-sandbox retry passed.
- `git diff --check`: passed before the prompt-log entry; line-ending warnings were informational.
## Mapbox Experience Upgrade

### Request

Improve only the existing DisasterLens map so a configured Mapbox token provides a polished, persistent interactive basemap while the no-token demo map remains fully usable.

### Files Changed

- Refactored `frontend/src/components/disaster-map.tsx`.
- Extended the incident view configuration in `frontend/src/data/mock-disaster-data.ts`.
- Refined Mapbox controls and canvas styles in `frontend/app/globals.css`.
- Created ignored `frontend/.env.local` with an empty `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` entry.

### Implemented

- Mapbox now initializes once instead of being recreated by layer, endpoint, selection, or route-analysis updates, preserving pan and zoom state.
- Existing mock sources and layers update in place and are restored after dark/satellite style changes.
- Added responsive map resizing, compact zoom controls, a Blacksburg recenter control, muted dark-map labels, and clearer real-basemap versus demo-map status labels.
- Missing, empty, and authentication-invalid tokens fall back to the existing demo map without interrupting the dashboard.
- Kept the map component interface, dashboard layout, mock workflow, dependencies, and backend unchanged.

### Validation

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build -- --webpack` passed and produced the static home route.
- The development server loaded with the empty token, returned HTTP 200, rendered the `Demo Map · Mock Data` label, and did not enter the Mapbox loading path.
- Live Mapbox rendering, pan/zoom, recentering, and responsive visual checks remain pending until a valid public token is added; browser automation was unavailable in this session.

---

## Route Recommendation Missing-Hazards Fix — 2026-09-19

### Request

Fix the runtime crash caused by `RouteRecommendationPanel` calling `.map()` when `hazardsAvoided` is missing. Confirm whether the issue came from field naming, incomplete mock data, or both, make the API contract consistent, add frontend safeguards, test the backend response, and preserve the existing design.

### Cause

- The checked-in FastAPI model, role fixtures, and TypeScript type all use the same camelCase `hazardsAvoided` field. There was no snake_case/camelCase mismatch in the current source.
- All current responder fixtures include the array. The runtime failure was consistent with an incomplete or stale backend response from an older running server.
- The frontend used a TypeScript cast for unvalidated JSON and called `.map()` without a runtime guard, so a missing field crashed the panel.

### Files Changed

- `backend/main.py`: made `hazardsAvoided` default to an empty list and used an empty-list fallback when a fixture omits it.
- `backend/test_main.py`: verified the camelCase response key, array type for every role, absence of the snake_case variant, and empty-array behavior for an omitted fixture field.
- `frontend/src/lib/route-analysis.ts`: normalized missing or invalid `hazardsAvoided` values to `[]`, supplied safe legacy alternative data, and rejected responses missing core recommendation or route objects.
- `frontend/src/components/route-recommendation-panel.tsx`: added render-time fallbacks for hazards, risk, and alternative details, including an empty-state message.
- `PROMPT_LOG.md`: this entry.

### Decisions

- Kept camelCase as the shared API contract because it already matches the existing frontend and documented endpoint.
- Added safeguards in both the request boundary and the panel so stale or incomplete responses do not crash the UI.
- Did not change role fixtures because all five already supply `hazardsAvoided` arrays.
- Preserved the dashboard design and behavior. No dependencies, Mapbox files, environment files, or unrelated files were modified.

### Validation

- `python -m unittest -v` from `backend/`: passed five tests, including all 20 supported journey/role responses and the omitted-hazards empty-array case.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and static generation. The sandboxed attempt compiled but hit `spawn EPERM` when starting the TypeScript worker; the approved outside-sandbox retry passed.
- `git diff --check`: passed before the prompt-log update; line-ending warnings were informational.

---

## Deterministic Role-Specific Route Analysis — 2026-09-19

### Request

Make route analysis meaningfully different for civilians, ambulances, firefighters, supply trucks, and emergency coordinators while preserving the dashboard, Mapbox behavior, endpoint compatibility, and incomplete-response safeguards.

### Files Changed

- `backend/mock_data.py`: replaced shared-looking profiles with five complete role-specific targets, corridors, metrics, hazards, explanations, and rejected alternatives.
- `backend/main.py`: selected role-specific destinations and geometry and added `recommendedDestination` to the existing recommendation response.
- `backend/test_main.py`: proved every role returns distinct recommendation fields, risk/confidence combinations, destinations, and route geometry across all supported requests.
- `frontend/src/data/mock-disaster-data.ts`: added `recommendedDestination` to the shared recommendation type.
- `frontend/src/lib/route-analysis.ts`: retained incomplete-response normalization and added a safe fallback for the new destination field.
- `frontend/src/components/route-recommendation-panel.tsx`: displayed the recommended destination without changing the panel structure.
- `frontend/src/components/disaster-dashboard.tsx`: aligned the existing map destination marker with the returned role-specific route endpoint.
- `README.md`: documented the additive response field and the five deterministic role rules.
- `PROMPT_LOG.md`: this entry.

### Role Rules and Decisions

- Civilian uses the Shelter Safety Route to Blacksburg Community Shelter, prioritizing the largest buffer from all simulated hazards.
- Ambulance uses the Hospital Priority Route to LewisGale Hospital, prioritizing short travel time without using the flooded approach.
- Firefighter uses the Incident Access Route to Route 460 Incident Staging, favoring wider apparatus-access roads around blocked lanes.
- Supply truck uses the Heavy Vehicle Supply Route to the Emergency Supply Depot, avoiding the damaged bridge, flood zone, and weight-restricted roads.
- Emergency coordinator uses the Critical Access Loop to the Critical Infrastructure Access Hub, accepting medium mock risk to preserve access across the hospital, shelter, and incident corridors.
- Every profile has a unique route name, recommended destination, time, distance, confidence, hazard list, explanation, alternative, and route geometry. Risk/confidence combinations are unique even where risk labels repeat.
- The existing request and response fields remain available. The top-level requested `destination` is still echoed for compatibility; the additive `recommendation.recommendedDestination` identifies the role-selected target.
- All values remain deterministic mock data. No live routing, real hazard detection, or autonomous dispatch logic was introduced.
- No dependencies, environment files, or Mapbox configuration were changed.

### Validation

- `python -m unittest -v` from `backend/`: passed five tests, covering all 20 supported journey/role combinations, complete response fields, distinct role behavior, validation errors, and the empty `hazardsAvoided` safeguard.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and static generation. The sandboxed build compiled but hit `spawn EPERM` when starting the TypeScript worker; the approved outside-sandbox retry passed.
- `git diff --check`: passed before this log entry; line-ending warnings were informational.

---

## Mapbox Interaction Lifecycle Fix — 2026-09-19

### Request

Fix the Mapbox `Cannot set properties of undefined (setting 'width')` error that occurred when hovering or clicking the map after changing destination type or destination.

### Cause

- Map click and mousemove listeners could call `queryRenderedFeatures` while a style was loading, queried layers were being replaced, or the map was being disposed.
- The listeners only checked whether the local map variable existed. They did not verify map/style readiness or event-point validity, did not catch Mapbox query failures, and were anonymous so cleanup could not explicitly detach them before `remove()`.

### Files Changed

- `frontend/src/components/disaster-map.tsx`: added guarded feature queries, current-map and disposal checks, named event handlers, listener cleanup, and cancellation of the deferred resize.
- `PROMPT_LOG.md`: documented the fix and validation.

### Decisions

- Feature queries now require a loaded map, loaded style, finite event point, and at least one currently existing layer.
- Missing place or hazard layers return an empty result. Mapbox query and canvas-access errors are contained so pointer interaction cannot crash the dashboard.
- Click, mousemove, style-load, and error listeners are detached before map removal. Deferred resize work also verifies the live map instance.
- Existing Mapbox rendering, fallback rendering, place search, hazard selection, destination state, and route analysis were preserved.
- No dependencies, environment files, backend files, or unrelated components were changed.

### Validation

- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and static generation.
- The development log confirmed the original failure originated in the unguarded click query. Browser automation was unavailable for replaying every hover/click sequence; the guarded query covers all five destination transitions through the shared handler.
- `git diff --check`: passed before this log entry; line-ending warnings were informational.

---

## Complete Destination-Type Data Fix — 2026-09-19

### Request

Fix runtime errors for fire-station and police-station destinations and for changing selected destinations, while supporting every typed destination in the live Mapbox and mock-map flows.

### Cause

- Only hospitals and shelters were represented in the central destination data. Fire-station and police-station defaults were assembled inside the dashboard without the same stable identifier and backend-preset fields.
- Changing a destination reset the completed route. The map serialized the missing route as a zero-coordinate GeoJSON `LineString`, which Mapbox rejects.
- Search UI state was tied only to destination type, so a parent-selected replacement could retain stale state when the selected destination changed within that type.

### Files Changed

- `frontend/src/data/mock-disaster-data.ts`: added stable selected-place IDs, explicit backend preset IDs, and complete mock destinations for hospital, shelter, emergency room, police station, and fire station.
- `frontend/src/lib/mapbox-place-search.ts`: carries the Mapbox place ID into the shared selected-place contract and rejects incomplete retrieved features.
- `frontend/src/components/disaster-dashboard.tsx`: selects the first valid destination for each type, validates all place transitions, resets analysis, refreshes search state by selection ID, and exposes typed destinations in the fallback UI.
- `frontend/src/components/disaster-map.tsx`: filters invalid point coordinates, safely frames selections, protects the fallback renderer, and emits no line feature when a route has fewer than two valid coordinates.
- `PROMPT_LOG.md`: documented the fix and validation.

### Decisions

- Kept backend-supported preset IDs separate from display IDs so every map destination is valid without sending unsupported destination values to FastAPI.
- Emergency-room analysis reuses the existing LewisGale hospital backend preset. Police and fire destinations remain clearly labeled mock map selections until the backend contract supports those destination IDs.
- Changing type replaces incompatible destination data immediately. Changing a place remounts the destination search control by destination ID, clearing its old requests and result state.
- No dependencies, backend code, Mapbox configuration, or environment files were changed.

### Validation

- A temporary local data check validated all five required destination types and forward/reverse transitions for nonempty ID, name, and two finite coordinates; the temporary file was removed afterward.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and static generation. The sandboxed build compiled but hit `spawn EPERM` when starting the TypeScript worker; the approved retry passed.
- Browser automation was unavailable, so no automated live Mapbox interaction was run.
- `git diff --check`: passed before this log entry; line-ending warnings were informational.

---

## Destination-Type Runtime Fix — 2026-09-19

### Request

Fix the client-side error triggered by changing Destination Type while preserving live Mapbox search, the mock fallback, role-specific route analysis, and the existing dashboard design.

### Cause

- The destination-type handler cleared the destination and reset the completed analysis in the same state transition.
- Resetting the analysis removed the recommended route, and the map serialized the missing route as a GeoJSON `LineString` with zero coordinates. Mapbox requires at least two coordinates and threw the runtime error that produced the Next.js Reload overlay.

### Files Changed

- `frontend/src/components/disaster-dashboard.tsx`: selects a compatible mock destination when a typed destination changes, clears custom destinations, validates selected place names and coordinates, and resets route analysis safely.
- `frontend/src/components/disaster-map.tsx`: rejects invalid place coordinates, avoids rendering invalid point data, and represents a missing route as an empty feature collection instead of an invalid line.
- `PROMPT_LOG.md`: documented the fix and validation.

### Decisions

- Hospital, shelter, fire-station, police-station, and emergency-room changes receive deterministic compatible mock selections. Custom destination changes clear the old typed selection so the user can search for a new place.
- Only existing backend-supported preset destinations enable route analysis. Other mock or searched map destinations remain visible without sending an unsupported request.
- Map framing and GeoJSON updates now ignore incomplete or out-of-range coordinates.
- No dependencies, backend files, Mapbox configuration, or environment files were changed.

### Validation

- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and static generation. The sandboxed build compiled but hit `spawn EPERM` when starting the TypeScript worker; the approved retry passed.
- `git diff --check`: passed before this log entry; line-ending warnings were informational.
