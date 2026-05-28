const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  HeadingLevel,
  BorderStyle,
  TabStopPosition,
  TabStopType,
} = require("docx");

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
    if (n < 100)
      return dezenas[Math.floor(n / 10)] + (n % 10 ? " e " + unidades[n % 10] : "");
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
    resultado +=
      milhoes === 1
        ? "um milhão"
        : converter(milhoes) + " milhões";
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
    resultado +=
      " e " +
      (centavos === 1
        ? "um centavo"
        : converter(centavos) + " centavos");
  }

  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

function formatDateBR(dateStr) {
  const [ano, mes, dia] = dateStr.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatDateExtenso(dateStr) {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const diasSemana = [
    "domingo", "segunda-feira", "terça-feira", "quarta-feira",
    "quinta-feira", "sexta-feira", "sábado",
  ];
  const [ano, mes, dia] = dateStr.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return `${diasSemana[data.getDay()]}, ${dia} de ${meses[mes - 1]} de ${ano}`;
}

function buildPaymentSchedule(payments) {
  if (!payments || payments.length === 0) return "Pagamento único no ato da assinatura do contrato.";

  return payments
    .map((p, i) => {
      const data = formatDateBR(p.date);
      const valor = Number(p.value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      return `${i + 1}ª parcela: ${valor} - vencimento: ${data}`;
    })
    .join("\n");
}

async function generateContract(reservation) {
  const totalValue = Number(reservation.totalValue || 0);
  const totalExtenso = numberToWords(totalValue);
  const dataExtenso = formatDateExtenso(reservation.eventDate);
  const dataInicio = formatDateBR(reservation.eventDate);
  const dataFim = formatDateBR(reservation.endDate || reservation.eventDate);
  const parcelas = buildPaymentSchedule(reservation.payments || []);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
            size: 22,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1417,
              right: 1417,
              bottom: 1134,
              left: 1417,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "CONTRATO DE LOCAÇÃO DE ESPAÇO PARA EVENTO",
                bold: true,
                size: 28,
                font: "Arial",
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: "Chácara Flor do Cerrado",
                size: 24,
                font: "Arial",
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "Pelo presente instrumento particular, as partes:",
                italics: true,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "LOCADOR: ", bold: true, size: 22 }),
              new TextRun({
                text: "Proprietário da Chácara Flor do Cerrado, inscrito no CPF sob o nº 000.000.000-00.",
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "LOCATÁRIO: ", bold: true, size: 22 }),
              new TextRun({
                text: `${reservation.clientName}, ${reservation.cpf ? "inscrito no CPF sob o nº " + reservation.cpf + "," : ""} ${reservation.phone ? "telefone " + reservation.phone + "," : ""} doravante denominado simplesmente CONTRATANTE.`,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 400, after: 200 },
            children: [
              new TextRun({
                text: "Cláusula Primeira - DO OBJETO",
                bold: true,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `O presente contrato tem por objeto a locação do espaço para evento denominado Chácara Flor do Cerrado, localizada em Goiânia-GO, para a realização de "${reservation.eventType}" a ser realizada no dia ${dataInicio}${reservation.endDate && reservation.endDate !== reservation.eventDate ? " a " + dataFim : ""}.`,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({
                text: "Cláusula Segunda - DO VALOR E FORMA DE PAGAMENTO",
                bold: true,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `O valor total da locação é de ${totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${totalExtenso}), a ser pago conforme cronograma abaixo:`,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 100, after: 200 },
            children: [
              new TextRun({
                text: parcelas,
                size: 22,
                font: "Arial",
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({
                text: "Cláusula Terceira - DO LOCAL E HORÁRIO",
                bold: true,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "A locação compreende o período das 08h às 23h59min do dia contratado, salvo acordo diverso firmado entre as partes por escrito. O imóvel será entregue em condições de uso, cabendo ao LOCATÁRIO a responsabilidade pela sua conservação durante o evento.",
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({
                text: "Cláusula Quarta - DO CANCELAMENTO",
                bold: true,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "Em caso de cancelamento por parte do LOCATÁRIO, o valor pago a título de sinal não será restituído. O cancelamento deverá ser comunicado por escrito com no mínimo 30 (trinta) dias de antecedência para restituição de valores pagos, exceto o sinal.",
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({
                text: "Cláusula Quinta - DAS OBRIGAÇÕES DO LOCATÁRIO",
                bold: true,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "O LOCATÁRIO se obriga a: (a) devolver o imóvel no estado em que o recebeu; (b) não sublocar ou ceder o espaço a terceiros; (c) respeitar o limite de horário estabelecido; (d) arcar com danos materiais causados ao imóvel; (e) manter o respeito e a ordem durante o evento, vedada a perturbação do sossego público.",
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 300, after: 200 },
            children: [
              new TextRun({
                text: "Cláusula Sexta - DAS DISPOSIÇÕES GERAIS",
                bold: true,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Fica eleito o foro da comarca de Goiânia-GO para dirimir quaisquer dúvidas oriundas do presente contrato. E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.`,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({
                text: `Goiânia, ${dataExtenso}.`,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 600, after: 100 },
            children: [new TextRun({ text: "", size: 22 })],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: "____________________________",
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "LOCADOR",
                bold: true,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 100 },
            children: [new TextRun({ text: "", size: 22 })],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: "____________________________",
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: reservation.clientName.toUpperCase(),
                bold: true,
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "LOCATÁRIO",
                bold: true,
                size: 22,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

module.exports = { generateContract };
