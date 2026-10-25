/**
 * Preload: exposes only named functions on window.dailypot (SECURITY §1, §11).
 * No ipcRenderer, Node or Electron objects reach the renderer.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '../shared/channels'
import type { AppEvent, DailyPotApi } from '../shared/ipc'

const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api: DailyPotApi = {
  getState: () => call(CHANNELS.getState),
  upsert: (collection, item) => call(CHANNELS.upsert, collection, item),
  remove: (collection, id) => call(CHANNELS.remove, collection, id),
  updateSettings: (patch) => call(CHANNELS.updateSettings, patch),
  completeSetup: (payload) => call(CHANNELS.completeSetup, payload),
  setAllowance: (amount) => call(CHANNELS.setAllowance, amount),
  startNextEarly: (startDate) => call(CHANNELS.startNextEarly, startDate),
  extendBack: (payload) => call(CHANNELS.extendBack, payload),
  pinStatus: () => call(CHANNELS.pinStatus),
  pinVerify: (pin) => call(CHANNELS.pinVerify, pin),
  pinSet: (current, next) => call(CHANNELS.pinSet, current, next),
  pinClear: (current) => call(CHANNELS.pinClear, current),
  pinLock: () => call(CHANNELS.pinLock),
  backupList: () => call(CHANNELS.backupList),
  backupRestore: (name) => call(CHANNELS.backupRestore, name),
  backupOpenFolder: () => call(CHANNELS.backupOpenFolder),
  dataExport: () => call(CHANNELS.dataExport),
  dataImport: () => call(CHANNELS.dataImport),
  dataExportCsv: (ids) => call(CHANNELS.dataExportCsv, ids),
  recoveryStartFresh: () => call(CHANNELS.recoveryStartFresh),
  openRepo: () => call(CHANNELS.openRepo),
  onEvent: (cb) => {
    const listener = (_e: unknown, payload: AppEvent): void => cb(payload)
    ipcRenderer.on(CHANNELS.event, listener)
    return () => {
      ipcRenderer.removeListener(CHANNELS.event, listener)
    }
  }
}

contextBridge.exposeInMainWorld('dailypot', api)
