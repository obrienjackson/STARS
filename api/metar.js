export default async function handler(req, res) {
  try {
    const ids = String(req.query.ids ?? "KJFK").trim() || "KJFK";
    const url = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(
      ids
    )}`;

    const r = await fetch(url, {
      headers: {
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
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    return res.status(200).send(text);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "METAR proxy failed" });
  }
}
