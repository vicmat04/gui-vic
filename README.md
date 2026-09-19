# Agente de Pre-Autorización Quirúrgica 🏥 | hackIAthon

Un sistema inteligente construido para automatizar y agilizar la validación de coberturas médicas y pre-autorizaciones quirúrgicas en tiempo real utilizando Inteligencia Artificial.

🔗 **Agente en producción:** [https://gui-vic.vercel.app/](https://gui-vic.vercel.app/)

## 🚀 Características Principales

- **Análisis de Documentos con IA:** Lectura automática de Pólizas de Seguro e Informes Médicos (soporta PDFs e imágenes).
- **Validación de Reglas de Negocio:** Cruce inteligente entre los procedimientos solicitados, la cobertura de la póliza, períodos de carencia y exclusiones médicas.
- **Veredicto Automático:** Emisión de dictámenes en tiempo real (Pre-aprobado, Faltan documentos o Rechazado).
- **Detección de Duplicados:** Si el paciente ya tiene un caso previo, lo detecta y muestra el veredicto anterior sin reprocesar.
- **Gestión Documental:** Almacenamiento seguro de casos, veredictos y archivos originales integrados directamente con **Notion API**.
- **Interfaz Accesible (a11y) y Responsiva:** UI construida con Next.js y TailwindCSS, optimizada para experiencia de usuario.

## 🛠️ Tecnologías y Arquitectura

| Capa | Tecnología |
|------|-----------|
| **Frontend** | Next.js 15 (App Router), React, TailwindCSS |
| **Backend (Serverless)** | Next.js Route Handlers (`/api/analyze`, `/api/history`) |
| **Motor de IA (Visión)** | `qwen/qwen3.8-27b` — extracción multimodal de PDFs e imágenes |
| **Motor de IA (Texto)** | `openai/gpt-oss-120b` — razonamiento lógico y cross-verification |
| **Base de Datos / CRM** | Notion API (Base de datos + File Upload API para adjuntos) |
| **Hosting** | Vercel (Serverless Functions) |

### Flujo del sistema

```
Usuario sube Cédula + Póliza (PDF/img) + Informe Médico (PDF/img)
  │
  ▼
/api/analyze (Route Handler)
  ├─ 1. Validación de archivos (tipo, tamaño ≤5MB)
  ├─ 2. Detección de duplicados (Notion query por cédula)
  ├─ 3. Extracción con IA Visión (Qwen 3.8-27B multimodal)
  ├─ 4. Validación de esquema del JSON extraído
  ├─ 5. Cross-verification con IA Texto (GPT-OSS-120B)
  ├─ 6. Guardado del caso en Notion (propiedades + archivos originales)
  └─ 7. Respuesta con veredicto al frontend
```

## 🗄️ Esquema de la Base de Datos en Notion

Para replicar el proyecto, creá una **base de datos en Notion** (tipo tabla) con las siguientes columnas exactas:

| Columna | Tipo en Notion | Descripción |
|---------|---------------|-------------|
| `Título` | **Title** | Se genera automáticamente: `cédula — procedimiento — fecha` |
| `Cédula` | **Rich text** | Número de cédula del paciente (ej: `8-999-1234`) |
| `Número de Póliza` | **Rich text** | Código de la póliza extraído del documento |
| `Veredicto` | **Select** | Opciones: `preaprobado`, `documentos_faltantes`, `rechazado` |
| `Razón` | **Rich text** | Fundamento del veredicto emitido por la IA |
| `Procedimiento` | **Rich text** | Procedimiento quirúrgico solicitado |
| `Médico/Centro` | **Rich text** | Nombre del médico o centro médico |
| `Folio` | **Rich text** | Número de folio del informe médico |
| `Fecha` | **Date** | Fecha del caso (formato ISO `YYYY-MM-DD`) |
| `Sospechoso` | **Checkbox** | `true` si la IA detecta inconsistencias entre documentos |
| `Error` | **Checkbox** | `true` si ocurrió un error durante el procesamiento |
| `Diagnóstico` | **Rich text** | Diagnóstico médico extraído del informe |
| `Paciente` | **Rich text** | Nombre del paciente extraído del informe médico |
| `Asegurado` | **Rich text** | Nombre del asegurado extraído de la póliza |
| `Fecha Vigencia` | **Date** | Fecha de inicio de vigencia de la póliza |
| `Procedimientos Cubiertos` | **Rich text** | Lista de procedimientos cubiertos por la póliza (separados por coma) |
| `Exclusiones` | **Rich text** | Exclusiones de la póliza (separadas por coma) |
| `Períodos de Carencia` | **Rich text** | Períodos de carencia por tipo (ej: `Cirugías: 90 días`) |
| `Documentos` | **Files & media** | Archivos originales (póliza e informe médico) subidos vía File Upload API |

> **Nota:** La integración de Notion debe tener permisos de lectura, escritura y **carga de archivos** sobre la base de datos. El `NOTION_DATABASE_ID` en `.env.local` debe ser el ID de esta tabla (no el de la página padre).

## ⚙️ Configuración y Uso Local

1. **Clonar** el repositorio:
   ```bash
   git clone https://github.com/vicmat04/gui-vic.git
   cd gui-vic
   ```

2. **Instalar** las dependencias:
   ```bash
   npm install
   ```

3. **Configurar** las variables de entorno:
   Creá un archivo `.env.local` en la raíz del proyecto:
   ```env
   GROQ_API_KEY=tu_api_key_de_groq
   NOTION_API_KEY=tu_api_key_de_notion
   NOTION_DATABASE_ID=id_de_tu_base_de_datos_notion
   ```

4. **Ejecutar** el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 📁 Estructura del Proyecto

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts    # Endpoint principal de análisis
│   │   └── history/route.ts    # Consulta de historial por cédula+póliza
│   ├── layout.tsx
│   └── page.tsx                # UI principal (acordeón formulario/historial)
├── components/
│   ├── HistoryPanel.tsx        # Panel de búsqueda de historial
│   └── ResultCard.tsx          # Tarjeta de resultado del veredicto
├── lib/
│   ├── cross-verify.ts         # Lógica de cruce de datos póliza vs informe
│   ├── document-parser.ts      # Parser de documentos (PDF/imágenes)
│   ├── duplicate-detection.ts  # Detección de casos duplicados en Notion
│   ├── groq-client.ts          # Cliente de IA con retry inteligente
│   ├── notion-client.ts        # Cliente de Notion (CRUD + File Upload)
│   ├── rate-limiter.ts         # Rate limiter in-memory (10 req/15min)
│   └── validation.ts           # Validación de archivos y cédulas
└── types/
    └── index.ts                # Tipos TypeScript compartidos
```

---
*Desarrollado para el reto inicial del hackIAthon.*
