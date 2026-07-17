import { useEffect } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import toast from 'react-hot-toast';

export function AutoUpdater() {
  useEffect(() => {
    async function checkForUpdates() {
      try {
        const update = await check();
        
        if (update) {          
          toast.loading(`Updating to v${update.version}...`, { duration: 5000 });
          
          await update.downloadAndInstall((event) => {
            switch (event.event) {
              case 'Started':
                console.log(`Update started. Total size: ${event.data.contentLength} bytes`);
                break;
              case 'Progress':
                break;
              case 'Finished':
                console.log('Download finished');
                break;
            }
          });

          toast.success("Update installed! Restarting...");
          await relaunch();
        }
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
    }

    setTimeout(checkForUpdates, 3000);
  }, []);

  return null;
}