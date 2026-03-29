let googleMapsPromise: Promise<typeof window.google | null> | null = null;
const GOOGLE_MAPS_SCRIPT_SELECTOR = 'script[data-vanpool-google-maps="true"]';
const GOOGLE_MAPS_CALLBACK = "__vanPoolGoogleMapsLoaded";
const GOOGLE_MAPS_TIMEOUT_MS = 12_000;

type GoogleMapsWindow = Window &
  Record<string, unknown> & {
    gm_authFailure?: () => void;
  };

export function getGoogleMapsConfig() {
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim();
  return {
    apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || "",
    mapId:
      mapId && mapId !== "DEMO_MAP_ID" && mapId !== "YOUR_MAP_ID"
        ? mapId
        : undefined,
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
      const globalWindow = window as unknown as GoogleMapsWindow;
      const previousAuthFailure =
        typeof globalWindow.gm_authFailure === "function"
          ? globalWindow.gm_authFailure
          : null;
      let timeoutId: number | null = null;
      let settled = false;
      let script = document.querySelector<HTMLScriptElement>(GOOGLE_MAPS_SCRIPT_SELECTOR);

      if (script?.dataset.vanpoolStatus === "error") {
        script.remove();
        script = null;
      }

      const cleanup = () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (script) {
          script.removeEventListener("load", handleScriptLoad);
          script.removeEventListener("error", handleScriptError);
        }
        if (globalWindow[GOOGLE_MAPS_CALLBACK] === handleCallback) {
          delete globalWindow[GOOGLE_MAPS_CALLBACK];
        }
        if (globalWindow.gm_authFailure === handleAuthFailure) {
          if (previousAuthFailure) {
            globalWindow.gm_authFailure = previousAuthFailure;
          } else {
            delete globalWindow.gm_authFailure;
          }
        }
      };

      const resolveLoaded = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (script) {
          script.dataset.vanpoolStatus = "loaded";
        }
        cleanup();
        resolve(window.google);
      };

      const rejectLoad = (message: string) => {
        if (settled) {
          return;
        }
        settled = true;
        if (script) {
          script.dataset.vanpoolStatus = "error";
        }
        cleanup();
        googleMapsPromise = null;
        reject(new Error(message));
      };

      function handleCallback() {
        if (window.google?.maps) {
          resolveLoaded();
          return;
        }
        rejectLoad("Google Maps callback fired, but maps namespace is unavailable.");
      }

      function handleAuthFailure() {
        previousAuthFailure?.();
        rejectLoad(
          "Google Maps authentication failed. Check browser key restrictions and enabled APIs.",
        );
      }

      function handleScriptLoad() {
        if (!window.google?.maps) {
          return;
        }
        resolveLoaded();
      }

      function handleScriptError() {
        rejectLoad(
          "Could not load Google Maps script. Verify network access and API key restrictions.",
        );
      }

      globalWindow[GOOGLE_MAPS_CALLBACK] = handleCallback;
      globalWindow.gm_authFailure = handleAuthFailure;

      timeoutId = window.setTimeout(() => {
        rejectLoad(
          "Google Maps is taking too long to load. Refresh and verify Maps JavaScript API access.",
        );
      }, GOOGLE_MAPS_TIMEOUT_MS);

      if (!script) {
        script = document.createElement("script");
        script.async = true;
        script.defer = true;
        script.dataset.vanpoolGoogleMaps = "true";
        script.src =
          "https://maps.googleapis.com/maps/api/js?" +
          new URLSearchParams({
            key: apiKey,
            libraries: "geometry,places",
            v: "weekly",
            callback: GOOGLE_MAPS_CALLBACK,
          }).toString();
        document.head.appendChild(script);
      }

      script.dataset.vanpoolStatus = "loading";
      script.addEventListener("load", handleScriptLoad, { once: true });
      script.addEventListener("error", handleScriptError, { once: true });

      if (window.google?.maps) {
        resolveLoaded();
      }
    });
  }

  return googleMapsPromise;
}
