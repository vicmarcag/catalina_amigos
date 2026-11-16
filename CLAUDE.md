# La porra de Catalina (amigos)

Web estática para la porra de **los amigos** de Víctor y Adriana sobre el día de nacimiento de Catalina, su hija. Adriana sale de cuentas el **30 de diciembre de 2026**. La web se publica en **GitHub Pages** y se comparte por WhatsApp con los amigos, así que la mayoría la abrirá en el **móvil**. Tiene que ser muy legible y sin fricción.

Es una copia de la porra de la familia, que está en `../catalina`. Las dos comparten diseño y código; cambian los participantes, la descripción («La porra de los amigos») y el **envío de apuestas desde la web** (solo existe aquí). Si se cambia el diseño o el código común en una, conviene llevarlo también a la otra. Aquí no debe aparecer nada de la familia.

Idioma: todo en **español de España**, tanto el contenido como los comentarios del código. El trato con el usuario (Víctor) también es en español.

## Reglas de la porra (lo que la web debe reflejar)

- Cada participante apuesta un día.
- **Solo gana quien acierta el día exacto.** Si varios eligieron ese día, ganan todos.
- **No hay dinero.** Se decidió explícitamente no pedir dinero a nadie: no hay bote, ni repartos, ni sección de bases. No volver a añadirlos.
- El premio es simbólico: se imprimirá un body con la foto y el nombre de quien gane. La web lo anuncia en la cabecera («Imprimiremos un body con la foto y el nombre de quien acierte el día exacto») y genera un **cartel imprimible** con el body.
- Si nadie acierta, «la porra la gana Catalina» y el body dice «La gané yo».

## Estructura

```
index.html   ← toda la web: HTML + CSS + JS en un único archivo, sin build ni dependencias
assets/      ← ecografia.mp4 (vídeo en bucle, sin audio, ~370 KB), ecografia.jpg (póster), video.mp4 (original, ignorado en `.gitignore`)
             fotos/ (fotos de participantes ya recortadas: 160×160 JPG, nombre sin tildes, p. ej. jose.jpg)
             img/ (originales que pasa Víctor, ignorados en `.gitignore`; se recortan con ffmpeg a fotos/: `crop=300:300:68:60,scale=160:160` sobre originales de 436 px; si la cara está más arriba o más grande, `crop=340:340:48:30`. Revisar siempre que la cara quede centrada en el círculo)
apuestas/    ← apuestas aprobadas desde el formulario: <fecha>-<slug>-<4 letras>.json (nombre y día) + .jpg (foto 160×160). Las crea el Worker.
worker/      ← worker.js (Worker de Cloudflare) y LEEME.md (cómo montarlo, paso a paso)
README.md    ← instrucciones para publicar y mantener (orientado a personas)
CLAUDE.md    ← este archivo
```

No hay build, framework ni npm. Hay que mantenerlo así: un solo archivo que se pueda editar desde la interfaz web de GitHub. Las cargas externas son las fuentes de Google Fonts y, solo si `CONFIG.envio.worker` está relleno, el Worker y el script de Turnstile (este último solo al abrir el formulario). Si fallan, la web funciona igual: fuente del sistema y solo las apuestas de `CONFIG.participantes`.

## Datos: el objeto `CONFIG`

Está al principio del `<script>` en `index.html`. Es lo único que debería hacer falta tocar para el día a día:

| Campo | Uso |
|---|---|
| `bebe` | `"Catalina"`. Se usa en todos los textos. |
| `fpp` | Fecha en la que sale de cuentas (`"2026-12-30"`). |
| `nacimiento` | `null` hasta que nazca. Después, `"AAAA-MM-DD"`. Este campo cambia todo el estado de la página. |
| `participantes` | `{ nombre, fecha, foto? }` con fechas ISO. El orden no importa porque se ordenan por fecha. `foto` es opcional (`"assets/fotos/x.jpg"`, cuadrada, ~120 px); sin ella se ve un círculo rosa con la inicial. |
| `rango` | `{ desde, hasta }`: días que se ven siempre en el calendario (ahora del 14 dic al 10 ene). |
| `envio` | `{ worker, turnstile }`: URL del Worker y *site key* de Turnstile (las dos públicas). Si `worker` está vacío no hay botón ni se piden apuestas al Worker. |
| `fiestas` | Días señalados, con una etiqueta de texto en la celda. |

