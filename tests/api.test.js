/**
 * @jest-environment node
 */
const { TIMEOUT_MS, buscarJSON, buscarPrevisao } = require("../assets/js/api");

const respostaOk = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
const respostaErro = (status) => ({ ok: false, status, json: async () => ({}) });

const GEOCODING = {
  results: [
    { name: "São Paulo", admin1: "São Paulo", country: "Brasil", latitude: -23.5475, longitude: -46.6361 },
  ],
};
const CLIMA = { current: { temperature_2m: 24.6, weather_code: 3, is_day: 1 } };

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("Testes básicos", () => {
  test("1. Nome de cidade válido retorna dados meteorológicos", async () => {
    global.fetch
      .mockResolvedValueOnce(respostaOk(GEOCODING))
      .mockResolvedValueOnce(respostaOk(CLIMA));

    const { local, clima } = await buscarPrevisao("São Paulo");

    expect(local.nome).toBe("São Paulo");
    expect(local.latitude).toBe(-23.5475);
    expect(clima).toEqual({ temperatura: 24.6, codigo: 3, ehDia: true });
  });

  test("2. Nome de cidade inexistente lança exceção tratada", async () => {
    global.fetch.mockResolvedValueOnce(respostaOk({}));

    await expect(buscarPrevisao("Cidadequenaoexiste")).rejects.toMatchObject({
      name: "ErroApp",
      tipo: "cidade",
      message: expect.stringContaining("não encontrada"),
    });
  });

  test("3. Entrada vazia retorna erro de validação", async () => {
    await expect(buscarPrevisao("   ")).rejects.toMatchObject({
      name: "ErroApp",
      tipo: "cidade",
      message: "Digite o nome de uma cidade.",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("4. Falha da API (timeout ou erro) gera resposta adequada", async () => {
    // Erro HTTP
    global.fetch.mockResolvedValueOnce(respostaErro(500));
    await expect(buscarJSON("https://exemplo.com")).rejects.toMatchObject({
      tipo: "api",
      message: expect.stringContaining("500"),
    });

    // Timeout
    jest.useFakeTimers();
    global.fetch.mockImplementationOnce(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const erro = new Error("aborted");
            erro.name = "AbortError";
            reject(erro);
          });
        })
    );
    const assercao = expect(buscarJSON("https://exemplo.com")).rejects.toMatchObject({
      tipo: "timeout",
    });
    jest.advanceTimersByTime(TIMEOUT_MS);
    await assercao;
  });
});

describe("Casos extremos", () => {
  test("5. Limite de requisições da API excedido (HTTP 429)", async () => {
    global.fetch.mockResolvedValueOnce(respostaErro(429));

    await expect(buscarJSON("https://exemplo.com")).rejects.toMatchObject({
      name: "ErroApp",
      tipo: "limite",
      message: expect.stringContaining("Limite de requisições"),
    });
  });

  test("6. Conexão de rede lenta/instável", async () => {
    // Instável: falha de rede na 1ª tentativa e sucesso na 2ª
    global.fetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(respostaOk(GEOCODING))
      .mockResolvedValueOnce(respostaOk(CLIMA));

    await expect(buscarPrevisao("São Paulo")).rejects.toMatchObject({ tipo: "rede" });
    await expect(buscarPrevisao("São Paulo")).resolves.toHaveProperty("clima.temperatura", 24.6);

    // Lenta: responde perto do limite e ainda retorna os dados
    jest.useFakeTimers();
    global.fetch.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(respostaOk(GEOCODING)), TIMEOUT_MS - 1000))
    );
    const promessa = buscarJSON("https://exemplo.com");
    jest.advanceTimersByTime(TIMEOUT_MS - 1000);
    await expect(promessa).resolves.toEqual(GEOCODING);
  });

  test("7. Mudança inesperada no formato da resposta JSON", async () => {
    // Sem o objeto "current"
    global.fetch
      .mockResolvedValueOnce(respostaOk(GEOCODING))
      .mockResolvedValueOnce(respostaOk({ hourly: { temperature_2m: [20] } }));
    await expect(buscarPrevisao("São Paulo")).rejects.toMatchObject({ tipo: "api" });

    // Corpo que não é JSON válido
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(buscarJSON("https://exemplo.com")).rejects.toMatchObject({ tipo: "api" });
  });
});