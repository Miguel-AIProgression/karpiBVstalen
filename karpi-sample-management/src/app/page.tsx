"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

export default function Home() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    switch (role) {
      case "production":
        router.push("/production");
        break;
      case "admin":
        router.push("/management");
        break;
      default:
        router.push("/sales");
    }
  }, [user, role, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-500">Laden...</p>
    </div>
  );
}
