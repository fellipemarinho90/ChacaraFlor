const { supabase } = require("../lib/supabase");
const { corsHeaders, handleOptions } = require("../lib/reservations");

module.exports = async (req, res) => {
  if (handleOptions(req, res, "GET, PUT, OPTIONS")) return;

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) {
        return res
          .status(500)
          .json({ message: "Erro ao buscar configuracoes." });
      }

      return res.status(200).json(data || { employeeRate: 260 });
    }

    if (req.method === "PUT") {
      const employeeRate = Number(req.body.employeeRate || 0);

      if (employeeRate < 0) {
        return res.status(400).json({
          message: "O valor do funcionario nao pode ser negativo.",
        });
      }

      const { data, error } = await supabase
        .from("settings")
        .upsert({ id: 1, employeeRate }, { onConflict: "id" })
        .select()
        .single();

      if (error) {
        return res
          .status(500)
          .json({ message: "Erro ao salvar configuracao." });
      }

      return res.status(200).json(data);
    }

    return res.status(405).json({ message: "Metodo nao permitido." });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
