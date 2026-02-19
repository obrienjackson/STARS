import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  GeoJSON,
  Marker,
  Pane,
  Circle,
  Polyline,
  useMap
} from 'react-leaflet'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'

export type FacilityKey = 'JFK' | 'LGA' | 'EWR'

const FACILITIES: Record<
  FacilityKey,
  {
    label: string
    center: [number, number]
    zoom: number
    metarId: string
    geojsonUrl: string
  }
> = {
  JFK: {
    label: 'JFK',
    center: [40.6413, -73.7781],
    zoom: 10,
    metarId: 'KJFK',
    geojsonUrl: '/ROBER.geojson'
  },
  LGA: {
    label: 'LGA',
    center: [40.7769, -73.874],
    zoom: 11,
    metarId: 'KLGA',
    geojsonUrl: '/HARRP.geojson'
  },
  EWR: {
    label: 'EWR',
    center: [40.6895, -74.1745],
    zoom: 10,
    metarId: 'KEWR',
    geojsonUrl: '/EWR_N90.geojson'
  }
}

const TTL_MS = 10_000
const MIN_ALT_FT = 100
const VECTOR_MINUTES = 1
const HISTORY_LENGTH = 5

// METAR
const METAR_POLL_MS = 60_000

type Aircraft = {
  hex?: string
  icao?: string
  flight?: string
  t?: string // aircraft type (E145 etc)
  callsign?: string
  lat?: number
  lon?: number
  track?: number
  gs?: number
  alt_baro?: number | string | null
  alt_geom?: number | string | null
  altitude?: number | string | null
  squawk?: string | number | null
  lastSeenMs?: number
  history?: [number, number][]
}

type TrafficResponse = {
  ac?: Aircraft[]
  aircraft?: Aircraft[]
}

function getAltFeet (a: Aircraft): number | null {
  const candidates = [a.alt_baro, a.alt_geom, a.altitude]
  for (const v of candidates) {
    const n =
      typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    if (Number.isFinite(n)) return n
  }
  return null
}

function altToStars (a: Aircraft): string {
  const alt = getAltFeet(a)
  if (alt === null) return '---'
  const hundreds = Math.round(alt / 100)
  return String(Math.max(0, Math.min(999, hundreds))).padStart(3, '0')
}

function getCallsign (a: Aircraft): string {
  const cs = (a.flight ?? a.callsign ?? '').trim()
  return cs || 'UNK'
}

function getType (a: Aircraft): string {
  const s = (a.t ?? '').trim().toUpperCase()
  return s || '----'
}

// Great-circle destination point (meters) from lat/lon, bearing(deg)
function destinationPoint (
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distanceMeters: number
): [number, number] {
  const R = 6371000 // meters
  const brng = (bearingDeg * Math.PI) / 180
  const lat1 = (latDeg * Math.PI) / 180
  const lon1 = (lonDeg * Math.PI) / 180

  const dr = distanceMeters / R

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dr) +
      Math.cos(lat1) * Math.sin(dr) * Math.cos(brng)
  )

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
    )

  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI]
}

function knotsToMeters (knots: number, minutes: number): number {
  // 1 knot = 1 NM/hr
  // NM in given minutes = knots * (minutes/60)
  const nm = knots * (minutes / 60)
  return nm * 1852 // meters
}

