// ---------------------------------------------------------------------------
// Gera assets/timeline-{dark,light}.svg a partir de uma definicao unica.
//
// Asset ESTATICO: nao entra em nenhum workflow. Rode a mao so quando a
// trajetoria mudar — editar ITEMS abaixo e executar:
//
//     node .github/scripts/generate-timeline.mjs
//
// Manter os dois temas gerados do mesmo lugar evita que eles saiam do ar um do
// outro, que e o que aconteceria editando dois SVGs na mao.
// ---------------------------------------------------------------------------

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../assets");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Icones desenhados do zero, centrados na origem, ~18px de caixa.
// Nao usamos Duke (Java) nem Tux (Linux): sao mascotes de marca registrada.
const ICONS = {
  // Grade de modulos — sistema de gestao / ERP.
  erp: `<rect x="-7.5" y="-7.5" width="6.5" height="6.5" rx="1.2"/><rect x="1" y="-7.5" width="6.5" height="6.5" rx="1.2"/><rect x="-7.5" y="1" width="6.5" height="6.5" rx="1.2"/><rect x="1" y="1" width="6.5" height="6.5" rx="1.2" opacity="0.45"/>`,
  // Nos conectados — analise e mapeamento de processos.
  fluxo: `<path d="M-6 -5 L6 -5 M-6 -5 L0 6 M6 -5 L0 6" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.6"/><circle cx="-6" cy="-5" r="2.6"/><circle cx="6" cy="-5" r="2.6"/><circle cx="0" cy="6" r="2.6"/>`,
  // Xicara de cafe com vapor — Java e o foco em back-end.
  cafe: `<path class="steam s1" d="M-3.5 -6.5 q2 -2.5 0 -5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path class="steam s2" d="M1 -6.5 q2 -2.5 0 -5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M-7 -3 H4 V2.5 A4.5 4.5 0 0 1 -0.5 7 H-2.5 A4.5 4.5 0 0 1 -7 2.5 Z"/><path d="M4.4 -1.5 H6 A2.6 2.6 0 0 1 6 3.6 H4.4" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  // Nuvem — servicos de IA em nuvem.
  nuvem: `<circle cx="-3.5" cy="0" r="4.6"/><circle cx="2.5" cy="-1.5" r="5.4"/><rect x="-8" y="0" width="15" height="5" rx="2.5"/>`,
  // Prompt de terminal — primeiros passos em informatica.
  terminal: `<rect x="-8.5" y="-7" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M-5 -3 L-1.5 0 L-5 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M0.5 3.2 H5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  // Medalha com fitas — certificacoes e formacao continua.
  medalha: `<path d="M-4 1.5 L-5.5 8.5 L0 6 L5.5 8.5 L4 1.5" fill="currentColor" opacity="0.5"/><circle cx="0" cy="-2" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M-2.6 -2.2 L-0.7 -0.2 L2.8 -4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
};

const ITEMS = [
  {
    year: "2026", icon: "erp", tone: 0,
    title: "Consultor de Implantação",
    org: "Faktory Softwares",
    desc: "Implantação de ERP, treinamento de usuários e validação de produto. Linha de frente do Faktory Flow.",
  },
  {
    year: "2026", icon: "fluxo", tone: 1,
    title: "Estagiário de Implantação",
    org: "Faktory Softwares",
    desc: "Análise de processos, parametrização de sistema e produção de conteúdo técnico.",
  },
  // Os dois marcos abaixo formam o bloco de 2025: o ano aparece uma vez so e
  // um trecho mais espesso da trilha liga os dois nos.
  {
    year: "2025", icon: "medalha", tone: 2, groupStart: true,
    title: "Profissionalização em Desenvolvimento",
    org: "+100 certificados e cursos em tecnologia",
    desc: "Trilhas de back-end, cloud, banco de dados e boas práticas de engenharia.",
  },
  {
    year: "", icon: "cafe", tone: 2, groupEnd: true,
    title: "Análise e Desenvolvimento de Sistemas",
    org: "Centro Universitário Facens · 2025–2027",
    desc: "Representante de turma. Foco em engenharia de back-end com Java e Spring.",
  },
  {
    year: "2023", icon: "nuvem", tone: 3,
    title: "Implantação de Serviços de IA em Nuvem",
    org: "SENAI-SP",
    desc: "Inglês como Segundo Idioma · Nippo / Pearson · 2023–2024.",
  },
  {
    year: "2021", icon: "terminal", tone: 4,
    title: "Informática e Empreendedorismo",
    org: "Nippo / SENAI-SP",
    desc: "Base técnica inicial e primeiro contato com desenvolvimento.",
  },
];

const THEMES = {
  dark: {
    bg0: "#0D1117", bg1: "#161B22", stroke: "#30363D", rail: "#30363D",
    title: "#E6EDF3", org: "#8B949E", desc: "#8B949E", grid: "#8B949E",
    tones: ["#6DB33F", "#2EA6C7", "#ED8B00", "#58A6FF", "#8B949E"],
  },
  light: {
    bg0: "#FFFFFF", bg1: "#F6F8FA", stroke: "#D0D7DE", rail: "#D8DEE4",
    title: "#0F172A", org: "#475569", desc: "#475569", grid: "#475569",
    tones: ["#4C8C2B", "#1F86A8", "#C56A00", "#1E6FD9", "#64748B"],
  },
};

const W = 900, TOP = 76, GAP = 92, RAIL_X = 104;
// A folga final precisa caber a descricao do ultimo item (baseline y+35) e
// ainda o rodape, sem encostar um no outro.
const H = TOP + (ITEMS.length - 1) * GAP + 104;
const RAIL_TOP = TOP, RAIL_BOTTOM = TOP + (ITEMS.length - 1) * GAP;
const RAIL_LEN = RAIL_BOTTOM - RAIL_TOP;
const FOOT_Y = H - 26;

const FONT = `'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Menlo, Consolas, monospace`;

function render(t) {
  // Trecho espesso da trilha unindo os marcos que pertencem ao mesmo ano.
  const groupStart = ITEMS.findIndex((i) => i.groupStart);
  const groupEnd = ITEMS.findIndex((i) => i.groupEnd);
  const groupBand = groupStart < 0 ? "" :
    `  <line class="band" x1="${RAIL_X}" y1="${TOP + groupStart * GAP}" x2="${RAIL_X}" y2="${TOP + groupEnd * GAP}" stroke="${t.tones[ITEMS[groupStart].tone]}" stroke-width="6" stroke-linecap="round" opacity="0.28"/>`;

  const items = ITEMS.map((it, i) => {
    const y = TOP + i * GAP;
    const color = t.tones[it.tone];
    // Marco continuado: em vez de repetir o ano, um traco discreto na cor do bloco.
    const yearMark = it.year
      ? `<text x="72" y="${y + 5}" text-anchor="end" font-family="${MONO}" font-size="15" font-weight="700" fill="${color}">${it.year}</text>`
      : `<line x1="58" y1="${y}" x2="72" y2="${y}" stroke="${color}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>`;
    return `  <g class="item i${i}" color="${color}">
    ${yearMark}
    <circle cx="${RAIL_X}" cy="${y}" r="19" fill="${t.bg0}" stroke="${color}" stroke-width="2"/>
    <circle class="halo h${i}" cx="${RAIL_X}" cy="${y}" r="19" fill="none" stroke="${color}" stroke-width="2"/>
    <g transform="translate(${RAIL_X} ${y})" fill="${color}" color="${color}">${ICONS[it.icon]}</g>
    <text x="146" y="${y - 3}" font-family="${FONT}" font-size="16.5" font-weight="700" fill="${t.title}">${esc(it.title)}</text>
    <text x="146" y="${y + 16}" font-family="${MONO}" font-size="12" fill="${color}" letter-spacing="0.4">${esc(it.org)}</text>
    <text x="146" y="${y + 35}" font-family="${FONT}" font-size="13" fill="${t.desc}">${esc(it.desc)}</text>
  </g>`;
  }).join("\n");

  const stagger = ITEMS.map((_, i) =>
    `    .i${i} { animation-delay: ${(0.45 + i * 0.28).toFixed(2)}s; }\n    .h${i} { animation-delay: ${(0.45 + i * 0.28).toFixed(2)}s; }`
  ).join("\n");

  const alt =
    "Linha do tempo profissional e acadêmica de Pedro César Camargo dos Santos: " +
    ITEMS.map((i) => `${i.year ? i.year + ", " : ""}${i.title}, ${i.org}`).join("; ") + ".";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(alt)}">
  <title>${esc(alt)}</title>

  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.bg0}"/><stop offset="100%" stop-color="${t.bg1}"/>
    </linearGradient>
    <linearGradient id="railGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.tones[0]}"/>
      <stop offset="50%" stop-color="${t.tones[2]}"/>
      <stop offset="100%" stop-color="${t.tones[4]}"/>
    </linearGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${t.grid}" stroke-width="0.5" stroke-opacity="0.08"/>
    </pattern>
  </defs>

  <style>
    /* A trilha se desenha de cima para baixo. */
    @keyframes draw { from { stroke-dashoffset: ${RAIL_LEN}; } to { stroke-dashoffset: 0; } }
    .rail-fill {
      stroke-dasharray: ${RAIL_LEN};
      animation: draw 2.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    /* Cada etapa entra deslizando da esquerda, em sequencia. */
    @keyframes enter { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: translateX(0); } }
    .item { opacity: 0; animation: enter 0.55s cubic-bezier(0.2, 0.7, 0.3, 1) forwards; }

    /* Anel que pulsa uma vez quando a etapa e alcancada. */
    @keyframes halo { 0% { opacity: 0.85; stroke-width: 2; r: 19; } 100% { opacity: 0; stroke-width: 0.5; r: 30; } }
    .halo { opacity: 0; animation: halo 1.1s ease-out forwards; }

