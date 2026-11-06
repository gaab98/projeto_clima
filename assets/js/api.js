const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
 
const form = document.getElementById("form-cidade");
const inputCidade = document.getElementById("cidade");
const botao = form.querySelector("button");
const secaoResultado = document.getElementById("resultado");
const elNomeCidade = document.getElementById("nome-cidade");
const elLocal = document.getElementById("local-detalhe");
const elTemperatura = document.getElementById("temperatura");
const elMensagem = document.getElementById("mensagem");
 
// Converte o nome da cidade em coordenadas (latitude/longitude)
async function buscarCoordenadas(cidade) {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(cidade)}&count=1&language=pt&format=json`;
  const resposta = await fetch(url);
 
  if (!resposta.ok) {
    throw new Error("Não foi possível buscar a cidade. Tente novamente.");
  }
 
  const dados = await resposta.json();
 
  if (!dados.results || dados.results.length === 0) {
    throw new Error(`Cidade "${cidade}" não encontrada.`);
  }
 
  return dados.results[0];
}
 
// Obtém a temperatura atual a partir das coordenadas
async function buscarTemperatura(latitude, longitude) {
  const url = `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`;
  const resposta = await fetch(url);
 
  if (!resposta.ok) {
    throw new Error("Não foi possível obter os dados do clima.");
  }
 
  const dados = await resposta.json();
  return {
    temperatura: dados.current.temperature_2m,
    unidade: dados.current_units.temperature_2m,
  };
}
 
function mostrarMensagem(texto, ehErro = false) {
  elMensagem.textContent = texto;
  elMensagem.classList.toggle("erro", ehErro);
}
 
function exibirResultado(local, clima) {
  elNomeCidade.textContent = local.name;
  elLocal.textContent = [local.admin1, local.country].filter(Boolean).join(", ");
  elTemperatura.textContent = `${Math.round(clima.temperatura)}${clima.unidade}`;
  secaoResultado.hidden = false;
}
 
form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
 
  const cidade = inputCidade.value.trim();
  if (!cidade) return;
 
  botao.disabled = true;
  secaoResultado.hidden = true;
  mostrarMensagem("Buscando...");
 
  try {
    const local = await buscarCoordenadas(cidade);
    const clima = await buscarTemperatura(local.latitude, local.longitude);
    exibirResultado(local, clima);
    mostrarMensagem("");
  } catch (erro) {
    mostrarMensagem(erro.message || "Ocorreu um erro inesperado.", true);
  } finally {
    botao.disabled = false;
  }
});