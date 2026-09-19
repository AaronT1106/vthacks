# Disaster Response AI

An AI-powered disaster response platform that detects damage from satellite or aerial imagery, understands how that damage affects critical infrastructure, and recommends the safest next action for civilians and emergency responders.

## Project Goal

Most disaster-analysis systems stop after identifying damaged areas.

This project goes one step further.

The system will:

1. Compare before and after satellite or aerial imagery.
2. Detect damaged roads, bridges, buildings, flooded areas, fire zones, and other hazards.
3. Understand how that damage affects nearby infrastructure.
4. Recalculate safe routes around damaged or dangerous areas.
5. Give different recommendations depending on who is using the system.
6. Explain why each route or decision was recommended.
7. Display everything on an interactive map with damage overlays, heatmaps, routes, and risk information.

## Main Idea

Detect the damage. Understand the impact. Decide what to do next.

## User Modes

The system can provide different recommendations depending on the user:

- Civilian
- Ambulance
- Firefighter
- Supply Truck
- Emergency Coordinator

For example, a civilian may be routed toward the safest shelter, while an ambulance may prioritize the safest route to a hospital.

## Core Features

### Damage Detection

Compare before and after imagery to identify:

- Flooded roads
- Damaged bridges
- Blocked intersections
- Fire zones
- Damaged buildings
- Inaccessible areas

### Impact Analysis

Determine how detected damage affects:

- Roads
- Hospitals
- Shelters
- Fire stations
- Critical infrastructure
- Nearby communities

### Dynamic Routing

Automatically calculate safer routes around damaged or dangerous areas.

### User-Specific Routing

Different users can receive different route recommendations based on their needs.

### Explainable Recommendations

The system should explain why it selected a route or action.

Example:

Route B was selected because Route A contains flooding and Route C crosses a damaged bridge.

### Risk Heatmap

Display interactive risk levels across the map.

### What Changed Feed

Show newly detected changes as new imagery or incident data becomes available.

Example:

- Flooding detected on Route 460
- Previous route is no longer recommended
- New safe route calculated

### Confidence Scores

Show how confident the system is in detected damage and recommendations.

### Priority Scoring

Rank damaged areas based on urgency, infrastructure importance, and accessibility.

## Stretch Features

If time allows:

- Resource allocation
- Cascading infrastructure failure analysis
- Responder priority heatmaps
- Human verification for uncertain detections
- Scenario simulation
- Offline or low-connectivity mode
- 3D map visualization

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

## Project Structure

```text
vthacks/
├── frontend/
├── backend/
├── README.md
├── AGENTS.md
├── PROMPT_LOG.md
└── .gitignore