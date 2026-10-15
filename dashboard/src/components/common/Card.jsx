import React from 'react';
import './Card.css';

export default function Card({
  children,
  className = '',
  elevated = false,
  ...props
}) {
  return (
    <div
      className={`card ${elevated ? 'elevated' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
