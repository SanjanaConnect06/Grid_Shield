# GRID SHIELD AI — BESCOM POWER HACK 2026 · Team Vortex
**Theme 2: Cyber Secure Smart Grid — Detect the attack. Locate the threat. Protect the grid.**

An AI-powered smart-grid cybersecurity platform that runs a real AC power-flow simulation of the **IEEE 14-bus** network, lets you launch **simulated** cyberattacks, detects them with a hybrid of residual analysis and machine learning, localizes the compromised buses with graph reasoning, and stores incidents in a relational database.

> All attacks are simulated inside an isolated model. Nothing here is a real-world cyber operation and no prediction is a verified real incident.

## Implementation notes (transparent deviations from the brief)
This build targets the sandbox's runtime: **Next.js 16 (App Router) + PostgreSQL via Drizzle ORM**. Python/FastAPI/Vite/pandapower were therefore replaced by equivalent, fully-working TypeScript implementations:

| Brief | This implementation |
|---|---|
| Pandapower IEEE 14-bus | MATPOWER/pandapower `case14` benchmark data + own Newton-Raphson AC power flow (`src/lib/grid`). Verified against the published solution (slack 232.4 MW, θ₁₄ = −16.04°) in `tests/powerflow.test.ts`. |
| FastAPI + Pydantic | Next.js route handlers (`src/app/api`) + Zod validation, uniform JSON envelope (`docs/API.md`). |
| SQLAlchemy / SQLite | Drizzle ORM / PostgreSQL (`src/db/schema.ts`): sessions, attack events, detection results, localization results, incidents, model evaluations. |
| scikit-learn Isolation/Random Forest | From-scratch implementations (`src/lib/ai/iforest.ts`, `rforest.ts`). |
| NetworkX | BFS/graph utilities on the pandapower-equivalent topology (`src/lib/ai/localization.ts`). |
| WebSocket `/ws/grid-monitoring` | Interval polling of `/api/grid/measurements` with connection-loss detection (a WebSocket server is not available in Next route handlers). |
| Vite + React Router + shadcn | Next.js App Router, Radix primitives, Tailwind v4 tokens, hand-built shadcn-style components. |
| Playwright | Not included; Vitest covers the engine. |

Folder mapping: `frontend/src/{components,pages,layouts,hooks,services,stores,types,themes,utils}` → `src/{components,app,components/layout,hooks,services,stores,types,themes,utils}`; `backend/app/{simulation,ai,localization,database,…}` → `src/lib/{sim,ai,grid,…}`, `src/db`, `src/app/api`.

## How it works
1. **Simulation** – time-varying demand → AC power flow → 122 meters (|V|, P, Q injections, P/Q line flows at both ends) with Gaussian noise. Originals are never mutated.
2. **Attacks** – False Data Injection (falsified local bus state), Replay (stale readings), Data Manipulation (gain/offset). Ground-truth labels and tampered-meter lists are stored.
3. **Detection** – WLS state estimation → (A) χ² + largest-normalised-residual bad-data test, (B) Isolation Forest, (C) Random Forest classifier, (D) hybrid fusion.
4. **Localization** – meters mapped to buses, per-bus measurement-elimination test (standardised ΔJ) on the topology graph. The simulated target is never an input. Confidence is **not** presented as a probability (uncalibrated).
5. **Evaluation** – 1 600 seeded labelled scenarios, stratified 60/15/25 train/validation/test. Isolation Forest fitted on normal train data only; thresholds from validation only; metrics from the untouched test split.

### Known limitations
* Stealth FDI that is consistent across *all* meters (a = Hc) is not implemented – it is undetectable by residual analysis by construction.
* Low-intensity attacks and replays during flat load periods are partly undetectable; this is reflected honestly in recall (<100%).
* Frequency is a synthetic droop signal, not a dynamic simulation. Line current is derived from S/|V| in per-unit.
* Metrics describe simulated data only.

## Setup
```bash
cp .env.example .env            # DATABASE_URL for PostgreSQL
npm install
npx drizzle-kit push            # create tables
npm run build && npm start      # or: npm run dev
```
Open http://localhost:3000. On first start the AI models train (~30 s, deterministic seed 2026); the app works offline afterwards.

## Judge demo
Command Centre → **Run full demo** (reset → FDI on bus 9 → detection → classification → localization → incident stored → performance page). Or follow the pages manually: Simulator → Detection → Localization → Incidents → Performance.

## Tests
```bash
npx vitest run     # power-flow validation, attacks, detection, localization, leak-free training/evaluation
```
