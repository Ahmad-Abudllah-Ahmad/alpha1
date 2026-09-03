"use client";

import { AuthExperience } from "@/components/auth/AuthExperience";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthExperience />
      {children}
    </>
  );
}
