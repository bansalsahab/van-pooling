import { useCallback, useEffect, useState } from "react";

import { api } from "../lib/api";
import type { CopilotBrief, CopilotReply } from "../lib/types";

export function useCopilot(token: string | null) {
  const [brief, setBrief] = useState<CopilotBrief | null>(null);
  const [reply, setReply] = useState<CopilotReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBrief = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await api.getCopilotBrief(token);
      setBrief(next);
    } catch (copilotError) {
      setError(
        copilotError instanceof Error
          ? copilotError.message
          : "Could not load the copilot brief.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  const askCopilot = useCallback(
    async (question: string) => {
      if (!token) {
        return;
      }
      setAsking(true);
      setError(null);
      try {
        const answer = await api.askCopilot(token, question);
        setReply(answer);
      } catch (copilotError) {
        setError(
          copilotError instanceof Error
            ? copilotError.message
            : "Could not ask the copilot.",
        );
      } finally {
        setAsking(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    void refreshBrief();
  }, [refreshBrief, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void refreshBrief();
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [refreshBrief, token]);

  return {
    brief,
    reply,
    loading,
    asking,
    error,
    refreshBrief,
    askCopilot,
  };
}
