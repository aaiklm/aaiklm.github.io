import * as React from "react";

export function useZoom() {
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
      setZoom(Math.min(scaleX, scaleY));
    };

    updateZoom();
    window.addEventListener("resize", updateZoom);
    return () => window.removeEventListener("resize", updateZoom);
  }, []);

  return zoom;
}
