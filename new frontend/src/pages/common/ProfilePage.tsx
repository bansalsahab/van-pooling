import { useEffect, useState } from "react";

import { AppLayout } from "../../components/Layout";
import { EntityForm } from "../../components/ui/EntityForm";
import { api } from "../../lib/api";
import type { NotificationPreferences } from "../../lib/types";
import { useAuth } from "../../state/auth";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  push: true,
  sms: false,
  email: true,
};

export function ProfilePage() {
  const { token, user, setUserProfile, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    user?.notification_preferences || DEFAULT_PREFERENCES,
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
    setPreferences(user?.notification_preferences || DEFAULT_PREFERENCES);
  }, [user?.name, user?.phone, user?.notification_preferences]);

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSavingProfile(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateProfile(token, {
        name: name.trim(),
        phone: phone.trim() || null,
        notification_preferences: preferences,
      });
      setUserProfile(updated);
      setMessage("Profile updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setChangingPassword(true);
    setError(null);
    setMessage(null);
    try {
      await api.changePassword(token, currentPassword, newPassword);
      await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated.");
    } catch (passwordError) {
      setError(
        passwordError instanceof Error
          ? passwordError.message
          : "Could not change password.",
      );
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <AppLayout
      title="Profile Settings"
      subtitle="Manage your account details and notification preferences."
    >
      <div className="content-grid two-column">
        <EntityForm
          title="Personal details"
          description="Keep your contact details up to date for dispatch and support."
          onSubmit={handleSaveProfile}
          submitLabel="Save profile"
          submittingLabel="Saving profile..."
          busy={savingProfile}
        >
          <label>
            Full name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            Phone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 555 000 0000"
            />
          </label>
          <div className="stack compact">
            <p className="eyebrow">Notification preferences</p>
            <label>
              <input
                type="checkbox"
                checked={preferences.push}
                onChange={(event) =>
                  setPreferences((current) => ({ ...current, push: event.target.checked }))
                }
              />
              Push updates
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.sms}
                onChange={(event) =>
                  setPreferences((current) => ({ ...current, sms: event.target.checked }))
                }
              />
              SMS alerts
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.email}
                onChange={(event) =>
                  setPreferences((current) => ({ ...current, email: event.target.checked }))
                }
              />
              Email updates
            </label>
          </div>
        </EntityForm>

        <EntityForm
          title="Security"
          description="Change your password for workspace access."
          onSubmit={handleChangePassword}
          submitLabel="Update password"
          submittingLabel="Updating password..."
          busy={changingPassword}
        >
          {user?.must_reset_password && (
            <div className="error-banner">
              Your password was reset by an admin. Please set a new password now.
            </div>
          )}
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
        </EntityForm>
      </div>

      {(message || error) && (
        <div className="stack compact">
          {message && <div className="success-banner">{message}</div>}
          {error && <div className="error-banner">{error}</div>}
        </div>
      )}
    </AppLayout>
  );
}
