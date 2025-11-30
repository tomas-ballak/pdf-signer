# Electron PDF Signer

A modern, cross-platform desktop application for applying **Digital Signatures** to PDF documents with visual placement.

Unlike standard signing tools that only add a visual stamp, this application cryptographically signs the document using your P12/PFX certificate while allowing you to position the visual representation exactly where you need it.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-33.0-blueviolet)
![Vue](https://img.shields.io/badge/Vue-3.0-green)

## Key Features

- **True Digital Signing:** Uses X.509 certificates (`.p12` or `.pfx`) to cryptographically sign documents, ensuring integrity and authenticity.
- **Visual Placement:** Interactively move and resize your signature box to position it exactly where you need it on the PDF page.
- **Secure Storage:** Utilizes Electron's `safeStorage` API to encrypt and store your certificate passwords in the OS native keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service).
- **Theme Aware:** Fully supports Light, Dark, and Auto (System Sync) color themes.
- **Multi-language:** Built-in localization for English, Czech (Čeština), and German (Deutsch).
- **Customization:** Adjustable font sizes and localized date formats (EU, US, ISO, etc.).

## Tech Stack

- **Core:** [Electron](https://www.electronjs.org/) & [Electron Toolkit](https://electron-toolkit.org/)
- **Frontend:** [Vue 3](https://vuejs.org/) + TypeScript
- **PDF Rendering:** [PDF.js](https://mozilla.github.io/pdf.js/)
- **PDF Manipulation:** [pdf-lib](https://pdf-lib.js.org/) & [@signpdf](https://github.com/vbuch/node-signpdf)

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or pnpm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/my-pdf-signer.git
   cd my-pdf-signer
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run development mode:

   ```bash
   npm run dev
   ```

4. Build for production:

   ```bash
   npm run build
   ```

## How to Use

1. **Open PDF:** Click the "Open PDF" button to select a file from your computer.
2. **Select Certificate:** Load your `.p12` or `.pfx` digital certificate.
3. **Authenticate:** Enter your certificate password. You can choose to "Remember Identity" to securely store it for future use.
4. **Position:** Move the red signature box to the desired location on the page.
5. **Sign:** Click the "Sign Page" button. The signed PDF will be saved as `filename_signed.pdf`.

## Security Note

This application processes files locally on your machine. Your private keys and certificates are never uploaded to any cloud server. Password storage is handled via the operating system's native secure storage mechanisms.

## License

Distributed under the MIT License. See `LICENSE` for more information.
