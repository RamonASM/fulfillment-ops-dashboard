/**
 * MappingComboBox - Combo-box UI for column mapping selection
 *
 * Allows users to:
 * 1. Select from predefined target fields
 * 2. Type to filter options
 * 3. Type a custom field name to create a new field
 * 4. See "Create from source column" suggestion for low-confidence mappings
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, Plus, Search, Check, AlertTriangle } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export interface TargetField {
  value: string;
  label: string;
  category?: string;
  description?: string;
}

export interface MappingComboBoxProps {
  /** Current selected field value */
  value: string;
  /** Called when selection changes */
  onChange: (value: string, isCustom: boolean) => void;
  /** Available target field options */
  options: TargetField[];
  /** Original source column name from import file */
  sourceColumnName: string;
  /** Confidence score for current mapping (0-1) */
  confidence: number;
  /** Existing custom fields for this client */
  existingCustomFields?: string[];
  /** Whether field is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CONFIDENCE_COLORS = {
  high: 'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-red-100 text-red-800 border-red-300',
  custom: 'bg-purple-100 text-purple-800 border-purple-300',
};

const CATEGORY_ORDER = [
  'Product',
  'Order',
  'Quantity',
  'Address',
  'Contact',
  'Financial',
  'Shipping',
  'Custom',
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

function normalizeFieldName(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[()[\]{}]/g, '')
    .replace(/[-_\s]+/g, ' ')
    .split(' ')
    .filter(word => word.length > 0)
    .map((word, index) =>
      index === 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join('');
}

function formatFieldLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// =============================================================================
// COMPONENT
// =============================================================================

export function MappingComboBox({
  value,
  onChange,
  options,
  sourceColumnName,
  confidence,
  existingCustomFields = [],
  disabled = false,
  placeholder = 'Select or type field name...',
  className = '',
}: MappingComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Check if current value is a custom field
  const isCustomField = useMemo(() => {
    const isKnownField = options.some(opt => opt.value === value);
    const isExistingCustom = existingCustomFields.includes(value);
    return !isKnownField || isExistingCustom;
  }, [value, options, existingCustomFields]);

  // Generate suggested custom field name from source column
  const suggestedCustomField = useMemo(() => {
    return normalizeFieldName(sourceColumnName);
  }, [sourceColumnName]);

  // Filter and group options based on search term
  const filteredOptions = useMemo(() => {
    const term = searchTerm.toLowerCase();

    let filtered = options.filter(opt =>
      opt.label.toLowerCase().includes(term) ||
      opt.value.toLowerCase().includes(term) ||
      (opt.description && opt.description.toLowerCase().includes(term))
    );

    // Group by category
    const grouped: Record<string, TargetField[]> = {};
    for (const opt of filtered) {
      const category = opt.category || 'Other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(opt);
    }

    // Sort categories by predefined order
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
      const aIdx = CATEGORY_ORDER.indexOf(a);
      const bIdx = CATEGORY_ORDER.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    return { grouped, sortedCategories, totalCount: filtered.length };
  }, [options, searchTerm]);

  // Flatten options for keyboard navigation
  const flatOptions = useMemo(() => {
    const result: TargetField[] = [];
    for (const category of filteredOptions.sortedCategories) {
      result.push(...filteredOptions.grouped[category]);
    }
    return result;
  }, [filteredOptions]);

  // Check if search term could be a new custom field
  const canCreateCustomField = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return false;
    const normalized = normalizeFieldName(searchTerm);
    const exists = options.some(opt => opt.value === normalized);
    const existsAsCustom = existingCustomFields.includes(normalized);
    return !exists && !existsAsCustom;
  }, [searchTerm, options, existingCustomFields]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option]');
      const item = items[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < flatOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : flatOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && flatOptions[highlightedIndex]) {
          handleSelect(flatOptions[highlightedIndex].value, false);
        } else if (canCreateCustomField) {
          handleCreateCustomField(normalizeFieldName(searchTerm));
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchTerm('');
        inputRef.current?.blur();
        break;
      case 'Tab':
        setIsOpen(false);
        setSearchTerm('');
        break;
    }
  }, [isOpen, highlightedIndex, flatOptions, canCreateCustomField, searchTerm]);

  const handleSelect = (fieldValue: string, isCustom: boolean) => {
    onChange(fieldValue, isCustom);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  const handleCreateCustomField = (fieldName: string) => {
    onChange(fieldName, true);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    setSearchTerm('');
  };

  // Get display label for current value
  const displayLabel = useMemo(() => {
    const option = options.find(opt => opt.value === value);
    if (option) return option.label;
    if (value) return formatFieldLabel(value);
    return '';
  }, [value, options]);

  const confidenceLevel = getConfidenceLevel(confidence);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
    >
      {/* Main input area */}
      <div
        className={`
          flex items-center gap-2 px-3 py-2 border rounded-lg
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white cursor-pointer'}
          ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-300 hover:border-gray-400'}
        `}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {/* Confidence indicator */}
        {value && (
          <span
            className={`
              px-1.5 py-0.5 text-xs font-medium rounded
              ${isCustomField ? CONFIDENCE_COLORS.custom : CONFIDENCE_COLORS[confidenceLevel]}
            `}
            title={isCustomField ? 'Custom field' : `${Math.round(confidence * 100)}% confidence`}
          >
            {isCustomField ? 'Custom' : `${Math.round(confidence * 100)}%`}
          </span>
        )}

        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          className={`
            flex-1 outline-none bg-transparent text-sm
            ${disabled ? 'cursor-not-allowed' : ''}
          `}
          value={isOpen ? searchTerm : displayLabel}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={value ? '' : placeholder}
          disabled={disabled}
        />

        {/* Dropdown icon */}
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-hidden">
          {/* Search hint */}
          <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Search className="w-3 h-3" />
              <span>Type to search or create a custom field</span>
            </div>
          </div>

          {/* Options list */}
          <ul
            ref={listRef}
            className="overflow-y-auto max-h-56"
          >
            {/* Create from source column suggestion */}
            {confidence < 0.7 && (
              <li
                className={`
                  px-3 py-2 cursor-pointer border-b border-gray-100
                  bg-purple-50 hover:bg-purple-100
                `}
                onClick={() => handleCreateCustomField(suggestedCustomField)}
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-800">
                    Create "{formatFieldLabel(suggestedCustomField)}"
                  </span>
                  <span className="text-xs text-purple-600">from source column</span>
                </div>
              </li>
            )}

            {/* Custom field creation option */}
            {canCreateCustomField && (
              <li
                className="px-3 py-2 cursor-pointer bg-blue-50 hover:bg-blue-100 border-b border-gray-100"
                onClick={() => handleCreateCustomField(normalizeFieldName(searchTerm))}
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">
                    Create new field "{formatFieldLabel(normalizeFieldName(searchTerm))}"
                  </span>
                </div>
              </li>
            )}

            {/* Grouped options */}
            {filteredOptions.sortedCategories.map(category => (
              <li key={category}>
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
                  {category}
                </div>
                {filteredOptions.grouped[category].map((option) => {
                  const globalIndex = flatOptions.indexOf(option);
                  const isSelected = value === option.value;
                  const isHighlighted = globalIndex === highlightedIndex;

                  return (
                    <div
                      key={option.value}
                      data-option
                      className={`
                        px-3 py-2 cursor-pointer flex items-center justify-between
                        ${isHighlighted ? 'bg-blue-50' : ''}
                        ${isSelected ? 'bg-blue-100' : ''}
                        hover:bg-gray-50
                      `}
                      onClick={() => handleSelect(option.value, false)}
                      onMouseEnter={() => setHighlightedIndex(globalIndex)}
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {option.label}
                        </div>
                        {option.description && (
                          <div className="text-xs text-gray-500">
                            {option.description}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                  );
                })}
              </li>
            ))}

            {/* No results message */}
            {filteredOptions.totalCount === 0 && !canCreateCustomField && (
              <li className="px-3 py-4 text-center text-gray-500">
                <AlertTriangle className="w-5 h-5 mx-auto mb-1" />
                <div className="text-sm">No matching fields found</div>
                <div className="text-xs">Try a different search term</div>
              </li>
            )}
          </ul>

          {/* Existing custom fields section */}
          {existingCustomFields.length > 0 && searchTerm === '' && (
            <div className="border-t border-gray-200">
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">
                Your Custom Fields
              </div>
              {existingCustomFields.slice(0, 5).map(field => (
                <div
                  key={field}
                  className={`
                    px-3 py-2 cursor-pointer flex items-center justify-between
                    hover:bg-gray-50
                    ${value === field ? 'bg-purple-50' : ''}
                  `}
                  onClick={() => handleSelect(field, true)}
                >
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                      Custom
                    </span>
                    <span className="text-sm text-gray-900">
                      {formatFieldLabel(field)}
                    </span>
                  </div>
                  {value === field && (
                    <Check className="w-4 h-4 text-purple-600" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MappingComboBox;
