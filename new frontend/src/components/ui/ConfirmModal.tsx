/**
 * Accessible Confirmation Modal Component
 * 
 * Replaces window.confirm() with an accessible dialog that:
 * - Has proper ARIA labels and roles
 * - Traps focus within the modal
 * - Supports keyboard navigation (Escape to close)
 * - Has customizable styling for different action types
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ConfirmVariant = "danger" | "warning" | "info";

export interface ConfirmModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Modal title */
  title: string;
  /** Modal description/message */
  message: string;
  /** Text for confirm button */
  confirmText?: string;
  /** Text for cancel button */
  cancelText?: string;
  /** Visual variant for the modal */
  variant?: ConfirmVariant;
  /** Loading state for async confirmations */
  loading?: boolean;
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user cancels or closes */
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Store the previously focused element
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement;
      // Focus the cancel button (safer default) after a small delay
      setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 50);
    } else if (previousActiveElement.current instanceof HTMLElement) {
      previousActiveElement.current.focus();
    }
  }, [open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onCancel]);

  // Trap focus within modal
  useEffect(() => {
    if (!open) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener("keydown", handleTabKey);
    return () => document.removeEventListener("keydown", handleTabKey);
  }, [open]);

  if (!open) return null;

  const variantClasses: Record<ConfirmVariant, string> = {
    danger: "confirm-modal--danger",
    warning: "confirm-modal--warning",
    info: "confirm-modal--info",
  };

  const modal = (
    <div
      className="confirm-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onCancel();
        }
      }}
    >
      <div
        ref={modalRef}
        className={`confirm-modal ${variantClasses[variant]}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
      >
        <div className="confirm-modal__icon" aria-hidden="true">
          {variant === "danger" && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          {variant === "warning" && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          )}
          {variant === "info" && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
        </div>

        <h2 id="confirm-modal-title" className="confirm-modal__title">
          {title}
        </h2>

        <p id="confirm-modal-description" className="confirm-modal__message">
          {message}
        </p>

        <div className="confirm-modal__actions">
          <button
            type="button"
            className="confirm-modal__cancel"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`confirm-modal__confirm confirm-modal__confirm--${variant}`}
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className="confirm-modal__spinner" aria-hidden="true" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // Render to portal for proper stacking
  return createPortal(modal, document.body);
}

/**
 * Hook for managing confirmation modal state
 * 
 * Usage:
 * const { confirm, ConfirmDialog } = useConfirm();
 * 
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: "Delete item?",
 *     message: "This action cannot be undone.",
 *     variant: "danger",
 *   });
 *   if (confirmed) {
 *     // perform delete
 *   }
 * };
 */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    options: { title: "", message: "" },
    resolve: null,
  });

  const [loading, setLoading] = useState(false);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        options,
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false, resolve: null }));
    setLoading(false);
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false, resolve: null }));
    setLoading(false);
  }, [state.resolve]);

  const ConfirmDialog = useCallback(
    () => (
      <ConfirmModal
        open={state.open}
        title={state.options.title}
        message={state.options.message}
        confirmText={state.options.confirmText}
        cancelText={state.options.cancelText}
        variant={state.options.variant}
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ),
    [state, loading, handleConfirm, handleCancel]
  );

  return { confirm, ConfirmDialog, setLoading };
}

export default ConfirmModal;
