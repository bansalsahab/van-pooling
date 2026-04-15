import { useEffect, useState } from "react";

import { AppLayout } from "../../components/Layout";
import { EntityForm } from "../../components/ui/EntityForm";
import { useLiveStream } from "../../hooks/useLiveStream";
import { api } from "../../lib/api";
import type { EmployeeLiveSnapshot } from "../../lib/types";
import { useAuth } from "../../state/auth";

interface SavedAddressState {
  home_address: string;
  home_latitude: string;
  home_longitude: string;
  default_destination_address: string;
  default_destination_latitude: string;
  default_destination_longitude: string;
}

function toInputValue(value?: number | null) {
  return typeof value === "number" ? String(value) : "";
}

function toNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function EmployeeAddressesPage() {
  const { token, user, setUserProfile } = useAuth();
  const { snapshot } = useLiveStream<EmployeeLiveSnapshot>(token);
  const [form, setForm] = useState<SavedAddressState>({
    home_address: "",
    home_latitude: "",
    home_longitude: "",
    default_destination_address: "",
    default_destination_latitude: "",
    default_destination_longitude: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      home_address: user?.home_address || "",
      home_latitude: toInputValue(user?.home_latitude),
      home_longitude: toInputValue(user?.home_longitude),
      default_destination_address: user?.default_destination_address || "",
      default_destination_latitude: toInputValue(user?.default_destination_latitude),
      default_destination_longitude: toInputValue(user?.default_destination_longitude),
    });
  }, [
    user?.default_destination_address,
    user?.default_destination_latitude,
    user?.default_destination_longitude,
    user?.home_address,
    user?.home_latitude,
    user?.home_longitude,
  ]);

  async function geocodeField(field: "home" | "destination") {
    if (!token) return;
    const address =
      field === "home" ? form.home_address.trim() : form.default_destination_address.trim();
    if (!address) {
      setError("Enter an address before geocoding.");
      return;
    }
    setError(null);
    try {
      const result = await api.geocodeAddress(token, address);
      if (field === "home") {
        setForm((current) => ({
          ...current,
          home_address: result.address,
          home_latitude: String(result.latitude),
          home_longitude: String(result.longitude),
        }));
      } else {
        setForm((current) => ({
          ...current,
          default_destination_address: result.address,
          default_destination_latitude: String(result.latitude),
          default_destination_longitude: String(result.longitude),
        }));
      }
    } catch (geocodeError) {
      setError(geocodeError instanceof Error ? geocodeError.message : "Could not geocode address.");
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateProfile(token, {
        home_address: form.home_address.trim() || null,
        home_latitude: toNumberOrNull(form.home_latitude),
        home_longitude: toNumberOrNull(form.home_longitude),
        default_destination_address: form.default_destination_address.trim() || null,
        default_destination_latitude: toNumberOrNull(form.default_destination_latitude),
        default_destination_longitude: toNumberOrNull(form.default_destination_longitude),
      });
      setUserProfile(updated);
      setMessage("Saved addresses updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save addresses.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      title="Saved Locations"
      subtitle="Set your default home and office locations for faster booking."
    >
      {(message || error) && (
        <div className="stack compact">
          {message && <div className="success-banner">{message}</div>}
          {error && <div className="error-banner">{error}</div>}
        </div>
      )}

      <EntityForm
        title="Home and office defaults"
        description="These values prefill ride requests and recurring schedule templates."
        onSubmit={handleSave}
        submitLabel="Save locations"
        submittingLabel="Saving..."
        busy={busy}
      >
        <div className="content-grid two-column">
          <div className="stack compact">
            <label>
              Home address
              <input
                value={form.home_address}
                onChange={(event) =>
                  setForm((current) => ({ ...current, home_address: event.target.value }))
                }
              />
            </label>
            <div className="inline-grid">
              <label>
                Home latitude
                <input
                  value={form.home_latitude}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, home_latitude: event.target.value }))
                  }
                />
              </label>
              <label>
                Home longitude
                <input
                  value={form.home_longitude}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, home_longitude: event.target.value }))
                  }
                />
              </label>
            </div>
            <button
              className="secondary-button"
              onClick={() => void geocodeField("home")}
              type="button"
            >
              Geocode home
            </button>
          </div>

          <div className="stack compact">
            <label>
              Office destination
              <input
                value={form.default_destination_address}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    default_destination_address: event.target.value,
                  }))
                }
              />
            </label>
            <div className="inline-grid">
              <label>
                Office latitude
                <input
                  value={form.default_destination_latitude}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      default_destination_latitude: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Office longitude
                <input
                  value={form.default_destination_longitude}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      default_destination_longitude: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button
              className="secondary-button"
              onClick={() => void geocodeField("destination")}
              type="button"
            >
              Geocode office
            </button>
          </div>
        </div>
      </EntityForm>
    </AppLayout>
  );
}