function makeStarsTargetIcon (opts: {
  altText: string
  showTag: boolean
  callsign: string
  type: string
}) {
  const { altText, showTag, callsign, type } = opts
  const dotSize = 10

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
        <pre style="margin:0; padding:0;">${callsign.padEnd(7, ' ')}
${altText} ${type}</pre>
      </div>
    `
    : ''

  const html = `
    <div style="position: relative; width: 180px; height: 40px;">
      ${
        showTag
          ? ''
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
  `

  return L.divIcon({
    className: '',
    html,
    iconSize: [180, 40],
    iconAnchor: [23, 23]
  })
}

function FacilitySwitcher (props: {
  facility: FacilityKey
  setFacility: (f: FacilityKey) => void
}) {
  const { facility, setFacility } = props

  const btn = (key: FacilityKey) => (
    <button
      key={key}
      onClick={() => setFacility(key)}
      style={{
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#00ff00',
        textShadow: '0 0 3px rgba(0,255,0,0.6)',
        background:
          facility === key ? 'rgba(0,255,0,0.12)' : 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(0,255,0,0.25)',
        padding: '6px 10px',
        cursor: 'pointer'
      }}
    >
      {key}
    </button>
  )

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: 12,
        zIndex: 10000,
        pointerEvents: 'auto',
        display: 'flex',
        gap: 8
      }}
    >
      {btn('JFK')}
      {btn('LGA')}
      {btn('EWR')}
    </div>
  )
}

function MetarBox ({ metarId }: { metarId: string }) {
  const [metar, setMetar] = useState<string>('Loading METAR…')
  const [err, setErr] = useState<string | null>(null)

  const metarUrl = useMemo(
    () => `/api/metar?ids=${encodeURIComponent(metarId)}`,
    [metarId]
  )

  useEffect(() => {
    let alive = true

    const fetchMetar = async () => {
      try {
        setErr(null)
        const r = await fetch(metarUrl, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const text = (await r.text()).trim()

        if (!alive) return
        setMetar(text || 'No METAR returned.')
      } catch (e) {
        if (!alive) return
        setErr(String(e))
      }
    }

    fetchMetar()
    const id = window.setInterval(fetchMetar, METAR_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [metarUrl])

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        top: 12,
        zIndex: 9999,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#00ff00',
        textShadow: '0 0 3px rgba(0,255,0,0.6)',
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(0,255,0,0.25)',
        padding: '8px 10px',
        whiteSpace: 'pre-wrap',
        maxWidth: 520
      }}
    >
      {err ? `METAR error: ${err}` : metar}
    </div>
  )
}

function RecenterMap ({
  center,
  zoom
}: {
  center: [number, number]
  zoom: number
}) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom, { animate: false })
  }, [center, zoom, map])
  return null
}

export default function ScopeMap (props: {
  facility: FacilityKey
  setFacility: (f: FacilityKey) => void
}) {
  const { facility, setFacility } = props
  const f = FACILITIES[facility]

  const TRAFFIC_URL = useMemo(
    () => `/api/traffic?lat=${f.center[0]}&lon=${f.center[1]}&dist=120`,
    [f.center]
  )

  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null)
  const [aircraftMap, setAircraftMap] = useState<Record<string, Aircraft>>({})
  const [showTags, setShowTags] = useState(true)

  const intervalRef = useRef<number | null>(null)

  // ✅ Load sector overlay for current facility (clear old, refetch, force remount)
  useEffect(() => {
    let alive = true

    // clear immediately so you can see it switch
    setGeoData(null)

    const bust = `?v=${encodeURIComponent(facility)}_${Date.now()}`
    const url = f.geojsonUrl + bust

    fetch(url, { cache: 'no-store' })
      .then(r => {
        if (!r.ok)
          throw new Error(`GeoJSON HTTP ${r.status} for ${f.geojsonUrl}`)
        return r.json()
      })
      .then(json => {
        if (!alive) return
        setGeoData(json as GeoJsonObject)
      })
      .catch(e => {
        console.error(e)
        if (!alive) return
        setGeoData(null)
      })

    return () => {
      alive = false
    }
  }, [facility, f.geojsonUrl])

  // F1 toggles tags (starts ON)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault()
        setShowTags(v => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Cache icons; when tags toggle, icon contents change, so clear cache
  const iconCache = useMemo(() => new Map<string, L.DivIcon>(), [])
  useEffect(() => {
    iconCache.clear()
  }, [showTags, iconCache])

  const getTargetIcon = (a: Aircraft) => {
    const altText = altToStars(a)
    const callsign = getCallsign(a)
    const type = getType(a)

    const cacheKey = `${altText}|${showTags ? 'T' : 'F'}|${callsign}|${type}`
    const cached = iconCache.get(cacheKey)
    if (cached) return cached

    const icon = makeStarsTargetIcon({
      altText,
      showTag: showTags,
      callsign,
      type
    })

    iconCache.set(cacheKey, icon)
    return icon
  }

  // Poll traffic
  useEffect(() => {
    let alive = true

    const tick = async () => {
      try {
        const r = await fetch(TRAFFIC_URL, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const json = (await r.json()) as TrafficResponse

        const list = (json.ac ?? json.aircraft ?? []).filter(a => {
          if (typeof a.lat !== 'number' || typeof a.lon !== 'number')
            return false

          const alt = getAltFeet(a)
          if (alt === null) return false

          return alt >= MIN_ALT_FT
        })

        if (!alive) return

        setAircraftMap(prev => {
          const now = Date.now()
          const next: Record<string, Aircraft> = { ...prev }

          for (const a of list) {
            const key =
              a.hex ?? a.icao ?? (a.flight?.trim() || '') ?? `${a.lat},${a.lon}`
            if (!key) continue

            const prev = next[key]
            const history = prev?.history ?? []
            const newHistory: [number, number][] = [
              // Newest position comes from PREVIOUS state
              ...(prev?.lat && prev?.lon
                ? ([[prev.lat, prev.lon]] as [number, number][])
                : []),
              ...history
            ].slice(0, HISTORY_LENGTH)

            next[key] = { ...prev, ...a, lastSeenMs: now, history: newHistory }
          }

          for (const k of Object.keys(next)) {
            const last = next[k].lastSeenMs ?? 0
            if (now - last > TTL_MS) delete next[k]
          }

          return next
        })
      } catch (err) {
        console.error('Traffic fetch failed:', err)
      }
    }

    tick()
    intervalRef.current = window.setInterval(tick, 1000)

    return () => {
      alive = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [TRAFFIC_URL])

  const aircraftList = useMemo(() => Object.entries(aircraftMap), [aircraftMap])

  // Range rings every 5 miles up to 200
  const rangeRingsMiles = useMemo(() => {
    const rings: number[] = []
    for (let m = 5; m <= 200; m += 5) rings.push(m)
    return rings
  }, [])

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <MetarBox metarId={f.metarId} />
      <FacilitySwitcher facility={facility} setFacility={setFacility} />

      <MapContainer
        center={f.center}
        zoom={f.zoom}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
        worldCopyJump={false}
      >
        <RecenterMap center={f.center} zoom={f.zoom} />

        {/* Range rings pane (below sectors) */}
        <Pane name='rings' style={{ zIndex: 120 }}>
          {rangeRingsMiles.map(miles => (
            <Circle
              key={miles}
              center={f.center}
              radius={miles * 1609.344} // miles -> meters
              pathOptions={{
                color: '#6f6f6f',
                weight: 1,
                opacity: 0.6,
                fillOpacity: 0
              }}
              interactive={false}
            />
          ))}
        </Pane>

        {/* Sector grid pane */}
        <Pane name='sectors' style={{ zIndex: 200 }}>
          {geoData && (
            <GeoJSON
              key={facility} // ✅ FORCE REMOUNT so Leaflet replaces the layer
              data={geoData}
              style={{
                color: '#6f6f6f',
                weight: 2,
                opacity: 1,
                fillOpacity: 0
              }}
              pointToLayer={(_feature, latlng) => {
                if (facility === 'LGA' || facility === 'EWR') {
                  // Don't create a visible marker for points for LGA and EWR
                  return L.marker(latlng, { opacity: 0, interactive: false })
                }
                // Default marker for other facilities (JFK)
                return L.marker(latlng)
              }}
            />
          )}
        </Pane>

        {/* Traffic + vectors pane (on top) */}
        <Pane name='traffic' style={{ zIndex: 650 }}>
          {aircraftList.map(([key, a]) => {
            const pos: [number, number] = [a.lat as number, a.lon as number]

            // Velocity vector
            const hasVector =
              typeof a.gs === 'number' &&
              Number.isFinite(a.gs) &&
              a.gs > 0 &&
              typeof a.track === 'number' &&
              Number.isFinite(a.track)

            let vectorLine: [number, number][] | null = null
            if (hasVector) {
              const distM = knotsToMeters(a.gs!, VECTOR_MINUTES)
              const end = destinationPoint(pos[0], pos[1], a.track!, distM)
              vectorLine = [pos, end]
            }

            return (
              <div key={key}>
                {/* Vector line */}
                {vectorLine && (
                  <Polyline
                    positions={vectorLine}
                    pathOptions={{
                      color: '#ffffff',
                      weight: 2,
                      opacity: 0.9
                    }}
                    interactive={false}
                    pane='traffic'
                  />
                )}

                {/* History trail */}
                {a.history?.map((histPos, i) => (
                  <Circle
                    key={i}
                    center={histPos}
                    radius={45} // Adjust size as needed
                    pathOptions={{
                      color: '#1e55ff', // Blue color
                      fillColor: '#1e55ff',
                      fillOpacity: 0.7 - i * 0.14,
                      weight: 0
                    }}
                    interactive={false}
                  />
                ))}

                {/* Target symbol + optional tag (F1) */}
                <Marker
                  position={pos}
                  icon={getTargetIcon(a)}
                  pane='traffic'
                  interactive={false}
                  keyboard={false}
                />
              </div>
            )
          })}
        </Pane>
      </MapContainer>
    </div>
  )
}
