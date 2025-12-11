// =============================================================================
// LOCATION SELECTOR COMPONENT
// Dropdown component for selecting locations in admin dashboard
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { MapPin, Building2, Warehouse, Store, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { api } from '@/api/client';

interface Location {
  id: string;
  name: string;
  code: string;
  locationType: 'headquarters' | 'branch' | 'warehouse' | 'store';
  city: string | null;
  state: string | null;
  isActive: boolean;
}

interface LocationSelectorProps {
  clientId: string;
  value: string | null;
  onChange: (locationId: string | null) => void;
  placeholder?: string;
  showAllOption?: boolean;
  className?: string;
  disabled?: boolean;
}

const LOCATION_ICONS = {
  headquarters: Building2,
  branch: MapPin,
  warehouse: Warehouse,
  store: Store,
};

export default function LocationSelector({
  clientId,
  value,
  onChange,
  placeholder = 'Select location...',
  showAllOption = false,
  className,
  disabled = false,
}: LocationSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch locations for the client
  const { data: locationsData, isLoading } = useQuery({
    queryKey: ['locations', clientId],
    queryFn: () =>
      api.get<{ data: Location[] }>(`/clients/${clientId}/locations`),
    enabled: !!clientId,
  });

  const locations = locationsData?.data || [];

  // Filter locations by search
  const filteredLocations = locations.filter(
    (loc) =>
      loc.name.toLowerCase().includes(search.toLowerCase()) ||
      loc.code.toLowerCase().includes(search.toLowerCase()) ||
      loc.city?.toLowerCase().includes(search.toLowerCase())
  );

  // Get selected location
  const selectedLocation = value
    ? locations.find((loc) => loc.id === value)
    : null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSelect = (locationId: string | null) => {
    onChange(locationId);
    setIsOpen(false);
    setSearch('');
  };

  const Icon = selectedLocation
    ? LOCATION_ICONS[selectedLocation.locationType]
    : MapPin;

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'input w-full flex items-center justify-between gap-2 text-left',
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'ring-2 ring-primary-500'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          {selectedLocation ? (
            <span className="truncate">
              {selectedLocation.name}
              <span className="text-gray-400 ml-1">({selectedLocation.code})</span>
            </span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={clsx(
            'w-4 h-4 text-gray-400 flex-shrink-0 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search locations..."
              className="input w-full text-sm"
              autoFocus
            />
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-48">
            {showAllOption && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={clsx(
                  'w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2',
                  !value && 'bg-primary-50 text-primary-700'
                )}
              >
                <MapPin className="w-4 h-4 text-gray-400" />
                All Locations
              </button>
            )}

            {isLoading ? (
              <div className="px-3 py-4 text-center text-gray-500 text-sm">
                Loading locations...
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="px-3 py-4 text-center text-gray-500 text-sm">
                {search ? 'No locations match your search' : 'No locations available'}
              </div>
            ) : (
              filteredLocations.map((location) => {
                const LocationIcon = LOCATION_ICONS[location.locationType];
                const isSelected = value === location.id;
                return (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => handleSelect(location.id)}
                    className={clsx(
                      'w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2',
                      isSelected && 'bg-primary-50 text-primary-700',
                      !location.isActive && 'opacity-50'
                    )}
                  >
                    <LocationIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{location.name}</span>
                        <span className="text-gray-400 text-xs">{location.code}</span>
                      </div>
                      {location.city && (
                        <p className="text-xs text-gray-500 truncate">
                          {[location.city, location.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { LocationSelector };
