// Script para migrar dados do JSON para o Supabase
// Uso: node scripts/migrate-to-supabase.js
// Necessita SUPABASE_URL e SUPABASE_ANON_KEY no ambiente

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_ANON_KEY no ambiente.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function migrate() {
  const dataDir = path.join(__dirname, "..", "data");

  // 1. Migrar reservas
  const reservationsPath = path.join(dataDir, "reservations.json");
  if (fs.existsSync(reservationsPath)) {
    const raw = fs.readFileSync(reservationsPath, "utf8").replace(/^\uFEFF/, "");
    const reservations = JSON.parse(raw);
    console.log(`Encontradas ${reservations.length} reservas para migrar.`);

    for (const r of reservations) {
      const { data: existing } = await supabase
        .from("reservations")
        .select("id")
        .eq("id", r.id)
        .maybeSingle();

      if (existing) {
        console.log(`  Pulando (ja existe): ${r.clientName}`);
        continue;
      }

      const { error } = await supabase.from("reservations").insert({
        id: r.id,
        clientName: r.clientName,
        phone: r.phone || "",
        cpf: r.cpf || "",
        email: r.email || "",
        eventDate: r.eventDate,
        endDate: r.endDate || r.eventDate,
        eventType: r.eventType || "Outro",
        status: r.status || "orcamento",
        totalValue: r.totalValue || 0,
        depositValue: r.depositValue || 0,
        payments: r.payments || [],
        notes: r.notes || "",
        paymentMethod: r.paymentMethod || "",
        createdAt: r.createdAt || new Date().toISOString(),
        updatedAt: r.updatedAt || new Date().toISOString(),
      });

      if (error) {
        console.error(`  Erro ao migrar ${r.clientName}: ${error.message}`);
      } else {
        console.log(`  OK: ${r.clientName} (${r.eventDate})`);
      }
    }
  }

  // 2. Migrar configuracoes
  const settingsPath = path.join(dataDir, "settings.json");
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, "utf8").replace(/^\uFEFF/, "");
    const settings = JSON.parse(raw);
    const { error } = await supabase.from("settings").upsert(
      { id: 1, employeeRate: settings.employeeRate || 260 },
      { onConflict: "id" }
    );
    if (error) {
      console.error(`Erro ao migrar settings: ${error.message}`);
    } else {
      console.log(`Configuracoes migradas (employeeRate: ${settings.employeeRate})`);
    }
  }

  console.log("Migracao concluida!");
}

migrate().catch(console.error);
