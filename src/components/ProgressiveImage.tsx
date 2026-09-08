import { useState, useEffect, useRef } from "react";

export function ProgressiveImage({ className, style, src, onLoad, onError, ...props }: any) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoaded(false);
    if (imgRef.current && imgRef.current.complete) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <div className={`progressive-wrapper ${loaded ? "loaded" : ""} ${className || ""}`} style={style}>
      <img
        ref={imgRef}
        src={src}
        className={`progressive-img ${loaded ? "loaded" : ""}`}
        onLoad={(e) => {
          setLoaded(true);
          if (onLoad) onLoad(e);
        }}
        onError={(e) => {
          setLoaded(true);
          if (onError) onError(e);
        }}
        {...props}
      />
    </div>
  );
}