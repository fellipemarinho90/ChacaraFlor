const { supabase } = require("../../../lib/supabase");
const {
  sanitizeReservation,
  findConflict,
  corsHeaders,
  handleOptions,
} = require("../../../lib/reservations");

module.exports = async (req, res) => {
  if (handleOptions(req, res, "GET, PUT, DELETE, OPTIONS")) return;

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ message: "ID da reserva nao informado." });
  }

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        return res.status(404).json({ message: "Reserva nao encontrada." });
      }

      return res.status(200).json(data);
    }

    if (req.method === "PUT") {
      const input = sanitizeReservation(req.body);

      const { data: existing, error: fetchError } = await supabase
        .from("reservations")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        return res.status(404).json({ message: "Reserva nao encontrada." });
      }

      const { data: allReservations } = await supabase
        .from("reservations")
        .select("*");

      const nextReservation = {
        ...existing,
        ...input,
        id,
      };

      const conflict = findConflict(
        allReservations || [],
        nextReservation,
        id
      );
      if (conflict) {
        return res.status(409).json({
          message: `A data ja esta bloqueada por ${conflict.clientName}.`,
        });
      }

      const { data, error } = await supabase
        .from("reservations")
        .update({
          ...input,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return res
          .status(500)
          .json({ message: "Erro ao atualizar reserva." });
      }

      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      const { data: existing, error: fetchError } = await supabase
        .from("reservations")
        .select("id")
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        return res.status(404).json({ message: "Reserva nao encontrada." });
      }

      const { error } = await supabase
        .from("reservations")
        .delete()
        .eq("id", id);

      if (error) {
        return res
          .status(500)
          .json({ message: "Erro ao excluir reserva." });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ message: "Metodo nao permitido." });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
