const http = require("http");
const fs = require("fs/promises");
const fss = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { generateContract } = require("./lib/contract-local");

try {
  var envContent = fss.readFileSync(".env", "utf8");
  envContent.split(/\r?\n/).forEach(function (line) {
    if (line.startsWith("#")) return;
    var eqIdx = line.indexOf("=");
    if (eqIdx < 0) return;
    var key = line.substring(0, eqIdx).trim();
    var val = line.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });
} catch (e) {
  console.log("Arquivo .env nao encontrado, usando variaveis de ambiente existentes.");
}

const { supabase } = require("./lib/supabase");

const root = __dirname;
const dataDir = path.join(root, "data");
const authFilePath = path.join(dataDir, "auth.json");
const port = Number(process.env.PORT || 4173);

const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;
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
  await fs.mkdir(dataDir, { recursive: true });
  await ensureAuth();
  cleanupSessions();

  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === "/api/login" && request.method === "POST") {
        await handleLogin(request, response);
        return;
      }

      if (request.url.startsWith("/api/availability")) {
        await handleAvailabilityApi(request, response);
        return;
      }

      if (request.url === "/disponibilidade") {
        request.url = "/api/availability";
        request.headers.accept = "text/html";
        await handleAvailabilityApi(request, response);
        return;
      }

      const token = extractToken(request);
      if (!token || !sessions.has(token)) {
        if (request.url.startsWith("/api/")) {
          sendJson(response, 401, { message: "Nao autorizado. Faca login." });
          return;
        }
        await serveLoginPage(response);
        return;
      }

      sessions.get(token).lastAccess = Date.now();

      if (request.url.startsWith("/api/")) {
        if (request.url === "/api/me") {
          sendJson(response, 200, { authenticated: true });
          return;
        }
        if (request.url === "/api/logout" && request.method === "POST") {
          sessions.delete(token);
          sendJson(response, 200, { message: "Logout efetuado." });
          return;
        }
        if (request.url.startsWith("/api/reservations")) {
          await handleReservationsApi(request, response);
          return;
        }
        if (request.url.startsWith("/api/settings")) {
          await handleSettingsApi(request, response);
          return;
        }
        sendJson(response, 404, { message: "Rota nao encontrada." });
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
    console.log("Sistema Flor do Cerrado rodando em http://localhost:" + port);
    getLocalAddresses().forEach(function (address) {
      console.log("Na mesma rede, tente abrir: http://" + address + ":" + port);
    });
  });
}

async function handleSettingsApi(request, response) {
  if (request.method === "GET") {
    var { data, error } = await supabase.from("settings").select("*").single();
    if (error) return sendJson(response, 500, { message: "Erro ao ler configuracoes." });
    sendJson(response, 200, data || { employeeRate: 260 });
    return;
  }

  if (request.method === "PUT") {
    var input = await readRequestBody(request);
    var employeeRate = Number(input.employeeRate || 0);
    if (employeeRate < 0) {
      return sendJson(response, 400, { message: "O valor do funcionario nao pode ser negativo." });
    }
    var { data, error } = await supabase.from("settings").update({ employeeRate }).eq("id", 1).select().single();
    if (error) return sendJson(response, 500, { message: "Erro ao salvar configuracoes." });
    sendJson(response, 200, data);
    return;
  }

  sendJson(response, 405, { message: "Metodo nao permitido." });
}

