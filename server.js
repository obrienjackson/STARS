import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

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

app.listen(3001, () => {
  console.log("Proxy running on http://localhost:3001");
  console.log("Traffic endpoint: http://localhost:3001/api/traffic");
});
