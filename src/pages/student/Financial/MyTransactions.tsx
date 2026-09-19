import { useCallback, useEffect, useMemo, useState } from "react";

import type { CSSProperties } from "react";

import { useNavigate } from "react-router-dom";

import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  GraduationCap,
  ReceiptText,
  RefreshCcw,
  Search,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";

const STUDENT_TRANSACTIONS_API =
  "http://localhost:3000/api/student/transactions";

type PaymentStatus =
  | "Pending Payment"
  | "Paid"
  | "Cancelled"
  | "Refunded"
  | string;

interface StudentSummary {
  student_id: number;
  student_number: string;
  student_name: string;
}

interface TransactionSummary {
  total: number;
  pending_payment: number;
  paid: number;
  cancelled: number;
  refunded: number;
  total_outstanding: number;
  total_paid: number;
}

interface TransactionTypeInfo {
  transaction_type_id: number;
  transaction_code: string;
  transaction_name: string;
  description: string | null;
  workflow_type:
    | "FINANCE_ONLY"
    | "DOCUMENT_REQUEST"
    | "INCOMPLETE_GRADE"
    | string;
}

interface AcademicPeriod {
  academic_year: string | null;
  semester_name: string | null;
  enrollment_status: string | null;
}

interface DocumentRequestInfo {
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
}

interface PaymentInfo {
  amount_due: number | null;
  amount_paid: number;
  payment_method: string | null;
  receipt_number: string | null;
  payment_status: PaymentStatus;
  paid_at: string | null;
}

interface RegistrarInfo {
  status: string;
  remarks: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface StudentTransaction {
  ticket_id: number;
  ticket_number: string;

  source_type:
    | "STUDENT_REQUEST"
    | "FINANCE_MANUAL"
    | "FACULTY_VERIFIED"
    | "SYSTEM"
    | string;

  transaction: TransactionTypeInfo;

  document_request: DocumentRequestInfo | null;

  grade_id: number | null;

  payment: PaymentInfo;

  registrar: RegistrarInfo;

  finance_remarks: string | null;

  created_at: string;
  updated_at: string;
}

interface TransactionsResponse {
  success?: boolean;
  code?: string;
  message?: string;

  student?: StudentSummary;

  summary?: TransactionSummary;

  transactions?: StudentTransaction[];
}

type StatusFilter =
  | "All"
  | "Pending Payment"
  | "Paid"
  | "Cancelled"
  | "Refunded";

// ============================================================
// FORMAT MONEY
// ============================================================

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(numericValue);
}

// ============================================================
// FORMAT DATE
// ============================================================

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

// ============================================================
// PAYMENT STATUS STYLE
// ============================================================

function getPaymentStatusStyle(status: string): CSSProperties {
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

  if (status === "Cancelled") {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      border: "1px solid #fecaca",
    };
  }

  if (status === "Refunded") {
    return {
      color: "#1e40af",
      background: "#dbeafe",
      border: "1px solid #bfdbfe",
    };
  }

  return {
    color: "#475569",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
  };
}

// ============================================================
// REGISTRAR STATUS STYLE
// ============================================================

function getRegistrarStatusStyle(status: string): CSSProperties {
  if (status === "Done") {
    return {
      color: "#166534",
      background: "#dcfce7",
      border: "1px solid #bbf7d0",
    };
  }

  if (status === "Ready for Processing" || status === "Processing") {
    return {
      color: "#1d4ed8",
      background: "#dbeafe",
      border: "1px solid #bfdbfe",
    };
  }

  if (status === "Pending") {
    return {
      color: "#92400e",
      background: "#fef3c7",
      border: "1px solid #fde68a",
    };
  }

  if (status === "Cancelled" || status === "Rejected") {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      border: "1px solid #fecaca",
    };
  }

  return {
    color: "#475569",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
  };
}

// ============================================================
// TRANSACTION SOURCE LABEL
// ============================================================