async function handleReservationsApi(request, response) {
  var url = new URL(request.url, "http://" + request.headers.host);
  var parts = url.pathname.split("/").filter(Boolean);
  var id = parts[2];
  var isContract = parts[3] === "contract";

  if (request.method === "GET" && !id) {
    var { data, error } = await supabase.from("reservations").select("*").order("eventDate", { ascending: false });
    if (error) return sendJson(response, 500, { message: "Erro ao listar reservas." });
    sendJson(response, 200, data || []);
    return;
  }

  if (id && isContract) {
    if (request.method === "POST") {
      var { data: reservation, error } = await supabase.from("reservations").select("*").eq("id", id).single();
      if (error || !reservation) {
        return sendJson(response, 404, { message: "Reserva nao encontrada." });
      }
      try {
        await generateContract(reservation);
        sendJson(response, 200, {
          message: "Contrato gerado com sucesso.",
          downloadUrl: "/api/reservations/" + id + "/contract",
        });
      } catch (err) {
        sendJson(response, 500, { message: err.message });
      }
      return;
    }

    if (request.method === "GET") {
      var { data: reservation, error } = await supabase.from("reservations").select("*").eq("id", id).single();
      if (error || !reservation) {
        return sendJson(response, 404, { message: "Reserva nao encontrada." });
      }
      try {
        var buffer = await generateContract(reservation);
        var safeName = reservation.clientName.replace(/[\\/:*?"<>|]/g, "_");
        response.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": 'attachment; filename="CONTRATO DE LOCACAO - ' + safeName + '.docx"',
          "Content-Length": buffer.length,
        });
        response.end(buffer);
      } catch (err) {
        sendJson(response, 500, { message: err.message });
      }
      return;
    }
  }

  if (request.method === "POST" && !id) {
    var input = sanitizeReservation(await readRequestBody(request));

    var { data: allReservations } = await supabase.from("reservations").select("*");
    var conflict = findConflict(allReservations || [], input);
    if (conflict) {
      return sendJson(response, 409, { message: "A data ja esta bloqueada por " + conflict.clientName + "." });
    }

    input.id = crypto.randomUUID();
    input.createdAt = new Date().toISOString();
    input.updatedAt = new Date().toISOString();

    var { data, error } = await supabase.from("reservations").insert(input).select().single();
    if (error) return sendJson(response, 500, { message: "Erro ao criar reserva: " + error.message });
    sendJson(response, 201, data);
    return;
  }

  if (request.method === "PUT" && id) {
    var input = sanitizeReservation(await readRequestBody(request));

    var { data: existing, error: fetchError } = await supabase.from("reservations").select("*").eq("id", id).single();
    if (fetchError || !existing) {
      return sendJson(response, 404, { message: "Reserva nao encontrada." });
    }

    var { data: allReservations } = await supabase.from("reservations").select("*");
    var nextReservation = Object.assign({}, existing, input, { id: id });
    var conflict = findConflict(allReservations || [], nextReservation);
    if (conflict) {
      return sendJson(response, 409, { message: "A data ja esta bloqueada por " + conflict.clientName + "." });
    }

    input.updatedAt = new Date().toISOString();
    var { data, error } = await supabase.from("reservations").update(input).eq("id", id).select().single();
    if (error) return sendJson(response, 500, { message: "Erro ao atualizar reserva." });
    sendJson(response, 200, data);
    return;
  }

  if (request.method === "DELETE" && id) {
    var { data: existing, error: fetchError } = await supabase.from("reservations").select("id").eq("id", id).single();
    if (fetchError || !existing) {
      return sendJson(response, 404, { message: "Reserva nao encontrada." });
    }
    var { error } = await supabase.from("reservations").delete().eq("id", id);
    if (error) return sendJson(response, 500, { message: "Erro ao excluir reserva." });
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 405, { message: "Metodo nao permitido." });
}

async function handleAvailabilityApi(request, response) {
  if (request.method !== "GET") {
    return sendJson(response, 405, { message: "Metodo nao permitido." });
  }
  var url = new URL(request.url, "http://" + request.headers.host);
  var date = url.searchParams.get("date");
  var start = url.searchParams.get("start");
  var end = url.searchParams.get("end");
  var acceptHeader = request.headers.accept || "";

  if (!start || !end) {
    var now = new Date();
    start = now.toISOString().slice(0, 10);
    now.setMonth(now.getMonth() + 6);
    end = now.toISOString().slice(0, 10);
  }
  if (date) {
    start = date;
    end = date;
  }

  var { data: reservations, error } = await supabase
    .from("reservations")
    .select("clientName, eventDate, endDate, status")
    .lte("eventDate", end)
    .gte("endDate", start)
    .order("eventDate", { ascending: true });

  if (error) {
    return sendJson(response, 500, { message: "Erro ao verificar disponibilidade." });
  }

  var filtered = (reservations || []).filter(function (r) {
    return !["cancelado", "orcamento"].includes(r.status);
  });

  var blockedSet = {};
  filtered.forEach(function (r) {
    var d = new Date(r.eventDate);
    var e = new Date(r.endDate || r.eventDate);
    while (d <= e) {
      var key = d.toISOString().slice(0, 10);
      if (key >= start && key <= end) {
        if (!blockedSet[key]) blockedSet[key] = [];
        if (blockedSet[key].length < 2) blockedSet[key].push(r.clientName);
      }
      d.setDate(d.getDate() + 1);
    }
  });
  var blockedDates = Object.keys(blockedSet).sort();

  var available = true;
  if (date) {
    available = !blockedSet[date];
  }

  if (acceptHeader.includes("text/html")) {
    var html = generateAvailabilityPage(start, end, blockedSet, date);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }

  sendJson(response, 200, {
    period: { start: start, end: end },
    available: available,
    blockedDates: blockedDates.length > 0 ? blockedDates : [],
    reservations: filtered.map(function (r) {
      return { clientName: r.clientName, eventDate: r.eventDate, endDate: r.endDate || r.eventDate, status: r.status };
    }),
  });
}

