# PV Monitoring Platform - Demo Script

**Demo Date:** December 5th, 2025
**Data Range:** November 5th - December 4th, 2025 (30 days)

---

## Quick Setup

```bash
# 1. Start services (PostgreSQL + AI Service)
docker-compose up -d

# 2. Seed demo data
cd backend && npm run seed:demo

# 3. Enable demo mode (shows data as "live" with correct greetings)
# Add to backend/.env:
export DEMO_DATE="2025-12-05T17:00:00"

# For AI service (in a separate terminal or docker-compose.override.yml):
export SOLAR_DEMO_DATE="2025-12-05T17:00:00"

# 4. Start backend (with demo mode)
DEMO_DATE="2025-12-05T17:00:00" npm run start:dev

# 5. Start AI service with demo mode (if running locally)
cd ai && SOLAR_DEMO_DATE="2025-12-05T17:00:00" uv run python server.py

# 6. Start frontend (new terminal)
cd frontend && npm run dev

# 7. Open http://localhost:5173
```

### Demo Mode

The `DEMO_DATE` / `SOLAR_DEMO_DATE` environment variables override the current time:
- **Without demo mode**: Shows "Note: This data is from December 4th (X days ago)"
- **With demo mode**: Shows data as current, greetings match 5pm ("Good afternoon!")

---

## Test Loggers

| Logger ID | Type | Personality | What to Expect |
|-----------|------|-------------|----------------|
| `GW-INV-001` | GoodWe | Star Performer | Perfect data, 30 kWh/day, no issues |
| `LTI-INV-001` | LTI | Problem Child | 10+ anomalies, error codes, outages |
| `MEIER-INV-001` | Meier | Underperformer | Declining trend, low output |
| `SD-INV-001` | SmartDog | Variable One | Spiky data, cloud effects |
| `MBMET-001` | MBMET | Weather Station | Irradiance & temperature only |

---

## Flow 1: Morning Briefing

### Test Prompts

| Prompt | Expected Behavior |
|--------|-------------------|
| `Good morning! How's my solar system doing?` | Fleet overview with all 5 loggers |
| `Give me the morning briefing` | Same as above |
| `Fleet status please` | Same as above |
| `Is everything running okay?` | Shows issues with LTI-INV-001 |

### What to Verify

- [ ] Fleet overview card displays
- [ ] Total power shown (should be ~80-100 kW combined)
- [ ] Total energy shown (should be ~95-110 kWh/day)
- [ ] Device count: 4 inverters + 1 meteo station
- [ ] Health status badge (yellow/warning due to LTI issues)
- [ ] Suggestions offered for next actions

---

## Flow 2: Financial Report

### Test Prompts

| Prompt | Expected Behavior |
|--------|-------------------|
| `How much money has GW-INV-001 made this month?` | Financial report for GoodWe |
| `Show me the financial report for my GoodWe inverter` | Same as above |
| `Calculate savings for the last 30 days` | Prompts logger selection first |
| `What are my total earnings?` | Prompts logger selection |
| `Calculate savings at $0.35 per kWh for GW-INV-001` | Custom electricity rate |

### Expected Results for GW-INV-001

| Metric | Expected Value |
|--------|----------------|
| Total Energy | ~900 kWh (30 days) |
| Savings | ~$180 (at $0.20/kWh) |
| CO₂ Offset | ~540 kg |
| Trees Equivalent | ~22 trees/year |

### What to Verify

- [ ] Financial summary card displays
- [ ] Energy total is realistic (~900 kWh)
- [ ] Savings calculation correct ($0.20 × kWh)
- [ ] CO₂ and trees metrics shown
- [ ] 7-day forecast chart renders
- [ ] Logger selection works if not specified

---

## Flow 3: Performance Audit

### Test Prompts

| Prompt | Expected Behavior |
|--------|-------------------|
| `Compare GW-INV-001 and MEIER-INV-001` | Two-logger comparison chart |
| `Compare GW-INV-001 and LTI-INV-001` | Shows GoodWe outperforming LTI |
| `Who's my best and worst performer?` | Prompts to select loggers |
| `Compare all my inverters` | 4-way comparison (excludes meteo) |
| `Which inverter is performing best?` | Ranking with best/worst identified |
| `Compare performance on December 1st` | Single-day analysis |

### Expected Rankings

1. **GW-INV-001** - ~30 kWh/day (best)
2. **SD-INV-001** - ~22 kWh/day
3. **LTI-INV-001** - ~20 kWh/day
4. **MEIER-INV-001** - ~13 kWh/day (worst)

### What to Verify

