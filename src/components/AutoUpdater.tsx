import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import toast from "react-hot-toast";

export function AutoUpdater() {
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          const wantsUpdate = await ask(
            `Version ${update.version} is available.\n\nRelease notes:\n${update.body}`,
            {
              title: "Update Available",
              kind: "info",
              okLabel: "Update Now",
              cancelLabel: "Later",
            }
          );

          if (wantsUpdate) {
            toast.loading("Downloading update...", { id: "update-toast" });
            await update.downloadAndInstall();
            toast.success("Update installed! Restarting...", { id: "update-toast" });
            await relaunch();
          }
        }
      } catch (error) {
        console.error(error);
      }
    };

    checkForUpdates();
  }, []);

  return null;
}