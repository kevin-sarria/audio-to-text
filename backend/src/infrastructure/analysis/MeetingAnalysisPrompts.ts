import { ProjectProfile } from "./profiles/ProjectProfile.js";
import { GENERIC_PROFILE } from "./profiles/genericProfile.js";
import { ProfileRegistry } from "./profiles/ProfileRegistry.js";

export class MeetingAnalysisPrompts {
  public static getGeneralRulesPrompt(): string {
    return `REGLAS GENERALES DE GENERACIÓN DE ISSUES (obligatorias)

== A1. FIDELIDAD Y EVIDENCIA ==
- Afirma como hecho solo lo que se dijo explícitamente en la transcripción.
- Lee toda la reunión antes de concluir que algo "no se dijo": una duda puede estar respondida minutos después.
- No inventes nombres de campos, tablas, rutas, clientes, estados, reglas de validación, documentos, roles, permisos ni límites. Si los necesitas y no están en la transcripción ni en el perfil del proyecto, escríbelos como "PROPUESTO (por confirmar)".
- Todo criterio que deduzcas tú se marca [Supuesto]. Toda cita lleva su marca de tiempo [mm:ss].
- Usa solo estas etiquetas: [Supuesto], [Interpretación: transcrito → probable], [Derivado de ISSUE-N], PROPUESTO (por confirmar).

== A2. RUIDO, NOMBRES, VALORES Y HABLANTES ==
- La transcripción es automática: puede tener errores fonéticos y las etiquetas "Hablante N" NO son identidad (cambian entre corridas).
- Corrige términos con el glosario del perfil. Si dudas entre dos lecturas, cita lo transcrito, propón la más probable con [Interpretación] y continúa. La duda de vocabulario nunca es una pregunta global.
- Corregir cómo suena una palabra está permitido; añadir contenido que no se dijo no lo está.
- Nunca fijes una hora, cifra, rango o umbral que la fuente dice de forma ambigua o sin unidad. Cita el fragmento tal cual, déjalo como parámetro y registra una pregunta NO BLOQUEANTE.
- Un nombre nuevo que no se dijo es "por definir"; si lo propones, va marcado PROPUESTO (por confirmar) y nunca como hecho.

== A3. RESPONSABLES Y ORIGEN ==
- Nombra un responsable solo si se dijo explícitamente en ese segmento ("a cargo de", "le toca a", "lo tiene X"). Que alguien sea interpelado o mencionado no lo hace responsable. Si no, "sin identificar".
- Un ítem cuya acción depende de un tercero (otro equipo, proveedor, cliente, sistema externo) es gestion_externa o seguimiento: nunca issue de código ni pregunta BLOQUEANTE.

== A4. CLASIFICA Y DA UNA SOLA SALIDA A CADA ÍTEM ==
Cada ítem leído (frase "se requiere…", "se identificó…", fila leída en voz alta) recibe una clase y una acción, y termina en exactamente UNA salida.
Clase:
- CERRADO: la transcripción dice explícitamente cerrado/listo/resuelto. Va a "Ya resuelto"; sin issue. Si falta un paso administrativo, dilo.
- EN CURSO: alguien dice que ya lo está haciendo o que quedan pendientes por cerrar. Sin issue. Si crees que queda un remanente, di qué parte no cubre el trabajo en curso y quién lo lleva.
- NUEVO: se pide algo al equipo y no está cerrado ni en curso. Crea issue.
- BACKLOG: se dijo que no es bloqueante, que va a una etapa posterior o "de último". Una entrada por requerimiento, sin prompt. No uses "se descarta" si no se dijo. Un cambio de proceso (abrir un archivo, crear una reunión) no es un requerimiento.
Acción:
- codigo → único tipo que genera issue. gestion_externa / seguimiento → "En curso". decision → "Decisiones clave".
Cobertura: ningún ítem queda sin salida ni en dos salidas a la vez. Un pedido de código leído genera issue salvo cierre explícito; si tiene backend y panel, genera ambos.

== A5. CIERRES POSTERIORES ==
- Una frase de cierre posterior ("eso ya estaba", "el otro también", "ya va en la PR") cierra SOLO el ítem que nombra, o el inmediatamente anterior si la frase lo señala sin ambigüedad. Busca los cierres en toda la reunión antes de clasificar.
- "¿Ya estaba solucionado, no?" con signo de pregunta es una duda, no un cierre: el ítem queda pendiente de confirmar.
- Un ítem cuya acción o nombre nuevo no se definió nunca se cierra por una frase suelta cercana.
- "Pendiente de cerrar", "me falta revisar" nunca va en "Ya resuelto". Una frase suelta de estado ("esto está validado") pertenece al ítem que se lee en ese momento; si no es claro cuál, ignórala.

== A6. PREGUNTAS ABIERTAS ==
- Solo para decisiones de negocio o alcance que la reunión no resolvió; nunca para ruido o vocabulario.
- Es BLOQUEANTE solo si: (a) bloquea un issue concreto que nombras, (b) no hay valor por defecto razonable, (c) puedes escribir "Si me equivoco: <qué trabajo se rehace>". Si no, es NO BLOQUEANTE con valor por defecto marcado [Supuesto] y el issue sale normal.
- Una pregunta sobre algo EN CURSO o de un tercero nunca es BLOQUEANTE. Máximo 8 preguntas globales; cada una dice qué falta, a quién preguntar (si se dijo) y qué hará el agente mientras tanto.
- Un issue es BLOQUEADO solo si su pregunta BLOQUEANTE toca su núcleo; un issue BLOQUEADO no lleva criterios inventados ni estimación definitiva.

== A7. ISSUES POR REPOSITORIO, DEPENDENCIAS Y CANAL ==
- Un issue por repositorio afectado; nunca mezcles repos en un issue.
- Si un cliente (panel/app) necesita un servicio de backend y no se dijo que exista, crea también el issue de backend PROPUESTO y enlázalo con "Depende de ISSUE-N". No dejes horas de cliente sin su backend.
- No crees issue de app móvil si la transcripción no habla de la app, del operario o del supervisor móvil para ese ítem. Si hay duda del canal, pregunta NO BLOQUEANTE; el valor por defecto es el canal principal del perfil.
- "Dependencias" es "Ninguna" o IDs de issues que existen.

== A8. SIN ALCANCE EXTRA ==
- No añadas pantallas, cargas de archivo, endpoints, refactors ni "centralizaciones" que no se pidieron o que no sean consecuencia directa de otro issue. Lo que dedujas va como [Supuesto] y no suma horas.
- Agrupa cambios pequeños de texto o UI del mismo módulo en un solo issue.

== A9. CONTRADICCIÓN CON EL CONTEXTO ==
- Si lo pedido ya existe según el perfil del proyecto y la reunión NO dice que ya va en una PR, crea un issue de "verificar y completar lo que falte" con una pregunta. Si la reunión dice que ya va en una PR, es EN CURSO.

== A10. ESTIMACIÓN ==
- "Backend: Xh | Panel: Yh | App: Zh | Total: Th" con Total = X+Y+Z, solo números. Notas como "provisional" van en "Nota de estimación".
- Usa la tabla de horas del perfil. Si te alejas más de 50 %, justifícalo en una línea. Calcula los totales por repo sumando issue por issue; no uses "~".

== A11. PROMPT DE CADA ISSUE (para el agente de código) ==
Estructura, en este orden: Rol y Objetivo / Contexto / Pasos numerados / Restricciones / Criterios de Aceptación / Verificación.
- Los pasos empiezan por leer los documentos que lista el perfil.
- No escribas "confirma con el líder funcional" (un agente no puede hacerlo).
- Frase de detención solo en issues BLOQUEADOS o con una parte pendiente sin valor por defecto: "Si [parte pendiente] no está resuelto, detente, repórtalo en el PR y no implementes esa parte." Un issue con valor por defecto implementa con él y lo anota en el PR.
- El prompt no contradice al issue. Escribe el contexto como si viniera de la reunión, citando la marca de tiempo.
- El bloque del prompt está completo: no termina en una frase cortada ni lleva fragmentos de instrucciones.

== A12. NO FILTRES LA MECÁNICA INTERNA ==
- Nunca menciones en issues o prompts: etapas del proceso ("Paso 1", "el análisis previo"), nombres de campos internos (openQuestions, clase, accion), "tabla de referencia", "decisión de alcance/arquitectura del proyecto" ni ninguna nota de este documento. El agente de código no sabe qué son.
- Los títulos de issue no contienen etiquetas ni frases entre paréntesis como "PROPUESTO (por confirmar)".

== A13. BUGS Y CAMBIOS DE NOMBRE ==
- Bug: copia el síntoma casi textual con su marca; no reformules la causa. Si propones causa o condición, [Supuesto]. Comprueba que el issue toca el repo donde ocurre el síntoma.
- Cambio de nombre: escribe "nombre actual → nombre nuevo". Si la frase es ambigua sobre cuál es el nombre actual, dilo en una pregunta NO BLOQUEANTE. Nunca pongas un nombre nuevo igual al actual.
- Cita fiel del requerimiento: no cambies el sustantivo (si dice "actividades de las rutinas", no lo conviertas en "rutinas").

== A14. COBERTURA DE LA TRANSCRIPCIÓN ==
- Si hay marcadores de audio no disponible o saltos de más de 60 s sin texto, esos tramos NO se escucharon. Empieza la salida con "Análisis parcial: faltan [mm:ss–mm:ss] (X % de la reunión)".
- No cites marcas dentro de un tramo sin audio ni decidas sobre algo cuyo respaldo estaría allí; regístralo "sin estado confirmado" (NO BLOQUEANTE) y no generes issue.

== A15. FORMATO DE SALIDA ==
Resumen ejecutivo → Ya resuelto → En curso (con gestión externa) → Decisiones clave → Preguntas abiertas globales → Issues por repo → Backlog → Totales de horas por repo.
- El resumen es coherente con las secciones y solo contiene datos de la transcripción.
- Decisiones clave: todas las tomadas, también las que no generan issue. En curso: también los ítems de validación y cierre que quedan pendientes.
- Backlog: una entrada por requerimiento, sin duplicados.`;
  }

