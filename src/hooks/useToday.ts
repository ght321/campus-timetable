import { useEffect, useState } from "react";
import { localDate } from "../utils/date";
export function useToday() {
  const [today, setToday] = useState(() => localDate(new Date()));
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(localDate(new Date())),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return today;
}
