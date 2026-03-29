import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../../components/Layout";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { EntityForm } from "../../components/ui/EntityForm";
import { useLiveStream } from "../../hooks/useLiveStream";
import { api } from "../../lib/api";
import type {
  AdminLiveSnapshot,
  ServiceZoneCreateInput,
  ServiceZoneSummary,
} from "../../lib/types";
import { useAuth } from "../../state/auth";

const DEFAULT_ZONE_TEMPLATE = {
  type: "Polygon",
  coordinates: [[[0, 0], [0.03, 0], [0.03, 0.03], [0, 0]]],
};

interface ZoneFormState {
  name: string;
  zone_type: "pickup" | "destination";
  notes: string;
  is_active: boolean;
  polygonText: string;
}

function emptyForm(): ZoneFormState {
  return {
    name: "",
    zone_type: "pickup",
    notes: "",
    is_active: true,
    polygonText: JSON.stringify(DEFAULT_ZONE_TEMPLATE, null, 2),
  };
}

function parsePolygonOrThrow(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Polygon JSON must be an object.");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Invalid polygon JSON. ${error.message}`
        : "Invalid polygon JSON.",
    );
  }
}

function polygonPointCount(zone: ServiceZoneSummary) {
  const coordinates = zone.polygon_geojson?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return 0;
  }
  const firstRing = coordinates[0];
  return Array.isArray(firstRing) ? firstRing.length : 0;
}

