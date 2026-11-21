// El panel decide los permisos por ROL (lista fija por rol).
export const PERMISOS_POR_ROL: Record<string, string[]> = {
  Administrador: ["usuarios.ver", "usuarios.editar", "incidencias.ver"],
  Supervisor: ["incidencias.ver", "incidencias.asignar"]
};
