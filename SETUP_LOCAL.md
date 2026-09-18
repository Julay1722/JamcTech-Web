# Setup Local — Claude Code en tu PC

> Guía copiar-y-pegar para arrancar una **sesión local de Claude Code** con
> el dashboard de JAMC's Tech. Lee esto una vez; después es solo `git pull`.

Carpeta local: **`C:\Users\user1\Desktop\Jamc Webpage`**
Repo GitHub:   **github.com/Julay1722/jamcs-dashboard**
Branch de trabajo: **`JAMCClaudeV3.2`**

---

## 1. Requisitos (instalar una sola vez)

| Programa | Para qué | Cómo verificar |
|---|---|---|
| **Git** | bajar/subir código | `git --version` |
| **Node.js 18+** | correr el dashboard (Vite) | `node --version` |
| **Claude Code** | el asistente | `claude --version` |

Si falta Node: descarga la versión LTS de https://nodejs.org
Si falta Claude Code: https://claude.ai/code

---

## 2. Bajar el proyecto (primera vez)

Abre **PowerShell** y pega esto tal cual:

```powershell
cd "C:\Users\user1\Desktop"
git clone https://github.com/Julay1722/jamcs-dashboard.git "Jamc Webpage"
cd "Jamc Webpage"
git checkout JAMCClaudeV3.2
npm install
```

Esto deja el proyecto listo en `C:\Users\user1\Desktop\Jamc Webpage`.

---

## 3. Configurar el `.env` (una sola vez)

El dashboard corre sin `.env` (las credenciales de Supabase ya están en el
código). El `.env` solo hace falta para los **tests**. Para crearlo:

```powershell
copy .env.example .env
```

Luego abre `.env` y pon la clave real del usuario de test. (Si no vas a
correr tests, puedes saltarte este paso.)

---

## 4. Correr el dashboard

```powershell
npm run dev        # abre http://localhost:5173 (pide login Supabase)
```

Login del dueño: **jamctech17@gmail.com**

Otros comandos:

```powershell
npm run build      # genera dist/ (lo que se publica en Netlify)
npm run preview    # sirve el build como en producción
npm test           # smoke test Playwright (necesita .env)
```

---

## 5. Abrir Claude Code local

Dentro de la carpeta del proyecto:

```powershell
cd "C:\Users\user1\Desktop\Jamc Webpage"
claude
```

Al arrancar, Claude Code lee **automáticamente** el contexto del negocio:

- **`CLAUDE.md`** — contexto operacional (léelo primero)
- **`SCHEMA.md`** — estructura de la base de datos
- **`TODO.md`** — trabajo pendiente
- **`BUGS_DATOS.md`** — bugs de guardado conocidos
- **`.claude/skills/`** — reglas del negocio (jamc-reglas, jamc-sku,
  jamc-paridad, jamc-deploy). Claude las usa solas cuando tocas dinero,
  ventas, CPP, inventario, SKUs o deploy.

No tienes que copiarle nada: todo el contexto ya vive en el repo.

---

## 6. Flujo de trabajo (cada cambio)

```powershell
# 1. Antes de empezar, baja lo último
git pull origin JAMCClaudeV3.2

# 2. Trabaja con Claude Code (hace los cambios en los archivos)

# 3. Revisa qué cambió
git status
git diff

# 4. Guarda y sube
git add -A
git commit -m "descripción clara del cambio"
git push origin JAMCClaudeV3.2
```

> **Regla de oro:** todo el desarrollo va a la branch **`JAMCClaudeV3.2`**.
> No subir a otra branch sin decidirlo primero.

---

## 7. Si algo sale mal

| Problema | Solución |
|---|---|
| `npm run dev` falla | correr `npm install` de nuevo |
| "puerto 5173 ocupado" | cerrar la otra ventana o `npx kill-port 5173` |
| conflicto al hacer `git pull` | avisar a Claude: "tengo un conflicto de git" |
| la app no carga datos | revisar que hiciste login con jamctech17@gmail.com |
| perdí cambios locales | están en git mientras hayas hecho `commit`; si no, se perdieron |

---

## Resumen de un vistazo

1. `git pull origin JAMCClaudeV3.2` — traer lo último
2. `claude` — abrir el asistente y trabajar
3. `git add -A && git commit -m "..." && git push origin JAMCClaudeV3.2` — subir
