// src/renderer/src/locales.ts

export const messages = {
  en: {
    title: 'PDF Signer',
    labels: {
      zoom: 'Zoom',
      textSize: 'Text Size',
      certPassword: 'Cert Password',
      signatureName: 'Signature Name',
      includeDate: 'Include Date & Time',
      dateFormat: 'Date Format',
      hashAlgo: 'Hash Algorithm',
      rememberIdentity: 'Remember Identity',
      dropPdf: 'Drop PDF here',
      or: 'or',
      browse: 'Browse Files',
      page: 'Page',
      signHere: 'Sign Here',
      appLanguage: 'App Language' // New label
    },
    buttons: {
      openPdf: 'Open PDF...',
      selectCert: 'Select P12...',
      signPage: 'Sign Page',
      signing: 'Signing...'
    },
    alerts: {
      signedSaved: 'Signed! Saved to:',
      error: 'Error:',
      dropValid: 'Please drop a valid PDF file.',
      pathError: 'Could not read file path. Please try the Browse button.',
      failed: 'Failed to execute signing process.'
    },
    dateFormats: {
      default: 'System Default',
      czech: 'Czech',
      us: 'US',
      uk: 'UK/EU',
      iso: 'ISO',
      german: 'German'
    }
  },
  cs: {
    title: 'Podepisovač PDF',
    labels: {
      zoom: 'Přiblížení',
      textSize: 'Velikost textu',
      certPassword: 'Heslo certifikátu',
      signatureName: 'Jméno podpisu',
      includeDate: 'Vložit datum a čas',
      dateFormat: 'Formát data',
      hashAlgo: 'Algoritmus hašování',
      rememberIdentity: 'Zapamatovat identitu',
      dropPdf: 'Přetáhněte PDF sem',
      or: 'nebo',
      browse: 'Vybrat soubory',
      page: 'Strana',
      signHere: 'Podepsat zde',
      appLanguage: 'Jazyk aplikace'
    },
    buttons: {
      openPdf: 'Otevřít PDF...',
      selectCert: 'Vybrat P12...',
      signPage: 'Podepsat stranu',
      signing: 'Podepisuji...'
    },
    alerts: {
      signedSaved: 'Podepsáno! Uloženo do:',
      error: 'Chyba:',
      dropValid: 'Vložte prosím platný soubor PDF.',
      pathError: 'Nelze načíst cestu k souboru. Zkuste tlačítko Vybrat soubory.',
      failed: 'Proces podepisování selhal.'
    },
    dateFormats: {
      default: 'Výchozí systémové',
      czech: 'Český',
      us: 'US',
      uk: 'UK/EU',
      iso: 'ISO',
      german: 'Německý'
    }
  },
  de: {
    title: 'PDF-Signierer',
    labels: {
      zoom: 'Zoom',
      textSize: 'Textgröße',
      certPassword: 'Zertifikatspasswort',
      signatureName: 'Signaturname',
      includeDate: 'Datum & Zeit einfügen',
      dateFormat: 'Datumsformat',
      hashAlgo: 'Hash-Algorithmus',
      rememberIdentity: 'Identität merken',
      dropPdf: 'PDF hier ablegen',
      or: 'oder',
      browse: 'Dateien durchsuchen',
      page: 'Seite',
      signHere: 'Hier unterschreiben',
      appLanguage: 'Sprache'
    },
    buttons: {
      openPdf: 'PDF öffnen...',
      selectCert: 'P12 auswählen...',
      signPage: 'Seite signieren',
      signing: 'Signieren...'
    },
    alerts: {
      signedSaved: 'Signiert! Gespeichert unter:',
      error: 'Fehler:',
      dropValid: 'Bitte eine gültige PDF-Datei ablegen.',
      pathError: 'Dateipfad konnte nicht gelesen werden. Bitte "Dateien durchsuchen" nutzen.',
      failed: 'Signiervorgang fehlgeschlagen.'
    },
    dateFormats: {
      default: 'Systemstandard',
      czech: 'Tschechisch',
      us: 'US',
      uk: 'UK/EU',
      iso: 'ISO',
      german: 'Deutsch'
    }
  }
}
