// ---------------------------------------------------------------------------
// Gera os cards de estatisticas do README como SVGs versionados neste repo.
//
// Motivo: as instancias publicas compartilhadas (github-readme-stats e afins)
// sofrem com rate limit e ficam fora do ar. Gerando aqui, o README nunca
// depende de um servico de terceiros para renderizar.
//
// Consome apenas a GraphQL API do GitHub, autenticada com o GITHUB_TOKEN
// automatico do Actions — nenhum secret ou PAT precisa ser criado.
//
// Uso: GITHUB_TOKEN=... GITHUB_LOGIN=Pcamargoz node generate-stats.mjs
// Requer Node 20+ (fetch nativo). Sem dependencias externas.
// ---------------------------------------------------------------------------

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOGIN = process.env.GITHUB_LOGIN;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../assets");

if (!LOGIN || !TOKEN) {
  console.error("Faltam as variaveis de ambiente GITHUB_LOGIN e/ou GITHUB_TOKEN.");
  process.exit(1);
}

// --- Temas -----------------------------------------------------------------
// Mesma paleta do cabecalho: verde Spring, azul tecnologico, grafite.
const THEMES = {
  dark: {
    bg0: "#0D1117", bg1: "#161B22", stroke: "#30363D",
    title: "#6DB33F", value: "#E6EDF3", label: "#8B949E",
    accentA: "#6DB33F", accentB: "#58A6FF", track: "#21262D",
  },
  light: {
    bg0: "#FFFFFF", bg1: "#F6F8FA", stroke: "#D0D7DE",
    title: "#4C8C2B", value: "#0F172A", label: "#475569",
    accentA: "#4C8C2B", accentB: "#1E6FD9", track: "#E4E8EC",
  },
};

// Aspas SIMPLES de proposito: estes valores vao dentro de atributos XML
// delimitados por aspas duplas — aspas duplas aqui quebrariam o documento.
const FONT = `'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Menlo, Consolas, monospace`;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmt = (n) => new Intl.NumberFormat("pt-BR").format(n);

// --- API -------------------------------------------------------------------
async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "readme-stats-generator",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

const PROFILE_QUERY = `
  query ($login: String!, $after: String) {
    user(login: $login) {
      createdAt
      followers { totalCount }
      repositories(
        first: 100, after: $after, ownerAffiliations: OWNER,
        isFork: false, privacy: PUBLIC, orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          stargazerCount
          languages(first: 12, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
    }
  }
`;

const CONTRIB_QUERY = `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        restrictedContributionsCount
        contributionCalendar { totalContributions }
      }
    }
  }
`;

