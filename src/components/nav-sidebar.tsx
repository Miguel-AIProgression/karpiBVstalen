"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  LayoutDashboard,
  Package,
  Clock,
  Scissors,
  Sparkles,
  Boxes,
  MapPin,
  Factory,
  ShoppingBag,
  Shield,
  FolderOpen,
  ClipboardList,
  Users,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  key: string;
  label: string;
  icon: React.ReactNode;
  basePath: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    key: "production",
    label: "Productie",
    icon: <Factory size={16} />,
    basePath: "/production",
    items: [
      { label: "Overzicht", href: "/production", icon: <LayoutDashboard size={18} /> },
      { label: "Snijden", href: "/production/cut", icon: <Scissors size={18} /> },
      { label: "Afwerken", href: "/production/finishing", icon: <Sparkles size={18} /> },
      { label: "Bundelen", href: "/production/bundles", icon: <Boxes size={18} /> },
      { label: "Locaties", href: "/production/locations", icon: <MapPin size={18} /> },
    ],
  },
  {
    key: "sales",
    label: "Verkoop",
    icon: <ShoppingBag size={16} />,
    basePath: "/sales",
    items: [
      { label: "Overzicht", href: "/sales", icon: <LayoutDashboard size={18} /> },
      { label: "Klanten", href: "/sales/clients", icon: <Users size={18} /> },
      { label: "Projecten", href: "/sales/projects", icon: <FolderOpen size={18} /> },
      { label: "Verzoeken", href: "/sales/requests", icon: <ClipboardList size={18} /> },
      { label: "Beschikbaarheid", href: "/sales/availability", icon: <Package size={18} /> },
      { label: "Levertijden", href: "/sales/delivery", icon: <Clock size={18} /> },
    ],
  },
  {
    key: "admin",
    label: "Management",
    icon: <Shield size={16} />,
    basePath: "/management",
    items: [
      { label: "Overzicht", href: "/management", icon: <LayoutDashboard size={18} /> },
      { label: "Samenstellen", href: "/management/compose", icon: <Boxes size={18} /> },
    ],
  },
];

const roleToSection: Record<string, string> = {
  production: "production",
  sales: "sales",
  admin: "admin",
};

const roleLabels: Record<string, string> = {
  production: "Productie",
  sales: "Verkoop",
  admin: "Management",
};

function detectActiveSection(pathname: string): string {
  if (pathname.startsWith("/production")) return "production";
  if (pathname.startsWith("/sales")) return "sales";
  if (pathname.startsWith("/management")) return "admin";
  return "sales";
}

export function NavSidebar() {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const isAdmin = role === "admin";
  const activeSection = detectActiveSection(pathname);

  // Admin sees section switcher; others see only their own section
  const currentSection = sections.find((s) => s.key === activeSection)
    ?? sections.find((s) => s.key === roleToSection[role])
    ?? sections[1];
  const navItems = currentSection.items;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="px-6 pt-8 pb-6">
        <Image
          src="/karpi-logo.svg"
          alt="Karpi Group"
          width={130}
          height={50}
          className="text-white invert"
          priority
        />
      </div>

      {/* Admin: section switcher / Others: role badge */}
      <div className="mx-3 mb-4">
        {isAdmin ? (
          <div className="flex gap-1 rounded-lg bg-sidebar-accent/50 p-1">
            {sections.map((section) => {
              const isCurrent = section.key === activeSection;
              return (
                <Link
                  key={section.key}
                  href={section.basePath}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
                    isCurrent
                      ? "bg-sidebar-accent text-white shadow-sm"
                      : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
                  }`}
                >
                  <span className={isCurrent ? "text-[oklch(0.60_0.14_40)]" : ""}>{section.icon}</span>
                  {section.label}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mx-3">
            <div className="inline-flex items-center rounded-full bg-sidebar-accent px-3 py-1.5 text-xs font-medium text-sidebar-accent-foreground/80">
              <div className="mr-2 h-1.5 w-1.5 rounded-full bg-[oklch(0.60_0.14_40)]" />
              {roleLabels[role] ?? role}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
                isActive
                  ? "bg-sidebar-accent font-medium text-white shadow-sm"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <span className={`transition-colors duration-200 ${
                isActive ? "text-[oklch(0.60_0.14_40)]" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60"
              }`}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border px-6 py-4">
        <div className="mb-3 truncate text-xs text-sidebar-foreground/40">
          {user?.email}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="w-full border-sidebar-border bg-transparent text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut size={14} className="mr-2" />
          Uitloggen
        </Button>
      </div>
    </aside>
  );
}