function generateAvailabilityPage(start, end, blockedSet, highlightDate) {
  var today = new Date().toISOString().slice(0, 10);
  var html = "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>Disponibilidade - Flor do Cerrado</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;background:#f6f3ec;color:#26302b;padding:20px}.container{max-width:800px;margin:0 auto}.header{text-align:center;margin-bottom:24px}.header h1{font-size:24px;color:#2f6f5e}.header p{color:#6f7a72;margin-top:4px;font-size:14px}.meses{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}.mes{border:1px solid #ded8cb;border-radius:8px;background:#fffdf8;overflow:hidden}.mes-titulo{background:#2f6f5e;color:#fff;padding:10px 14px;font-weight:700;font-size:15px}.mes-dias{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;padding:4px}.dia-semana{text-align:center;font-size:11px;color:#6f7a72;font-weight:700;padding:6px 0}.dia{text-align:center;padding:6px 0;font-size:13px;border-radius:4px}.dia-disponivel{color:#2f6f5e}.dia-ocupado{background:#f5e6e2;color:#b84a3a;font-weight:700}.dia-hoje{font-weight:700;outline:2px solid #b87b28}.dia-destaque{outline:2px solid #2f6f5e}.info{text-align:center;margin-top:24px;padding:16px;background:#fffdf8;border:1px solid #ded8cb;border-radius:8px;font-size:14px;color:#6f7a72}.info strong{color:#26302b}.footer{text-align:center;margin-top:16px;color:#6f7a72;font-size:12px}</style></head><body><div class='container'><div class='header'><h1>Chácara Flor do Cerrado</h1><p>Calendário de disponibilidade</p></div><div class='meses'>";
  var current = new Date(start);
  var rangeEnd = new Date(end);

  while (current <= rangeEnd) {
    var year = current.getFullYear();
    var month = current.getMonth();
    var monthLabel = current.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);
    var startOffset = (firstDay.getDay() + 6) % 7;

    html += "<div class='mes'><div class='mes-titulo'>" + monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1) + "</div><div class='mes-dias'>";
    ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].forEach(function (d) {
      html += "<div class='dia-semana'>" + d + "</div>";
    });
    for (var i = 0; i < startOffset; i++) {
      html += "<div></div>";
    }
    for (var d = 1; d <= lastDay.getDate(); d++) {
      var dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var classes = "dia";
      if (blockedSet[dateStr]) {
        classes += " dia-ocupado";
      } else {
        classes += " dia-disponivel";
      }
      if (dateStr === today) classes += " dia-hoje";
      if (dateStr === highlightDate) classes += " dia-destaque";
      html += "<div class='" + classes + "'>" + d + "</div>";
    }
    html += "</div></div>";
    current.setMonth(current.getMonth() + 1);
  }
  html += "</div><div class='info'><strong>Legenda:</strong> <span style='color:#2f6f5e'>Disponível</span> | <span style='color:#b84a3a'>Ocupado</span> | <strong>Hoje</strong></div><div class='footer'>Chácara Flor do Cerrado</div></div></body></html>";
  return html;
}

async function serveStaticFile(request, response) {
  var url = new URL(request.url, "http://" + request.headers.host);
  var requestedPath = decodeURIComponent(url.pathname);
  var relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  var filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    var data = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Arquivo nao encontrado.");
  }
}