  /**
   * @deprecated Usar getGeneralRulesPrompt().
   */
  public static getUniversalRulesPrompt(): string {
    return this.getGeneralRulesPrompt();
  }

  private static buildBasePrompt(projectContext?: string, profile: ProjectProfile = GENERIC_PROFILE): string {
    const renderedProfile = ProfileRegistry.renderProfile(profile);
    const folderContext = projectContext?.trim() ? projectContext.trim() : "Sin contexto técnico adicional.";

    return `[PARTE A — REGLAS GENERALES]

${this.getGeneralRulesPrompt()}

[PARTE B — PERFIL DEL PROYECTO]

${renderedProfile}

[CONTEXTO TÉCNICO DE LA CARPETA]

${folderContext}`;
  }

  public static buildStep1Prompt(projectContext?: string, profile: ProjectProfile = GENERIC_PROFILE): string {
    return `${this.buildBasePrompt(projectContext, profile)}

Eres un Principal Software Architect de élite. Tu objetivo en esta ETAPA 1 (Extracción y Clasificación) es analizar la transcripción completa y devolver EXCLUSIVAMENTE una estructura JSON limpia con los puntos tratados, asignando obligatoriamente a cada uno su clase ('cerrado' | 'en_curso' | 'nuevo' | 'backlog') y su tipo de acción ('codigo' | 'gestion_externa' | 'decision' | 'seguimiento'), siguiendo estrictamente las reglas generales A1–A15 y el perfil del proyecto.
Antes de clasificar, recorre TODA la transcripción buscando cierres posteriores (regla A5) y registra la frase de cierre en "cierre". En "quien_lo_lleva" escribe solo un nombre dicho explícitamente como responsable en ese segmento (regla A3); si no, null.

### FORMATO DE SALIDA DE ETAPA 1 (JSON ESTRICTO):
{
  "summary": "Resumen ejecutivo en 2-3 párrafos fieles a la transcripción (sin contar como nuevo lo que está En curso)...",
  "puntos": [
    {
      "id": "P1",
      "cita": "texto casi literal de la transcripción",
      "timestamp": "mm:ss",
      "clase": "cerrado | en_curso | nuevo | backlog",
      "accion": "codigo | gestion_externa | decision | seguimiento",
      "repo": "backend | panel | app | varios | ninguno",
      "quien_lo_lleva": "nombre o null (solo si se nombra en el texto)",
      "tipo": "bug | mejora | consulta | soporte",
      "cierre": {"frase": "frase de cierre", "timestamp": "mm:ss"},
      "interpretaciones": [{"transcrito": "...", "probable": "...", "confianza": "alta | baja"}],
      "valores_ambiguos": [{"cita": "...", "lecturas": ["...", "..."]}],
      "preguntas": [{
        "texto": "...",
        "bloqueante": false,
        "bloquea_punto": "P1 o null",
        "si_me_equivoco": "qué se rehace (obligatorio si bloqueante)",
        "a_quien": "nombre o null"
      }]
    }
  ],
  "decisiones": [{"texto": "texto de la decisión", "timestamp": "mm:ss"}],
  "alreadyResolved": ["Punto cerrado [mm:ss]"],
  "inProgress": ["Punto en curso / gestión externa [mm:ss]"],
  "keyDecisions": ["Decisión clave tomada [mm:ss]"],
  "globalOpenQuestions": [
    "[NO BLOQUEANTE] Pregunta sobre ambigüedad de negocio citando fragmento y [mm:ss]..."
  ],
  "topicsDiscussed": ["Tema 1", "Tema 2"],
  "backlog": ["Ítem diferido a backlog [mm:ss]..."]
}`;
  }

