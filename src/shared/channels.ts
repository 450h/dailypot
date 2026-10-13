/** IPC channel names. Dependency-free so the sandboxed preload can bundle it. */
export const CHANNELS = {
  getState: 'state:get',
  upsert: 'entity:upsert',
  remove: 'entity:delete',
  updateSettings: 'settings:update',
  completeSetup: 'setup:complete',
  setAllowance: 'cycle:setAllowance',
  startNextEarly: 'cycle:startNextEarly',
  pinStatus: 'pin:status',
  pinVerify: 'pin:verify',
  pinSet: 'pin:set',
  pinClear: 'pin:clear',
  pinLock: 'pin:lock',
  backupList: 'backup:list',
  backupRestore: 'backup:restore',
  backupOpenFolder: 'backup:openFolder',
  dataExport: 'data:export',
  dataImport: 'data:import',
  dataExportCsv: 'data:exportCsv',
  recoveryStartFresh: 'recovery:startFresh',
  openRepo: 'app:openRepo',
  event: 'app:event'
} as const
