import type { FacilityKey } from './Map'

const ALL_FEEDS: Record<FacilityKey, { label: string; url: string }[]> = {
  JFK: [
    {
      label: 'TWR 1',
      url: 'https://www.liveatc.net/hlisten.php?mount=kjfk_twr&icao=kjfk'
    },
    {
      label: 'TWR 2',
      url: 'https://www.liveatc.net/hlisten.php?mount=kjfk_twr3&icao=kjfk'
    },
    {
      label: 'NY APP CAMRN #1',
      url: 'https://www.liveatc.net/hlisten.php?mount=kjfk9_app_camrn&icao=kjfk'
    },
    {
      label: 'NY APP FINAL #1',
      url: 'https://www.liveatc.net/hlisten.php?mount=kjfk_bw_app_final&icao=kjfk'
    },
    {
      label: 'NY APP ROBER #1',
      url: 'https://www.liveatc.net/hlisten.php?mount=kjfk9_app_rober&icao=kjfk'
    },
    {
      label: 'NY DEP',
      url: 'https://www.liveatc.net/hlisten.php?mount=kjfk_dep&icao=kjfk'
    }
  ],
  LGA: [
    {
      label: 'LGA TWR',
      url: 'https://www.liveatc.net/hlisten.php?mount=klga_twr&icao=klga'
    },
    {
      label: 'KLGA Departure',
      url: 'https://www.liveatc.net/hlisten.php?mount=klga_ny_dep&icao=klga'
    },
    {
      label: 'New York Approach (HAARP)',
      url: 'https://www.liveatc.net/hlisten.php?mount=klga_ny_app&icao=klga'
    },
    {
      label: 'New York Approach (EMPYR)',
      url: 'https://www.liveatc.net/hlisten.php?mount=kewr_klga_app_empyr&icao=klga'
    }
  ],
  EWR: [
    {
      label: 'EWR TWR',
      url: 'https://www.liveatc.net/hlisten.php?mount=kewr_twr&icao=kewr'
    },
    {
      label: 'Newark Departure',
      url: 'https://www.liveatc.net/hlisten.php?mount=kewr_dep&icao=kewr'
    },
    {
      label: 'New York Approach (EMPYR)',
      url: 'https://www.liveatc.net/hlisten.php?mount=kewr_klga_app_empyr&icao=kewr'
    },
    {
      label: 'Newark Approach (N. Arrival)',
      url: 'https://www.liveatc.net/hlisten.php?mount=kewr_app_n&icao=kewr'
    },
    {
      label: 'Newark Approach (ARD Sector)',
      url: 'https://www.liveatc.net/hlisten.php?mount=kewr_app_ard2&icao=kewr'
    },
    {
      label: 'Newark Approach (EWR Final)',
      url: 'https://www.liveatc.net/hlisten.php?mount=kewr_app_final&icao=kewr'
    },
    {
      label: 'Newark Approach (MUGZY Sector)',
      url: 'https://www.liveatc.net/hlisten.php?mount=kewr_app_mugzy&icao=kewr'
    }
  ]
}

export default function LiveATC ({ facility }: { facility: FacilityKey }) {
  const feeds = ALL_FEEDS[facility] ?? []

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: 52,
        zIndex: 9999,
        width: 260,
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#00ff00',
        textShadow: '0 0 3px rgba(0,255,0,0.6)',
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(0,255,0,0.25)',
        padding: '10px',
        pointerEvents: 'auto'
      }}
    >
      <div style={{ marginBottom: 8 }}>LIVEATC (opens new tab)</div>

      <div style={{ display: 'grid', gap: 6 }}>
        {feeds.map(feed => (
          <a
            key={feed.url}
            href={feed.url}
            target='_blank'
            rel='noreferrer'
            style={{
              color: '#00ff00',
              textDecoration: 'none',
              border: '1px solid rgba(0,255,0,0.18)',
              padding: '6px 8px',
              background: 'rgba(0,0,0,0.25)',
              display: 'block'
            }}
          >
            {feed.label}
          </a>
        ))}
      </div>
    </div>
  )
}
