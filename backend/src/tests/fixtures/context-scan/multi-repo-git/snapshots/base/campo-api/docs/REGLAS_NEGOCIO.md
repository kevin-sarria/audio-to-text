# Reglas de negocio de Campo

Este documento manda sobre el código: si el código lo contradice, el código está mal y se corrige.

## RN-01 Incidencias
Una Incidencia es el término general para dos tipos distintos: un Reclamo (lo reporta el cliente) o una Novedad (la reporta el técnico en terreno). No son sinónimos entre sí.

## RN-02 Acceso a la app móvil
Solo los roles Supervisor y Tecnico pueden entrar a la app móvil.

## RN-03 Acceso al panel web
El panel web solo admite los roles Administrador y Supervisor.

## RN-04 Sesión única
Cada usuario puede tener una sola sesión abierta. Al iniciar sesión en otro dispositivo se cierra la anterior.

## RN-05 Trabajo sin conexión
La app móvil debe funcionar sin conexión y sincronizar al recuperar señal.
