import { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2 } from "lucide-react";

interface ChartZoomDialogProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function ChartZoomDialog({ title, subtitle, open, onOpenChange, children }: ChartZoomDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg font-bold text-foreground">{title}</DialogTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </DialogHeader>
        <div className="flex-1 min-h-0 mt-4">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ZoomButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
      onClick={onClick}
      title="Ampliar gráfico"
    >
      <Maximize2 className="w-4 h-4" />
    </Button>
  );
}
