import { useCallback, useEffect, useState } from "react";

import type { CSSProperties, FormEvent } from "react";

import { useNavigate } from "react-router-dom";

import {
  CheckCircle2,
  Clock3,
  FileCheck2,
  Loader2,
  ReceiptText,
  RefreshCcw,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import "../../styles/FinanceDashboard.css";

const FINANCE_DASHBOARD_API = "http://localhost:3000/api/finance/dashboard";

const FINANCE_TICKETS_API = "http://localhost:3000/api/finance/tickets";

// ============================================================
// TYPES
// ============================================================

interface FinanceDashboardResponse {
  success?: boolean;
  message?: string;

  summary?: {
    pending_tickets?: number;
    completed_today?: number;
    waiting_for_registrar?: number;
  };
}

interface FinanceTicket {
  ticket_id: number;
  ticket_number: string;

  student: {
    student_id: number;
    student_number: string;
    student_name: string;
  };

  transaction: {
    transaction_type_id: number;
    transaction_code: string;
    transaction_name: string;
  };

  document_request: {
    request_id: number;
    request_number: string;
    document_type: string;
    purpose: string | null;
    copies: number;
    requested_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
  } | null;

  grade_id: number | null;

  payment: {
    amount_due: number | null;
    amount_paid: number;
    payment_method: string | null;
    receipt_number: string | null;
    payment_status: string;
    finance_remarks: string | null;
    paid_by: number | null;
    paid_at: string | null;
  };

  registrar: {
    status: string;
    remarks: string | null;
    processed_by: number | null;
    started_at: string | null;
    completed_at: string | null;
  };

  created_at: string | null;
  updated_at: string | null;
}

interface FinanceTicketResponse {
  success?: boolean;
  code?: string;
  message?: string;
  ticket?: FinanceTicket;
}

interface FinancePaymentResponse {
  success?: boolean;
  code?: string;
  message?: string;

  ticket?: {
    ticket_id: number;
    ticket_number: string;

    payment?: {
      amount_due?: number;
      amount_paid?: number;
      payment_method?: string;
      receipt_number?: string;
      payment_status?: string;
      paid_by?: number;
    };

    registrar?: {
      status?: string;
    };
  };
}

type PaymentMethod = "Cash" | "GCash" | "Bank" | "Online";

// ============================================================
// HELPERS
// ============================================================

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not assigned";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function paymentBadgeStyle(status: string): CSSProperties {
  if (status === "Paid") {
    return {
      color: "#166534",
      background: "#dcfce7",
      border: "1px solid #bbf7d0",
    };
  }

  if (status === "Pending Payment") {
    return {
      color: "#92400e",
      background: "#fef3c7",
      border: "1px solid #fde68a",
    };
  }

  return {
    color: "#991b1b",
    background: "#fee2e2",
    border: "1px solid #fecaca",
  };
}

function registrarBadgeStyle(status: string): CSSProperties {
  if (status === "Done") {
    return {
      color: "#166534",
      background: "#dcfce7",
      border: "1px solid #bbf7d0",
    };
  }

  if (status === "Processing") {
    return {
      color: "#1d4ed8",
      background: "#dbeafe",
      border: "1px solid #bfdbfe",
    };
  }

  if (status === "Ready for Processing") {
    return {
      color: "#6d28d9",
      background: "#ede9fe",
      border: "1px solid #ddd6fe",
    };
  }

  return {
    color: "#475569",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
  };
}

// ============================================================
// COMPONENT
// ============================================================

