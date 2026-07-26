// ---------------------------------------------------------------------------
// Gera os cards de estatisticas do README como SVGs versionados neste repo.
//
// Motivo: as instancias publicas compartilhadas (github-readme-stats e afins)
// sofrem com rate limit e ficam fora do ar. Gerando aqui, o README nunca
// depende de um servico de terceiros para renderizar.
//
// Duas fontes de dados, escolhidas automaticamente:
//   - COM GITHUB_TOKEN  -> GraphQL API. Numeros completos (inclui code reviews
//     e o total do calendario de contribuicoes). E o caminho usado no Actions,
//     com o GITHUB_TOKEN automatico do job — nenhum secret precisa ser criado.
//   - SEM token         -> REST + Search API publica. Numeros um pouco mais
//     enxutos, mas permite gerar os cards na maquina local sem configurar nada.
//
// Uso no Actions:  GITHUB_TOKEN=... GITHUB_LOGIN=Pcamargoz node generate-stats.mjs
// Uso local:       GITHUB_LOGIN=Pcamargoz node .github/scripts/generate-stats.mjs
// Requer Node 20+ (fetch nativo). Sem dependencias externas.
// ---------------------------------------------------------------------------

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOGIN = process.env.GITHUB_LOGIN;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../assets");

if (!LOGIN) {
  console.error("Falta a variavel de ambiente GITHUB_LOGIN.");
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
// Cores oficiais do Linguist. A GraphQL devolve a cor junto com a linguagem,
// mas o caminho REST (e o fallback por rate limit) nao devolve — sem este mapa
// o card sairia inteiro em cinza.
const LANG_COLORS = {
  Java: "#b07219", HTML: "#e34c26", CSS: "#663399", TypeScript: "#3178c6",
  JavaScript: "#f1e05a", Python: "#3572A5", Dockerfile: "#384d54", Shell: "#89e051",
  SCSS: "#c6538c", Kotlin: "#A97BFF", "C#": "#178600", PHP: "#4F5D95", Go: "#00ADD8",
  Ruby: "#701516", Rust: "#dea584", Vue: "#41b883", Svelte: "#ff3e00", Makefile: "#427819",
  PLpgSQL: "#336790", TSQL: "#e38c00", Batchfile: "#C1F12E", PowerShell: "#012456",
  "Jupyter Notebook": "#DA5B0B", EJS: "#a91e50", Handlebars: "#f7931e", Procfile: "#a0a0a0",
};
const DEFAULT_COLOR = "#8B949E";

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

// Distribuicao de linguagens como COMPOSICAO MEDIA POR REPOSITORIO.
//
// Somar bytes de todos os repositorios seria enganoso: um unico projeto com um
// HTML gigante afunda todo o resto do perfil. Aqui cada repositorio e
// normalizado para peso 1 e contribui com a sua propria composicao interna, de
// modo que a media reflita no que a pessoa trabalha — nao qual arquivo e maior.
//
// Recebe um array de repositorios, cada um com sua lista de {name, size, color}.
function summariseLanguages(perRepo) {
  const acc = new Map();
  let counted = 0;

  for (const langs of perRepo) {
    const total = langs.reduce((s, l) => s + l.size, 0);
    if (!total) continue; // repositorio sem codigo detectado
    counted++;
    for (const { name, size, color } of langs) {
      const known = color || LANG_COLORS[name] || DEFAULT_COLOR;
      const cur = acc.get(name) ?? { share: 0, color: known };
      cur.share += size / total; // fracao dentro do proprio repositorio
      cur.color = known;
      acc.set(name, cur);
    }
  }

  if (!counted) return [];
  return [...acc.entries()]
    .map(([name, v]) => ({ name, color: v.color, pct: (v.share / counted) * 100 }))
    .filter((l) => l.pct >= 0.05) // evita entradas que exibiriam "0.0%"
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);
}

// --- Coleta sem token: REST + Search API publica ----------------------------
async function rest(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "readme-stats-generator" },
  });
  if (!res.ok) throw new Error(`REST HTTP ${res.status} em ${path}: ${await res.text()}`);
  return res.json();
}

