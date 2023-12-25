import { ElectronApi } from '../electron/preload/index';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronApi;
  }
}

export {};
