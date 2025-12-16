// =============================================================================
// PROGRESS TRACKER
// Tracks tutorial step completion with localStorage persistence
// =============================================================================

import React, { useState, useEffect } from "react";
import type {
  ProgressTrackerProps,
  TutorialStep,
  TutorialProgress,
} from "./types";

// =============================================================================
// THEME COLORS
// =============================================================================

const themeColors = {
  blue: {
    checkboxBorder: "border-blue-600",
    checkboxBg: "bg-blue-600",
    progressBg: "bg-blue-600",
    buttonBg: "bg-blue-600 hover:bg-blue-700",
  },
  emerald: {
    checkboxBorder: "border-emerald-600",
    checkboxBg: "bg-emerald-600",
    progressBg: "bg-emerald-600",
    buttonBg: "bg-emerald-600 hover:bg-emerald-700",
  },
};

// =============================================================================
// STEP EXTRACTION
// Extract task list items from markdown
// =============================================================================

function extractSteps(markdown: string): TutorialStep[] {
  const taskListRegex = /^-\s+\[([ x])\]\s+(.+)$/gm;
  const steps: TutorialStep[] = [];
  let match;

  while ((match = taskListRegex.exec(markdown)) !== null) {
    const completed = match[1] === "x";
    const title = match[2].trim();
    const id = `step-${steps.length + 1}`;

    steps.push({ id, title, completed });
  }

  return steps;
}

// =============================================================================
// PROGRESS TRACKER COMPONENT
// =============================================================================

export function ProgressTracker({
  articleSlug,
  content,
  theme,
}: ProgressTrackerProps) {
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const colors = themeColors[theme];
  const storageKey = `help-tutorial-${articleSlug}`;

  // Load progress from localStorage and merge with extracted steps
  useEffect(() => {
    const extractedSteps = extractSteps(content);

    if (extractedSteps.length === 0) {
      setSteps([]);
      return;
    }

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const progress: TutorialProgress = JSON.parse(saved);

        // Merge saved progress with current steps
        const mergedSteps = extractedSteps.map((step, index) => {
          const savedStep = progress.steps[index];
          return savedStep && savedStep.title === step.title ? savedStep : step;
        });

        setSteps(mergedSteps);
      } else {
        setSteps(extractedSteps);
      }
    } catch (error) {
      console.error("Failed to load tutorial progress:", error);
      setSteps(extractedSteps);
    }
  }, [content, articleSlug, storageKey]);

  // Save progress to localStorage
  const saveProgress = (updatedSteps: TutorialStep[]) => {
    const progress: TutorialProgress = {
      steps: updatedSteps,
      lastUpdated: new Date().toISOString(),
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch (error) {
      console.error("Failed to save tutorial progress:", error);
    }
  };

  // Toggle step completion
  const toggleStep = (stepId: string) => {
    const updatedSteps = steps.map((step) =>
      step.id === stepId ? { ...step, completed: !step.completed } : step,
    );

    setSteps(updatedSteps);
    saveProgress(updatedSteps);
  };

  // Mark all steps as complete
  const completeAll = () => {
    const updatedSteps = steps.map((step) => ({ ...step, completed: true }));
    setSteps(updatedSteps);
    saveProgress(updatedSteps);
  };

  // Reset all steps
  const resetAll = () => {
    const updatedSteps = steps.map((step) => ({ ...step, completed: false }));
    setSteps(updatedSteps);
    saveProgress(updatedSteps);
  };

  // Don't render if no steps
  if (steps.length === 0) {
    return null;
  }

  // Calculate progress
  const completedCount = steps.filter((step) => step.completed).length;
  const progressPercentage = (completedCount / steps.length) * 100;

  return (
    <div className="my-6 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Tutorial Progress
            </h4>
            <p className="text-xs text-gray-600 mt-0.5">
              {completedCount} of {steps.length} steps completed
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {completedCount < steps.length && (
              <button
                onClick={completeAll}
                className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 transition-colors"
              >
                Complete All
              </button>
            )}
            {completedCount > 0 && (
              <button
                onClick={resetAll}
                className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full ${colors.progressBg} transition-all duration-300`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="px-4 py-3">
        <ul className="space-y-2">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-3">
              <label className="flex items-start gap-3 cursor-pointer flex-1 group">
                {/* Checkbox */}
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    checked={step.completed}
                    onChange={() => toggleStep(step.id)}
                    className="sr-only"
                  />
                  <div
                    className={`
                      w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                      ${
                        step.completed
                          ? `${colors.checkboxBorder} ${colors.checkboxBg}`
                          : "border-gray-300 group-hover:border-gray-400"
                      }
                    `}
                  >
                    {step.completed && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Step Title */}
                <span
                  className={`
                    text-sm flex-1 transition-colors
                    ${
                      step.completed
                        ? "text-gray-500 line-through"
                        : "text-gray-900 group-hover:text-gray-700"
                    }
                  `}
                >
                  {step.title}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* Completion Message */}
      {progressPercentage === 100 && (
        <div className="bg-green-50 border-t border-green-200 px-4 py-3">
          <div className="flex items-center gap-2 text-green-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">
              Tutorial completed! Great job!
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
