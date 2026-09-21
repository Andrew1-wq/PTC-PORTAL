import { useCallback, useEffect, useState } from "react";

import type { CSSProperties, ReactNode } from "react";

import { useNavigate } from "react-router-dom";

import {
  Banknote,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCcw,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";

// ============================================================
// API
// ============================================================

const PAYMENT_HISTORY_API =
  "http://localhost:3000/api/finance/tickets/payment-history";

const TRANSACTION_TYPES_API =
  "http://localhost:3000/api/finance/tickets/transaction-types";

const REPORT_SUMMARY_API =
  "http://localhost:3000/api/finance/tickets/reports/summary";

const PAGE_SIZE = 25;

// ============================================================
// TYPES
// ============================================================

type PaymentMethod = "All" | "Cash" | "GCash" | "Bank" | "Online";

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

  source_type?: string;

  student: {
    student_id: number;
    student_number: string;
    student_name: string;
  };

  transaction: {
    transaction_type_id: number;
    transaction_code: string;
    transaction_name: string;
    workflow_type?: string;
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

interface PaymentHistoryResponse {
  success?: boolean;
  code?: string;
  message?: string;

  query?: string | null;

  filters?: {
    payment_method?: string | null;
    transaction_code?: string | null;
  };

  pagination?: {
    page: number;
    limit: number;
    total_records: number;
    total_pages: number;
    has_previous_page: boolean;
    has_next_page: boolean;
  };

  count?: number;

  tickets?: FinanceTicket[];
}

interface FinanceTransactionType {
  transaction_type_id: number;

  transaction_code: string;
  transaction_name: string;

  workflow_type: string;

  is_active: boolean;
}

interface TransactionTypesResponse {
  success?: boolean;
  code?: string;
  message?: string;

  transaction_types?: FinanceTransactionType[];
}

interface FinanceReportResponse {
  success?: boolean;
  code?: string;
  message?: string;

  summary?: {
    total_tickets?: number;
    pending_tickets?: number;
    paid_tickets?: number;
    cancelled_tickets?: number;
    refunded_tickets?: number;

    total_collected?: number;
    collected_today?: number;
    collected_this_month?: number;
  };
}

interface LoadHistoryOptions {
  requestedPage: number;

  query: string;

  paymentMethod: PaymentMethod;

  transactionCode: string;

  showRefresh?: boolean;
}

// ============================================================
// HELPERS
// ============================================================

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value));
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

function paymentMethodLabel(value: string | null) {
  return value || "—";
}

// ============================================================
// COMPONENT
// ============================================================

