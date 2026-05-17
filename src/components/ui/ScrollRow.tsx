"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ScrollRowProps {
  children: React.ReactNode;
  className?: string;
  scrollAmount?: number;
}

export function ScrollRow({ children, className = "", scrollAmount = 400 }: ScrollRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    updateScrollButtons();
    const observer = new ResizeObserver(updateScrollButtons);
    observer.observe(el);
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateScrollButtons);
    };
  }, [updateScrollButtons]);

  const scroll = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const amount = direction === "left" ? -scrollAmount : scrollAmount;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className={`relative group/scrollrow ${className}`}>
      <style>{`
        .scrollrow-container::-webkit-scrollbar { display: none; }
      `}</style>
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center">
          <div className="absolute inset-0 w-12 bg-gradient-to-r from-background/90 to-transparent pointer-events-none" />
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm shadow-lg opacity-0 group-hover/scrollrow:opacity-100 transition-opacity ml-1"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </div>
      )}
      <div
        ref={containerRef}
        className="scrollrow-container flex gap-4 overflow-x-auto scroll-smooth py-2 px-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", overflowY: "visible" }}
        onScroll={updateScrollButtons}
      >
        {children}
      </div>
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center">
          <div className="absolute inset-0 w-12 bg-gradient-to-l from-background/90 to-transparent pointer-events-none" />
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm shadow-lg opacity-0 group-hover/scrollrow:opacity-100 transition-opacity mr-1"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
