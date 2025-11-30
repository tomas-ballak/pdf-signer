import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { SignPdf } from '@signpdf/signpdf'
import { P12Signer } from '@signpdf/signer-p12'
import { plainAddPlaceholder } from '@signpdf/placeholder-plain'
import { nativeTheme } from 'electron' // Add to imports

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // --- MAXIMUM SECURITY SETTINGS ---
      webSecurity: false, // Keep false only if you need to load local file:// resources in dev
      nodeIntegration: false, // LOCKED DOWN: Renderer cannot use Node.js primitives
      contextIsolation: true // LOCKED DOWN: Renderer is isolated from Main process memory
      // --------------------------------
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// --- ENCRYPTION HELPERS (Envelope Encryption) ---
const getKeyPath = () => join(app.getPath('userData'), 'master.key.enc')
const getDataPath = () => join(app.getPath('userData'), 'user-data.bin')

function getOrGenerateMasterKey(): Buffer | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const keyPath = getKeyPath()

  if (fs.existsSync(keyPath)) {
    try {
      const encryptedKey = fs.readFileSync(keyPath)
      const base64Key = safeStorage.decryptString(encryptedKey)
      const keyBuffer = Buffer.from(base64Key, 'base64')
      if (keyBuffer.length !== 32) throw new Error('Invalid key len')
      return keyBuffer
    } catch (e) {
      console.error('Master Key corrupted. Regenerating...', e)
    }
  }

  const newKey = crypto.randomBytes(32)
  try {
    const keyString = newKey.toString('base64')
    const encryptedKey = safeStorage.encryptString(keyString)
    fs.writeFileSync(keyPath, encryptedKey)
    return newKey
  } catch (e) {
    console.error('Failed to create master key', e)
    return null
  }
}

function encryptData(masterKey: Buffer, jsonData: object): Buffer {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
  const jsonStr = JSON.stringify(jsonData)
  let encrypted = cipher.update(jsonStr, 'utf8')
  encrypted = Buffer.concat([encrypted, cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted])
}

function decryptData(masterKey: Buffer, fileBuffer: Buffer): any {
  const iv = fileBuffer.subarray(0, 16)
  const authTag = fileBuffer.subarray(16, 32)
  const encrypted = fileBuffer.subarray(32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // 1. FILE DIALOG
  ipcMain.handle('dialog:openFile', async (_, args) => {
    const { fileType } = args
    const filters =
      fileType === 'pdf'
        ? [{ name: 'PDF Files', extensions: ['pdf'] }]
        : [{ name: 'Certificates', extensions: ['p12', 'pfx'] }]

    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 2. READ BUFFER
  ipcMain.handle('read-file-buffer', async (_, filePath) => {
    try {
      return fs.readFileSync(filePath)
    } catch (e) {
      console.error('Error reading file:', e)
      throw e
    }
  })

  // 3. SIGN PDF
  ipcMain.handle('sign-pdf', async (_, args) => {
    const {
      filePath,
      certPath,
      password,
      pageIndex,
      x,
      y,
      width,
      height,
      text,
      fontSize,
      dateText
    } = args

    try {
      const pdfBuffer = fs.readFileSync(filePath)
      const pdfDoc = await PDFDocument.load(pdfBuffer)
      const pages = pdfDoc.getPages()
      const page = pages[pageIndex]

      const { height: pdfPageHeight } = page.getSize()
      const pdfY = pdfPageHeight - y - height

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const signatureName = text || 'Digitally Signed'
      const signatureDate = dateText || ''
      const nameSize = fontSize || 14
      const centerY = pdfY + height / 2

      if (signatureDate) {
        const dateSize = nameSize * 0.75
        const lineHeight = nameSize * 1.2
        const totalBlockHeight = nameSize + dateSize + 2
        const startY = centerY + totalBlockHeight / 4

        page.drawText(signatureName, {
          x: x + 2,
          y: startY,
          size: nameSize,
          font: font,
          color: rgb(0, 0, 0),
          maxWidth: width - 4
        })
        page.drawText(signatureDate, {
          x: x + 2,
          y: startY - lineHeight,
          size: dateSize,
          font: font,
          color: rgb(0, 0, 0),
          maxWidth: width - 4
        })
      } else {
        page.drawText(signatureName, {
          x: x + 2,
          y: centerY - nameSize / 3,
          size: nameSize,
          font: font,
          color: rgb(0, 0, 0),
          maxWidth: width - 4
        })
      }

      const modifiedPdfBytes = await pdfDoc.save({ useObjectStreams: false })
      const modifiedPdfBuffer = Buffer.from(modifiedPdfBytes)

      const pdfWithPlaceholder = plainAddPlaceholder({
        pdfBuffer: modifiedPdfBuffer,
        reason: 'Digitally Signed',
        location: 'Electron App',
        signatureLength: 16192,
        name: 'Signature',
        contactInfo: 'contactInfo'
      })

      if (!fs.existsSync(certPath)) throw new Error('Certificate file not found')
      const p12Buffer = fs.readFileSync(certPath)

      const signer = new P12Signer(p12Buffer, {
        passphrase: password || ''
        // FIXME: NOT WORKING YET
        // digestAlgorithm: sigAlgo || 'sha512'
      })

      const signerPDFObj = new SignPdf()
      const signedPdf = await signerPDFObj.sign(pdfWithPlaceholder, signer)

      const outputPath = filePath.replace(/(\.pdf)$/i, '_signed.pdf')
      fs.writeFileSync(outputPath, signedPdf)

      return { success: true, path: outputPath }
    } catch (error: any) {
      console.error('Signing failed:', error)
      return { success: false, error: error.message || 'Unknown error' }
    }
  })

  // 4. SECURE STORAGE (ENVELOPE)
  ipcMain.handle('auth:save-credentials', async (_, data) => {
    const masterKey = getOrGenerateMasterKey()
    if (!masterKey) return false
    try {
      const encryptedBuffer = encryptData(masterKey, data)
      fs.writeFileSync(getDataPath(), encryptedBuffer)
      return true
    } catch (e) {
      console.error('Encryption failed', e)
      return false
    }
  })

  ipcMain.handle('auth:load-credentials', async () => {
    const dataPath = getDataPath()
    if (!fs.existsSync(dataPath)) return null
    const masterKey = getOrGenerateMasterKey()
    if (!masterKey) return null
    try {
      const fileBuffer = fs.readFileSync(dataPath)
      return decryptData(masterKey, fileBuffer)
    } catch (e) {
      console.error('Decryption failed', e)
      return null
    }
  })

  ipcMain.handle('auth:clear-credentials', async () => {
    const dataPath = getDataPath()
    if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath)
    return true
  })

  ipcMain.handle('theme:toggle', (_, themeSource: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = themeSource
    return nativeTheme.shouldUseDarkColors
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
