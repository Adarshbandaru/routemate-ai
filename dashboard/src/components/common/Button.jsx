import React from 'react';
import './Button.css';

export default function Button({
  children,
  variant = 'primary', // 'primary', 'secondary', 'danger', 'success'
  size = 'md', // 'sm', 'md', 'lg'
  disabled = false,
  loading = false,
  onClick,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${disabled || loading ? 'disabled' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <>
          <span className="spinner" aria-hidden="true"></span>
          <span className="sr-only">Loading...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
