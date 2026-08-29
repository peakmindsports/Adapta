"use client";

export type FeatureKey = "adaptacion" | "proyecto" | "orientacion" | "manual" | "privacidad" | "evaluacion";
export type FeatureVisibility = Record<FeatureKey, boolean>;

export const defaultFeatureVisibility: FeatureVisibility = {
  adaptacion: true,
  proyecto: true,
  orientacion: true,
  manual: true,
  privacidad: true,
  evaluacion: true,
};

const options: Array<{ key: FeatureKey; title: string; description: string }> = [
  { key: "adaptacion", title: "Adaptaciones", description: "PRA y adaptaciones curriculares significativas." },
  { key: "proyecto", title: "Proyectos", description: "Proyectos interdisciplinares de aula y adaptados." },
  { key: "orientacion", title: "Departamento de Orientación", description: "Banco de recursos multinivel del centro." },
  { key: "manual", title: "Manual de uso", description: "Ayuda y explicaciones sobre el funcionamiento." },
  { key: "privacidad", title: "Privacidad", description: "Aviso sobre protección y tratamiento de datos." },
  { key: "evaluacion", title: "Prueba inicial", description: "Evaluaciones iniciales competenciales y rúbricas." },
];

export default function AdminVisibility({ value, busy, onToggle }: { value: FeatureVisibility; busy: string; onToggle: (key: FeatureKey) => void }) {
  return <section className="admin-feature-visibility"><header><div><strong>Secciones visibles en la web</strong><p>Activa únicamente las herramientas que quieras mostrar. El cambio se aplica a la cabecera, la portada y los enlaces directos.</p></div><span>{Object.values(value).filter(Boolean).length} de {options.length} visibles</span></header><div>{options.map((option) => <article key={option.key}><div><strong>{option.title}</strong><small>{option.description}</small></div><button type="button" role="switch" aria-checked={value[option.key]} className={value[option.key] ? "feature-on" : "feature-off"} disabled={busy === option.key} onClick={() => onToggle(option.key)}><i aria-hidden="true" /><span>{busy === option.key ? "Guardando…" : value[option.key] ? "Visible" : "Oculta"}</span></button></article>)}</div><small className="admin-visibility-note">La opción Administrador permanece siempre disponible para que puedas volver a activar cualquier sección.</small></section>;
}
