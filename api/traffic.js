export default async function handler(req, res) {
  try {
    const lat = Number(req.query.lat ?? 40.6413);
    const lon = Number(req.query.lon ?? -73.7781);
    const dist = Number(req.query.dist ?? 50);

    const url = `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${dist}`;

    const r = await fetch(url, {
      headers: { "User-Agent": "stars-scope (personal use)" },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `adsb.fi HTTP ${r.status}` });
    }

    const data = await r.json();

    res.setHeader("Cache-Control", "s-maxage=1, stale-while-revalidate=10");
    return res.status(200).json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Proxy failed" });
  }
}
