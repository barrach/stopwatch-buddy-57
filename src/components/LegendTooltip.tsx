import React, { useState, useRef } from "react";

interface LegendTooltipProps {
  name: string;
  description?: string | null;
  children: React.ReactNode;
}

export function LegendTooltip({ name, description, children }: LegendTooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = (e: React.MouseEvent) => {
    timerRef.current = setTimeout(() => {
      setPos({ x: e.clientX, y: e.clientY });
      setShow(true);
    }, 200);
  };

  const handleMove = (e: React.MouseEvent) => {
    if (show) setPos({ x: e.clientX, y: e.clientY });
  };

  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="cursor-default"
    >
      {children}
      {show && (
        <div
          style={{
            position: "fixed",
            left: pos.x + 12,
            top: pos.y - 10,
            background: "#1F2937",
            color: "#FFFFFF",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            maxWidth: 250,
            zIndex: 9999,
            pointerEvents: "none",
            boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: description ? 4 : 0 }}>{name}</div>
          {description ? (
            <div style={{ color: "#D1D5DB" }}>{description}</div>
          ) : (
            <div style={{ color: "#9CA3AF", fontStyle: "italic" }}>Sem descrição cadastrada</div>
          )}
        </div>
      )}
    </div>
  );
}
