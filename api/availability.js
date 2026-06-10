const { supabase } = require("../lib/supabase");
const { corsHeaders, handleOptions } = require("../lib/reservations");

module.exports = async (req, res) => {
  if (handleOptions(req, res, "GET, OPTIONS")) return;

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Metodo nao permitido." });
    }

    const { date, start, end } = req.query;
    let queryStart, queryEnd;

    if (date) {
      queryStart = date;
      queryEnd = date;
    } else if (start && end) {
      queryStart = start;
      queryEnd = end;
    } else {
      const now = new Date();
      queryStart = now.toISOString().slice(0, 10);
      now.setMonth(now.getMonth() + 6);
      queryEnd = now.toISOString().slice(0, 10);
    }

    const { data: reservations, error } = await supabase
      .from("reservations")
      .select("clientName, eventDate, endDate, status")
      .lte("eventDate", queryEnd)
      .gte("endDate", queryStart)
      .order("eventDate", { ascending: true });

    if (error) {
      return res.status(500).json({ message: "Erro ao verificar disponibilidade." });
    }

    const filtered = (reservations || []).filter((r) =>
      !["cancelado", "orcamento"].includes(r.status)
    );

    const blockedSet = {};
    filtered.forEach((r) => {
      const d = new Date(r.eventDate);
      const e = new Date(r.endDate || r.eventDate);
      while (d <= e) {
        const key = d.toISOString().slice(0, 10);
        if (key >= queryStart && key <= queryEnd) {
          if (!blockedSet[key]) blockedSet[key] = [];
          if (blockedSet[key].length < 2) blockedSet[key].push(r.clientName);
        }
        d.setDate(d.getDate() + 1);
      }
    });
    const blockedDates = Object.keys(blockedSet).sort();

    let available = true;
    if (date) {
      available = !blockedSet[date];
    }

    const acceptHeader = req.headers.accept || "";
    if (acceptHeader.includes("text/html")) {
      const html = generateAvailabilityPage(queryStart, queryEnd, blockedSet, date || null);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(html);
    }

    return res.status(200).json({
      period: { start: queryStart, end: queryEnd },
      available,
      blockedDates: blockedDates.length > 0 ? blockedDates : [],
      reservations: filtered.map((r) => ({
        clientName: r.clientName,
        eventDate: r.eventDate,
        endDate: r.endDate || r.eventDate,
        status: r.status,
      })),
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

function generateAvailabilityPage(start, end, blockedSet, highlightDate) {
  const today = new Date().toISOString().slice(0, 10);
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Disponibilidade - Flor do Cerrado</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#f6f3ec;color:#26302b;padding:20px}
.container{max-width:800px;margin:0 auto}
.header{text-align:center;margin-bottom:24px}
.header h1{font-size:24px;color:#2f6f5e}
.header p{color:#6f7a72;margin-top:4px;font-size:14px}
.meses{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
.mes{border:1px solid #ded8cb;border-radius:8px;background:#fffdf8;overflow:hidden}
.mes-titulo{background:#2f6f5e;color:#fff;padding:10px 14px;font-weight:700;font-size:15px}
.mes-dias{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;padding:4px}
.dia-semana{text-align:center;font-size:11px;color:#6f7a72;font-weight:700;padding:6px 0}
.dia{text-align:center;padding:6px 0;font-size:13px;border-radius:4px}
.dia-disponivel{color:#2f6f5e}
.dia-ocupado{background:#f5e6e2;color:#b84a3a;font-weight:700}
.dia-hoje{font-weight:700;outline:2px solid #b87b28}
.dia-destaque{outline:2px solid #2f6f5e}
.info{text-align:center;margin-top:24px;padding:16px;background:#fffdf8;border:1px solid #ded8cb;border-radius:8px;font-size:14px;color:#6f7a72}
.info strong{color:#26302b}
.footer{text-align:center;margin-top:16px;color:#6f7a72;font-size:12px}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Chácara Flor do Cerrado</h1>
<p>Calendário de disponibilidade</p>
</div>
<div class="meses">`;

  const current = new Date(start);
  const rangeEnd = new Date(end);

  while (current <= rangeEnd) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const monthLabel = monthNames[month] + " " + year;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;

    html += `<div class="mes"><div class="mes-titulo">${monthLabel}</div><div class="mes-dias">`;
    ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].forEach((d) => {
      html += `<div class="dia-semana">${d}</div>`;
    });
    for (let i = 0; i < startOffset; i++) {
      html += "<div></div>";
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      let classes = "dia";
      if (blockedSet[dateStr]) {
        classes += " dia-ocupado";
      } else {
        classes += " dia-disponivel";
      }
      if (dateStr === today) classes += " dia-hoje";
      if (dateStr === highlightDate) classes += " dia-destaque";
      html += `<div class="${classes}">${d}</div>`;
    }
    html += "</div></div>";
    current.setMonth(current.getMonth() + 1);
  }

  html += `</div>
<div class="info"><strong>Legenda:</strong> <span style="color:#2f6f5e">Disponível</span> | <span style="color:#b84a3a">Ocupado</span> | <strong>Hoje</strong></div>
<div class="footer">Chácara Flor do Cerrado</div>
</div>
</body>
</html>`;
  return html;
}
