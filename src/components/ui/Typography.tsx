import * as React from "react"
import { cn } from "@/lib/utils"

interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  variant?: "h1" | "h2" | "h3" | "h4" | "body" | "caption"
  color?: "default" | "muted" | "vibrant"
}

export function Typography({
  variant = "body",
  color = "default",
  className,
  children,
  ...props
}: TypographyProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Component = variant.startsWith("h") ? (variant as any) : variant === "caption" ? "span" : "p"

  const colorClasses = {
    default: "text-foreground",
    muted: "text-muted",
    vibrant: "text-gradient", // Using text-gradient from globals.css
  }

  const variantClasses = {
    h1: "text-4xl lg:text-5xl font-bold tracking-tight",
    h2: "text-3xl font-semibold tracking-tight",
    h3: "text-2xl font-semibold tracking-tight",
    h4: "text-xl font-medium tracking-tight",
    body: "text-base leading-relaxed",
    caption: "text-sm font-medium",
  }

  return (
    <Component
      className={cn(variantClasses[variant], colorClasses[color], className)}
      {...props}
    >
      {children}
    </Component>
  )
}
