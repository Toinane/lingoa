import { useState, useEffect, useCallback, useRef } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Silently checks for a new Lingoa release on startup and exposes a one-call
 * `installAndRelaunch()` that downloads, applies the update, and restarts.
 *
 * The check is deferred 4 seconds so it never competes with the initial render
 * and auth flow. All errors (offline, 404, bad manifest) are swallowed — the
 * feature is purely additive and must never break the app.
 */
export function useUpdateCheck() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const didCheck = useRef(false);

  useEffect(() => {
    if (didCheck.current) return;
    didCheck.current = true;

    const timer = setTimeout(() => {
      check()
        .then((u) => {
          if (u !== null) setUpdate(u);
        })
        .catch((e: unknown) => {
          console.debug("[lingoa] Update check failed:", e);
        });
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  const installAndRelaunch = useCallback(async () => {
    if (!update || isInstalling) return;
    setIsInstalling(true);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e: unknown) {
      console.error("[lingoa] Update install failed:", e);
      setIsInstalling(false);
    }
  }, [update, isInstalling]);

  return {
    updateAvailable: update !== null,
    updateVersion: update?.version ?? null,
    isInstalling,
    installAndRelaunch,
  };
}
