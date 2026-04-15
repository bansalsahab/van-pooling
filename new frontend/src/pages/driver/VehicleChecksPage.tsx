import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../../components/Layout";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { EntityForm } from "../../components/ui/EntityForm";
import { useLiveStream } from "../../hooks/useLiveStream";
import { api } from "../../lib/api";
import type { DriverLiveSnapshot, DriverVehicleCheckSummary } from "../../lib/types";
import { useAuth } from "../../state/auth";

const CHECK_ITEMS = [
  { key: "tires", label: "Tires condition" },
  { key: "brakes", label: "Brakes response" },
  { key: "lights", label: "Lights and indicators" },
  { key: "fuel", label: "Fuel and range" },
  { key: "cabin", label: "Cabin cleanliness" },
  { key: "first_aid", label: "First-aid kit" },
] as const;

function formatDateTime(value?: string | null) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString();
}

export function DriverVehicleChecksPage() {
  const { token } = useAuth();
  const { snapshot } = useLiveStream<DriverLiveSnapshot>(token);
  const [checks, setChecks] = useState<DriverVehicleCheckSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHECK_ITEMS.map((item) => [item.key, true])),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void refreshChecks();
  }, [token]);

  const failingCount = useMemo(
    () => Object.values(checklist).filter((value) => value === false).length,
    [checklist],
  );

  const columns: Array<DataTableColumn<DriverVehicleCheckSummary>> = useMemo(
    () => [
      {
        key: "submitted_at",
        header: "Submitted",
        render: (item) => <span>{formatDateTime(item.submitted_at)}</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (item) => (
          <span className={`status-pill ${item.status === "failed" ? "unread" : ""}`}>
            {item.status}
          </span>
        ),
      },
      {
        key: "failed_items",
        header: "Failed items",
        render: (item) =>
          item.failed_items.length > 0 ? (
            <span>{item.failed_items.join(", ")}</span>
          ) : (
            <span className="muted-copy">None</span>
          ),
      },
      {
        key: "notes",
        header: "Notes",
        render: (item) => <span className="muted-copy">{item.notes || "n/a"}</span>,
      },
    ],
    [],
  );

  async function refreshChecks() {
    if (!token) return;
    setLoading(true);
    try {
      const response = await api.getDriverVehicleChecks(token, { limit: 40 });
      setChecks(response);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Could not load vehicle checks.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitCheck(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const status = failingCount > 0 ? "failed" : "passed";
      await api.submitDriverVehicleCheck(token, {
        checklist,
        notes: notes.trim() || undefined,
        status,
      });
      setMessage(
        status === "passed"
          ? "Vehicle check submitted as passed."
          : "Vehicle check submitted with failed items and dispatch alert.",
      );
      setNotes("");
      setChecklist(Object.fromEntries(CHECK_ITEMS.map((item) => [item.key, true])));
      await refreshChecks();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not submit vehicle check.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      title="Vehicle Checks"
      subtitle="Submit pre-trip inspection checklists and track inspection history."
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
              <p className="eyebrow">Inspections</p>
              <h3>Recent submissions</h3>
            </div>
            <button className="secondary-button" onClick={() => void refreshChecks()} type="button">
              Refresh
            </button>
          </div>
          {loading ? (
            <p className="muted-copy">Loading checks...</p>
          ) : (
            <DataTable
              rows={checks}
              columns={columns}
              emptyMessage="No vehicle checks submitted yet."
            />
          )}
        </section>

        <EntityForm
          title="Submit vehicle check"
          description="Mark each inspection point before running dispatch operations."
          onSubmit={handleSubmitCheck}
          submitLabel="Submit check"
          submittingLabel="Submitting..."
          busy={busy}
        >
          <div className="stack compact">
            <p className="eyebrow">Checklist</p>
            <div className="button-row">
              {CHECK_ITEMS.map((item) => {
                const passed = checklist[item.key] !== false;
                return (
                  <button
                    key={item.key}
                    className={passed ? "secondary-button" : "primary-button"}
                    onClick={() =>
                      setChecklist((current) => ({
                        ...current,
                        [item.key]: !passed,
                      }))
                    }
                    type="button"
                  >
                    {passed ? `Pass: ${item.label}` : `Fail: ${item.label}`}
                  </button>
                );
              })}
            </div>
            <span className="muted-copy">
              {failingCount > 0
                ? `${failingCount} failed item(s) will raise a dispatch alert.`
                : "All items currently marked as passed."}
            </span>
          </div>
          <label>
            Notes (optional)
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Example: brake pedal response felt soft."
            />
          </label>
        </EntityForm>
      </div>
    </AppLayout>
  );
}