export function AdminZonesPage() {
  const { token, user } = useAuth();
  const { snapshot } = useLiveStream<AdminLiveSnapshot>(token);
  const [zones, setZones] = useState<ServiceZoneSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updatingZoneId, setUpdatingZoneId] = useState<string | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [form, setForm] = useState<ZoneFormState>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const permissionSet = useMemo(
    () => new Set(user?.admin_permissions || []),
    [user?.admin_permissions],
  );
  const canManageZones = permissionSet.has("policy:manage");
  const unreadCount = snapshot?.data.notifications_unread_count ?? 0;
  const pendingRequestCount = snapshot?.data.pending_requests.length ?? 0;

  useEffect(() => {
    if (!token) return;
    void refreshZones();
  }, [token]);

  const columns: Array<DataTableColumn<ServiceZoneSummary>> = useMemo(
    () => [
      {
        key: "name",
        header: "Zone",
        render: (zone) => (
          <div className="stack compact">
            <strong>{zone.name}</strong>
            <span className="muted-copy">
              {zone.zone_type} - {polygonPointCount(zone)} points
            </span>
            {zone.notes && <span className="muted-copy">{zone.notes}</span>}
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (zone) => (
          <span className={`status-pill ${zone.is_active ? "" : "read"}`}>
            {zone.is_active ? "active" : "inactive"}
          </span>
        ),
      },
      {
        key: "updated_at",
        header: "Updated",
        render: (zone) => (
          <span className="muted-copy">
            {zone.updated_at ? new Date(zone.updated_at).toLocaleString() : "n/a"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (zone) => (
          <div className="table-inline-actions">
            <button
              className="secondary-button"
              onClick={() => startEdit(zone)}
              type="button"
            >
              Edit
            </button>
            <button
              className="ghost-button"
              disabled={!canManageZones || updatingZoneId === zone.id}
              onClick={() => void toggleZoneStatus(zone)}
              type="button"
            >
              {updatingZoneId === zone.id
                ? "Saving..."
                : zone.is_active
                  ? "Pause"
                  : "Activate"}
            </button>
          </div>
        ),
      },
    ],
    [canManageZones, updatingZoneId],
  );

  async function refreshZones() {
    if (!token) return;
    setLoading(true);
    try {
      const response = await api.getAdminZones(token);
      setZones(response);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load zones.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(zone: ServiceZoneSummary) {
    setEditingZoneId(zone.id);
    setForm({
      name: zone.name,
      zone_type: zone.zone_type,
      notes: zone.notes || "",
      is_active: zone.is_active,
      polygonText: JSON.stringify(zone.polygon_geojson, null, 2),
    });
    setMessage(null);
    setError(null);
  }

  function resetEditor() {
    setEditingZoneId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageZones) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const polygon = parsePolygonOrThrow(form.polygonText);
      if (editingZoneId) {
        await api.updateAdminZone(token, editingZoneId, {
          name: form.name.trim(),
          polygon_geojson: polygon,
          notes: form.notes.trim() || null,
          is_active: form.is_active,
        });
        setMessage("Service zone updated.");
      } else {
        const payload: ServiceZoneCreateInput = {
          name: form.name.trim(),
          zone_type: form.zone_type,
          polygon_geojson: polygon,
          notes: form.notes.trim() || undefined,
          is_active: form.is_active,
        };
        await api.createAdminZone(token, payload);
        setMessage("Service zone created.");
      }
      resetEditor();
      await refreshZones();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save service zone.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleZoneStatus(zone: ServiceZoneSummary) {
    if (!token || !canManageZones) return;
    setUpdatingZoneId(zone.id);
    setMessage(null);
    setError(null);
    try {
      await api.updateAdminZone(token, zone.id, { is_active: !zone.is_active });
      setMessage(zone.is_active ? "Zone paused." : "Zone activated.");
      await refreshZones();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update zone.");
    } finally {
      setUpdatingZoneId(null);
    }
  }

  return (
    <AppLayout
      notificationUnreadCount={unreadCount}
      pendingRequestCount={pendingRequestCount}
      title="Service Zones"
      subtitle={`Define pickup and destination geofences for ${user?.company_name || "your company"}.`}
    >
      {(message || error) && (
        <div className="stack compact">
          {message && <div className="success-banner">{message}</div>}
          {error && <div className="error-banner">{error}</div>}
        </div>
      )}

      <div className="content-grid two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Zones</p>
              <h3>Tenant geofence catalog</h3>
            </div>
            <button className="secondary-button" onClick={() => void refreshZones()} type="button">
              Refresh
            </button>
          </div>
          {loading ? (
            <p className="muted-copy">Loading service zones...</p>
          ) : (
            <DataTable
              rows={zones}
              columns={columns}
              emptyMessage="No pickup or destination zones configured yet."
            />
          )}
        </section>

        <EntityForm
          title={editingZoneId ? "Edit service zone" : "Create service zone"}
          description="Paste a valid GeoJSON Polygon. This zone will be enforced by policy checks for ride requests."
          onSubmit={handleSubmit}
          submitLabel={editingZoneId ? "Save zone" : "Create zone"}
          submittingLabel={editingZoneId ? "Saving..." : "Creating..."}
          busy={busy}
          disabled={!canManageZones}
        >
          {!canManageZones && (
            <div className="error-banner">Your admin scope cannot manage service zones.</div>
          )}
          <label>
            Zone name
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Zone type
            <select
              value={form.zone_type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  zone_type: event.target.value as "pickup" | "destination",
                }))
              }
              disabled={Boolean(editingZoneId)}
            >
              <option value="pickup">pickup</option>
              <option value="destination">destination</option>
            </select>
          </label>
          <label>
            Notes
            <input
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Optional context for operations teams."
            />
          </label>
          <label>
            Polygon JSON
            <textarea
              className="copilot-textarea"
              value={form.polygonText}
              onChange={(event) =>
                setForm((current) => ({ ...current, polygonText: event.target.value }))
              }
              spellCheck={false}
              required
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) =>
                setForm((current) => ({ ...current, is_active: event.target.checked }))
              }
            />
            Zone is active and enforced
          </label>
          {editingZoneId && (
            <button className="secondary-button" onClick={resetEditor} type="button">
              Cancel editing
            </button>
          )}
        </EntityForm>
      </div>
    </AppLayout>
  );
}
