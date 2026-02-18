import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  GeoJSON,
  Marker,
  Pane,
  Circle,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";

const CENTER: [number, number] = [40.6413, -73.7781];
const TRAFFIC_URL = "/api/traffic";

const TTL_MS = 10_000;
const MIN_ALT_FT = 100;
const VECTOR_MINUTES = 1;

// METAR
const METAR_URL = "/api/metar?ids=KJFK";
const METAR_POLL_MS = 60_000;

type Aircraft = {
  hex?: string;
  icao?: string;
  flight?: string;
  t?: string; // aircraft type (E145 etc)
  callsign?: string;
  lat?: number;
  lon?: number;
  track?: number;
  gs?: number;
  alt_baro?: number | string | null;
  alt_geom?: number | string | null;
  altitude?: number | string | null;
  squawk?: string | number | null;
  lastSeenMs?: number;
};

type TrafficResponse = {
  ac?: Aircraft[];
  aircraft?: Aircraft[];
};

function getAltFeet(a: Aircraft): number | null {
  const candidates = [a.alt_baro, a.alt_geom, a.altitude];
  for (const v of candidates) {
    const n =
      typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function altToStars(a: Aircraft): string {
  const alt = getAltFeet(a);
  if (alt === null) return "---";
  const hundreds = Math.round(alt / 100);
  return String(Math.max(0, Math.min(999, hundreds))).padStart(3, "0");
}

function getCallsign(a: Aircraft): string {
  const cs = (a.flight ?? a.callsign ?? "").trim();
  return cs || "UNK";
}

function getType(a: Aircraft): string {
  const s = (a.t ?? "").trim().toUpperCase();
  return s || "----";
}

function destinationPoint(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distanceMeters: number
): [number, number] {
  const R = 6371000;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (latDeg * Math.PI) / 180;
  const lon1 = (lonDeg * Math.PI) / 180;
  const dr = distanceMeters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dr) +
      Math.cos(lat1) * Math.sin(dr) * Math.cos(brng)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

function knotsToMeters(knots: number, minutes: number): number {
  const nm = knots * (minutes / 60);
  return nm * 1852;
}

function makeStarsTargetIcon(opts: {
  altText: string;
  showTag: boolean;
  callsign: string;
  type: string;
}) {
  const { altText, showTag, callsign, type } = opts;
  const dotSize = 10;

  const tagHtml = showTag
    ? `
      <div style="
        position: absolute;
        left: 24px;
        top: 6px;
        font-size: 12px;
        font-family: monospace;
        color: #00ff00;
        text-shadow: 0 0 3px rgba(0,255,0,0.6);
        white-space: pre;
        line-height: 12px;
      ">
        <pre style="margin:0; padding:0;">${callsign.padEnd(7, " ")}
${altText} ${type}</pre>
      </div>
    `
    : "";

  const html = `
    <div style="position: relative; width: 180px; height: 40px;">
      ${
        showTag
          ? ""
          : `<div style="
              position: absolute;
              left: 0px;
              top: 0px;
              font-size: 12px;
              font-family: monospace;
              color: #00ff00;
              text-shadow: 0 0 3px rgba(0,255,0,0.6);
            ">${altText}</div>`
      }

      ${tagHtml}

      <!-- Blue dot + green X -->
      <div style="
        position: absolute;
        left: 18px;
        top: 18px;
        width: ${dotSize}px;
        height: ${dotSize}px;
        background: #1e55ff;
        border-radius: 50%;
        box-shadow: 0 0 4px rgba(30,85,255,0.9);
      ">
        <div style="
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
        ">
          <svg viewBox="0 0 10 10" width="${dotSize}" height="${dotSize}">
            <path d="M2 2 L8 8 M8 2 L2 8"
              stroke="#00ff00"
              stroke-width="1.2" />
          </svg>
        </div>
      </div>
    </div>
  `;

  return L.divIcon({
    className: "",
    html,
    iconSize: [180, 40],
    iconAnchor: [23, 23],
  });
}

function MetarBox() {
  const [metar, setMetar] = useState<string>("Loading METAR…");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const fetchMetar = async () => {
      try {
        setErr(null);
        const r = await fetch(METAR_URL, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        // aviationweather.gov endpoint returns plain text by default
        const text = (await r.text()).trim();

        if (!alive) return;
        setMetar(text || "No METAR returned.");
      } catch (e) {
        if (!alive) return;
        setErr(String(e));
      }
    };

    fetchMetar();
    const id = window.setInterval(fetchMetar, METAR_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        top: 12,
        zIndex: 9999,
        pointerEvents: "none",
        fontFamily: "monospace",
        fontSize: 12,
        color: "#00ff00",
        textShadow: "0 0 3px rgba(0,255,0,0.6)",
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(0,255,0,0.25)",
        padding: "8px 10px",
        whiteSpace: "pre-wrap",
        maxWidth: 520,
      }}
    >
      {err ? `METAR error: ${err}` : metar}
    </div>
  );
}

export default function ScopeMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [aircraftMap, setAircraftMap] = useState<Record<string, Aircraft>>({});
  const [showTags, setShowTags] = useState(true);

  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    fetch("/ROBER.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setShowTags((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const iconCache = useMemo(() => new Map<string, L.DivIcon>(), []);
  useEffect(() => {
    iconCache.clear();
  }, [showTags, iconCache]);

  const getTargetIcon = (a: Aircraft) => {
    const altText = altToStars(a);
    const callsign = getCallsign(a);
    const type = getType(a);

    const cacheKey = `${altText}|${showTags}|${callsign}|${type}`;
    const cached = iconCache.get(cacheKey);
    if (cached) return cached;

    const icon = makeStarsTargetIcon({
      altText,
      showTag: showTags,
      callsign,
      type,
    });

    iconCache.set(cacheKey, icon);
    return icon;
  };

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const r = await fetch(TRAFFIC_URL, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as TrafficResponse;

        const list = (json.ac ?? json.aircraft ?? []).filter((a) => {
          if (typeof a.lat !== "number" || typeof a.lon !== "number")
            return false;
          const alt = getAltFeet(a);
          if (alt === null) return false;
          return alt >= MIN_ALT_FT;
        });

        if (!alive) return;

        setAircraftMap((prev) => {
          const now = Date.now();
          const next: Record<string, Aircraft> = { ...prev };

          for (const a of list) {
            const key =
              a.hex ??
              a.icao ??
              (a.flight?.trim() || "") ??
              `${a.lat},${a.lon}`;
            if (!key) continue;

            next[key] = { ...next[key], ...a, lastSeenMs: now };
          }

          for (const k of Object.keys(next)) {
            const last = next[k].lastSeenMs ?? 0;
            if (now - last > TTL_MS) delete next[k];
          }

          return next;
        });
      } catch (err) {
        console.error("Traffic fetch failed:", err);
      }
    };

    tick();
    intervalRef.current = window.setInterval(tick, 1000);

    return () => {
      alive = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const aircraftList = useMemo(
    () => Object.entries(aircraftMap),
    [aircraftMap]
  );

  const rangeRingsMiles = useMemo(() => {
    const rings: number[] = [];
    for (let m = 5; m <= 200; m += 5) rings.push(m);
    return rings;
  }, []);

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <MetarBox />

      <MapContainer
        center={CENTER}
        zoom={10}
        attributionControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <Pane name="rings" style={{ zIndex: 120 }}>
          {rangeRingsMiles.map((miles) => (
            <Circle
              key={miles}
              center={CENTER}
              radius={miles * 1609.344}
              pathOptions={{
                color: "#6f6f6f",
                weight: 1,
                opacity: 0.6,
                fillOpacity: 0,
              }}
              interactive={false}
            />
          ))}
        </Pane>

        <Pane name="sectors" style={{ zIndex: 200 }}>
          {geoData && (
            <GeoJSON
              data={geoData}
              style={{
                color: "#6f6f6f",
                weight: 2,
                opacity: 1,
                fillOpacity: 0,
              }}
            />
          )}
        </Pane>

        <Pane name="traffic" style={{ zIndex: 650 }}>
          {aircraftList.map(([key, a]) => {
            const pos: [number, number] = [a.lat as number, a.lon as number];

            const hasVector =
              typeof a.gs === "number" &&
              Number.isFinite(a.gs) &&
              a.gs > 0 &&
              typeof a.track === "number" &&
              Number.isFinite(a.track);

            let vectorLine: [number, number][] | null = null;
            if (hasVector) {
              const distM = knotsToMeters(a.gs!, VECTOR_MINUTES);
              const end = destinationPoint(pos[0], pos[1], a.track!, distM);
              vectorLine = [pos, end];
            }

            return (
              <div key={key}>
                {vectorLine && (
                  <Polyline
                    positions={vectorLine}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 2,
                      opacity: 0.9,
                    }}
                    interactive={false}
                  />
                )}

                <Marker
                  position={pos}
                  icon={getTargetIcon(a)}
                  interactive={false}
                />
              </div>
            );
          })}
        </Pane>
      </MapContainer>
    </div>
  );
}
