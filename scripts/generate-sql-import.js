// Gera script SQL para importar dados no Supabase SQL Editor
// Uso: node scripts/generate-sql-import.js > import.sql
// Depois cole o conteudo de import.sql no SQL Editor do Supabase

const fs = require("fs");
const path = require("path");

function escape(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function jsonToSql(val) {
  return escape(JSON.stringify(val));
}

const dataDir = path.join(__dirname, "..", "data");

// 1. Settings
const settingsPath = path.join(dataDir, "settings.json");
if (fs.existsSync(settingsPath)) {
  const raw = fs.readFileSync(settingsPath, "utf8").replace(/^\uFEFF/, "");
  const s = JSON.parse(raw);
  console.log(
    `insert into settings (id, "employeeRate") values (1, ${s.employeeRate || 260}) on conflict (id) do nothing;`
  );
  console.log("");
}

// 2. Reservations
const reservationsPath = path.join(dataDir, "reservations.json");
if (fs.existsSync(reservationsPath)) {
  const raw = fs.readFileSync(reservationsPath, "utf8").replace(/^\uFEFF/, "");
  const reservations = JSON.parse(raw);

  for (const r of reservations) {
    const cols = [
      "id",
      '"clientName"',
      "phone",
      "cpf",
      "email",
      '"eventDate"',
      '"endDate"',
      '"eventType"',
      "status",
      '"totalValue"',
      '"depositValue"',
      "payments",
      "notes",
      '"paymentMethod"',
      '"createdAt"',
      '"updatedAt"',
    ];
    const vals = [
      escape(r.id),
      escape(r.clientName),
      escape(r.phone || ""),
      escape(r.cpf || ""),
      escape(r.email || ""),
      escape(r.eventDate),
      escape(r.endDate || r.eventDate),
      escape(r.eventType || "Outro"),
      escape(r.status || "orcamento"),
      r.totalValue || 0,
      r.depositValue || 0,
      jsonToSql(r.payments || []),
      escape(r.notes || ""),
      escape(r.paymentMethod || ""),
      escape(r.createdAt || new Date().toISOString()),
      escape(r.updatedAt || new Date().toISOString()),
    ];

    console.log(
      `insert into reservations (${cols.join(", ")}) values (${vals.join(", ")});`
    );
  }
}
