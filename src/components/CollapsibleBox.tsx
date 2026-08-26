import React, { useState, useRef, useEffect } from "react";

export function CollapsibleBox({ children, maxHeight = 80 }: { children: React.ReactNode, maxHeight?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const checkOverflow = () => {
      setIsOverflowing(el.scrollHeight > maxHeight);
    };

    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    
    return () => observer.disconnect();
  }, [children, maxHeight]);

  return (
    <div className={`collapsible-box ${isOverflowing ? "is-overflowing" : ""} ${isExpanded ? "is-expanded" : ""}`}>
      <div
        className="collapsible-content"
        style={{ maxHeight: isExpanded ? "none" : `${maxHeight}px` }}
      >
        <div ref={innerRef} className="collapsible-inner">
          {children}
        </div>
      </div>
      
      {isOverflowing && (
        <div className="collapsible-btn-wrapper">
          <button
            className="collapsible-btn"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            title={isExpanded ? "Show Less" : "Show More"}
          >
            {isExpanded ? "▲" : "▼"}
          </button>
        </div>
      )}
    </div>
  );
}