async function ensureAuth() {
  try {
    await fs.access(authFilePath);
  } catch {
    var salt = crypto.randomBytes(16).toString("hex");
    var pinHash = crypto.createHash("sha256").update(salt + "1234").digest("hex");
    await fs.writeFile(authFilePath, JSON.stringify({ pinHash: pinHash, salt: salt }, null, 2));
    console.log("PIN padrao criado: 1234. Altere em data/auth.json");
  }
}

async function readAuth() {
  var data = (await fs.readFile(authFilePath, "utf8")).replace(/^\uFEFF/, "");
  return JSON.parse(data);
}

async function handleLogin(request, response) {
  var { pin } = await readRequestBody(request);
  if (!pin) {
    return sendJson(response, 400, { message: "Informe o PIN." });
  }
  var auth = await readAuth();
  var hash = crypto.createHash("sha256").update(auth.salt + pin).digest("hex");
  if (hash !== auth.pinHash) {
    return sendJson(response, 401, { message: "PIN incorreto." });
  }
  var token = crypto.randomUUID();
  sessions.set(token, { createdAt: Date.now(), lastAccess: Date.now() });
  sendJson(response, 200, { token: token, message: "Login efetuado." });
}

function extractToken(request) {
  var authHeader = request.headers.authorization || "";
  var headerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (headerMatch) return headerMatch[1];

  var url = new URL(request.url, "http://" + request.headers.host);
  var queryToken = url.searchParams.get("token");
  if (queryToken && queryToken !== "null" && queryToken.length > 10) return queryToken;

  var cookies = request.headers.cookie || "";
  var cookieMatch = cookies.match(/(?:^|;\s*)session=([^;]+)/);
  if (cookieMatch) return cookieMatch[1];

  return null;
}

function cleanupSessions() {
  setInterval(function () {
    var now = Date.now();
    for (var token in Array.from(sessions.keys())) {
      var session = sessions.get(token);
      if (session && now - session.lastAccess > SESSION_TTL) {
        sessions.delete(token);
      }
    }
  }, 60000);
}

