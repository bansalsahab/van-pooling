import type { ReactNode } from "react";

interface EntityFormProps {
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  submittingLabel?: string;
  busy?: boolean;
  disabled?: boolean;
}

export function EntityForm({
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  submittingLabel = "Saving...",
  busy = false,
  disabled = false,
}: EntityFormProps) {
  return (
    <form className="panel inset-panel stack entity-form" onSubmit={onSubmit}>
      <div className="entity-form-header">
        <h3>{title}</h3>
        {description && <p className="muted-copy">{description}</p>}
      </div>
      <div className="entity-form-divider" />
      {children}
      <div className="entity-form-divider" />
      <button className="primary-button" disabled={disabled || busy} type="submit">
        {busy ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
