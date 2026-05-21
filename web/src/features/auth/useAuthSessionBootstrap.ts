import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import { setApiAccessToken } from "../../api";
import { getSessionSafely, supabase } from "../../supabase";
import { clearSupabaseAuthHash, getSupabaseAuthHashError, isSupabaseRecoveryHash } from "./auth-hash";

type UseAuthSessionBootstrapArgs = {
  authSessionRef: MutableRefObject<Session | null>;
  setAuthReady: Dispatch<SetStateAction<boolean>>;
  setAuthSession: Dispatch<SetStateAction<Session | null>>;
  setRecoveryMode: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setAuthNotice: Dispatch<SetStateAction<string>>;
  onSignedOut: () => void;
};

export function useAuthSessionBootstrap({
  authSessionRef,
  setAuthReady,
  setAuthSession,
  setRecoveryMode,
  setError,
  setAuthNotice,
  onSignedOut
}: UseAuthSessionBootstrapArgs) {
  useEffect(() => {
    let mounted = true;

    const applyAuthHashState = (hash: string) => {
      const recoveryHash = isSupabaseRecoveryHash(hash);
      const recoveryError = getSupabaseAuthHashError(hash);

      if (!mounted) return;

      if (recoveryHash) {
        setRecoveryMode(true);
        setError("");
        setAuthNotice("");
        return;
      }

      if (recoveryError) {
        setRecoveryMode(false);
        setError(recoveryError);
        clearSupabaseAuthHash();
      }
    };

    if (typeof window !== "undefined") {
      applyAuthHashState(window.location.hash);
    }

    void getSessionSafely()
      .then(({ session, invalidRefreshToken }) => {
        if (!mounted) return;
        authSessionRef.current = session;
        setApiAccessToken(session?.access_token ?? null);
        setAuthSession(session);
        if (invalidRefreshToken) {
          setAuthNotice("로그인 확인 정보가 오래되어 다시 로그인해 주세요.");
        }
        setAuthReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        authSessionRef.current = null;
        setAuthSession(null);
        setAuthReady(true);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      authSessionRef.current = nextSession;
      setApiAccessToken(nextSession?.access_token ?? null);
      setAuthSession(nextSession);

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setError("");
        setAuthNotice("");
      } else if (event === "SIGNED_OUT") {
        setRecoveryMode(false);
      } else if (nextSession) {
        setError("");
      }

      if (!nextSession) {
        onSignedOut();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
}
