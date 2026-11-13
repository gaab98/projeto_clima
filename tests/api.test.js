/**
 * @jest-environment node
 */
const { TIPO_ERRO, buscarJSON, buscarPrevisao, formatarDiaSemana } = require("../assets/js/api");

const ENDERECO = "https://exemplo.com";
const GEOCODING = {
  results: [{ name: "São Paulo", admin1: "São Paulo", country: "Brasil", latitude: -23.5475, longitude: -46.6361 }],
};
// Resposta da Open-Meteo: clima atual + resumo de 6 dias (hoje e os próximos 5)
const CLIMA = {
  current: {
    temperature_2m: 24.6,
    relative_humidity_2m: 70,
    precipitation: 0.2,
    wind_speed_10m: 12.5,
    weather_code: 3,
    is_day: 1,
  },
  daily: {
    time: ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"],
    weather_code: [3, 61, 0, 2, 95, 1],
    temperature_2m_max: [27, 25, 29, 28, 24, 26],
    temperature_2m_min: [18, 17, 19, 20, 16, 17],
    precipitation_sum: [0.2, 5.4, 0, 0, 12, 0.1],
  },
};

// Simula uma resposta do fetch (a rejeição usa fetch.mockRejectedValueOnce direto)
const mockFetch = (status, data) =>
  fetch.mockResolvedValueOnce({ ok: status < 400, status, json: async () => data });

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("Testes básicos", () => {
  test("1. Nome de cidade válido retorna dados meteorológicos", async () => {
    mockFetch(200, GEOCODING);
    mockFetch(200, CLIMA);

    const { local, clima } = await buscarPrevisao("São Paulo");

    expect(local.nome).toBe("São Paulo");
    expect(clima).toMatchObject({ temperatura: 24.6, codigo: 3, ehDia: true });
  });

  test("2. Nome de cidade inexistente lança exceção tratada", async () => {
    mockFetch(200, {});

    await expect(buscarPrevisao("Cidadequenaoexiste")).rejects.toMatchObject({
      name: "ErroApp",
      tipo: TIPO_ERRO.NAO_ENCONTRADA,
    });
  });

  test("3. Entrada vazia retorna erro de validação", async () => {
    await expect(buscarPrevisao("   ")).rejects.toMatchObject({ tipo: TIPO_ERRO.VALIDACAO });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("4. Falha da API (timeout ou erro) gera resposta adequada", async () => {
    // Erro HTTP
    mockFetch(500, {});
    await expect(buscarJSON(ENDERECO)).rejects.toMatchObject({ tipo: TIPO_ERRO.API });

    // Timeout: o servidor nunca responde
    fetch.mockImplementationOnce(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })))
        )
    );
    await expect(buscarJSON(ENDERECO, 30)).rejects.toMatchObject({ tipo: TIPO_ERRO.TIMEOUT });
  });
});

describe("Casos extremos", () => {
  test("5. Limite de requisições da API excedido (HTTP 429)", async () => {
    mockFetch(429, {});

    await expect(buscarJSON(ENDERECO)).rejects.toMatchObject({ tipo: TIPO_ERRO.LIMITE });
  });

  test("6. Conexão de rede lenta/instável", async () => {
    // Instável: falha de rede na 1ª tentativa e sucesso na 2ª
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mockFetch(200, GEOCODING);
    mockFetch(200, CLIMA);

    await expect(buscarPrevisao("São Paulo")).rejects.toMatchObject({ tipo: TIPO_ERRO.REDE });
    await expect(buscarPrevisao("São Paulo")).resolves.toHaveProperty("clima.temperatura", 24.6);

    // Lenta: demora 50 ms, mas responde dentro do limite
    fetch.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200, json: async () => GEOCODING }), 50))
    );
    await expect(buscarJSON(ENDERECO, 500)).resolves.toEqual(GEOCODING);
  });

  test("7. Mudança inesperada no formato da resposta JSON", async () => {
    mockFetch(200, GEOCODING);
    mockFetch(200, { hourly: {} });
    await expect(buscarPrevisao("São Paulo")).rejects.toMatchObject({ tipo: TIPO_ERRO.API });

    // Corpo que não é JSON válido
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(buscarJSON(ENDERECO)).rejects.toMatchObject({ tipo: TIPO_ERRO.API });
  });
});

describe("Previsão de vários dias", () => {
  test("8. Retorna os próximos 5 dias com temperatura máxima e mínima", async () => {
    mockFetch(200, GEOCODING);
    mockFetch(200, CLIMA);

    const { clima } = await buscarPrevisao("São Paulo");

    expect(clima).toMatchObject({ maxima: 27, minima: 18 }); // hoje
    expect(clima.previsao).toHaveLength(5); // a partir de amanhã
    expect(clima.previsao[0]).toEqual({ data: "2026-11-13", codigo: 61, maxima: 25, minima: 17, precipitacao: 5.4 });
    expect(clima.previsao[4]).toMatchObject({ data: "2026-11-17", maxima: 26, minima: 17 });
  });

  test("9. Previsão fora do formato esperado gera erro de API", async () => {
    // Sem o bloco "daily"
    mockFetch(200, GEOCODING);
    mockFetch(200, { current: CLIMA.current });
    await expect(buscarPrevisao("São Paulo")).rejects.toMatchObject({ tipo: TIPO_ERRO.API });

    // Menos dias do que o esperado
    mockFetch(200, GEOCODING);
    mockFetch(200, { ...CLIMA, daily: { ...CLIMA.daily, time: CLIMA.daily.time.slice(0, 3) } });
    await expect(buscarPrevisao("São Paulo")).rejects.toMatchObject({ tipo: TIPO_ERRO.API });

    // Temperatura máxima nula em um dos dias
    mockFetch(200, GEOCODING);
    mockFetch(200, { ...CLIMA, daily: { ...CLIMA.daily, temperature_2m_max: [27, 25, null, 28, 24, 26] } });
    await expect(buscarPrevisao("São Paulo")).rejects.toMatchObject({ tipo: TIPO_ERRO.API });
  });

  test("10. Data da previsão mostra o dia da semana correto, sem erro de fuso", () => {
    expect(formatarDiaSemana("2026-11-13")).toBe("sex., 13/11");
    expect(formatarDiaSemana("2026-11-15")).toBe("dom., 15/11");
  });
});

describe("Variáveis adicionais", () => {
  test("11. Retorna umidade, vento e precipitação e pede esses dados à API", async () => {
    mockFetch(200, GEOCODING);
    mockFetch(200, CLIMA);

    const { clima } = await buscarPrevisao("São Paulo");

    expect(clima).toMatchObject({ umidade: 70, vento: 12.5, precipitacao: 0.2 });
    const atuais = new URL(String(fetch.mock.calls[1][0])).searchParams.get("current");
    expect(atuais).toContain("relative_humidity_2m");
    expect(atuais).toContain("wind_speed_10m");
    expect(atuais).toContain("precipitation");

    // Umidade ausente na resposta
    mockFetch(200, GEOCODING);
    mockFetch(200, { ...CLIMA, current: { ...CLIMA.current, relative_humidity_2m: null } });
    await expect(buscarPrevisao("São Paulo")).rejects.toMatchObject({ tipo: TIPO_ERRO.API });
  });
});