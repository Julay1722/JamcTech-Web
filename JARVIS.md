# 🎩 JARVIS — Equipo de Agentes de JAMC's Tech

> **Documento de diseño vivo.** Aquí está TODO el plan del sistema de agentes, para no
> tener que buscar en el chat. Se actualiza a medida que avanzamos.
> Última actualización: 2026-06-02.

---

## 1. La visión

Julio = **CEO**. Un equipo de agentes de IA (solo-lectura) que son sus **ojos y oídos**
del negocio, le dan insights, y con los que puede **conversar** (no solo recibir reportes).
Operación de una persona → los agentes lo multiplican.

---

## 2. Decisiones ya tomadas

| Decisión | Elección | Estado |
|---|---|---|
| Permisos de los agentes | **Solo leer y avisar** (no modifican data) | ✅ Fijo |
| Cara / punto de interacción (v1) | **Discord** (servidor privado) | ✅ Fijo |
| Dónde corre el cerebro | **PC de Julio, 24/7** | ✅ Fijo |
| Orquestador / diseño visual | **n8n** (self-host en la PC) | ✅ Fijo |
| Frecuencia del reporte | **Semanal** (+ chat cuando quiera) | ✅ Fijo |
| Cerebro (LLM) | **Google Gemini (GRATIS, sin tarjeta)** para v1 · swappable a Claude/Ollama después | ✅ Fijo |
| Fuente de data | **Supabase** (llave de solo-lectura `jarvis_readonly`) | ✅ Creada (falta que Julio le ponga password) |

### Pendiente por decidir
- Canales de Discord: ¿uno solo `#jarvis` o uno por agente? (recomendado: **uno solo**)
- Tope de gasto mensual de la Claude API (sugerido: US$15/mes)
- Cuándo corre el reporte semanal (sugerido: **domingo 8pm**)

---

## 3. Arquitectura

```
   TÚ escribes en  ──►  DISCORD (#jarvis, servidor privado)
                              │
                              ▼
        ┌──────────────  n8n  (corre en tu PC 24/7)  ──────────────┐
        │                                                          │
        │   [Discord Trigger] → [AI Agent: JARVIS (Claude)] → [Discord Response]
        │                              │                           │
        │          ┌───────────────────┼───────────────────┐      │
        │          ▼                   ▼                    ▼      │
        │   Tool: Postgres        Tool: HTTP         Sub-agentes:  │
        │   (Supabase SOLO-       (Web search,       📦 Inventario │
        │    LECTURA)              precios Temu)     💰 Contador    │
        │                                            📈 Ventas      │
        │                                                          │
        │   [Schedule: domingo 8pm] → Reporte CEO → Discord #reportes
        └──────────────────────────────────────────────────────────┘
```

- **n8n** = el orquestador visual (el "tablero" donde ves y editas el diseño).
- **Claude** = el cerebro que razona y decide qué consultar.
- **Supabase** = la data, en **solo-lectura** (imposible romper nada).
- **Web** = para datos externos (comparar precios, etc.).

---

## 4. El equipo de agentes (el "C-suite")

| Agente | Rol | Qué analiza |
|---|---|---|
| 🎩 **Jarvis** | Orquestador / Chief of Staff | Recibe tus preguntas, delega al especialista, sintetiza |
| 📦 **Inventario** | Qué reponer, qué NO pedir | Stock, rotación, capital muerto, candidatos a SKU nuevo |
| 💰 **Contador (CFO)** | Salud financiera | Capital, deuda, márgenes, cashflow, estrategias de deuda |
| 📈 **Ventas / Growth** | Crecimiento | Tendencias, top productos, márgenes, qué empujar |

En n8n cada especialista es un **sub-workflow reutilizable** (un grupo de nodos).
Expandir el equipo = arrastrar un sub-workflow nuevo.

---

## 5. Experiencia en Discord

**Servidor privado "JAMC's Tech HQ"** (solo Julio).

| Canal | Para qué |
|---|---|
| `#jarvis` | Chat principal. Le hablas normal y te responde |
| `#reportes` | Reporte CEO semanal automático (domingo 8pm) |
| `#alertas` | (opcional) avisos puntuales (stock crítico, día de pago) |

