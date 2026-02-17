import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import { OfflineIndicator } from "./OfflineIndicator";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 p-6 lg:p-8">
        <OfflineIndicator />
        {children}
      </main>
    </div>
  );
}
