import { createApp } from 'vue'
import App from './App.vue'
import { createI18n } from 'vue-i18n'
import { messages } from './locales'

// 1. Detect System Language (e.g. 'cs-CZ' -> 'cs', 'de-DE' -> 'de')
const systemLocale = navigator.language.split('-')[0]
// Fallback to english if system language is not supported
const defaultLocale = ['en', 'cs', 'de'].includes(systemLocale) ? systemLocale : 'en'

// 2. Setup i18n
const i18n = createI18n({
  legacy: false, // Use Composition API mode
  locale: defaultLocale,
  fallbackLocale: 'en',
  messages
})

const app = createApp(App)
app.use(i18n) // <--- Register Plugin
app.mount('#app')
