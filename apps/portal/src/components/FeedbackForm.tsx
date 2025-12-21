// =============================================================================
// FEEDBACK FORM COMPONENT
// Portal component for submitting product feedback with ratings
// =============================================================================

import { useState } from 'react';
import { Star, ThumbsUp, ThumbsDown, Minus, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { fadeInUp } from '@/lib/animations';

interface FeedbackFormProps {
  productId: string;
  productName: string;
  orderRequestId?: string;
  locationId?: string;
  onSubmit: (data: FeedbackData) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export interface FeedbackData {
  productId: string;
  orderRequestId?: string;
  locationId?: string;
  qualityRating: number;
  deliveryRating?: number;
  valueRating?: number;
  wouldReorder?: boolean;
  usageNotes?: string;
  quantitySatisfaction?: 'too_little' | 'just_right' | 'too_much';
  positiveComments?: string;
  improvementSuggestions?: string;
}

// Rating descriptions for accessibility
const ratingLabels: Record<number, string> = {
  1: 'Very Poor',
  2: 'Poor',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

// Star Rating Component
function StarRating({
  value,
  onChange,
  label,
  required = false,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  required?: boolean;
  id?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const labelId = id ? `${id}-label` : undefined;

  return (
    <div className="space-y-2">
      <label id={labelId} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
        {required && <span className="sr-only">(required)</span>}
      </label>
      <div
        className="flex gap-1"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={value > 0 ? `${id}-description` : undefined}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onChange(star)}
            className="p-1 transition-transform hover:scale-110"
            aria-label={`Rate ${star} out of 5 stars - ${ratingLabels[star]}`}
            aria-pressed={star === value}
          >
            <Star
              className={clsx(
                'w-7 h-7 transition-colors',
                (hovered !== null ? star <= hovered : star <= value)
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-gray-300'
              )}
              aria-hidden="true"
            />
          </button>
        ))}
        {value > 0 && (
          <span id={`${id}-description`} className="ml-2 text-sm text-gray-500 self-center">
            {ratingLabels[value]}
          </span>
        )}
      </div>
    </div>
  );
}

// Would Reorder Selection
function WouldReorderToggle({
  value,
  onChange,
}: {
  value?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <label id="reorder-label" className="block text-sm font-medium text-gray-700">
        Would you reorder this product?
      </label>
      <div
        className="flex gap-3"
        role="group"
        aria-labelledby="reorder-label"
      >
        <button
          type="button"
          onClick={() => onChange(true)}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all',
            value === true
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-gray-200 hover:border-gray-300 text-gray-600'
          )}
          aria-pressed={value === true}
          aria-label="Yes, I would reorder this product"
        >
          <ThumbsUp className="w-4 h-4" aria-hidden="true" />
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all',
            value === false
              ? 'border-red-500 bg-red-50 text-red-700'
              : 'border-gray-200 hover:border-gray-300 text-gray-600'
          )}
          aria-pressed={value === false}
          aria-label="No, I would not reorder this product"
        >
          <ThumbsDown className="w-4 h-4" aria-hidden="true" />
          No
        </button>
      </div>
    </div>
  );
}

// Quantity Satisfaction
function QuantitySatisfaction({
  value,
  onChange,
}: {
  value?: 'too_little' | 'just_right' | 'too_much';
  onChange: (value: 'too_little' | 'just_right' | 'too_much') => void;
}) {
  const options = [
    { value: 'too_little', label: 'Too Little', icon: Minus, ariaLabel: 'The quantity was too little' },
    { value: 'just_right', label: 'Just Right', icon: ThumbsUp, ariaLabel: 'The quantity was just right' },
    { value: 'too_much', label: 'Too Much', icon: Minus, ariaLabel: 'The quantity was too much' },
  ] as const;

  return (
    <div className="space-y-2">
      <label id="quantity-satisfaction-label" className="block text-sm font-medium text-gray-700">
        How was the quantity ordered?
      </label>
      <div
        className="flex gap-3 flex-wrap"
        role="group"
        aria-labelledby="quantity-satisfaction-label"
      >
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all',
                isSelected
                  ? option.value === 'just_right'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              )}
              aria-pressed={isSelected}
              aria-label={option.ariaLabel}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FeedbackForm({
  productId,
  productName,
  orderRequestId,
  locationId,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: FeedbackFormProps) {
  const [form, setForm] = useState<Partial<FeedbackData>>({
    productId,
    orderRequestId,
    locationId,
    qualityRating: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const newErrors: Record<string, string> = {};
    if (!form.qualityRating || form.qualityRating === 0) {
      newErrors.qualityRating = 'Quality rating is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSubmit(form as FeedbackData);
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Product Header */}
      <div className="pb-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Rate your experience with
        </h3>
        <p className="text-primary-600 font-medium">{productName}</p>
      </div>

      {/* Quality Rating (Required) */}
      <div>
        <StarRating
          id="quality-rating"
          value={form.qualityRating || 0}
          onChange={(value) => {
            setForm({ ...form, qualityRating: value });
            setErrors({ ...errors, qualityRating: '' });
          }}
          label="Product Quality"
          required
        />
        <AnimatePresence>
          {errors.qualityRating && (
            <motion.p
              id="quality-rating-error"
              role="alert"
              aria-live="polite"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-sm text-red-500 mt-1"
            >
              {errors.qualityRating}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Delivery Rating (Optional) */}
      <StarRating
        id="delivery-rating"
        value={form.deliveryRating || 0}
        onChange={(value) => setForm({ ...form, deliveryRating: value })}
        label="Delivery Experience"
      />

      {/* Value Rating (Optional) */}
      <StarRating
        id="value-rating"
        value={form.valueRating || 0}
        onChange={(value) => setForm({ ...form, valueRating: value })}
        label="Value for Money"
      />

      {/* Would Reorder */}
      <WouldReorderToggle
        value={form.wouldReorder}
        onChange={(value) => setForm({ ...form, wouldReorder: value })}
      />

      {/* Quantity Satisfaction */}
      <QuantitySatisfaction
        value={form.quantitySatisfaction}
        onChange={(value) => setForm({ ...form, quantitySatisfaction: value })}
      />

      {/* Usage Notes */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          How do you use this product?
        </label>
        <textarea
          value={form.usageNotes || ''}
          onChange={(e) => setForm({ ...form, usageNotes: e.target.value })}
          placeholder="Share how you typically use this product..."
          rows={3}
          className="input w-full resize-none"
        />
      </div>

      {/* Positive Comments */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          What did you like about this product?
        </label>
        <textarea
          value={form.positiveComments || ''}
          onChange={(e) => setForm({ ...form, positiveComments: e.target.value })}
          placeholder="Share what you enjoyed..."
          rows={3}
          className="input w-full resize-none"
        />
      </div>

      {/* Improvement Suggestions */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Any suggestions for improvement?
        </label>
        <textarea
          value={form.improvementSuggestions || ''}
          onChange={(e) => setForm({ ...form, improvementSuggestions: e.target.value })}
          placeholder="How could this product be better?"
          rows={3}
          className="input w-full resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex-1"
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
          aria-busy={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Submitting...
            </>
          ) : (
            'Submit Feedback'
          )}
        </button>
      </div>
    </motion.form>
  );
}

export { FeedbackForm };