- [ ] Multi-line comparison chart renders
- [ ] Each logger has distinct color
- [ ] Best performer highlighted
- [ ] Worst performer identified
- [ ] Spread percentage shown (e.g., "53% difference")
- [ ] Summary stats (avg, peak, total) displayed

---

## Flow 4: Health Check

### Test Prompts - Single Logger

| Prompt | Expected Behavior |
|--------|-------------------|
| `Diagnose LTI-INV-001` | Shows 8-12 anomalies |
| `What's wrong with my LTI inverter?` | Same, with error codes |
| `Check health of LTI-INV-001` | Same as above |
| `Is GW-INV-001 healthy?` | "No issues found" message |
| `Diagnose my GoodWe` | Health score 100% |

### Test Prompts - Fleet-Wide

| Prompt | Expected Behavior |
|--------|-------------------|
| `Check health of all devices` | Fleet health grid |
| `Are all my inverters working properly?` | Same as above |
| `Run diagnostics on everything` | Same as above |

### Expected Results

**LTI-INV-001 (Problem Child):**
- Anomalies: 8-12 daytime outages
- Severity: WARNING or CRITICAL
- Error codes: E-201 (inverter fault), E-305 (grid disconnect)
- Affected dates: Dec 1, 2, 3, 4

**GW-INV-001 (Star Performer):**
- Anomalies: 0
- Health score: 100%
- Status: Healthy

**Fleet Summary:**
- Healthy: GW-INV-001, SD-INV-001
- Issues: LTI-INV-001 (10), MEIER-INV-001 (3)
- Avg health: ~78%

### What to Verify

- [ ] Anomaly table shows timestamps
- [ ] Error codes with descriptions displayed
- [ ] Severity badges (INFO/WARNING/CRITICAL)
- [ ] Fleet grid shows all loggers
- [ ] Health scores are realistic
- [ ] Recommendations provided for issues

---

## Demo Flow Script (5-minute presentation)

### 1. Opening - Morning Briefing (1 min)

```
You: "Good morning! How's my solar system doing today?"
```

**Talk through:**
- "Here's our fleet overview - 5 devices total"
- "We're generating about 80kW right now"
- "Notice the warning badge - let's investigate"

---

### 2. Problem Discovery - Health Check (1.5 min)

```
You: "I see there's an issue. Can you diagnose LTI-INV-001?"
```

**Talk through:**
- "The system found 10 anomalies in the last week"
- "These are daytime outages - power dropped to zero while sun was shining"
- "Error codes E-201 and E-305 indicate inverter faults"
- "Recommended action: schedule maintenance inspection"

---

### 3. Performance Comparison (1 min)

```
You: "How does LTI compare to my best inverter?"
```

Or: `"Compare GW-INV-001 and LTI-INV-001"`

**Talk through:**
- "GoodWe is producing 30 kWh/day vs LTI's 20 kWh"
- "That's a 33% difference - significant!"
- "The outages are clearly affecting production"

---

### 4. Financial Impact (1.5 min)

```
You: "How much has my GoodWe saved me this month?"
```

**Talk through:**
- "This month alone: $180 in electricity savings"
- "That's 900 kWh of clean energy"
- "We've offset 540 kg of CO₂ - equivalent to 22 trees"
- "The 7-day forecast shows continued strong production"

---

### 5. Closing - Fleet Summary

```
You: "Give me a quick health check of all devices"
```

**Talk through:**
- "2 devices healthy, 2 need attention"
- "Overall fleet health: 78%"
- "Priority action: fix LTI inverter to recover lost production"

---

## Troubleshooting

### No data showing?
```bash
# Check if data was seeded
cd backend && npx ts-node -e "
const { DataSource } = require('typeorm');
const ds = new DataSource({type:'postgres',host:'localhost',port:5432,username:'admin',password:'admin',database:'pv_db'});
ds.initialize().then(async () => {
  const count = await ds.query('SELECT COUNT(*) FROM measurements');
  console.log('Total measurements:', count[0].count);
  await ds.destroy();
});
"
```

### AI not responding?
- Check `AI_PROVIDER` in `backend/.env`
- Verify API key is set
- Check MCP service: `curl http://localhost:4000/api/health`

### Charts not rendering?
- Check browser console for errors
- Verify data has `activePowerWatts` values
- Check date range matches seed data (Nov 5 - Dec 4, 2025)

---

## Quick Reference - Logger IDs

Copy-paste ready:
- `GW-INV-001`
- `LTI-INV-001`
- `MEIER-INV-001`
- `SD-INV-001`
- `MBMET-001`
