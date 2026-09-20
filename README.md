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
- PyTorch
- Transformers 4.46.3
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
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

On macOS or Linux, create and activate the same Python 3.12 environment with
`python3.12 -m venv .venv` and `source .venv/bin/activate`.

The frontend proxies `/api/analyze-route`, `/api/satellite-imagery`,
`/api/analyze-damage`, `/api/analyze-flood`, `/api/fire-hotspots`, and generated preview/mask URLs to
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
  "responderType": "ambulance",
  "selectedArea": {
    "west": -80.45,
    "south": 37.20,
    "east": -80.40,
    "north": 37.25
  },
  "detectedHazards": [
    {
      "id": "demo-flood",
      "name": "Potential Flooded Road Segment",
      "type": "flooding",
      "severity": "HIGH",
      "confidence": 88,
      "affectedInfrastructure": ["Primary road access"]
    }
  ]
}
```

- `startingPoint`: `blacksburg-fire-station` or `virginia-tech-rescue`.
- `destination`: `lewisgale-hospital` or `blacksburg-shelter`.
- `responderType`: `civilian`, `ambulance`, `firefighter`, `supply-vehicle`, or `emergency-coordinator`.
- The first three fields are required. `selectedArea` and `detectedHazards` are optional
  demo-analysis context from the four-step imagery workflow. Arbitrary addresses/coordinates, unsupported values,
  missing fields, extra fields, and malformed JSON return HTTP `422` with FastAPI's `detail` array.

HTTP `200` returns:

| Field | Contract |
| --- | --- |
| `startingPoint`, `destination`, `responderType` | Echo the validated request. |
| `selectedArea`, `detectedHazards` | Optional validated demo-analysis context echoed from the request. |
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

The Analysis step can now run real flood/water segmentation on the selected After
image. Route planning remains a separate mock workflow: its demo hazards are not
generated from the segmentation mask and are not real computer-vision detections.

Run backend checks from `backend/` with `python -m unittest -v`.

### Copernicus Sentinel-2 Imagery

After confirming a disaster-area rectangle, the imagery step can request before/after
satellite imagery for the exact bounding box through `POST /api/satellite-imagery`.
The browser sends coordinates in `[minLng, minLat, maxLng, maxLat]` order with
`beforeDate` and `afterDate`. The backend uses the Copernicus Sentinel Hub
STAC-compatible Catalog API to find Sentinel-2 L2A scenes within a configurable
plus/minus 14-day window around each target date. It selects the lowest-cloud scene,
using distance from the target date as the tie-breaker, and renders true-color
previews with the Process API.

Before and After selection is sequential. The Before capture must precede the After
target date; the After capture must occur on or after that target. The provider excludes
the chosen Before product ID and capture timestamp from After candidates. A comparison
also requires distinct products at least 24 hours apart. When these rules cannot produce
a complete pair, the API reports **comparison unavailable** instead of duplicating an
image. Route planning remains available for the selected bounds with clearly labeled
mock hazards.

Create a free Copernicus Data Space account and OAuth client. Copy
`backend/.env.example` to `backend/.env`, then set `COPERNICUS_CLIENT_ID` and
`COPERNICUS_CLIENT_SECRET`. Credentials remain in FastAPI and must never use a
`NEXT_PUBLIC_` variable. `COPERNICUS_MAX_CLOUD_COVER` defaults to 40 percent and
`COPERNICUS_SEARCH_WINDOW_DAYS` defaults to 14.
Set `SATELLITE_IMAGERY_PROVIDER=mock` to skip network requests and exercise the
manual-upload fallback.

Successful searches return the requested date, actual capture time, product cloud
cover, number of candidate scenes checked, selected bounds, and short-lived
same-origin preview URLs. Preview bytes are held in backend
memory for display and are never written to the repository. A complete pair enables
the detailed **Analyze damage** demo automatically. Missing credentials, unavailable
scenes, excessive cloud cover, rendering failures, and expired previews show a clear
message and reveal the existing manual PNG, JPG, and WEBP upload fallback. When no
scene meets 40% but the best candidate is below 70%, the UI labels it **Higher cloud
cover — verification limited** and requires the user to accept it before analysis.
Scenes at 70% cloud cover or above are not offered.
For usable low-cloud results, the imagery step offers up to three chronological
candidates per side through **Choose another scene** controls. Every choice displays
its requested date, actual capture time, scene ID, and cloud cover, and the frontend
rechecks pair eligibility before enabling detailed comparison.

Sentinel-2 provides higher-resolution local-area context than the previous wide-area
provider. The flood model can analyze the selected After scene, but other damage
findings and routing hazards remain deterministic mock data. It does not claim that
individual road or building damage is certain; human verification is required. See the
[Copernicus Sentinel Hub Catalog API](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Catalog.html),
[Sentinel-2 L2A documentation](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S2L2A.html),
and [authentication guide](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html).

Copernicus attribution: Sentinel-2 imagery is provided through the Copernicus Data
Space Ecosystem.

After Analyze damage succeeds, the session-scoped demo analysis result retains the
exact Before and After Sentinel-2 preview URLs, capture times, cloud cover, layer,
source, and selected bounds.
View Evidence actions on hazards, incidents, and completed recommendations reuse the
existing evidence modal to display that same pair side by side. The application does
not save those remote images in the repository. If a URL is missing, expired, or fails
to load, the modal explains the failure and links back to the existing manual upload
step.

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

Sentinel-2 sessions validate the generated preview references through
`POST /analyze-damage/satellite`; manual files use the multipart endpoint. Those
legacy endpoints still verify transport or prepare rasters. Real flood/water inference
uses the separate `/api/analyze-flood` contract described below.

For a validated Sentinel-2 pair, the satellite endpoint now also requests separate
16-bit analysis GeoTIFFs from the Copernicus Process API. These rasters retain the
selected CRS84 bounds, scene ID, capture time, RGB band identities, data mask, pixel
dimensions, and an estimated ground pixel size. The backend verifies that Before and
After have matching bounds, CRS, dimensions, bands, and sample type, then keeps at
most four rasters in memory for one hour. `COPERNICUS_ANALYSIS_MAX_DIMENSION` defaults
to 2048 to bound memory; larger selected areas therefore report a coarser effective
pixel size instead of claiming native 10 m detail.

This is raster preparation only. The application does not yet tile these GeoTIFFs,
run RF-DETR, calculate spectral indices, detect hazards, or geolocate detections. The
frontend's resulting hazards remain explicitly labeled demo data.

### Flood/Water Segmentation

`POST /api/analyze-flood` runs a real SegFormer-B0 semantic-segmentation model on the
selected **After** image. Satellite requests resolve the exact Process API PNG already
held in the backend preview cache; manual requests send the exact local After file.
No second satellite scene is fetched for inference.

The configured checkpoint is
`gdurkin/segformer-b0-finetuned-segments-floods-S2`, pinned to revision
`f94b7a0254011883dc17f04d88355f8e7adc5263`. It was fine-tuned from MiT-B0 on the
author's `gdurkin/flood_dataset_S2` dataset and exposes `invalid`, `not water`, and
`water` classes. The associated processor resizes RGB input to `512 x 512`; logits are
resized back to the original image dimensions before the final class mask is created.

Install backend dependencies with Python 3.12. Transformers is pinned to 4.46.3 so the
approved PyTorch/Transformers dependency set can load this checkpoint without adding a
separate torchvision dependency. On first real use, Hugging Face downloads
the checkpoint into its normal user cache outside this repository. The backend loads the
processor and model lazily, reuses them across requests, prefers CUDA, tries compatible
Apple MPS, and otherwise runs on CPU. Normal unit tests mock this boundary and never
download weights.

The endpoint accepts multipart fields `source`, `west`, `south`, `east`, and `north`.
Manual requests also provide `after_image`; satellite requests provide the generated
`after_preview_id`. It returns original image dimensions, processor dimensions, raw
logit shape, valid/water/invalid pixel counts, percentage coverage, model/device details,
exact acquisition metadata, and a temporary PNG mask URL. Mask bytes remain in backend
memory for one hour.

The displayed percentage means the share of valid analyzed pixels classified as
`water`. Because Phase 1 analyzes only the After image, it cannot reliably distinguish
permanent water from new inundation. Cloud, shadow, and domain-shift errors are also
possible. The overlay is a potential flood/water indicator for human review, not a
confirmed flood boundary or a physical-area estimate. Large-area tiled inference,
before/after change detection, hazard creation, and routing integration remain future
work. The checkpoint's model card has limited documentation and an unspecified license,
so licensing and independent validation are required before production use.

### NASA FIRMS Active-Fire Hotspots

`POST /api/fire-hotspots` checks the exact confirmed incident bounding box against the
NASA FIRMS Area API. The server sends coordinates in `west,south,east,north` order and
uses the `VIIRS_NOAA21_NRT` product with a one-day query window by default. The browser
never receives the FIRMS MAP_KEY or a secret-containing provider URL.

Configure the ignored `backend/.env` file with:

```text
NASA_FIRMS_MAP_KEY=your_real_local_key
NASA_FIRMS_SOURCE=VIIRS_NOAA21_NRT
NASA_FIRMS_DAY_RANGE=1
```

The endpoint returns normalized satellite active-fire detections containing their
latitude, longitude, observation date/time, satellite, instrument, preserved FIRMS
confidence category, brightness values, scan/track footprint values, version, day/night
flag, and Fire Radiative Power (FRP) when NASA supplies them. FRP describes detected
radiative energy; DisasterLens does not convert it into an invented danger, severity,
acreage, or confidence percentage.

Each FIRMS row is a hotspot observation, not a unique wildfire. Several rows can belong
to the same fire, and older observations do not prove that a fire is currently burning.
A zero-row response means only that NASA FIRMS returned no active-fire detections for
the selected area and time window; satellite timing, clouds, visibility, coverage, and
detection thresholds can affect results.

Flood and fire remain separate analysis sources. FIRMS coordinates, FRP, confidence,
and acquisition timestamps are retained for a future Route heatmap, but Phase 2 does
not add map points, clustering, combined hazard scores, routing penalties, or route
changes. See the [NASA FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/)
for the provider contract.

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
