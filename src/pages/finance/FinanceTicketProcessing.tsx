import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import {
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  ListFilter,
  Loader2,
  ReceiptText,
  RefreshCcw,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";

const FINANCE_TICKETS_API = "http://localhost:3000/api/finance/tickets";

type PaymentMethod = "Cash" | "GCash" | "Bank" | "Online";
type PaymentFilter =
  | "All"
  | "Pending Payment"
  | "Paid"
  | "Cancelled"
  | "Refunded";

type TransactionFilter = "All" | "COR" | "COG" | "INCOMPLETE_GRADE";

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

interface TicketListResponse {
  success?: boolean;
  code?: string;
  message?: string;
  query?: string | null;
  count?: number;
  tickets?: FinanceTicket[];
}

interface SingleTicketResponse {
  success?: boolean;
  code?: string;
  message?: string;
  ticket?: FinanceTicket;
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
    return "Legacy request — not recorded";
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

function paymentStatusStyle(status: string) {
  if (status === "Paid") {
    return {
      border: "1px solid #bbf7d0",
      background: "#dcfce7",
      color: "#166534",
    };
  }

  if (status === "Pending Payment") {
    return {
      border: "1px solid #fde68a",
      background: "#fef3c7",
      color: "#92400e",
    };
  }

  if (status === "Cancelled" || status === "Refunded") {
    return {
      border: "1px solid #fecaca",
      background: "#fee2e2",
      color: "#991b1b",
    };
  }

  return {
    border: "1px solid #e2e8f0",
    background: "#f1f5f9",
    color: "#475569",
  };
}

function registrarStatusStyle(status: string) {
  if (status === "Done") {
    return {
      border: "1px solid #bbf7d0",
      background: "#dcfce7",
      color: "#166534",
    };
  }

  if (status === "Ready for Processing") {
    return {
      border: "1px solid #ddd6fe",
      background: "#ede9fe",
      color: "#6d28d9",
    };
  }

  if (status === "Processing") {
    return {
      border: "1px solid #bfdbfe",
      background: "#dbeafe",
      color: "#1d4ed8",
    };
  }

  if (status === "Cancelled" || status === "Rejected") {
    return {
      border: "1px solid #fecaca",
      background: "#fee2e2",
      color: "#991b1b",
    };
  }

  return {
    border: "1px solid #e2e8f0",
    background: "#f1f5f9",
    color: "#475569",
  };
}

export default function FinanceTicketProcessing() {
  const navigate = useNavigate();

  const session = authService.getSession();
  const token = authService.getToken();

  const isFinance = session?.role === "Finance" && Boolean(token);

  const [tickets, setTickets] = useState<FinanceTicket[]>([]);
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<
    string | null
  >(null);

  const [searchText, setSearchText] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [paymentFilter, setPaymentFilter] =
    useState<PaymentFilter>("Pending Payment");
  const [transactionFilter, setTransactionFilter] =
    useState<TransactionFilter>("All");

  const [loadingQueue, setLoadingQueue] = useState(false);
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

  const selectedTicket = useMemo(() => {
    if (!selectedTicketNumber) {
      return null;
    }

    return (
      tickets.find((item) => item.ticket_number === selectedTicketNumber) ??
      null
    );
  }, [tickets, selectedTicketNumber]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((item) => {
      if (
        paymentFilter !== "All" &&
        item.payment.payment_status !== paymentFilter
      ) {
        return false;
      }

      if (
        transactionFilter !== "All" &&
        item.transaction.transaction_code !== transactionFilter
      ) {
        return false;
      }

      return true;
    });
  }, [tickets, paymentFilter, transactionFilter]);

  const summary = useMemo(() => {
    let pending = 0;
    let paid = 0;
    let waitingForRegistrar = 0;

    for (const item of tickets) {
      if (item.payment.payment_status === "Pending Payment") {
        pending += 1;
      }

      if (item.payment.payment_status === "Paid") {
        paid += 1;
      }

      if (
        item.payment.payment_status === "Paid" &&
        item.registrar.status !== "Done" &&
        item.registrar.status !== "Cancelled" &&
        item.registrar.status !== "Rejected"
      ) {
        waitingForRegistrar += 1;
      }
    }

    return {
      total: tickets.length,
      pending,
      paid,
      waitingForRegistrar,
    };
  }, [tickets]);

  const paymentLocked = useMemo(() => {
    if (!selectedTicket) {
      return true;
    }

    return (
      selectedTicket.payment.payment_status !== "Pending Payment" ||
      selectedTicket.registrar.status !== "Pending" ||
      Boolean(selectedTicket.document_request?.cancelled_at)
    );
  }, [selectedTicket]);

  const resetPaymentForm = (loadedTicket: FinanceTicket) => {
    const due = loadedTicket.payment.amount_due;

    setAmountDue(due === null ? "" : String(due));
    setAmountPaid(due === null ? "" : String(due));
    setPaymentMethod("Cash");
    setReceiptNumber("");
    setRemarks(loadedTicket.payment.finance_remarks || "");
  };

  const selectTicket = (loadedTicket: FinanceTicket) => {
    setSelectedTicketNumber(loadedTicket.ticket_number);
    resetPaymentForm(loadedTicket);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const loadQueue = async (query = activeSearch, preserveSelection = true) => {
    if (!isFinance || loadingQueue) {
      return;
    }

    setLoadingQueue(true);
    setErrorMessage("");

    try {
      const cleanedQuery = query.trim();

      const url = cleanedQuery
        ? `${FINANCE_TICKETS_API}?q=${encodeURIComponent(cleanedQuery)}`
        : FINANCE_TICKETS_API;

      const response = await authService.authFetch(url, {
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
        throw new Error("Finance access is required.");
      }

      const data = (await response.json()) as TicketListResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load Finance transactions.");
      }

      const loadedTickets = Array.isArray(data.tickets) ? data.tickets : [];

      setTickets(loadedTickets);
      setActiveSearch(cleanedQuery);

      if (!preserveSelection) {
        setSelectedTicketNumber(null);
      } else if (selectedTicketNumber) {
        const stillExists = loadedTickets.some(
          (item) => item.ticket_number === selectedTicketNumber,
        );

        if (!stillExists) {
          setSelectedTicketNumber(null);
        }
      }

      if (cleanedQuery && loadedTickets.length === 0) {
        setErrorMessage("No Finance transaction matched your search.");
      }
    } catch (error) {
      console.error("LOAD FINANCE QUEUE ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load Finance transactions.",
      );
    } finally {
      setLoadingQueue(false);
    }
  };

  const refreshSelectedTicket = async (ticketNumber: string) => {
    const response = await authService.authFetch(
      `${FINANCE_TICKETS_API}/${encodeURIComponent(ticketNumber)}`,
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

      return null;
    }

    const data = (await response.json()) as SingleTicketResponse;

    if (!response.ok || !data.success || !data.ticket) {
      throw new Error(
        data.message || "Unable to refresh the Finance transaction.",
      );
    }

    const updatedTicket = data.ticket;

    setTickets((current) =>
      current.map((item) =>
        item.ticket_number === updatedTicket.ticket_number
          ? updatedTicket
          : item,
      ),
    );

    setSelectedTicketNumber(updatedTicket.ticket_number);
    resetPaymentForm(updatedTicket);

    return updatedTicket;
  };

  useEffect(() => {
    if (!isFinance) {
      return;
    }

    void loadQueue("", false);
    // Load once after authenticated Finance page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinance]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loadingQueue || paying) {
      return;
    }

    // A search should show every matching result regardless of its
    // current payment or transaction filter.
    setPaymentFilter("All");
    setTransactionFilter("All");

    await loadQueue(searchText, false);
  };

  const handleShowAll = async () => {
    if (loadingQueue || paying) {
      return;
    }

    setSearchText("");
    setActiveSearch("");
    setPaymentFilter("Pending Payment");
    setTransactionFilter("All");
    setSelectedTicketNumber(null);

    await loadQueue("", false);
  };

  const handlePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedTicket || paying || paymentLocked) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const paid = safePositiveMoney(amountPaid);

    if (paid === null) {
      setErrorMessage("Amount paid must be greater than zero.");
      return;
    }

    const existingAmountDue = selectedTicket.payment.amount_due;
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
          selectedTicket.ticket_number,
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

      await refreshSelectedTicket(selectedTicket.ticket_number);

      setSuccessMessage(
        data.message ||
          "Payment completed. The request is now ready for Registrar processing.",
      );
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
      <main style={pageStyle}>
        <section style={heroStyle}>
          <div style={heroInnerStyle}>
            <div>
              <div style={eyebrowStyle}>
                <WalletCards size={16} />
                Finance Office
              </div>

              <h1 style={heroTitleStyle}>Finance Transactions</h1>

              <p style={heroTextStyle}>
                Review pending student transactions, search Finance tickets, and
                record payment before forwarding requests to the Registrar.
              </p>
            </div>

            <ReceiptText size={42} color="#15803d" aria-hidden="true" />
          </div>
        </section>

        <section style={summaryGridStyle}>
          <SummaryCard
            icon={<ReceiptText size={22} />}
            label="Current View"
            value={summary.total}
          />

          <SummaryCard
            icon={<Clock3 size={22} />}
            label="Pending Payment"
            value={summary.pending}
          />

          <SummaryCard
            icon={<CheckCircle2 size={22} />}
            label="Paid"
            value={summary.paid}
          />

          <SummaryCard
            icon={<FileText size={22} />}
            label="Waiting for Registrar"
            value={summary.waitingForRegistrar}
          />
        </section>

        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>Transaction Queue</h2>
              <p style={sectionTextStyle}>
                Pending transactions are shown by default. Search can also find
                paid or historical tickets.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadQueue(activeSearch)}
              disabled={loadingQueue || paying}
              style={secondaryButtonStyle}
            >
              {loadingQueue ? (
                <Loader2 size={16} style={spinnerStyle} />
              ) : (
                <RefreshCcw size={16} />
              )}
              Refresh
            </button>
          </div>

          <form onSubmit={handleSearch} style={searchGridStyle}>
            <div style={searchInputWrapStyle}>
              <Search size={17} color="#94a3b8" style={searchIconStyle} />

              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Ticket, request, student number, or student name"
                disabled={loadingQueue || paying}
                style={searchInputStyle}
              />
            </div>

            <select
              value={paymentFilter}
              onChange={(event) =>
                setPaymentFilter(event.target.value as PaymentFilter)
              }
              disabled={loadingQueue || paying}
              style={inputStyle}
            >
              <option value="All">All Payment Statuses</option>
              <option value="Pending Payment">Pending Payment</option>
              <option value="Paid">Paid</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Refunded">Refunded</option>
            </select>

            <select
              value={transactionFilter}
              onChange={(event) =>
                setTransactionFilter(event.target.value as TransactionFilter)
              }
              disabled={loadingQueue || paying}
              style={inputStyle}
            >
              <option value="All">All Transactions</option>
              <option value="COR">COR</option>
              <option value="COG">COG</option>
              <option value="INCOMPLETE_GRADE">Incomplete / Grade 4</option>
            </select>

            <button
              type="submit"
              disabled={loadingQueue || paying || !searchText.trim()}
              style={{
                ...primaryButtonStyle,
                opacity:
                  loadingQueue || paying || !searchText.trim() ? 0.65 : 1,
              }}
            >
              {loadingQueue ? (
                <Loader2 size={17} style={spinnerStyle} />
              ) : (
                <Search size={17} />
              )}
              Search
            </button>

            <button
              type="button"
              onClick={() => void handleShowAll()}
              disabled={loadingQueue || paying}
              style={secondaryButtonStyle}
            >
              <ListFilter size={16} />
              Show All
            </button>
          </form>

          {activeSearch && (
            <div style={searchResultNoteStyle}>
              Search results for <strong>{activeSearch}</strong>
            </div>
          )}

          {errorMessage && <div style={errorStyle}>{errorMessage}</div>}

          {successMessage && <div style={successStyle}>{successMessage}</div>}

          {loadingQueue ? (
            <div style={loadingStateStyle}>
              <Loader2 size={21} style={spinnerStyle} />
              Loading Finance transactions...
            </div>
          ) : filteredTickets.length === 0 ? (
            <div style={emptyStateStyle}>
              <ReceiptText size={34} color="#94a3b8" />
              <strong>No transactions found</strong>
              <span>
                Change the filters, search another student, or show all
                transactions.
              </span>
            </div>
          ) : (
            <div style={queueListStyle}>
              {filteredTickets.map((item) => {
                const selected = selectedTicketNumber === item.ticket_number;

                return (
                  <button
                    key={item.ticket_id}
                    type="button"
                    onClick={() => selectTicket(item)}
                    style={{
                      ...queueCardStyle,
                      ...(selected ? queueCardSelectedStyle : {}),
                    }}
                  >
                    <div style={queueCardTopStyle}>
                      <div style={{ minWidth: 0 }}>
                        <div style={ticketTitleStyle}>{item.ticket_number}</div>

                        <div style={ticketSubtitleStyle}>
                          {item.transaction.transaction_name}
                        </div>
                      </div>

                      <div style={statusGroupStyle}>
                        <StatusPill
                          value={item.payment.payment_status}
                          style={paymentStatusStyle(
                            item.payment.payment_status,
                          )}
                        />

                        <StatusPill
                          value={item.registrar.status}
                          style={registrarStatusStyle(item.registrar.status)}
                        />
                      </div>
                    </div>

                    <div style={queueInfoGridStyle}>
                      <QueueInfo
                        label="Student"
                        value={item.student.student_name}
                      />

                      <QueueInfo
                        label="Student No."
                        value={item.student.student_number}
                      />

                      <QueueInfo
                        label="Request"
                        value={
                          item.document_request?.request_number ??
                          (item.grade_id ? `Grade ID ${item.grade_id}` : "—")
                        }
                      />

                      <QueueInfo
                        label="Period"
                        value={formatAcademicPeriod(item.document_request)}
                      />

                      <QueueInfo
                        label="Amount Due"
                        value={formatMoney(item.payment.amount_due)}
                      />

                      <QueueInfo
                        label="Created"
                        value={formatDate(item.created_at)}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selectedTicket && (
          <>
            <section style={panelStyle}>
              <div style={sectionHeaderStyle}>
                <div>
                  <div style={eyebrowStyle}>
                    <ReceiptText size={16} />
                    Selected Transaction
                  </div>

                  <h2 style={selectedTicketTitleStyle}>
                    {selectedTicket.ticket_number}
                  </h2>

                  <p style={sectionTextStyle}>
                    {selectedTicket.transaction.transaction_name}
                  </p>
                </div>

                <div style={statusGroupStyle}>
                  <StatusPill
                    value={selectedTicket.payment.payment_status}
                    style={paymentStatusStyle(
                      selectedTicket.payment.payment_status,
                    )}
                  />

                  <StatusPill
                    value={selectedTicket.registrar.status}
                    style={registrarStatusStyle(
                      selectedTicket.registrar.status,
                    )}
                  />
                </div>
              </div>

              <div style={studentCardStyle}>
                <div style={studentIconStyle}>
                  <UserRound size={21} />
                </div>

                <div>
                  <strong style={studentNameStyle}>
                    {selectedTicket.student.student_name}
                  </strong>
                  <span style={studentNumberStyle}>
                    {selectedTicket.student.student_number}
                  </span>
                </div>
              </div>

              <div style={detailsGridStyle}>
                <InfoBox
                  label="Transaction"
                  value={selectedTicket.transaction.transaction_code}
                />

                <InfoBox
                  label="Request Number"
                  value={
                    selectedTicket.document_request?.request_number ??
                    "Not a document request"
                  }
                />

                <InfoBox
                  label="Document Type"
                  value={
                    selectedTicket.document_request?.document_type ??
                    selectedTicket.transaction.transaction_name
                  }
                />

                <InfoBox
                  label="Academic Period"
                  value={formatAcademicPeriod(selectedTicket.document_request)}
                />

                <InfoBox
                  label="Enrollment ID"
                  value={
                    selectedTicket.document_request?.enrollment_id
                      ? String(selectedTicket.document_request.enrollment_id)
                      : "Not recorded"
                  }
                />

                <InfoBox
                  label="Copies"
                  value={
                    selectedTicket.document_request
                      ? String(selectedTicket.document_request.copies)
                      : "—"
                  }
                />

                <InfoBox
                  label="Amount Due"
                  value={formatMoney(selectedTicket.payment.amount_due)}
                />

                <InfoBox
                  label="Amount Paid"
                  value={formatMoney(selectedTicket.payment.amount_paid)}
                />

                <InfoBox
                  label="Receipt"
                  value={selectedTicket.payment.receipt_number || "—"}
                />

                <InfoBox
                  label="Payment Method"
                  value={selectedTicket.payment.payment_method || "—"}
                />

                <InfoBox
                  label="Paid At"
                  value={formatDate(selectedTicket.payment.paid_at)}
                />

                <InfoBox
                  label="Registrar Status"
                  value={selectedTicket.registrar.status}
                />
              </div>

              {selectedTicket.document_request?.purpose && (
                <div style={purposeStyle}>
                  <div style={purposeLabelStyle}>Purpose</div>
                  <div style={purposeTextStyle}>
                    {selectedTicket.document_request.purpose}
                  </div>
                </div>
              )}

              {selectedTicket.document_request?.cancelled_at && (
                <div style={errorStyle}>
                  This document request was cancelled
                  {selectedTicket.document_request.cancellation_reason
                    ? `: ${selectedTicket.document_request.cancellation_reason}`
                    : "."}
                </div>
              )}
            </section>

            <section style={panelStyle}>
              <div style={paymentHeaderStyle}>
                <CreditCard size={20} color="#15803d" />

                <div>
                  <h2 style={paymentTitleStyle}>Record Payment</h2>
                  <p style={sectionTextStyle}>
                    Finance records payment only. Registrar processing remains
                    separate.
                  </p>
                </div>
              </div>

              {selectedTicket.payment.payment_status === "Paid" ? (
                <div style={paidCardStyle}>
                  <div style={paidHeadingStyle}>
                    <CheckCircle2 size={20} />
                    Payment Completed
                  </div>

                  <div style={detailsGridStyle}>
                    <InfoBox
                      label="Amount Paid"
                      value={formatMoney(selectedTicket.payment.amount_paid)}
                    />

                    <InfoBox
                      label="Payment Method"
                      value={selectedTicket.payment.payment_method || "—"}
                    />

                    <InfoBox
                      label="Receipt Number"
                      value={selectedTicket.payment.receipt_number || "—"}
                    />

                    <InfoBox
                      label="Paid At"
                      value={formatDate(selectedTicket.payment.paid_at)}
                    />

                    <InfoBox
                      label="Registrar Status"
                      value={selectedTicket.registrar.status}
                    />
                  </div>
                </div>
              ) : (
                <form onSubmit={handlePayment} style={paymentFormStyle}>
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
                        selectedTicket.payment.amount_due !== null
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

                  <div style={paymentActionStyle}>
                    <button
                      type="submit"
                      disabled={paying || paymentLocked}
                      style={{
                        ...primaryButtonStyle,
                        minWidth: "190px",
                        opacity: paying || paymentLocked ? 0.65 : 1,
                      }}
                    >
                      {paying ? (
                        <Loader2 size={17} style={spinnerStyle} />
                      ) : (
                        <WalletCards size={17} />
                      )}
                      {paying ? "Processing..." : "Confirm Payment"}
                    </button>
                  </div>
                </form>
              )}

              {paymentLocked &&
                selectedTicket.payment.payment_status !== "Paid" && (
                  <div style={warningStyle}>
                    This transaction is not currently payable. Payment must be
                    Pending Payment, Registrar must still be Pending, and the
                    linked request must not be cancelled.
                  </div>
                )}
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <article style={summaryCardStyle}>
      <div style={summaryIconStyle}>{icon}</div>

      <div>
        <span style={summaryLabelStyle}>{label}</span>
        <strong style={summaryValueStyle}>{value}</strong>
      </div>
    </article>
  );
}

function QueueInfo({ label, value }: { label: string; value: string }) {
  return (
    <div style={queueInfoStyle}>
      <span style={queueInfoLabelStyle}>{label}</span>
      <strong style={queueInfoValueStyle}>{value}</strong>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoBoxStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function StatusPill({ value, style }: { value: string; style: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: "29px",
        padding: "5px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 800,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {value}
    </span>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "22px",
  padding: "4px",
};

const heroStyle: CSSProperties = {
  padding: "26px",
  border: "1px solid #e2e8f0",
  borderRadius: "18px",
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

const heroInnerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "20px",
  flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  marginBottom: "8px",
  color: "#15803d",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".08em",
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "28px",
};

const heroTextStyle: CSSProperties = {
  margin: "8px 0 0",
  maxWidth: "780px",
  color: "#64748b",
  lineHeight: 1.6,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "14px",
};

const summaryCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "13px",
  minHeight: "96px",
  padding: "18px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  background: "#ffffff",
};

const summaryIconStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  flex: "0 0 44px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "11px",
  background: "#f0fdf4",
  color: "#15803d",
};

const summaryLabelStyle: CSSProperties = {
  display: "block",
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 650,
};

const summaryValueStyle: CSSProperties = {
  display: "block",
  marginTop: "2px",
  color: "#0f172a",
  fontSize: "23px",
};

const panelStyle: CSSProperties = {
  padding: "24px",
  border: "1px solid #e2e8f0",
  borderRadius: "18px",
  background: "#ffffff",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "19px",
};

const selectedTicketTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "21px",
};

const sectionTextStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.6,
};

const searchGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(260px, 1fr) minmax(170px, 220px) minmax(170px, 220px) auto auto",
  gap: "10px",
  alignItems: "center",
};

const searchInputWrapStyle: CSSProperties = {
  position: "relative",
};

const searchIconStyle: CSSProperties = {
  position: "absolute",
  left: "12px",
  top: "50%",
  transform: "translateY(-50%)",
  pointerEvents: "none",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px 11px 38px",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#0f172a",
  outline: "none",
  fontFamily: "inherit",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#0f172a",
  outline: "none",
  fontFamily: "inherit",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "11px 16px",
  border: 0,
  borderRadius: "10px",
  background: "#15803d",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "10px 14px",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#334155",
  fontWeight: 750,
  cursor: "pointer",
};

const searchResultNoteStyle: CSSProperties = {
  marginTop: "12px",
  color: "#64748b",
  fontSize: "12px",
};

const errorStyle: CSSProperties = {
  marginTop: "14px",
  padding: "13px 15px",
  border: "1px solid #fecaca",
  borderRadius: "11px",
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: "13px",
  fontWeight: 650,
};

const successStyle: CSSProperties = {
  marginTop: "14px",
  padding: "13px 15px",
  border: "1px solid #bbf7d0",
  borderRadius: "11px",
  background: "#f0fdf4",
  color: "#166534",
  fontSize: "13px",
  fontWeight: 650,
};

const loadingStateStyle: CSSProperties = {
  minHeight: "180px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  color: "#64748b",
};

const emptyStateStyle: CSSProperties = {
  minHeight: "180px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  gap: "7px",
  border: "1px dashed #cbd5e1",
  borderRadius: "13px",
  color: "#64748b",
  textAlign: "center",
};

const queueListStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const queueCardStyle: CSSProperties = {
  width: "100%",
  padding: "16px",
  border: "1px solid #e2e8f0",
  borderRadius: "13px",
  background: "#ffffff",
  textAlign: "left",
  fontFamily: "inherit",
  cursor: "pointer",
};

const queueCardSelectedStyle: CSSProperties = {
  border: "2px solid #15803d",
  background: "#f8fff9",
  boxShadow: "0 7px 20px rgba(21, 128, 61, 0.07)",
};

const queueCardTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
};

const ticketTitleStyle: CSSProperties = {
  color: "#15803d",
  fontSize: "14px",
  fontWeight: 850,
  overflowWrap: "anywhere",
};

const ticketSubtitleStyle: CSSProperties = {
  marginTop: "4px",
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 750,
};

const statusGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  flexWrap: "wrap",
};

const queueInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: "10px",
  marginTop: "14px",
};

const queueInfoStyle: CSSProperties = {
  minWidth: 0,
};

const queueInfoLabelStyle: CSSProperties = {
  display: "block",
  color: "#64748b",
  fontSize: "10px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const queueInfoValueStyle: CSSProperties = {
  display: "block",
  marginTop: "3px",
  color: "#334155",
  fontSize: "12px",
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const studentCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "16px",
  padding: "15px",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  background: "#f8fafc",
};

const studentIconStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  flex: "0 0 42px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  background: "#dcfce7",
  color: "#15803d",
};

