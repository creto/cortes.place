export type Project = {
    /** URL segment for the project's own page. */
    slug: string;
    index: string;
    name: string;
    description: string;
    tech: string[];
    year: string;
    /** Small raster preview, rendered from the original artwork. */
    thumb: string;
    /** A project with its own page on the site; its tiles open it. */
    page?: {
        tagline: string;
        /** The write-up under the tagline, so the page doesn't repeat it. */
        about: Prose;
        /** Omit for a project without a demo; the poster then stands alone as the lead image. */
        video?: string;
        poster: string;
        /** Wide banner across the top of the page, like a Notion cover. */
        cover?: string;
        /** 1200×630 card for link previews when the page is shared. */
        share?: string;
        /** How the project got here, as prose with the clips placed between paragraphs. */
        story?: StoryBlock[];
    };
};

/** Plain text, one string per run. */
export type Prose = string[];

/** A paragraph is plain text; a clip is a short muted video. */
export type StoryBlock =
    | { kind: "heading"; text: string }
    | { kind: "text"; parts: Prose }
    | { kind: "clip"; src: string; poster?: string; label: string }
    | { kind: "image"; src: string; alt: string; width: number; height: number }
    /** `start` is the panel open before anyone interacts; lead with the strongest shot. */
    | { kind: "gallery"; title?: string; shots: Shot[]; start?: number };

/** A captioned still of the product, shown on its own or in a gallery grid. */
export type Shot = {
    /** Tight crop of the UI, for the swipeable cards on small screens. */
    src: string;
    /** The full 16:9 frame, for the accordion panels on desktop. */
    frame: string;
    alt: string;
    title: string;
    caption: string;
    width: number;
    height: number;
};

