# Connect your Apple Watch to Cortex Arena

This walks you through wiring real Apple Watch heart rate samples into the
**Heart Rate** card. Two paths — pick one:

- **Health Auto Export** (recommended) — third-party iOS app, ~$3 one-time
  for the REST API automation, real-time push from HealthKit, two-minute
  setup. [Jump to the Health Auto Export setup ↓](#path-a--health-auto-export-recommended)
- **iOS Shortcut + Personal Automation** — free, hand-built, ~10-minute
  setup, runs on whatever cadence you set. [Jump to the Shortcut setup ↓](#path-b--ios-shortcut-free)

Either way, no Apple Developer account, no Xcode, no extra app on the watch.

> The flow: **Apple Watch → iPhone Health → iOS Shortcut → Cortex Arena**

Latency is ~30–90 seconds per sample (that's HealthKit's normal cadence while
the watch is worn — fine for a cognitive OS).

---

## Path A — Health Auto Export (recommended)

[Health Auto Export](https://www.healthexportapp.com/) is a well-maintained
iOS app that subscribes to HealthKit and pushes samples to a REST endpoint as
they arrive. The "REST API Automation" feature is behind a one-time
in-app-purchase (~$3 last we checked). Worth it.

### A1 — Find your Mac's address

Same as the Shortcut path — get the LAN IP your iPhone can reach:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Look for `192.168.x.x` (home Wi-Fi) or `10.x.x.x`. If you're on Tailscale,
use the Tailscale 100.x.x.x address — it works regardless of network.

Your POST URL is:

```
http://<your-mac-address>:4000/api/biometrics/health-auto-export
```

### A2 — Configure Health Auto Export

1. Install **Health Auto Export** from the App Store.
2. Open it. Grant Health permissions for at least **Heart Rate** and
   **Heart Rate Variability**.
3. Tap **Automations** at the bottom → **+** → **REST API**.
4. Fill in:
   - **URL:** the URL from A1
   - **Method:** `POST`
   - **Data Type:** `JSON`
   - **Aggregation:** `Single Values` (we want individual samples, not daily summaries)
   - **Frequency:** `Real-Time` (the most useful option — pushes as samples land)
5. Under **Data Types**, enable:
   - `Heart Rate`
   - `Heart Rate Variability` (optional but recommended)
6. Save.
7. Tap **Run Now** once to verify. You should immediately see a green "ok"
   from the server and the Heart Rate card should show your current BPM.

### A3 — Watch the dashboard

Within seconds:
- The Heart Rate card source label flips to **Apple Watch · Health Auto Export** (or whatever Health Auto Export reports).
- The Timeline panel gets a one-time **"Apple Watch connected"** entry.
- Every new HealthKit sample updates the card live, with HRV alongside.

That's it. Wear the watch through the demo — judges see your real BPM
respond to whatever's happening in the room.

### How the payload is handled

Health Auto Export's body looks roughly like:

```json
{
  "data": {
    "metrics": [
      { "name": "heart_rate", "units": "count/min", "data": [{ "qty": 72, "date": "...", "source": "Apple Watch" }] },
      { "name": "heart_rate_variability", "units": "ms", "data": [{ "qty": 58, "date": "..." }] }
    ]
  }
}
```

The Cortex endpoint pulls the latest sample from each metric, clamps the
values to safe ranges, preserves the original timestamp and source, and
emits a single `biometrics:hr` event into the system. No data is persisted.

---

## Path B — iOS Shortcut (free)

This is the manual approach. Works fine; just needs you to build the chain.

### Step 1 — Pick the URL the Shortcut will POST to

On the Mac running Cortex Arena (the same machine the dashboard is open on),
open a terminal and run:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Find your LAN IP (something like `192.168.1.42` or `10.0.0.18`). Your POST URL is:

```
http://<your-mac-lan-ip>:4000/api/biometrics/heart-rate
```

If your iPhone is on **Tailscale** and so is your Mac, use the Tailscale name
or 100.x.x.x address instead — that works even off Wi-Fi.

To verify the endpoint is alive, on the Mac:

```bash
curl http://localhost:4000/api/biometrics/heart-rate/endpoint
```

That returns the canonical URL Cortex expects.

---

### Step 2 — Build the Shortcut on your iPhone

Open the **Shortcuts** app on your iPhone (the watch will run it via the
paired iPhone — no need to install anything on the watch itself).

Tap **+** to create a new Shortcut and add these actions in order:

### 1. Find Health Samples Where

- **Sample Type:** `Heart Rate`
- **Sort by:** `End Date` · `Latest First`
- **Limit:** `1`

### 2. Get Quantity from Health Samples

- Source: the result of Step 1.
- This returns one quantity like `72 count/min`.

### 3. Get Numbers from Input

- Source: the result of Step 2.
- This strips the unit so you're left with the raw number, e.g. `72`.

### 4. Dictionary

Tap **+** to add a dictionary with two key/value pairs:

| Key | Type | Value |
|---|---|---|
| `bpm` | Number | the result of Step 3 |
| `source` | Text | `Apple Watch (iPhone Shortcut)` |

### 5. Get Contents of URL

- **URL:** the URL from Step 1, e.g. `http://192.168.1.42:4000/api/biometrics/heart-rate`
- Tap **Show More**:
  - **Method:** `POST`
  - **Request Body:** `JSON`
  - **Body fields:** drop the Dictionary from Step 4 in here

That's it. Tap **Done**. Run the Shortcut once with the **Play** button — you
should see a green "ok" on the Heart Rate card in the dashboard within seconds.

---

### Step 3 — Make it automatic

Two options. Pick whichever fits your demo style.

### Option A — Personal Automation (recommended)

In the Shortcuts app, tap **Automation** at the bottom. Add a new personal
automation:

- **Time of Day** → every minute (or every 5 minutes — your call)
- **Run Immediately** → ON
- **Notify When Run** → OFF (so it's silent)
- Action: **Run Shortcut** → pick the one you just built

Now the latest heart rate is pushed every minute, hands-free.

### Option B — Add to Watch face

Add the Shortcut to your watch's Smart Stack or a complication. One tap on
the watch fires it. Good if you want to demo "I just looked at my watch and
Cortex saw it."

---

### Step 4 — (Optional) HRV alongside HR

To also send HRV, in Step 1 use Sample Type **Heart Rate Variability SDNN**
instead, copy the result into a second variable, and add a `hrv` key to the
dictionary in Step 4 with that value. Cortex accepts:

```json
{ "bpm": 72, "hrv": 58, "source": "Apple Watch" }
```

`hrv` is in milliseconds.

---

## Endpoint reference

```
POST /api/biometrics/heart-rate
Content-Type: application/json

{
  "bpm":       72,            // required, 30–220
  "hrv":       58,            // optional, ms
  "timestamp": 1700000000000, // optional, epoch ms (defaults to server clock)
  "source":    "Apple Watch"  // optional, displayed in UI
}
```

Auth: by default the endpoint is open on localhost / Tailscale. To require a
shared secret, set `BIOMETRICS_TOKEN=<your-token>` in `server/.env` and add an
`Authorization: Bearer <your-token>` header in the Shortcut's
"Get Contents of URL" action.

---

## What happens when a real sample arrives

- The Heart Rate card source label flips from **Apple Watch Sim** to
  **Apple Watch · HealthKit**.
- The first real sample logs a **"Apple Watch connected"** entry in the
  Timeline panel so the moment is visible.
- The simulated biometric stream continues running, but the cognitive load
  model now sees your real BPM until ~90 seconds of silence — at which point
  it gracefully falls back to sim so the demo doesn't blank out.
- The same `bpm` value flows through the Cognitive Load score and the
  Nemotron agent's `check_heart_rate_state` reasoning step.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Shortcut shows "Couldn't communicate" | Phone isn't on the same Wi-Fi (or Tailscale) as the Mac. Check both. |
| Shortcut returns 401 | You set `BIOMETRICS_TOKEN` but the Shortcut isn't sending the header. |
| Card still says "Apple Watch Sim" after success | Server might be stale — restart `npm run dev`. |
| Watch hasn't recorded HR recently | Wear the watch tighter, or open the Workout app for a minute to force fresh readings. |

---

Once it works, **wear the watch through the demo** — judges will see the
heart rate respond to whatever's happening in the room.
