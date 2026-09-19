# Agente de Pre-Autorización Quirúrgica

> hackIAthon 2025 · Viamatica / ADEN · Panamá — Reto 1

Sistema inteligente que automatiza la decisión de pre-autorización de cirugías en segundos, eliminando la espera de horas o días que sufre el paciente hoy.

## Demo

🌐 **[https://gui-vic.vercel.app/](https://gui-vic.vercel.app/)**

## Cómo funciona

1. El usuario ingresa su cédula y sube dos documentos: **póliza** + **informe médico** (PDF o imagen).
2. El backend valida los archivos **antes** de llamar a la IA.
3. La IA (Groq + Qwen VL) extrae los campos clave, cruza cobertura, exclusiones y período de carencia, y devuelve un veredicto estructurado en JSON.
4. El backend **recalcula el veredicto con reglas propias** y marca el caso como "para revisión" si difiere de la IA.
5. Se detectan duplicados (por folio o señales combinadas) antes de guardar.
6. El resultado se almacena en Notion junto con los documentos originales.
7. El paciente puede consultar su historial ingresando cédula + número de póliza.

**Veredictos posibles:** `preaprobado` | `documentos_faltantes` | `rechazado`

## Documentos de prueba

En la carpeta `casos/` de este repositorio vas a encontrar documentos de ejemplo (una póliza y un informe médico) para probar el sistema de pre-autorización. 

## Stack técnico

| Componente | Tecnología |
|---|---|
| Frontend + Backend | Next.js 15 (App Router + API Routes) |
| IA / OCR | Groq API · Qwen VL |
| Base de datos | Notion API |
| Hosting | Vercel |
| Estilos | Tailwind CSS |

## Estructura del proyecto

```
src/
├── app/
│   ├── page.tsx               # Formulario principal + estados
│   └── api/
│       ├── analyze/route.ts   # POST — flujo completo de análisis
│       └── history/route.ts   # GET  — historial por cédula + póliza
├── components/
│   ├── ResultCard.tsx         # Pantalla de resultado
│   └── HistoryPanel.tsx       # Consulta de historial
├── lib/
│   ├── groq-client.ts         # Integración Groq + manejo de errores
│   ├── notion-client.ts       # Guardar / consultar casos en Notion
│   ├── validation.ts          # Validación de archivos y cédula
│   ├── cross-verify.ts        # Verificación cruzada del veredicto
│   ├── duplicate-detection.ts # Detección de duplicados
│   └── rate-limiter.ts        # Rate limiting por IP
└── types/index.ts             # Tipos del dominio
```

## Configuración local

```bash
# 1. Clonar el repo
git clone <url-del-repo>
cd agente-preautorizador/app

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus claves reales

# 4. Correr en desarrollo
npm run dev
```

## Variables de entorno

Ver `.env.example`. Las claves reales van **solo** en variables de entorno de Vercel (producción) o `.env.local` (desarrollo local). **Nunca en el repositorio.**

```
GROQ_API_KEY=
NOTION_API_KEY=
NOTION_DATABASE_ID=
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_MS=900000
```

## Configuración de Notion

La base de datos en Notion debe tener estas propiedades:

| Propiedad | Tipo |
|---|---|
| Título | Title |
| Cédula | Text |
| Número de Póliza | Text |
| Veredicto | Select (`preaprobado`, `documentos_faltantes`, `rechazado`) |
| Razón | Text |
| Procedimiento | Text |
| Médico/Centro | Text |
| Folio | Text |
| Fecha | Date |
| Sospechoso | Checkbox |
| Error | Checkbox |

## Seguridad

- Rate limiting por IP en el backend propio (no solo en Groq).
- Validación estricta de archivos **antes** de llamar a la IA.
- Sanitización de todo input del usuario antes de enviarlo a Notion.
- Validación de estructura y valores de la respuesta de la IA.
- Verificación cruzada del veredicto con reglas propias del backend.
- Mitigación de prompt injection: temperatura baja, formato JSON fijo, citar evidencia literal, validación de salida.
- Variables de entorno separadas del código.

## Herramientas de IA utilizadas

Ver `AI-TOOLS.md` para el detalle completo exigido por las bases del hackathon.

## Equipo

**GUI-VIC**
hackIAthon 2025 — Viamatica / ADEN · Panamá
