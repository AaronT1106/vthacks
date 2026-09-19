# DisasterLens 

Pathfinder AI is an AI-powered disaster-response platform that detects infrastructure damage, determines its operational impact, and recommends safer actions for civilians and emergency responders.

## Main Idea

**Detect the damage. Understand the impact. Decide what to do next.**

Most disaster-analysis systems stop after identifying damaged areas. Pathfinder AI connects detected hazards to roads, facilities, and communities, then recommends what users should do next.

## Project Goal

Pathfinder AI is designed to:

1. Compare before and after satellite or aerial imagery.
2. Detect infrastructure damage and dangerous areas.
3. Determine how hazards affect roads and critical facilities.
4. Calculate safer routes around hazardous areas.
5. Provide recommendations based on the user's role.
6. Explain why each route or action was recommended.
7. Display hazards, routes, risks, and evidence on an interactive map.

## User Modes

Pathfinder supports different users:

- Civilian
- Ambulance
- Firefighter
- Supply truck
- Emergency coordinator

A civilian may be directed toward the safest shelter, while an ambulance may prioritize a safe route to an operational hospital.

## Hackathon MVP

The initial version focuses on one complete workflow:

1. Display a disaster area on an interactive map.
2. Display detected or simulated hazards.
3. Select a user role, starting point, and destination.
4. Calculate a safer route around hazards.
5. Display distance, travel time, risk, and confidence.
6. Show which hazards the route avoids.
7. Explain why the route was recommended.

Mock and simulated information will be clearly labeled.

## Core Features

LIVE DATA SOURCES
│
├── Drone / aerial imagery
├── Satellite imagery
├── Weather / flood feeds
├── Fire detection feeds
├── Road closures
└── Emergency reports
        ↓
     DisasterLens
        ↓
Detect new hazard
        ↓
Determine affected roads/infrastructure
        ↓
Update risk map
        ↓
Recalculate safest route
        ↓
Push change to users instantly
### Damage Detection

Analyze imagery to detect:

- Flooded roads
- Damaged bridges
- Blocked intersections
- Fire zones
- Damaged buildings
- Inaccessible areas

Detections can include coordinates, severity, confidence, timestamps, sources, and verification status.

### Impact Analysis

Determine how hazards affect:

- Roads
- Hospitals
- Shelters
- Fire stations
- Neighborhoods
- Evacuation routes
- Supply chains

### Risk-Aware Routing

Calculate safer routes using:

- Travel time
- Distance
- Hazard severity
- Road accessibility
- Detection confidence
- User role

### Explainable Recommendations

Pathfinder explains the evidence behind each recommendation.

> Route B was selected because Route A contains flooding and Route C crosses a damaged bridge.

### Situation Map

The interactive map can display:

- Hazard markers
- Damage overlays
- Recommended and blocked routes
- Risk heatmaps
- Hospitals and shelters
- Other critical facilities

### What Changed Feed

Show important updates as conditions change:

- Flooding detected on Route 460
- Previous route is no longer recommended
- New safe route calculated
- Detection requires human verification

## Decision Process

Pathfinder is a decision-support platform, not an autonomous emergency authority.

Routing algorithms calculate paths and risk scores. The LLM explains structured results and compares alternatives, but it does not invent hazards, routes, evidence, or confidence scores.

Uncertain detections must not be presented as confirmed hazards. High-impact recommendations should support human review and approval.

## System Flow

1. Receive imagery, road data, weather data, facility locations, and emergency reports.
2. Detect potential hazards from the available evidence.
3. Align detections with real-world locations.
4. Determine which infrastructure is affected.
5. Calculate routes for the selected user role.
6. Generate an evidence-based explanation.
7. Display the recommendation on the situation map.

## Tech Stack

### Frontend

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

### Backend

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

### System Dependency

- PROJ

### Planned Data Platform

Databricks may support large-scale ingestion, processing, data fusion, storage, and model tracking in the production version.

## Project Structure

```text
vthacks/
├── frontend/
├── backend/
├── README.md
├── AGENTS.md
├── PROMPT_LOG.md
└── .gitignore
```

## Getting Started

### Frontend

```powershell
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The dashboard works immediately with a local mock-map fallback. To use Mapbox,
create `frontend/.env.local` and add a public Mapbox token:

```text
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_public_token
```

Never commit the token or `.env.local` file.

### Frontend Demo

All disaster information remains mock data. The frontend calls the local FastAPI
backend for preset route analysis; it does not calculate real emergency routes.
Run both servers before using Analyze route. Restart Next.js after changing its proxy configuration.

1. Let the short globe introduction complete or select **Skip intro**.
2. Choose a starting point, destination, and responder type.
3. Select **Analyze route** to request a mock recommendation from FastAPI.
4. Toggle map layers to inspect hazards, risk, facilities, and routes.
5. Select a flood or bridge-damage marker to inspect its evidence.
6. Change responder type, then analyze again to see its preset mock recommendation.
   Changing any selection clears the previous result and cancels an in-flight request.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The frontend proxies `/api/analyze-route`, `/api/satellite-imagery`, and
`/api/analyze-damage` to
`http://127.0.0.1:8000`.
For a different backend address, set `BACKEND_URL` in the frontend server's environment
before starting/building Next.js. Browser requests use the same frontend origin;
no CORS configuration is needed. Interactive API documentation: <http://127.0.0.1:8000/docs>.

### Minimal Route Analysis Contract

`POST /api/analyze-route`, with `Content-Type: application/json`:

```json
{
  "startingPoint": "blacksburg-fire-station",
  "destination": "lewisgale-hospital",
  "responderType": "ambulance"
}
```

