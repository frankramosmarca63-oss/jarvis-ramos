/* Configuración de la nube (Firebase).
   Mientras "firebase" sea null, la app funciona en modo local (solo este equipo).
   Pega aquí los datos de tu proyecto siguiendo GUIA_INSTALACION.md, paso 2.
   Estos valores NO son secretos: identifican tu proyecto; la seguridad la dan las reglas de Firestore. */
self.JARVIS_CONFIG = {
  firebase: null,
  /* Ejemplo:
  firebase: {
    apiKey: "AIza...",
    authDomain: "jarvis-ramos.firebaseapp.com",
    projectId: "jarvis-ramos",
    storageBucket: "jarvis-ramos.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abc123"
  },
  */
  vapidKey: "",                        // Firebase > Configuración > Cloud Messaging > Certificados push web
  ownerEmail: "",                      // opcional: tu Gmail para bloquear otras cuentas (no se publica si lo dejas vacío)
  firebaseVersion: "10.12.2",
};