function serveLoginPage(response) {
  var html = '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Flor do Cerrado | Login</title>\n<style>\n*{box-sizing:border-box;margin:0;padding:0}\nbody{min-height:100vh;display:flex;align-items:center;justify-content:center;\nbackground:linear-gradient(135deg,rgba(47,111,94,.12),transparent 34%),linear-gradient(315deg,rgba(184,123,40,.16),transparent 30%),#f6f3ec;\nfont-family:Arial,Helvetica,sans-serif;color:#26302b}\n.login-card{width:380px;max-width:90vw;padding:40px 36px;border-radius:12px;\nbackground:#fffdf8;box-shadow:0 18px 50px rgba(40,48,43,.12);border:1px solid #ded8cb}\n.brand{display:flex;align-items:center;gap:14px;margin-bottom:32px}\n.brand-mark{display:grid;width:48px;height:48px;place-items:center;border-radius:8px;\nbackground:#2f6f5e;color:#fff;font-weight:800;font-size:20px}\n.brand-text h1{font-size:20px;margin:0}\n.brand-text p{margin:4px 0 0;color:#6f7a72;font-size:13px}\nh2{font-size:15px;margin-bottom:20px;color:#6f7a72}\nlabel{display:grid;gap:6px;margin-bottom:16px;color:#6f7a72;font-size:13px;font-weight:700}\ninput{width:100%;height:44px;padding:0 14px;border:1px solid #ded8cb;border-radius:8px;\nbackground:#fff;color:#26302b;font-size:24px;letter-spacing:8px;text-align:center;\noutline:none;font-family:monospace}\ninput:focus{border-color:#2f6f5e;box-shadow:0 0 0 3px rgba(47,111,94,.14)}\nbutton{width:100%;height:44px;border:none;border-radius:8px;background:#2f6f5e;\ncolor:#fff;font-size:15px;font-weight:800;cursor:pointer}\nbutton:hover{background:#245648}\nbutton:disabled{opacity:.6;cursor:default}\n.error{margin-top:14px;padding:10px;border-radius:8px;\nbackground:rgba(184,74,58,.1);color:#b84a3a;font-size:13px;font-weight:700;\ntext-align:center;display:none}\n.error.visible{display:block}\n.footer{margin-top:24px;text-align:center;color:#6f7a72;font-size:12px}\n</style>\n</head>\n<body>\n<div class="login-card">\n<div class="brand"><div class="brand-mark">FC</div>\n<div class="brand-text"><h1>Flor do Cerrado</h1><p>Sistema de Reservas</p></div></div>\n<h2>Digite o PIN de acesso</h2>\n<form id="loginForm">\n<label>PIN<input id="pinInput" type="password" inputmode="numeric" maxlength="6" autocomplete="off" autofocus></label>\n<button id="loginButton" type="submit">Entrar</button>\n<div class="error" id="loginError"></div>\n</form>\n<div class="footer">Acesso restrito</div>\n</div>\n<script>\ndocument.getElementById(\'loginForm\').addEventListener(\'submit\',async function(e){\ne.preventDefault();var p=document.getElementById(\'pinInput\'),b=document.getElementById(\'loginButton\'),er=document.getElementById(\'loginError\');\nb.disabled=true;b.textContent=\'Entrando...\';er.classList.remove(\'visible\');\ntry{var r=await fetch(\'/api/login\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify({pin:p.value})});\nvar d=await r.json();if(!r.ok){er.textContent=d.message||\'PIN incorreto.\';er.classList.add(\'visible\');b.disabled=false;b.textContent=\'Entrar\';p.value=\'\';p.focus();return;}\ndocument.cookie=\'session=\'+encodeURIComponent(d.token)+\';path=/;max-age=86400;SameSite=Lax\';sessionStorage.setItem(\'auth_token\',d.token);window.location.href=\'/\';}catch(e){er.textContent=\'Erro de conexao com o servidor.\';er.classList.add(\'visible\');b.disabled=false;b.textContent=\'Entrar\';}});\n</script>\n</body>\n</html>';
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

async function readRequestBody(request) {
  var chunks = [];
  for await (var chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sanitizeReservation(input) {
  var reservation = {
    clientName: String(input.clientName || "").trim(),
    phone: String(input.phone || "").trim(),
    cpf: String(input.cpf || "").trim(),
    email: String(input.email || "").trim(),
    eventDate: String(input.eventDate || "").trim(),
    endDate: String(input.endDate || input.eventDate || "").trim(),
    eventType: String(input.eventType || "Outro").trim(),
    status: String(input.status || "orcamento").trim(),
    totalValue: Number(input.totalValue || 0),
    depositValue: Number(input.depositValue || 0),
    payments: sanitizePayments(input.payments || []),
    notes: String(input.notes || "").trim(),
    paymentMethod: String(input.paymentMethod || "").trim(),
  };

  if (!reservation.clientName) throwApiError("Informe o nome do cliente.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation.eventDate)) throwApiError("Informe uma data valida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation.endDate)) throwApiError("Informe uma data final valida.");
  if (reservation.endDate < reservation.eventDate) throwApiError("A data final nao pode ser antes da data inicial.");
  if (!validStatuses.has(reservation.status)) throwApiError("Status invalido.");

  return reservation;
}

function sanitizePayments(payments) {
  return (payments || []).map(function (payment) {
    var clean = {
      date: String(payment.date || "").trim(),
      value: Number(payment.value || 0),
      status: String(payment.status || "pendente").trim(),
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date)) throwApiError("Informe uma data valida para cada pagamento.");
    if (!["pendente", "pago"].includes(clean.status)) throwApiError("Status de pagamento invalido.");
    return clean;
  });
}

function throwApiError(message) {
  var err = new Error(message);
  err.isApiError = true;
  throw err;
}

function findConflict(reservations, input) {
  return reservations.find(function (r) {
    var startA = r.eventDate;
    var endA = r.endDate || r.eventDate;
    var overlaps = startA <= input.endDate && input.eventDate <= endA;
    var different = r.id !== input.id;
    var blocks = !["cancelado", "orcamento"].includes(r.status);
    var newBlocks = !["cancelado", "orcamento"].includes(input.status);
    return overlaps && different && blocks && newBlocks;
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function getLocalAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(function (n) { return n && n.family === "IPv4" && !n.internal; })
    .map(function (n) { return n.address; });
}