export default function FinancePaymentHistory() {
  const navigate = useNavigate();

  const session = authService.getSession();

  const token = authService.getToken();

  const isFinance = session?.role === "Finance" && Boolean(token);

  // ==========================================================
  // HISTORY DATA
  // ==========================================================

  const [tickets, setTickets] = useState<FinanceTicket[]>([]);

  const [transactionTypes, setTransactionTypes] = useState<
    FinanceTransactionType[]
  >([]);

  // ==========================================================
  // REPORT SUMMARY
  // ==========================================================

  const [reportSummary, setReportSummary] = useState({
    paid_tickets: 0,

    total_collected: 0,

    collected_today: 0,

    collected_this_month: 0,
  });

  // ==========================================================
  // FILTERS
  // ==========================================================

  const [search, setSearch] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("All");

  const [transactionFilter, setTransactionFilter] = useState("All");

  // ==========================================================
  // PAGINATION
  // ==========================================================

  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(0);

  const [totalRecords, setTotalRecords] = useState(0);

  // ==========================================================
  // UI STATE
  // ==========================================================

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

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
  // LOAD PAYMENT HISTORY
  // ==========================================================

  const loadPaymentHistory = useCallback(
    async ({
      requestedPage,
      query,
      paymentMethod: requestedPaymentMethod,
      transactionCode,
      showRefresh = false,
    }: LoadHistoryOptions) => {
      if (!isFinance) {
        return;
      }

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage("");

      try {
        const params = new URLSearchParams();

        params.set("page", String(requestedPage));

        params.set("limit", String(PAGE_SIZE));

        const cleanedSearch = query.trim();

        if (cleanedSearch) {
          params.set("q", cleanedSearch);
        }

        if (requestedPaymentMethod !== "All") {
          params.set("payment_method", requestedPaymentMethod);
        }

        if (transactionCode !== "All") {
          params.set("transaction_code", transactionCode);
        }

        const response = await authService.authFetch(
          `${PAYMENT_HISTORY_API}?${params.toString()}`,
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
          throw new Error("Finance access is required.");
        }

        const data = (await response.json()) as PaymentHistoryResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || "Unable to load Finance payment history.",
          );
        }

        setTickets(Array.isArray(data.tickets) ? data.tickets : []);

        const loadedPage = Number(data.pagination?.page ?? requestedPage);

        const loadedTotalPages = Number(data.pagination?.total_pages ?? 0);

        const loadedTotalRecords = Number(data.pagination?.total_records ?? 0);

        setPage(loadedPage);

        setTotalPages(loadedTotalPages);

        setTotalRecords(loadedTotalRecords);
      } catch (error) {
        console.error("LOAD FINANCE PAYMENT HISTORY ERROR:", error);

        setTickets([]);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load Finance payment history.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isFinance, navigate],
  );

  // ==========================================================
  // LOAD TRANSACTION TYPES + ACCURATE REPORT TOTALS
  // ==========================================================

  const loadSupportingData = useCallback(async () => {
    if (!isFinance) {
      return;
    }

    try {
      const [typesResponse, reportResponse] = await Promise.all([
        authService.authFetch(TRANSACTION_TYPES_API, {
          method: "GET",

          headers: {
            Accept: "application/json",
          },
        }),

        authService.authFetch(REPORT_SUMMARY_API, {
          method: "GET",

          headers: {
            Accept: "application/json",
          },
        }),
      ]);

      if (typesResponse.status === 401 || reportResponse.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (typesResponse.status === 403 || reportResponse.status === 403) {
        throw new Error("Finance access is required.");
      }

      const typesData =
        (await typesResponse.json()) as TransactionTypesResponse;

      const reportData = (await reportResponse.json()) as FinanceReportResponse;

      // ----------------------------------------------------
      // Transaction types
      // ----------------------------------------------------

      if (typesResponse.ok && typesData.success) {
        const activeTypes = Array.isArray(typesData.transaction_types)
          ? typesData.transaction_types
              .filter((item) => item.is_active)
              .sort((first, second) =>
                first.transaction_name.localeCompare(second.transaction_name),
              )
          : [];

        setTransactionTypes(activeTypes);
      }

      // ----------------------------------------------------
      // Accurate Finance totals
      // ----------------------------------------------------

      if (reportResponse.ok && reportData.success) {
        setReportSummary({
          paid_tickets: Number(reportData.summary?.paid_tickets ?? 0),

          total_collected: Number(reportData.summary?.total_collected ?? 0),

          collected_today: Number(reportData.summary?.collected_today ?? 0),

          collected_this_month: Number(
            reportData.summary?.collected_this_month ?? 0,
          ),
        });
      }
    } catch (error) {
      console.error("LOAD PAYMENT HISTORY SUPPORT DATA ERROR:", error);
    }
  }, [isFinance, navigate]);

  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    if (!isFinance) {
      return;
    }

    void loadPaymentHistory({
      requestedPage: 1,

      query: "",

      paymentMethod: "All",

      transactionCode: "All",
    });

    void loadSupportingData();
  }, [isFinance, loadPaymentHistory, loadSupportingData]);

  // ==========================================================
  // APPLY FILTERS
  // ==========================================================

  const applyFilters = () => {
    setPage(1);

    void loadPaymentHistory({
      requestedPage: 1,

      query: search,

      paymentMethod,

      transactionCode: transactionFilter,
    });
  };

  // ==========================================================
  // REFRESH
  // ==========================================================

  const refreshHistory = () => {
    void loadPaymentHistory({
      requestedPage: page,

      query: search,

      paymentMethod,

      transactionCode: transactionFilter,

      showRefresh: true,
    });

    void loadSupportingData();
  };

  // ==========================================================
  // PREVIOUS PAGE
  // ==========================================================

  const goToPreviousPage = () => {
    if (loading || refreshing || page <= 1) {
      return;
    }

    const nextPage = page - 1;

    void loadPaymentHistory({
      requestedPage: nextPage,

      query: search,

      paymentMethod,

      transactionCode: transactionFilter,
    });
  };

  // ==========================================================
  // NEXT PAGE
  // ==========================================================

  const goToNextPage = () => {
    if (loading || refreshing || page >= totalPages) {
      return;
    }

    const nextPage = page + 1;

    void loadPaymentHistory({
      requestedPage: nextPage,

      query: search,

      paymentMethod,

      transactionCode: transactionFilter,
    });
  };

  // ==========================================================
  // AUTHORIZED ONLY
  // ==========================================================

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
        {/* =================================================
            HEADER
        ================================================= */}

        <section style={panelStyle}>
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
                Finance
              </div>

              <h1
                style={{
                  margin: 0,

                  color: "#0f172a",

                  fontSize: "28px",
                }}
              >
                Payment History
              </h1>

              <p
                style={{
                  margin: "8px 0 0",

                  maxWidth: "760px",

                  color: "#64748b",

                  lineHeight: 1.6,
                }}
              >
                Review completed student payments, receipts, payment methods,
                and Finance transaction records.
              </p>
            </div>

            <div
              style={{
                width: "58px",

                height: "58px",

                borderRadius: "16px",

                background: "#f0fdf4",

                color: "#15803d",

                display: "grid",

                placeItems: "center",
              }}
            >
              <ReceiptText size={31} />
            </div>
          </div>
        </section>

        {/* =================================================
            SUMMARY
        ================================================= */}

        <section
          style={{
            display: "grid",

            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",

            gap: "14px",
          }}
        >
          <SummaryCard
            label="Paid Transactions"
            value={String(reportSummary.paid_tickets)}
            icon={<CheckCircle2 size={21} />}
          />

          <SummaryCard
            label="Total Collected"
            value={formatMoney(reportSummary.total_collected)}
            icon={<Banknote size={21} />}
          />

          <SummaryCard
            label="Collected Today"
            value={formatMoney(reportSummary.collected_today)}
            icon={<WalletCards size={21} />}
          />

          <SummaryCard
            label="This Month"
            value={formatMoney(reportSummary.collected_this_month)}
            icon={<CreditCard size={21} />}
          />
        </section>

        {/* =================================================
            ERROR
        ================================================= */}

        {errorMessage && (
          <section
            style={{
              padding: "14px 16px",

              border: "1px solid #fecaca",

              borderRadius: "11px",

              background: "#fef2f2",

              color: "#991b1b",

              fontSize: "13px",
            }}
          >
            {errorMessage}
          </section>
        )}

        {/* =================================================
            FILTERS
        ================================================= */}

        <section style={panelStyle}>
          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "minmax(240px, 1fr) minmax(170px, 220px) minmax(190px, 250px) auto",

              gap: "12px",

              alignItems: "end",
            }}
          >
            {/* SEARCH */}

            <label style={fieldLabelStyle}>
              Search
              <div
                style={{
                  position: "relative",
                }}
              >
                <Search
                  size={17}
                  color="#94a3b8"
                  style={{
                    position: "absolute",

                    left: "13px",

                    top: "13px",
                  }}
                />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyFilters();
                    }
                  }}
                  placeholder="Ticket, student, request, receipt..."
                  style={{
                    ...inputStyle,

                    paddingLeft: "40px",
                  }}
                />
              </div>
            </label>

            {/* PAYMENT METHOD */}

            <label style={fieldLabelStyle}>
              Payment Method
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
                style={inputStyle}
              >
                <option value="All">All Methods</option>

                <option value="Cash">Cash</option>

                <option value="GCash">GCash</option>

                <option value="Bank">Bank</option>

                <option value="Online">Online</option>
              </select>
            </label>

            {/* TRANSACTION TYPE */}

            <label style={fieldLabelStyle}>
              Transaction
              <select
                value={transactionFilter}
                onChange={(event) => setTransactionFilter(event.target.value)}
                style={inputStyle}
              >
                <option value="All">All Transactions</option>

                {transactionTypes.map((item) => (
                  <option
                    key={item.transaction_type_id}
                    value={item.transaction_code}
                  >
                    {item.transaction_name}
                  </option>
                ))}
              </select>
            </label>

            {/* ACTION BUTTONS */}

            <div
              style={{
                display: "flex",

                gap: "8px",

                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={applyFilters}
                disabled={loading || refreshing}
                style={{
                  minHeight: "44px",

                  display: "inline-flex",

                  alignItems: "center",

                  justifyContent: "center",

                  gap: "7px",

                  padding: "10px 15px",

                  border: "none",

                  borderRadius: "10px",

                  background: "#15803d",

                  color: "#ffffff",

                  fontWeight: 800,

                  cursor: loading || refreshing ? "wait" : "pointer",

                  opacity: loading || refreshing ? 0.7 : 1,
                }}
              >
                <Search size={16} />
                Apply
              </button>

              <button
                type="button"
                onClick={refreshHistory}
                disabled={refreshing}
                style={{
                  minHeight: "44px",

                  display: "inline-flex",

                  alignItems: "center",

                  justifyContent: "center",

                  gap: "7px",

                  padding: "10px 14px",

                  border: "1px solid #cbd5e1",

                  borderRadius: "10px",

                  background: "#ffffff",

                  color: "#334155",

                  fontWeight: 750,

                  cursor: refreshing ? "wait" : "pointer",
                }}
              >
                {refreshing ? <Loader2 size={16} /> : <RefreshCcw size={16} />}
                Refresh
              </button>
            </div>
          </div>
        </section>

        {/* =================================================
            PAYMENT LIST
        ================================================= */}

        <section style={panelStyle}>
          <div
            style={{
              display: "flex",

              justifyContent: "space-between",

              alignItems: "center",

              gap: "12px",

              flexWrap: "wrap",

              marginBottom: "18px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,

                  color: "#0f172a",

                  fontSize: "18px",
                }}
              >
                Completed Payments
              </h2>

              <p
                style={{
                  margin: "5px 0 0",

                  color: "#64748b",

                  fontSize: "12px",
                }}
              >
                Showing {tickets.length} of {totalRecords} payment record
                {totalRecords === 1 ? "" : "s"}.
              </p>
            </div>

            {totalRecords > 0 && (
              <div
                style={{
                  padding: "7px 10px",

                  borderRadius: "999px",

                  background: "#f0fdf4",

                  color: "#166534",

                  fontSize: "11px",

                  fontWeight: 800,
                }}
              >
                {totalRecords} Paid
              </div>
            )}
          </div>

          {/* LOADING */}

          {loading ? (
            <div
              style={{
                minHeight: "180px",

                display: "grid",

                placeItems: "center",

                color: "#64748b",
              }}
            >
              <div
                style={{
                  display: "grid",

                  justifyItems: "center",

                  gap: "9px",
                }}
              >
                <Loader2 size={25} />
                Loading payment history...
              </div>
            </div>
          ) : tickets.length === 0 ? (
            <div
              style={{
                padding: "38px 20px",

                textAlign: "center",

                border: "1px dashed #cbd5e1",

                borderRadius: "13px",

                color: "#64748b",
              }}
            >
              <ReceiptText
                size={30}
                style={{
                  marginBottom: "8px",
                }}
              />

              <div
                style={{
                  fontWeight: 800,

                  color: "#334155",
                }}
              >
                No payment records found
              </div>

              <div
                style={{
                  marginTop: "5px",

                  fontSize: "12px",
                }}
              >
                Try changing the search or filters.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",

                gap: "13px",
              }}
            >
              {tickets.map((ticket) => (
                <PaymentCard key={ticket.ticket_id} ticket={ticket} />
              ))}
            </div>
          )}

          {/* =================================================
              PAGINATION
          ================================================= */}

          {!loading && totalPages > 0 && (
            <div
              style={{
                display: "flex",

                alignItems: "center",

                justifyContent: "space-between",

                gap: "12px",

                marginTop: "18px",

                paddingTop: "16px",

                borderTop: "1px solid #e2e8f0",

                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  color: "#64748b",

                  fontSize: "12px",
                }}
              >
                Page {page} of {totalPages}
                {" · "}
                {totalRecords} total payment
                {totalRecords === 1 ? "" : "s"}
              </div>

              <div
                style={{
                  display: "flex",

                  gap: "8px",
                }}
              >
                <button
                  type="button"
                  disabled={page <= 1 || loading || refreshing}
                  onClick={goToPreviousPage}
                  style={{
                    ...paginationButtonStyle,

                    opacity: page <= 1 || loading || refreshing ? 0.5 : 1,

                    cursor:
                      page <= 1 || loading || refreshing
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={page >= totalPages || loading || refreshing}
                  onClick={goToNextPage}
                  style={{
                    ...paginationButtonStyle,

                    opacity:
                      page >= totalPages || loading || refreshing ? 0.5 : 1,

                    cursor:
                      page >= totalPages || loading || refreshing
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </DashboardLayout>
  );
}

// ============================================================
// PAYMENT CARD
// ============================================================

function PaymentCard({ ticket }: { ticket: FinanceTicket }) {
  return (
    <article
      style={{
        padding: "19px",

        border: "1px solid #e2e8f0",

        borderRadius: "14px",

        background: "#ffffff",
      }}
    >
      {/* TOP */}

      <div
        style={{
          display: "flex",

          justifyContent: "space-between",

          gap: "18px",

          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",

            gap: "12px",

            flex: "1 1 360px",
          }}
        >
          <div
            style={{
              width: "44px",

              height: "44px",

              borderRadius: "12px",

              background: "#f0fdf4",

              color: "#15803d",

              display: "grid",

              placeItems: "center",

              flexShrink: 0,
            }}
          >
            <ReceiptText size={21} />
          </div>

          <div>
            <div
              style={{
                display: "flex",

                gap: "7px",

                alignItems: "center",

                flexWrap: "wrap",
              }}
            >
              <strong
                style={{
                  color: "#0f172a",

                  fontSize: "15px",
                }}
              >
                {ticket.transaction.transaction_name}
              </strong>

              <span style={paidBadgeStyle}>PAID</span>

              {ticket.source_type && (
                <span style={sourceBadgeStyle}>
                  {ticket.source_type.replaceAll("_", " ")}
                </span>
              )}
            </div>

            <div
              style={{
                marginTop: "5px",

                color: "#64748b",

                fontSize: "12px",
              }}
            >
              {ticket.ticket_number}
            </div>

            <div
              style={{
                marginTop: "10px",

                display: "flex",

                alignItems: "center",

                gap: "7px",

                color: "#334155",

                fontSize: "13px",

                flexWrap: "wrap",
              }}
            >
              <UserRound size={15} color="#64748b" />

              <strong>{ticket.student.student_number}</strong>

              <span>—</span>

              <span>{ticket.student.student_name}</span>
            </div>
          </div>
        </div>

        {/* AMOUNT */}

        <div
          style={{
            textAlign: "right",

            minWidth: "160px",
          }}
        >
          <div
            style={{
              color: "#64748b",

              fontSize: "10px",

              fontWeight: 800,

              textTransform: "uppercase",
            }}
          >
            Amount Paid
          </div>

          <div
            style={{
              marginTop: "3px",

              color: "#15803d",

              fontSize: "20px",

              fontWeight: 850,
            }}
          >
            {formatMoney(ticket.payment.amount_paid)}
          </div>

          <div
            style={{
              marginTop: "4px",

              color: "#64748b",

              fontSize: "11px",
            }}
          >
            {formatDate(ticket.payment.paid_at)}
          </div>
        </div>
      </div>

      {/* DETAILS */}

      <div
        style={{
          display: "grid",

          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",

          gap: "10px",

          marginTop: "17px",
        }}
      >
        <DetailBox
          label="Receipt Number"
          value={ticket.payment.receipt_number || "—"}
          icon={<ReceiptText size={13} />}
        />

        <DetailBox
          label="Payment Method"
          value={paymentMethodLabel(ticket.payment.payment_method)}
          icon={<CreditCard size={13} />}
        />

        <DetailBox
          label="Amount Due"
          value={formatMoney(ticket.payment.amount_due)}
          icon={<Banknote size={13} />}
        />

        <DetailBox
          label="Transaction Code"
          value={ticket.transaction.transaction_code}
          icon={<FileText size={13} />}
        />
      </div>

      {/* DOCUMENT REQUEST */}

      {ticket.document_request && (
        <div
          style={{
            marginTop: "12px",

            padding: "11px 13px",

            borderRadius: "10px",

            background: "#f8fafc",

            border: "1px solid #e2e8f0",

            color: "#475569",

            fontSize: "12px",

            lineHeight: 1.6,
          }}
        >
          <strong>Document Request:</strong>{" "}
          {ticket.document_request.request_number}
          {" · "}
          {ticket.document_request.document_type}
          {ticket.document_request.academic_period && (
            <>
              {" · "}

              {ticket.document_request.academic_period.academic_year}

              {" — "}

              {ticket.document_request.academic_period.semester_name}
            </>
          )}
        </div>
      )}

      {/* FINANCE-ONLY NOTICE */}

      {ticket.transaction.workflow_type === "FINANCE_ONLY" && (
        <div
          style={{
            marginTop: "11px",

            padding: "10px 12px",

            border: "1px solid #dbeafe",

            borderRadius: "10px",

            background: "#eff6ff",

            color: "#1e40af",

            fontSize: "11px",

            lineHeight: 1.5,
          }}
        >
          Finance-only transaction. Registrar processing is not required.
        </div>
      )}

      {/* REMARKS */}

      {ticket.payment.finance_remarks && (
        <div
          style={{
            marginTop: "11px",

            color: "#64748b",

            fontSize: "12px",

            lineHeight: 1.55,
          }}
        >
          <strong
            style={{
              color: "#475569",
            }}
          >
            Finance Remarks:
          </strong>{" "}
          {ticket.payment.finance_remarks}
        </div>
      )}
    </article>
  );
}

// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <article
      style={{
        padding: "19px",

        border: "1px solid #e2e8f0",

        borderRadius: "15px",

        background: "#ffffff",

        display: "flex",

        justifyContent: "space-between",

        gap: "12px",
      }}
    >
      <div>
        <div
          style={{
            color: "#64748b",

            fontSize: "12px",

            fontWeight: 700,
          }}
        >
          {label}
        </div>

        <div
          style={{
            marginTop: "5px",

            color: "#0f172a",

            fontSize: "23px",

            fontWeight: 850,
          }}
        >
          {value}
        </div>
      </div>

      <div
        style={{
          width: "40px",

          height: "40px",

          borderRadius: "11px",

          background: "#f0fdf4",

          color: "#15803d",

          display: "grid",

          placeItems: "center",
        }}
      >
        {icon}
      </div>
    </article>
  );
}

// ============================================================
// DETAIL BOX
// ============================================================

function DetailBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "11px 12px",

        borderRadius: "10px",

        background: "#f8fafc",

        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          display: "flex",

          alignItems: "center",

          gap: "5px",

          color: "#64748b",

          fontSize: "9px",

          fontWeight: 800,

          textTransform: "uppercase",

          marginBottom: "4px",
        }}
      >
        {icon}

        {label}
      </div>

      <div
        style={{
          color: "#0f172a",

          fontSize: "12px",

          fontWeight: 750,

          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================

const panelStyle: CSSProperties = {
  padding: "24px",

  border: "1px solid #e2e8f0",

  borderRadius: "18px",

  background: "#ffffff",

  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",

  gap: "7px",

  color: "#334155",

  fontSize: "12px",

  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",

  minHeight: "44px",

  boxSizing: "border-box",

  padding: "10px 12px",

  border: "1px solid #cbd5e1",

  borderRadius: "10px",

  background: "#ffffff",

  color: "#0f172a",

  outline: "none",

  fontFamily: "inherit",
};

const paginationButtonStyle: CSSProperties = {
  minHeight: "38px",

  padding: "8px 13px",

  border: "1px solid #cbd5e1",

  borderRadius: "9px",

  background: "#ffffff",

  color: "#334155",

  fontWeight: 750,
};

const paidBadgeStyle: CSSProperties = {
  padding: "4px 8px",

  borderRadius: "999px",

  background: "#dcfce7",

  color: "#166534",

  fontSize: "9px",

  fontWeight: 850,
};

const sourceBadgeStyle: CSSProperties = {
  padding: "4px 8px",

  borderRadius: "999px",

  background: "#f1f5f9",

  color: "#475569",

  fontSize: "9px",

  fontWeight: 800,

  textTransform: "uppercase",
};
