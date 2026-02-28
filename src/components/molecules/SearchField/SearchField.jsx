import { useState } from 'react';
import Input from '../../atoms/Input';
import Icon from '../../atoms/Icon';
import './SearchField.css';

export default function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  disabled = false,
}) {
  return (
    <div className={`ora-search${disabled ? ' ora-search--disabled' : ''}`}>
      <Icon name="settings" size={14} color="var(--ora-dim)" />
      <Input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        size="sm"
        disabled={disabled}
      />
      {value && (
        <button
          className="ora-search__clear"
          onClick={() => onChange?.('')}
          aria-label="Clear search"
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}
