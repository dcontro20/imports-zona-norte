// Configuración de Web Push (FCM).
//
// VAPID_PUBLIC_KEY es la clave PÚBLICA de Web Push del proyecto Firebase.
// Es seguro comitearla (es pública por diseño), pero hay que generarla
// a mano una sola vez:
//
//   Firebase Console → ⚙️ Project settings → Cloud Messaging
//   → Web configuration → Web Push certificates → Generate key pair
//   → copiar el valor acá abajo.
//
// Mientras esté vacía, la app cae automáticamente al modo de
// notificaciones LOCALES (funcionan solo si abriste la app en el día).
// Guía completa: docs/PUSH_SETUP.md
export const VAPID_PUBLIC_KEY = "";
