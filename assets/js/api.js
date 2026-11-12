const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const TIMEOUT_MS = 10000;
const TAMANHO_MINIMO_CIDADE = 2;
const HORA_AMANHECER = 6;
const HORA_ANOITECER = 18;
const DIA = 1; // valor de "is_day" retornado pela API quando é dia

// Tipos de erro tratados pelo app (evita strings digitadas à mão)
const TIPO_ERRO = Object.freeze({
  VALIDACAO: "validacao",         // entrada do usuário inválida
  NAO_ENCONTRADA: "nao_encontrada", // cidade inexistente
  REDE: "rede",
  TIMEOUT: "timeout",
  LIMITE: "limite",               // HTTP 429
  API: "api",                     // erro HTTP ou resposta fora do formato esperado
});

// Códigos WMO (weather_code) -> descrição em português e ícones (Weather Icons)
const CLIMA = {
  0:  { descricao: "Céu limpo",                    dia: "wi-day-sunny",         noite: "wi-night-clear" },
  1:  { descricao: "Predominantemente limpo",      dia: "wi-day-cloudy",        noite: "wi-night-alt-cloudy" },
  2:  { descricao: "Parcialmente nublado",         dia: "wi-day-cloudy",        noite: "wi-night-alt-cloudy" },
  3:  { descricao: "Nublado",                      dia: "wi-cloudy",            noite: "wi-cloudy" },
  45: { descricao: "Neblina",                      dia: "wi-day-fog",           noite: "wi-night-fog" },
  48: { descricao: "Neblina com geada",            dia: "wi-day-fog",           noite: "wi-night-fog" },
  51: { descricao: "Garoa fraca",                  dia: "wi-day-sprinkle",      noite: "wi-night-alt-sprinkle" },
  53: { descricao: "Garoa moderada",               dia: "wi-day-sprinkle",      noite: "wi-night-alt-sprinkle" },
  55: { descricao: "Garoa intensa",                dia: "wi-day-sprinkle",      noite: "wi-night-alt-sprinkle" },
  56: { descricao: "Garoa congelante fraca",       dia: "wi-day-sleet",         noite: "wi-night-alt-sleet" },
  57: { descricao: "Garoa congelante intensa",     dia: "wi-day-sleet",         noite: "wi-night-alt-sleet" },
  61: { descricao: "Chuva fraca",                  dia: "wi-day-rain",          noite: "wi-night-alt-rain" },
  63: { descricao: "Chuva moderada",               dia: "wi-day-rain",          noite: "wi-night-alt-rain" },
  65: { descricao: "Chuva forte",                  dia: "wi-rain",              noite: "wi-rain" },
  66: { descricao: "Chuva congelante fraca",       dia: "wi-day-rain-mix",      noite: "wi-night-alt-rain-mix" },
  67: { descricao: "Chuva congelante forte",       dia: "wi-day-rain-mix",      noite: "wi-night-alt-rain-mix" },
  71: { descricao: "Neve fraca",                   dia: "wi-day-snow",          noite: "wi-night-alt-snow" },
  73: { descricao: "Neve moderada",                dia: "wi-day-snow",          noite: "wi-night-alt-snow" },
  75: { descricao: "Neve forte",                   dia: "wi-snow",              noite: "wi-snow" },
  77: { descricao: "Grãos de neve",                dia: "wi-day-snow",          noite: "wi-night-alt-snow" },
  80: { descricao: "Pancadas de chuva fracas",     dia: "wi-day-showers",       noite: "wi-night-alt-showers" },
  81: { descricao: "Pancadas de chuva moderadas",  dia: "wi-day-showers",       noite: "wi-night-alt-showers" },
  82: { descricao: "Pancadas de chuva violentas",  dia: "wi-showers",           noite: "wi-showers" },
  85: { descricao: "Pancadas de neve fracas",      dia: "wi-day-snow",          noite: "wi-night-alt-snow" },
  86: { descricao: "Pancadas de neve fortes",      dia: "wi-snow",              noite: "wi-snow" },
  95: { descricao: "Tempestade",                   dia: "wi-day-thunderstorm",  noite: "wi-night-alt-thunderstorm" },
  96: { descricao: "Tempestade com granizo fraco", dia: "wi-day-hail",          noite: "wi-night-alt-hail" },
  99: { descricao: "Tempestade com granizo forte", dia: "wi-day-hail",          noite: "wi-night-alt-hail" },
};

