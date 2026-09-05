"use client";

import type { ImgHTMLAttributes } from "react";
import { useState } from "react";

interface ImageWithFallbackProps
  extends ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc?: string;
}

export function ImageWithFallback({
  src,
  fallbackSrc,
  alt,
  className,
  ...props
}: ImageWithFallbackProps) {
  const [imgSrc, setImgSrc] = useState<string | undefined>(src);
  const [hasError, setHasError] = useState(false);

  return (
    <img
      src={imgSrc ?? fallbackSrc ?? ""}
      alt={alt}
      className={className}
      onError={() => {
        if (!hasError && fallbackSrc) {
          setImgSrc(fallbackSrc);
          setHasError(true);
        } else {
          setImgSrc(undefined);
        }
      }}
      {...props}
    />
  );
}