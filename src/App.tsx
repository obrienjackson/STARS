import Map from "./components/Map";
import LiveATC from "./components/LiveATC";
import { Analytics } from "@vercel/analytics/react";  

export default function App() {
  return (
    <>
      <Map />
      <LiveATC />
      <Analytics />
    </>
  );
}
