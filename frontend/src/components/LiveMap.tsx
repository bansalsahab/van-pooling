import { useEffect, useMemo, useRef, useState } from "react";

import { getGoogleMapsConfig, loadGoogleMapsApi } from "../lib/googleMaps";
import type { MapMarkerSpec, MapPolylineSpec } from "../lib/types";

export function LiveMap({
  title,
  subtitle,
  markers,
  polylines = [],
  emptyMessage = "Map data will appear once live coordinates are available.",
  height = 360,
}: {
  title: string;
  subtitle: string;
  markers: MapMarkerSpec[];
  polylines?: MapPolylineSpec[];
  emptyMessage?: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<Array<{ setMap?: (map: any) => void; map?: any }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const markerPayload = useMemo(() => markers, [markers]);
  const polylinePayload = useMemo(() => polylines, [polylines]);

  useEffect(() => {
    let cancelled = false;

    async function setupMap() {
      if (!containerRef.current) {
        return;
      }

      const google = await loadGoogleMapsApi();
      if (cancelled) {
        return;
      }
      if (!google) {
        setError("Add `VITE_GOOGLE_MAPS_API_KEY` to enable live maps.");
        return;
      }

      const { mapId } = getGoogleMapsConfig();
      mapRef.current = new google.maps.Map(containerRef.current, {
        center: { lat: markerPayload[0]?.latitude || 12.9716, lng: markerPayload[0]?.longitude || 77.5946 },
        zoom: 12,
        mapId,
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: false,
      });
      setIsReady(true);
      setError(null);
    }

    void setupMap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.google?.maps) {
      return;
    }

    const google = window.google;
    for (const overlay of overlaysRef.current) {
      if (typeof overlay.setMap === "function") {
        overlay.setMap(null);
      } else if ("map" in overlay) {
        overlay.map = null;
      }
    }
    overlaysRef.current = [];

    if (markerPayload.length === 0 && polylinePayload.length === 0) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    for (const marker of markerPayload) {
      const mapMarker = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: marker.latitude, lng: marker.longitude },
        title: marker.title,
        label: marker.title.slice(0, 1).toUpperCase(),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: markerColor(marker.tone),
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 10,
        },
      });
      overlaysRef.current.push(mapMarker);
      bounds.extend(mapMarker.getPosition() as any);
    }

    for (const polyline of polylinePayload) {
      const path =
        polyline.encodedPath && google.maps.geometry?.encoding
          ? google.maps.geometry.encoding.decodePath(polyline.encodedPath)
          : (polyline.points || []).map((point) => ({
              lat: point.latitude,
              lng: point.longitude,
            }));
      const route = new google.maps.Polyline({
        map: mapRef.current,
        path,
        strokeColor: polyline.color || "#58b6ff",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      });
      overlaysRef.current.push(route);
      for (const point of path) {
        bounds.extend(point);
      }
    }

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, 48);
    }
  }, [isReady, markerPayload, polylinePayload]);

  return (
    <section className="panel map-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Live Map</p>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {error ? (
        <div className="map-empty">{error}</div>
      ) : markers.length === 0 && polylines.length === 0 ? (
        <div className="map-empty">{emptyMessage}</div>
      ) : (
        <div
          className="map-canvas"
          ref={containerRef}
          style={{ minHeight: `${height}px` }}
        />
      )}
    </section>
  );
}

function markerColor(tone?: MapMarkerSpec["tone"]) {
  switch (tone) {
    case "pickup":
      return "#ff8a4c";
    case "destination":
      return "#56de93";
    case "warning":
      return "#ff5d74";
    case "van":
      return "#58b6ff";
    default:
      return "#b7c7d9";
  }
}
