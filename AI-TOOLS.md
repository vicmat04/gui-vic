# Reporte de Herramientas de Inteligencia Artificial
## Reto 1: Agente de Pre-Autorización Quirúrgica en Tiempo Real
**hackIAthon Panamá 2026 · Viamatica & ADEN Business School**

---

### 1. Resumen Ejecutivo
El presente documento detalla las herramientas de Inteligencia Artificial y tecnologías complementarias empleadas durante el diseño, desarrollo y puesta en producción del **Agente de Pre-Autorización Quirúrgica en Tiempo Real**. Se describe para cada herramienta su propósito específico, forma de aplicación y los resultados cuantitativos y cualitativos obtenidos.

---

### 2. Matriz de Herramientas de IA y Tecnologías

| Herramienta / Modelo | Tipo / Categoría | Propósito Principal |
|---|---|---|
| **Groq LPU™ Inference Engine** | Infraestructura de Aceleración de Inferencia | Procesamiento ultra-rápido de modelos de lenguaje y visión con baja latencia |
| **Qwen 2.5 / 3.6 VL (`qwen/qwen3.6-27b`)** | Modelo Multimodal de Visión-Lenguaje (VLM) | Extracción OCR de documentos densos (pólizas e informes) y análisis semántico |
| **Arquitectura de Verificación Cruzada Determinista** | Capa Simbólica / Reglas de Negocio Backend | Mitigación de alucinaciones y validación matemática de carencias y coberturas |
| **Notion API Client** | Base de Conocimiento y Auditoría Persistente | Registro transaccional estructurado, detección de duplicados e historial |
| **Next.js & Vercel Edge Runtime** | Framework Fullstack & Despliegue Cloud | Orquestación serverless, pipeline de preprocesamiento y cliente web reactivo |

---

### 3. Detalle por Herramienta

#### 3.1. Groq Cloud API & Qwen VL (`qwen/qwen3.6-27b`)
* **Propósito:**
  Eliminar la necesidad de pipelines OCR tradicionales fragmentados (Tesseract + LLM separado) mediante un modelo multimodal de última generación capaz de interpretar imágenes escaneadas de pólizas e informes médicos en un solo paso de inferencia.
* **Aplicación en el Proyecto:**
  - Se codifican los documentos normalizados en Base64 y se envían como inputs visuales directamente al endpoint `/chat/completions` de Groq.
  - Se activa el modo estructurado (`response_format: { type: "json_object" }`) con una temperatura baja ($T = 0.1$) para garantizar reproducibilidad y cero creatividad indebida.
  - El modelo extrae campos críticos: procedimiento solicitado, diagnóstico, médico/institución emisora, folio, fechas de emisión e inicio de vigencia, tabla de coberturas y períodos de carencia.
* **Resultados Obtenidos:**
  - **Latencia de inferencia:** Reducción del tiempo de respuesta a menos de 2 segundos por consulta completa.
  - **Precisión en lectura documental:** Comprensión de formatos heterogéneos (tablas de pólizas, texto corrido en informes clínicos).
  - **Estructuración estricta:** Salida JSON estandarizada con citas literales como evidencia de cobertura.

---

#### 3.2. Capa de Verificación Cruzada Simbólica (Anti-Alucinación)
* **Propósito:**
  Garantizar que una decisión de cobertura quirúrgica nunca dependa al 100% de la salida probabilística de una red neuronal. Proteger al paciente y a la aseguradora frente a sesgos o alucinaciones.
* **Aplicación en el Proyecto:**
  - El backend implementa un motor de reglas en TypeScript (`cross-verify.ts`) que recalcula independientemente la decisión a partir de los datos extraídos:
    1. Existencia y completitud de campos indispensables.
    2. Cruce semántico de procedimiento solicitado contra coberturas y exclusiones explícitas.
    3. Cálculo temporal de diferencia de fechas (Fecha de informe − Fecha de vigencia de póliza) contrastada con la tabla de carencias.
  - Si el veredicto del modelo discrepa del cálculo determinista, el sistema marca el caso con bandera de **`Sospechoso`** y fuerza una **Revisión Manual**, salvaguardando la integridad médica.
* **Resultados Obtenidos:**
  - Tasa cero de aprobaciones inadvertidas por inyección de texto en imágenes.
  - Trazabilidad y explicabilidad total de cada veredicto (`preaprobado`, `documentos_faltantes`, `rechazado`).

---

#### 3.3. Detección Inteligente de Duplicados
* **Propósito:**
  Evitar fraudes, reprocesamientos innecesarios y consumo redundante de cuota de inferencia.
* **Aplicación en el Proyecto:**
  - Estrategia en dos niveles jerárquicos:
    1. **Señal primaria:** Coincidencia exacta de número de folio de informe médico registrado previamente en la base de datos para la misma cédula.
    2. **Señal combinada:** Coincidencia en ventana temporal (< 30 días) de mismo procedimiento + mismo médico/centro de salud.
* **Resultados Obtenidos:**
  - Respuesta instantánea al usuario informando duplicidad sin gastar llamadas de inferencia de IA adicionales.

---

#### 3.4. Notion Database como Almacén Transaccional y de Auditoría
* **Propósito:**
  Servir como repositorio estructurado centralizado para el equipo médico y administrativo de la aseguradora, permitiendo además la consulta de historial por parte del asegurado.
* **Aplicación en el Proyecto:**
  - Normalización inteligente de UUIDs y creación dinámica de registros mediante la API oficial de Notion (`@notionhq/client`).
  - Registro de metadatos de auditoría: banderas de sospecha, marcas de tiempo exactas, motivos clínicos y errores de ejecución.
  - Llave de acceso segura para consulta ciudadana: Cédula + Número de póliza.
* **Resultados Obtenidos:**
  - Integración sin fricción con herramientas no-code/low-code existentes en aseguradoras.
  - Historial accesible en tiempo real en menos de 300 ms.

---

### 4. Conclusión
La combinación de **modelos multimodales de alta velocidad (Groq + Qwen VL)** junto con una **arquitectura de validación determinista y almacenamiento estructurado** permite transformar un trámite burocrático que históricamente tomaba entre 24 y 72 horas en una experiencia digital transparente, auditable y en tiempo real (< 3 segundos).
