const apiBase = "/api/reservations";
const settingsApi = "/api/settings";

const statusLabels = {
  orcamento: "Orcamento",
  "pre-reserva": "Pre-reserva",
  reservado: "Reservado",
  pago: "Pago",
  cancelado: "Cancelado",
};

const state = {
  reservations: [],
  activeDate: new Date(),
  activeYear: new Date().getFullYear(),
  filter: "todos",
  isOnline: false,
  activeView: "month",
  settings: {
    employeeRate: 260,
  },
};

const elements = {
  calendarGrid: document.querySelector("#calendarGrid"),
  monthTitle: document.querySelector("#monthTitle"),
  eventsList: document.querySelector("#eventsList"),
  form: document.querySelector("#reservationForm"),
  viewPanels: document.querySelectorAll(".view-panel"),
  navButtons: document.querySelectorAll(".nav-button"),
  reservationId: document.querySelector("#reservationId"),
  clientName: document.querySelector("#clientName"),
  cpf: document.querySelector("#cpf"),
  email: document.querySelector("#email"),
  phone: document.querySelector("#phone"),
  eventDate: document.querySelector("#eventDate"),
  endDate: document.querySelector("#endDate"),
  eventType: document.querySelector("#eventType"),
  status: document.querySelector("#status"),
  totalValue: document.querySelector("#totalValue"),
  paymentsList: document.querySelector("#paymentsList"),
  addPaymentButton: document.querySelector("#addPaymentButton"),
  notes: document.querySelector("#notes"),
  deleteButton: document.querySelector("#deleteButton"),
  generateContractButton: document.querySelector("#generateContractButton"),
  clearFormButton: document.querySelector("#clearFormButton"),
  previousMonth: document.querySelector("#previousMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  todayButton: document.querySelector("#todayButton"),
  filterButtons: document.querySelectorAll(".filter-button"),
  totalReservations: document.querySelector("#totalReservations"),
  receivedRevenue: document.querySelector("#receivedRevenue"),
  monthRevenue: document.querySelector("#monthRevenue"),
  previousYear: document.querySelector("#previousYear"),
  nextYear: document.querySelector("#nextYear"),
  currentYearButton: document.querySelector("#currentYearButton"),
  yearTitle: document.querySelector("#yearTitle"),
  yearCalendar: document.querySelector("#yearCalendar"),
  yearEventsTotal: document.querySelector("#yearEventsTotal"),
  yearOccupiedDays: document.querySelector("#yearOccupiedDays"),
  yearRevenue: document.querySelector("#yearRevenue"),
  employeeRate: document.querySelector("#employeeRate"),
  employeeMonth: document.querySelector("#employeeMonth"),
  saveEmployeeRateButton: document.querySelector("#saveEmployeeRateButton"),
  employeeEventsCount: document.querySelector("#employeeEventsCount"),
  employeeRateDisplay: document.querySelector("#employeeRateDisplay"),
  employeeTotalDue: document.querySelector("#employeeTotalDue"),
  employeeEventsList: document.querySelector("#employeeEventsList"),
  toast: document.querySelector("#toast"),
  connectionStatus: document.querySelector("#connectionStatus"),
  clientSearch: document.querySelector("#clientSearch"),
  clientSearchButton: document.querySelector("#clientSearchButton"),
  searchResults: document.querySelector("#searchResults"),
};

init();

async function init() {
  bindEvents();
  initializeEmployeeMonth();
  await loadSettings();
  await loadReservations();
  render();
}

function bindEvents() {
  elements.form.addEventListener("submit", handleSubmit);
  elements.deleteButton.addEventListener("click", deleteCurrentReservation);
  elements.generateContractButton.addEventListener("click", generateContract);
  elements.cpf.addEventListener("input", () => maskCPF(elements.cpf));
  elements.clearFormButton.addEventListener("click", clearForm);
  elements.addPaymentButton.addEventListener("click", () => { addPaymentRow(); updateTotalFromPayments(); });
  elements.saveEmployeeRateButton.addEventListener("click", saveSettings);
  elements.employeeMonth.addEventListener("change", renderEmployeePayments);
  elements.previousYear.addEventListener("click", () => changeYear(-1));
  elements.nextYear.addEventListener("click", () => changeYear(1));
  elements.currentYearButton.addEventListener("click", () => {
    state.activeYear = new Date().getFullYear();
    renderYearDashboard();
  });
  elements.previousMonth.addEventListener("click", () => changeMonth(-1));
  elements.nextMonth.addEventListener("click", () => changeMonth(1));
  elements.todayButton.addEventListener("click", () => {
    state.activeDate = new Date();
    render();
  });

  elements.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      elements.filterButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderEventsList();
    });
  });

  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  elements.clientSearchButton.addEventListener("click", handleClientSearch);
  elements.clientSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleClientSearch();
    }
  });
}