- **Comandos rápidos:** `/contador`, `/inventario`, `/ventas`, `/deuda`, `/reporte`
- **Botones** debajo de las respuestas: `[Combinar A+C]` `[Profundizar]` `[Otra opción]`
- **Hilos (threads)** para discutir un tema a fondo sin perder el contexto

---

## 6. Lo que hay que preparar

| # | Tarea | Quién | Estado |
|---|---|---|---|
| 1 | Instalar **n8n** en la PC (self-host) | Yo guío, tú copias/pegas | ⬜ |
| 2 | Crear servidor Discord + **bot token** | Tú | ✅ |
| 3 | **Llave Gemini GRATIS** (Google AI Studio, sin tarjeta) | Tú | ⬜ ← aquí vamos |
| 4 | **Llave Supabase solo-lectura** (rol `jarvis_readonly`) | Yo | ✅ (falta password) |
| 5 | Armar el workflow en n8n (el hago yo) | Yo + tú importas | ⬜ |

---

## 7. Costo

| Cosa | Costo |
|---|---|
| n8n (community, self-host) | **Gratis** |
| Discord | **Gratis** |
| Supabase | **Gratis** (plan actual) |
| **Gemini API** | **Gratis** (free tier de Google, sin tarjeta) |
| PC 24/7 | Solo electricidad |
| **TOTAL EXTRA** | **US$0/mes** ✅ |

---

## 8. Seguridad

- Bot **solo en tu servidor privado** — nadie más entra.
- DB en **solo-lectura** (rol `jarvis_readonly` con SELECT únicamente).
- Llaves (Discord, Claude, DB) en variables/credenciales de n8n — **nunca en GitHub**.

---

## 9. Roadmap por fases

