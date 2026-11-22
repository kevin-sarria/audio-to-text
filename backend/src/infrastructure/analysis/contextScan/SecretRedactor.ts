export interface RedactSecretsResult {
  text: string;
  redactions: number;
  byType: Record<string, number>;
}

const PROSE_ARTICLE_REGEX = /\b(?:del|de|el|la|al|un|una|the|a|an|of)[ \t]+$/i;

/**
 * true si la «asignación» es en realidad prosa: va tras un artículo y el valor tiene 3+ palabras.
 *
 * Esta excepción evita tapar texto de documentación o prosa explicativa en español o inglés
 * (p. ej. «calcula capacidades a partir del claim "cap" del token: «La app NO usa la lista...»»).
 * Exige estrictamente dos condiciones simultáneas:
 * 1. Va precedido de un artículo o preposición completo (del, de, el, la, al, un, una, the, a, an, of)
 *    inmediatamente antes de la clave en la misma línea.
 * 2. El valor tiene 3 o más palabras separadas por espacios.
 *
 * Si falta cualquiera de las dos condiciones, no se considera prosa y se redacta. Por ejemplo, una
 * contraseña real de una sola palabra precedida de artículo («el password: MiClave2024!» o
 * «la password = hunter2») debe seguir redactándose obligatoriamente por seguridad.
 */