async function loadSettings() {
  try {
    const settings = await requestJson(settingsApi);
    state.settings = {
      ...state.settings,
      ...settings,
    };
  } catch (error) {
    showToast("Usando configuracao local de pagamentos.");
  }

  elements.employeeRate.value = state.settings.employeeRate || "";
}

async function loadReservations() {
  try {
    const reservations = await requestJson(apiBase);
    state.reservations = reservations;
    setConnectionStatus(true);
  } catch (error) {
    setConnectionStatus(false);
    showToast("Nao foi possivel carregar as reservas do servidor.");
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = readForm();
  if (formData.endDate < formData.eventDate) {
    showToast("A data final nao pode ser antes da data inicial.");
    return;
  }

  const conflict = findLocalConflict(formData);
  if (conflict) {
    showToast(`Este periodo ja conflita com ${conflict.clientName}.`);
    return;
  }

  try {
    const savedReservation = formData.id
      ? await requestJson(`${apiBase}/${formData.id}`, {
          method: "PUT",
          body: JSON.stringify(formData),
        })
      : await requestJson(apiBase, {
          method: "POST",
          body: JSON.stringify(formData),
        });

    const existingIndex = state.reservations.findIndex((reservation) => reservation.id === savedReservation.id);
    if (existingIndex >= 0) {
      state.reservations[existingIndex] = savedReservation;
      showToast("Reserva atualizada.");
    } else {
      state.reservations.push(savedReservation);
      showToast("Reserva salva.");
    }

    setConnectionStatus(true);
    state.activeDate = parseDate(getStartDate(savedReservation));
    clearForm();
    render();
  } catch (error) {
    setConnectionStatus(false);
    showToast(error.message || "Nao foi possivel salvar a reserva.");
  }
}

function readForm() {
  return {
    id: elements.reservationId.value,
    clientName: elements.clientName.value.trim(),
    phone: elements.phone.value.trim(),
    cpf: formatCPF(elements.cpf.value.trim()),
    email: elements.email.value.trim(),
    eventDate: elements.eventDate.value,
    endDate: elements.endDate.value || elements.eventDate.value,
    eventType: elements.eventType.value,
    status: elements.status.value,
    totalValue: Number(elements.totalValue.value || 0),
    payments: readPayments(),
    notes: elements.notes.value.trim(),
  };
}

function formatCPF(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  let result = digits.slice(0, 3);
  if (digits.length > 3) result += "." + digits.slice(3, 6);
  if (digits.length > 6) result += "." + digits.slice(6, 9);
  if (digits.length > 9) result += "-" + digits.slice(9, 11);
  return result;
}

function maskCPF(input) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const beforeLen = input.value.length;
  const raw = input.value.replace(/\D/g, "").slice(0, 11);
  let masked = raw.slice(0, 3);
  if (raw.length > 3) masked += "." + raw.slice(3, 6);
  if (raw.length > 6) masked += "." + raw.slice(6, 9);
  if (raw.length > 9) masked += "-" + raw.slice(9, 11);
  const afterLen = masked.length;
  input.value = masked;
  if (input.setSelectionRange) {
    input.setSelectionRange(start + (afterLen - beforeLen), end + (afterLen - beforeLen));
  }
}

