import { useState } from 'react'
import Map from './components/Map'
import LiveATC from './components/LiveATC'
import { Analytics } from '@vercel/analytics/react'
import type { FacilityKey } from './components/Map'

export default function App () {
  const [facility, setFacility] = useState<FacilityKey>('JFK')

  return (
    <>
      <Map facility={facility} setFacility={setFacility} />
      <LiveATC facility={facility} />
      <Analytics />
    </>
  )
}
