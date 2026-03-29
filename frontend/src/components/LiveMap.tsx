import { useEffect, useMemo, useRef, useState } from "react";

import { getGoogleMapsConfig, loadGoogleMapsApi } from "../lib/googleMaps";
import type { MapMarkerSpec, MapPolylineSpec } from "../lib/types";

export function LiveMap({
  title,
  subtitle,
  markers,
  polylines = [],
  emptyMessage = "Map data will appear once live coordinates are available.",
  mapUnavailableMessage = null,
  height = 360,
  allowEmptyMap = false,
}: {
  title: string;
  subtitle: string;
  markers: MapMarkerSpec[];
  polylines?: MapPolylineSpec[];
  emptyMessage?: string;
  mapUnavailableMessage?: string | null;
  height?: number;
  allowEmptyMap?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<Array<{ setMap?: (map: any) => void; map?: any }>>([]);
  const viewportSignatureRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [viewportVersion, setViewportVersion] = useState(0);
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
        gestureHandling: "greedy",
      });
      setIsReady(true);
      setError(null);

      if (markerPayload.length === 0 && allowEmptyMap && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!cancelled && mapRef.current) {
              mapRef.current.setCenter({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              });
              mapRef.current.setZoom(14);
            }
          },
          () => {
            // Keep default center when geolocation is unavailable.
          },
          { enableHighAccuracy: true, maximumAge: 8000, timeout: 5000 },
        );
      }
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
      viewportSignatureRef.current = null;
      if (allowEmptyMap) {
        return;
      }
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    const nextViewportSignature = JSON.stringify({
      markerIds: markerPayload.map((marker) => marker.id).sort(),
      polylineIds: polylinePayload.map((polyline) => polyline.id).sort(),
      viewportVersion,
    });

    for (const marker of markerPayload) {
      const mapMarker = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: marker.latitude, lng: marker.longitude },
        title:
          typeof marker.badgeCount === "number"
            ? `${marker.title} (${marker.badgeCount} passenger${marker.badgeCount === 1 ? "" : "s"})`
            : marker.title,
        icon: buildMarkerIcon(google, marker),
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

    if (!bounds.isEmpty() && viewportSignatureRef.current !== nextViewportSignature) {
      mapRef.current.fitBounds(bounds, 48);
      google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
        const maxZoom =
          markerPayload.length <= 1 && polylinePayload.length === 0 ? 14 : 16;
        if (typeof mapRef.current?.getZoom === "function" && mapRef.current.getZoom() > maxZoom) {
          mapRef.current.setZoom(maxZoom);
        }
      });
      viewportSignatureRef.current = nextViewportSignature;
    }
  }, [isReady, markerPayload, polylinePayload, viewportVersion]);

  function handleRecenter() {
    if (markerPayload.length > 0 || polylinePayload.length > 0) {
      setViewportVersion((current) => current + 1);
      return;
    }
    if (!mapRef.current || !navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.setCenter({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        mapRef.current?.setZoom(14);
      },
      () => {
        // Ignore recenter failures to avoid blocking map usage.
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 },
    );
  }

  return (
    <section className="panel map-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Live Map</p>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {(markers.length > 0 || polylines.length > 0 || allowEmptyMap) && (
          <button
            className="ghost-button"
            onClick={handleRecenter}
            type="button"
          >
            Recenter
          </button>
        )}
      </div>
      {error ? (
        <div className="map-empty"><div className="map-empty-content">{error}</div></div>
      ) : mapUnavailableMessage ? (
        <div className="map-empty"><div className="map-empty-content">{mapUnavailableMessage}</div></div>
      ) : markers.length === 0 && polylines.length === 0 && !allowEmptyMap ? (
        <div className="map-empty"><div className="map-empty-content">{emptyMessage}</div></div>
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

function buildMarkerIcon(google: any, marker: MapMarkerSpec) {
  const label = (marker.markerLabel || marker.title.slice(0, 1)).toUpperCase();
  const badgeMarkup =
    typeof marker.badgeCount === "number"
      ? `<circle cx="34" cy="10" r="8" fill="#0b1826" stroke="#ffffff" stroke-width="1.5" /><text x="34" y="13" text-anchor="middle" font-size="9" font-family="Segoe UI, Arial, sans-serif" fill="#ffffff">${marker.badgeCount}</text>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="18" cy="22" r="14" fill="${markerColor(
    marker.tone,
  )}" stroke="#ffffff" stroke-width="2" /><text x="18" y="26" text-anchor="middle" font-size="12" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#07111f">${label}</text>${badgeMarkup}</svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(44, 44),
    anchor: new google.maps.Point(18, 22),
  };
}
