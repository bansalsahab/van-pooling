import { useId, useState, useCallback, forwardRef } from "react";

export interface ValidationRule {
  type: "required" | "email" | "minLength" | "maxLength" | "pattern" | "custom";
  value?: unknown;
  message: string;
}

export interface FormFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  error?: string;
  hint?: string;
  rules?: ValidationRule[];
  showRequiredIndicator?: boolean;
  onChange?: (value: string, isValid: boolean) => void;
  onValidate?: (error: string | null) => void;
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
}

function validateValue(value: string, rules: ValidationRule[]): string | null {
  for (const rule of rules) {
    switch (rule.type) {
      case "required":
        if (!value.trim()) {
          return rule.message;
        }
        break;
      case "email":
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return rule.message;
        }
        break;
      case "minLength":
        if (value && value.length < (rule.value as number)) {
          return rule.message;
        }
        break;
      case "maxLength":
        if (value && value.length > (rule.value as number)) {
          return rule.message;
        }
        break;
      case "pattern":
        if (value && !(rule.value as RegExp).test(value)) {
          return rule.message;
        }
        break;
      case "custom":
        if (typeof rule.value === "function") {
          const customError = rule.value(value);
          if (customError) {
            return typeof customError === "string" ? customError : rule.message;
          }
        }
        break;
    }
  }
  return null;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      label,
      error: externalError,
      hint,
      rules = [],
      showRequiredIndicator = true,
      onChange,
      onValidate,
      validateOnBlur = true,
      validateOnChange = false,
      className,
      ...inputProps
    },
    ref
  ) => {
    const id = useId();
    const [internalError, setInternalError] = useState<string | null>(null);
    const [touched, setTouched] = useState(false);

    const displayError = externalError || (touched ? internalError : null);
    const isRequired = rules.some((r) => r.type === "required");

    const validate = useCallback(
      (value: string) => {
        const error = validateValue(value, rules);
        setInternalError(error);
        onValidate?.(error);
        return error === null;
      },
      [rules, onValidate]
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      let isValid = true;

      if (validateOnChange || touched) {
        isValid = validate(value);
      }

      onChange?.(value, isValid);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      if (validateOnBlur) {
        validate(e.target.value);
      }
      inputProps.onBlur?.(e);
    };

    return (
      <div className={`form-field ${displayError ? "has-error" : ""} ${className || ""}`}>
        <label htmlFor={id} className="form-label">
          {label}
          {showRequiredIndicator && isRequired && (
            <span className="required-indicator" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <input
          {...inputProps}
          ref={ref}
          id={id}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={!!displayError}
          aria-describedby={displayError ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`form-input ${displayError ? "input-error" : ""}`}
        />
        {displayError && (
          <span id={`${id}-error`} className="field-error" role="alert">
            {displayError}
          </span>
        )}
        {hint && !displayError && (
          <span id={`${id}-hint`} className="field-hint">
            {hint}
          </span>
        )}
      </div>
    );
  }
);

FormField.displayName = "FormField";

export interface SelectFieldProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  rules?: ValidationRule[];
  showRequiredIndicator?: boolean;
  onChange?: (value: string, isValid: boolean) => void;
  onValidate?: (error: string | null) => void;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    {
      label,
      error: externalError,
      hint,
      options,
      placeholder,
      rules = [],
      showRequiredIndicator = true,
      onChange,
      onValidate,
      className,
      ...selectProps
    },
    ref
  ) => {
    const id = useId();
    const [internalError, setInternalError] = useState<string | null>(null);
    const [touched, setTouched] = useState(false);

    const displayError = externalError || (touched ? internalError : null);
    const isRequired = rules.some((r) => r.type === "required");

    const validate = useCallback(
      (value: string) => {
        const error = validateValue(value, rules);
        setInternalError(error);
        onValidate?.(error);
        return error === null;
      },
      [rules, onValidate]
    );

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setTouched(true);
      const isValid = validate(value);
      onChange?.(value, isValid);
    };

    const handleBlur = () => {
      setTouched(true);
      validate(selectProps.value as string || "");
    };

    return (
      <div className={`form-field ${displayError ? "has-error" : ""} ${className || ""}`}>
        <label htmlFor={id} className="form-label">
          {label}
          {showRequiredIndicator && isRequired && (
            <span className="required-indicator" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <select
          {...selectProps}
          ref={ref}
          id={id}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={!!displayError}
          aria-describedby={displayError ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`form-select ${displayError ? "input-error" : ""}`}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {displayError && (
          <span id={`${id}-error`} className="field-error" role="alert">
            {displayError}
          </span>
        )}
        {hint && !displayError && (
          <span id={`${id}-hint`} className="field-hint">
            {hint}
          </span>
        )}
      </div>
    );
  }
);

