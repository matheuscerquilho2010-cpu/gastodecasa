import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "danger";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A05BE] disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-[#8A05BE] text-white hover:opacity-80 shadow-sm": variant === "default",
            "border border-white/10 bg-white/5 hover:bg-white/10 text-white": variant === "outline",
            "hover:bg-white/5 hover:text-white text-white/70": variant === "ghost",
            "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20": variant === "danger",
            "h-10 px-4 py-2": size === "default",
            "h-9 rounded-lg px-3": size === "sm",
            "h-12 rounded-xl px-8 text-base": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
