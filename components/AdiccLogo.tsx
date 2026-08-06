import Image from "next/image";
import { cn } from "@/lib/utils";

interface AdiccLogoProps {
  className?: string;
  variant?: "header" | "banner";
}

export function AdiccLogo({ className, variant = "header" }: AdiccLogoProps) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg px-1 py-0.5 transition-opacity hover:opacity-90",
        className
      )}
    >
      <Image
        src="/images/logos/adicc-logo.png"
        alt="ADICC — Since 1989"
        width={variant === "banner" ? 120 : 130}
        height={variant === "banner" ? 40 : 32}
        className={cn(
          "w-auto object-contain",
          variant === "banner" ? "h-10 sm:h-11" : "h-8 sm:h-9",
          "dark:brightness-0 dark:invert"
        )}
        priority
      />
    </div>
  );
}