${stagger}

    /* Faixa do bloco de mesmo ano, revelada junto com os seus marcos. */
    @keyframes bandIn { from { opacity: 0; } to { opacity: 0.28; } }
    .band { opacity: 0; animation: bandIn 0.7s ease-out 1.05s forwards; }

    /* Brilho continuo percorrendo a trilha — mantem o card vivo apos a entrada. */
    @keyframes travel { 0% { opacity: 0; cy: ${RAIL_TOP}px; } 12% { opacity: 0.9; } 88% { opacity: 0.9; } 100% { opacity: 0; cy: ${RAIL_BOTTOM}px; } }
    .spark { animation: travel 5.5s ease-in-out 2.6s infinite; opacity: 0; }

    /* Vapor da xicara. */
    @keyframes steam { 0% { opacity: 0; transform: translateY(2px); } 40% { opacity: 0.85; } 100% { opacity: 0; transform: translateY(-4px); } }
    .steam { opacity: 0; animation: steam 2.6s ease-out infinite; }
    .s2 { animation-delay: 1.3s; }

    /* Sem movimento: tudo ja visivel, trilha inteira desenhada. */
    @media (prefers-reduced-motion: reduce) {
      .item, .rail-fill, .halo, .spark, .steam, .band { animation: none; }
      .item { opacity: 1; }
      .band { opacity: 0.28; }
      .rail-fill { stroke-dashoffset: 0; }
      .halo, .spark { opacity: 0; }
      .steam { opacity: 0.85; }
    }
  </style>

  <rect width="${W}" height="${H}" rx="14" fill="url(#bg)" stroke="${t.stroke}"/>
  <rect width="${W}" height="${H}" rx="14" fill="url(#grid)"/>

  <!-- Trilha: base apagada + traco colorido que se desenha por cima. -->
  <line x1="${RAIL_X}" y1="${RAIL_TOP}" x2="${RAIL_X}" y2="${RAIL_BOTTOM}" stroke="${t.rail}" stroke-width="2"/>
