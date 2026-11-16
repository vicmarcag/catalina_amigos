/* ============================================================
   Worker de Cloudflare para la porra de amigos de Catalina

   Hace dos cosas:
   - GET  /apuestas  devuelve las apuestas ya aprobadas (las que están
     en la carpeta apuestas/ de la rama AJUSTES.rama).
   - POST /apuesta   recibe una apuesta nueva desde el formulario y abre
     un pull request en GitHub. No aparece en la web hasta que Adriana
     o Víctor lo aprueban (Merge).

   Secretos que hay que crear en Cloudflare (Settings → Variables and Secrets):
   - GITHUB_TOKEN      clave de GitHub con permiso solo sobre este repositorio
   - TURNSTILE_SECRET  clave secreta de Turnstile (el captcha de Cloudflare)
   ============================================================ */

const AJUSTES = {
  repo: "vicmarcag/catalina_amigos",
  rama: "envio-apuestas",          // rama donde se guardan las apuestas aprobadas; al terminar las pruebas, "main"
  origenes: ["https://vicmarcag.github.io"],   // webs que pueden usar este Worker
  desde: "2026-12-14",             // días en los que se puede apostar
  hasta: "2027-01-10",
  maxPendientes: 20,               // apuestas sin revisar a la vez, para frenar abusos
  maxApuestas: 45,                 // límite de apuestas aprobadas que se leen
  revisores: [],                   // usuarios de GitHub a los que avisar, p. ej. ["usuario-de-adriana"]
};

const NOMBRE = /^\p{L}[\p{L} .'’()-]{0,23}$/u;
const MAX_FOTO = 60 * 1024;        // la foto llega en 160×160 y pesa unos 10 KB

export default {
  async fetch(request, env) {
    const origen = request.headers.get("Origin") || "";
    const cors = AJUSTES.origenes.includes(origen)
      ? { "Access-Control-Allow-Origin": origen, "Vary": "Origin" }
      : { "Vary": "Origin" };
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
    }
    try {
      if (request.method === "GET" && url.pathname === "/apuestas") {
        const lista = await aprobadas(env);
        return json(lista.map(({ nombre, fecha, foto }) => ({ nombre, fecha, foto })), 200, { ...cors, "Cache-Control": "public, max-age=60" });
      }
      if (request.method === "POST" && url.pathname === "/apuesta") {
        if (!AJUSTES.origenes.includes(origen)) return json({ error: "Origen no permitido." }, 403, cors);
        return await recibir(request, env, cors);
      }
      return json({ error: "No encontrado." }, 404, cors);
    } catch (e) {
      console.error(e && e.stack || e);
      return json({ error: "Algo ha fallado al guardar la apuesta. Vuelve a intentarlo en un rato." }, 500, cors);
    }
  },
};

/* ---------- Apuestas aprobadas ---------- */
async function aprobadas(env) {
  const arbol = await gh(env, `/git/trees/${encodeURIComponent(AJUSTES.rama)}?recursive=1`);
  const rutas = arbol.tree
    .filter(t => t.type === "blob" && /^apuestas\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.json$/.test(t.path))
    .map(t => t.path)
    .slice(0, AJUSTES.maxApuestas);
  const raw = p => `https://raw.githubusercontent.com/${AJUSTES.repo}/${AJUSTES.rama}/${p}`;
  const datos = await Promise.all(rutas.map(async p => {
    try {
      const r = await fetch(raw(p));
      if (!r.ok) return null;
      const a = await r.json();
      const nombre = String(a.nombre || "").trim();
      if (!NOMBRE.test(nombre) || !fechaValida(a.fecha)) return null;
      return { nombre, fecha: a.fecha, foto: raw(p.replace(/\.json$/, ".jpg")), slug: slugDeRuta(p) };
    } catch { return null; }
  }));
  return datos.filter(Boolean);
}

