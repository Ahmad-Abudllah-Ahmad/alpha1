import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-red-500/10 text-red-600 dark:text-red-400",
        outline: "text-foreground border-border",
        success: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-normal",
        warning: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400 font-normal",
        gold: "border-transparent bg-gold/15 text-gold-foreground dark:text-gold font-normal",
        preview: "border-dashed border-muted-foreground/40 bg-muted/50 text-muted-foreground font-normal",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