${groupBand}
  <line class="rail-fill" x1="${RAIL_X}" y1="${RAIL_TOP}" x2="${RAIL_X}" y2="${RAIL_BOTTOM}" stroke="url(#railGrad)" stroke-width="2.5" stroke-linecap="round"/>
  <circle class="spark" cx="${RAIL_X}" cy="${RAIL_TOP}" r="3.5" fill="${t.tones[2]}"/>

  <!-- Trecho tracejado: a trajetoria continua a partir do ultimo marco. -->
  <line x1="${RAIL_X}" y1="${RAIL_BOTTOM + 20}" x2="${RAIL_X}" y2="${FOOT_Y - 10}" stroke="${t.tones[0]}" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.5"/>

${items}

  <circle cx="${RAIL_X}" cy="${FOOT_Y - 4}" r="4.5" fill="none" stroke="${t.tones[0]}" stroke-width="1.5" stroke-dasharray="2.5 2.5"/>
  <text x="146" y="${FOOT_Y}" font-family="${MONO}" font-size="11" fill="${t.org}" letter-spacing="1.6">PRÓXIMO PASSO · ARQUITETURA · SISTEMAS DISTRIBUÍDOS · CLOUD</text>
</svg>
`;
}

for (const [name, theme] of Object.entries(THEMES)) {
  await writeFile(`${OUT}/timeline-${name}.svg`, render(theme), "utf8");
  console.log(`gerado: timeline-${name}.svg  (${W}x${H})`);
}
