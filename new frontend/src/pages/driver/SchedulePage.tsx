import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../../components/Layout";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { EntityForm } from "../../components/ui/EntityForm";
import { useLiveStream } from "../../hooks/useLiveStream";
import { api } from "../../lib/api";
import type { DriverLiveSnapshot, DriverShiftSummary } from "../../lib/types";
import { useAuth } from "../../state/auth";

function formatDateTime(value?: string | null) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString();
}

export function DriverSchedulePage() {
  const { token } = useAuth();
  const { snapshot } = useLiveStream<DriverLiveSnapshot>(token);
  const [shifts, setShifts] = useState<DriverShiftSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [notes, setNotes] = useState("");
  const [plannedEndLocal, setPlannedEndLocal] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void refreshShifts();
  }, [token]);

  const activeShift = useMemo(
    () =>
      shifts.find(
        (shift) => shift.status === "clocked_in" && !shift.clocked_out_at,
      ) || null,
    [shifts],
  );

  const columns: Array<DataTableColumn<DriverShiftSummary>> = useMemo(
    () => [
      {
        key: "window",
        header: "Window",
        render: (shift) => (
          <div className="stack compact">
            <span>{formatDateTime(shift.scheduled_start_at)}</span>
            <span className="muted-copy">{formatDateTime(shift.scheduled_end_at)}</span>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (shift) => <span className="status-pill">{shift.status}</span>,
      },
      {
        key: "clock",
        header: "Clock events",
        render: (shift) => (
          <div className="stack compact">
            <span className="muted-copy">In: {formatDateTime(shift.clocked_in_at)}</span>
            <span className="muted-copy">Out: {formatDateTime(shift.clocked_out_at)}</span>
          </div>
        ),
      },
      {
        key: "duration",
        header: "Duration",
        render: (shift) => (
          <span className="muted-copy">
            {typeof shift.duration_minutes === "number"
              ? `${shift.duration_minutes} min`
              : "n/a"}
          </span>
        ),
      },
    ],
    [],
  );

  async function refreshShifts() {
    if (!token) return;
    setLoading(true);
    try {
      const response = await api.getDriverShifts(token, { limit: 40 });
      setShifts(response);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load shifts.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStartShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await api.startDriverShift(token, {
        planned_end_at: plannedEndLocal
          ? new Date(plannedEndLocal).toISOString()
          : undefined,
        notes: notes.trim() || undefined,
      });
      setNotes("");
      setPlannedEndLocal("");
      setMessage("Shift started.");
      await refreshShifts();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start shift.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClockOut() {
    if (!token || !activeShift) return;
    setClockingOut(true);
    setMessage(null);
    setError(null);
    try {
      await api.clockOutDriverShift(token, activeShift.id);
      setMessage("Shift clocked out.");
      await refreshShifts();
    } catch (clockOutError) {
      setError(
        clockOutError instanceof Error ? clockOutError.message : "Could not clock out shift.",
      );
    } finally {
      setClockingOut(false);
    }
  }

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      title="Shift Schedule"
      subtitle="Track active shifts, planned shift windows, and timesheet closure."
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
              <p className="eyebrow">Timesheet</p>
              <h3>Recent shifts</h3>
            </div>
            <button className="secondary-button" onClick={() => void refreshShifts()} type="button">
              Refresh
            </button>
          </div>
          {activeShift ? (
            <div className="list-card compact-card">
              <div className="stack compact">
                <strong>Active shift in progress</strong>
                <span className="muted-copy">
                  Started: {formatDateTime(activeShift.clocked_in_at || activeShift.scheduled_start_at)}
                </span>
                <span className="muted-copy">
                  Planned end: {formatDateTime(activeShift.scheduled_end_at)}
                </span>
                <button
                  className="primary-button"
                  disabled={clockingOut}
                  onClick={() => void handleClockOut()}
                  type="button"
                >
                  {clockingOut ? "Clocking out..." : "Clock out shift"}
                </button>
              </div>
            </div>
          ) : (
            <p className="muted-copy">No active shift right now.</p>
          )}

          {loading ? (
            <p className="muted-copy">Loading shift history...</p>
          ) : (
            <DataTable rows={shifts} columns={columns} emptyMessage="No shifts recorded yet." />
          )}
        </section>

        <EntityForm
          title="Start shift"
          description="Begin a duty window so dispatch and timesheet data stay synced."
          onSubmit={handleStartShift}
          submitLabel={activeShift ? "Shift already active" : "Start shift now"}
          submittingLabel="Starting..."
          busy={busy}
          disabled={Boolean(activeShift)}
        >
          <label>
            Planned end time (optional)
            <input
              type="datetime-local"
              value={plannedEndLocal}
              onChange={(event) => setPlannedEndLocal(event.target.value)}
            />
          </label>
          <label>
            Shift note (optional)
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Any context for dispatch handoff."
            />
          </label>
        </EntityForm>
      </div>
    </AppLayout>
  );
}
