import { useState, useEffect } from "react";

export function ProgressiveImage({ className, style, src, onLoad, onError, ...props }: any) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div className={`progressive-wrapper ${loaded ? "loaded" : ""} ${className || ""}`} style={style}>
      <img
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