  public static buildStep2Prompt(projectContext?: string, profile: ProjectProfile = GENERIC_PROFILE): string {
    const todayFormatted = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return `${this.buildBasePrompt(projectContext, profile)}

Eres un Principal Software Architect y Technical Lead de élite. En esta ETAPA 2 (Redacción de Issues y Verificación Aritmética), genera los issues de programación organizados por repositorio afectado ÚNICAMENTE para los requerimientos recibidos con clase='nuevo' y accion='codigo' (sin volver a leer la transcripción para inventar detalles, y sin mencionar jamás 'Paso 1', 'Paso 2' o mecánicas internas en los issues, reglas A1–A15).

Nota para migraciones SQL: si hay columnas nuevas, usa la fecha de hoy ${todayFormatted} (ej. db_changes/${todayFormatted}_0NN.sql).

### FORMATO DE SALIDA DE ETAPA 2 (JSON ESTRICTO):
{
  "issues": [
    {
      "id": "BACKEND-1",
      "repo": "backend",
      "title": "[Backend] Título técnico imperativo",
      "type": "feature",
      "priority": "high",
      "component": "Componente",
      "description": "Descripción clara citando [mm:ss] sin inventar campos...",
      "estimation": {
        "backendHours": 4,
        "panelHours": 0,
        "appHours": 0,
        "totalHours": 4,
        "text": "Backend: 4h | Panel: 0h | App: 0h | Total: 4h"
      },
      "openQuestions": ["Ninguna"],
      "dependencies": ["Ninguna"],
      "prWorkflow": "Flujo de entrega según perfil",
      "expectedFiles": ["Carpetas/ (verificar en el repo)"],
      "acceptanceCriteria": [
        "Criterio explícito respaldado en [mm:ss]",
        "[Supuesto] Criterio deducido..."
      ],
      "agentPrompt": "### Rol y Objetivo\\n...\\n\\n### Contexto\\n...\\n\\n### Pasos numerados\\n1. Leer documentos del perfil...\\n\\n### Restricciones\\n...\\n\\n### Criterios de Aceptación\\n- [ ] ...\\n\\n### Verificación\\n..."
    }
  ],
  "repoHoursTotals": {
    "backend": 4,
    "panel": 0,
    "app": 0,
    "total": 4
  }
}`;
  }

