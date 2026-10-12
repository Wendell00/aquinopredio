"use client";

import "leaflet/dist/leaflet.css";
import { divIcon, type LatLngExpression } from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

/** Pino desenhado em HTML (evita os PNGs padrão do Leaflet, que quebram com bundlers). */
const pinIcon = divIcon({
  className: "",
  html: `<span style="display:block;width:28px;height:28px;border-radius:50% 50% 50% 0;background:#d63700;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 10px rgba(60,35,20,.35)"></span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function Recenter({ center }: { center: LatLngExpression }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

function ClickToMove({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onChange(event.latlng.lat, event.latlng.lng) });
  return null;
}

export default function PinMap({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}): React.JSX.Element {
  const center: LatLngExpression = [lat, lng];
  return (
    <MapContainer
      center={center}
      zoom={18}
      scrollWheelZoom={false}
      className="h-72 w-full rounded-xl border border-line"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Marker
        position={center}
        icon={pinIcon}
        draggable
        eventHandlers={{
          dragend: (event) => {
            const { lat: newLat, lng: newLng } = event.target.getLatLng();
            onChange(newLat, newLng);
          },
        }}
        keyboard
        title="Arraste para a entrada do prédio"
      />
      <Recenter center={center} />
      <ClickToMove onChange={onChange} />
    </MapContainer>
  );
}
