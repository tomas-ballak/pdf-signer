<script setup lang="ts">
import { ref, reactive, nextTick, computed, shallowRef, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as pdfjsLib from 'pdfjs-dist'

// --- PDF Worker Setup ---
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const { t, locale } = useI18n()

// ============================================
// --- 0. HELPER: SIMILARITY ALGORITHM      ---
// ============================================
const levenshteinDistance = (a: string, b: string): number => {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[a.length][b.length]
}

const getSimilarity = (str1: string, str2: string): number => {
  const longer = str1.length > str2.length ? str1 : str2
  if (longer.length === 0) return 1.0
  const distance = levenshteinDistance(str1, str2)
  return (longer.length - distance) / longer.length
}

// ============================================
// --- 1. THEME LOGIC (Auto / Light / Dark) ---
// ============================================
type ThemeMode = 'auto' | 'light' | 'dark'
const themeMode = ref<ThemeMode>('auto')
const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)')

const calculateIsDark = () => {
  if (themeMode.value === 'light') return false
  if (themeMode.value === 'dark') return true
  return systemDarkMode.matches // 'auto' falls back to system
}

const applyTheme = () => {
  const isVisualDark = calculateIsDark()

  if (isVisualDark) document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')

  // Notify Main Process for native window theme (optional)
  try {
    const electronMode = themeMode.value === 'auto' ? 'system' : themeMode.value
    // @ts-ignore
    window.electron.ipcRenderer.invoke('theme:toggle', electronMode).catch(() => {})
  } catch (e) {
    /* Ignore */
  }
}

const cycleTheme = () => {
  if (themeMode.value === 'auto') themeMode.value = 'light'
  else if (themeMode.value === 'light') themeMode.value = 'dark'
  else themeMode.value = 'auto'

  localStorage.setItem('theme-mode', themeMode.value)
  applyTheme()
}

const themeIcon = computed(() => {
  if (themeMode.value === 'auto') return '🖥️'
  if (themeMode.value === 'light') return '☀️'
  return '🌙'
})

const handleSystemThemeChange = () => {
  if (themeMode.value === 'auto') applyTheme()
}

// ============================================
// --- 2. APP STATE ---
// ============================================
const pdfPath = ref('')
const certPath = ref('')
const password = ref('')
const rememberPassword = ref(false)

const signatureText = ref('Signature')

const fontSize = ref(14)
const isSigning = ref(false)
const scale = ref(1.0)

const currentDate = ref(new Date())
const selectedLocale = ref(navigator.language)
const includeDate = ref(true)

const dateLocaleOptions = computed(() => [
  { label: t('dateFormats.default'), value: navigator.language },
  { label: t('dateFormats.czech') + ' (DD.MM.YYYY)', value: 'cs-CZ' },
  { label: t('dateFormats.us') + ' (MM/DD/YYYY)', value: 'en-US' },
  { label: t('dateFormats.uk') + ' (DD/MM/YYYY)', value: 'en-GB' },
  { label: t('dateFormats.iso') + ' (YYYY-MM-DD)', value: 'sv-SE' },
  { label: t('dateFormats.german') + ' (DD.MM.YYYY)', value: 'de-DE' }
])

const appLangOptions = [
  { label: 'English', value: 'en' },
  { label: 'Čeština', value: 'cs' },
  { label: 'Deutsch', value: 'de' }
]

const totalPages = ref(0)
const activePageIndex = ref(0)
const pdfDoc = shallowRef<any>(null)

const canvasRefs = ref<Map<number, HTMLCanvasElement>>(new Map())
const pageContainerRefs = ref<Map<number, HTMLDivElement>>(new Map())

const box = reactive({ x: 50, y: 50, w: 200, h: 70 })
const drag = reactive({ active: false, startX: 0, startY: 0, initialBoxX: 0, initialBoxY: 0 })
const resize = reactive({ active: false, startX: 0, startY: 0, startW: 0, startH: 0 })

let timer: any

