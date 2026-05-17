import * as React from "react"
import { cn } from "@/lib/utils"

export interface GlassWindowProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: "light" | "medium" | "heavy"
}

const GlassWindow = React.forwardRef<HTMLDivElement, GlassWindowProps>(
  ({ className, intensity = "medium", children, ...props }, ref) => {
    const intensityClasses = {
      light: "bg-white/5 backdrop-blur-sm",
      medium: "bg-white/10 backdrop-blur-md",
      heavy: "bg-white/20 backdrop-blur-xl",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl border border-white/10 shadow-2xl overflow-hidden",
          intensityClasses[intensity],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
GlassWindow.displayName = "GlassWindow"

export { GlassWindow }
