"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClipboardList,
  Layers,
  Factory,
  Users,
  Euro,
  LogOut,
  KeyRound,
  Package,
  Scissors,
  Tag,
  ListTodo,
} from "lucide-react";

const navItems = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/stalen", label: "Stalen", icon: Layers },
  { href: "/collecties", label: "Collecties & Bundels", icon: Package },
  { href: "/afwerkingen", label: "Afwerkingen", icon: Scissors },
  { href: "/merken", label: "Merken", icon: Tag },
  { href: "/productielijst", label: "Productielijst", icon: ListTodo },
  { href: "/productie", label: "Productie", icon: Factory },
  { href: "/klanten", label: "Klanten", icon: Users },
  { href: "/prijslijst", label: "Prijslijsten", icon: Euro },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const supabase = createClient();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword.length < 6) {
      setPwError("Wachtwoord moet minimaal 6 tekens zijn");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Wachtwoorden komen niet overeen");
      return;
    }

    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);

    if (error) {
      setPwError(error.message);
    } else {
      setPwSuccess("Wachtwoord gewijzigd!");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setShowPasswordModal(false), 1500);
    }
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setNewPassword("");
    setConfirmPassword("");
    setPwError("");
    setPwSuccess("");
  };

  const email = user?.email ?? "";
  const initials = email.substring(0, 2).toUpperCase();

  return (
    <>
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
        <div className="border-t border-border px-3 py-3 space-y-2">
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              {initials}
            </div>
            <span className="flex-1 truncate text-sm">{email}</span>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="text-sidebar-foreground/50 hover:text-sidebar-foreground"
              title="Wachtwoord wijzigen"
            >
              <KeyRound className="h-4 w-4" />
            </button>
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

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold">Wachtwoord wijzigen</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nieuw wachtwoord</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Bevestig wachtwoord</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {pwError && <p className="text-sm text-red-600">{pwError}</p>}
              {pwSuccess && <p className="text-sm text-green-600">{pwSuccess}</p>}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={closePasswordModal}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={pwLoading}>
                  {pwLoading ? "Bezig..." : "Opslaan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
