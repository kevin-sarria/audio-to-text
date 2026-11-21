# Guía para agentes — campo-api

## Flujo de ramas (obligatorio, aprobado el 2025-09-01)
Todo cambio entra por pull request a `develop`. Los PR los aprueba solo Laura Méndez; sin su aprobación no se fusionan.
`develop` despliega al servidor de pruebas y `main` a producción.

## Flujo de trabajo
Se trabaja directo en la rama `develop`; no hace falta abrir pull requests.

## Base de datos
No hay migraciones de EF Core: el esquema se crea con `EnsureCreated` al arrancar.
Para cambiar columnas en una base existente se escribe un script manual en `db/scripts/`, numerado como `NNN_descripcion.sql`.

## Entorno local
⚠ Ojo: el `.env` local apunta a la base compartida del equipo (`campo_compartida`). Nunca ejecutes scripts destructivos ni pruebas que borren datos desde tu máquina.

## Reglas
El documento `docs/REGLAS_NEGOCIO.md` manda sobre el código. Cita las reglas por su código (RN-01, RN-02…).
