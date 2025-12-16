// =============================================================================
// HELP FEEDBACK
// Collects user feedback on help articles ("Was this helpful?")
// =============================================================================

import React, { useState } from "react";
import type { HelpFeedbackProps, FeedbackSubmission } from "./types";

// =============================================================================
// THEME COLORS
// =============================================================================

const themeColors = {
  blue: {
    yesButton: "bg-blue-600 hover:bg-blue-700 text-white",
    noButton: "bg-gray-200 hover:bg-gray-300 text-gray-700",
    submitButton: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  emerald: {
    yesButton: "bg-emerald-600 hover:bg-emerald-700 text-white",
    noButton: "bg-gray-200 hover:bg-gray-300 text-gray-700",
    submitButton: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
};

// =============================================================================
// HELP FEEDBACK COMPONENT
// =============================================================================

export function HelpFeedback({
  articleSlug,
  theme,
  onFeedbackSubmitted,
}: HelpFeedbackProps) {
  const [submitted, setSubmitted] = useState(false);
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = themeColors[theme];

  // Handle feedback submission
  const submitFeedback = async () => {
    if (helpful === null) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const feedback: FeedbackSubmission = {
        helpful,
        comment: comment.trim() || undefined,
      };

      const response = await fetch(
        `/api/documentation/${articleSlug}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(feedback),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to submit feedback");
      }

      setSubmitted(true);

      // Call callback if provided
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }
    } catch (err) {
      setError("Failed to submit feedback. Please try again.");
      console.error("Feedback submission error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Yes/No button click
  const handleFeedback = (isHelpful: boolean) => {
    setHelpful(isHelpful);

    // If Yes, submit immediately
    if (isHelpful) {
      setSubmitted(true);
      submitFeedback();
    }
    // If No, show comment field
  };

  // Render success message
  if (submitted && helpful) {
    return (
      <div className="mt-12 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2 text-green-700">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm font-medium">Thanks for your feedback!</p>
        </div>
      </div>
    );
  }

  // Render comment form after "No" is selected
  if (helpful === false && !submitted) {
    return (
      <div className="mt-12 pt-6 border-t border-gray-200">
        <p className="text-sm text-gray-700 mb-3 font-medium">
          How can we improve this article?
        </p>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us what's missing or unclear..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
          rows={4}
        />

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

        <div className="flex gap-2 mt-3">
          <button
            onClick={submitFeedback}
            disabled={isSubmitting}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${colors.submitButton}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </button>

          <button
            onClick={() => {
              setHelpful(null);
              setComment("");
              setError(null);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Render initial feedback buttons
  return (
    <div className="mt-12 pt-6 border-t border-gray-200">
      <p className="text-sm text-gray-700 mb-3 font-medium">
        Was this article helpful?
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => handleFeedback(true)}
          className={`
            px-6 py-2 rounded-lg text-sm font-medium transition-colors
            ${colors.yesButton}
          `}
        >
          Yes
        </button>

        <button
          onClick={() => handleFeedback(false)}
          className={`
            px-6 py-2 rounded-lg text-sm font-medium transition-colors
            ${colors.noButton}
          `}
        >
          No
        </button>
      </div>
    </div>
  );
}
