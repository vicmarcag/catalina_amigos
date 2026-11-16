# Envío de apuestas desde la web

Los amigos pulsan «Apuntar mi apuesta», escriben su nombre, eligen el día y suben una foto. El navegador recorta la foto a 160×160 y la manda al Worker de Cloudflare (`worker.js`). El Worker abre un **pull request** en GitHub con la apuesta. Cuando Adriana o Víctor lo aprueban (**Merge**), aparece en el calendario.

Cada apuesta son dos archivos en la carpeta `apuestas/`: un `.json` con el nombre y el día, y un `.jpg` con la foto. Como cada apuesta va en archivos propios, los pull requests nunca chocan entre sí.

## 1. Clave de GitHub (token)

1. En GitHub, pulsa tu foto (arriba a la derecha) → **Settings** → **Developer settings** (abajo del todo, a la izquierda) → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Rellena:
   - **Token name:** `porra-catalina-amigos-worker`
   - **Expiration:** *Custom* → 28 de febrero de 2027 (la porra habrá terminado).
   - **Repository access:** *Only select repositories* → `catalina_amigos`. Solo este, ningún otro.
   - **Permissions → Repository permissions:**
     - **Contents:** *Read and write*
     - **Pull requests:** *Read and write*
     - (*Metadata: Read-only* se añade sola.)
3. **Generate token** y copia la clave (empieza por `github_pat_`). Solo se ve una vez. No la pegues en el chat, ni en el código, ni en ningún otro sitio que no sea el paso 3.4.

Si alguna vez crees que se ha filtrado, vuelve a esa misma pantalla y pulsa **Revoke**. El Worker dejará de poder escribir al momento.

## 2. Captcha de Cloudflare (Turnstile)

1. En el panel de Cloudflare, menú de la izquierda → **Turnstile** → **Add widget**.
2. Rellena:
   - **Widget name:** `Porra amigos`
   - **Hostname:** `vicmarcag.github.io`
   - **Widget mode:** *Managed*
3. **Create**. Te dará dos claves:
   - **Site Key:** es pública y va en `index.html`, en el paso 4.
   - **Secret Key:** es secreta y va en el Worker, en el paso 3.4.

## 3. El Worker

1. En Cloudflare, **Workers & Pages** → **Create** → **Create Worker** (plantilla *Hello world*).
2. Nombre: `porra-catalina-amigos` → **Deploy**. Apunta la dirección que te da, del tipo `https://porra-catalina-amigos.TU-SUBDOMINIO.workers.dev`.
3. **Edit code**. Borra todo, pega el contenido de `worker/worker.js` y pulsa **Deploy**.
4. Vuelve al Worker → **Settings** → **Variables and Secrets** → **Add**. Añade dos, las dos de tipo **Secret**:
   - `GITHUB_TOKEN` = la clave del paso 1
   - `TURNSTILE_SECRET` = la *Secret Key* del paso 2

   Guarda (**Deploy**).
5. Comprobación: abre `https://porra-catalina-amigos.TU-SUBDOMINIO.workers.dev/apuestas` en el navegador. Debe salir `[]`. Si sale un error, mira **Logs** en el Worker.

## 4. Conectar la web

En `index.html`, dentro de `CONFIG`, rellena:

```js
envio: {
  worker: "https://porra-catalina-amigos.TU-SUBDOMINIO.workers.dev",
  turnstile: "LA-SITE-KEY-DEL-PASO-2",
},
```

Las dos son públicas, así que no pasa nada por subirlas a GitHub.

## 5. Ajustes del repositorio en GitHub

- **Settings → General → Pull Requests:** marca *Automatically delete head branches*, para que las ramas de cada apuesta se borren al aprobarla.
- **Avisos:** los pull requests se crean con tu clave, así que GitHub los considera tuyos y **no te avisa**. Para que te llegue una notificación:
  - Si Adriana tiene cuenta de GitHub, añádela en **Settings → Collaborators** y pon su usuario en `revisores`, al principio de `worker.js`. Le llegará un aviso con cada apuesta.
  - Si no, revisa de vez en cuando la pestaña **Pull requests** del repositorio en la app de GitHub.

## 6. Probar en la rama `envio-apuestas`

1. **Settings → Pages:** cambia la rama a `envio-apuestas`, carpeta `/ (root)`.
2. Abre la web, pulsa «Apuntar mi apuesta» y envía una de prueba.
3. En GitHub aparecerá un pull request «Apuesta de …» con la foto. Pulsa **Merge** y, al recargar la web, saldrá en el calendario.
4. Para quitar una apuesta de prueba ya aprobada, borra sus dos archivos de `apuestas/`.

## 7. Pasar a producción

1. Fusiona `envio-apuestas` en `main`.
2. En `worker.js`, cambia `rama: "envio-apuestas"` por `rama: "main"` y vuelve a pegarlo en Cloudflare (**Deploy**).
3. **Settings → Pages:** vuelve a poner `main`.

## Qué protege a la porra

- Nada llega a la web sin que Adriana o Víctor pulsen **Merge**.
- La clave de GitHub solo vive en Cloudflare y solo puede tocar este repositorio.
- Turnstile frena a los bots.
- El Worker solo acepta peticiones desde `vicmarcag.github.io`.
- Comprueba el nombre (solo letras, 24 como máximo), que el día esté entre el 14 de diciembre y el 10 de enero, que la foto sea un JPEG de 160×160, y que nadie repita nombre.
- No admite más de 20 apuestas pendientes a la vez.
- La foto se genera de nuevo en el navegador, así que no lleva la ubicación GPS ni otros datos del móvil.

Ten en cuenta que todo lo que se aprueba queda en el historial de Git, aunque luego se borre.