function getSourceLabel(source: string) {
  if (source === "FINANCE_MANUAL") {
    return "Assigned by Finance";
  }

  if (source === "STUDENT_REQUEST") {
    return "Student Request";
  }

  if (source === "FACULTY_VERIFIED") {
    return "Faculty Verified";
  }

  if (source === "SYSTEM") {
    return "System";
  }

  return source
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ============================================================
// WORKFLOW LABEL
// ============================================================

function getWorkflowLabel(workflowType: string) {
  if (workflowType === "FINANCE_ONLY") {
    return "Finance Transaction";
  }

  if (workflowType === "DOCUMENT_REQUEST") {
    return "Document Request";
  }

  if (workflowType === "INCOMPLETE_GRADE") {
    return "Incomplete Grade";
  }

  return workflowType;
}

// ============================================================
// SUMMARY CARD
// ============================================================

interface SummaryCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}

function SummaryCard({ title, value, subtitle, icon }: SummaryCardProps) {
  return (
    <article
      style={{
        padding: "20px",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        background: "#ffffff",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          minWidth: 0,
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          {title}
        </p>

        <div
          style={{
            marginTop: "7px",
            color: "#0f172a",
            fontSize: "25px",
            fontWeight: 800,
            lineHeight: 1.2,
            wordBreak: "break-word",
          }}
        >
          {value}
        </div>

        <p
          style={{
            margin: "7px 0 0",
            color: "#94a3b8",
            fontSize: "12px",
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      </div>

      <div
        style={{
          width: "42px",
          height: "42px",
          borderRadius: "12px",
          background: "#f0fdf4",
          color: "#15803d",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
    </article>
  );
}

// ============================================================
// DETAIL ITEM
// ============================================================

interface DetailItemProps {
  label: string;
  value: React.ReactNode;
}

function DetailItem({ label, value }: DetailItemProps) {
  return (
    <div>
      <div
        style={{
          marginBottom: "5px",
          color: "#94a3b8",
          fontSize: "11px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: ".06em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#334155",
          fontSize: "13px",
          fontWeight: 650,
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// COMPONENT
// ============================================================

export default function MyTransactions() {
  const navigate = useNavigate();

  const session = authService.getSession();
  const token = authService.getToken();

  const role = session?.role ?? null;

  const isStudent = role === "Student" && Boolean(token);

  const [student, setStudent] = useState<StudentSummary | null>(null);

  const [summary, setSummary] = useState<TransactionSummary>({
    total: 0,
    pending_payment: 0,
    paid: 0,
    cancelled: 0,
    refunded: 0,
    total_outstanding: 0,
    total_paid: 0,
  });

  const [transactions, setTransactions] = useState<StudentTransaction[]>([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [searchText, setSearchText] = useState("");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  const [expandedTicketNumber, setExpandedTicketNumber] = useState<
    string | null
  >(null);

  // ==========================================================
  // AUTH GUARD
  // ==========================================================

  useEffect(() => {
    if (!isStudent) {
      navigate("/login", {
        replace: true,
      });
    }
  }, [isStudent, navigate]);

  // ==========================================================
  // LOAD TRANSACTIONS
  // ==========================================================

  const loadTransactions = useCallback(
    async (showMainLoading = true) => {
      if (!isStudent) {
        return;
      }

      if (showMainLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setErrorMessage("");

      try {
        const response = await authService.authFetch(STUDENT_TRANSACTIONS_API, {
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

        const data = (await response.json()) as TransactionsResponse;

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to load your transactions.");
        }

        setStudent(data.student ?? null);

        setSummary({
          total: Number(data.summary?.total ?? 0),

          pending_payment: Number(data.summary?.pending_payment ?? 0),

          paid: Number(data.summary?.paid ?? 0),

          cancelled: Number(data.summary?.cancelled ?? 0),

          refunded: Number(data.summary?.refunded ?? 0),

          total_outstanding: Number(data.summary?.total_outstanding ?? 0),

          total_paid: Number(data.summary?.total_paid ?? 0),
        });

        setTransactions(
          Array.isArray(data.transactions) ? data.transactions : [],
        );
      } catch (error) {
        console.error("LOAD STUDENT TRANSACTIONS ERROR:", error);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load your transactions.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isStudent, navigate],
  );

  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    if (!isStudent) {
      return;
    }

    void loadTransactions();
  }, [isStudent, loadTransactions]);

  // ==========================================================
  // FILTER TRANSACTIONS
  // ==========================================================

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return transactions.filter((item) => {
      if (
        statusFilter !== "All" &&
        item.payment.payment_status !== statusFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const academicPeriod = item.document_request?.academic_period;

      const searchableText = [
        item.ticket_number,

        item.transaction.transaction_code,

        item.transaction.transaction_name,

        item.transaction.description ?? "",

        item.payment.receipt_number ?? "",

        item.payment.payment_method ?? "",

        item.payment.payment_status,

        item.document_request?.request_number ?? "",

        item.document_request?.document_type ?? "",

        academicPeriod?.academic_year ?? "",

        academicPeriod?.semester_name ?? "",

        getSourceLabel(item.source_type),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [transactions, searchText, statusFilter]);

  // ==========================================================
  // TOGGLE DETAILS
  // ==========================================================

  const toggleDetails = (ticketNumber: string) => {
    setExpandedTicketNumber((current) =>
      current === ticketNumber ? null : ticketNumber,
    );
  };

  // ==========================================================
  // AUTHORIZED RENDER ONLY
  // ==========================================================

  if (!isStudent) {
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
                Student Finance
              </div>

              <h1
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "28px",
                }}
              >
                My Transactions
              </h1>

              <p
                style={{
                  margin: "8px 0 0",
                  maxWidth: "760px",
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                View your school transactions, payment status, receipts,
                document request payments, and other charges assigned to your
                account.
              </p>

              {student && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "15px",
                  }}
                >
                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: "999px",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      color: "#166534",
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    {student.student_number}
                  </span>

                  <span
                    style={{
                      color: "#475569",
                      fontSize: "13px",
                      fontWeight: 650,
                    }}
                  >
                    {student.student_name}
                  </span>
                </div>
              )}
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
                flexShrink: 0,
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
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "14px",
          }}
        >
          <SummaryCard
            title="Total Transactions"
            value={summary.total}
            subtitle="All transactions linked to your student account"
            icon={<ReceiptText size={21} />}
          />

          <SummaryCard
            title="Pending Payment"
            value={summary.pending_payment}
            subtitle="Transactions currently waiting for payment"
            icon={<Clock3 size={21} />}
          />

          <SummaryCard
            title="Paid"
            value={summary.paid}
            subtitle={`Total paid: ${formatMoney(summary.total_paid)}`}
            icon={<CheckCircle2 size={21} />}
          />

          <SummaryCard
            title="Outstanding"
            value={formatMoney(summary.total_outstanding)}
            subtitle="Known unpaid amounts currently assigned"
            icon={<CircleDollarSign size={21} />}
          />
        </section>

        {/* =================================================
            ERROR
        ================================================= */}

        {errorMessage && (
          <section
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "15px",
              border: "1px solid #fecaca",
              borderRadius: "12px",
              background: "#fef2f2",
              color: "#991b1b",
            }}
          >
            <AlertCircle
              size={19}
              style={{
                flexShrink: 0,
                marginTop: "1px",
              }}
            />

            <div
              style={{
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              {errorMessage}
            </div>
          </section>
        )}

        {/* =================================================
            FILTERS
        ================================================= */}

        <section
          style={{
            padding: "20px",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            background: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "14px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "17px",
                }}
              >
                Transaction History
              </h2>

              <p
                style={{
                  margin: "5px 0 0",
                  color: "#64748b",
                  fontSize: "13px",
                }}
              >
                {filteredTransactions.length} transaction
                {filteredTransactions.length === 1 ? "" : "s"} shown
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadTransactions(false)}
              disabled={refreshing}
              style={{
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
                cursor: refreshing ? "not-allowed" : "pointer",
                opacity: refreshing ? 0.65 : 1,
              }}
            >
              <RefreshCcw
                size={16}
                style={{
                  animation: refreshing ? "spin 1s linear infinite" : undefined,
                }}
              />

              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(240px, 1fr) minmax(190px, 240px)",
              gap: "12px",
            }}
          >
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
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                }}
              />

              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search ticket, transaction, receipt..."
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "10px 12px 10px 40px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  outline: "none",
                  color: "#0f172a",
                  background: "#ffffff",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              style={{
                minHeight: "44px",
                padding: "10px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                outline: "none",
                background: "#ffffff",
                color: "#334155",
                fontWeight: 650,
                fontFamily: "inherit",
              }}
            >
              <option value="All">All Statuses</option>

              <option value="Pending Payment">Pending Payment</option>

              <option value="Paid">Paid</option>

              <option value="Cancelled">Cancelled</option>

              <option value="Refunded">Refunded</option>
            </select>
          </div>
        </section>

        {/* =================================================
            LOADING
        ================================================= */}

        {loading && (
          <section
            style={{
              minHeight: "220px",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              background: "#ffffff",
              display: "grid",
              placeItems: "center",
              color: "#64748b",
            }}
          >
            <div
              style={{
                display: "grid",
                justifyItems: "center",
                gap: "10px",
              }}
            >
              <RefreshCcw size={27} />

              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                Loading your transactions...
              </span>
            </div>
          </section>
        )}

        {/* =================================================
            EMPTY
        ================================================= */}

        {!loading && filteredTransactions.length === 0 && (
          <section
            style={{
              padding: "50px 24px",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              background: "#ffffff",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "54px",
                height: "54px",
                margin: "0 auto 14px",
                borderRadius: "15px",
                background: "#f1f5f9",
                color: "#64748b",
                display: "grid",
                placeItems: "center",
              }}
            >
              <ReceiptText size={27} />
            </div>

            <h3
              style={{
                margin: 0,
                color: "#0f172a",
              }}
            >
              No transactions found
            </h3>

            <p
              style={{
                margin: "8px auto 0",
                maxWidth: "500px",
                color: "#64748b",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              There are no transactions matching your current search or status
              filter.
            </p>
          </section>
        )}

        {/* =================================================
            TRANSACTION LIST
        ================================================= */}

        {!loading && filteredTransactions.length > 0 && (
          <section
            style={{
              display: "grid",
              gap: "14px",
            }}
          >
            {filteredTransactions.map((item) => {
              const isExpanded = expandedTicketNumber === item.ticket_number;

              const isFinanceOnly =
                item.transaction.workflow_type === "FINANCE_ONLY";

              const documentRequest = item.document_request;

              const academicPeriod = documentRequest?.academic_period;

              return (
                <article
                  key={item.ticket_id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    background: "#ffffff",
                    overflow: "hidden",
                    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.035)",
                  }}
                >
                  {/* ===================================
                          MAIN ROW
                      =================================== */}

                  <div
                    style={{
                      padding: "20px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "16px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "13px",
                          minWidth: 0,
                          flex: "1 1 340px",
                        }}
                      >
                        <div
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            background: isFinanceOnly ? "#eff6ff" : "#f0fdf4",
                            color: isFinanceOnly ? "#2563eb" : "#15803d",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          {isFinanceOnly ? (
                            <CreditCard size={22} />
                          ) : (
                            <FileText size={22} />
                          )}
                        </div>

                        <div
                          style={{
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <h3
                              style={{
                                margin: 0,
                                color: "#0f172a",
                                fontSize: "16px",
                              }}
                            >
                              {item.transaction.transaction_name}
                            </h3>

                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: "999px",
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                color: "#64748b",
                                fontSize: "10px",
                                fontWeight: 800,
                                textTransform: "uppercase",
                              }}
                            >
                              {getWorkflowLabel(item.transaction.workflow_type)}
                            </span>
                          </div>

                          <p
                            style={{
                              margin: "6px 0 0",
                              color: "#64748b",
                              fontSize: "13px",
                              lineHeight: 1.5,
                            }}
                          >
                            Ticket:{" "}
                            <strong
                              style={{
                                color: "#334155",
                              }}
                            >
                              {item.ticket_number}
                            </strong>
                          </p>

                          <p
                            style={{
                              margin: "4px 0 0",
                              color: "#94a3b8",
                              fontSize: "12px",
                            }}
                          >
                            {getSourceLabel(item.source_type)}
                          </p>
                        </div>
                      </div>

                      <span
                        style={{
                          ...getPaymentStatusStyle(item.payment.payment_status),

                          padding: "7px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.payment.payment_status}
                      </span>
                    </div>

                    {/* =================================
                            MAIN DETAILS
                        ================================= */}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(145px, 1fr))",
                        gap: "16px",
                        marginTop: "20px",
                        paddingTop: "18px",
                        borderTop: "1px solid #f1f5f9",
                      }}
                    >
                      <DetailItem
                        label="Amount Due"
                        value={formatMoney(item.payment.amount_due)}
                      />

                      <DetailItem
                        label="Amount Paid"
                        value={formatMoney(item.payment.amount_paid)}
                      />

                      <DetailItem
                        label="Payment Method"
                        value={item.payment.payment_method || "—"}
                      />

                      <DetailItem
                        label="Created"
                        value={formatDate(item.created_at)}
                      />
                    </div>

                    {/* =================================
                            DOCUMENT PERIOD
                        ================================= */}

                    {documentRequest && academicPeriod && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginTop: "15px",
                          padding: "10px 12px",
                          borderRadius: "10px",
                          background: "#f8fafc",
                          color: "#475569",
                          fontSize: "12px",
                          fontWeight: 650,
                        }}
                      >
                        <CalendarDays size={15} color="#64748b" />

                        <span>
                          {academicPeriod.academic_year} •{" "}
                          {academicPeriod.semester_name}
                        </span>
                      </div>
                    )}

                    {/* =================================
                            FINANCE ONLY NOTICE
                        ================================= */}

                    {isFinanceOnly && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          marginTop: "15px",
                          padding: "11px 12px",
                          border: "1px solid #dbeafe",
                          borderRadius: "10px",
                          background: "#eff6ff",
                          color: "#1e40af",
                          fontSize: "12px",
                          lineHeight: 1.5,
                        }}
                      >
                        <CreditCard
                          size={16}
                          style={{
                            flexShrink: 0,
                            marginTop: "1px",
                          }}
                        />

                        <span>
                          This is a Finance-only transaction. Registrar
                          processing is not required.
                        </span>
                      </div>
                    )}

                    {/* =================================
                            EXPAND BUTTON
                        ================================= */}

                    <button
                      type="button"
                      onClick={() => toggleDetails(item.ticket_number)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "7px",
                        marginTop: "16px",
                        padding: "8px 0",
                        border: "none",
                        background: "transparent",
                        color: "#15803d",
                        fontSize: "12px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp size={16} />
                          Hide Details
                        </>
                      ) : (
                        <>
                          <ChevronDown size={16} />
                          View Details
                        </>
                      )}
                    </button>
                  </div>

                  {/* ===================================
                          EXPANDED DETAILS
                      =================================== */}

                  {isExpanded && (
                    <div
                      style={{
                        padding: "20px",
                        borderTop: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gap: "20px",
                        }}
                      >
                        {/* =============================
                                PAYMENT DETAILS
                            ============================= */}

                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              marginBottom: "13px",
                            }}
                          >
                            <ReceiptText size={17} color="#15803d" />

                            <strong
                              style={{
                                color: "#0f172a",
                                fontSize: "14px",
                              }}
                            >
                              Payment Details
                            </strong>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(180px, 1fr))",
                              gap: "16px",
                            }}
                          >
                            <DetailItem
                              label="Ticket Number"
                              value={item.ticket_number}
                            />

                            <DetailItem
                              label="Transaction Code"
                              value={item.transaction.transaction_code}
                            />

                            <DetailItem
                              label="Payment Status"
                              value={
                                <span
                                  style={{
                                    ...getPaymentStatusStyle(
                                      item.payment.payment_status,
                                    ),

                                    display: "inline-flex",
                                    padding: "5px 8px",
                                    borderRadius: "999px",
                                    fontSize: "11px",
                                    fontWeight: 800,
                                  }}
                                >
                                  {item.payment.payment_status}
                                </span>
                              }
                            />

                            <DetailItem
                              label="Receipt Number"
                              value={item.payment.receipt_number || "—"}
                            />

                            <DetailItem
                              label="Payment Method"
                              value={item.payment.payment_method || "—"}
                            />

                            <DetailItem
                              label="Paid At"
                              value={formatDate(item.payment.paid_at)}
                            />
                          </div>
                        </div>

                        {/* =============================
                                DOCUMENT REQUEST DETAILS
                            ============================= */}

                        {documentRequest && (
                          <div
                            style={{
                              paddingTop: "18px",
                              borderTop: "1px solid #e2e8f0",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                marginBottom: "13px",
                              }}
                            >
                              <FileText size={17} color="#15803d" />

                              <strong
                                style={{
                                  color: "#0f172a",
                                  fontSize: "14px",
                                }}
                              >
                                Document Request
                              </strong>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: "16px",
                              }}
                            >
                              <DetailItem
                                label="Request Number"
                                value={documentRequest.request_number}
                              />

                              <DetailItem
                                label="Document"
                                value={documentRequest.document_type}
                              />

                              <DetailItem
                                label="Copies"
                                value={documentRequest.copies}
                              />

                              <DetailItem
                                label="Purpose"
                                value={documentRequest.purpose || "—"}
                              />

                              <DetailItem
                                label="Academic Year"
                                value={academicPeriod?.academic_year || "—"}
                              />

                              <DetailItem
                                label="Semester"
                                value={academicPeriod?.semester_name || "—"}
                              />

                              <DetailItem
                                label="Requested At"
                                value={formatDate(documentRequest.requested_at)}
                              />
                            </div>

                            {documentRequest.cancellation_reason && (
                              <div
                                style={{
                                  marginTop: "14px",
                                  padding: "11px 12px",
                                  border: "1px solid #fecaca",
                                  borderRadius: "10px",
                                  background: "#fef2f2",
                                  color: "#991b1b",
                                  fontSize: "12px",
                                  lineHeight: 1.5,
                                }}
                              >
                                <strong>Cancellation:</strong>{" "}
                                {documentRequest.cancellation_reason}
                              </div>
                            )}
                          </div>
                        )}

                        {/* =============================
                                REGISTRAR DETAILS
                            ============================= */}

                        {!isFinanceOnly && (
                          <div
                            style={{
                              paddingTop: "18px",
                              borderTop: "1px solid #e2e8f0",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                marginBottom: "13px",
                              }}
                            >
                              <GraduationCap size={18} color="#15803d" />

                              <strong
                                style={{
                                  color: "#0f172a",
                                  fontSize: "14px",
                                }}
                              >
                                Registrar Processing
                              </strong>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: "16px",
                              }}
                            >
                              <DetailItem
                                label="Registrar Status"
                                value={
                                  <span
                                    style={{
                                      ...getRegistrarStatusStyle(
                                        item.registrar.status,
                                      ),

                                      display: "inline-flex",
                                      padding: "5px 8px",
                                      borderRadius: "999px",
                                      fontSize: "11px",
                                      fontWeight: 800,
                                    }}
                                  >
                                    {item.registrar.status}
                                  </span>
                                }
                              />

                              <DetailItem
                                label="Started"
                                value={formatDate(item.registrar.started_at)}
                              />

                              <DetailItem
                                label="Completed"
                                value={formatDate(item.registrar.completed_at)}
                              />
                            </div>

                            {item.registrar.remarks && (
                              <div
                                style={{
                                  marginTop: "14px",
                                  padding: "11px 12px",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "10px",
                                  background: "#ffffff",
                                  color: "#475569",
                                  fontSize: "12px",
                                  lineHeight: 1.5,
                                }}
                              >
                                <strong>Registrar remarks:</strong>{" "}
                                {item.registrar.remarks}
                              </div>
                            )}
                          </div>
                        )}

                        {/* =============================
                                FINANCE REMARKS
                            ============================= */}

                        {item.finance_remarks && (
                          <div
                            style={{
                              paddingTop: "18px",
                              borderTop: "1px solid #e2e8f0",
                            }}
                          >
                            <DetailItem
                              label="Finance Remarks"
                              value={item.finance_remarks}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {/* =================================================
            STATUS GUIDE
        ================================================= */}

        {!loading && (
          <section
            style={{
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <WalletCards
                size={20}
                color="#15803d"
                style={{
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              />

              <div>
                <strong
                  style={{
                    color: "#0f172a",
                  }}
                >
                  Transaction Status Guide
                </strong>

                <p
                  style={{
                    margin: "6px 0 0",
                    color: "#64748b",
                    fontSize: "13px",
                    lineHeight: 1.65,
                  }}
                >
                  Pending Payment means payment has not yet been completed. Paid
                  means Finance has confirmed the payment. Document-related
                  transactions may continue to Registrar processing after
                  payment. Finance-only transactions do not require Registrar
                  processing.
                </p>
              </div>
            </div>
          </section>
        )}

        <style>
          {`
            @keyframes spin {
              from {
                transform: rotate(0deg);
              }

              to {
                transform: rotate(360deg);
              }
            }

            @media (max-width: 720px) {
              input,
              select,
              button {
                font-size: 16px;
              }
            }
          `}
        </style>
      </main>
    </DashboardLayout>
  );
}
