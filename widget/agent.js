/* ============================================================================
 * KHIYA — Widget de chat embebible (IJV Agency)
 * ----------------------------------------------------------------------------
 * Generado por IJV Factory — NO editar a mano: cambios van al factory.config.json
 * y se regenera. Patrón canónico extraído de mmdent/widget/agent.js.
 *
 * Distribución recomendada vía jsDelivr (repo público):
 *   https://cdn.jsdelivr.net/gh/nachojr2003/khiya-site@main/widget/agent.js
 *
 * Uso en el sitio del cliente:
 *   <script>
 *     window.khiyaAgentConfig = { }; // overrides opcionales — los defaults van embebidos
 *   </script>
 *   <script src=".../widget/agent.js" defer></script>
 *
 * Sin dependencias externas. IIFE puro, vanilla JS (ES5).
 * ============================================================================ */
(function () {
  'use strict';

  /* ---------------- Config con DEFAULTS embebidos (regla #11: si el
   * integrador pasa config parcial, NADA queda undefined) ---------------- */
  var DEFAULTS = {
    n8nBase:        "https://meta.ijvagency.com",
    webhook:        null,
    leadsWebhook:   null,
    privacyUrl:     '/politica-privacidad',
    logoUrl:        "https://nachojr2003.github.io/khiya-site/logo.png",
    /* Fondo del chip del logo (launcher + encabezado). Default blanco. Un logo
     * que YA trae su plato oscuro (regla #104) declara `brand.logo.fondo` con
     * ese mismo color: si no, queda un cuadrado blanco detrás (regla #133). */
    logoBg:         "#FFFFFF",
    primary:        '#272622',
    secondary:      '#504E46',
    accent:         '#F3ECE2',
    fontFamily:     "Mulish,system-ui,-apple-system,'Segoe UI',sans-serif,'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji'",
    timeoutMs:      45000,   /* >= 30s: queries con RAG completo cortan a 15s (regla #10).
                              * 45000 y no 40000: la espera real que ve el usuario es
                              * timeoutMs × (1 + maxRetries), así que el knob que importa
                              * es maxRetries. Un turno vivo nunca llega a 40s (RAG p99
                              * ~10s + self-call del retry-on-empty ~5s, regla #84): entre
                              * 40 y 45 solo cambia cuánto tarda en rendirse lo ya muerto. */
    maxRetries:     1,
    typewriter:     true,
    typewriterCps:  90,
    agentName:      "la asistente de KHIYA",
    clientName:     "KHIYA",
    /* Subtítulo del encabezado: dice a QUÉ ATIENDE el agente, nunca qué es. Una
     * etiqueta de bot aquí lo delata antes de que escriba una palabra (regla
     * #114). Se personaliza con `agente.subtitulo_widget` en el config. */
    headerSubtitle: "Atención personalizada",

    whatsappNumber: "+51902368920",
    whatsappLink:   "https://wa.me/51902368920",


    welcomeMessage: "Hola, bienvenida a KHIYA, qué lindo tenerte por aquí 🤍\n\nCreamos básicos esenciales pensados para acompañarte todos los días, con la suavidad y la calidad de nuestro algodón pima peruano. ¿Te ayudo a elegir el tuyo?"
  };
  var CFG = window.khiyaAgentConfig = window.khiyaAgentConfig || {};
  for (var k in DEFAULTS) { if (CFG[k] === undefined || CFG[k] === null) CFG[k] = DEFAULTS[k]; }
  if (!CFG.webhook)      CFG.webhook      = CFG.n8nBase + '/webhook/khiya-agent';
  if (!CFG.leadsWebhook) CFG.leadsWebhook = CFG.n8nBase + '/webhook/khiya-leads';

  /* ¿El fondo del chip del logo es oscuro? Decide el color del ícono de
   * fallback del launcher (regla #95): primario sobre blanco, blanco sobre un
   * plato oscuro. Luminancia BT.601, mismo criterio que la página del cierre. */
  function esColorOscuro(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return false;
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }
  var logoBgOscuro = esColorOscuro(CFG.logoBg);

  var QUICK_BUTTONS = [{"label":"Conocer los modelos","mensaje":"¿Qué modelos tienen y cuánto cuestan?"},{"label":"Encontrar mi talla","mensaje":"¿Qué talla me queda? ¿Me pasas las medidas?"},{"label":"Hacer mi pedido","mensaje":"Quiero hacer mi pedido"}];

  /* ---------------- Utilidades ---------------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function parseMd(text) {
    var s = escapeHtml(text);
    s = s.replace(/```([\s\S]*?)```/g, function (_, c) { return '<pre>' + c + '</pre>'; });
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|\s)(https?:\/\/[^\s<]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    s = s.replace(/(^|\n)- (.+)/g, '$1<li>$2</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    /* Regla #27: strip de placeholders alucinados por el LLM.
       Restringido a placeholders CONOCIDOS: un strip genérico \[[a-z_]+\]
       borraba texto legítimo entre corchetes (ej. "[PDF]", "[borrador]"). */
    s = s.replace(/\{\{[^}]+\}\}/g, '').replace(/\{first_name\}/gi, '')
      .replace(/\[(nombre|name|first_name|usuario|user)\]/gi, '');
    /* Segunda capa: MARCAS INTERNAS del sistema. El nodo Finalize del workflow ya
       las strippea; esto es la red por si un turno las deja pasar — el usuario
       jamás debe leer "[CONSENT_OK]" ni "[PENDIENTE CLIENTE: precio]".
       Lista EXPLÍCITA a propósito: un \[[A-Z_]{3,}\] genérico borraría texto
       legítimo del negocio ("[PDF]", "[IVA]", "[RUC]") — misma lección que el
       strip de placeholders de arriba (regla #27). Marca nueva en un workflow
       ⇒ agregarla también aquí. */
    s = s.replace(/\[\/?(CONSENT_OK|CONSENT|HANDOFF|ESCALATED|ESCALAR|LEAD_OK|NO_KB|IMG:[^\]]*|PENDIENTE[^\]]*)\]/gi, '');
    s = s.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
    return '<p>' + s + '</p>';
  }

  /* ---------------- Fotos dentro del mensaje del agente ----------------
   * Contrato (genérico, sirve para cualquier cliente que mande imágenes): si una
   * línea del mensaje contiene SOLO una URL de imagen, esa línea se pinta como
   * <img> y el resto del texto fluye normal. Cualquier otra URL sigue siendo un
   * enlace de texto, como siempre.
   *
   * Se eligió URL cruda y no un marcador propio a propósito: si algo falla, el
   * peor caso es que se vea una URL (feo pero funcional); un marcador roto se
   * leería como basura. Y el `finalize` de los workflows no lo strippearía.
   *
   * Seguridad: SOLO https + extensión de imagen conocida. La regex no admite
   * espacios, comillas ni `<`/`>`, así que no hay forma de colar `javascript:`,
   * `data:` ni un atributo extra; además la URL se asigna por PROPIEDAD
   * (img.src = …), nunca concatenada dentro de innerHTML. */
  var RE_FOTO     = /^https:\/\/[^\s<>"']+\.(?:webp|jpe?g|png)(?:\?[^\s<>"']*)?$/i;
  var RE_HAY_FOTO = /^[ \t]*https:\/\/[^\s<>"']+\.(?:webp|jpe?g|png)(?:\?[^\s<>"']*)?[ \t\r]*$/im;

  function splitFotos(text) {
    var out = [], buf = [];
    function cierra() {
      var t = buf.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
      if (t.replace(/\s/g, '')) out.push({ tipo: 'texto', texto: t });
      buf = [];
    }
    String(text == null ? '' : text).split('\n').forEach(function (l) {
      var s = l.trim();
      if (RE_FOTO.test(s)) { cierra(); out.push({ tipo: 'foto', url: s }); }
      else buf.push(l);
    });
    cierra();
    return out;
  }
  /* Texto sin las líneas de foto. Si no hay fotos devuelve el original TAL CUAL
   * (idéntico byte a byte): así el camino de siempre no cambia en nada. */
  function sinFotos(text) {
    var s = String(text == null ? '' : text);
    if (!RE_HAY_FOTO.test(s)) return s;
    var out = [], bl = splitFotos(s);
    for (var i = 0; i < bl.length; i++) if (bl[i].tipo === 'texto') out.push(bl[i].texto);
    return out.join('\n\n');
  }
  /* alt descriptivo desde el nombre del archivo: ".../dormitorio-1.webp" -> "Foto: dormitorio 1" */
  function altFoto(url) {
    var n = url.split('?')[0].split('/').pop().replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ').trim();
    return n ? ('Foto: ' + n) : 'Foto';
  }
  /* Regla #95: si la foto 404ea se oculta — jamás el ícono de imagen rota.
   * Regla #19: el re-scroll al onload queda como red. Con el 4/3 reservado el
   * alto ya es el final y no hace falta, pero si la foto real NO es 4:3 el alto
   * cambia al cargar — ahí sí hay que volver a bajar (scrollToBottom trae el rAF
   * que Safari/iOS necesita). */
  function prepFoto(img) {
    /* setProperty con prioridad `important` y no `style.display='none'` a secas:
     * la regla .ijv-msg img.ijv-foto necesita `display:block!important` para
     * ganarle al CSS anti-emoji (regla #15), y un display inline SIN important
     * pierde contra ella — la foto rota quedaba visible. Verificado en vivo. */
    var falla = function () {
      if (img.style.setProperty) img.style.setProperty('display', 'none', 'important');
      else img.style.display = 'none';
    };
    img.onerror = falla;
    img.onload  = function () { scrollToBottom(); };
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) falla();
  }
  /* Pinta el cuerpo de una burbuja del bot. Sin fotos ⇒ exactamente lo de antes. */
  function renderBot(div, text) {
    var s = String(text == null ? '' : text);
    if (!RE_HAY_FOTO.test(s)) { div.innerHTML = parseMd(s); return; }
    div.innerHTML = '';
    if (div.className.indexOf('ijv-con-foto') < 0) div.className += ' ijv-con-foto';
    var bl = splitFotos(s);
    for (var i = 0; i < bl.length; i++) {
      if (bl[i].tipo === 'foto') {
        var img = document.createElement('img');
        img.className = 'ijv-foto';
        /* EAGER a propósito: `lazy` es para galerías largas fuera de pantalla.
         * Aquí la foto entra al viewport en el mismo instante en que se pinta el
         * mensaje, así que lazy solo agregaba latencia y dejaba un hueco blanco
         * que se llenaba un segundo después. Son 1-2 fotos por mensaje. */
        img.setAttribute('loading', 'eager');
        img.setAttribute('fetchpriority', 'high');
        img.setAttribute('decoding', 'async');
        img.alt = altFoto(bl[i].url);
        prepFoto(img);          /* handlers ANTES del src: un 404 instantáneo no se pierde */
        img.src = bl[i].url;
        div.appendChild(img);
      } else {
        /* Se desenvuelve el <p> del parseMd para que quede como hijo directo de
         * .ijv-msg y le sigan aplicando los mismos estilos de siempre. */
        var wrap = document.createElement('div');
        wrap.innerHTML = parseMd(bl[i].texto);
        while (wrap.firstChild) div.appendChild(wrap.firstChild);
      }
    }
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /* Regla #61: TTL de inactividad — Cmd+Shift+R NO limpia sessionStorage; sin
   * TTL la Simple Memory del agente arrastra la conversación vieja. */
  var SESSION_TTL_MS = 30 * 60 * 1000;
  var SS_PREFIX = 'khiya_';
  function getSessionId() {
    var s = sessionStorage.getItem(SS_PREFIX + 'session_id');
    var last = parseInt(sessionStorage.getItem(SS_PREFIX + 'session_last') || '0', 10);
    var now = Date.now();
    if (!s || (last && (now - last) > SESSION_TTL_MS)) {
      s = uuid();
      sessionStorage.setItem(SS_PREFIX + 'session_id', s);
      sessionStorage.removeItem(SS_PREFIX + 'messages');
    }
    sessionStorage.setItem(SS_PREFIX + 'session_last', String(now));
    return s;
  }
  function resetSession() {
    sessionStorage.removeItem(SS_PREFIX + 'session_id');
    sessionStorage.removeItem(SS_PREFIX + 'session_last');
    sessionStorage.removeItem(SS_PREFIX + 'messages');
    return getSessionId();
  }

  /* Persistencia de mensajes: sobreviven al refresh, no al cerrar la pestaña */
  function loadMessages() {
    try { return JSON.parse(sessionStorage.getItem(SS_PREFIX + 'messages') || '[]'); }
    catch (e) { return []; }
  }
  function saveMessage(role, text) {
    try {
      var m = loadMessages();
      m.push({ role: role, text: text });
      if (m.length > 60) m = m.slice(-60);
      sessionStorage.setItem(SS_PREFIX + 'messages', JSON.stringify(m));
    } catch (e) { /* quota: silencioso */ }
  }

  /* ---------------- CSS inyectado ----------------
   * Regla #15: CSS defensivo para <img> (librerías emoji del sitio convierten
   * unicode a <img>; sin esto un 👋 sale de 600px) + fuentes emoji en la pila. */
  var CSS = [
    /* --ijv-text es FIJO a proposito (regla de Nacho): las letras de los mensajes
     * del agente van SIEMPRE en negro, nunca en un color de marca. El secundario
     * queda solo para usos decorativos (gradiente del cal, toast). */
    ':root{--ijv-primary:' + CFG.primary + ';--ijv-secondary:' + CFG.secondary + ';--ijv-accent:' + CFG.accent + ';--ijv-text:#111111;}',
    /* El launcher y el chip del encabezado toman el color de fondo del logo
     * (CFG.logoBg, default blanco): un badge oscuro sobre un chip blanco se ve
     * como un parche (regla #133). El ícono de fallback (regla #95) hereda
     * `color`, que se elige por contraste contra ese fondo. */
    '.ijv-launcher{position:fixed;bottom:22px;right:22px;height:60px;padding:0 22px;border-radius:30px;background:' + CFG.logoBg + ';color:' + (logoBgOscuro ? '#fff' : 'var(--ijv-primary)') + ';border:0;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;z-index:2147483000;transition:transform .2s ease}',
    '.ijv-launcher:hover{transform:scale(1.05)}',
    /* Los logos (launcher y encabezado) blindados igual que las fotos: es la
     * MISMA familia de bug que la regla #15 — un `img{width:100%!important}`
     * global del sitio del cliente le ganaba al `width:auto` de aquí y
     * deformaba el logo (el del encabezado se comía media ventana del chat).
     * Verificado en vivo con un sitio anfitrión hostil. */
    '.ijv-launcher img{height:36px!important;width:auto!important;max-width:none!important;display:block!important;object-fit:contain}',
    '.ijv-root *,.ijv-root *::before,.ijv-root *::after{box-sizing:border-box}',
    '.ijv-root{position:fixed;bottom:100px;right:22px;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 120px);background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:' + CFG.fontFamily + ';color:var(--ijv-text);transform:translateY(20px);opacity:0;pointer-events:none;transition:transform .25s ease,opacity .2s ease}',
    '.ijv-root.ijv-open{transform:translateY(0);opacity:1;pointer-events:auto}',
    '.ijv-head{background:var(--ijv-primary);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px}',
    '.ijv-head img{height:44px!important;width:auto!important;max-width:none!important;background:' + CFG.logoBg + ';border-radius:10px;padding:6px 10px;flex-shrink:0;display:block!important}',
    '.ijv-head .ijv-title{font-weight:700;font-size:15px;line-height:1.2}',
    /* El subtítulo va SOLO con headerSubtitle (el nombre ya está en el título) y
     * se recorta a 2 líneas como red: concatenado con el nombre del agente salía
     * en 3 líneas en escritorio y 5 en móvil (regla #133). */
    '.ijv-head .ijv-sub{font-size:12px;opacity:.85;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.ijv-head .ijv-actions{margin-left:auto;display:flex;gap:6px}',
    '.ijv-head button{background:rgba(255,255,255,.15);border:0;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px}',
    '.ijv-head button:hover{background:rgba(255,255,255,.28)}',
    '.ijv-msgs{flex:1;overflow-y:auto;padding:16px;background:#FAFAFA;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}',
    '.ijv-msg{max-width:84%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;word-wrap:break-word}',
    '.ijv-msg p{margin:0 0 6px}.ijv-msg p:last-child{margin:0}',
    '.ijv-msg ul{margin:4px 0 4px 18px;padding:0}.ijv-msg li{margin:2px 0}',
    '.ijv-msg a{color:var(--ijv-primary);text-decoration:underline}',
    '.ijv-msg code{background:rgba(0,0,0,.08);padding:1px 5px;border-radius:4px;font-size:13px}',
    '.ijv-msg img{max-width:1.2em!important;max-height:1.2em!important;display:inline-block!important;vertical-align:text-bottom!important}',
    /* Fotos que manda el agente. La regla de arriba aplasta CUALQUIER <img> a
     * 1.2em para defenderse de las librerías de emoji del sitio (regla #15);
     * esta gana por especificidad y solo alcanza a las fotos que pinta el
     * widget. Los !important son contra un `img{width:100%!important}` global
     * del sitio del cliente, que si no deforma la foto. */
    /* `aspect-ratio:auto 4/3` reserva el hueco con el alto FINAL desde el primer
     * frame: mientras la imagen no tiene proporción natural (o sea, mientras
     * carga) vale el 4/3; apenas llega manda la proporción real de la imagen, así
     * que una foto vertical o panorámica se ve bien igual. Sin esto la burbuja
     * crecía de golpe al cargar y empujaba el texto. */
    '.ijv-msg img.ijv-foto{display:block!important;width:100%!important;max-width:100%!important;max-height:none!important;height:auto!important;aspect-ratio:auto 4 / 3;vertical-align:baseline!important;border-radius:10px;margin:6px 0;background:rgba(0,0,0,.05)}',
    '.ijv-msg img.ijv-foto:first-child{margin-top:0}',
    '.ijv-msg img.ijv-foto:last-child{margin-bottom:0}',
    '.ijv-msg.ijv-con-foto{max-width:92%}',
    '.ijv-bot{align-self:flex-start;background:#fff;border:1px solid #E8E8E8;border-top-left-radius:4px;color:var(--ijv-text)}',
    '.ijv-user{align-self:flex-end;background:var(--ijv-primary);color:#fff;border-top-right-radius:4px}',
    '.ijv-user a{color:#fff}',
    '.ijv-typing{align-self:flex-start;display:flex;gap:4px;padding:10px 14px;background:#fff;border:1px solid #E8E8E8;border-radius:14px;border-top-left-radius:4px}',
    '.ijv-typing span{width:7px;height:7px;background:var(--ijv-primary);border-radius:50%;opacity:.4;animation:ijvBlink 1.2s infinite}',
    '.ijv-typing span:nth-child(2){animation-delay:.2s}.ijv-typing span:nth-child(3){animation-delay:.4s}',
    '@keyframes ijvBlink{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}',
    '.ijv-cta{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 6px}',
    '.ijv-pill{background:var(--ijv-accent);color:var(--ijv-primary);border:1px solid rgba(0,0,0,.08);padding:6px 12px;border-radius:999px;font-size:12.5px;cursor:pointer;font-weight:600;transition:all .15s;font-family:inherit}',
    '.ijv-pill:hover{background:var(--ijv-primary);color:#fff;border-color:var(--ijv-primary)}',
    '.ijv-form{background:#fff;border:1px solid #E8E8E8;border-radius:12px;padding:14px;margin:8px 0;display:flex;flex-direction:column;gap:8px;align-self:stretch}',
    '.ijv-form h4{margin:0 0 4px;font-size:14px;color:var(--ijv-text)}',
    '.ijv-form input,.ijv-form textarea{width:100%;padding:9px 11px;border:1px solid #D8D8D8;border-radius:8px;font-size:13.5px;font-family:inherit;color:var(--ijv-text);background:#fff}',
    '.ijv-form input:focus,.ijv-form textarea:focus{outline:none;border-color:var(--ijv-primary)}',
    '.ijv-form button{background:var(--ijv-primary);color:#fff;border:0;padding:10px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13.5px;font-family:inherit}',
    '.ijv-form button:disabled{opacity:.6;cursor:wait}',
    '.ijv-form .ijv-hp{display:none!important}',
    '.ijv-form .ijv-legal{margin:0;font-size:10.5px;line-height:1.45;color:#8a8a8a}',
    '.ijv-form .ijv-legal a{color:var(--ijv-primary);text-decoration:underline}',
    '.ijv-cal{background:linear-gradient(135deg,var(--ijv-primary),var(--ijv-secondary));border-radius:12px;padding:16px;margin:8px 0;align-self:stretch;color:#fff}',
    '.ijv-cal p{margin:0 0 10px;font-size:13.5px;line-height:1.45}',
    '.ijv-cal a{display:inline-block;background:#fff;color:var(--ijv-primary);font-weight:700;padding:9px 16px;border-radius:8px;text-decoration:none;font-size:13.5px}',
    '.ijv-input{display:flex;gap:8px;padding:12px;border-top:1px solid #E8E8E8;background:#fff;align-items:flex-end}',
    '.ijv-input textarea{flex:1;border:1px solid #D8D8D8;border-radius:12px;padding:10px 12px;font-family:inherit;font-size:14px;resize:none;max-height:100px;min-height:40px;color:var(--ijv-text)}',
    '.ijv-input textarea:focus{outline:none;border-color:var(--ijv-primary)}',
    '.ijv-input button{background:var(--ijv-primary);color:#fff;border:0;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.ijv-input button:disabled{opacity:.5;cursor:not-allowed}',
    '.ijv-input button svg{width:18px;height:18px;fill:#fff}',
    '.ijv-foot{padding:8px 12px 10px;background:#fff;border-top:1px solid #E8E8E8;text-align:center;font-size:10.5px;color:#8a8a8a;line-height:1.5}',
    '.ijv-foot a{color:var(--ijv-primary);text-decoration:none;font-weight:600}',
    '.ijv-foot a:hover{text-decoration:underline}',
    '.ijv-foot .ijv-foot-powered{display:block;margin-top:3px;font-size:10px;color:#9a9a9a}',
    '.ijv-foot .ijv-foot-powered a{color:#9a9a9a;font-weight:500}',
    '.ijv-toast{position:absolute;top:70px;left:50%;transform:translateX(-50%);background:var(--ijv-secondary);color:#fff;padding:8px 14px;border-radius:8px;font-size:12.5px;opacity:0;transition:opacity .2s;pointer-events:none}',
    '.ijv-toast.ijv-show{opacity:.95}',
    /* Móvil (regla #133): `100dvh`, no `100vh`. En Safari iOS `100vh` es el
     * viewport GRANDE (con la barra del navegador retraída), así que con la barra
     * visible —o con el teclado— el input y el footer quedaban tapados. Cada
     * propiedad va dos veces: primero el fallback (`100vh`, `16px`) para
     * navegadores sin dvh/max()/env(), y después la buena, que la pisa donde
     * existe. Como el launcher se oculta al abrir, el panel baja hasta 16px del
     * borde (o el safe-area del iPhone) en vez de reservarle los 80px. */
    '@media (max-width:480px){'
      + '.ijv-root{width:calc(100vw - 16px);right:8px;'
      + 'bottom:16px;height:calc(100vh - 40px);max-height:calc(100vh - 40px);'
      + 'bottom:max(16px,env(safe-area-inset-bottom));'
      + 'height:calc(100dvh - 16px - max(16px,env(safe-area-inset-bottom)));'
      + 'max-height:calc(100dvh - 16px - max(16px,env(safe-area-inset-bottom)))}'
      + '.ijv-launcher{bottom:16px;bottom:max(16px,env(safe-area-inset-bottom));right:16px;height:54px;padding:0 18px}'
      + '.ijv-launcher img{height:32px!important}'
      + '}'
  ].join('');

  /* ---------------- Render de la UI ---------------- */
  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  var launcher = document.createElement('button');
  launcher.className = 'ijv-launcher';
  launcher.setAttribute('aria-label', 'Abrir chat ' + CFG.clientName);
  launcher.innerHTML = '<img src="' + escapeHtml(CFG.logoUrl) + '" alt="' + escapeHtml(CFG.clientName) + '" />';
  document.body.appendChild(launcher);

  var root = document.createElement('div');
  root.className = 'ijv-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Chat de ' + CFG.clientName);
  root.innerHTML =
    '<div class="ijv-head">' +
      '<img src="' + escapeHtml(CFG.logoUrl) + '" alt="' + escapeHtml(CFG.clientName) + '" />' +
      '<div>' +
        '<div class="ijv-title">' + escapeHtml(CFG.clientName) + '</div>' +
        '<div class="ijv-sub">' + escapeHtml(CFG.headerSubtitle) + '</div>' +
      '</div>' +
      '<div class="ijv-actions">' +
        '<button type="button" class="ijv-reset" aria-label="Reiniciar conversación" title="Nueva conversación">⟳</button>' +
        '<button type="button" class="ijv-close" aria-label="Cerrar chat" title="Cerrar">✕</button>' +
      '</div>' +
      '<div class="ijv-toast">Conversación reiniciada</div>' +
    '</div>' +
    '<div class="ijv-msgs" aria-live="polite" aria-atomic="false"></div>' +
    '<div class="ijv-input">' +
      '<textarea rows="1" maxlength="2000" placeholder="Escribe tu mensaje…" aria-label="Escribe tu mensaje"></textarea>' +
      '<button type="button" class="ijv-send" aria-label="Enviar">' +
        '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="ijv-foot">' +
      'Al usar este chat aceptas la <a href="' + escapeHtml(CFG.privacyUrl) + '" target="_blank" rel="noopener">política de privacidad</a> de ' + escapeHtml(CFG.clientName) + '.' +
      '<span class="ijv-foot-powered"><a href="https://ijvagency.com/" target="_blank" rel="noopener">Powered by IJV</a></span>' +
    '</div>';
  document.body.appendChild(root);

  /* Logo con fallback: si la URL del logo falla (típico en demos con dominio
   * ficticio, o si el sitio del cliente mueve el archivo), el launcher cae a un
   * ícono de chat y el header oculta la imagen rota — nunca se ve un img roto. */
  var CHAT_ICON = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M12 3C6.48 3 2 6.94 2 11.5c0 2.3 1.13 4.38 2.97 5.88L4 21l4.02-1.6c1.2.38 2.5.6 3.98.6 5.52 0 10-3.94 10-8.5S17.52 3 12 3z"/></svg>';
  var lImg = launcher.querySelector('img');
  if (lImg) {
    var lFallback = function () { launcher.innerHTML = CHAT_ICON; };
    lImg.onerror = lFallback;
    if (lImg.complete && lImg.naturalWidth === 0) lFallback();
  }
  var hImg = root.querySelector('.ijv-head img');
  if (hImg) {
    /* setProperty con `important`, no `style.display = 'none'` a secas: la regla
     * `.ijv-head img{display:block!important}` (blindaje contra el CSS global del
     * sitio) le ganaba al inline sin prioridad y el chip quedaba visible con el
     * ícono de imagen rota adentro — justo lo que la regla #95 existe para evitar.
     * Misma lección que prepFoto(). Visto en el QA del 2026-09-17. */
    var hFallback = function () {
      if (hImg.style.setProperty) hImg.style.setProperty('display', 'none', 'important');
      else hImg.style.display = 'none';
    };
    hImg.onerror = hFallback;
    if (hImg.complete && hImg.naturalWidth === 0) hFallback();
  }

  var $msgs  = root.querySelector('.ijv-msgs');
  var $input = root.querySelector('textarea');
  var $send  = root.querySelector('.ijv-send');
  var $close = root.querySelector('.ijv-close');
  var $reset = root.querySelector('.ijv-reset');
  var $toast = root.querySelector('.ijv-toast');

  var isOpen = false;
  var isBusy = false;
  var welcomed = false;

  /* Regla #19: rAF obligatorio — sin él Safari/iOS deja el scroll anclado
   * arriba mientras el bot escribe. */
  function scrollToBottom() {
    $msgs.scrollTop = $msgs.scrollHeight;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { $msgs.scrollTop = $msgs.scrollHeight; });
    }
  }
  /* Regla #133: el hilo con SOLO el welcome se lee desde la primera línea. Si
   * welcome + botones superan el alto de .ijv-msgs, scrollToBottom() abre el
   * chat con la primera línea y media del saludo comida. Se ancla arriba SOLO
   * en ese estado — con historial restaurado o con respuestas nuevas se sigue
   * bajando al fondo. El rAF se registra DESPUÉS de los de scrollToBottom
   * (mismo frame, orden de registro), así el último en correr es este y
   * Safari/iOS no lo pisa (regla #19). */
  function scrollToTop() {
    $msgs.scrollTop = 0;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { $msgs.scrollTop = 0; });
    }
  }
  function showToast(t) {
    $toast.textContent = t;
    $toast.classList.add('ijv-show');
    setTimeout(function () { $toast.classList.remove('ijv-show'); }, 1800);
  }
  function pushUser(text, opts) {
    var div = document.createElement('div');
    div.className = 'ijv-msg ijv-user';
    div.textContent = text;
    $msgs.appendChild(div);
    scrollToBottom();
    if (!opts || !opts.skipSave) saveMessage('user', text);
  }
  function pushBot(text, opts) {
    opts = opts || {};
    var div = document.createElement('div');
    div.className = 'ijv-msg ijv-bot';
    $msgs.appendChild(div);
    if (!opts.skipSave) saveMessage('bot', text);
    if (CFG.typewriter && !opts.instant) {
      typewrite(div, text);
    } else {
      renderBot(div, text);
      scrollToBottom();
    }
    return div;
  }
  /* Typewriter: re-parsea markdown en cada step y scrollea con rAF (regla #19).
   * Las líneas de foto NO se tipean: se tipea solo la prosa (sinFotos) y las
   * imágenes aparecen enteras al cerrar el mensaje. Si se tipearan, cada step
   * recrearía el <img> (innerHTML se reemplaza completo 30 veces por segundo)
   * y eso son decenas de descargas y parpadeo; además el usuario vería la URL
   * cruda letra por letra. Sin fotos, sinFotos() devuelve el texto intacto y
   * esto se comporta exactamente como siempre. */
  function typewrite(div, fullText) {
    var typed = sinFotos(fullText);
    var i = 0;
    var step = Math.max(1, Math.round(CFG.typewriterCps / 30));
    var timer = setInterval(function () {
      i += step;
      if (i >= typed.length) {
        clearInterval(timer);
        renderBot(div, fullText);
        scrollToBottom();
        return;
      }
      div.innerHTML = parseMd(typed.slice(0, i));
      scrollToBottom();
    }, 33);
  }
  function pushCTA(buttons) {
    var row = document.createElement('div');
    row.className = 'ijv-cta';
    buttons.forEach(function (b) {
      var p = document.createElement('button');
      p.type = 'button';
      p.className = 'ijv-pill';
      p.textContent = b.label;
      p.addEventListener('click', b.onClick);
      row.appendChild(p);
    });
    $msgs.appendChild(row);
    scrollToBottom();
    return row;
  }
  function showTyping() {
    var t = document.createElement('div');
    t.className = 'ijv-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    $msgs.appendChild(t);
    scrollToBottom();
    return t;
  }
  function removeEl(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  /* ---------------- Call al webhook del agente ---------------- */
  function callAgent(message, attempt) {
    attempt = attempt || 0;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, CFG.timeoutMs);
    return fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        sessionId: getSessionId(),
        origin: window.location.origin,
        channel: 'web'
      }),
      signal: ctrl.signal
    })
    .then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .catch(function (err) {
      clearTimeout(timer);
      if (attempt < CFG.maxRetries) return callAgent(message, attempt + 1);
      throw err;
    });
  }

  /* ---------------- Lead form (honeypot anti-bot) ---------------- */
  function showLeadForm(prefill) {
    if ($msgs.querySelector('.ijv-form')) { scrollToBottom(); return; }
    prefill = prefill || {};
    var form = document.createElement('form');
    form.className = 'ijv-form';
    form.innerHTML =
      '<h4>Déjanos tus datos y te contactamos</h4>' +
      '<input type="text" name="nombre" placeholder="Nombre completo *" required value="' + escapeHtml(prefill.nombre || '') + '">' +
      '<input type="email" name="email" placeholder="Correo electrónico *" required value="' + escapeHtml(prefill.email || '') + '">' +
      '<input type="tel" name="telefono" placeholder="Teléfono / WhatsApp (opcional)" value="' + escapeHtml(prefill.telefono || '') + '">' +
      '<textarea name="consulta" rows="2" placeholder="Cuéntanos brevemente (opcional)"></textarea>' +
      '<input type="text" name="hp" class="ijv-hp" tabindex="-1" autocomplete="off">' +
      /* Línea legal del formulario: el footer del chat enlaza la política, pero el
       * formulario es donde el usuario ENTREGA sus datos — ahí tiene que estar el
       * enlace (regla #14, misma lógica) y el recordatorio de qué NO mandar por
       * este medio. La segunda frase se ajusta al vertical: un prestador de salud
       * (legal.datos_salud) pide explícitamente no enviar estudios clínicos. */
      '<p class="ijv-legal">Al enviar aceptas el tratamiento de tus datos conforme al ' +
        '<a href="' + escapeHtml(CFG.privacyUrl) + '" target="_blank" rel="noopener">aviso de privacidad</a>. ' +
        'No compartas por este medio información sensible ni documentos personales.</p>' +
      '<button type="submit">Enviar</button>';
    $msgs.appendChild(form);
    scrollToBottom();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      var fd = new FormData(form);
      fetch(CFG.leadsWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: fd.get('nombre'),
          email: fd.get('email'),
          telefono: fd.get('telefono'),
          consulta: fd.get('consulta'),
          hp: fd.get('hp'),
          session_id: getSessionId(),
          origin: window.location.origin
        })
      })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r; })
      .then(function () {
        removeEl(form);
        pushBot('¡Listo! Recibimos tus datos. El equipo de ' + CFG.clientName + ' te contacta muy pronto.', { instant: true });
        afterLeadCTA();
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Reintentar';
        pushBot('Hubo un problema al enviar. Por favor intenta de nuevo.', { instant: true });
      });
    });
  }

  /* Regla #20: el usuario que dejó datos está CALIENTE — no cerrar con
   * "te escribimos pronto" seco: CTA inmediato a Calendly / WhatsApp. */
  function afterLeadCTA() {


    pushCTA([
      { label: 'Escribir por WhatsApp', onClick: function () { window.open(CFG.whatsappLink, '_blank'); } }
    ]);

  }

  /* ---------------- Intent helpers ---------------- */

  function wantsWhatsapp(text) {
    return /\b(wh?at?s?app|wsp|whats|wasap)\b/i.test(text || '');
  }

  function wantsContactForm(text) {
    return /\b(lead|llama(me|r)|mis datos|dejo mis datos|d[ée]jame datos|quiero que me contacten)\b/i.test(text || '');
  }

  /* ---------------- Envío de mensajes ---------------- */
  function send(text) {
    text = (text || '').trim();
    if (!text || isBusy) return;
    pushUser(text);
    $input.value = '';
    autoSize();
    isBusy = true;
    $send.disabled = true;

    var typing = showTyping();

    callAgent(text)
      .then(function (data) {
        removeEl(typing);
        var reply = (data && (data.output || data.response || data.text)) || 'Disculpa, no pude procesar tu mensaje. ¿Puedes reformularlo?';
        pushBot(reply);

        var showsForm = (data && (data.lead_intent || data.showForm)) || wantsContactForm(text);
        var wantsContactBtn = /\b(equipo|contactar|asesor|coordinar)\b/i.test(reply);
        var ctas = [];

        if ((data && data.whatsapp) || wantsWhatsapp(text)) {
          ctas.push({ label: 'WhatsApp ' + CFG.whatsappNumber, onClick: function () { window.open(CFG.whatsappLink, '_blank'); } });
        }

        /* Regla #18: botón persistente, NUNCA auto-open que tape la respuesta */
        if (wantsContactBtn && !showsForm) {
          ctas.push({ label: 'Contactar al equipo', onClick: function () { showLeadForm({ nombre: data && data.nombre, email: data && data.email, telefono: data && data.telefono }); } });
        }
        if (ctas.length) pushCTA(ctas);
        if (showsForm) showLeadForm({ nombre: data && data.nombre, email: data && data.email, telefono: data && data.telefono });
      })
      .catch(function () {
        removeEl(typing);
        pushBot('Ups, tuve un problema de conexión. ¿Puedes intentarlo de nuevo? También puedes escribirnos por WhatsApp al **' + CFG.whatsappNumber + '**.', { instant: true });

        pushCTA([{ label: 'WhatsApp', onClick: function () { window.open(CFG.whatsappLink, '_blank'); } }]);

      })
      .then(function () {
        isBusy = false;
        $send.disabled = false;
        $input.focus();
      });
  }

  /* ---------------- Auto-resize textarea ---------------- */
  function autoSize() {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 100) + 'px';
  }
  $input.addEventListener('input', autoSize);
  $input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send($input.value);
    }
  });
  $send.addEventListener('click', function () { send($input.value); });

  /* ---------------- Welcome + quick buttons ---------------- */
  function showWelcome() {
    /* El welcome NO pasa por send(): jamás dispara detección de lead (regla #18) */
    pushBot(CFG.welcomeMessage, { instant: true, skipSave: true });
    if (QUICK_BUTTONS.length) {
      pushCTA(QUICK_BUTTONS.map(function (b) {
        return { label: b.label, onClick: function () { send(b.mensaje); } };
      }));
    }
    /* Hilo con solo el welcome: desde la primera línea, no desde el final (regla #133). */
    scrollToTop();
  }
  function restoreHistory() {
    var hist = loadMessages();
    if (!hist.length) return false;
    hist.forEach(function (m) {
      if (m.role === 'user') pushUser(m.text, { skipSave: true });
      else pushBot(m.text, { instant: true, skipSave: true });
    });
    return true;
  }

  /* ---------------- Open / close / reset ---------------- */
  function openChat() {
    isOpen = true;
    root.classList.add('ijv-open');
    launcher.style.display = 'none';
    if (!welcomed) {
      welcomed = true;
      getSessionId(); /* aplica TTL antes de restaurar */
      if (!restoreHistory()) showWelcome();
    }
    setTimeout(function () { $input.focus(); }, 200);
  }
  function closeChat() {
    isOpen = false;
    root.classList.remove('ijv-open');
    launcher.style.display = 'flex';
  }
  launcher.addEventListener('click', openChat);
  $close.addEventListener('click', closeChat);
  $reset.addEventListener('click', function () {
    resetSession();
    $msgs.innerHTML = '';
    showToast('Conversación reiniciada');
    setTimeout(showWelcome, 250);
  });

  /* ---------------- API pública opcional ---------------- */
  window.khiyaAgent = {
    open:  openChat,
    close: closeChat,
    reset: function () { $reset.click(); },
    send:  send
  };
})();
