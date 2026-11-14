# ClimaStats - Aplicação de Previsão do Tempo

Aplicação web de previsão do tempo feito com **HTML, CSS e JavaScript**. Você digita o nome de uma cidade e o app mostra a temperatura atual, a descrição do clima e um ícone correspondente, usando a API gratuita do [Open-Meteo](https://open-meteo.com/).

## Funcionalidades

- Busca por nome de cidade (geocodificação via Open-Meteo)
- Exibe nome da cidade, estado/país, **temperatura em °C** e **descrição do clima** em português
- **Umidade**, **velocidade do vento** e **precipitação** atuais
- **Previsão dos próximos 5 dias**, com descrição do clima, temperatura máxima e mínima e chuva prevista de cada dia
- Máxima e mínima de hoje em destaque, ao lado da temperatura atual
- Ícones do clima com a biblioteca [Weather Icons](https://erikflowers.github.io/weather-icons/), com versão de dia e de noite
- Data e hora completas da consulta (ex.: *segunda-feira, 9 de novembro de 2026 às 15:53*)
- Fundo **claro de dia** e **escuro à noite**, de acordo com o horário da cidade consultada
- Tratamento de erros: nome inválido, cidade não encontrada, falha da API, limite de requisições, timeout e erro de rede

## Tecnologias Utilizadas

- HTML5, CSS3 e JavaScript.
- [Open-Meteo](https://open-meteo.com/) (APIs de Geocodificação e Previsão)
- [Weather Icons](https://erikflowers.github.io/weather-icons/) (via CDN)
- Fonte [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) (Google Fonts)
- [Jest](https://jestjs.io/) para testes

## Estrutura do projeto

```
projeto_clima/
├── index.html
├── README.md
├── NOTICE.md
├── assets/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── api.js
└── tests/
    └── api.test.js
```

## Como rodar o projeto localmente

**1. Clone o projeto e entre na pasta**
```bash
git clone https://github.com/gaab98/projeto_clima.git
cd projeto_clima
```

**2. Rode o app**
Siga uma das opções da seção [Como executar](#como-executar) abaixo. O app não precisa de instalação nem de chave de API.

**3. Rode os testes**
```bash
npm install
npm test
```
Se tudo estiver certo, o Jest mostra os 11 testes passando (`Tests: 11 passed, 11 total`).

## Como executar

**Opção 1: direto no navegador**
Dê um duplo clique no `index.html`.

**Opção 2: VS Code com Live Server**
1. Abra a pasta do projeto no VS Code.
2. Instale a extensão **Live Server** (Ritwick Dey).
3. Clique com o botão direito no `index.html` e escolha **Open with Live Server**.

**Opção 3: servidor local pelo terminal**
```bash
python -m http.server 8000
# acesse http://localhost:8000
```

## Como funciona

1. O nome digitado é validado (não pode ser vazio, precisa de pelo menos 2 caracteres e conter letras).
2. A **API de Geocodificação** converte o nome em latitude e longitude:
   `https://geocoding-api.open-meteo.com/v1/search?name=...&count=1&language=pt`
3. A **API de Previsão** retorna, numa única chamada, o clima atual (temperatura, umidade, vento, precipitação, código WMO e se é dia ou noite) e o resumo diário de hoje e dos próximos 5 dias (máxima, mínima e chuva total):
   `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&current=...&daily=...&forecast_days=6&timezone=auto`
4. O código WMO é traduzido para uma descrição em português e um ícone, e o tema da página é ajustado.

A função principal é `buscarPrevisao(cidade)`, em `assets/js/api.js`:

```js
try {
  const { local, clima } = await buscarPrevisao("São Paulo");
  console.log(`${local.nome}: ${clima.temperatura}°C`);
} catch (erro) {
  if (erro instanceof ErroApp) console.warn(erro.tipo, erro.message);
  else throw erro;
}
```

## Tratamento de erros

Todas as falhas esperadas são lançadas como `ErroApp`, com uma mensagem amigável e um `tipo`:

| Tipo | Quando acontece |
|---|---|
| `validacao` | Entrada vazia ou nome inválido (a API nem é chamada) |
| `nao_encontrada` | A cidade não existe na geocodificação |
| `rede` | Sem conexão ou falha de rede |
| `timeout` | A API demorou mais de 10 segundos |
| `limite` | Limite de requisições excedido (HTTP 429) |
| `api` | Erro HTTP da API ou resposta fora do formato esperado |

## Testes

Os testes unitários usam o [Jest](https://jestjs.io/) e simulam o `fetch`, então **não fazem chamadas reais à API**.

```bash
npm install
npm test
```

Cenários cobertos em `tests/api.test.js`:

| # | Cenário |
|---|---|
| 1 | Cidade válida retorna dados meteorológicos |
| 2 | Cidade inexistente lança exceção tratada |
| 3 | Entrada vazia retorna erro de validação |
| 4 | Falha da API (erro HTTP ou timeout) |
| 5 | Limite de requisições excedido (429) |
| 6 | Conexão de rede lenta ou instável |
| 7 | Mudança inesperada no formato do JSON |
| 8 | Previsão dos próximos 5 dias com máxima e mínima |
| 9 | Previsão fora do formato esperado gera erro de API |
| 10 | Dia da semana correto na data da previsão (sem erro de fuso horário) |
| 11 | Umidade, vento e precipitação |

## Créditos

Dados meteorológicos fornecidos por [Open-Meteo](https://open-meteo.com/). Outras atribuições em [NOTICE.md](NOTICE.md).