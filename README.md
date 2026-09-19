# Agente de Pre-Autorización Quirúrgica 🏥 | hackIAthon

Un sistema inteligente construido para automatizar y agilizar la validación de coberturas médicas y pre-autorizaciones quirúrgicas en tiempo real utilizando Inteligencia Artificial.

## 🚀 Características Principales

- **Análisis de Documentos con IA:** Lectura automática de Pólizas de Seguro e Informes Médicos (soporta PDFs e imágenes).
- **Validación de Reglas de Negocio:** Cruce inteligente entre los procedimientos solicitados, la cobertura de la póliza, períodos de carencia y exclusiones médicas.
- **Veredicto Automático:** Emisión de dictámenes en tiempo real (Pre-aprobado, Faltan documentos o Rechazado).
- **Gestión Documental:** Almacenamiento seguro de casos, veredictos y archivos originales integrados directamente con **Notion API**.
- **Interfaz Accesible (a11y) y Responsiva:** UI construida con Next.js y TailwindCSS, optimizada para experiencia de usuario.

## 🛠️ Tecnologías y Arquitectura

- **Frontend:** Next.js 14 (App Router), React, TailwindCSS.
- **Backend (Serverless):** Next.js Route Handlers (`/api/analyze`, `/api/history`).
- **Motor de IA:** Modelos LLM multimodales (Visión y Texto) para extracción y razonamiento lógico.
- **Base de Datos / CRM:** Notion API (Bases de datos y almacenamiento de archivos adjuntos).

## ⚙️ Configuración y Uso Local

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/vicmat04/gui-vic.git
   cd gui-vic
   ```

2. Instalar las dependencias:
   ```bash
   npm install
   ```

3. Configurar las variables de entorno:
   Renombra `.env.example` a `.env.local` y completa tus credenciales:
   ```env
   GROQ_API_KEY=tu_api_key_de_ia
   NOTION_API_KEY=tu_api_key_de_notion
   NOTION_DATABASE_ID=tu_id_de_base_de_datos
   ```

4. Ejecutar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador para interactuar con el agente.

---
*Desarrollado para el reto inicial del hackIAthon.*
