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

    // Vercel: GET retorna o arquivo DOCX para download
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

    // POST mantido para compatibilidade com servidor local
    if (req.method === "POST") {
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

    return res.status(405).json({ message: "Metodo nao permitido." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
