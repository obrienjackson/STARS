import Map from "./components/Map";
import LiveATC from "./components/LiveATC";
import { Analytics } from "@vercel/analytics/next"

export default function App() {
  return (
    <>
      <Map />
      <LiveATC />
      <Analytics />
    </>
  );
}
