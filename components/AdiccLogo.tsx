import Image from "next/image";
import { cn } from "@/lib/utils";

interface AdiccLogoProps {
  className?: string;
  variant?: "header" | "banner";
}

export function AdiccLogo({ className, variant = "header" }: AdiccLogoProps) {
  const header = variant === "header";

  return (
    <div className={cn("flex items-center", className)}>
      <Image
        src="/images/logos/adicc-logo.png"
        alt="ADICC — Since 1989"
        width={header ? 88 : 120}
        height={header ? 24 : 40}
        className={cn(
          "w-auto object-contain object-left",
          header ? "h-6 brightness-0 invert" : "h-10 sm:h-11 dark:brightness-0 dark:invert"
        )}
        priority
      />
    </div>
  );
}
