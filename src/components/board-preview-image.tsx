"use client";

import { type ComponentProps, useEffect, useState } from "react";

/**
 * An SVG image that stays hidden until it has loaded, so a missing or
 * unauthorized image leaves the placeholder under it showing instead of the
 * browser's broken-image icon. Loads through `Image` because SVG `<image>`
 * has no `complete` flag to catch a load that finished before hydration.
 */
export function BoardPreviewImage({
  href,
  ...props
}: ComponentProps<"image"> & { href: string }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.src = href;
    return () => {
      img.onload = null;
    };
  }, [href]);

  if (!loaded) return null;
  return <image href={href} className="animate-in fade-in" {...props} />;
}
