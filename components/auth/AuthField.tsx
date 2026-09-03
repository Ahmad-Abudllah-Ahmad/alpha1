"use client";

import { useId, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AuthField({
  label,
  className,
  id,
  type = "text",
  ...props
}: ComponentProps<typeof Input> & {
  label: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);
  const inputType = isPassword ? (revealed ? "text" : "password") : type;

  return (
    <label
      className={cn("auth-float", isPassword && "auth-float--secret", className)}
      htmlFor={fieldId}
    >
      <Input
        id={fieldId}
        type={inputType}
        className="auth-float-input peer"
        {...props}
        placeholder=" "
      />
      <span className="auth-float-label">{label}</span>
      <span className="auth-float-bar" aria-hidden="true" />
      {isPassword ? (
        <button
          type="button"
          className={cn("auth-float-reveal", revealed && "is-open")}
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          title={revealed ? "Hide password" : "Show password"}
          onClick={(event) => {
            event.preventDefault();
            setRevealed((open) => !open);
          }}
        >
          <span className="auth-float-reveal-mark" aria-hidden="true">
            {revealed ? "Aa" : "···"}
          </span>
        </button>
      ) : null}
    </label>
  );
}