async function collect() {
  // 1. Perfil e repositorios (paginado).
  let after = null, repos = [], createdAt, followers, repoCount;
  do {
    const { user } = await gql(PROFILE_QUERY, { login: LOGIN, after });
    createdAt = user.createdAt;
    followers = user.followers.totalCount;
    repoCount = user.repositories.totalCount;
    repos = repos.concat(user.repositories.nodes);
    after = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (after);

  // 2. Contribuicoes: a API so devolve 1 ano por consulta, entao percorremos
  //    ano a ano desde a criacao da conta para chegar ao total de sempre.
  const totals = { commits: 0, prs: 0, issues: 0, reviews: 0, contributions: 0 };
  const startYear = new Date(createdAt).getUTCFullYear();
  const now = new Date();
  for (let y = startYear; y <= now.getUTCFullYear(); y++) {
    const from = new Date(Date.UTC(y, 0, 1)).toISOString();
    const to = new Date(Math.min(Date.UTC(y, 11, 31, 23, 59, 59), now.getTime())).toISOString();
    const { user } = await gql(CONTRIB_QUERY, { login: LOGIN, from, to });
    const c = user.contributionsCollection;
    totals.commits += c.totalCommitContributions + c.restrictedContributionsCount;
    totals.prs += c.totalPullRequestContributions;
    totals.issues += c.totalIssueContributions;
    totals.reviews += c.totalPullRequestReviewContributions;
    totals.contributions += c.contributionCalendar.totalContributions;
  }

  // 3. Estrelas e distribuicao de linguagens por bytes de codigo.
  const stars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);
  const bytes = new Map();
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      const cur = bytes.get(node.name) ?? { size: 0, color: node.color || "#8B949E" };
      cur.size += size;
      bytes.set(node.name, cur);
    }
  }
  const totalBytes = [...bytes.values()].reduce((s, v) => s + v.size, 0) || 1;
  const languages = [...bytes.entries()]
    .map(([name, v]) => ({ name, color: v.color, pct: (v.size / totalBytes) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);

  return { ...totals, stars, repoCount, followers, languages, generatedAt: now };
}

// --- Renderizacao ----------------------------------------------------------
function shell(w, h, t, title, subtitle, body, ariaLabel) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(ariaLabel)}">
  <title>${esc(ariaLabel)}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.bg0}"/><stop offset="100%" stop-color="${t.bg1}"/>
    </linearGradient>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${t.accentA}"/><stop offset="100%" stop-color="${t.accentB}"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="url(#bg)" stroke="${t.stroke}"/>
  <path d="M12 1 H${w - 12} A11 11 0 0 1 ${w - 1} 12 V4 H1 V12 A11 11 0 0 1 12 1 Z" fill="url(#acc)"/>
  <rect x="1" y="1" width="${w - 2}" height="4" fill="url(#acc)"/>
  <text x="26" y="42" font-family="${FONT}" font-size="17" font-weight="700" fill="${t.title}">${esc(title)}</text>
  <text x="26" y="62" font-family="${MONO}" font-size="11" fill="${t.label}" letter-spacing="1.2">${esc(subtitle)}</text>
  ${body}
</svg>
`;
}

function renderStats(d, t) {
  const rows = [
    ["Contribuições totais", d.contributions],
    ["Commits", d.commits],
    ["Pull requests", d.prs],
    ["Code reviews", d.reviews],
    ["Issues", d.issues],
    ["Repositórios públicos", d.repoCount],
  ];
  const body = rows
    .map(([label, value], i) => {
      const y = 96 + i * 27;
      return `  <circle cx="30" cy="${y - 5}" r="3" fill="${i === 0 ? t.accentA : t.accentB}" opacity="${i === 0 ? 1 : 0.55}"/>
  <text x="44" y="${y}" font-family="${FONT}" font-size="13.5" fill="${t.label}">${esc(label)}</text>
  <text x="${480 - 26}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="15" font-weight="700" fill="${t.value}">${fmt(value)}</text>`;
    })
    .join("\n");
  const alt = `Estatísticas do GitHub de ${LOGIN}: ${rows.map(([l, v]) => `${l} ${fmt(v)}`).join(", ")}.`;
  return shell(480, 272, t, `Atividade no GitHub`, `@${LOGIN.toUpperCase()}`, body, alt);
}

function renderLangs(d, t) {
  const W = 420, x0 = 26, barW = W - 52;
  // Barra empilhada com as proporcoes reais.
  let cursor = x0;
  const bar = d.languages
    .map((l) => {
      const w = Math.max((l.pct / 100) * barW, 1.5);
      const seg = `  <rect x="${cursor.toFixed(2)}" y="82" width="${w.toFixed(2)}" height="9" fill="${l.color}"/>`;
      cursor += w;
      return seg;
    })
    .join("\n");

  // Legenda em duas colunas, para caber bem em telas estreitas.
  const legend = d.languages
    .map((l, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = x0 + col * (barW / 2), y = 118 + row * 24;
      return `  <circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${l.color}"/>
  <text x="${x + 18}" y="${y}" font-family="${FONT}" font-size="12.5" fill="${t.value}">${esc(l.name)}</text>
  <text x="${x + barW / 2 - 12}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${t.label}">${l.pct.toFixed(1)}%</text>`;
    })
    .join("\n");

  const rows = Math.ceil(d.languages.length / 2);
  const H = 118 + rows * 24 + 34;
  const note = `  <rect x="${x0}" y="${H - 30}" width="${barW}" height="1" fill="${t.track}"/>
  <text x="${x0}" y="${H - 12}" font-family="${FONT}" font-size="10.5" fill="${t.label}">Volume de código por linguagem — não indica nível de domínio.</text>`;
  const alt = `Distribuição de linguagens nos repositórios públicos de ${LOGIN}: ${d.languages.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", ")}.`;
  return shell(W, H, t, "Linguagens nos repositórios", "POR VOLUME DE CÓDIGO", `${bar}\n${legend}\n${note}`, alt);
}

// --- Execucao --------------------------------------------------------------
const data = await collect();
await mkdir(OUT_DIR, { recursive: true });

for (const [name, theme] of Object.entries(THEMES)) {
  await writeFile(`${OUT_DIR}/stats-${name}.svg`, renderStats(data, theme), "utf8");
  await writeFile(`${OUT_DIR}/langs-${name}.svg`, renderLangs(data, theme), "utf8");
}

console.log(
  `Cards gerados: ${data.contributions} contribuições, ${data.commits} commits, ` +
    `${data.repoCount} repos, ${data.languages.length} linguagens.`
);