async function collectViaRest() {
  const user = await rest(`/users/${LOGIN}`);

  // Repositorios proprios, ignorando forks.
  let repos = [], page = 1;
  for (;;) {
    const batch = await rest(`/users/${LOGIN}/repos?per_page=100&page=${page}&type=owner`);
    repos = repos.concat(batch.filter((r) => !r.fork));
    if (batch.length < 100) break;
    page++;
  }

  // Bytes por linguagem: uma chamada por repositorio. Sem autenticacao o limite
  // e de 60 chamadas por hora — se estourar, cai para a linguagem dominante de
  // cada repo, que ja veio na listagem e nao custa requisicao nenhuma.
  let perRepo = [];
  try {
    for (const repo of repos) {
      const langs = await rest(`/repos/${LOGIN}/${repo.name}/languages`);
      perRepo.push(Object.entries(langs).map(([name, size]) => ({ name, size })));
    }
  } catch (err) {
    if (!String(err.message).includes("HTTP 403")) throw err;
    console.warn("Rate limit atingido — usando a linguagem dominante de cada repositorio.");
    perRepo = repos.filter((r) => r.language).map((r) => [{ name: r.language, size: 1 }]);
  }

  // Search API: totais de commits e pull requests em repositorios publicos.
  const commits = await rest(`/search/commits?q=author:${LOGIN}&per_page=1`);
  const prs = await rest(`/search/issues?q=author:${LOGIN}+type:pr&per_page=1`);
  const issues = await rest(`/search/issues?q=author:${LOGIN}+type:issue&per_page=1`);

  return {
    contributions: null, // exclusivo da GraphQL
    reviews: null, //       exclusivo da GraphQL
    commits: commits.total_count,
    prs: prs.total_count,
    issues: issues.total_count,
    stars: repos.reduce((s, r) => s + r.stargazers_count, 0),
    repoCount: user.public_repos,
    followers: user.followers,
    languages: summariseLanguages(perRepo),
    source: "REST",
  };
}

// --- Coleta com token: GraphQL ---------------------------------------------
async function collectViaGraphQL() {
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

  // 3. Estrelas e composicao de linguagens, mantida agrupada por repositorio.
  const stars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);
  const perRepo = repos.map((repo) =>
    repo.languages.edges.map(({ size, node }) => ({ name: node.name, size, color: node.color }))
  );

  return {
    ...totals,
    stars,
    repoCount,
    followers,
    languages: summariseLanguages(perRepo),
    source: "GraphQL",
  };
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
  // Linhas com valor null vem de metricas que so a GraphQL fornece: quando a
  // coleta foi via REST elas simplesmente nao entram no card.
  const rows = [
    ["Contribuições totais", d.contributions],
    ["Commits", d.commits],
    ["Pull requests", d.prs],
    ["Code reviews", d.reviews],
    ["Issues", d.issues],
    ["Repositórios públicos", d.repoCount],
    ["Estrelas recebidas", d.stars],
  ].filter(([, value]) => value !== null && value !== undefined);

  const body = rows
    .map(([label, value], i) => {
      const y = 96 + i * 27;
      return `  <circle cx="30" cy="${y - 5}" r="3" fill="${i === 0 ? t.accentA : t.accentB}" opacity="${i === 0 ? 1 : 0.55}"/>
  <text x="44" y="${y}" font-family="${FONT}" font-size="13.5" fill="${t.label}">${esc(label)}</text>
  <text x="${480 - 26}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="15" font-weight="700" fill="${t.value}">${fmt(value)}</text>`;
    })
    .join("\n");
  const alt = `Estatísticas do GitHub de ${LOGIN}: ${rows.map(([l, v]) => `${l} ${fmt(v)}`).join(", ")}.`;
  // Altura acompanha o numero de linhas efetivamente renderizadas.
  return shell(480, 96 + rows.length * 27 + 22, t, "Atividade no GitHub", `@${LOGIN.toUpperCase()}`, body, alt);
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
  <text x="${x0}" y="${H - 12}" font-family="${FONT}" font-size="10.5" fill="${t.label}">Cada repositório pesa igual, para nenhum projeto isolado distorcer o resultado.</text>`;
  const alt = `Composição média de linguagens por repositório público de ${LOGIN}: ${d.languages.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", ")}.`;
  return shell(W, H, t, "Linguagens nos repositórios", "COMPOSIÇÃO MÉDIA POR REPOSITÓRIO", `${bar}\n${legend}\n${note}`, alt);
}

// --- Execucao --------------------------------------------------------------
const data = TOKEN ? await collectViaGraphQL() : await collectViaRest();
await mkdir(OUT_DIR, { recursive: true });

for (const [name, theme] of Object.entries(THEMES)) {
  await writeFile(`${OUT_DIR}/stats-${name}.svg`, renderStats(data, theme), "utf8");
  await writeFile(`${OUT_DIR}/langs-${name}.svg`, renderLangs(data, theme), "utf8");
}

console.log(
  `Cards gerados via ${data.source}: ${fmt(data.commits)} commits, ${fmt(data.prs)} PRs, ` +
    `${fmt(data.repoCount)} repos, ${data.languages.length} linguagens.`
);