function handleClientSearch() {
  const query = elements.clientSearch.value.trim().toLowerCase();
  const container = elements.searchResults;
  container.innerHTML = "";

  if (query.length < 2) {
    container.innerHTML = '<div class="search-empty">Digite ao menos 2 caracteres para buscar.</div>';
    return;
  }

  const matches = state.reservations.filter((reservation) =>
    reservation.clientName.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    container.innerHTML = '<div class="search-empty">Nenhuma reserva encontrada para este cliente.</div>';
    return;
  }

  matches
    .sort((a, b) => getStartDate(a).localeCompare(getStartDate(b)))
    .forEach((reservation) => {
      const item = document.createElement("div");
      item.className = "search-result-item";

      const dates =
        getStartDate(reservation) === getEndDate(reservation)
          ? formatShortDate(getStartDate(reservation))
          : `${formatShortDate(getStartDate(reservation))} a ${formatShortDate(getEndDate(reservation))}`;

      const phoneText = reservation.phone ? ` - ${escapeHtml(reservation.phone)}` : "";

      item.innerHTML = `
        <div class="result-info">
          <strong>${escapeHtml(reservation.clientName)}</strong>
          <span>${escapeHtml(reservation.eventType)} - ${dates}${phoneText}</span>
        </div>
        <div class="result-meta">
          <span class="status-pill ${reservation.status}">${statusLabels[reservation.status]}</span>
          <button class="today-button" type="button" data-search-edit="${reservation.id}">Editar</button>
        </div>
      `;

      item.querySelector("[data-search-edit]").addEventListener("click", () => {
        editReservation(reservation.id);
        switchView("month");
      });

      container.appendChild(item);
    });
}

function findLocalConflict(formData) {
  return state.reservations.find((reservation) => {
    const overlaps = dateRangesOverlap(
      getStartDate(reservation),
      getEndDate(reservation),
      formData.eventDate,
      formData.endDate
    );
    const differentRecord = reservation.id !== formData.id;
    const blocksDate = !["cancelado", "orcamento"].includes(reservation.status);
    const newRecordBlocksDate = !["cancelado", "orcamento"].includes(formData.status);
    return overlaps && differentRecord && blocksDate && newRecordBlocksDate;
  });
}

function editReservation(id) {
  const reservation = state.reservations.find((item) => item.id === id);
  if (!reservation) return;

  elements.reservationId.value = reservation.id;
  elements.clientName.value = reservation.clientName;
  elements.phone.value = reservation.phone;
  elements.eventDate.value = getStartDate(reservation);
  elements.endDate.value = getEndDate(reservation);
  elements.eventType.value = reservation.eventType;
  elements.status.value = reservation.status;
  elements.totalValue.value = reservation.totalValue || "";
  renderPaymentRows(reservation.payments || []);
  updateTotalFromPayments();
  elements.cpf.value = reservation.cpf || "";
  elements.email.value = reservation.email || "";
  elements.notes.value = reservation.notes;
  elements.deleteButton.hidden = false;
  elements.generateContractButton.hidden = false;
  elements.clientName.focus();
}

