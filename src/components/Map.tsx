import { MapContainer, TileLayer } from "react-leaflet";

export default function Map() {
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer
        center={[40.6413, -73.7781]} // JFK airport coords
        zoom={11}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
      </MapContainer>
    </div>
  );
}