| Fase | Qué logras | Esfuerzo |
|---|---|---|
| **0. Diseño** | Este documento + decisiones | ✅ listo |
| **1a. Cerebro vivo** | n8n + Gemini + Chat Trigger → Jarvis responde en n8n | ✅ **HECHO (2026-06-02)** |
| **1b. Personalidad + DB** | Jarvis con persona + leyendo Supabase (tool Postgres read-only) | ✅ **HECHO (2026-06-03)** |
| **1c. Cara Slack** | Jarvis responde cuando lo @mencionas en Slack (Slack Trigger → Jarvis → Send message) | ✅ **HECHO (2026-06-03)** — pivot de Discord a Slack |
| **2. Equipo** | ✅ **EQUIPO REAL COMPLETO (2026-06-03)** — 3 sub-agentes separados (AI Agent Tool) conectados al Tool de Jarvis, cada uno con su propio Gemini flash-lite + su propio Postgres (executeQuery + $fromAI): 💰 Contador, 📦 Inventario (Tool1), 📈 Ventas (Tool2). Jarvis delega segun la pregunta (Contador probado exec #23). Más el panel en el prompt como respaldo. Ojo: en Gemini free, consultar a los 3 a la vez gasta varias llamadas — si pregunta muy seguido puede ralentizarse. | ✅ 3/3 real |
| **3. Reporte auto** | ✅ **HECHO (2026-06-03)** — workflow "Reporte Semanal CEO" (Schedule domingo 8pm → Jarvis → Slack). Probado: posteó el reporte con cifras reales | ✅ |
| **4. Futuro** | Sub-agentes con persona propia · canal #reportes separado · cara de WhatsApp · que pueda *actuar* (con candados) | Después |

### Receta para agregar un sub-agente especialista (ya probada con el Contador)
En el workflow de Jarvis, por cada especialista (Inventario, Ventas):
1. Clic en el **"+" del conector "Tool" de Jarvis** → busca/elige **"AI Agent Tool"**.
2. **Description**: qué hace (ej. Inventario: "Consulta al encargado de inventario: stock por SKU, qué reponer, capital muerto, rotación").
3. **Prompt**: dale al botón ✨ → queda "Defined automatically by the model".
4. **Add Option → System Message**: persona + queries (Inventario usa la Q5 de stock; Ventas la Q2 ventas/mes y Q4 top productos). NO inventar columnas.
5. Cierra. En el canvas aparece el nodo conectado al Tool de Jarvis.
6. En el nodo nuevo: **"+" de Chat Model** → "Google Gemini Chat Model" → cambia el Model a **gemini-2.5-flash-lite** (la credencial se autoselecciona).
7. **"+" de Tool** → busca **"Postgres Tool"** → Operation = **Execute Query** → Query = `{{ $fromAI('sql', 'Consulta SQL SELECT a ejecutar', 'string') }}` (la credencial Postgres se autoselecciona).
8. Cierra y **Publish**. Probar en Slack con una pregunta del área.

**Segundo workflow — "Reporte Semanal CEO" (id R3MlX91GCvtcYprs):** Schedule (semanal, domingo 20:00) → Jarvis (prompt fijo "genera reporte" + Gemini + Postgres tool + Memory key fija "reporte-semanal") → Send a message (canal fijo `C0B7QG8RAM9`, texto `{{ $json.output }}`). Publicado/activo. Corre solo mientras n8n esté arriba (lo está, 24/7).

---

## 10. Notas técnicas

- **n8n nodos clave:** Discord Trigger, AI Agent (LangChain), Anthropic Chat Model,
  Postgres (read-only), HTTP Request, Schedule Trigger, Execute Workflow (sub-agentes).
- **Conexión a Supabase:** string de conexión Postgres con el rol `jarvis_readonly`.
- **MCP de n8n:** no hay un conector de n8n en la sesión de Claude actual, así que el
  diseño/armado se hace con workflows importables (JSON) + guía. Si en el futuro instalas
  un MCP/API de n8n, Claude podría inspeccionar/ayudar dentro de tu n8n directamente.
- El **dashboard actual (V17)** sigue independiente; Jarvis solo LEE la misma Supabase.

---

## 11. Estado real del montaje (2026-06-03) — ¡Jarvis vivo en Slack!

**Pipeline funcionando:** Slack (@mención) → cloudflared (túnel) → n8n → Jarvis (Gemini + Postgres read-only + Memory) → respuesta en Slack.

**Piezas concretas:**
- **n8n** self-host v2.23.2 en la PC (`n8n start`). Workflow `oSYYiyusqVdLbE7w` ("My workflow").
  Nodos: **Slack Trigger** (Bot/App Mention, Watch Whole Workspace) → **Jarvis** (AI Agent) → **Send a message**.
  Sub-nodos de Jarvis: Google Gemini Chat Model (`gemini-2.5-flash-lite`), Simple Memory, Postgres tool (executeQuery a Supabase read-only).
- **Expresiones clave** (el Slack Trigger entrega los campos al top level):
  - Prompt de Jarvis: `{{ $json.text }}`
  - Canal del Send: `{{ $('Slack Trigger').item.json.channel }}`
  - Texto del Send: `{{ $json.output }}`
  - **Memory → Session ID = "Define below" + Key = `{{ $('Slack Trigger').item.json.channel }}`** (memoria por canal). ← este faltaba y rompía todo con "No session ID found".
- **Túnel público FIJO (24/7):** **ngrok** con dominio estático gratis **`sneer-snowstorm-flame.ngrok-free.dev`** (permanente, no cambia). Binario actualizado en `C:\Users\coco2\ngrok-latest\ngrok.exe` (v3.39.6; el de winget 3.3.1 era muy viejo, la cuenta exige ≥3.20). Authtoken ya configurado por Julio.
  - El túnel integrado de n8n (`--tunnel`) está **MUERTO** en 2.x. cloudflared quick-tunnel sirve pero la URL cambia en cada reinicio — por eso pasamos a ngrok dominio fijo.
- **Arranque automático:** `C:\Users\coco2\jarvis_start.ps1` (levanta n8n + ngrok si no corren) + lanzador en la carpeta de Inicio de Windows (`...\Startup\jarvis_start.cmd`). Corre al iniciar sesión.
- **Slack:** app "Jamc Tech HQ", Event Subscriptions → Request URL = `https://sneer-snowstorm-flame.ngrok-free.dev/webhook/284394bb-caea-4ab0-9424-1831700f8575/webhook`, evento `app_mention`. El bot debe estar **invitado al canal** (`/invite @Jarvis`) o no llega el evento.
- **Prompt de Jarvis:** system message con esquema EXACTO + 5 queries probadas (Q1 resumen, Q2 ventas/mes, Q3 deuda, Q4 top productos, Q5 stock). Ojo: `cuentas` no tiene saldo, `skus` no tiene stock, `prestamos` no tiene saldo/estado — todo calculado. Cifras de referencia (jun 2026): capital ≈ RD$63,612 · deuda ≈ RD$39,841 · ganancia total ≈ RD$161,903 · mayo fue el mes fuerte (ganancia RD$34,471).

### ⚠️ Notas
1. La **sesión del editor de n8n** se vence (browserId) — si autosave falla con "Unauthorized", recargar y volver a hacer login. (No afecta al webhook de producción.)
2. Para diagnosticar ejecuciones sin depender del navegador: `node C:\Users\coco2\n8n_exec.js` (lee la DB SQLite de n8n y muestra la última ejecución + error).
3. Verificar que el túnel llega: `Invoke-WebRequest https://sneer-snowstorm-flame.ngrok-free.dev/healthz -Headers @{'ngrok-skip-browser-warning'='1'}` debe dar `{"status":"ok"}`.

## 12. Equipo real de 3 sub-agentes + memoria compartida (2026-06-03)

**Jarvis ya NO es un solo cerebro con 3 personalidades — son 4 agentes reales.** En el workflow `oSYYiyusqVdLbE7w`, Jarvis (orquestador) tiene como **tools** 3 sub-agentes AI Agent independientes, cada uno con su propio modelo Gemini y su propia conexión a la DB:

| Sub-agente (nodo) | Rol | Sub-nodos propios |
|---|---|---|
| **Contador (CFO)** | Finanzas: deuda, cash, cuotas, márgenes | `Gemini - Contador` (flash-lite) + `DB - Contador` (Postgres executeQuery) |
| **Inventario** | Stock, CPP, lotes, qué pedir | `Gemini - Inventario` + `DB - Inventario` |
| **Ventas** | Revenue, top SKUs, tendencias, estrategia | `Gemini - Ventas` + `DB - Ventas` |

- Nombres de nodos **descriptivos** (no "AI Agent1/Postgres2") para que si uno se rompe se sepa cuál es y qué hace.
- Cada `DB - X` usa `Query = {{ $fromAI('sql', 'Consulta SQL SELECT a ejecutar', 'string') }}` (el sub-agente escribe su propio SQL).
- Jarvis delega: cuando Julio pide algo de finanzas/stock/ventas, Jarvis llama al especialista y sintetiza la respuesta. (Confirmado en ejecución #23.)

**Memoria compartida persistente — tabla `agente_memoria`** (Supabase, migración `crear_agente_memoria_compartida`):
- Columnas: `id, creado_por, tipo, tema, contenido, vigente, created_at`. Tipos: `estrategia, plan, alerta, nota`.
- `jarvis_readonly` tiene **SELECT, INSERT, UPDATE** sobre esta tabla (excepción a su rol read-only — solo esta tabla).
- Todos los agentes la **leen antes de estrategiar** (`WHERE vigente = true`) y **escriben** planes/alertas con su propio nombre. Así Ventas recuerda una estrategia de hace meses, y el CFO puede dejar una **alerta de deuda** que Inventario lee antes de pedir stock (evita "deuda alta + cash bajo + Inventario pidiendo mercancía").
- Para "olvidar" una nota: `UPDATE agente_memoria SET vigente=false WHERE id=...` (no se borra, queda histórico).

**REGLA #0 anti-invento (en los 4 agentes):** el free tier de Gemini flash-lite es débil en cadenas multi-hop y llegó a **inventar cifras** (ej. "deuda de RD$10.000.000", préstamos que no existen). Por eso cada system message arranca con: *NUNCA inventes cifras/nombres de préstamos que no vengan de una query real; la deuda real ronda RD$39,841 (Coop, Scotia, Qik, BHD); si un dato no se consultó, dilo; SIEMPRE da la respuesta final completa, nunca solo "déjame revisar".* Si vuelve a alucinar pese a esto, el siguiente paso es subir de modelo (flash normal) o reducir la cadena.

### Pendiente / próximos pasos
- **Un canal de Slack por agente** (`#finanzas`, `#inventario`, `#ventas`): Julio crea los canales + invita al bot; luego se agrega un nodo Switch por `channel` que rutea al especialista correcto.
- **Agente de sourcing Alibaba/AliExpress** (investigar precio/disponibilidad): vía web search gratis o RapidAPI (pago). Sin decidir.
