"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { FieldErrors } from "@/lib/catalog-validation";

/**
 * Sends one change at a time, so a double-click can't send it twice. Each attempt starts by clearing
 * the last result, so an old error never sits beside a new success. Returns the response, or null if it failed.
 */
export function useCatalogRequest() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});

  const reset = useCallback(() => {
    setError("");
    setNotice("");
    setFields({});
  }, []);

  /** Shows problems found in the browser, using the same shape as the server's. */
  const showProblems = useCallback((problems: FieldErrors) => {
    setNotice("");
    setFields(problems);
    setError("Check the highlighted fields.");
  }, []);

  const send = useCallback(
    async <T = unknown>(url: string, method: "POST" | "PUT" | "DELETE", body: unknown, success: string): Promise<T | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(true);
      reset();
      try {
        const response = await fetch(url, {
          method,
          headers: { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setFields(result.fields ?? {});
          setError(result.error || "That didn't work. Try again.");
          return null;
        }
        setNotice(success);
        router.refresh();
        return result as T;
      } catch {
        setError("That didn't work. Check your connection and try again.");
        return null;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [reset, router],
  );

  return { busy, error, notice, fields, send, reset, showProblems };
}