onMounted(async () => {
  timer = setInterval(() => (currentDate.value = new Date()), 1000)

  window.addEventListener('dragover', (e) => e.preventDefault())
  window.addEventListener('drop', (e) => e.preventDefault())

  // --- THEME INIT ---
  systemDarkMode.addEventListener('change', handleSystemThemeChange)
  const storedMode = localStorage.getItem('theme-mode') as ThemeMode | null
  const oldKey = localStorage.getItem('user-theme')

  if (storedMode && ['auto', 'light', 'dark'].includes(storedMode)) {
    themeMode.value = storedMode
  } else if (oldKey) {
    themeMode.value = oldKey === 'dark' ? 'dark' : 'light'
  }
  applyTheme()
  // ------------------

  // Load Previous Signature Text
  const cachedSig = localStorage.getItem('lastSignatureText')
  if (cachedSig) {
    signatureText.value = cachedSig
  }

  // Load Secure Credentials
  try {
    // @ts-ignore
    const savedIdentity = await window.electron.ipcRenderer.invoke('auth:load-credentials')
    if (savedIdentity) {
      if (savedIdentity.certPath) certPath.value = savedIdentity.certPath
      if (savedIdentity.password) {
        password.value = savedIdentity.password
        rememberPassword.value = true
      }
      console.log('Identity loaded securely.')
    }
  } catch (e) {
    console.error('Failed to load secure credentials', e)
  }
})

onUnmounted(() => {
  clearInterval(timer)
  systemDarkMode.removeEventListener('change', handleSystemThemeChange)
})

const pdfName = computed(() => (pdfPath.value ? pdfPath.value.split(/[/\\]/).pop() : null))
const certName = computed(() => (certPath.value ? certPath.value.split(/[/\\]/).pop() : null))
const zoomPercent = computed(() => Math.round(scale.value * 100) + '%')

