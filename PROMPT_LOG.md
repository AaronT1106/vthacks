# Prompt and Development Log

This file tracks important requests, changes, and project decisions.

AI assistants should read this file before making changes and add a short entry after completing a task.

---

## Initial Project Setup

### Request
Set up the frontend and backend for the disaster response hackathon project.

### Current Tech Stack

Frontend:
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

Backend:
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

System Dependency:
- PROJ

### Current Project Goal

Build an AI disaster-response system that:

1. Compares before and after satellite or aerial imagery.
2. Detects damaged infrastructure and dangerous areas.
3. Understands how the damage affects roads and critical infrastructure.
4. Calculates safer routes around damaged areas.
5. Gives different recommendations depending on the user, such as:
   - civilian
   - ambulance
   - firefighter
   - supply truck
   - emergency coordinator
6. Explains why a route or decision was recommended.
7. Displays damage, risk, routes, and heatmaps on an interactive map.

### Important Development Decisions

- Keep the code simple and easy to explain.
- Use descriptive file, function, and variable names.
- Avoid unnecessary abstractions.
- Do not rewrite working code unless necessary.
- Build the MVP before adding advanced features.
- Use real algorithms for routing instead of relying only on an LLM.
- Use AI mainly for damage analysis, reasoning, and explanations.