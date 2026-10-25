/** Wires the Service to ipcMain with sender validation and typed error results (SECURITY §1, §11). */
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { CHANNELS, type IpcResult } from '@shared/ipc'
import { CommandError } from './commands'
import { PinError } from './pin'
import { ServiceError, type Service } from './service'
import { StoreError } from './store'
import { logError } from './log'
import { isTrustedFrame } from './sender'

export function isTrustedSender(event: IpcMainInvokeEvent, devUrl: string | undefined): boolean {
  return isTrustedFrame(event.senderFrame, devUrl)
}

const KNOWN = [CommandError, ServiceError, StoreError, PinError]

export function registerIpc(service: Service, devUrl: string | undefined): void {
  const handle = <A extends unknown[], T>(channel: string, fn: (...args: A) => T | Promise<T>): void => {
    ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<T>> => {
      if (!isTrustedSender(event, devUrl)) return { ok: false, code: 'FORBIDDEN', message: 'Untrusted sender' }
      try {
        return { ok: true, data: await fn(...(args as A)) }
      } catch (e) {
        if (KNOWN.some((K) => e instanceof K)) {
          const err = e as Error & { code: string }
          return { ok: false, code: err.code, message: err.message }
        }
        logError(channel, e)
        return { ok: false, code: 'INTERNAL', message: 'Something went wrong. Details are in the log file.' }
      }
    })
  }

  handle(CHANNELS.getState, () => service.getState())
  handle(CHANNELS.upsert, (c: unknown, item: unknown) => service.upsert(c, item))
  handle(CHANNELS.remove, (c: unknown, id: unknown) => service.remove(c, id))
  handle(CHANNELS.updateSettings, (p: unknown) => service.updateSettings(p))
  handle(CHANNELS.completeSetup, (p: unknown) => service.completeSetup(p))
  handle(CHANNELS.setAllowance, (a: unknown) => service.setAllowance(a))
  handle(CHANNELS.startNextEarly, (d: unknown) => service.startNextEarly(d))
  handle(CHANNELS.extendBack, (p: unknown) => service.extendBack(p))
  handle(CHANNELS.pinStatus, () => service.pinStatus())
  handle(CHANNELS.pinVerify, (p: unknown) => service.pinVerify(p))
  handle(CHANNELS.pinSet, (cur: unknown, next: unknown) => service.pinSet(cur, next))
  handle(CHANNELS.pinClear, (cur: unknown) => service.pinClear(cur))
  handle(CHANNELS.pinLock, () => service.pinLock())
  handle(CHANNELS.backupList, () => service.backupList())
  handle(CHANNELS.backupRestore, (n: unknown) => service.backupRestore(n))
  handle(CHANNELS.backupOpenFolder, () => service.backupOpenFolder())
  handle(CHANNELS.dataExport, () => service.dataExport())
  handle(CHANNELS.dataImport, () => service.dataImport())
  handle(CHANNELS.dataExportCsv, (ids: unknown) => service.dataExportCsv(ids))
  handle(CHANNELS.recoveryStartFresh, () => service.recoveryStartFresh())
  handle(CHANNELS.openRepo, () => service.openRepo())
}