const formattedDateString = computed(() => {
  return new Intl.DateTimeFormat(selectedLocale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(currentDate.value)
})

// --- File Selection ---
const selectFile = async (type: 'pdf' | 'cert') => {
  try {
    // @ts-ignore
    const path = await window.electron.ipcRenderer.invoke('dialog:openFile', { fileType: type })
    if (!path) return

    if (type === 'pdf') {
      pdfPath.value = path
      // Reset logic handled in loadPdf
      await loadPdf(path)
    } else {
      certPath.value = path
      localStorage.setItem('lastCertPath', path)
    }
  } catch (e) {
    console.error(e)
  }
}

// --- Load PDF & SMART POSITIONING ---
const loadPdf = async (path: string) => {
  // 1. Reset & Load
  activePageIndex.value = 0
  totalPages.value = 0
  canvasRefs.value.clear()
  pdfDoc.value = null

  // @ts-ignore
  const pdfBuffer = await window.electron.ipcRenderer.invoke('read-file-buffer', path)
  const loadingTask = pdfjsLib.getDocument(pdfBuffer)
  pdfDoc.value = await loadingTask.promise
  totalPages.value = pdfDoc.value.numPages

  await nextTick()
  renderAllPages()

  // 2. CHECK HISTORY FOR SIMILAR FILENAME
  const currentFileName = path.split(/[/\\]/).pop() || ''
  if (!currentFileName) return

  try {
    const historyStr = localStorage.getItem('doc-history')
    if (historyStr) {
      const history = JSON.parse(historyStr)
      let bestMatch = null
      let highestScore = 0

      // Find best match in history
      for (const entry of history) {
        if (!entry.name) continue
        const score = getSimilarity(entry.name, currentFileName)
        if (score > highestScore) {
          highestScore = score
          bestMatch = entry
        }
      }

      // Threshold: 0.8 means 80% similarity
      if (bestMatch && highestScore > 0.8) {
        console.log(`Found similar doc (${(highestScore * 100).toFixed(0)}%):`, bestMatch.name)

        // Restore Position
        box.x = bestMatch.box.x
        box.y = bestMatch.box.y
        box.w = bestMatch.box.w
        box.h = bestMatch.box.h

        // Restore Page & Scroll
        if (bestMatch.page < totalPages.value) {
          activePageIndex.value = bestMatch.page
          await nextTick()
          const container = pageContainerRefs.value.get(activePageIndex.value)
          if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
      } else {
        // No match? Reset to default position
        box.x = 50
        box.y = 50
        box.w = 200
        box.h = 70
        activePageIndex.value = 0
      }
    }
  } catch (e) {
    console.error('Error matching history', e)
  }
}

const renderAllPages = async () => {
  if (!pdfDoc.value) return
  for (let i = 1; i <= totalPages.value; i++) {
    await renderPage(i)
  }
}

const renderPage = async (pageNum: number) => {
  const pageIndex = pageNum - 1
  const canvas = canvasRefs.value.get(pageIndex)
  if (!canvas || !pdfDoc.value) return
  const page = await pdfDoc.value.getPage(pageNum)
  const viewport = page.getViewport({ scale: scale.value })
  const context = canvas.getContext('2d')
  if (context) {
    canvas.height = viewport.height
    canvas.width = viewport.width
    await page.render({ canvasContext: context, viewport: viewport }).promise
  }
}

// --- Controls ---
const changeZoom = (delta: number) => {
  const newScale = Math.round((scale.value + delta) * 100) / 100
  if (newScale >= 0.5 && newScale <= 3.0) {
    scale.value = newScale
    renderAllPages()
  }
}

const changeFontSize = (delta: number) => {
  const newSize = fontSize.value + delta
  if (newSize >= 8 && newSize <= 72) fontSize.value = newSize
}

// --- Math & Interactions ---
const clampBox = (
  xPoints: number,
  yPoints: number,
  wPoints: number,
  hPoints: number,
  pageIndex: number
) => {
  const canvas = canvasRefs.value.get(pageIndex)
  if (!canvas) return
  const limitW = canvas.width / scale.value
  const limitH = canvas.height / scale.value
  let newX = xPoints
  let newY = yPoints
  if (newX < 0) newX = 0
  if (newY < 0) newY = 0
  if (newX + wPoints > limitW) newX = limitW - wPoints
  if (newY + hPoints > limitH) newY = limitH - hPoints
  box.x = newX
  box.y = newY
}

const onPageClick = (index: number, e: MouseEvent) => {
  activePageIndex.value = index
  const container = pageContainerRefs.value.get(index)
  if (!container) return
  const rect = container.getBoundingClientRect()
  const clickX_px = e.clientX - rect.left
  const clickY_px = e.clientY - rect.top

  const offsetX = 20 * scale.value
  const offsetY = 25 * scale.value
  const targetX_px = clickX_px - offsetX - (box.w * scale.value) / 2
  const targetY_px = clickY_px - offsetY - (box.h * scale.value) / 2

  clampBox(targetX_px / scale.value, targetY_px / scale.value, box.w, box.h, index)
}

const startDrag = (e: MouseEvent) => {
  e.stopPropagation()
  drag.active = true
  drag.startX = e.clientX
  drag.startY = e.clientY
  drag.initialBoxX = box.x
  drag.initialBoxY = box.y
}

const startResize = (e: MouseEvent) => {
  e.stopPropagation()
  resize.active = true
  resize.startX = e.clientX
  resize.startY = e.clientY
  resize.startW = box.w
  resize.startH = box.h
}

const onMouseMove = (e: MouseEvent) => {
  if (!drag.active && !resize.active) return
  const idx = activePageIndex.value

  if (resize.active) {
    const deltaX_px = e.clientX - resize.startX
    const deltaY_px = e.clientY - resize.startY
    let newW = resize.startW + deltaX_px / scale.value
    let newH = resize.startH + deltaY_px / scale.value
    if (newW < 50) newW = 50
    if (newH < 30) newH = 30
    box.w = newW
    box.h = newH
    return
  }

  if (drag.active) {
    const deltaX_px = e.clientX - drag.startX - 20 * scale.value
    const deltaY_px = e.clientY - drag.startY - 25 * scale.value
    const newX = drag.initialBoxX + deltaX_px / scale.value
    const newY = drag.initialBoxY + deltaY_px / scale.value
    clampBox(newX, newY, box.w, box.h, idx)
  }
}

const stopInteraction = () => {
  drag.active = false
  resize.active = false
}
const setCanvasRef = (el: any, index: number) => {
  if (el) canvasRefs.value.set(index, el)
}
const setContainerRef = (el: any, index: number) => {
  if (el) pageContainerRefs.value.set(index, el)
}

// --- Sign ---
const signDocument = async () => {
  if (!pdfPath.value || !certPath.value) return
  isSigning.value = true

  localStorage.setItem('lastSignatureText', signatureText.value)

  if (rememberPassword.value) {
    // @ts-ignore
    await window.electron.ipcRenderer.invoke('auth:save-credentials', {
      certPath: certPath.value,
      password: password.value
    })
  } else {
    // @ts-ignore
    await window.electron.ipcRenderer.invoke('auth:clear-credentials')
  }

  try {
    // @ts-ignore
    const result = await window.electron.ipcRenderer.invoke('sign-pdf', {
      filePath: pdfPath.value,
      certPath: certPath.value,
      password: password.value,
      pageIndex: activePageIndex.value,
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
      text: signatureText.value,
      fontSize: fontSize.value,
      dateText: includeDate.value ? formattedDateString.value : ''
    })

    if (result.success) {
      alert(`${t('alerts.signedSaved')}\n${result.path}`)

      // --- SAVE TO HISTORY (FOR SMART POSITIONING) ---
      const fileName = pdfPath.value.split(/[/\\]/).pop()
      if (fileName) {
        const historyStr = localStorage.getItem('doc-history') || '[]'
        let history = []
        try {
          history = JSON.parse(historyStr)
        } catch (e) {}

        // Remove existing entry for exact filename to avoid duplicates
        history = history.filter((h: any) => h.name !== fileName)

        // Add new entry
        history.push({
          name: fileName,
          box: { ...box }, // Copy object
          page: activePageIndex.value
        })

        // Keep only last 50 entries
        if (history.length > 50) history.shift()

        localStorage.setItem('doc-history', JSON.stringify(history))
      }
      // ----------------------------------------------
    } else {
      alert(`${t('alerts.error')} ${result.error}`)
    }
  } catch (err) {
    console.error(err)
    alert(t('alerts.failed'))
  } finally {
    isSigning.value = false
  }
}
</script>

<template>
  <div class="app-layout" @mouseup="stopInteraction" @mousemove="onMouseMove">
    <aside class="sidebar">
      <div class="header-section">
        <div class="header-top">
          <h2>{{ t('title') }}</h2>
          <button class="theme-btn" @click="cycleTheme" :title="themeMode">
            {{ themeIcon }}
          </button>
        </div>

        <div class="control" style="margin-bottom: 10px">
          <select v-model="locale" class="lang-select">
            <option v-for="lang in appLangOptions" :key="lang.value" :value="lang.value">
              {{ lang.label }}
            </option>
          </select>
        </div>

        <div class="tool-row">
          <label>{{ t('labels.zoom') }}</label>
          <div class="tool-controls">
            <button class="tool-btn" @click="changeZoom(-0.25)">➖</button>
            <span class="tool-display">{{ zoomPercent }}</span>
            <button class="tool-btn" @click="changeZoom(0.25)">➕</button>
          </div>
        </div>

        <div class="tool-row">
          <label>{{ t('labels.textSize') }}</label>
          <div class="tool-controls">
            <button class="tool-btn" @click="changeFontSize(-2)">A-</button>
            <span class="tool-display">{{ fontSize }}pt</span>
            <button class="tool-btn" @click="changeFontSize(2)">A+</button>
          </div>
        </div>

        <div v-if="pdfName" class="file-display">
          <div class="file-icon">📄</div>
          <div class="file-details">
            <div class="file-title" :title="pdfPath">{{ pdfName }}</div>
            <div class="file-meta">{{ totalPages }} {{ t('labels.page') }}s</div>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="controls-section">
        <div class="control">
          <button @click="selectFile('pdf')">📂 {{ t('buttons.openPdf') }}</button>
        </div>

        <div class="control">
          <button @click="selectFile('cert')">🔐 {{ t('buttons.selectCert') }}</button>
          <div v-if="certName" class="small-text">✓ {{ certName }}</div>
        </div>
        <div class="control">
          <input type="password" v-model="password" :placeholder="t('labels.certPassword')" />
          <label class="checkbox-label" style="margin-top: 5px">
            <input type="checkbox" v-model="rememberPassword" />
            <span style="font-size: 0.8rem; color: var(--text-secondary)">{{
              t('labels.rememberIdentity')
            }}</span>
          </label>
        </div>

        <div class="control">
          <input type="text" v-model="signatureText" :placeholder="t('labels.signatureName')" />
        </div>

        <div class="control">
          <label class="checkbox-label">
            <input type="checkbox" v-model="includeDate" />
            {{ t('labels.includeDate') }}
          </label>
        </div>

        <div class="control" v-if="includeDate">
          <label class="control-label">{{ t('labels.dateFormat') }}:</label>
          <select v-model="selectedLocale">
            <option v-for="opt in dateLocaleOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <div class="small-text">{{ formattedDateString }}</div>
        </div>
      </div>

      <div class="spacer"></div>
      <button class="primary" @click="signDocument" :disabled="!pdfPath || !certPath || isSigning">
        {{ isSigning ? t('buttons.signing') : t('buttons.signPage') + ' ' + (activePageIndex + 1) }}
      </button>
      <div class="small-text" style="margin-bottom: 20px">{{ t('labels.hashAlgo') }}: sha256</div>
    </aside>

    <main class="pdf-viewer">
      <div v-if="!pdfPath" class="empty-msg">Select a PDF to view</div>

      <div
        v-for="(n, index) in totalPages"
        :key="index"
        class="page-wrapper"
        :class="{ active: activePageIndex === index }"
        @click="(e) => onPageClick(index, e)"
        :ref="(el) => setContainerRef(el, index)"
      >
        <div class="page-number">{{ t('labels.page') }} {{ index + 1 }}</div>
        <canvas :ref="(el) => setCanvasRef(el, index)"></canvas>

        <div
          v-if="activePageIndex === index"
          class="signature-box"
          :style="{
            left: box.x * scale + 'px',
            top: box.y * scale + 'px',
            width: box.w * scale + 'px',
            height: box.h * scale + 'px'
          }"
          @mousedown.stop="startDrag"
        >
          <div class="sign-content">
            <input
              v-model="signatureText"
              class="box-input"
              :placeholder="t('labels.signHere')"
              :style="{ fontSize: fontSize * scale + 'px' }"
              @mousedown.stop
            />
            <div
              v-if="includeDate"
              class="box-date"
              :style="{ fontSize: fontSize * 0.75 * scale + 'px' }"
            >
              {{ formattedDateString }}
            </div>
          </div>
          <div class="resize-handle" @mousedown.stop="startResize"></div>
        </div>

        <div v-if="activePageIndex !== index" class="inactive-overlay"></div>
      </div>
    </main>
  </div>
</template>

<style>
:root {
  /* LIGHT THEME */
  --bg-app: #525659;
  --bg-sidebar: #f9f9f9;
  --bg-surface: #ffffff;
  --bg-tool: #e0e0e0;

  --text-primary: #333333;
  --text-secondary: #555555;
  --text-muted: #666666;

  --border-color: #dddddd;
  --border-input: #cccccc;

  --btn-hover: #f0f0f0;

  --accent-primary: #2196f3;
  --accent-hover: #1976d2;

  --shadow-sidebar: rgba(0, 0, 0, 0.1);
  --shadow-page: rgba(0, 0, 0, 0.5);
}

[data-theme='dark'] {
  /* DARK THEME */
  --bg-app: #202020;
  --bg-sidebar: #2d2d2d;
  --bg-surface: #383838;
  --bg-tool: #404040;

  --text-primary: #e0e0e0;
  --text-secondary: #aaaaaa;
  --text-muted: #888888;

  --border-color: #444444;
  --border-input: #555555;

  --btn-hover: #454545;

  --accent-primary: #64b5f6;
  --accent-hover: #42a5f5;

  --shadow-sidebar: rgba(0, 0, 0, 0.5);
  --shadow-page: rgba(0, 0, 0, 0.8);
}

body,
html {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: var(--bg-app);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}
</style>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: var(--bg-app);
  overflow: hidden !important;
  color: var(--text-primary);
}