Participantes actuales (10):

| Fecha | Nombres |
|---|---|
| 27 dic | Adriana |
| 29 dic | Cristóbal |
| 31 dic | Jesús |
| 1 ene | Víctor, Samuel |
| 2 ene | Noe |
| 3 ene | Javy |
| 4 ene | Miguel |
| 5 ene | Alba |
| 6 ene | Robe |

Los nombres deben escribirse con tilde (Cristóbal, Jesús, Víctor). Si dos amigos se llaman igual, se distinguen con un paréntesis, p. ej. «Ana (prima)».

## Comportamiento

### Estados
- **Antes de nacer:** el body muestra «?». La cabecera dice cuántos días faltan para la fecha prevista o, si ya ha pasado, «N días de propina». Las apuestas cuyo día ya ha pasado aparecen tachadas (estado `out`) y las demás siguen en juego (`live`). Debajo del calendario aparece el recuento «Siguen en juego X de las N apuestas».
- **Después de nacer** (`nacimiento` definido): el título cambia a «Catalina ya está aquí». El body lleva los nombres de quienes han ganado, uno por línea, o «La gané yo» si no hay ganador. En el calendario los ganadores aparecen subrayados en amarillo (`win`) y el resto tachados. Aparece también el botón «Imprimir el cartel».

### Parámetros de URL para probar (no tocan el código)
- `?hoy=2026-12-29` simula la fecha de hoy.
- `?nacimiento=2027-01-01` simula el nacimiento ese día.
- Se pueden combinar.

### Fotos y ecografía
- Cada nombre lleva su foto (o la inicial). Cuando ese día ya ha pasado (`out`), la foto se pone en gris; la de quien gana lleva un aro amarillo.
- El subrayado amarillo va en un `span` inline con `box-decoration-break: clone` para que marque todas las líneas de un nombre largo como «Ana (prima)».
- En la cabecera hay una ecografía (`assets/ecografia.mp4`, `autoplay muted loop playsinline`) pegada con celo, a la derecha en escritorio y bajo el texto en tablet y móvil.

### Envío de apuestas
- Botón «Apuntar mi apuesta» en la cabecera (solo antes de nacer y con `envio.worker` relleno). Abre un `<dialog>` con nombre, día (del rango, desde hoy) y foto. Avisa de que **Adriana y Víctor revisarán cada apuesta**.
- La foto se recorta en el navegador con `<canvas>`: cuadrado centrado con la cara algo por encima del centro, se puede arrastrar (o mover con flechas) y acercar. Se envía como JPEG 160×160 (~10 KB), sin EXIF.
- El Worker (`worker/worker.js`) valida todo de nuevo, comprueba Turnstile y abre un pull request contra `AJUSTES.rama` (`main`) con los dos archivos en `apuestas/`. Al hacer Merge, `GET /apuestas` la devuelve y la web la añade a las de `CONFIG` (`setPeople` + `pintar`). Si el Worker no responde, se ven solo las de `CONFIG`.
- Nombres repetidos (sin tildes ni mayúsculas) se rechazan en la web y en el Worker; los de `CONFIG` tienen prioridad.
- Pruebas del Worker: se puede importar en Node 22 y llamar a `worker.fetch(request, env)` simulando `fetch` de GitHub y Turnstile.

### Calendario
- El calendario va exactamente desde la primera fecha relevante hasta la última. Las fechas relevantes son `CONFIG.rango` (14 dic a 10 ene), las apuestas, la `fpp` y el nacimiento, de modo que una apuesta o un nacimiento fuera del rango lo amplía. En escritorio, los huecos para completar la primera y la última semana son celdas `.pad` vacías, que en móvil se ocultan.
- En escritorio es una rejilla de 7 columnas (lunes a domingo). Por debajo de 700 px se convierte en una lista vertical de días.
- Fechas: todo se maneja como cadenas `AAAA-MM-DD` y `Date` en hora local (`parse`/`key`). No usar `new Date("2026-12-30")`, porque lo interpreta en UTC y desplaza un día.

