"""
Obtiene el "refresh token" de tu cuenta INSTITUCIONAL para que el Jarvis lea
Google Classroom y Gmail (solo lectura). Se ejecuta UNA vez en tu laptop.

Uso (en la carpeta herramientas):
    python obtener_token.py ruta\\al\\client_secret.json

1. Se abre el navegador: inicia sesión con tu correo institucional y acepta.
2. La consola muestra GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REFRESH_TOKEN.
3. Cópialos como secretos en GitHub (GUIA_INSTALACION.md, paso 5).
Solo usa la biblioteca estándar de Python.
"""
import http.server
import json
import secrets
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser

SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    cfg = data.get("installed") or data.get("web")
    if not cfg:
        sys.exit("El archivo no parece un client_secret de Google (tipo 'App de escritorio').")
    client_id, client_secret = cfg["client_id"], cfg["client_secret"]

    result = {}
    state = secrets.token_urlsafe(16)

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if q.get("state", [""])[0] != state:
                self.send_response(400); self.end_headers(); return
            result["code"] = q.get("code", [""])[0]
            result["error"] = q.get("error", [""])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h2>Listo. Ya puedes cerrar esta pestaña y volver a la consola.</h2>".encode())

        def log_message(self, *a):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    redirect = f"http://127.0.0.1:{server.server_port}"
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect, "response_type": "code",
        "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent", "state": state,
    })
    print("Abriendo el navegador para autorizar…\nSi no se abre, copia este enlace:\n", auth_url)
    threading.Thread(target=lambda: webbrowser.open(auth_url), daemon=True).start()
    server.handle_request()

    if result.get("error") or not result.get("code"):
        sys.exit(f"Autorización cancelada o rechazada: {result.get('error')}")

    body = urllib.parse.urlencode({
        "code": result["code"], "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": redirect, "grant_type": "authorization_code",
    }).encode()
    with urllib.request.urlopen("https://oauth2.googleapis.com/token", body) as r:
        tok = json.load(r)
    if "refresh_token" not in tok:
        sys.exit("Google no devolvió refresh_token. Quita el acceso de la app en tu cuenta y repite.")

    print("\n=== Copia estos tres valores como secretos en GitHub ===")
    print("GOOGLE_CLIENT_ID     =", client_id)
    print("GOOGLE_CLIENT_SECRET =", client_secret)
    print("GOOGLE_REFRESH_TOKEN =", tok["refresh_token"])
    print("\nNo compartas estos valores con nadie.")


if __name__ == "__main__":
    main()
