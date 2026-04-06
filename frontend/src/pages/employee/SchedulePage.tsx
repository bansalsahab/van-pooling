import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../../components/Layout";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { EntityForm } from "../../components/ui/EntityForm";
import { useLiveStream } from "../../hooks/useLiveStream";
import { api } from "../../lib/api";
import type {
  EmployeeLiveSnapshot,
  RecurringRideRuleCreateInput,
  RecurringRideRuleSummary,
} from "../../lib/types";
import { useAuth } from "../../state/auth";

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
];
const FALLBACK_TIMEZONE = "Asia/Kolkata";
const COMMON_TIMEZONE_OPTIONS = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

function toNumberOrFallback(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function weekdaySummary(values: number[]) {
  return WEEKDAY_OPTIONS.filter((item) => values.includes(item.value))
    .map((item) => item.label)
    .join(", ");
}

function normalizeTimezoneValue(value: string) {
  return value.trim().replace(/\s+/g, "_");
}

function isValidIanaTimezone(value: string) {
  if (!value) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function resolveDefaultTimezone() {
  const browserTimezone = normalizeTimezoneValue(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  );
  if (isValidIanaTimezone(browserTimezone)) {
    return browserTimezone;
  }
  return FALLBACK_TIMEZONE;
}

function listTimezoneOptions(defaultTimezone: string) {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  const fromRuntime =
    typeof intlWithSupportedValues.supportedValuesOf === "function"
      ? intlWithSupportedValues.supportedValuesOf("timeZone")
      : [];
  const values = new Set([defaultTimezone, ...COMMON_TIMEZONE_OPTIONS, ...fromRuntime]);
  return Array.from(values).filter((item) => isValidIanaTimezone(item)).sort();
}

export function EmployeeSchedulePage() {
  const { token, user } = useAuth();
  const { snapshot } = useLiveStream<EmployeeLiveSnapshot>(token);
  const [defaultTimezone] = useState(() => resolveDefaultTimezone());
  const timezoneOptions = useMemo(() => listTimezoneOptions(defaultTimezone), [defaultTimezone]);
  const [rules, setRules] = useState<RecurringRideRuleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updatingRuleId, setUpdatingRuleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<RecurringRideRuleCreateInput>({
    name: "Weekday commute",
    weekdays: [0, 1, 2, 3, 4],
    pickup_time_local: "08:00",
    timezone: defaultTimezone,
    pickup: {
      address: user?.home_address || "",
      latitude: user?.home_latitude || 12.9716,
      longitude: user?.home_longitude || 77.5946,
    },
    destination: {
      address: user?.default_destination_address || "",
      latitude: user?.default_destination_latitude || 12.9800,
      longitude: user?.default_destination_longitude || 77.6000,
    },
  });

  useEffect(() => {
    if (!token) return;
    void refreshRules();
  }, [token]);

  const columns: Array<DataTableColumn<RecurringRideRuleSummary>> = useMemo(
    () => [
      {
        key: "name",
        header: "Template",
        render: (rule) => (
          <div className="stack compact">
            <strong>{rule.name}</strong>
            <span className="muted-copy">
              {weekdaySummary(rule.weekdays)} at {rule.pickup_time_local} ({rule.timezone})
            </span>
            <span className="muted-copy">
              {rule.pickup.address}
              {" -> "}
              {rule.destination.address}
            </span>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (rule) => <span className="status-pill">{rule.status}</span>,
      },
      {
        key: "next",
        header: "Next pickup",
        render: (rule) => (
          <span className="muted-copy">
            {rule.next_pickup_at
              ? new Date(rule.next_pickup_at).toLocaleString()
              : "No upcoming slot"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (rule) => (
          <button
            className="secondary-button"
            disabled={updatingRuleId === rule.id}
            onClick={() => void toggleRuleStatus(rule)}
            type="button"
          >
            {updatingRuleId === rule.id
              ? "Updating..."
              : rule.status === "active"
                ? "Pause"
                : "Resume"}
          </button>
        ),
      },
    ],
    [updatingRuleId],
  );

  async function refreshRules() {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getRecurringSchedules(token);
      setRules(result);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load schedules.");
    } finally {
      setLoading(false);
    }
  }

  async function geocode(field: "pickup" | "destination") {
    if (!token) return;
    const target = field === "pickup" ? form.pickup : form.destination;
    if (!target.address.trim()) {
      setError("Enter an address before geocoding.");
      return;
    }
    setError(null);
    try {
      const result = await api.geocodeAddress(token, target.address);
      setForm((current) => ({
        ...current,
        [field]: {
          ...current[field],
          address: result.address,
          latitude: result.latitude,
          longitude: result.longitude,
        },
      }));
    } catch (geocodeError) {
      setError(geocodeError instanceof Error ? geocodeError.message : "Could not geocode address.");
    }
  }

  async function handleCreateRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const normalizedTimezone = normalizeTimezoneValue(form.timezone);
    if (!isValidIanaTimezone(normalizedTimezone)) {
      setBusy(false);
      setError("Select a valid timezone like Asia/Kolkata.");
      return;
    }
    try {
      await api.createRecurringSchedule(token, {
        ...form,
        timezone: normalizedTimezone,
      });
      setMessage("Recurring schedule created.");
      setForm((current) => ({ ...current, timezone: normalizedTimezone }));
      await refreshRules();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRuleStatus(rule: RecurringRideRuleSummary) {
    if (!token) return;
    setUpdatingRuleId(rule.id);
    setError(null);
    setMessage(null);
    try {
      const nextStatus = rule.status === "active" ? "paused" : "active";
      await api.updateRecurringSchedule(token, rule.id, { status: nextStatus });
      setMessage(`Schedule ${nextStatus}.`);
      await refreshRules();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update schedule.");
    } finally {
      setUpdatingRuleId(null);
    }
  }

  function toggleWeekday(value: number) {
    setForm((current) => {
      const exists = current.weekdays.includes(value);
      const weekdays = exists
        ? current.weekdays.filter((day) => day !== value)
        : [...current.weekdays, value].sort((a, b) => a - b);
      return {
        ...current,
        weekdays,
      };
    });
  }

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      title="Recurring Rides"
      subtitle="Set weekday commute templates for automatic ride booking."
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
              <p className="eyebrow">Templates</p>
              <h3>Active schedules</h3>
            </div>
            <button className="secondary-button" onClick={() => void refreshRules()} type="button">
              Refresh
            </button>
          </div>
          {loading ? (
            <p className="muted-copy">Loading recurring schedules...</p>
          ) : (
            <DataTable
              rows={rules}
              columns={columns}
              emptyMessage="No recurring schedules configured yet."
            />
          )}
        </section>

        <EntityForm
          title="Create weekday template"
          description="Dispatch creates scheduled rides automatically when the next window is near."
          onSubmit={handleCreateRule}
          submitLabel="Create schedule"
          submittingLabel="Creating..."
          busy={busy}
        >
          <label>
            Template name
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Pickup time (local)
            <input
              type="time"
              value={form.pickup_time_local}
              onChange={(event) =>
                setForm((current) => ({ ...current, pickup_time_local: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Timezone
            <input
              list="timezone-options"
              value={form.timezone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  timezone: normalizeTimezoneValue(event.target.value),
                }))
              }
              onBlur={() => {
                const normalized = normalizeTimezoneValue(form.timezone);
                if (normalized === form.timezone) {
                  return;
                }
                setForm((current) => ({ ...current, timezone: normalized }));
              }}
              required
            />
            <datalist id="timezone-options">
              {timezoneOptions.map((timezone) => (
                <option key={timezone} value={timezone} />
              ))}
            </datalist>
          </label>
          <div className="stack compact">
            <p className="eyebrow">Weekdays</p>
            <div className="button-row">
              {WEEKDAY_OPTIONS.map((day) => (
                <button
                  className={form.weekdays.includes(day.value) ? "primary-button" : "secondary-button"}
                  key={day.value}
                  onClick={() => toggleWeekday(day.value)}
                  type="button"
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
          <div className="content-grid two-column">
            <div className="stack compact">
              <label>
                Pickup address
                <input
                  value={form.pickup.address}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pickup: { ...current.pickup, address: event.target.value },
                    }))
                  }
                  required
                />
              </label>
              <div className="inline-grid">
                <label>
                  Pickup lat
                  <input
                    value={form.pickup.latitude}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pickup: {
                          ...current.pickup,
                          latitude: toNumberOrFallback(event.target.value, current.pickup.latitude),
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Pickup lng
                  <input
                    value={form.pickup.longitude}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pickup: {
                          ...current.pickup,
                          longitude: toNumberOrFallback(event.target.value, current.pickup.longitude),
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <button className="secondary-button" onClick={() => void geocode("pickup")} type="button">
                Geocode pickup
              </button>
            </div>

            <div className="stack compact">
              <label>
                Destination address
                <input
                  value={form.destination.address}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      destination: { ...current.destination, address: event.target.value },
                    }))
                  }
                  required
                />
              </label>
              <div className="inline-grid">
                <label>
                  Destination lat
                  <input
                    value={form.destination.latitude}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        destination: {
                          ...current.destination,
                          latitude: toNumberOrFallback(
                            event.target.value,
                            current.destination.latitude,
                          ),
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Destination lng
                  <input
                    value={form.destination.longitude}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        destination: {
                          ...current.destination,
                          longitude: toNumberOrFallback(
                            event.target.value,
                            current.destination.longitude,
                          ),
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <button
                className="secondary-button"
                onClick={() => void geocode("destination")}
                type="button"
              >
                Geocode destination
              </button>
            </div>
          </div>
        </EntityForm>
      </div>
    </AppLayout>
  );
}