export default function FinanceDashboard() {
  const navigate = useNavigate();

  /*
   * Keep auth dependencies primitive.
   * Do not use the whole session object in useEffect dependencies.
   */
  const session = authService.getSession();
  const token = authService.getToken();

  const role = session?.role ?? null;

  const isFinance = role === "Finance" && Boolean(token);

  // ==========================================================
  // DASHBOARD STATE
  // ==========================================================

  const [summary, setSummary] = useState({
    pending_tickets: 0,
    completed_today: 0,
    waiting_for_registrar: 0,
  });

  const [statusMessage, setStatusMessage] = useState(
    "Loading finance workspace...",
  );

  const [dashboardLoading, setDashboardLoading] = useState(true);

  // ==========================================================
  // TICKET SEARCH STATE
  // ==========================================================

  const [ticketNumber, setTicketNumber] = useState("");

  const [ticket, setTicket] = useState<FinanceTicket | null>(null);

  const [searching, setSearching] = useState(false);

  // ==========================================================
  // PAYMENT STATE
  // ==========================================================

  const [amountDue, setAmountDue] = useState("");

  const [amountPaid, setAmountPaid] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");

  const [receiptNumber, setReceiptNumber] = useState("");

  const [remarks, setRemarks] = useState("");

  const [paying, setPaying] = useState(false);

  // ==========================================================
  // MESSAGE STATE
  // ==========================================================

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  // ==========================================================
  // AUTH GUARD
  // ==========================================================

  useEffect(() => {
    if (!isFinance) {
      navigate("/login", {
        replace: true,
      });
    }
  }, [isFinance, navigate]);

  // ==========================================================
  // LOAD DASHBOARD
  // ==========================================================

  const loadDashboard = useCallback(async () => {
    if (!isFinance) {
      return;
    }

    try {
      setDashboardLoading(true);

      const response = await authService.authFetch(FINANCE_DASHBOARD_API, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (response.status === 403) {
        navigate("/login", {
          replace: true,
        });

        return;
      }

      const data = (await response.json()) as FinanceDashboardResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load the Finance dashboard.",
        );
      }

      setSummary({
        pending_tickets: Number(data.summary?.pending_tickets ?? 0),

        completed_today: Number(data.summary?.completed_today ?? 0),

        waiting_for_registrar: Number(data.summary?.waiting_for_registrar ?? 0),
      });

      setStatusMessage(data.message || "Finance workspace is ready.");
    } catch (error) {
      console.error("LOAD FINANCE DASHBOARD ERROR:", error);

      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the Finance dashboard.",
      );
    } finally {
      setDashboardLoading(false);
    }
  }, [isFinance, navigate]);

  useEffect(() => {
    if (!isFinance) {
      return;
    }

    void loadDashboard();
  }, [isFinance, loadDashboard]);

  // ==========================================================
  // RESET PAYMENT FORM FROM TICKET
  // ==========================================================

  const preparePaymentForm = (currentTicket: FinanceTicket) => {
    if (currentTicket.payment.amount_due !== null) {
      const due = String(currentTicket.payment.amount_due);

      setAmountDue(due);

      if (currentTicket.payment.payment_status === "Pending Payment") {
        setAmountPaid(due);
      } else {
        setAmountPaid(String(currentTicket.payment.amount_paid));
      }
    } else {
      setAmountDue("");
      setAmountPaid("");
    }

    setPaymentMethod(
      currentTicket.payment.payment_method === "GCash" ||
        currentTicket.payment.payment_method === "Bank" ||
        currentTicket.payment.payment_method === "Online" ||
        currentTicket.payment.payment_method === "Cash"
        ? currentTicket.payment.payment_method
        : "Cash",
    );

    setReceiptNumber(currentTicket.payment.receipt_number ?? "");

    setRemarks(currentTicket.payment.finance_remarks ?? "");
  };

  // ==========================================================
  // LOOKUP TICKET
  // ==========================================================

  const lookupTicket = useCallback(
    async (requestedTicketNumber: string) => {
      if (!isFinance) {
        return;
      }

      const normalized = requestedTicketNumber.trim().toUpperCase();

      if (!normalized) {
        setErrorMessage("Enter a Finance ticket number.");

        return;
      }

      setSearching(true);
      setErrorMessage("");
      setSuccessMessage("");
      setTicket(null);

      try {
        const response = await authService.authFetch(
          `${FINANCE_TICKETS_API}/${encodeURIComponent(normalized)}`,
          {
            method: "GET",

            headers: {
              Accept: "application/json",
            },
          },
        );

        if (response.status === 401) {
          authService.logout();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        const data = (await response.json()) as FinanceTicketResponse;

        if (!response.ok || !data.success || !data.ticket) {
          throw new Error(data.message || "Finance ticket was not found.");
        }

        setTicketNumber(data.ticket.ticket_number);

        setTicket(data.ticket);

        preparePaymentForm(data.ticket);
      } catch (error) {
        console.error("FINANCE TICKET LOOKUP ERROR:", error);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load Finance ticket.",
        );
      } finally {
        setSearching(false);
      }
    },
    [isFinance, navigate],
  );

  // ==========================================================
  // SEARCH FORM
  // ==========================================================

  const handleTicketSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    void lookupTicket(ticketNumber);
  };

  // ==========================================================
  // PAYMENT
  // ==========================================================

  const handlePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ticket || paying) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    // --------------------------------------------------------
    // Ticket must still be pending.
    // --------------------------------------------------------

    if (ticket.payment.payment_status !== "Pending Payment") {
      setErrorMessage(
        `This ticket is already ${ticket.payment.payment_status}.`,
      );

      return;
    }

    // --------------------------------------------------------
    // Validate amount due.
    // --------------------------------------------------------

    const numericAmountDue = Number(amountDue);

    if (!Number.isFinite(numericAmountDue) || numericAmountDue <= 0) {
      setErrorMessage("Enter a valid amount due greater than zero.");

      return;
    }

    // --------------------------------------------------------
    // Validate amount paid.
    // --------------------------------------------------------

    const numericAmountPaid = Number(amountPaid);

    if (!Number.isFinite(numericAmountPaid) || numericAmountPaid <= 0) {
      setErrorMessage("Enter a valid amount paid greater than zero.");

      return;
    }

    // --------------------------------------------------------
    // Receipt required.
    // --------------------------------------------------------

    if (!receiptNumber.trim()) {
      setErrorMessage("Receipt number is required.");

      return;
    }

    try {
      setPaying(true);

      const response = await authService.authFetch(
        `${FINANCE_TICKETS_API}/${encodeURIComponent(
          ticket.ticket_number,
        )}/pay`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",

            Accept: "application/json",
          },

          body: JSON.stringify({
            amount_due: numericAmountDue,

            amount_paid: numericAmountPaid,

            payment_method: paymentMethod,

            receipt_number: receiptNumber.trim(),

            remarks: remarks.trim(),
          }),
        },
      );

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      const data = (await response.json()) as FinancePaymentResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to complete payment.");
      }

      setSuccessMessage(data.message || "Payment completed successfully.");

      /*
       * Refresh ticket so paid_at,
       * status and other DB fields are
       * reloaded from the server.
       */
      await lookupTicket(ticket.ticket_number);

      /*
       * Refresh dashboard counters:
       *
       * Pending -1
       * Completed Today +1
       * Waiting for Registrar +1
       */
      await loadDashboard();
    } catch (error) {
      console.error("FINANCE PAYMENT ERROR:", error);

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete payment.",
      );
    } finally {
      setPaying(false);
    }
  };

  // ==========================================================
  // AUTHORIZED RENDER ONLY
  // ==========================================================

  if (!isFinance) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="finance-dashboard">
        {/* ===================================================
            HERO
        =================================================== */}

        <section className="finance-dashboard__hero">
          <div>
            <p className="finance-dashboard__eyebrow">Finance Office</p>

            <h1>Finance Dashboard</h1>

            <p>
              Search student transaction tickets, receive payments, and forward
              completed transactions to the Registrar.
            </p>
          </div>

          <ReceiptText size={42} aria-hidden="true" />
        </section>

        {/* ===================================================
            DASHBOARD SUMMARY
        =================================================== */}

        <section
          className="finance-dashboard__cards"
          aria-label="Finance summary"
        >
          <article className="finance-dashboard__card">
            <Clock3 size={24} aria-hidden="true" />

            <div>
              <span>Pending Tickets</span>

              <strong>
                {dashboardLoading ? "..." : summary.pending_tickets}
              </strong>
            </div>
          </article>

          <article className="finance-dashboard__card">
            <CheckCircle2 size={24} aria-hidden="true" />

            <div>
              <span>Completed Today</span>

              <strong>
                {dashboardLoading ? "..." : summary.completed_today}
              </strong>
            </div>
          </article>

          <article className="finance-dashboard__card">
            <FileCheck2 size={24} aria-hidden="true" />

            <div>
              <span>Waiting for Registrar</span>

              <strong>
                {dashboardLoading ? "..." : summary.waiting_for_registrar}
              </strong>
            </div>
          </article>
        </section>

        {/* ===================================================
            CASHIER TICKET SEARCH
        =================================================== */}

        <section className="finance-dashboard__panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <div>
              <h2>Cashier Ticket Lookup</h2>

              <p>Enter the Finance ticket number presented by the student.</p>
            </div>

            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={dashboardLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "9px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: "9px",
                background: "#ffffff",
                color: "#334155",
                fontWeight: 700,
                cursor: dashboardLoading ? "wait" : "pointer",
              }}
            >
              <RefreshCcw size={15} />
              Refresh
            </button>
          </div>

          <form
            onSubmit={handleTicketSearch}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: "10px",
            }}
          >
            <input
              type="text"
              value={ticketNumber}
              onChange={(event) =>
                setTicketNumber(event.target.value.toUpperCase())
              }
              placeholder="Example: FIN-COR-2026-000001"
              disabled={searching}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                outline: "none",
                fontSize: "14px",
                fontWeight: 600,
              }}
            />

            <button
              type="submit"
              disabled={searching}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                minWidth: "120px",
                padding: "11px 16px",
                border: 0,
                borderRadius: "10px",
                background: searching ? "#86a993" : "#15803d",
                color: "#ffffff",
                fontWeight: 800,
                cursor: searching ? "wait" : "pointer",
              }}
            >
              {searching ? (
                <>
                  <Loader2 size={17} />
                  Searching...
                </>
              ) : (
                <>
                  <Search size={17} />
                  Search
                </>
              )}
            </button>
          </form>

          {/* MESSAGES */}

          {errorMessage && (
            <div
              style={{
                marginTop: "14px",
                padding: "12px 14px",
                border: "1px solid #fecaca",
                borderRadius: "10px",
                background: "#fef2f2",
                color: "#991b1b",
                fontSize: "13px",
                fontWeight: 650,
              }}
            >
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              style={{
                marginTop: "14px",
                padding: "12px 14px",
                border: "1px solid #bbf7d0",
                borderRadius: "10px",
                background: "#f0fdf4",
                color: "#166534",
                fontSize: "13px",
                fontWeight: 650,
              }}
            >
              {successMessage}
            </div>
          )}
        </section>

        {/* ===================================================
            TICKET DETAILS
        =================================================== */}

        {ticket && (
          <>
            <section className="finance-dashboard__panel">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "16px",
                  flexWrap: "wrap",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#15803d",
                      fontSize: "12px",
                      fontWeight: 800,
                      textTransform: "uppercase",
                    }}
                  >
                    <ReceiptText size={16} />
                    Finance Ticket
                  </div>

                  <h2
                    style={{
                      marginTop: "6px",
                    }}
                  >
                    {ticket.ticket_number}
                  </h2>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <StatusBadge
                    label={ticket.payment.payment_status}
                    style={paymentBadgeStyle(ticket.payment.payment_status)}
                  />

                  <StatusBadge
                    label={ticket.registrar.status}
                    style={registrarBadgeStyle(ticket.registrar.status)}
                  />
                </div>
              </div>

              {/* STUDENT */}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "16px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  background: "#f8fafc",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    background: "#dcfce7",
                    color: "#15803d",
                  }}
                >
                  <UserRound size={21} />
                </div>

                <div>
                  <strong
                    style={{
                      display: "block",
                      color: "#0f172a",
                    }}
                  >
                    {ticket.student.student_name}
                  </strong>

                  <span
                    style={{
                      display: "block",
                      marginTop: "3px",
                      color: "#64748b",
                      fontSize: "12px",
                    }}
                  >
                    {ticket.student.student_number}
                  </span>
                </div>
              </div>

              {/* INFORMATION GRID */}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "12px",
                }}
              >
                <InfoBox
                  label="Transaction"
                  value={ticket.transaction.transaction_name}
                />

                <InfoBox
                  label="Transaction Code"
                  value={ticket.transaction.transaction_code}
                />

                <InfoBox
                  label="Request Number"
                  value={ticket.document_request?.request_number ?? "—"}
                />

                <InfoBox
                  label="Copies"
                  value={
                    ticket.document_request?.copies !== undefined
                      ? String(ticket.document_request.copies)
                      : "—"
                  }
                />

                <InfoBox
                  label="Amount Due"
                  value={formatMoney(ticket.payment.amount_due)}
                />

                <InfoBox
                  label="Amount Paid"
                  value={formatMoney(ticket.payment.amount_paid)}
                />

                <InfoBox
                  label="Payment Method"
                  value={ticket.payment.payment_method ?? "—"}
                />

                <InfoBox
                  label="Receipt Number"
                  value={ticket.payment.receipt_number ?? "—"}
                />

                <InfoBox
                  label="Paid At"
                  value={formatDate(ticket.payment.paid_at)}
                />

                <InfoBox
                  label="Registrar Status"
                  value={ticket.registrar.status}
                />
              </div>

              {ticket.document_request?.purpose && (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "13px 14px",
                    borderRadius: "10px",
                    background: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      marginBottom: "4px",
                      color: "#64748b",
                      fontSize: "10px",
                      fontWeight: 800,
                      textTransform: "uppercase",
                    }}
                  >
                    Purpose
                  </div>

                  <div
                    style={{
                      color: "#334155",
                      fontSize: "13px",
                    }}
                  >
                    {ticket.document_request.purpose}
                  </div>
                </div>
              )}
            </section>

            {/* =================================================
                PAYMENT FORM
            ================================================= */}

            <section className="finance-dashboard__panel">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "18px",
                }}
              >
                <WalletCards size={22} color="#15803d" />

                <div>
                  <h2>Payment</h2>

                  <p>Record the student's payment for this transaction.</p>
                </div>
              </div>

              {ticket.payment.payment_status === "Pending Payment" ? (
                <form
                  onSubmit={handlePayment}
                  style={{
                    display: "grid",

                    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",

                    gap: "14px",
                  }}
                >
                  {/* AMOUNT DUE */}

                  <FieldLabel label="Amount Due">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amountDue}
                      onChange={(event) => {
                        setAmountDue(event.target.value);

                        /*
                         * If the ticket
                         * originally had
                         * no amount due,
                         * help cashier by
                         * keeping amount
                         * paid equal.
                         */
                        if (ticket.payment.amount_due === null) {
                          setAmountPaid(event.target.value);
                        }
                      }}
                      disabled={paying || ticket.payment.amount_due !== null}
                      style={inputStyle}
                    />
                  </FieldLabel>

                  {/* AMOUNT PAID */}

                  <FieldLabel label="Amount Paid">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amountPaid}
                      onChange={(event) => setAmountPaid(event.target.value)}
                      disabled={paying}
                      style={inputStyle}
                    />
                  </FieldLabel>

                  {/* PAYMENT METHOD */}

                  <FieldLabel label="Payment Method">
                    <select
                      value={paymentMethod}
                      onChange={(event) =>
                        setPaymentMethod(event.target.value as PaymentMethod)
                      }
                      disabled={paying}
                      style={inputStyle}
                    >
                      <option value="Cash">Cash</option>

                      <option value="GCash">GCash</option>

                      <option value="Bank">Bank</option>

                      <option value="Online">Online</option>
                    </select>
                  </FieldLabel>

                  {/* RECEIPT */}

                  <FieldLabel label="Receipt Number">
                    <input
                      type="text"
                      value={receiptNumber}
                      onChange={(event) => setReceiptNumber(event.target.value)}
                      placeholder="Example: OR-000001"
                      disabled={paying}
                      style={inputStyle}
                    />
                  </FieldLabel>

                  {/* REMARKS */}

                  <label
                    style={{
                      gridColumn: "1 / -1",
                      display: "grid",
                      gap: "7px",
                      color: "#334155",
                      fontSize: "13px",
                      fontWeight: 700,
                    }}
                  >
                    Finance Remarks
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={remarks}
                      onChange={(event) => setRemarks(event.target.value)}
                      placeholder="Optional payment remarks..."
                      disabled={paying}
                      style={{
                        ...inputStyle,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </label>

                  {/* BUTTON */}

                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      type="submit"
                      disabled={paying}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        minWidth: "190px",
                        padding: "11px 18px",
                        border: 0,
                        borderRadius: "10px",
                        background: paying ? "#86a993" : "#15803d",
                        color: "#ffffff",
                        fontWeight: 800,
                        cursor: paying ? "wait" : "pointer",
                      }}
                    >
                      {paying ? (
                        <>
                          <Loader2 size={17} />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={17} />
                          Mark as Paid
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  style={{
                    padding: "18px",
                    border: "1px solid #bbf7d0",
                    borderRadius: "12px",
                    background: "#f0fdf4",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "#166534",
                    }}
                  >
                    <CheckCircle2 size={22} />

                    <strong>Payment already completed</strong>
                  </div>

                  <p
                    style={{
                      margin: "8px 0 0",
                      color: "#166534",
                      fontSize: "13px",
                    }}
                  >
                    This transaction has already been paid and is currently{" "}
                    <strong>{ticket.registrar.status}</strong> on the Registrar
                    side.
                  </p>
                </div>
              )}
            </section>
          </>
        )}

        {/* ===================================================
            CONNECTION STATUS
        =================================================== */}

        <section className="finance-dashboard__panel">
          <h2>Finance role connected</h2>

          <p>{statusMessage}</p>

          <p className="finance-dashboard__flow">
            Student / Faculty verification → Finance ticket → payment completed
            → Registrar action.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}

// ============================================================
// SMALL COMPONENTS
// ============================================================

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "11px 13px",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          marginBottom: "4px",
          color: "#64748b",
          fontSize: "10px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#0f172a",
          fontSize: "13px",
          fontWeight: 750,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  style,
}: {
  label: string;
  style: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 9px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 800,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: "7px",
        color: "#334155",
        fontSize: "13px",
        fontWeight: 700,
      }}
    >
      {label}

      {children}
    </label>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#0f172a",
  outline: "none",
};
