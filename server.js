const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const root = __dirname;
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "reservations.json");
const settingsPath = path.join(dataDir, "settings.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

const validStatuses = new Set(["orcamento", "pre-reserva", "reservado", "pago", "cancelado"]);

main();

async function main() {
  await ensureDatabase();

  const server = http.createServer(async (request, response) => {
    try {
      if (request.url.startsWith("/api/reservations")) {
        await handleReservationsApi(request, response);
        return;
      }

      if (request.url.startsWith("/api/settings")) {
        await handleSettingsApi(request, response);
        return;
      }

      await serveStaticFile(request, response);
    } catch (error) {
      if (error.isApiError) {
        sendJson(response, 400, { message: error.message });
        return;
      }

      sendJson(response, 500, { message: "Erro interno do servidor." });
      console.error(error);
    }
  });

  server.listen(port, host, () => {
    console.log(`Sistema Flor do Cerrado rodando em http://localhost:${port}`);
    getLocalAddresses().forEach((address) => {
      console.log(`Na mesma rede, tente abrir: http://${address}:${port}`);
    });
  });
}

async function handleSettingsApi(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, await readSettings());
    return;
  }

  if (request.method === "PUT") {
    const input = await readRequestBody(request);
    const employeeRate = Number(input.employeeRate || 0);

    if (employeeRate < 0) {
      sendJson(response, 400, { message: "O valor do funcionario nao pode ser negativo." });
      return;
    }

    const settings = { employeeRate };
    await writeSettings(settings);
    sendJson(response, 200, settings);
    return;
  }

  sendJson(response, 405, { message: "Metodo nao permitido." });
}

async function handleReservationsApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2];

  if (request.method === "GET" && !id) {
    sendJson(response, 200, await readReservations());
    return;
  }

  if (request.method === "POST" && !id) {
    const input = sanitizeReservation(await readRequestBody(request));
    const reservations = await readReservations();
    const conflict = findConflict(reservations, input);

    if (conflict) {
      sendJson(response, 409, { message: `A data ja esta bloqueada por ${conflict.clientName}.` });
      return;
    }

    const reservation = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    reservations.push(reservation);
    await writeReservations(reservations);
    sendJson(response, 201, reservation);
    return;
  }

  if (request.method === "PUT" && id) {
    const input = sanitizeReservation(await readRequestBody(request));
    const reservations = await readReservations();
    const index = reservations.findIndex((reservation) => reservation.id === id);

    if (index === -1) {
      sendJson(response, 404, { message: "Reserva nao encontrada." });
      return;
    }

    const nextReservation = {
      ...reservations[index],
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    };
    const conflict = findConflict(reservations, nextReservation);

    if (conflict) {
      sendJson(response, 409, { message: `A data ja esta bloqueada por ${conflict.clientName}.` });
      return;
    }

    reservations[index] = nextReservation;
    await writeReservations(reservations);
    sendJson(response, 200, nextReservation);
    return;
  }

  if (request.method === "DELETE" && id) {
    const reservations = await readReservations();
    const nextReservations = reservations.filter((reservation) => reservation.id !== id);

    if (nextReservations.length === reservations.length) {
      sendJson(response, 404, { message: "Reserva nao encontrada." });
      return;
    }

    await writeReservations(nextReservations);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 405, { message: "Metodo nao permitido." });
}

async function serveStaticFile(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Arquivo nao encontrado.");
  }
}

async function ensureDatabase() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dbPath);
  } catch {
    const now = new Date();
    const sampleDate = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 5, 28));
    await writeReservations([
      {
        id: crypto.randomUUID(),
        clientName: "Exemplo de reserva",
        phone: "(00) 00000-0000",
        eventDate: toDateKey(sampleDate),
        endDate: toDateKey(sampleDate),
        eventType: "Aniversario",
        status: "pre-reserva",
        totalValue: 2500,
        depositValue: 500,
        payments: [],
        notes: "Registro de exemplo. Pode editar ou excluir.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  }

  try {
    await fs.access(settingsPath);
  } catch {
    await writeSettings({ employeeRate: 260 });
  }
}

async function readReservations() {
  const data = (await fs.readFile(dbPath, "utf8")).replace(/^\uFEFF/, "");
  return JSON.parse(data);
}

async function writeReservations(reservations) {
  const tmpPath = `${dbPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(reservations, null, 2));
  await fs.rename(tmpPath, dbPath);
}

async function readSettings() {
  const data = (await fs.readFile(settingsPath, "utf8")).replace(/^\uFEFF/, "");
  return JSON.parse(data);
}

async function writeSettings(settings) {
  const tmpPath = `${settingsPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2));
  await fs.rename(tmpPath, settingsPath);
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sanitizeReservation(input) {
  const reservation = {
    clientName: String(input.clientName || "").trim(),
    phone: String(input.phone || "").trim(),
    eventDate: String(input.eventDate || "").trim(),
    endDate: String(input.endDate || input.eventDate || "").trim(),
    eventType: String(input.eventType || "Outro").trim(),
    status: String(input.status || "orcamento").trim(),
    totalValue: Number(input.totalValue || 0),
    depositValue: Number(input.depositValue || 0),
    payments: sanitizePayments(input.payments || []),
    notes: String(input.notes || "").trim(),
  };

  if (!reservation.clientName) {
    throwApiError("Informe o nome do cliente.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation.eventDate)) {
    throwApiError("Informe uma data valida.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation.endDate)) {
    throwApiError("Informe uma data final valida.");
  }

  if (reservation.endDate < reservation.eventDate) {
    throwApiError("A data final nao pode ser antes da data inicial.");
  }

  if (!validStatuses.has(reservation.status)) {
    throwApiError("Status invalido.");
  }

  return reservation;
}

function sanitizePayments(payments) {
  return payments.map((payment) => {
    const cleanPayment = {
      date: String(payment.date || "").trim(),
      value: Number(payment.value || 0),
      status: String(payment.status || "pendente").trim(),
    };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanPayment.date)) {
      throwApiError("Informe uma data valida para cada pagamento.");
    }

    if (!["pendente", "pago"].includes(cleanPayment.status)) {
      throwApiError("Status de pagamento invalido.");
    }

    return cleanPayment;
  });
}

function throwApiError(message) {
  const error = new Error(message);
  error.isApiError = true;
  throw error;
}

function findConflict(reservations, input) {
  return reservations.find((reservation) => {
    const reservationStart = reservation.eventDate;
    const reservationEnd = reservation.endDate || reservation.eventDate;
    const overlaps = reservationStart <= input.endDate && input.eventDate <= reservationEnd;
    const differentRecord = reservation.id !== input.id;
    const blocksDate = !["cancelado", "orcamento"].includes(reservation.status);
    const newRecordBlocksDate = !["cancelado", "orcamento"].includes(input.status);
    return overlaps && differentRecord && blocksDate && newRecordBlocksDate;
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((network) => network && network.family === "IPv4" && !network.internal)
    .map((network) => network.address);
}