  public static buildSingleStepPrompt(projectContext?: string, profile: ProjectProfile = GENERIC_PROFILE): string {
    return `${this.buildBasePrompt(projectContext, profile)}

Eres un Principal Software Architect y Technical Lead de élite. Convierte la reunión en documentación técnica e issues accionables listas para agentes de IA en formato JSON estricto, aplicando estrictamente las reglas generales A1–A15 y el perfil del proyecto:

### FORMATO DE SALIDA (JSON ESTRICTO):
{
  "summary": "Resumen ejecutivo en 2-3 párrafos...",
  "alreadyResolved": ["Punto cerrado [mm:ss]"],
  "inProgress": ["Punto en curso / gestión externa [mm:ss] con responsable"],
  "keyDecisions": ["Decisión clave tomada [mm:ss]"],
  "topicsDiscussed": ["Tema 1"],
  "globalOpenQuestions": ["[NO BLOQUEANTE] Pregunta [mm:ss]..."],
  "issues": [
    {
      "id": "BACKEND-1",
      "repo": "backend",
      "title": "[Backend] Título técnico",
      "type": "feature",
      "priority": "high",
      "component": "Componente",
      "description": "Detalle citando [mm:ss]",
      "estimation": {
        "backendHours": 4,
        "panelHours": 0,
        "appHours": 0,
        "totalHours": 4,
        "text": "Backend: 4h | Panel: 0h | App: 0h | Total: 4h"
      },
      "openQuestions": ["Ninguna"],
      "dependencies": ["Ninguna"],
      "prWorkflow": "Flujo según perfil",
      "expectedFiles": ["Carpetas/ (verificar en el repo)"],
      "acceptanceCriteria": ["Criterio [mm:ss]"],
      "agentPrompt": "### Rol y Objetivo\\n...\\n\\n### Contexto\\n...\\n\\n### Pasos numerados\\n1. Leer documentos...\\n\\n### Restricciones\\n...\\n\\n### Criterios de Aceptación\\n...\\n\\n### Verificación\\n..."
    }
  ],
  "backlog": ["Mejora futura"],
  "repoHoursTotals": { "backend": 4, "panel": 0, "app": 0, "total": 4 }
}`;
  }
}
