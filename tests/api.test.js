/**
 * @jest-environment node
 */
const { TIPO_ERRO, buscarJSON, buscarPrevisao } = require("../assets/js/api");

const URL = "https://exemplo.com";
const GEOCODING = {
  results: [{ name: "São Paulo", admin1: "São Paulo", country: "Brasil", latitude: -23.5475, longitude: -46.6361 }],
};
const CLIMA = { current: { temperature_2m: 24.6, weather_code: 3, is_day: 1 } };

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
    expect(clima).toEqual({ temperatura: 24.6, codigo: 3, ehDia: true });
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
    await expect(buscarJSON(URL)).rejects.toMatchObject({ tipo: TIPO_ERRO.API });

    // Timeout: o servidor nunca responde
    fetch.mockImplementationOnce(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })))
        )
    );
    await expect(buscarJSON(URL, 30)).rejects.toMatchObject({ tipo: TIPO_ERRO.TIMEOUT });
  });
});

describe("Casos extremos", () => {
  test("5. Limite de requisições da API excedido (HTTP 429)", async () => {
    mockFetch(429, {});

    await expect(buscarJSON(URL)).rejects.toMatchObject({ tipo: TIPO_ERRO.LIMITE });
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
    await expect(buscarJSON(URL, 500)).resolves.toEqual(GEOCODING);
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
    await expect(buscarJSON(URL)).rejects.toMatchObject({ tipo: TIPO_ERRO.API });
  });
});