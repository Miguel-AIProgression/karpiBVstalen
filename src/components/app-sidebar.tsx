"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import {
  ClipboardList,
  Layers,
  Package,
  Factory,
  Users,
  Euro,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/stalen", label: "Stalen & Voorraad", icon: Layers },
  { href: "/collecties", label: "Collecties & Bundels", icon: Package },
  { href: "/productie", label: "Productie", icon: Factory },
  { href: "/klanten", label: "Klanten", icon: Users },
  { href: "/prijslijst", label: "Prijslijst", icon: Euro },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const email = user?.email ?? "";
  const initials = email.substring(0, 2).toUpperCase();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-border px-5 py-4">
        <span className="text-lg font-bold tracking-wide">KARPI</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-3 px-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {initials}
          </div>
          <span className="flex-1 truncate text-sm">{email}</span>
          <button
            onClick={handleLogout}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground"
            title="Uitloggen"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
