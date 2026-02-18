import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
// add near the top, after app.use(cors())
app.get("/favicon.ico", (_req, res) => res.status(204).end());


// JFK center + ~50 statute miles ≈ 44 NM
const JFK = { lat: 40.6413, lon: -73.7781 };
const DIST_NM = 44;

app.get("/api/traffic", async (_req, res) => {
  try {
    const url = `https://opendata.adsb.fi/api/v3/lat/${JFK.lat}/lon/${JFK.lon}/dist/${DIST_NM}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "jfk-adsb-scope (personal use)",
      },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `adsb.fi HTTP ${r.status}` });
    }

    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Proxy failed" });
  }
});

// ---- METAR proxy (aviationweather.gov) ----
// Usage: http://localhost:3001/api/metar?ids=KJFK
app.get("/api/metar", async (req, res) => {
  try {
    const ids = String(req.query.ids ?? "KJFK").trim() || "KJFK";

    const url = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(
      ids
    )}`;

    const r = await fetch(url, {
      headers: {
        // not strictly required, but nice to include
        "User-Agent": "jfk-adsb-scope (personal use)",
        Accept: "text/plain",
      },
    });

    if (!r.ok) {
      return res
        .status(r.status)
        .json({ error: `aviationweather HTTP ${r.status}` });
    }

    const text = (await r.text()).trim();

    // Return plain text so the frontend can just .text() it
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (err) {
    console.error("METAR proxy error:", err);
    res.status(500).json({ error: "METAR proxy failed" });
  }
});


app.listen(3001, () => {
  console.log("Proxy running on http://localhost:3001");
  console.log("Traffic endpoint: http://localhost:3001/api/traffic");
  console.log("METAR endpoint:  http://localhost:3001/api/metar?ids=KJFK");
});