const studentNameStyle: CSSProperties = {
  display: "block",
  color: "#0f172a",
};

const studentNumberStyle: CSSProperties = {
  display: "block",
  marginTop: "3px",
  color: "#64748b",
  fontSize: "12px",
};

const detailsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};

const infoBoxStyle: CSSProperties = {
  minWidth: 0,
  padding: "11px 13px",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  background: "#f8fafc",
};

const infoLabelStyle: CSSProperties = {
  marginBottom: "4px",
  color: "#64748b",
  fontSize: "10px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const infoValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "13px",
  fontWeight: 750,
  overflowWrap: "anywhere",
};

const purposeStyle: CSSProperties = {
  marginTop: "14px",
  padding: "13px 14px",
  borderRadius: "10px",
  background: "#f8fafc",
};

const purposeLabelStyle: CSSProperties = {
  marginBottom: "4px",
  color: "#64748b",
  fontSize: "10px",
  fontWeight: 800,
  textTransform: "uppercase",
};

const purposeTextStyle: CSSProperties = {
  color: "#334155",
  fontSize: "13px",
};

const paymentHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  marginBottom: "17px",
};

const paymentTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: "19px",
};

const paidCardStyle: CSSProperties = {
  padding: "17px",
  border: "1px solid #bbf7d0",
  borderRadius: "12px",
  background: "#f0fdf4",
};

const paidHeadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "14px",
  color: "#166534",
  fontWeight: 800,
};

const paymentFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "7px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 700,
};

const paymentActionStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  justifyContent: "flex-end",
};

const warningStyle: CSSProperties = {
  marginTop: "14px",
  padding: "12px 14px",
  border: "1px solid #fde68a",
  borderRadius: "10px",
  background: "#fffbeb",
  color: "#92400e",
  fontSize: "13px",
};

const spinnerStyle: CSSProperties = {};