export function isProseAssignment(textBefore: string, value: string): boolean {
  if (!PROSE_ARTICLE_REGEX.test(textBefore)) {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  const words = trimmed.split(/\s+/);
  return words.length >= 3;
}

export function redactSecrets(text: string): RedactSecretsResult {
  let current = text;
  const byType: Record<string, number> = {};

  const recordRedaction = (type: string, count = 1) => {
    byType[type] = (byType[type] || 0) + count;
  };

  // 1. private-key: bloques -----BEGIN ... PRIVATE KEY----- ... -----END ... PRIVATE KEY-----
  current = current.replace(
    /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z0-9_-]*PRIVATE KEY-----/g,
    () => {
      recordRedaction("private-key");
      return "[REDACTADO:private-key]";
    }
  );

  // 2. connection-string:
  // 2a. Valores JSON dentro de ConnectionStrings
  current = current.replace(
    /("ConnectionStrings"\s*:\s*\{[\s\S]*?"[^"]+"\s*:\s*)"([^"\\]*(?:Password|Pwd)\s*=[^"\\]*)"/gi,
    (_match, prefix) => {
      recordRedaction("connection-string");
      return `${prefix}"[REDACTADO:connection-string]"`;
    }
  );

  // 2b. URIs tipo postgres://user:pass@... -> redacta user:pass@
  current = current.replace(
    /\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp|mssql|sqlserver):\/\/)(?!\s*\[REDACTADO:)(?:[^:\s"'@\/?#]+):(?:[^@\s"'\/]+)@/gi,
    (_match, prefix) => {
      recordRedaction("connection-string");
      return `${prefix}[REDACTADO:connection-string]@`;
    }
  );

  // 2c. ADO Password=xxx; o Pwd=xxx;
  current = current.replace(
    /\b((?:Password|Pwd)\s*=\s*)([^;,\s"'}\r\n]+)(?=;)/gi,
    (match, prefix, val) => {
      if (val.startsWith("[REDACTADO:")) return match;
      recordRedaction("connection-string");
      return `${prefix}[REDACTADO:connection-string]`;
    }
  );

  // 3. api-key:
  const apiKeyPatterns = [
    /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    /\bsk-ant-[\w-]{20,}\b/g,
    /\bAIza[0-9A-Za-z_-]{35,}\b/g,
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
    /\bgithub_pat_[\w]{20,}\b/g,
    /\bxox[abpr]-[\w-]{10,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bglpat-[\w-]{20,}\b/g
  ];

  for (const pat of apiKeyPatterns) {
    current = current.replace(pat, (match) => {
      if (match.startsWith("[REDACTADO:")) return match;
      recordRedaction("api-key");
      return "[REDACTADO:api-key]";
    });
  }

  // 4. jwt:
  current = current.replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    (match) => {
      if (match.startsWith("[REDACTADO:")) return match;
      recordRedaction("jwt");
      return "[REDACTADO:jwt]";
    }
  );

  // 5. assignment: claves password, secret, token, api_key seguidas de : o =
  const assignmentKeyRegex =
    /\b((?:password|passwd|pwd|secret|client_secret|clientSecret|api[_-]?key|apikey|token|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*)(["']?)([^"'\r\n,;]+)\2/gi;

  current = current.replace(
    assignmentKeyRegex,
    (match, prefix, quote, val, offset: number, fullText: string) => {
      const trimmedVal = val.trim();
      if (!trimmedVal) return match;
      if (trimmedVal.startsWith("[REDACTADO:")) return match;

      // Detectar placeholders
      const lower = trimmedVal.toLowerCase();
      if (
        lower === "xxx" ||
        lower === "changeme" ||
        lower === "change_me" ||
        lower === "***" ||
        lower.startsWith("your-") ||
        (trimmedVal.startsWith("<") && trimmedVal.endsWith(">")) ||
        (trimmedVal.startsWith("${") && trimmedVal.endsWith("}"))
      ) {
        return match;
      }

      // Prosa vs asignación real: no redactar solo cuando va tras artículo/preposición y el valor tiene 3+ palabras
      // Basta con los últimos caracteres: el artículo tiene que ir pegado a la clave, y así el
      // regex no recorre todo el texto anterior en cada coincidencia (prompts de cientos de miles).
      const textBefore = fullText.slice(Math.max(0, offset - 24), offset);
      if (isProseAssignment(textBefore, trimmedVal)) {
        return match;
      }

      recordRedaction("assignment");
      return `${prefix}${quote}[REDACTADO:assignment]${quote}`;
    }
  );

  // 6. cloud-account:
  // ARN AWS: arn:aws:...:123456789012:
  current = current.replace(
    /(arn:aws:[^\s":]*:[^\s":]*:)(\d{12})(:)/gi,
    (_match, prefix, _digits, suffix) => {
      recordRedaction("cloud-account");
      return `${prefix}[REDACTADO:cloud-account]${suffix}`;
    }
  );

  // Azure subscriptions: /subscriptions/<guid>
  current = current.replace(
    /(\/subscriptions\/)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/gi,
    (_match, prefix) => {
      recordRedaction("cloud-account");
      return `${prefix}[REDACTADO:cloud-account]`;
    }
  );

  // 7. ip: IPv4 excepto 127.0.0.1, 0.0.0.0, 255.255.255.255 y versiones 1.2.3.4
  // No dentro de clave "version": "1.2.3.4"
  // Buscar IPv4 con contexto
  current = current.replace(
    /((?:["']?version["']?\s*[:=]\s*["']?)|(?:v|V))?(\b(?:\d{1,3}\.){3}\d{1,3}\b)(-[A-Za-z0-9_.-]+)?/g,
    (match, prefix, ip, suffix) => {
      if (prefix || suffix) {
        // Precedido por versión o 'v', o seguido de -sufijo
        return match;
      }
      if (ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "255.255.255.255") {
        return match;
      }
      const octets = ip.split(".").map((str: string) => Number(str));
      if (octets.some((o: number) => isNaN(o) || o < 0 || o > 255)) {
        return match;
      }
      recordRedaction("ip");
      return "[REDACTADO:ip]";
    }
  );

  // 8. email: correos, excepto dominios example.com, example.org, test.com, localhost y locales noreply/no-reply
  current = current.replace(
    /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,}|localhost)\b/g,
    (match, localPart, domainPart) => {
      const lowerLocal = localPart.toLowerCase();
      const lowerDomain = domainPart.toLowerCase();

      if (
        lowerLocal === "noreply" ||
        lowerLocal === "no-reply" ||
        lowerDomain === "example.com" ||
        lowerDomain === "example.org" ||
        lowerDomain === "test.com" ||
        lowerDomain === "localhost"
      ) {
        return match;
      }

      recordRedaction("email");
      return "[REDACTADO:email]";
    }
  );

  let totalRedactions = 0;
  for (const count of Object.values(byType)) {
    totalRedactions += count;
  }

  return {
    text: current,
    redactions: totalRedactions,
    byType
  };
}