/* ---------- Apuesta nueva ---------- */
async function recibir(request, env, cors) {
  const largo = Number(request.headers.get("Content-Length") || 0);
  if (largo > 120000) return json({ error: "La foto es demasiado grande." }, 413, cors);
  const texto = await request.text();
  if (texto.length > 120000) return json({ error: "La foto es demasiado grande." }, 413, cors);
  let datos;
  try { datos = JSON.parse(texto); } catch { return json({ error: "Datos no válidos." }, 400, cors); }

  const nombre = String(datos.nombre || "").trim().replace(/\s+/g, " ");
  const fecha = String(datos.fecha || "");
  const foto = String(datos.foto || "");
  if (!NOMBRE.test(nombre)) return json({ error: "Escribe tu nombre con letras (máximo 24)." }, 400, cors);
  if (!fechaValida(fecha)) return json({ error: "Elige un día entre el 14 de diciembre y el 10 de enero." }, 400, cors);
  const bytes = deBase64(foto);
  if (!bytes || bytes.length > MAX_FOTO || !esJpeg160(bytes)) return json({ error: "La foto no es válida. Prueba con otra." }, 400, cors);

  // Captcha de Cloudflare
  const fd = new FormData();
  fd.append("secret", env.TURNSTILE_SECRET || "");
  fd.append("response", String(datos.turnstile || ""));
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) fd.append("remoteip", ip);
  const ts = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd })).json();
  if (!ts.success) return json({ error: "No hemos podido comprobar que no eres un robot. Recarga la página y vuelve a intentarlo." }, 400, cors);

  // Que no se repita el nombre ni haya demasiadas pendientes
  const s = slug(nombre);
  if (!s) return json({ error: "Escribe tu nombre con letras (máximo 24)." }, 400, cors);
  const prs = await gh(env, `/pulls?state=open&per_page=100`);
  const pendientes = prs.filter(p => p.head && p.head.ref.startsWith("apuesta/"));
  if (pendientes.length >= AJUSTES.maxPendientes) return json({ error: "Hay muchas apuestas esperando revisión. Prueba dentro de un rato." }, 429, cors);
  if (pendientes.some(p => p.head.ref.replace(/^apuesta\//, "").replace(/-[a-z0-9]{4}$/, "") === s)) {
    return json({ error: `Ya hay una apuesta de «${nombre}» esperando a que Adriana y Víctor la revisen.` }, 409, cors);
  }
  if ((await aprobadas(env)).some(a => a.slug === s)) {
    return json({ error: `Ya hay una apuesta a nombre de «${nombre}». Si eres otra persona, añade la inicial de tu apellido.` }, 409, cors);
  }

  // Rama nueva con la foto y los datos, y pull request para revisarla
  const rnd = [...crypto.getRandomValues(new Uint8Array(4))].map(b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  const id = `${fecha}-${s}-${rnd}`;
  const rama = `apuesta/${s}-${rnd}`;
  const base = await gh(env, `/git/ref/heads/${encodeURIComponent(AJUSTES.rama)}`);
  await gh(env, `/git/refs`, { method: "POST", body: { ref: `refs/heads/${rama}`, sha: base.object.sha } });
  try {
    await gh(env, `/contents/apuestas/${id}.jpg`, { method: "PUT", body: { message: `Foto de ${nombre}`, content: foto, branch: rama } });
    const contenido = JSON.stringify({ nombre, fecha, enviada: new Date().toISOString() }, null, 2) + "\n";
    await gh(env, `/contents/apuestas/${id}.json`, { method: "PUT", body: { message: `Apuesta de ${nombre} para el ${fechaLarga(fecha)}`, content: aBase64(contenido), branch: rama } });
    const fotoUrl = `https://raw.githubusercontent.com/${AJUSTES.repo}/${rama}/apuestas/${id}.jpg`;
    const pr = await gh(env, `/pulls`, { method: "POST", body: {
      title: `Apuesta de ${nombre}: ${fechaLarga(fecha)}`,
      head: rama,
      base: AJUSTES.rama,
      body: `**Nombre:** ${nombre}\n**Día:** ${fechaLarga(fecha)}\n\n<img src="${fotoUrl}" width="160" alt="Foto de ${nombre}">\n\nSi está bien, pulsa **Merge** y aparecerá en la web en un minuto. Si no, cierra el pull request sin fusionarlo.\n`,
    } });
    if (AJUSTES.revisores.length) {
      try { await gh(env, `/pulls/${pr.number}/requested_reviewers`, { method: "POST", body: { reviewers: AJUSTES.revisores } }); } catch (e) { console.error(e); }
    }
  } catch (e) {
    // Si algo falla a medias, se borra la rama para no dejar restos
    try { await gh(env, `/git/refs/heads/${rama}`, { method: "DELETE" }); } catch {}
    throw e;
  }
  return json({ ok: true }, 200, cors);
}

/* ---------- Utilidades ---------- */
async function gh(env, ruta, opciones = {}) {
  const r = await fetch(`https://api.github.com/repos/${AJUSTES.repo}${ruta}`, {
    method: opciones.method || "GET",
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "porra-catalina-amigos",
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status} en ${opciones.method || "GET"} ${ruta}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json();
}

function json(datos, status, cabeceras) {
  return new Response(JSON.stringify(datos), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cabeceras } });
}

function fechaValida(f) {
  return typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) && f >= AJUSTES.desde && f <= AJUSTES.hasta;
}

function fechaLarga(f) {
  const [y, m, d] = f.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(",", "");
}

// «Ana G.» → «ana-g»; sirve para nombres de archivo y para detectar repetidos
function slug(nombre) {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

function slugDeRuta(ruta) {
  return ruta.replace(/^apuestas\/\d{4}-\d{2}-\d{2}-/, "").replace(/\.json$/, "").replace(/-[a-z0-9]{4}$/, "");
}

function deBase64(texto) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(texto)) return null;
  try { return Uint8Array.from(atob(texto), c => c.charCodeAt(0)); } catch { return null; }
}

function aBase64(texto) {
  let s = "";
  for (const b of new TextEncoder().encode(texto)) s += String.fromCharCode(b);
  return btoa(s);
}

// Comprueba que es un JPEG de verdad y que mide 160×160 (lo que genera el formulario)
function esJpeg160(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8 || b[2] !== 0xFF) return false;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) return false;
    const marca = b[i + 1];
    const largo = (b[i + 2] << 8) | b[i + 3];
    if (marca >= 0xC0 && marca <= 0xCF && marca !== 0xC4 && marca !== 0xC8 && marca !== 0xCC) {
      const alto = (b[i + 5] << 8) | b[i + 6], ancho = (b[i + 7] << 8) | b[i + 8];
      return alto === 160 && ancho === 160;
    }
    i += 2 + largo;
  }
  return false;
}