const CLIMA_DESCONHECIDO = { descricao: "Condição desconhecida", dia: "wi-na", noite: "wi-na" };

// Erro com mensagem amigável para o usuário; `opcoes.cause` guarda o erro original
class ErroApp extends Error {
  constructor(mensagem, tipo, opcoes) {
    super(mensagem, opcoes);
    this.name = "ErroApp";
    this.tipo = tipo;
  }
}

// Monta uma URL com os parâmetros já codificados
function montarURL(base, parametros) {
  const url = new URL(base);
  url.search = new URLSearchParams(parametros).toString();
  return url;
}

// Converte respostas HTTP de erro em ErroApp
function verificarStatus(resposta) {
  if (resposta.status === 429) {
    throw new ErroApp(
      "Limite de requisições da API excedido. Aguarde um pouco e tente novamente.",
      TIPO_ERRO.LIMITE
    );
  }
  if (!resposta.ok) {
    throw new ErroApp(
      `O serviço de clima está com problemas (erro ${resposta.status}). Tente novamente em instantes.`,
      TIPO_ERRO.API
    );
  }
}

// Único ponto que traduz qualquer falha (fetch, abort, JSON) em ErroApp
function traduzirErro(erro) {
  if (erro instanceof ErroApp) return erro;

  if (erro?.name === "AbortError") {
    return new ErroApp("A consulta demorou demais para responder. Tente novamente.", TIPO_ERRO.TIMEOUT, { cause: erro });
  }
  if (erro instanceof SyntaxError) {
    return new ErroApp("A API retornou uma resposta inválida. Tente novamente.", TIPO_ERRO.API, { cause: erro });
  }
  return new ErroApp(
    "Erro de rede. Verifique sua conexão com a internet e tente novamente.",
    TIPO_ERRO.REDE,
    { cause: erro }
  );
}

// Requisição GET com timeout que cobre a resposta inteira (cabeçalhos + corpo)
async function buscarJSON(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resposta = await fetch(url, { signal: controller.signal });
    verificarStatus(resposta);
    return await resposta.json();
  } catch (erro) {
    throw traduzirErro(erro);
  } finally {
    clearTimeout(timer);
  }
}

// Valida o nome digitado antes de consultar a API
function validarCidade(cidade) {
  const texto = typeof cidade === "string" ? cidade.trim() : "";

  if (texto.length === 0) {
    throw new ErroApp("Digite o nome de uma cidade.", TIPO_ERRO.VALIDACAO);
  }
  if (texto.length < TAMANHO_MINIMO_CIDADE || !/\p{L}/u.test(texto)) {
    throw new ErroApp(
      `Nome de cidade inválido. Digite pelo menos ${TAMANHO_MINIMO_CIDADE} letras.`,
      TIPO_ERRO.VALIDACAO
    );
  }
  return texto;
}

// API de Geocodificação: nome da cidade -> latitude/longitude
async function buscarCoordenadas(cidade) {
  const url = montarURL(GEOCODING_URL, { name: cidade, count: 1, language: "pt", format: "json" });
  const dados = await buscarJSON(url);

  if (!Array.isArray(dados?.results) || dados.results.length === 0) {
    throw new ErroApp(
      `Cidade "${cidade}" não encontrada. Verifique o nome e tente novamente.`,
      TIPO_ERRO.NAO_ENCONTRADA
    );
  }

  const { name, admin1, country, latitude, longitude } = dados.results[0];

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new ErroApp("A API retornou coordenadas inválidas. Tente novamente.", TIPO_ERRO.API);
  }

  return { nome: name || cidade, estado: admin1, pais: country, latitude, longitude };
}

// API de previsão: latitude/longitude -> temperatura, código do clima e dia/noite
async function buscarClima(latitude, longitude) {
  const url = montarURL(FORECAST_URL, {
    latitude,
    longitude,
    current: "temperature_2m,weather_code,is_day",
    timezone: "auto",
  });
  const dados = await buscarJSON(url);

  if (typeof dados?.current?.temperature_2m !== "number") {
    throw new ErroApp("A API não retornou os dados do clima. Tente novamente.", TIPO_ERRO.API);
  }

  return {
    temperatura: dados.current.temperature_2m,
    codigo: dados.current.weather_code,
    ehDia: dados.current.is_day === DIA,
  };
}

