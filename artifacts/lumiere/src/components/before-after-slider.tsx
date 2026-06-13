import { useState, useRef, useCallback } from "react";
import { Maximize2 } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  caption?: string | null;
  className?: string;
  fill?: boolean;
  onExpand?: () => void;
}

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Trước",
  afterLabel = "Sau",
  caption,
  className = "",
  fill = false,
  onExpand,
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const lastTapY = useRef(0);

  const move = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const { left, width } = el.getBoundingClientRect();
    setPosition(Math.min(100, Math.max(0, ((clientX - left) / width) * 100)));
  }, []);

  return (
    <div className={`${fill ? "h-full" : "space-y-1.5"} ${className}`}>
      <div
        ref={containerRef}
        className="group relative w-full overflow-hidden rounded-lg bg-muted select-none cursor-col-resize"
        style={{ ...(fill ? { height: "100%" } : { aspectRatio: "1 / 1" }), touchAction: "none" }}
        onDoubleClick={(e) => { e.preventDefault(); onExpand?.(); }}
        onMouseDown={(e) => { dragging.current = true; move(e.clientX); e.preventDefault(); }}
        onMouseMove={(e) => { if (dragging.current) move(e.clientX); }}
        onMouseUp={() => { dragging.current = false; }}
        onMouseLeave={() => { dragging.current = false; }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          const now = Date.now();
          const dt = now - lastTapTime.current;
          const dx = Math.abs(touch.clientX - lastTapX.current);
          const dy = Math.abs(touch.clientY - lastTapY.current);
          if (dt < 300 && dx < 40 && dy < 40) {
            e.preventDefault();
            lastTapTime.current = 0;
            onExpand?.();
            return;
          }
          lastTapTime.current = now;
          lastTapX.current = touch.clientX;
          lastTapY.current = touch.clientY;
          dragging.current = true;
          move(touch.clientX);
        }}
        onTouchMove={(e) => { if (!dragging.current) return; e.preventDefault(); move(e.touches[0].clientX); }}
        onTouchEnd={() => { dragging.current = false; }}
      >
        <img
          src={afterSrc}
          alt={afterLabel}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
          loading="lazy"
        />

        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            src={beforeSrc}
            alt={beforeLabel}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            draggable={false}
            loading="lazy"
          />
        </div>

        <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded pointer-events-none z-10">
          {beforeLabel}
        </span>
        <span className="absolute top-2 right-2 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded pointer-events-none z-10">
          {afterLabel}
        </span>

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.6)] pointer-events-none z-10"
          style={{ left: `${position}%` }}
        />
        <div
          className="absolute top-1/2 z-20 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center pointer-events-none"
          style={{ left: `${position}%` }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-500">
            <path d="M5 4L2 8L5 12M11 4L14 8L11 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {onExpand && (
          <button
            className="absolute bottom-2 right-2 z-30 bg-black/50 hover:bg-black/80 text-white rounded-md p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onExpand(); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => { e.stopPropagation(); onExpand(); }}
            title="Xem toàn màn hình"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {caption && !fill && (
        <p className="text-xs text-muted-foreground text-center px-1 line-clamp-2">{caption}</p>
      )}
    </div>
  );
}
