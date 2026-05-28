const { supabase } = require("../../../lib/supabase");
const { generateContract } = require("../../../lib/contract-generator");
const { corsHeaders, handleOptions } = require("../../../lib/reservations");

module.exports = async (req, res) => {
  corsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ message: "ID da reserva nao informado." });
  }

  try {
    const { data: reservation, error } = await supabase
      .from("reservations")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !reservation) {
      return res.status(404).json({ message: "Reserva nao encontrada." });
    }

    if (req.method === "GET") {
      const buffer = await generateContract(reservation);
      const safeName = reservation.clientName.replace(/[\\/:*?"<>|]/g, "_");
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="CONTRATO DE LOCACAO - ${safeName}.docx"`
      );
      res.setHeader("Content-Length", buffer.length);
      return res.status(200).send(buffer);
    }

    if (req.method === "POST") {
      return res.status(200).json({
        message: "Contrato gerado com sucesso.",
        downloadUrl: `/api/reservations/${id}/contract`,
      });
    }

    return res.status(405).json({ message: "Metodo nao permitido." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
