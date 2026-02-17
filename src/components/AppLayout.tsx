import { ReactNode, useState, useEffect } from "react";
import { Menu } from "lucide-react";
import AppSidebar from "./AppSidebar";
import { OfflineIndicator } from "./OfflineIndicator";

function useIsMobileLayout() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobileLayout();
  const [open, setOpen] = useState(false);

  // Close sidebar on route change for mobile
  useEffect(() => {
    if (!isMobile) setOpen(false);
  }, [isMobile]);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile: overlay */}
      {isMobile && open && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      {isMobile ? (
        <div
          className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <AppSidebar onNavigate={() => setOpen(false)} />
        </div>
      ) : (
        <AppSidebar />
      )}

      {/* Main */}
      <main className={`${isMobile ? "ml-0" : "ml-64"} min-h-screen`}>
        {/* Mobile header */}
        {isMobile && (
          <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-background border-b border-border">
            <button
              onClick={() => setOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
            <span className="text-sm font-semibold text-foreground">ProdControl</span>
          </header>
        )}
        <div className="p-4 md:p-6 lg:p-8">
          <OfflineIndicator />
          {children}
        </div>
      </main>
    </div>
  );
}
