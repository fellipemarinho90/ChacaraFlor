const crypto = require("crypto");
const { supabase } = require("../lib/supabase");
const {
  sanitizeReservation,
  findConflict,
  corsHeaders,
  handleOptions,
} = require("../lib/reservations");

module.exports = async (req, res) => {
  if (handleOptions(req, res, "GET, POST, OPTIONS")) return;

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .order("eventDate", { ascending: true });

      if (error) {
        return res
          .status(500)
          .json({ message: "Erro ao buscar reservas." });
      }

      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const input = sanitizeReservation(req.body);

      const { data: allReservations } = await supabase
        .from("reservations")
        .select("*");

      const conflict = findConflict(allReservations || [], input, null);
      if (conflict) {
        return res.status(409).json({
          message: `A data ja esta bloqueada por ${conflict.clientName}.`,
        });
      }

      const reservation = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("reservations")
        .insert(reservation)
        .select()
        .single();

      if (error) {
        return res
          .status(500)
          .json({ message: "Erro ao salvar reserva." });
      }

      return res.status(201).json(data);
    }

    return res.status(405).json({ message: "Metodo nao permitido." });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
