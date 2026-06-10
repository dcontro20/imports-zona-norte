import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Test config: jsdom para tests de componentes React (smoke tests).
  // Los tests de libs puras siguen siendo rápidos porque no usan render.
  test: {
    environment: 'jsdom',
    globals: false,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore'],
          react: ['react', 'react-dom'],
          // Chunks pesados que solo se necesitan en SupplierMonitor (lazy)
          xlsx: ['xlsx'],
          pdfjs: ['pdfjs-dist'],
          pdf: ['jspdf'],
        }
      }
    }
  }
})
