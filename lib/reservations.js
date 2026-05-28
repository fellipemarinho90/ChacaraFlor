const validStatuses = new Set([
  "orcamento",
  "pre-reserva",
  "reservado",
  "pago",
  "cancelado",
]);

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function handleOptions(req, res, methods) {
  corsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

function sanitizeReservation(input) {
  const reservation = {
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

  if (!reservation.clientName) {
    throw new Error("Informe o nome do cliente.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation.eventDate)) {
    throw new Error("Informe uma data valida.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation.endDate)) {
    throw new Error("Informe uma data final valida.");
  }

  if (reservation.endDate < reservation.eventDate) {
    throw new Error("A data final nao pode ser antes da data inicial.");
  }

  if (!validStatuses.has(reservation.status)) {
    throw new Error("Status invalido.");
  }

  return reservation;
}

function sanitizePayments(payments) {
  if (!Array.isArray(payments)) return [];

  return payments.map((payment) => {
    const clean = {
      date: String(payment.date || "").trim(),
      value: Number(payment.value || 0),
      status: String(payment.status || "pendente").trim(),
    };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date)) {
      throw new Error("Informe uma data valida para cada pagamento.");
    }

    if (!["pendente", "pago"].includes(clean.status)) {
      throw new Error("Status de pagamento invalido.");
    }

    return clean;
  });
}

function findConflict(reservations, input, excludeId) {
  return reservations.find((r) => {
    const startA = r.eventDate;
    const endA = r.endDate || r.eventDate;
    const overlaps = startA <= input.endDate && input.eventDate <= endA;
    const different = excludeId ? r.id !== excludeId : true;
    const blocksDate = !["cancelado", "orcamento"].includes(r.status);
    const newBlocks = !["cancelado", "orcamento"].includes(input.status);
    return overlaps && different && blocksDate && newBlocks;
  });
}

module.exports = {
  sanitizeReservation,
  sanitizePayments,
  findConflict,
  corsHeaders,
  handleOptions,
};