/**
 * Fluxo completo: valida o nome, geocodifica (cidade -> latitude/longitude)
 * e consulta o clima atual.
 *
 * @async
 * @param {string} entrada - Nome da cidade digitado pelo usuário.
 * @returns {Promise<{
 *   local: {nome: string, estado?: string, pais?: string, latitude: number, longitude: number},
 *   clima: {temperatura: number, codigo: number, ehDia: boolean}
 * }>} Local encontrado e condições atuais: `temperatura` em °C, `codigo` é o
 *   weather_code WMO e `ehDia` indica se é dia no local.
 * @throws {ErroApp} `TIPO_ERRO.VALIDACAO` se o nome for vazio ou inválido (a API não é chamada).
 * @throws {ErroApp} `TIPO_ERRO.NAO_ENCONTRADA` se a cidade não existir.
 * @throws {ErroApp} `TIPO_ERRO.TIMEOUT`, `REDE`, `LIMITE` ou `API` em falhas nas requisições.
 *
 * @example
 * try {
 *   const { local, clima } = await buscarPrevisao("São Paulo");
 *   console.log(`${local.nome}: ${clima.temperatura}°C`);
 * } catch (erro) {
 *   if (erro instanceof ErroApp) console.warn(erro.tipo, erro.message);
 *   else throw erro;
 * }
 */
async function buscarPrevisao(entrada) {
  const cidade = validarCidade(entrada);
  const local = await buscarCoordenadas(cidade);
  const clima = await buscarClima(local.latitude, local.longitude);
  return { local, clima };
}

// Descrição e ícones para um código WMO (com fallback para códigos desconhecidos)
function obterInfoClima(codigo) {
  return CLIMA[codigo] || CLIMA_DESCONHECIDO;
}

// Data e hora completas da consulta
function formatarDataHora(data) {
  const dia = data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}


// Interface (só roda no navegador; nos testes com Jest em ambiente "node" é ignorada)
function iniciarInterface() {
  const form = document.getElementById("form-cidade");
  const inputCidade = document.getElementById("cidade");
  const botao = form.querySelector("button");
  const secaoResultado = document.getElementById("resultado");
  const elIcone = document.getElementById("icone-clima");
  const elNomeCidade = document.getElementById("nome-cidade");
  const elLocal = document.getElementById("local-detalhe");
  const elTemperatura = document.getElementById("temperatura");
  const elDescricao = document.getElementById("descricao-clima");
  const elDataHora = document.getElementById("data-hora");
  const elMensagem = document.getElementById("mensagem");

  // Fundo escuro à noite e claro de dia
  function aplicarTema(ehDia) {
    document.body.dataset.tema = ehDia ? "dia" : "noite";
  }

  function mostrarMensagem(texto, ehErro = false) {
    elMensagem.textContent = texto;
    elMensagem.classList.toggle("erro", ehErro);
  }

  function exibirResultado(local, clima, consultadoEm) {
    const info = obterInfoClima(clima.codigo);

    elIcone.className = `wi ${clima.ehDia ? info.dia : info.noite} icone-clima`;
    elNomeCidade.textContent = local.nome;
    elLocal.textContent = [local.estado, local.pais].filter(Boolean).join(", ");
    elTemperatura.textContent = `${Math.round(clima.temperatura)}°C`;
    elDescricao.textContent = info.descricao;
    elDataHora.textContent = formatarDataHora(consultadoEm);

    aplicarTema(clima.ehDia);
    secaoResultado.hidden = false;
  }

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    botao.disabled = true;
    secaoResultado.hidden = true;
    mostrarMensagem("Buscando...");

    try {
      const { local, clima } = await buscarPrevisao(inputCidade.value);
      exibirResultado(local, clima, new Date());
      mostrarMensagem("");
    } catch (erro) {
      if (erro instanceof ErroApp) {
        mostrarMensagem(erro.message, true);
      } else {
        console.error(erro);
        mostrarMensagem("Ocorreu um erro inesperado. Tente novamente.", true);
      }
    } finally {
      botao.disabled = false;
    }
  });

  // Tema inicial pelo horário local do usuário (antes de qualquer consulta)
  const hora = new Date().getHours();
  aplicarTema(hora >= HORA_AMANHECER && hora < HORA_ANOITECER);
}

if (typeof document !== "undefined") {
  iniciarInterface();
}

// Exportação para os testes (Jest/Node). No navegador "module" não existe e este bloco é ignorado.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TIMEOUT_MS,
    TIPO_ERRO,
    ErroApp,
    buscarJSON,
    validarCidade,
    buscarCoordenadas,
    buscarClima,
    buscarPrevisao,
    obterInfoClima,
    formatarDataHora,
  };
}