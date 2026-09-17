import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  ReceiptText,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";

const FINANCE_TICKETS_API = "http://localhost:3000/api/finance/tickets";

type PaymentMethod = "Cash" | "GCash" | "Bank" | "Online";

interface AcademicPeriod {
  academic_year_id: number | null;
  academic_year: string | null;
  semester_id: number | null;
  semester_name: string | null;
  enrollment_status: string | null;
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

    enrollment_id: number | null;
    academic_period: AcademicPeriod | null;

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

interface TicketSearchResponse {
  success?: boolean;
  code?: string;
  message?: string;
  query?: string | null;
  count?: number;
  tickets?: FinanceTicket[];
}

interface PaymentResponse {
  success?: boolean;
  code?: string;
  message?: string;
  ticket?: FinanceTicket;
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

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Not assigned yet";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatAcademicPeriod(request: FinanceTicket["document_request"]) {
  if (!request?.academic_period) {
    return "Not recorded (legacy request)";
  }

  const year = request.academic_period.academic_year || "Unknown academic year";
  const semester = request.academic_period.semester_name || "Unknown semester";

  return `${year} — ${semester}`;
}

function safePositiveMoney(value: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Number(amount.toFixed(2));
}

export default function FinanceTicketProcessing() {
  const navigate = useNavigate();

  const session = authService.getSession();
  const token = authService.getToken();

  const isFinance = session?.role === "Finance" && Boolean(token);

  const [ticketNumber, setTicketNumber] = useState("");
  const [ticket, setTicket] = useState<FinanceTicket | null>(null);

  const [searching, setSearching] = useState(false);
  const [paying, setPaying] = useState(false);

  const [amountDue, setAmountDue] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [remarks, setRemarks] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!isFinance) {
      navigate("/login", {
        replace: true,
      });
    }
  }, [isFinance, navigate]);

  const paymentLocked = useMemo(() => {
    if (!ticket) {
      return true;
    }

    return (
      ticket.payment.payment_status !== "Pending Payment" ||
      ticket.registrar.status !== "Pending" ||
      Boolean(ticket.document_request?.cancelled_at)
    );
  }, [ticket]);

  const resetPaymentForm = (loadedTicket: FinanceTicket) => {
    const due = loadedTicket.payment.amount_due;

    setAmountDue(due === null ? "" : String(due));
    setAmountPaid(due === null ? "" : String(due));
    setPaymentMethod("Cash");
    setReceiptNumber("");
    setRemarks(loadedTicket.payment.finance_remarks || "");
  };

  const loadTicket = async (rawTicketNumber: string) => {
    const cleanedSearch = rawTicketNumber.trim();

    if (!cleanedSearch) {
      setErrorMessage(
        "Enter a Finance ticket number, request number, student number, or student name.",
      );
      setSuccessMessage("");
      setTicket(null);
      return;
    }

    setSearching(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await authService.authFetch(
        `${FINANCE_TICKETS_API}?q=${encodeURIComponent(cleanedSearch)}`,
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

      if (response.status === 403) {
        setTicket(null);
        throw new Error("Finance access is required.");
      }

      const data = (await response.json()) as TicketSearchResponse;

      if (!response.ok || !data.success) {
        setTicket(null);
        throw new Error(data.message || "Unable to search Finance tickets.");
      }

      const results = Array.isArray(data.tickets) ? data.tickets : [];

      if (results.length === 0) {
        setTicket(null);
        throw new Error("No Finance ticket matched your search.");
      }

      const normalizedSearch = cleanedSearch.toUpperCase();

      const selectedTicket =
        results.find(
          (result) => result.ticket_number?.toUpperCase() === normalizedSearch,
        ) ||
        results.find(
          (result) =>
            result.document_request?.request_number?.toUpperCase() ===
            normalizedSearch,
        ) ||
        results.find(
          (result) =>
            result.student.student_number?.toUpperCase() === normalizedSearch,
        ) ||
        results[0];

      setTicket(selectedTicket);
      setTicketNumber(selectedTicket.ticket_number);
      resetPaymentForm(selectedTicket);

      if (results.length > 1) {
        setSuccessMessage(
          `Found ${results.length} matching tickets. Showing ${selectedTicket.ticket_number}.`,
        );
      }
    } catch (error) {
      console.error("FINANCE TICKET LOOKUP ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the Finance ticket.",
      );
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (searching || paying) {
      return;
    }

    await loadTicket(ticketNumber);
  };

  const handlePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ticket || paying || paymentLocked) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const paid = safePositiveMoney(amountPaid);

    if (paid === null) {
      setErrorMessage("Amount paid must be greater than zero.");
      return;
    }

    const existingAmountDue = ticket.payment.amount_due;
    let newAmountDue: number | null = null;

    if (existingAmountDue === null) {
      newAmountDue = safePositiveMoney(amountDue);

      if (newAmountDue === null) {
        setErrorMessage(
          "This ticket does not have an amount due yet. Enter the official amount due.",
        );
        return;
      }

      if (Math.abs(newAmountDue - paid) >= 0.005) {
        setErrorMessage(
          "Amount paid must exactly match the amount due for this workflow.",
        );
        return;
      }
    } else if (Math.abs(existingAmountDue - paid) >= 0.005) {
      setErrorMessage(
        `Amount paid must exactly match ${formatMoney(existingAmountDue)}.`,
      );
      return;
    }

    const cleanedReceipt = receiptNumber.trim();

    if (!cleanedReceipt) {
      setErrorMessage("Receipt number is required.");
      return;
    }

    setPaying(true);

    try {
      const body: {
        amount_paid: number;
        payment_method: PaymentMethod;
        receipt_number: string;
        remarks?: string;
        amount_due?: number;
      } = {
        amount_paid: paid,
        payment_method: paymentMethod,
        receipt_number: cleanedReceipt,
      };

      if (existingAmountDue === null && newAmountDue !== null) {
        body.amount_due = newAmountDue;
      }

      const cleanedRemarks = remarks.trim();

      if (cleanedRemarks) {
        body.remarks = cleanedRemarks;
      }

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
          body: JSON.stringify(body),
        },
      );

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      const data = (await response.json()) as PaymentResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to complete payment.");
      }

      setSuccessMessage(
        data.message ||
          "Payment completed. The request is now ready for Registrar processing.",
      );

      await loadTicket(ticket.ticket_number);
    } catch (error) {
      console.error("FINANCE PAYMENT ERROR:", error);

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete payment.",
      );
    } finally {
      setPaying(false);
    }
  };

  if (!isFinance) {
    return null;
  }

  return (
    <DashboardLayout>
      <main
        style={{
          display: "grid",
          gap: "22px",
          padding: "4px",
        }}
      >
        <section
          style={{
            padding: "26px",
            border: "1px solid #e2e8f0",
            borderRadius: "18px",
            background: "#ffffff",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  marginBottom: "8px",
                  color: "#15803d",
                  fontSize: "12px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                }}
              >
                <WalletCards size={16} />
                Finance Office
              </div>

              <h1
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "28px",
                }}
              >
                Student Request Payment
              </h1>

              <p
                style={{
                  margin: "8px 0 0",
                  maxWidth: "760px",
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                Search the Finance ticket presented by the student, verify the
                request details and academic period, then record payment.
              </p>
            </div>

            <ReceiptText size={42} color="#15803d" aria-hidden="true" />
          </div>
        </section>

        <section
          style={{
            padding: "24px",
            border: "1px solid #e2e8f0",
            borderRadius: "18px",
            background: "#ffffff",
          }}
        >
          <h2
            style={{
              margin: "0 0 6px",
              color: "#0f172a",
              fontSize: "19px",
            }}
          >
            Find Finance Ticket
          </h2>

          <p
            style={{
              margin: "0 0 18px",
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            Search by Finance ticket number, request number, student number, or
            student name.
          </p>

          <form
            onSubmit={handleSearch}
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              value={ticketNumber}
              onChange={(event) => {
                setTicketNumber(event.target.value.toUpperCase());
              }}
              placeholder="Ticket, request, student number, or student name"
              disabled={searching || paying}
              style={{
                flex: "1 1 320px",
                padding: "12px 13px",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                color: "#0f172a",
                outline: "none",
                fontFamily: "inherit",
              }}
            />

            <button
              type="submit"
              disabled={searching || paying || !ticketNumber.trim()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                minWidth: "145px",
                padding: "11px 16px",
                border: 0,
                borderRadius: "10px",
                background: searching ? "#86a993" : "#15803d",
                color: "#ffffff",
                fontWeight: 800,
                cursor: searching ? "wait" : "pointer",
              }}
            >
              {searching ? <Loader2 size={17} /> : <Search size={17} />}
              {searching ? "Searching..." : "Search Ticket"}
            </button>
          </form>
        </section>

        {errorMessage && (
          <section
            style={{
              padding: "13px 15px",
              border: "1px solid #fecaca",
              borderRadius: "11px",
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: "13px",
              fontWeight: 650,
            }}
          >
            {errorMessage}
          </section>
        )}

        {successMessage && (
          <section
            style={{
              padding: "13px 15px",
              border: "1px solid #bbf7d0",
              borderRadius: "11px",
              background: "#f0fdf4",
              color: "#166534",
              fontSize: "13px",
              fontWeight: 650,
            }}
          >
            {successMessage}
          </section>
        )}

        {ticket && (
          <>
            <section
              style={{
                padding: "24px",
                border: "1px solid #e2e8f0",
                borderRadius: "18px",
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "16px",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      color: "#15803d",
                      fontWeight: 800,
                    }}
                  >
                    <ReceiptText size={18} />
                    {ticket.ticket_number}
                  </div>

                  <h2
                    style={{
                      margin: "7px 0 0",
                      color: "#0f172a",
                      fontSize: "20px",
                    }}
                  >
                    {ticket.transaction.transaction_name}
                  </h2>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <StatusPill
                    value={ticket.payment.payment_status}
                    positive={ticket.payment.payment_status === "Paid"}
                  />

                  <StatusPill
                    value={ticket.registrar.status}
                    positive={
                      ticket.registrar.status === "Ready for Processing" ||
                      ticket.registrar.status === "Processing" ||
                      ticket.registrar.status === "Done"
                    }
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: "12px",
                  marginTop: "18px",
                }}
              >
                <InfoBox
                  icon={<UserRound size={16} />}
                  label="Student"
                  value={ticket.student.student_name}
                />

                <InfoBox
                  label="Student Number"
                  value={ticket.student.student_number}
                />

                <InfoBox
                  label="Transaction"
                  value={ticket.transaction.transaction_code}
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
                  label="Requested"
                  value={formatDate(ticket.document_request?.requested_at)}
                />
              </div>
            </section>

            {ticket.document_request && (
              <section
                style={{
                  padding: "24px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "18px",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    marginBottom: "17px",
                  }}
                >
                  <FileText size={20} color="#15803d" />

                  <div>
                    <h2
                      style={{
                        margin: 0,
                        color: "#0f172a",
                        fontSize: "19px",
                      }}
                    >
                      Student Document Request
                    </h2>

                    <p
                      style={{
                        margin: "4px 0 0",
                        color: "#64748b",
                        fontSize: "13px",
                      }}
                    >
                      Verify these details before accepting payment.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <InfoBox
                    label="Request Number"
                    value={ticket.document_request.request_number}
                  />

                  <InfoBox
                    label="Document Type"
                    value={ticket.document_request.document_type}
                  />

                  <InfoBox
                    label="Academic Period"
                    value={formatAcademicPeriod(ticket.document_request)}
                  />

                  <InfoBox
                    label="Enrollment ID"
                    value={
                      ticket.document_request.enrollment_id === null
                        ? "Not recorded"
                        : String(ticket.document_request.enrollment_id)
                    }
                  />

                  <InfoBox
                    label="Enrollment Status"
                    value={
                      ticket.document_request.academic_period
                        ?.enrollment_status || "Not recorded"
                    }
                  />

                  <InfoBox
                    label="Copies"
                    value={String(ticket.document_request.copies)}
                  />
                </div>

                {ticket.document_request.purpose && (
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
                        letterSpacing: ".04em",
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

                {ticket.document_request.cancelled_at && (
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "13px 14px",
                      border: "1px solid #fecaca",
                      borderRadius: "10px",
                      background: "#fef2f2",
                      color: "#991b1b",
                      fontSize: "13px",
                    }}
                  >
                    This request was cancelled
                    {ticket.document_request.cancellation_reason
                      ? `: ${ticket.document_request.cancellation_reason}`
                      : "."}
                  </div>
                )}
              </section>
            )}

            <section
              style={{
                padding: "24px",
                border: "1px solid #e2e8f0",
                borderRadius: "18px",
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  marginBottom: "17px",
                }}
              >
                <CreditCard size={20} color="#15803d" />

                <div>
                  <h2
                    style={{
                      margin: 0,
                      color: "#0f172a",
                      fontSize: "19px",
                    }}
                  >
                    Record Payment
                  </h2>

                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "#64748b",
                      fontSize: "13px",
                    }}
                  >
                    Finance records payment only. Registrar processing remains
                    separate.
                  </p>
                </div>
              </div>

              {ticket.payment.payment_status === "Paid" ? (
                <div
                  style={{
                    padding: "17px",
                    border: "1px solid #bbf7d0",
                    borderRadius: "12px",
                    background: "#f0fdf4",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#166534",
                      fontWeight: 800,
                    }}
                  >
                    <CheckCircle2 size={20} />
                    Payment Completed
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "10px",
                      marginTop: "14px",
                    }}
                  >
                    <InfoBox
                      label="Amount Paid"
                      value={formatMoney(ticket.payment.amount_paid)}
                    />

                    <InfoBox
                      label="Payment Method"
                      value={ticket.payment.payment_method || "—"}
                    />

                    <InfoBox
                      label="Receipt Number"
                      value={ticket.payment.receipt_number || "—"}
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
                </div>
              ) : (
                <form
                  onSubmit={handlePayment}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "16px",
                  }}
                >
                  <label style={labelStyle}>
                    Amount Due
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amountDue}
                      onChange={(event) => setAmountDue(event.target.value)}
                      disabled={
                        paying ||
                        paymentLocked ||
                        ticket.payment.amount_due !== null
                      }
                      placeholder="Enter official amount due"
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelStyle}>
                    Amount Paid
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amountPaid}
                      onChange={(event) => setAmountPaid(event.target.value)}
                      disabled={paying || paymentLocked}
                      placeholder="Enter amount paid"
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelStyle}>
                    Payment Method
                    <select
                      value={paymentMethod}
                      onChange={(event) =>
                        setPaymentMethod(event.target.value as PaymentMethod)
                      }
                      disabled={paying || paymentLocked}
                      style={inputStyle}
                    >
                      <option value="Cash">Cash</option>
                      <option value="GCash">GCash</option>
                      <option value="Bank">Bank</option>
                      <option value="Online">Online</option>
                    </select>
                  </label>

                  <label style={labelStyle}>
                    Receipt Number
                    <input
                      type="text"
                      value={receiptNumber}
                      onChange={(event) => setReceiptNumber(event.target.value)}
                      disabled={paying || paymentLocked}
                      placeholder="Official receipt number"
                      maxLength={50}
                      style={inputStyle}
                    />
                  </label>

                  <label
                    style={{
                      ...labelStyle,
                      gridColumn: "1 / -1",
                    }}
                  >
                    Finance Remarks
                    <textarea
                      value={remarks}
                      onChange={(event) => setRemarks(event.target.value)}
                      disabled={paying || paymentLocked}
                      placeholder="Optional Finance remarks"
                      maxLength={500}
                      rows={3}
                      style={{
                        ...inputStyle,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </label>

                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      type="submit"
                      disabled={paying || paymentLocked}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        minWidth: "185px",
                        padding: "11px 18px",
                        border: 0,
                        borderRadius: "10px",
                        background:
                          paying || paymentLocked ? "#86a993" : "#15803d",
                        color: "#ffffff",
                        fontWeight: 800,
                        cursor:
                          paying || paymentLocked ? "not-allowed" : "pointer",
                      }}
                    >
                      {paying ? (
                        <Loader2 size={17} />
                      ) : (
                        <WalletCards size={17} />
                      )}
                      {paying ? "Processing..." : "Confirm Payment"}
                    </button>
                  </div>
                </form>
              )}

              {paymentLocked && ticket.payment.payment_status !== "Paid" && (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "12px 14px",
                    border: "1px solid #fde68a",
                    borderRadius: "10px",
                    background: "#fffbeb",
                    color: "#92400e",
                    fontSize: "13px",
                  }}
                >
                  This ticket is not currently payable. Payment must be Pending
                  Payment, Registrar must still be Pending, and the document
                  request must not be cancelled.
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}

const labelStyle = {
  display: "grid",
  gap: "7px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 700,
} as const;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#0f172a",
  outline: "none",
} as const;

function InfoBox({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
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
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "4px",
          color: "#64748b",
          fontSize: "10px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {icon}
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

function StatusPill({ value, positive }: { value: string; positive: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: "29px",
        padding: "5px 10px",
        borderRadius: "999px",
        border: positive ? "1px solid #bbf7d0" : "1px solid #fde68a",
        background: positive ? "#dcfce7" : "#fef3c7",
        color: positive ? "#166534" : "#92400e",
        fontSize: "11px",
        fontWeight: 800,
      }}
    >
      {value}
    </span>
  );
}
