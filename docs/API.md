# GRID SHIELD AI – API reference

All endpoints live under `/api`, return JSON, and use one envelope:

```json
{ "ok": true,  "data": { } }
{ "ok": false, "error": { "code": "validation_error", "message": "…", "details": [{ "path": "targetBus", "message": "…" }] } }
```
Request bodies are validated with **Zod** (the TypeScript counterpart of Pydantic). Exports (`csv`/`pdf`) return files.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health + DB connectivity |
| GET | `/api/grid/status` | Command-centre summary (status, alerts, timeline, incidents) |
| GET | `/api/grid/topology` | IEEE 14-bus buses, branches, π-model parameters |
| GET | `/api/grid/measurements[?meters=1]` | Current frame: estimated state, original vs observed readings, live AI analysis |
| GET | `/api/grid/buses/{id}` | Bus inspector (meters, lines, neighbours); 404 if id ∉ 1..14 |
| POST | `/api/simulation/start` | New isolated session in normal condition |
| POST | `/api/simulation/stop` | Stop the active simulated attack |
| POST | `/api/simulation/reset` | Stop attacks, start a clean session |
| POST | `/api/attacks/launch` | `{attackType, targetBus, intensity, measurementGroups[], sign?}` |
| GET | `/api/attacks/history` | Stored attack events (ground truth + snapshot) |
| POST | `/api/detection/run` | BDD + Isolation Forest + Random Forest + hybrid; persisted |
| GET | `/api/detection/results` | Stored detection results |
| POST | `/api/localization/run` | `{detectionId?}` – localization from observed data only |
| GET | `/api/localization/results` | Stored localization results |
| GET | `/api/incidents` | Filters: `q, from, to, attackType, severity, status` |
| POST | `/api/incidents` | `{detectionId, localizationId}` → create incident |
| GET/PATCH | `/api/incidents/{id}` | Detail / update status |
| GET | `/api/incidents/export?format=csv\|pdf` | Filtered export |
| POST | `/api/reports/export` | `{format, incidentIds?}` |
| GET | `/api/models/metrics` | Measured held-out metrics (trains on first use) |
| POST | `/api/models/train` | Retrain + re-evaluate |
| POST | `/api/demo/run` | Preconfigured offline judge scenario |

Live updates: the UI refreshes `/api/grid/measurements` on an interval (configurable in Settings) and
shows connection loss / automatic recovery in the top bar.
