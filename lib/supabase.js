const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "ERRO: Variaveis SUPABASE_URL e SUPABASE_ANON_KEY sao obrigatorias."
  );
}

const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

module.exports = { supabase };