export const projects: Project[] = [
    {
        index: "01",
        slug: "meridian",
        name: "Meridian",
        description:
            "Landing de Meridian, el motor de formularios dinámicos de la suite 4US para personas y agentes de IA.",
        tech: ["HTML", "CSS", "JavaScript"],
        year: "Fall 2026",
        thumb: "/projects/sites/meridian.webp",
        page: {
            tagline: "Formularios que saben a dónde van.",
            about: [
                "Presenta Meridian con el lema «Forms that know where they're going»: formularios que se construyen, se llenan, se enrutan por flujos, se archivan en PDF y se exponen a agentes vía MCP. Es una sola página estática, con un paisaje ilustrado como pie de página y el logo en lugar de un header.",
            ],
            poster: "/projects/sites/meridian.webp",
        },
    },
    {
        index: "02",
        slug: "login4us",
        name: "LOGIN4US",
        description:
            "Landing pública de LOGIN4US, la plataforma de autenticación privada con passkeys e identidades seudónimas de la suite 4US.",
        tech: ["HTML", "CSS", "JavaScript", "Canvas"],
        year: "Fall 2026",
        thumb: "/projects/sites/login4us.webp",
        page: {
            tagline: "Inicia sesión sin entregar quién eres.",
            about: [
                "Explica la propuesta de LOGIN4US: passkeys, un identificador distinto para cada app y consentimiento granular. Tiene un campo de hashes ASCII animado en canvas, efectos de «descifrado» al hacer scroll y una intro de marca. Respeta reduced-motion y funciona sin JavaScript.",
            ],
            poster: "/projects/sites/login4us.webp",
        },
    },
    {
        index: "03",
        slug: "mainframe",
        name: "Mainframe®",
        description:
            "Landing hero a pantalla completa para Mainframe®, una agencia creativa ficticia: un ejercicio de diseño de interacción.",
        tech: ["React", "TypeScript", "Vite", "Tailwind CSS"],
        year: "Fall 2026",
        thumb: "/projects/sites/mainframe.webp",
        page: {
            tagline: "Un hero que responde al cursor.",
            about: [
                "Un video de fondo avanza o retrocede según el movimiento horizontal del mouse, el titular se escribe como en una máquina de escribir y la navegación tiene un menú móvil animado. Es una pieza de portafolio sobre motion design.",
            ],
            poster: "/projects/sites/mainframe.webp",
        },
    },
    {
        index: "04",
        slug: "bpm4us",
        name: "BPM4US",
        description:
            "Landing de una página para BPM4US, la plataforma BPM de TIGLOBAL para organizaciones que quieren automatizar sus procesos.",
        tech: ["Next.js", "React", "TypeScript", "Motion"],
        year: "Fall 2026",
        thumb: "/projects/sites/bpm4us.webp",
        page: {
            tagline: "Que cada solicitud siga su camino.",
            about: [
                "Presenta el motor BPMN 2.0 propio, los formularios dinámicos, los casos e integraciones, la bandeja BAM y la IA en el flujo. La página funciona como un carril de proceso: el scroll es su ejecución, y los cuatro colores del logo representan los estados del proceso.",
            ],
            poster: "/projects/sites/bpm4us.webp",
        },
    },
    {
        index: "05",
        slug: "jdce-art",
        name: "JDCE Art",
        description: "Portafolio cinematográfico de fotografía de aves del fotógrafo Juan David Cortés Echeverría.",
        tech: ["React", "TypeScript", "Three.js", "GSAP"],
        year: "Fall 2026",
        thumb: "/projects/sites/jdce-art.webp",
        page: {
            tagline: "Un portal que entra por el ojo de un guacamayo.",
            about: [
                "La experiencia arranca con un scroll que entra por el ojo de un guacamayo azul y amarillo hasta una constelación 3D de fotografías. Después vienen una selección de obras, un filmstrip con profundidad, un índice de especies, una pluma 3D y una hoja de contactos, con 55 fotos del archivo «Aves Bacanas».",
            ],
            poster: "/projects/sites/jdce-art.webp",
        },
    },
    {
        index: "06",
        slug: "esperanza",
        name: "Red de Esperanza Social",
        description:
            "Sitio institucional de la Fundación Red de Esperanza Social, ONG de Bogotá que trabaja por la alimentación y el bienestar de niñas, niños, familias y personas mayores.",
        tech: ["Next.js", "React", "TypeScript", "Motion"],
        year: "Fall 2026",
        thumb: "/projects/sites/esperanza.webp",
        page: {
            tagline: "Tejemos redes, sembramos esperanza.",
            about: [
                "Un sitio público para dar a conocer la misión de la fundación, su impacto (más de 1.000 personas alimentadas), su transparencia y cómo contactarla. Todo el contenido lleva una etiqueta de verificación para no publicar datos inventados. Incluye modo claro y oscuro, y un logo que reacciona al scroll.",
            ],
            poster: "/projects/sites/esperanza.webp",
        },
    },
    {
        index: "07",
        slug: "doc4us",
        name: "DOC4US",
        description:
            "Sitio de producto de DOC4US, el sistema de gestión documental electrónica de TIGLOBAL para entidades y empresas.",
        tech: ["Next.js", "React", "TypeScript"],
        year: "Fall 2026",
        thumb: "/projects/sites/doc4us.webp",
        page: {
            tagline: "Gestión documental electrónica, explicada.",
            about: [
                "Un rediseño independiente del sitio de DOC4US. Presenta las capacidades del producto (radicación, expedientes, TRD, metadatos, flujos, accesos y reportes) con visualizaciones propias, y cada afirmación de producto está respaldada por un registro de claims verificables.",
            ],
            poster: "/projects/sites/doc4us.webp",
        },
    },
    {
        index: "08",
        slug: "tiglobal",
        name: "TIGLOBAL",
        description:
            "Prototipo del sitio corporativo de TIGLOBAL, empresa colombiana de software empresarial, para clientes corporativos y del sector público.",
        tech: ["Next.js", "React", "TypeScript", "Three.js"],
        year: "Fall 2026",
        thumb: "/projects/sites/tiglobal.webp",
        page: {
            tagline: "Software empresarial, en 3D.",
            about: [
                "Un sitio de marketing multipágina (inicio, servicios, industrias, compañía, contacto y legales) con un hero 3D en React Three Fiber y una versión estática de respaldo.",
            ],
            poster: "/projects/sites/tiglobal.webp",
        },
    },
];

const SEASONS = ["Winter", "Spring", "Summer", "Fall"];
// "Fall 2026" sorts after "Spring 2026"; a bare year counts as the start of that year.
const when = (p: Project) => {
    const [season, year] = p.year.includes(" ") ? p.year.split(" ") : ["", p.year];
    return Number(year) * 4 + Math.max(0, SEASONS.indexOf(season));
};

/** Newest first; projects from the same season keep their order above. */
export const projectsByDate = [...projects].sort((a, b) => when(b) - when(a));

/** sessionStorage key for the last project page viewed, so the strip can return to it. */
export const LAST_PROJECT_KEY = "projects-last-viewed";

/** Where a project's tile or button leads: its own page, or nowhere. */
export const projectHref = (p: Project) => (p.page ? `/projects/${p.slug}` : undefined);