### El body (SVG)
- La silueta es el path `BODY` (viewBox `0 0 240 262`) y se dibuja con `drawOnesie(svg, lines)`. Lleva una costura discontinua recortada con `clipPath`, broches y dos pinzas de tender.
- Tras el nacimiento, `drawOnesie(svg, lines, faces)` pone en el pecho la foto de cada ganador (o su inicial en un círculo blanco) y el nombre debajo. Con un solo ganador, la foto es más grande. Los nombres con paréntesis se parten en dos líneas. Si nadie acierta, no hay foto.
- `fitText` ajusta el tamaño del texto para que quepa dentro, midiendo con `getComputedTextLength`. Por eso se vuelve a ejecutar tras `document.fonts.ready`.
- **El cartel de impresión** (`#poster`, visible solo en `@media print`, A4 vertical) **clona el SVG ya ajustado** de la cabecera, renombrando los ids de los `clipPath` (`onesie-` → `poster-`). No se dibuja de cero porque un SVG oculto no se puede medir y el texto se saldría del body.

## Diseño

El concepto es un **calendario de nevera apuntado a boli** con **un body colgado de una cuerda de tender** en la cabecera. Ese body es el elemento memorable y es literalmente el premio.

Tokens en `:root`:
- `--paper #EDF1F7` (azul sábana, fondo)
- `--ink #1E2B4A` (tinta)
- `--muted #5D6883`
- `--rule #C9D2E1`
- `--pink #F4B6C8` (el body)
- `--pen #AD456A` (círculo a mano de la fecha prevista, «Salimos de cuentas», «Nació»)
- `--marker #FFD84D` (subrayador de ganadores)

Tipografías:
- **Bricolage Grotesque** para titulares, números de día y el texto del body.
- **Atkinson Hyperlegible** para el texto, elegida por legibilidad.

Animación: una única animación de balanceo del body al cargar, que respeta `prefers-reduced-motion`.

Víctor pidió explícitamente que **no parezca generado por IA**. Hay que evitar:
- Fondo crema con serif de titular y acento terracota.
- Todo metido en tarjetas redondeadas con sombra.
- Etiquetas en MAYÚSCULAS espaciadas.
- Metadatos separados por « · ».
- Emojis como decoración.
- Una sola palabra del titular resaltada con otro color o en cursiva.

Las celdas son planas, sin sombra. Las que tienen apuesta llevan fondo blanco y las vacías se quedan en el color del papel.

## Verificación

Después de cada cambio, renderizar con Playwright (Chromium) y revisar estos casos:
- Escritorio a 1100 px: sin parámetros, con `?hoy=2026-12-29` y con `?nacimiento=2027-01-01` (gana Víctor).
- Móvil a 390 px: con `?hoy=2026-12-26` y con `?nacimiento=2026-12-26` (nadie acierta).
- `page.pdf(format="A4")` con nacimiento definido, para comprobar que el nombre cabe dentro del body en el cartel.
- Que no haya errores de JS (`pageerror`).
- Con `envio.worker` relleno en una copia temporal y el Worker y Turnstile simulados con `page.route`: abrir el formulario, rechazar un nombre repetido, subir una foto vertical, enviar y comprobar que llega un JPEG de 160×160.

## Publicación

GitHub Pages: Settings → Pages → Deploy from a branch → `main`, carpeta `/ (root)`. La web es pública, así que cualquiera con el enlace ve nombres de pila y fechas. Víctor lo sabe.

## Pendiente o posible

- El día del nacimiento: poner la fecha en `CONFIG.nacimiento`, hacer commit e imprimir el cartel.
- Las reglas pueden cambiar todavía («puede haber cambios»). Si cambian, actualizar este archivo y el README.
