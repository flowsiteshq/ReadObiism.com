import { useCallback, useEffect, useState } from "react";

import { chapters as bundledChapters, type BookChapter } from "@/lib/book-data";
import { ApiError, loadEdition } from "@/lib/entitlement";

/** Returns licensed section metadata; paragraph text is loaded by the reader. */
export function useEdition() {
  const [chapters, setChapters] = useState<BookChapter[]>(bundledChapters);
  const [licensed, setLicensed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void loadEdition()
      .then((result) => {
        if (!active) return;
        setChapters(result.chapters);
        setLicensed(result.licensed);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setLicensed(false);
        setError(cause instanceof ApiError ? cause.message : "Reconnect to verify your edition.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return { chapters, licensed, loading, error, reload };
}
