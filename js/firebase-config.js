/* Configuración de la nube (Firebase) del proyecto jarvis-ramos.
   Estos valores NO son secretos: solo identifican el proyecto. La seguridad la dan las reglas de Firestore
   (cada cuenta de Google solo puede leer y escribir sus propios datos). */
self.JARVIS_CONFIG = {
  firebase: {
    apiKey: "AIzaSyC20JbF4M3FGU_zQcMqF8Z9SZ1OwJ57orc",
    authDomain: "jarvis-ramos.firebaseapp.com",
    projectId: "jarvis-ramos",
    storageBucket: "jarvis-ramos.firebasestorage.app",
    messagingSenderId: "964805385170",
    appId: "1:964805385170:web:ca7c8c070d59ad46d3860b"
  },
  vapidKey: "BB4GbiP3FCKuwxGUi-irS2VaRjmxkBPCn-NTcDThsKei-JU7TvBeg5WyllcTTBbNzocFbl3w2NrwBecOYMb96_g",
  ownerEmail: "",                      // vacío a propósito: tu correo no se publica
  firebaseVersion: "10.12.2",
};
