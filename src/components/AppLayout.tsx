import { ReactNode, useState } from "react";
import { Menu, X } from "lucide-react";
import AppSidebar from "./AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { OfflineIndicator } from "./OfflineIndicator";

export default function AppLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          ${isMobile ? "fixed z-30 transition-transform duration-200" : ""}
          ${isMobile && !sidebarOpen ? "-translate-x-full" : "translate-x-0"}
        `}
      >
        <AppSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <main className={`${isMobile ? "" : "ml-64"} p-4 lg:p-8`}>
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="mb-4 p-2 rounded-lg bg-card border border-border text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <OfflineIndicator />
        {children}
      </main>
    </div>
  );
}
