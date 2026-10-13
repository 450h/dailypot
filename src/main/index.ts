/**
 * Electron main process: hardened window, single instance, app:// protocol, network block,
 * store + PIN + IPC wiring, midnight rollover and auto-lock (SECURITY §11, ADR-0002, ADR-0005).
 */
import { join, resolve } from 'node:path'
import { BrowserWindow, app, dialog, powerMonitor, session, shell } from 'electron'
import { todayLocal } from '@shared/dates'
import { CHANNELS, REPO_URL, type AppEvent } from '@shared/ipc'
import { registerIpc } from './ipc'
import { initLog, logError } from './log'
import { PinLock } from './pin'
import { APP_ORIGIN, handleAppScheme, registerAppScheme } from './protocol'
import { Service, type Platform } from './service'
import { isTrustedUrl } from './sender'
import { Store } from './store'

const isDev = !app.isPackaged
const devUrl = isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined

// Dev/test data never touches the real profile; the override is ignored in packaged builds.
if (isDev) {
  const dir = resolve(process.env['DAILYPOT_DATA_DIR'] ?? '.dev-data')
  app.setPath('userData', dir)
}
app.setName('DailyPot')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  registerAppScheme()
  void main()
}

let mainWindow: BrowserWindow | null = null

function send(event: AppEvent): void {
  mainWindow?.webContents.send(CHANNELS.event, event)
}

async function main(): Promise<void> {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (ev, url) => {
      if (!isTrustedUrl(url, devUrl)) ev.preventDefault()
    })
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-attach-webview', (ev) => ev.preventDefault())
  })

  await app.whenReady()
  const dataDir = app.getPath('userData')
  initLog(dataDir)

  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  // No network, ever (ADR-0005). In dev only the local Vite server is reachable.
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, cb) => cb({ cancel: !(devUrl && new URL(details.url).origin === new URL(devUrl).origin) })
  )

  handleAppScheme(join(__dirname, '../renderer'))

  const store = new Store(dataDir)
  const pin = new PinLock(dataDir)
  await store.load()
  await pin.load()

  const platform: Platform = {
    version: app.getVersion(),
    async saveDialog(defaultName, filters) {
      const r = await dialog.showSaveDialog(mainWindow!, { defaultPath: defaultName, filters })
      return r.canceled || !r.filePath ? null : r.filePath
    },
    async openDialog(filters) {
      const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters })
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    async confirm(message, detail) {
      const r = await dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        buttons: ['Cancel', 'Continue'],
        defaultId: 0,
        cancelId: 0,
        message,
        detail
      })
      return r.response === 1
    },
    async openFolder(path) {
      await shell.openPath(path)
    },
    async openRepo() {
      await shell.openExternal(REPO_URL)
    }
  }

  const service = new Service(store, pin, platform)
  try {
    await service.rollCycles()
  } catch (e) {
    logError('rollCycles', e)
  }
  registerIpc(service, devUrl)

  createWindow()

  // Midnight rollover + auto-lock, checked every 30 s.
  let lastDay = todayLocal()
  setInterval(() => {
    const today = todayLocal()
    if (today !== lastDay) {
      lastDay = today
      service
        .rollCycles()
        .catch((e) => logError('midnight', e))
        .finally(() => send({ type: 'stateChanged' }))
    }
    const minutes = store.state.settings.autoLockMinutes
    if (pin.pinSet && !pin.locked && minutes > 0 && powerMonitor.getSystemIdleTime() >= minutes * 60) {
      pin.lock()
      send({ type: 'locked' })
    }
  }, 30_000)
  powerMonitor.on('lock-screen', () => {
    if (pin.pinSet && !pin.locked) {
      pin.lock()
      send({ type: 'locked' })
    }
  })

  app.on('window-all-closed', () => app.quit())
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: 'DailyPot',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      spellcheck: false,
      devTools: isDev
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  if (devUrl) void mainWindow.loadURL(devUrl)
  else void mainWindow.loadURL(`${APP_ORIGIN}/index.html`)
}
