// =============================================================================
// VIDEO EMBED
// Embeds YouTube and Vimeo videos with lazy loading
// =============================================================================

import React, { useState, useEffect, useRef } from "react";
import type { VideoEmbedProps, VideoEmbedConfig } from "./types";

// =============================================================================
// VIDEO URL DETECTION
// =============================================================================

function detectVideoType(url: string): VideoEmbedConfig | null {
  // YouTube patterns
  const youtubeRegex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const youtubeMatch = url.match(youtubeRegex);

  if (youtubeMatch) {
    return {
      url,
      type: "youtube",
      videoId: youtubeMatch[1],
    };
  }

  // Vimeo patterns
  const vimeoRegex = /vimeo\.com\/(?:.*\/)?(\d+)/;
  const vimeoMatch = url.match(vimeoRegex);

  if (vimeoMatch) {
    return {
      url,
      type: "vimeo",
      videoId: vimeoMatch[1],
    };
  }

  // Direct video file
  if (url.match(/\.(mp4|webm|ogg)$/i)) {
    return {
      url,
      type: "direct",
    };
  }

  return null;
}

// =============================================================================
// VIDEO EMBED COMPONENT
// =============================================================================

export function VideoEmbed({ url, title = "Video" }: VideoEmbedProps) {
  const [isInView, setIsInView] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const videoConfig = detectVideoType(url);

  // Lazy load video when it comes into view
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasLoaded) {
            setIsInView(true);
            setHasLoaded(true);
          }
        });
      },
      {
        rootMargin: "50px", // Start loading slightly before it's in view
      },
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [hasLoaded]);

  // If URL is not a supported video type, return null
  if (!videoConfig) {
    return null;
  }

  // Render based on video type
  return (
    <div ref={containerRef} className="my-6">
      <div className="relative w-full rounded-lg overflow-hidden bg-gray-100 shadow-md">
        {/* 16:9 Aspect Ratio Container */}
        <div className="relative pb-[56.25%]">
          {!isInView ? (
            // Placeholder before loading
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
              <div className="text-center">
                <svg
                  className="w-16 h-16 mx-auto text-gray-400 mb-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                </svg>
                <p className="text-sm text-gray-500">Loading video...</p>
              </div>
            </div>
          ) : (
            <>
              {videoConfig.type === "youtube" && (
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed/${videoConfig.videoId}?rel=0`}
                  title={title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              )}

              {videoConfig.type === "vimeo" && (
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://player.vimeo.com/video/${videoConfig.videoId}`}
                  title={title}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              )}

              {videoConfig.type === "direct" && (
                <video
                  className="absolute inset-0 w-full h-full"
                  controls
                  preload="metadata"
                >
                  <source src={videoConfig.url} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              )}
            </>
          )}
        </div>
      </div>

      {/* Caption */}
      {title && title !== "Video" && (
        <p className="text-sm text-gray-600 text-center mt-2 italic">{title}</p>
      )}
    </div>
  );
}