async function generateContract() {
  const id = elements.reservationId.value;
  if (!id) return;

  try {
    const response = await fetch(`${apiBase}/${id}/contract`, {
      method: "POST",
    });

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("json")) {
      const data = await response.json();
      if (response.ok) {
        showToast("Contrato gerado com sucesso.");
      } else {
        showToast(data.message || "Erro ao gerar contrato.");
      }
    } else {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `CONTRATO DE LOCACAO - ${id}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Contrato baixado.");
    }
  } catch (error) {
    showToast(error.message || "Erro ao gerar contrato.");
  }
}

async function deleteCurrentReservation() {
  const id = elements.reservationId.value;
  if (!id) return;

  const reservation = state.reservations.find((item) => item.id === id);
  const confirmed = window.confirm(`Excluir a reserva de ${reservation.clientName}?`);
  if (!confirmed) return;

  try {
    await requestJson(`${apiBase}/${id}`, { method: "DELETE" });
    state.reservations = state.reservations.filter((item) => item.id !== id);
    setConnectionStatus(true);
    clearForm();
    render();
    showToast("Reserva excluida.");
  } catch (error) {
    setConnectionStatus(false);
    showToast(error.message || "Nao foi possivel excluir a reserva.");
  }
}

function clearForm() {
  elements.form.reset();
  elements.reservationId.value = "";
  elements.paymentsList.innerHTML = "";
  elements.deleteButton.hidden = true;
  elements.generateContractButton.hidden = true;
  addPaymentRow();
  updateTotalFromPayments();
}

function changeMonth(offset) {
  state.activeDate = new Date(state.activeDate.getFullYear(), state.activeDate.getMonth() + offset, 1);
  render();
}

function changeYear(offset) {
  state.activeYear += offset;
  renderYearDashboard();
}

function switchView(view) {
  state.activeView = view;
  elements.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  elements.viewPanels.forEach((panel) => panel.classList.toggle("active", panel.id === `${view}View`));
  render();
}

function render() {
  renderMonthTitle();
  renderCalendar();
  renderEventsList();
  renderSummary();
  renderYearDashboard();
  renderEmployeePayments();
}

function renderMonthTitle() {
  elements.monthTitle.textContent = formatMonth(state.activeDate);
}

function renderCalendar() {
  elements.calendarGrid.innerHTML = "";

  const year = state.activeDate.getFullYear();
  const month = state.activeDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  const todayKey = toDateKey(new Date());

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    const dateKey = toDateKey(date);
    const cell = document.createElement("article");
    cell.className = "day-cell";
    if (date.getMonth() !== month) cell.classList.add("outside");
    if (dateKey === todayKey) cell.classList.add("today");

    const dayReservations = getReservationsForDate(dateKey);
    if (dayReservations.length > 0) {
      cell.classList.add("has-event");
    }
    if (dayReservations.some((r) => (r.payments || []).some((p) => p.status === "pendente"))) {
      cell.classList.add("has-pending");
    }

    const numberRow = document.createElement("div");
    numberRow.className = "day-number";
    numberRow.innerHTML = `<span>${date.getDate()}</span>`;

    const addButton = document.createElement("button");
    addButton.className = "add-day-button";
    addButton.type = "button";
    addButton.title = "Nova reserva nesta data";
    addButton.textContent = "+";
    addButton.addEventListener("click", () => {
      clearForm();
      elements.eventDate.value = dateKey;
      elements.clientName.focus();
    });

    numberRow.appendChild(addButton);
    cell.appendChild(numberRow);

    const dayEvents = document.createElement("div");
    dayEvents.className = "day-events";

    dayReservations.forEach((reservation) => {
      const eventButton = document.createElement("button");
      const chipClasses = `event-chip ${reservation.status}${(reservation.payments || []).some((p) => p.status === "pendente") ? " pending" : ""}`;
      eventButton.className = chipClasses;
      eventButton.type = "button";
      eventButton.textContent = reservation.clientName;
      eventButton.title = `${reservation.clientName} - ${formatDateRange(reservation)}`;
      eventButton.addEventListener("click", () => editReservation(reservation.id));
      dayEvents.appendChild(eventButton);
    });

    cell.appendChild(dayEvents);
    elements.calendarGrid.appendChild(cell);
  }
}

function renderEventsList() {
  const monthReservations = getReservationsForActiveMonth()
    .filter((reservation) => state.filter === "todos" || reservation.status === state.filter)
    .sort((a, b) => getStartDate(a).localeCompare(getStartDate(b)));

  elements.eventsList.innerHTML = "";

  if (monthReservations.length === 0) {
    elements.eventsList.innerHTML = '<div class="empty-state">Nenhum evento encontrado para este filtro.</div>';
    return;
  }

  monthReservations.forEach((reservation) => {
    const row = document.createElement("article");
    row.className = "event-row";
    const phoneText = reservation.phone ? ` - ${escapeHtml(reservation.phone)}` : "";
    row.innerHTML = `
      <div class="event-date">${formatDay(getStartDate(reservation))}<span>${formatWeekday(getStartDate(reservation))}</span></div>
      <div class="event-info">
        <strong>${escapeHtml(reservation.clientName)}</strong>
        <p>${escapeHtml(reservation.eventType)} - ${formatDateRange(reservation)}${phoneText}</p>
        ${renderPaymentsSummary(reservation)}
      </div>
      <div class="event-meta">
        <span class="status-pill ${reservation.status}">${statusLabels[reservation.status]}</span>
        <button class="today-button" type="button" data-edit="${reservation.id}">Editar</button>
      </div>
    `;

    row.querySelector("[data-edit]").addEventListener("click", () => editReservation(reservation.id));
    elements.eventsList.appendChild(row);
  });
}

function renderSummary() {
  const monthReservations = getReservationsForActiveMonth();
  const reserved = monthReservations.filter((r) => r.status === "reservado");
  const paid = monthReservations.filter((r) => r.status === "pago");
  const paidRevenue = paid.reduce((total, r) => total + Number(r.totalValue || 0), 0);
  const expectedRevenue = reserved.reduce((total, r) => total + Number(r.totalValue || 0), 0);

  elements.totalReservations.textContent = reserved.length;
  elements.receivedRevenue.textContent = formatCurrency(paidRevenue);
  elements.monthRevenue.textContent = formatCurrency(expectedRevenue);
}

function renderYearDashboard() {
  elements.yearTitle.textContent = String(state.activeYear);
  elements.yearCalendar.innerHTML = "";

  const yearReservations = state.reservations.filter((reservation) => reservationTouchesYear(reservation, state.activeYear));
  const confirmedYearReservations = yearReservations.filter(isConfirmedReservation);
  const occupiedDays = new Set();

  confirmedYearReservations.forEach((reservation) => {
    getDateKeysInRange(getStartDate(reservation), getEndDate(reservation)).forEach((dateKey) => {
      if (dateKey.startsWith(`${state.activeYear}-`)) occupiedDays.add(dateKey);
    });
  });

  elements.yearEventsTotal.textContent = confirmedYearReservations.length;
  elements.yearOccupiedDays.textContent = occupiedDays.size;
  elements.yearRevenue.textContent = formatCurrency(
    confirmedYearReservations.reduce((total, reservation) => total + Number(reservation.totalValue || 0), 0)
  );

  for (let month = 0; month < 12; month += 1) {
    elements.yearCalendar.appendChild(createMiniMonth(state.activeYear, month));
  }
}

function createMiniMonth(year, month) {
  const monthCard = document.createElement("article");
  monthCard.className = "mini-month";

  const title = document.createElement("h3");
  title.textContent = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(year, month, 1));
  monthCard.appendChild(title);

  const weekdays = document.createElement("div");
  weekdays.className = "mini-weekdays";
  ["D", "S", "T", "Q", "Q", "S", "S"].forEach((day) => {
    const item = document.createElement("span");
    item.textContent = day;
    weekdays.appendChild(item);
  });
  monthCard.appendChild(weekdays);

  const daysGrid = document.createElement("div");
  daysGrid.className = "mini-days";
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  const todayKey = toDateKey(new Date());

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateKey = toDateKey(date);
    const reservations = getReservationsForDate(dateKey).filter((reservation) => reservation.status !== "orcamento");
    const button = document.createElement("button");
    button.className = "mini-day";
    button.type = "button";
    button.textContent = date.getDate();

    if (date.getMonth() !== month) button.classList.add("outside");
    if (dateKey === todayKey) button.classList.add("today");
    if (reservations.length > 0) button.classList.add("occupied");
    if (reservations.some((reservation) => reservation.status === "pago")) button.classList.add("paid");
    if (reservations.some((reservation) => reservation.status === "cancelado")) button.classList.add("cancelled");
    if (reservations.some((r) => (r.payments || []).some((p) => p.status === "pendente"))) button.classList.add("pending");

    button.title = reservations.length
      ? reservations.map((reservation) => `${reservation.clientName} - ${formatDateRange(reservation)}`).join("\n")
      : dateKey;
    button.addEventListener("click", () => {
      state.activeDate = parseDate(dateKey);
      switchView("month");
    });
    daysGrid.appendChild(button);
  }

  monthCard.appendChild(daysGrid);
  return monthCard;
}

function renderEmployeePayments() {
  const rate = Number(state.settings.employeeRate || 0);
  const [year, month] = elements.employeeMonth.value.split("-").map(Number);
  const monthIndex = month - 1;
  const events = state.reservations
    .filter(isConfirmedReservation)
    .filter((reservation) => {
      const start = parseDate(getStartDate(reservation));
      return start.getFullYear() === year && start.getMonth() === monthIndex;
    })
    .sort((a, b) => getStartDate(a).localeCompare(getStartDate(b)));

  elements.employeeEventsCount.textContent = events.length;
  elements.employeeRateDisplay.textContent = formatCurrency(rate);
  elements.employeeTotalDue.textContent = formatCurrency(events.length * rate);
  elements.employeeEventsList.innerHTML = "";

  if (events.length === 0) {
    elements.employeeEventsList.innerHTML = '<div class="empty-state">Nenhum evento confirmado neste mes.</div>';
    return;
  }

  events.forEach((reservation) => {
    const row = document.createElement("article");
    row.className = "event-row";
    row.innerHTML = `
      <div class="event-date">${formatDay(getStartDate(reservation))}<span>${formatWeekday(getStartDate(reservation))}</span></div>
      <div class="event-info">
        <strong>${escapeHtml(reservation.clientName)}</strong>
        <p>${escapeHtml(reservation.eventType)} - ${formatDateRange(reservation)}</p>
      </div>
      <div class="event-meta">
        <span class="status-pill ${reservation.status}">${statusLabels[reservation.status]}</span>
        <strong>${formatCurrency(rate)}</strong>
      </div>
    `;
    elements.employeeEventsList.appendChild(row);
  });
}

async function saveSettings() {
  const employeeRate = Number(elements.employeeRate.value || 0);

  try {
    state.settings = await requestJson(settingsApi, {
      method: "PUT",
      body: JSON.stringify({ employeeRate }),
    });
    elements.employeeRate.value = state.settings.employeeRate || "";
    renderEmployeePayments();
    showToast("Valor do funcionario salvo.");
  } catch (error) {
    showToast(error.message || "Nao foi possivel salvar a configuracao.");
  }
}

function getReservationsForDate(dateKey) {
  return state.reservations
    .filter((reservation) => dateInRange(dateKey, getStartDate(reservation), getEndDate(reservation)))
    .sort((a, b) => a.status.localeCompare(b.status));
}

function getReservationsForActiveMonth() {
  const year = state.activeDate.getFullYear();
  const month = state.activeDate.getMonth();
  return state.reservations.filter((reservation) => {
    const start = parseDate(getStartDate(reservation));
    const end = parseDate(getEndDate(reservation));
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    return start <= monthEnd && end >= monthStart;
  });
}

function addPaymentRow(payment = {}) {
  const row = document.createElement("div");
  row.className = "payment-row";
  row.innerHTML = `
    <label>
      Data
      <input class="payment-date" type="date" value="${escapeHtml(payment.date || "")}">
    </label>
    <label>
      Valor
      <input class="payment-value" type="number" min="0" step="0.01" value="${payment.value || ""}" placeholder="0,00">
    </label>
    <label>
      Status
      <select class="payment-status">
        <option value="pendente">Pendente</option>
        <option value="pago">Pago</option>
      </select>
    </label>
    <button class="icon-button" type="button" title="Remover pagamento">X</button>
  `;
  row.querySelector(".payment-status").value = payment.status || "pendente";
  row.querySelector(".payment-value").addEventListener("input", updateTotalFromPayments);
  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    updateTotalFromPayments();
  });
  elements.paymentsList.appendChild(row);
}

function renderPaymentRows(payments) {
  elements.paymentsList.innerHTML = "";
  payments.forEach((payment) => addPaymentRow(payment));
  updateTotalFromPayments();
}

function readPayments() {
  return Array.from(elements.paymentsList.querySelectorAll(".payment-row"))
    .map((row) => ({
      date: row.querySelector(".payment-date").value,
      value: Number(row.querySelector(".payment-value").value || 0),
      status: row.querySelector(".payment-status").value,
    }))
    .filter((payment) => payment.date || payment.value > 0);
}

function updateTotalFromPayments() {
  const payments = Array.from(elements.paymentsList.querySelectorAll(".payment-row"))
    .map((row) => Number(row.querySelector(".payment-value").value || 0))
    .reduce((sum, v) => sum + v, 0);
  elements.totalValue.value = payments || "";
}

function renderPaymentsSummary(reservation) {
  const payments = reservation.payments || [];
  if (payments.length === 0) return "";

  const paid = payments
    .filter((payment) => payment.status === "pago")
    .reduce((total, payment) => total + Number(payment.value || 0), 0);
  const pending = payments
    .filter((payment) => payment.status !== "pago")
    .reduce((total, payment) => total + Number(payment.value || 0), 0);

  return `<div class="payment-summary">${payments.length} pagamentos - Pago: ${formatCurrency(paid)} - Pendente: ${formatCurrency(pending)}</div>`;
}

function getStartDate(reservation) {
  return reservation.eventDate;
}

function getEndDate(reservation) {
  return reservation.endDate || reservation.eventDate;
}

function isConfirmedReservation(reservation) {
  return ["reservado", "pago"].includes(reservation.status);
}

function reservationTouchesYear(reservation, year) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  return dateRangesOverlap(getStartDate(reservation), getEndDate(reservation), yearStart, yearEnd);
}

function dateInRange(dateKey, startKey, endKey) {
  return dateKey >= startKey && dateKey <= endKey;
}

function dateRangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

function formatDateRange(reservation) {
  const start = getStartDate(reservation);
  const end = getEndDate(reservation);
  if (start === end) return formatShortDate(start);
  return `${formatShortDate(start)} a ${formatShortDate(end)}`;
}

function formatShortDate(dateKey) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(parseDate(dateKey));
}

function getDateKeysInRange(startKey, endKey) {
  const dates = [];
  const date = parseDate(startKey);
  const end = parseDate(endKey);

  while (date <= end) {
    dates.push(toDateKey(date));
    date.setDate(date.getDate() + 1);
  }

  return dates;
}

function initializeEmployeeMonth() {
  const now = new Date();
  elements.employeeMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(data?.message || "Erro de comunicacao com o servidor.");
  }

  return data;
}

function setConnectionStatus(isOnline) {
  state.isOnline = isOnline;
  if (!elements.connectionStatus) return;

  elements.connectionStatus.textContent = isOnline ? "Servidor conectado" : "Servidor indisponivel";
  elements.connectionStatus.classList.toggle("offline", !isOnline);
}

function parseDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function formatDay(dateKey) {
  return String(parseDate(dateKey).getDate()).padStart(2, "0");
}

function formatWeekday(dateKey) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(parseDate(dateKey));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimeout;
function showToast(message) {
  clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimeout = setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2600);
}
