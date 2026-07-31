const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const templatePath = path.join(__dirname, "..", "CONTRATO DE LOCAÇAO MODELO.docx");

function formatDateExtenso(dateStr) {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const [ano, mes, dia] = dateStr.split("-").map(Number);
  return `${dia} de ${meses[mes - 1]} de ${ano}`;
}

function getDiaSemana(dateStr) {
  const dias = [
    "domingo", "segunda-feira", "terça-feira", "quarta-feira",
    "quinta-feira", "sexta-feira", "sábado",
  ];
  const [ano, mes, dia] = dateStr.split("-").map(Number);
  return dias[new Date(ano, mes - 1, dia).getDay()];
}

function numberToWords(num) {
  if (num === 0) return "zero";
  const unidades = [
    "", "um", "dois", "três", "quatro", "cinco",
    "seis", "sete", "oito", "nove", "dez",
    "onze", "doze", "treze", "quatorze", "quinze",
    "dezesseis", "dezessete", "dezoito", "dezenove",
  ];
  const dezenas = [
    "", "", "vinte", "trinta", "quarenta", "cinquenta",
    "sessenta", "setenta", "oitenta", "noventa",
  ];
  const centenas = [
    "", "cem", "duzentos", "trezentos", "quatrocentos",
    "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos",
  ];

  function converter(n) {
    if (n === 0) return "";
    if (n < 20) return unidades[n];
    if (n < 100) return dezenas[Math.floor(n / 10)] + (n % 10 ? " e " + unidades[n % 10] : "");
    if (n < 1000) {
      if (n === 100) return "cem";
      return centenas[Math.floor(n / 100)] + (n % 100 ? " e " + converter(n % 100) : "");
    }
    return "";
  }

  let resultado = "";
  let inteiro = Math.floor(num);
  let centavos = Math.round((num - inteiro) * 100);

  if (inteiro >= 1000000) {
    const milhoes = Math.floor(inteiro / 1000000);
    resultado += milhoes === 1 ? "um milhão" : converter(milhoes) + " milhões";
    inteiro %= 1000000;
    if (inteiro > 0) resultado += " e ";
  }

  if (inteiro >= 1000) {
    const milhares = Math.floor(inteiro / 1000);
    resultado += milhares === 1 ? "mil" : converter(milhares) + " mil";
    inteiro %= 1000;
    if (inteiro > 0) resultado += " e ";
  }

  if (inteiro > 0) resultado += converter(inteiro);

  if (centavos > 0) {
    resultado += " e " + (centavos === 1 ? "um centavo" : converter(centavos) + " centavos");
  }

  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildPaymentLines(payments, totalValue) {
  if (!payments || payments.length === 0) {
    const formatted = Number(totalValue || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return ["- Pagamento único de R$ " + formatted + " no ato da assinatura do contrato"];
  }

  return payments.map(function (p, i) {
    const valor = Number(p.value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const prefix = "- ";
    if (i === 0) {
      return prefix + "1\u00aa parcela de R$ " + valor + " no ato da assinatura do contrato";
    }
    if (p.date) {
      const parts = p.date.split("-");
      const data = parts[2] + "/" + parts[1] + "/" + parts[0];
      return prefix + (i + 1) + "\u00aa parcela de R$ " + valor + " com vencimento em " + data;
    }
    return prefix + (i + 1) + "\u00aa parcela de R$ " + valor;
  });
}

async function generateContract(reservation) {
  const exists = await fs.promises.access(templatePath).then(function () { return true; }).catch(function () { return false; });
  if (!exists) {
    throw new Error("Modelo de contrato nao encontrado: " + templatePath);
  }

  const data = await fs.promises.readFile(templatePath);
  const zip = await JSZip.loadAsync(data);

  let documentXml = await zip.file("word/document.xml").async("string");

  const totalValue = Number(reservation.totalValue || 0);
  const totalExtenso = numberToWords(totalValue);
  const dataExtenso = formatDateExtenso(reservation.eventDate);
  const diaSemana = getDiaSemana(reservation.eventDate);

  const totalFormatted = totalValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  documentXml = documentXml.replace(/\{NOMECLIENTE\}/g, escapeXml(reservation.clientName));
  documentXml = documentXml.replace(/\{CPFCLIENTE\}/g, escapeXml(reservation.cpf || ""));
  documentXml = documentXml.replace(/\{DATARESERVAEXTENSO\}/g, escapeXml(dataExtenso));
  documentXml = documentXml.replace(/\{DIASEMANA\}/g, escapeXml(diaSemana));
  documentXml = documentXml.replace(/\{VALORTOTAL\}/g, escapeXml(totalFormatted));
  documentXml = documentXml.replace(/\{VALORTOTALEXTENSO\}/g, escapeXml(totalExtenso));

  const parcelasLines = buildPaymentLines(reservation.payments, totalValue);
  documentXml = documentXml.replace(
    /<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?\{PARCELAS\}(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/,
    function (match) {
      var rPr = "";
      var rPrMatch = match.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
      if (rPrMatch) rPr = rPrMatch[0];

      var rTag = match.match(/<w:r\b[^>]*>/);
      var openTag = rTag ? rTag[0] : "<w:r>";

      return parcelasLines.map(function (line, i) {
        var br = i > 0 ? "<w:br/>" : "";
        return openTag + rPr + br + "<w:t>" + escapeXml(line) + "</w:t></w:r>";
      }).join("");
    }
  );

  zip.file("word/document.xml", documentXml);

  return await zip.generateAsync({ type: "nodebuffer", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

module.exports = { generateContract };