.sidebar {
  width: 300px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  z-index: 20;
  box-shadow: 2px 0 10px var(--shadow-sidebar);
  overflow-y: auto;
  transition: background-color 0.2s;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.header-section h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.5rem;
}

.theme-btn {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  width: auto;
}
.theme-btn:hover {
  background: var(--btn-hover);
}

.tool-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
}
.tool-row label {
  font-size: 0.85rem;
  font-weight: bold;
  color: var(--text-secondary);
}
.tool-controls {
  display: flex;
  align-items: center;
  background: var(--bg-tool);
  padding: 3px;
  border-radius: 6px;
  gap: 5px;
}
.tool-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-input);
  width: 30px;
  height: 25px;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-primary);
}
.tool-btn:hover {
  background: var(--btn-hover);
}
.tool-display {
  font-weight: bold;
  width: 45px;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-primary);
}

.file-display {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.file-icon {
  font-size: 1.5rem;
}
.file-details {
  overflow: hidden;
}
.file-title {
  font-weight: bold;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}
.file-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.divider {
  border: 0;
  border-top: 1px solid var(--border-color);
  width: 100%;
  margin: 5px 0;
}
.controls-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.control button {
  width: 100%;
  text-align: left;
}
.control-label {
  font-size: 0.8rem;
  font-weight: bold;
  color: var(--text-secondary);
  display: block;
  margin-bottom: 3px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  color: var(--text-primary);
  cursor: pointer;
  gap: 8px;
}
.small-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

input[type='text'],
input[type='password'],
select {
  padding: 8px;
  border: 1px solid var(--border-input);
  border-radius: 4px;
  font-size: 0.9rem;
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-surface);
  color: var(--text-primary);
}
input:focus,
select:focus {
  border-color: var(--accent-primary);
  outline: none;
}
input[type='checkbox'] {
  width: auto;
}

