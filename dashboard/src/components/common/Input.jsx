import React, { useId } from 'react';
import './Input.css';

export default function Input({
  label,
  error,
  type = 'text',
  required = false,
  disabled = false,
  className = '',
  id: customId,
  ...props
}) {
  const generatedId = useId();
  const id = customId || generatedId;

  return (
    <div className="input-group">
      {label && (
        <label htmlFor={id} className="input-label">
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}
      <input
        id={id}
        type={type}
        className={`input ${error ? 'error' : ''} ${disabled ? 'disabled' : ''} ${className}`}
        disabled={disabled}
        {...props}
      />
      {error && <span className="input-error">{error}</span>}
    </div>
  );
}
