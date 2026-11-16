import { useEffect, useState } from "react";

/** Browser connection state; starts true so server and first client render match. */
export function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const sync = () => setOn(navigator.onLine);
    sync(); window.addEventListener("online", sync); window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  return on;
}