- `startingPoint`: `blacksburg-fire-station` or `virginia-tech-rescue`.
- `destination`: `lewisgale-hospital` or `blacksburg-shelter`.
- `responderType`: `civilian`, `ambulance`, `firefighter`, `supply-vehicle`, or `emergency-coordinator`.
- All fields are required. Arbitrary addresses/coordinates, unsupported values,
  missing fields, extra fields, and malformed JSON return HTTP `422` with FastAPI's `detail` array.

HTTP `200` returns:

| Field | Contract |
| --- | --- |
| `startingPoint`, `destination`, `responderType` | Echo the validated request. |
| `dataSource` | Always `"mock"`. |
| `recommendation` | Role-specific mock result containing `routeName`, `recommendedDestination`, `travelTime`, `distance`, `risk`, `confidence`, `priority`, `hazardsAvoided`, a concise `explanation`, and one rejected `alternative` with its risk and rejection reason. |
| `route` | Existing `Route`: `id`, `name`, `kind` (`"safe"` in this demo), and role-specific mock `coordinates` as `[longitude, latitude]` pairs. |

Python and TypeScript use the same camelCase field names. `safe` is a demo display
category, not a verified safety claim. Metrics are role-specific fixtures, not
calculated for the selected journey. Each responder role has an explicit priority,
recommended destination, route geometry, avoided-hazard list, and rejected alternative:

- Civilian: lowest-exposure route to the community shelter.
- Ambulance: fast, safer access to LewisGale Hospital.
- Firefighter: apparatus access to incident staging around blocked roads.
- Supply truck: a heavy-vehicle route to the supply depot that avoids damaged infrastructure.
- Emergency coordinator: a critical-access loop connecting the highest-impact infrastructure.

The top-level `destination` still echoes the user's request for compatibility; the
role-selected target is returned as `recommendation.recommendedDestination` and is
used as the displayed mock route endpoint.
No road-network routing, live hazard analysis, LLM inference, or dispatch is performed.
Human verification is required before operational use. Request failures are shown
in the results panel with a retry instruction; there is no silent local-result fallback.

Run backend checks from `backend/` with `python -m unittest -v`.

### Satellite Imagery Metadata

After confirming a disaster-area rectangle, the imagery step can request before/after
satellite metadata for the exact bounding box through `POST /api/satellite-imagery`.
The browser sends coordinates in `[minLng, minLat, maxLng, maxLat]` order and may
include optional `beforeDate` and `afterDate` values. Manual PNG, JPG, and WEBP
uploads remain available if provider imagery is missing, delayed, too cloudy, or
does not include a displayable quicklook.

The backend defaults to deterministic mock metadata and requires no credentials.
To enable the Copernicus adapter:

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `SATELLITE_IMAGERY_PROVIDER=copernicus`.
3. Add the server-side `COPERNICUS_CLIENT_ID` and `COPERNICUS_CLIENT_SECRET` from
   a Copernicus Data Space OAuth client.
4. Restart FastAPI. Keep `backend/.env` local; it is ignored by Git.

The adapter authenticates on the backend, searches the Copernicus Sentinel Hub
STAC catalog for Sentinel-2 L2A items intersecting the selected bounds, separates
the before and after date windows, and prefers the lowest reported cloud cover.
It returns metadata and safe HTTPS quicklook links when the catalog provides them;
it does not download imagery into the repository. If credentials are absent, the
provider request fails, or a complete pair is unavailable, the endpoint returns a
typed demo fallback and recommends manual upload. See the official
[Copernicus Catalog API](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Catalog.html)
and [OAuth client authentication](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html)
documentation for provider details.

### Damage Analysis Transport Contract

`POST /analyze-damage` accepts `multipart/form-data` containing:

| Field | Type |
| --- | --- |
| `before_image` | PNG, JPEG, or WEBP file |
| `after_image` | PNG, JPEG, or WEBP file |
| `west` | float |
| `south` | float |
| `east` | float |
| `north` | float |

Bounds are valid when `east > west` and `north > south`; negative coordinates
are supported. Invalid normalized bounds and unsupported image content types
return HTTP `400`. The frontend sends the request to `/api/analyze-damage`, and
the existing Next.js proxy forwards it to the FastAPI `/analyze-damage` endpoint
using the server-side `BACKEND_URL` setting.

HTTP `200` returns a receipt containing `status: "received"`, a message, both
filenames and content types, and the validated west/south/east/north bounds.
This endpoint currently verifies multipart transport and request validation
only. It does not read or persist image bytes, compare imagery, run a model,
detect damage, generate hazards, or update routes.

Satellite lookup currently returns metadata and optional remote quicklook URLs,
not image files. Those results can be reviewed in the Analysis step, but they
cannot be submitted to the multipart endpoint. Select manual imagery to test
the transport receipt. Direct satellite analysis will require the backend
provider to retrieve usable Before and After image bytes and pass them into the
damage-analysis pipeline server-side.

## Stretch Features

- Automatic georeferencing
- Multiple computer-vision models
- Live data ingestion
- Probabilistic route-risk modeling
- Human verification tools
- Resource allocation
- What-if simulations
- Offline field support
- Large-scale geographic coverage
- 3D map visualization
- Security, monitoring, and fault tolerance

## Current Status

The frontend MVP includes the mission-control dashboard, mock hazard map,
role-aware route recommendations, route explanations, map-layer controls, live
source statuses, an operational change feed, and a short Three.js introduction.
The FastAPI backend now serves one validated mock route-analysis endpoint,
connected to the existing dashboard, results panel, and map.
