const { supabase } = require("../../../lib/supabase");
const { corsHeaders, handleOptions } = require("../../../lib/reservations");

module.exports = async (req, res) => {
  if (handleOptions(req, res, "POST, OPTIONS")) return;

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Metodo nao permitido." });
  }

  try {
    const { id } = req.query;

    const { data: reservation, error } = await supabase
      .from("reservations")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !reservation) {
      return res.status(404).json({ message: "Reserva nao encontrada." });
    }

    // A geracao de contrato com template DOCX + Word COM
    // so funciona no ambiente local (Windows + Word instalado).
    // No Vercel, esta funcionalidade sera desativada.
    // Para gerar contratos, use o servidor local (node server.js).
    return res.status(501).json({
      message:
        "Geracao de contrato disponivel apenas no ambiente local. " +
        "Use o servidor local (node server.js) para gerar contratos.",
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
