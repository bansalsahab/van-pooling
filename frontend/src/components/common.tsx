import type {
  AIInsight,
  LiveConnectionQuality,
  LiveConnectionState,
  LiveOperationalEvent,
  RideSummary,
  VanSummary,
} from "../lib/types";
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsSearchUrl,
} from "../lib/mapsLinks";

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function MetricPanel({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  onClick?: () => void;
}) {
  const className = `metric-panel ${onClick ? "metric-panel-clickable" : ""}`;
  if (onClick) {
    return (
      <button className={className} onClick={onClick} type="button">
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </button>
    );
  }

  return (
    <section className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}

export function RideTable({ rides }: { rides: RideSummary[] }) {
  if (rides.length === 0) {
    return <p className="muted-copy">No rides yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Pickup</th>
            <th>Destination</th>
            <th>Van</th>
            <th>Driver</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rides.map((ride) => {
            const pickupMapUrl = buildGoogleMapsSearchUrl(ride.pickup_address);
            const directionsUrl = buildGoogleMapsDirectionsUrl({
              origin: ride.pickup_address,
              destination: ride.destination_address,
            });
            return (
              <tr key={ride.id}>
                <td>{ride.status.replaceAll("_", " ")}</td>
                <td>{ride.pickup_address}</td>
                <td>{ride.destination_address}</td>
                <td>{ride.van_license_plate || "Pending"}</td>
                <td>{ride.driver_name || "TBD"}</td>
                <td>
                  <div className="table-inline-actions">
                    {pickupMapUrl && (
                      <a
                        className="ghost-button inline-link-button"
                        href={pickupMapUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Pickup map
                      </a>
                    )}
                    {directionsUrl && (
                      <a
                        className="ghost-button inline-link-button"
                        href={directionsUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Directions
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LiveStatusBadge({
  state,
  lastUpdatedAt,
  quality = "critical",
  lagSeconds = null,
}: {
  state: LiveConnectionState;
  lastUpdatedAt?: string | null;
  quality?: LiveConnectionQuality;
  lagSeconds?: number | null;
}) {
  const label =
    state === "live"
      ? "Live"
      : state === "connecting"
        ? "Connecting"
        : state === "reconnecting"
          ? "Reconnecting"
          : "Offline";

  return (
    <div className={`live-badge ${state}`}>
      <span className="live-dot" />
      <strong>{label}</strong>
      <span className={`quality-pill ${quality}`}>{quality}</span>
      {typeof lagSeconds === "number" && <span>{`${lagSeconds}s lag`}</span>}
      <span>{lastUpdatedAt ? `Updated ${formatTimestamp(lastUpdatedAt)}` : "Waiting"}</span>
    </div>
  );
}

export function AIInsightsPanel({
  insights,
  title = "AI Dispatch",
}: {
  insights: AIInsight[];
  title?: string;
}) {
  return (
    <section className="panel ai-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">AI Copilot</p>
          <h3>{title}</h3>
        </div>
      </div>
      {insights.length === 0 ? (
        <p className="muted-copy">No AI insights yet.</p>
      ) : (
        <div className="stack compact">
          {insights.map((insight) => (
            <article className="ai-card" key={`${insight.title}-${insight.priority}`}>
              <div className="ai-card-header">
                <strong>{insight.title}</strong>
                <span className={`priority-pill ${insight.priority}`}>{insight.priority}</span>
              </div>
              <p>{insight.summary}</p>
              <div className="signal-row">
                {insight.signals.map((signal) => (
                  <span className="signal-pill" key={signal}>
                    {signal}
                  </span>
                ))}
              </div>
              <ul className="action-list">
                {insight.recommended_actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function FleetRadar({
  vans,
  title = "Fleet Radar",
}: {
  vans: VanSummary[];
  title?: string;
}) {
  const activeVans = vans.filter(
    (van) => typeof van.latitude === "number" && typeof van.longitude === "number",
  );

  if (activeVans.length === 0) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live Locations</p>
            <h3>{title}</h3>
          </div>
        </div>
        <p className="muted-copy">
          No live coordinates yet. Turn on driver location sharing to populate the radar.
        </p>
      </section>
    );
  }

  const latitudes = activeVans.map((van) => van.latitude as number);
  const longitudes = activeVans.map((van) => van.longitude as number);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return (
    <section className="panel radar-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Live Locations</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="radar-surface">
        {activeVans.map((van) => {
          const latitude = van.latitude as number;
          const longitude = van.longitude as number;
          const top = normalize(latitude, minLatitude, maxLatitude);
          const left = normalize(longitude, minLongitude, maxLongitude);

          return (
            <div
              className={`radar-point ${van.status}`}
              key={van.id}
              style={{ top: `${top}%`, left: `${left}%` }}
              title={`${van.license_plate} - ${van.status}`}
            >
              <span>{van.license_plate.slice(-4)}</span>
            </div>
          );
        })}
      </div>
      <div className="stack compact">
        {activeVans.slice(0, 4).map((van) => (
          <div className="list-card compact-card" key={van.id}>
            <div>
              <strong>{van.license_plate}</strong>
              <p>
                {formatCoordinate(van.latitude)} , {formatCoordinate(van.longitude)}
              </p>
            </div>
            <span className="status-pill">{van.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LiveEventsPanel({
  events,
  title = "Operational Events",
}: {
  events: LiveOperationalEvent[];
  title?: string;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Typed Events</p>
          <h3>{title}</h3>
        </div>
      </div>
      {events.length === 0 ? (
        <p className="muted-copy">
          New live events will appear here as rides, trips, vans, alerts, and notifications change.
        </p>
      ) : (
        <div className="stack compact">
          {events.map((event) => (
            <article
              className="list-card compact-card event-card"
              key={`${event.sequence ?? "event"}-${event.event}-${event.payload.entity_id ?? "unknown"}`}
            >
              <div>
                <strong>{formatEventHeadline(event)}</strong>
                <p>{formatEventSummary(event)}</p>
              </div>
              <div className="stack compact align-end">
                <span className="status-pill">{event.payload.action}</span>
                <span className="muted-copy">{formatTimestamp(event.payload.generated_at)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function normalize(value: number, min: number, max: number) {
  if (min === max) {
    return 50;
  }
  return 12 + ((value - min) / (max - min)) * 76;
}

function formatCoordinate(value?: number | null) {
  if (typeof value !== "number") {
    return "N/A";
  }
  return value.toFixed(4);
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEventHeadline(event: LiveOperationalEvent) {
  const eventLabel = event.event.replace(".", " ");
  const suffix = event.payload.entity_id
    ? ` ${event.payload.entity_id.slice(0, 8)}`
    : "";
  return `${eventLabel}${suffix}`;
}

function formatEventSummary(event: LiveOperationalEvent) {
  const fields = event.payload.changed_fields;
  if (fields.length > 0) {
    return `Changed: ${fields.slice(0, 4).join(", ")}`;
  }

  if (event.payload.after && typeof event.payload.after.status === "string") {
    return `Current status: ${event.payload.after.status.replaceAll("_", " ")}`;
  }

  if (event.payload.before && !event.payload.after) {
    return `${event.payload.entity_type} was removed from the active live view.`;
  }

  return `${event.payload.entity_type} ${event.payload.action}.`;
}
