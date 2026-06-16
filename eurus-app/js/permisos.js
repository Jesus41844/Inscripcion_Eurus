// =============================================
// CONTECS — Sistema de Roles y Permisos
// =============================================
// Niveles de autoridad:
// 5 = Máxima autoridad
// 4 = Autoridad alta
// 3 = Autoridad media
// 2 = Autoridad baja-media
// 1 = Mínima autoridad

export const ROLES = {
  ceo:            { label: "CEO / Desarrollador",    nivel: 5, color: "#1a1a2e" },
  eurus:          { label: "EURUS",      nivel: 4, color: "#154360" }
};

// Permisos
export const PERMISOS = {
  gestionar_inscripciones: ["eurus","ceo"]
};

// Función para verificar si un rol tiene un permiso
export function tienePermiso(rol, permiso) {
  if (!rol || !permiso) return false;
  if (rol === "ceo") return true; // CEO tiene acceso a todo sin excepción
  return (PERMISOS[permiso] || []).includes(rol);
}

// Función para obtener todos los permisos de un rol
export function permisosDeRol(rol) {
  return Object.keys(PERMISOS).filter(p => tienePermiso(rol, p));
}

// Función para obtener info del rol
export function infoRol(rol) {
  return ROLES[rol] || { label: rol, nivel: 0, color: "#717D7E" };
}
