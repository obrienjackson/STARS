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
const TRAFFIC_URL = "http://localhost:3001/api/traffic";

// Keep targets for this long even if one poll misses them
const TTL_MS = 10_000;

// Filter: hide aircraft below this altitude (feet MSL)
const MIN_ALT_FT = 100;

// Velocity vector: how many minutes ahead to draw
const VECTOR_MINUTES = 1; // 1-minute vector. Try 2 or 3 if you want longer.

type Aircraft = {
  hex?: string;
  icao?: string;
  flight?: string;
  callsign?: string;
  lat?: number;
  lon?: number;
  track?: number; // degrees
  gs?: number; // knots

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

function clampHeading(h?: number) {
  const n = typeof h === "number" && Number.isFinite(h) ? h : 0;
  return ((n % 360) + 360) % 360;
}

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

function getSquawk(a: Aircraft): string {
  const s =
    typeof a.squawk === "number"
      ? String(a.squawk)
      : typeof a.squawk === "string"
      ? a.squawk.trim()
      : "";
  return s || "----";
}

// Great-circle destination point (meters) from lat/lon, bearing(deg)
function destinationPoint(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distanceMeters: number
): [number, number] {
  const R = 6371000; // meters
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
  // 1 knot = 1 NM/hr
  // NM in given minutes = knots * (minutes/60)
  const nm = knots * (minutes / 60);
  return nm * 1852; // meters
}

function makeStarsTargetIcon(opts: {
  altText: string;
  showTag: boolean;
  callsign: string;
  squawk: string;
}) {
  const { altText, showTag, callsign, squawk } = opts;

  const dotSize = 10;
  const leaderLen = 18;

  // Tag to the right, STARS-ish
  const tagHtml = showTag
    ? `
      <div style="
        position: absolute;
        left: 34px;
        top: 10px;
        font-size: 12px;
        font-family: monospace;
        color: #00ff00;
        text-shadow: 0 0 3px rgba(0,255,0,0.6);
        white-space: nowrap;
        line-height: 12px;
      ">
        <div>${callsign}</div>
        <div>${squawk}</div>
      </div>
    `
    : "";

  const html = `
    <div style="position: relative; width: 140px; height: ${
      leaderLen + dotSize + 16
    }px;">
      <!-- Altitude text -->
      <div style="
        position: absolute;
        left: 0px;
        top: 0px;
        font-size: 12px;
        font-family: monospace;
        color: #00ff00;
        text-shadow: 0 0 3px rgba(0,255,0,0.6);
      ">${altText}</div>

      ${tagHtml}

      <!-- Leader line (white) -->
      <div style="
        position: absolute;
        left: 18px;
        top: 12px;
        width: 2px;
        height: ${leaderLen}px;
        background: #ffffff;
        opacity: 0.95;
      "></div>

      <!-- Blue dot + green X -->
      <div style="
        position: absolute;
        left: ${18 - dotSize / 2}px;
        top: ${12 + leaderLen}px;
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
    iconSize: [140, leaderLen + dotSize + 16],
    iconAnchor: [18, 12 + leaderLen + dotSize / 2], // anchor at dot center
  });
}

export default function ScopeMap() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [aircraftMap, setAircraftMap] = useState<Record<string, Aircraft>>({});
  const [showTags, setShowTags] = useState(false);

  const intervalRef = useRef<number | null>(null);

  // Load sector overlay
  useEffect(() => {
    fetch("/ROBER.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch(console.error);
  }, []);

  // F1 toggles tags
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

  // Cache icons; when tags toggle, icon contents change, so include showTags in cache key
  const iconCache = useMemo(() => new Map<string, L.DivIcon>(), []);
  useEffect(() => {
    // optional: clear cache when toggling so icons update instantly
    iconCache.clear();
  }, [showTags, iconCache]);

  const getTargetIcon = (a: Aircraft) => {
    const altText = altToStars(a);
    const callsign = getCallsign(a);
    const squawk = getSquawk(a);

    const cacheKey = `${altText}|${showTags ? "T" : "F"}|${callsign}|${squawk}`;
    const cached = iconCache.get(cacheKey);
    if (cached) return cached;

    const icon = makeStarsTargetIcon({
      altText,
      showTag: showTags,
      callsign,
      squawk,
    });
    iconCache.set(cacheKey, icon);
    return icon;
  };

  // Poll traffic
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

  // Range rings every 5 miles up to 200
  const rangeRingsMiles = useMemo(() => {
    const rings: number[] = [];
    for (let m = 5; m <= 200; m += 5) rings.push(m);
    return rings;
  }, []);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer
        center={CENTER}
        zoom={10}
        attributionControl={false}
        style={{ height: "100%", width: "100%" }}
        worldCopyJump={false}
      >
        {/* Range rings pane (below sectors) */}
        <Pane name="rings" style={{ zIndex: 120 }}>
          {rangeRingsMiles.map((miles) => (
            <Circle
              key={miles}
              center={CENTER}
              radius={miles * 1609.344} // miles -> meters
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

        {/* Sector grid pane */}
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

        {/* Traffic + vectors pane (on top) */}
        <Pane name="traffic" style={{ zIndex: 650 }}>
          {aircraftList.map(([key, a]) => {
            const pos: [number, number] = [a.lat as number, a.lon as number];

            // Velocity vector
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
                {/* Vector line */}
                {vectorLine && (
                  <Polyline
                    positions={vectorLine}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 2,
                      opacity: 0.9,
                    }}
                    interactive={false}
                    pane="traffic"
                  />
                )}

                {/* Target symbol + optional tag (F1) */}
                <Marker
                  position={pos}
                  icon={getTargetIcon(a)}
                  pane="traffic"
                  interactive={false}
                  keyboard={false}
                />
              </div>
            );
          })}
        </Pane>
      </MapContainer>
    </div>
  );
}
