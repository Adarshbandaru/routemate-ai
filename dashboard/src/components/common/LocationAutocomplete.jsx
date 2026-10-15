import { useState, useRef, useEffect } from 'react';
import { MapPin, X, Crosshair } from 'lucide-react';
import { PUNJAB_LANDMARKS } from '../../data/punjabLandmarks';

export default function LocationAutocomplete({
  label,
  value,
  onSelectLocation,
  placeholder = 'Search Punjab location or landmark...',
  iconType = 'pickup', // 'pickup' | 'dropoff'
}) {
  const [query, setQuery] = useState(value?.name || '');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredLandmarks = PUNJAB_LANDMARKS.filter((item) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.address.toLowerCase().includes(q)
    );
  }).slice(0, 5);

  const handleSelect = (item) => {
    setQuery(item.name);
    setIsOpen(false);
    onSelectLocation(item);
  };

  const handleUseCurrentLocation = () => {
    const lpuLocation = PUNJAB_LANDMARKS[0]; // Anchor on LPU for demo corridor
    setQuery(lpuLocation.name);
    setIsOpen(false);
    onSelectLocation(lpuLocation);
  };

  return (
    <div className="location-autocomplete-container" ref={containerRef}>
      <label className="autocomplete-label">{label}</label>
      <div className="autocomplete-input-box">
        <MapPin
          size={15}
          className={`autocomplete-pin-icon pin-${iconType}`}
        />
        <input
          type="text"
          className="autocomplete-text-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {query && (
          <button
            type="button"
            className="autocomplete-clear-btn"
            onClick={() => {
              setQuery('');
              setIsOpen(true);
            }}
            aria-label="Clear input"
          >
            <X size={13} />
          </button>
        )}
        <button
          type="button"
          className="autocomplete-gps-btn"
          onClick={handleUseCurrentLocation}
          title="Use current GPS location"
          aria-label="Use current location"
        >
          <Crosshair size={13} />
        </button>
      </div>

      {isOpen && (
        <ul className="autocomplete-dropdown-list" role="listbox">
          <li className="autocomplete-dropdown-header">
            <span>Verified Punjab GT Road Locations</span>
          </li>
          {filteredLandmarks.map((item) => (
            <li
              key={item.name}
              className="autocomplete-dropdown-item"
              onClick={() => handleSelect(item)}
              role="option"
              aria-selected={value?.name === item.name}
            >
              <div className="dropdown-item-icon">
                <MapPin size={13} />
              </div>
              <div className="dropdown-item-details">
                <div className="dropdown-item-name">{item.name}</div>
                <div className="dropdown-item-sub">{item.address}</div>
              </div>
            </li>
          ))}
          {filteredLandmarks.length === 0 && (
            <li className="autocomplete-dropdown-empty">
              <span>No locations found for "{query}". Try "LPU" or "Jalandhar".</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
