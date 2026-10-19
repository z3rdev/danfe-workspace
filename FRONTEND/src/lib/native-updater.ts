import { isTauri } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';

export type NativeUpdateCheck = {
  supported: boolean;
  update: Update | null;
};

export async function checkNativeUpdate(): Promise<NativeUpdateCheck> {
  if (!isTauri()) {
    return { supported: false, update: null };
  }

  return {
    supported: true,
    update: await check({ timeout: 10000 }),
  };
}

export async function installNativeUpdate(update: Update, onProgress?: (downloaded: number, total?: number) => void) {
  let downloaded = 0;

  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      onProgress?.(0, event.data.contentLength);
      return;
    }

    if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress?.(downloaded);
    }
  });
}
