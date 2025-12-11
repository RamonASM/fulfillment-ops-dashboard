// =============================================================================
// LOCATION SELECTOR COMPONENT (PORTAL)
// Dropdown for selecting delivery location in order requests
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { MapPin, Building2, Warehouse, Store, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { portalApi } from '@/api/client';
import { usePortalAuthStore } from '@/stores/auth.store';

interface Location {
  id: string;
  name: string;
  code: string;
  locationType: 'headquarters' | 'branch' | 'warehouse' | 'store';
  city: string | null;
  state: string | null;
  address: string | null;
  isActive: boolean;
}

interface LocationSelectorProps {
  value: string | null;
  onChange: (locationId: string | null) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

const LOCATION_ICONS = {
  headquarters: Building2,
  branch: MapPin,
  warehouse: Warehouse,
  store: Store,
};

export default function LocationSelector({
  value,
  onChange,
  placeholder = 'Select delivery location...',
  className,
  required = false,
  disabled = false,
}: LocationSelectorProps) {
  const { user } = usePortalAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch locations for the client
  const { data: locationsData, isLoading } = useQuery({
    queryKey: ['portal', 'locations'],
    queryFn: () => portalApi.get<{ data: Location[] }>('/locations'),
    enabled: !!user?.clientId,
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

  const handleSelect = (locationId: string) => {
    onChange(locationId);
    setIsOpen(false);
    setSearch('');
  };

  // If only one location, auto-select it
  useEffect(() => {
    if (locations.length === 1 && !value) {
      onChange(locations[0].id);
    }
  }, [locations, value, onChange]);

  // If no locations available, show a message
  if (!isLoading && locations.length === 0) {
    return (
      <div className={clsx('text-sm text-gray-500 italic', className)}>
        No delivery locations configured
      </div>
    );
  }

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
          isOpen && 'ring-2 ring-emerald-500',
          required && !value && 'border-amber-300'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          {selectedLocation ? (
            <div className="truncate">
              <span className="font-medium">{selectedLocation.name}</span>
              {selectedLocation.city && (
                <span className="text-gray-400 ml-1 text-sm">
                  - {[selectedLocation.city, selectedLocation.state].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
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
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden">
          {/* Search input (only show if more than 5 locations) */}
          {locations.length > 5 && (
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
          )}

          {/* Options */}
          <div className="overflow-y-auto max-h-56">
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
                      'w-full px-3 py-3 text-left text-sm hover:bg-gray-50 flex items-start gap-3 transition-colors',
                      isSelected && 'bg-emerald-50 text-emerald-700',
                      !location.isActive && 'opacity-50'
                    )}
                  >
                    <LocationIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{location.name}</span>
                        <span className="text-gray-400 text-xs">{location.code}</span>
                      </div>
                      {location.city && (
                        <p className="text-xs text-gray-500 truncate">
                          {[location.city, location.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {location.address && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {location.address}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5" />
                    )}
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
