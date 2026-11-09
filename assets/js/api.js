const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 10000;

// Elementos da página
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

// Erro com mensagem amigável para exibir ao usuário
class ErroApp extends Error {
  constructor(mensagem, tipo) {
    super(mensagem);
    this.tipo = tipo; // "cidade" | "rede" | "timeout" | "api"
  }
}

// Faz a requisição e trata falhas de rede, timeout e erros da API
async function buscarJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resposta;
  try {
    resposta = await fetch(url, { signal: controller.signal });
  } catch (erro) {
    if (erro.name === "AbortError") {
      throw new ErroApp("A consulta demorou demais para responder. Tente novamente.", "timeout");
    }
    throw new ErroApp("Erro de rede. Verifique sua conexão com a internet e tente novamente.", "rede");
  } finally {
    clearTimeout(timer);
  }

  if (!resposta.ok) {
    throw new ErroApp(
      `O serviço de clima está com problemas (erro ${resposta.status}). Tente novamente em instantes.`,
      "api"
    );
  }

  try {
    return await resposta.json();
  } catch {
    throw new ErroApp("A API retornou uma resposta inválida. Tente novamente.", "api");
  }
}

// Valida o nome digitado antes de consultar a API
function validarCidade(cidade) {
  if (cidade.length < 2 || !/\p{L}/u.test(cidade)) {
    throw new ErroApp("Nome de cidade inválido. Digite pelo menos 2 letras.", "cidade");
  }
}

// API de Geocodificação: nome da cidade -> latitude/longitude
async function buscarCoordenadas(cidade) {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(cidade)}&count=1&language=pt&format=json`;
  const dados = await buscarJSON(url);

  if (!dados.results || dados.results.length === 0) {
    throw new ErroApp(`Cidade "${cidade}" não encontrada. Verifique o nome e tente novamente.`, "cidade");
  }

  const { name, admin1, country, latitude, longitude } = dados.results[0];
  return { nome: name, estado: admin1, pais: country, latitude, longitude };
}

// API de previsão: latitude/longitude -> temperatura, código do clima e dia/noite
async function buscarClima(latitude, longitude) {
  const url =
    `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,weather_code,is_day&timezone=auto`;
  const dados = await buscarJSON(url);

  if (!dados.current || typeof dados.current.temperature_2m !== "number") {
    throw new ErroApp("A API não retornou os dados do clima. Tente novamente.", "api");
  }

  return {
    temperatura: dados.current.temperature_2m,
    codigo: dados.current.weather_code,
    ehDia: dados.current.is_day === 1,
  };
}

// Data e hora completas da consulta, ex.: "segunda-feira, 9 de novembro de 2026 às 15:53"
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

// Fundo escuro à noite e claro de dia
function aplicarTema(ehDia) {
  document.body.dataset.tema = ehDia ? "dia" : "noite";
}

// Tema inicial pelo horário local do usuário (antes de qualquer consulta)
function aplicarTemaPeloRelogio() {
  const hora = new Date().getHours();
  aplicarTema(hora >= 6 && hora < 18);
}

function mostrarMensagem(texto, ehErro = false) {
  elMensagem.textContent = texto;
  elMensagem.classList.toggle("erro", ehErro);
}

function exibirResultado(local, clima, consultadoEm) {
  const info = CLIMA[clima.codigo] || CLIMA_DESCONHECIDO;

  elIcone.className = `wi ${clima.ehDia ? info.dia : info.noite}`;
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

  const cidade = inputCidade.value.trim();

  botao.disabled = true;
  secaoResultado.hidden = true;
  mostrarMensagem("Buscando...");

  try {
    validarCidade(cidade);
    const local = await buscarCoordenadas(cidade);
    const clima = await buscarClima(local.latitude, local.longitude);
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

aplicarTemaPeloRelogio();