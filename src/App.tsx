import styles from "./App.module.css";
import { useZoom } from "./hooks/useZoom";

function App() {
  const zoom = useZoom();

  return (
    <div className={styles.appRoot} style={{ zoom }}>
      Hello World2
    </div>
  );
}

export default App;
