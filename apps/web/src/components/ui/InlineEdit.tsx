import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineEditProps {
  value: string | number;
  onSave: (newValue: string) => Promise<void> | void;
  type?: 'text' | 'number';
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  disabled?: boolean;
  validation?: (value: string) => string | null; // Returns error message or null
}

export function InlineEdit({
  value,
  onSave,
  type = 'text',
  placeholder = 'Click to edit',
  className,
  displayClassName,
  inputClassName,
  disabled = false,
  validation,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update edit value when prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(String(value));
    }
  }, [value, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    if (disabled) return;
    setIsEditing(true);
    setError(null);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditValue(String(value));
    setError(null);
  };

  const saveChanges = async () => {
    // Validate if needed
    if (validation) {
      const validationError = validation(editValue);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    // Don't save if value hasn't changed
    if (editValue === String(value)) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveChanges();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  if (!isEditing) {
    return (
      <button
        onClick={startEditing}
        disabled={disabled}
        className={cn(
          'group flex items-center gap-2 px-2 py-1 -mx-2 -my-1 rounded hover:bg-gray-100 transition-colors text-left',
          disabled && 'cursor-default hover:bg-transparent',
          className,
          displayClassName
        )}
      >
        <span className={!value ? 'text-gray-400' : ''}>
          {value || placeholder}
        </span>
        {!disabled && (
          <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Small delay to allow button clicks
            setTimeout(() => {
              if (document.activeElement !== inputRef.current) {
                cancelEditing();
              }
            }, 150);
          }}
          disabled={isSaving}
          className={cn(
            'w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-primary/50',
            error ? 'border-red-500' : 'border-gray-300',
            inputClassName
          )}
        />
        {error && (
          <div className="absolute top-full left-0 mt-1 text-xs text-red-500">
            {error}
          </div>
        )}
      </div>

      <button
        onClick={saveChanges}
        disabled={isSaving}
        className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
        title="Save"
      >
        <Check className="w-4 h-4" />
      </button>

      <button
        onClick={cancelEditing}
        disabled={isSaving}
        className="p-1 text-gray-500 hover:bg-gray-100 rounded transition-colors"
        title="Cancel"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Specialized number editor with increment/decrement
interface InlineNumberEditProps extends Omit<InlineEditProps, 'type' | 'value' | 'onSave'> {
  value: number;
  onSave: (newValue: number) => Promise<void> | void;
  min?: number;
  max?: number;
  step?: number;
}

export function InlineNumberEdit({
  value,
  onSave,
  min,
  max,
  step = 1,
  ...props
}: InlineNumberEditProps) {
  const handleSave = async (strValue: string) => {
    const numValue = parseFloat(strValue);
    if (isNaN(numValue)) {
      throw new Error('Invalid number');
    }
    await onSave(numValue);
  };

  const validation = (strValue: string): string | null => {
    const num = parseFloat(strValue);
    if (isNaN(num)) return 'Must be a number';
    if (min !== undefined && num < min) return `Minimum is ${min}`;
    if (max !== undefined && num > max) return `Maximum is ${max}`;
    return null;
  };

  return (
    <InlineEdit
      {...props}
      type="number"
      value={value}
      onSave={handleSave}
      validation={validation}
    />
  );
}

export default InlineEdit;