.lang-select {
  margin-bottom: 5px;
  background-color: var(--bg-surface);
  color: var(--text-primary);
}

button {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid var(--border-input);
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: background 0.2s;
}
button:hover {
  background: var(--btn-hover);
}

.spacer {
  margin-top: auto;
}
button.primary {
  background: var(--accent-primary);
  color: white;
  border: none;
  font-weight: bold;
  padding: 12px;
  font-size: 1rem;
  box-shadow: 0 2px 5px rgba(33, 150, 243, 0.3);
  width: 100%;
}
button.primary:hover {
  background: var(--accent-hover);
}
button.primary:disabled {
  background: var(--border-input);
  color: #666;
  box-shadow: none;
  cursor: not-allowed;
}

.pdf-viewer {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  gap: 30px;
  background: var(--bg-app);
}
.empty-msg {
  color: var(--text-muted);
  margin-top: 100px;
  font-size: 1.2em;
}
.page-wrapper {
  position: relative;
  background: white;
  box-shadow: 0 2px 10px var(--shadow-page);
  display: inline-block;
  cursor: crosshair;
  transition: transform 0.2s;
}
.page-wrapper.active {
  outline: 4px solid var(--accent-primary);
  transform: scale(1.005);
  z-index: 5;
}
.inactive-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.1);
  pointer-events: none;
}
.page-wrapper:hover .inactive-overlay {
  background: transparent;
}
.page-number {
  position: absolute;
  top: -25px;
  left: 0;
  color: var(--text-primary);
  font-weight: bold;
  font-size: 0.9rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
canvas {
  display: block;
}

.signature-box {
  position: absolute;
  border: 2px dashed #ff0000;
  background: rgba(255, 255, 255, 0.75);
  cursor: move;
  user-select: none;
  z-index: 10;
  padding: 0;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sign-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.box-input {
  width: 100%;
  border: none;
  background: transparent;
  text-align: center;
  font-family: Helvetica, sans-serif;
  color: black;
  outline: none;
  resize: none;
  cursor: text;
  padding: 0;
  margin: 0;
  line-height: 1.2;
}
.box-date {
  width: 100%;
  text-align: center;
  font-family: Helvetica, sans-serif;
  color: #333;
  line-height: 1.2;
  margin-top: 2px;
}
.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  background-color: #ff0000;
  cursor: nwse-resize;
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
}
</style>
