export default async function handler(_req, res) {
  try {
    const JFK = { lat: 40.6413, lon: -73.7781 };
    const DIST_NM = 44;

    const url = `https://opendata.adsb.fi/api/v3/lat/${JFK.lat}/lon/${JFK.lon}/dist/${DIST_NM}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "jfk-adsb-scope (personal use)" },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `adsb.fi HTTP ${r.status}` });
    }

    const data = await r.json();

    // tiny CDN cache to reduce rate-limit pain
    res.setHeader("Cache-Control", "s-maxage=1, stale-while-revalidate=10");
    return res.status(200).json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Proxy failed" });
  }
}