SelectField.displayName = "SelectField";

// Hook for form-level validation
export interface UseFormValidationOptions<T> {
  initialValues: T;
  rules: Partial<Record<keyof T, ValidationRule[]>>;
  onSubmit: (values: T) => void | Promise<void>;
}

export function useFormValidation<T extends Record<string, string>>({
  initialValues,
  rules,
  onSubmit,
}: UseFormValidationOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = useCallback(
    (field: keyof T, value: string) => {
      const fieldRules = rules[field];
      if (!fieldRules) return null;
      return validateValue(value, fieldRules);
    },
    [rules]
  );

  const validateAll = useCallback(() => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    for (const field of Object.keys(rules) as Array<keyof T>) {
      const error = validateField(field, values[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  }, [rules, validateField, values]);

  const setValue = useCallback(
    (field: keyof T, value: string) => {
      setValues((prev) => ({ ...prev, [field]: value }));
      if (touched[field]) {
        const error = validateField(field, value);
        setErrors((prev) => ({
          ...prev,
          [field]: error || undefined,
        }));
      }
    },
    [touched, validateField]
  );

  const setFieldTouched = useCallback(
    (field: keyof T) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const error = validateField(field, values[field]);
      setErrors((prev) => ({
        ...prev,
        [field]: error || undefined,
      }));
    },
    [validateField, values]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Mark all fields as touched
      const allTouched: Partial<Record<keyof T, boolean>> = {};
      for (const field of Object.keys(values) as Array<keyof T>) {
        allTouched[field] = true;
      }
      setTouched(allTouched);

      if (!validateAll()) {
        return;
      }

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, validateAll, onSubmit]
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    setValue,
    setFieldTouched,
    handleSubmit,
    validateAll,
    reset,
    getFieldProps: (field: keyof T) => ({
      value: values[field],
      error: touched[field] ? errors[field] : undefined,
      onChange: (value: string) => setValue(field, value),
      onBlur: () => setFieldTouched(field),
    }),
  };
}

// Common validation rule presets
export const validationRules = {
  required: (message = "This field is required"): ValidationRule => ({
    type: "required",
    message,
  }),
  email: (message = "Enter a valid email address"): ValidationRule => ({
    type: "email",
    message,
  }),
  minLength: (min: number, message?: string): ValidationRule => ({
    type: "minLength",
    value: min,
    message: message || `Must be at least ${min} characters`,
  }),
  maxLength: (max: number, message?: string): ValidationRule => ({
    type: "maxLength",
    value: max,
    message: message || `Must be no more than ${max} characters`,
  }),
  pattern: (regex: RegExp, message: string): ValidationRule => ({
    type: "pattern",
    value: regex,
    message,
  }),
  password: (): ValidationRule[] => [
    { type: "required", message: "Password is required" },
    { type: "minLength", value: 12, message: "Password must be at least 12 characters" },
    {
      type: "pattern",
      value: /[A-Z]/,
      message: "Password must include an uppercase letter",
    },
    {
      type: "pattern",
      value: /[a-z]/,
      message: "Password must include a lowercase letter",
    },
    {
      type: "pattern",
      value: /\d/,
      message: "Password must include a number",
    },
    {
      type: "pattern",
      value: /[!@#$%^&*(),.?":{}|<>]/,
      message: "Password must include a special character",
    },
  ],
  latitude: (message = "Enter a valid latitude (-90 to 90)"): ValidationRule => ({
    type: "custom",
    value: (val: string) => {
      if (!val) return null;
      const num = parseFloat(val);
      return isNaN(num) || num < -90 || num > 90 ? message : null;
    },
    message,
  }),
  longitude: (message = "Enter a valid longitude (-180 to 180)"): ValidationRule => ({
    type: "custom",
    value: (val: string) => {
      if (!val) return null;
      const num = parseFloat(val);
      return isNaN(num) || num < -180 || num > 180 ? message : null;
    },
    message,
  }),
};
