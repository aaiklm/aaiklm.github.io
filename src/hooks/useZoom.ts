import * as React from "react";

export type ZoomMode = "fit" | "width-only";

export function useZoom(mode: ZoomMode = "fit") {
  const [zoom, setZoom] = React.useState(1);

  React.useEffect(() => {
    const updateZoom = () => {
      const styles = getComputedStyle(document.documentElement);
      const designWidth = parseFloat(styles.getPropertyValue("--design-width"));
      const designHeight = parseFloat(
        styles.getPropertyValue("--design-height")
      );
      const scaleX = window.innerWidth / designWidth;
      const scaleY = window.innerHeight / designHeight;

      if (mode === "width-only") {
        // Only scale by width - allows vertical scrolling
        setZoom(scaleX);
      } else {
        // Fit mode - scale to fit both dimensions (no scroll)
        setZoom(Math.min(scaleX, scaleY));
      }
    };

    updateZoom();
    window.addEventListener("resize", updateZoom);
    return () => window.removeEventListener("resize", updateZoom);
  }, [mode]);

  return zoom;
}
