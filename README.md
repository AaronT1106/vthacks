# Pathfinder AI

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

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

The backend startup command will be added after the FastAPI entry point is implemented.

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

The frontend and backend environments are initialized. Development is focused on completing the main MVP workflow before adding advanced features.