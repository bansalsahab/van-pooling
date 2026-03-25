let googleMapsPromise: Promise<typeof window.google | null> | null = null;

export function getGoogleMapsConfig() {
  return {
    apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || "",
    mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || undefined,
  };
}

export async function loadGoogleMapsApi(): Promise<typeof window.google | null> {
  const { apiKey } = getGoogleMapsConfig();
  if (!apiKey) {
    return null;
  }

  if (window.google?.maps) {
    return window.google;
  }

  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const callbackName = "__vanPoolGoogleMapsLoaded";
      const globalWindow = window as unknown as Window & Record<string, unknown>;
      globalWindow[callbackName] = () => {
        resolve(window.google);
      };

      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-vanpool-google-maps="true"]',
      );
      if (existing) {
        existing.addEventListener("load", () => resolve(window.google));
        existing.addEventListener("error", () =>
          reject(new Error("Could not load Google Maps.")),
        );
        return;
      }

      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
      script.dataset.vanpoolGoogleMaps = "true";
      script.src =
        "https://maps.googleapis.com/maps/api/js?" +
        new URLSearchParams({
          key: apiKey,
          libraries: "geometry",
          v: "weekly",
          callback: callbackName,
        }).toString();
      script.onerror = () => reject(new Error("Could not load Google Maps."));
      document.head.appendChild(script);
    });
  }

  return googleMapsPromise;
}
