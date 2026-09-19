import { useCallback, useEffect, useMemo, useState } from "react";

import type { CSSProperties, ReactNode } from "react";

import { useNavigate } from "react-router-dom";

import {
  Banknote,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCcw,
} from "lucide-react";

import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";

const FINANCE_REPORT_API =
  "http://localhost:3000/api/finance/tickets/reports/summary";

// ============================================================
// TYPES
// ============================================================

interface FinanceReportSummary {
  total_tickets: number;
  pending_tickets: number;
  paid_tickets: number;
  cancelled_tickets: number;
  refunded_tickets: number;

  total_collected: number;
  collected_today: number;
  collected_this_month: number;
}

interface TransactionReportRow {
  transaction_type_id: number;
  transaction_code: string;
  transaction_name: string;
  workflow_type: string;

  total_tickets: number;
  paid_tickets: number;
  pending_tickets: number;

  total_collected: number;
}

interface PaymentMethodReportRow {
  payment_method: string;
  payment_count: number;
  total_collected: number;
}

interface DailyCollectionRow {
  payment_date: string;
  payment_count: number;
  total_collected: number;
}

interface FinanceReportResponse {
  success?: boolean;
  code?: string;
  message?: string;

  generated_at?: string;

  summary?: FinanceReportSummary;

  by_transaction?: TransactionReportRow[];

  by_payment_method?: PaymentMethodReportRow[];

  daily_collections?: DailyCollectionRow[];
}

// ============================================================
// HELPERS
// ============================================================

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDateTime(value: string | null | undefined) {
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

function workflowLabel(value: string) {
  if (value === "FINANCE_ONLY") {
    return "Finance Only";
  }

  if (value === "DOCUMENT_REQUEST") {
    return "Document Request";
  }

  if (value === "INCOMPLETE_GRADE") {
    return "Incomplete Grade";
  }

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ============================================================
// COMPONENT
// ============================================================

export default function FinanceReports() {
  const navigate = useNavigate();

  const session = authService.getSession();

  const token = authService.getToken();

  const isFinance = session?.role === "Finance" && Boolean(token);

  const [summary, setSummary] = useState<FinanceReportSummary>({
    total_tickets: 0,
    pending_tickets: 0,
    paid_tickets: 0,
    cancelled_tickets: 0,
    refunded_tickets: 0,

    total_collected: 0,
    collected_today: 0,
    collected_this_month: 0,
  });

  const [transactions, setTransactions] = useState<TransactionReportRow[]>([]);

  const [paymentMethods, setPaymentMethods] = useState<
    PaymentMethodReportRow[]
  >([]);

  const [dailyCollections, setDailyCollections] = useState<
    DailyCollectionRow[]
  >([]);

  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  // ==========================================================
  // AUTH
  // ==========================================================

  useEffect(() => {
    if (!isFinance) {
      navigate("/login", {
        replace: true,
      });
    }
  }, [isFinance, navigate]);

  // ==========================================================
  // LOAD REPORT
  // ==========================================================

  const loadReport = useCallback(
    async (initial = true) => {
      if (!isFinance) {
        return;
      }

      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setErrorMessage("");

      try {
        const response = await authService.authFetch(FINANCE_REPORT_API, {
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

        const data = (await response.json()) as FinanceReportResponse;

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to load Finance reports.");
        }

        setSummary({
          total_tickets: Number(data.summary?.total_tickets ?? 0),

          pending_tickets: Number(data.summary?.pending_tickets ?? 0),

          paid_tickets: Number(data.summary?.paid_tickets ?? 0),

          cancelled_tickets: Number(data.summary?.cancelled_tickets ?? 0),

          refunded_tickets: Number(data.summary?.refunded_tickets ?? 0),

          total_collected: Number(data.summary?.total_collected ?? 0),

          collected_today: Number(data.summary?.collected_today ?? 0),

          collected_this_month: Number(data.summary?.collected_this_month ?? 0),
        });

        setTransactions(
          Array.isArray(data.by_transaction) ? data.by_transaction : [],
        );

        setPaymentMethods(
          Array.isArray(data.by_payment_method) ? data.by_payment_method : [],
        );

        setDailyCollections(
          Array.isArray(data.daily_collections) ? data.daily_collections : [],
        );

        setGeneratedAt(data.generated_at ?? null);
      } catch (error) {
        console.error("LOAD FINANCE REPORT ERROR:", error);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load Finance reports.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isFinance, navigate],
  );

  useEffect(() => {
    if (!isFinance) {
      return;
    }

    void loadReport(true);
  }, [isFinance, loadReport]);

  // ==========================================================
  // MAX VALUES FOR BARS
  // ==========================================================

  const maxTransactionCollection = useMemo(() => {
    return Math.max(
      1,
      ...transactions.map((item) => Number(item.total_collected)),
    );
  }, [transactions]);

  const maxPaymentMethodCollection = useMemo(() => {
    return Math.max(
      1,
      ...paymentMethods.map((item) => Number(item.total_collected)),
    );
  }, [paymentMethods]);

  const maxDailyCollection = useMemo(() => {
    return Math.max(
      1,
      ...dailyCollections.map((item) => Number(item.total_collected)),
    );
  }, [dailyCollections]);

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
                <BarChart3 size={16} />
                Finance Analytics
              </div>

              <h1
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "28px",
                }}
              >
                Finance Reports
              </h1>

              <p
                style={{
                  margin: "8px 0 0",
                  maxWidth: "760px",
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                Review Finance ticket activity, collections, transaction
                breakdowns, and payment methods.
              </p>

              {generatedAt && (
                <div
                  style={{
                    marginTop: "8px",
                    color: "#94a3b8",
                    fontSize: "11px",
                  }}
                >
                  Report generated: {formatDateTime(generatedAt)}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void loadReport(false)}
              disabled={refreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                minHeight: "42px",
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
              Refresh Report
            </button>
          </div>
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
            LOADING
        ================================================= */}

        {loading ? (
          <section
            style={{
              ...panelStyle,
              minHeight: "280px",
              display: "grid",
              placeItems: "center",
            }}
          >
            <div
              style={{
                display: "grid",
                justifyItems: "center",
                gap: "10px",
                color: "#64748b",
              }}
            >
              <Loader2 size={28} />
              Loading Finance reports...
            </div>
          </section>
        ) : (
          <>
            {/* ===============================================
                COLLECTION SUMMARY
            =============================================== */}

            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "14px",
              }}
            >
              <SummaryCard
                label="Total Collected"
                value={formatMoney(summary.total_collected)}
                icon={<CircleDollarSign size={21} />}
              />

              <SummaryCard
                label="Collected Today"
                value={formatMoney(summary.collected_today)}
                icon={<Banknote size={21} />}
              />

              <SummaryCard
                label="This Month"
                value={formatMoney(summary.collected_this_month)}
                icon={<CalendarDays size={21} />}
              />

              <SummaryCard
                label="Paid Tickets"
                value={String(summary.paid_tickets)}
                icon={<CheckCircle2 size={21} />}
              />
            </section>

            {/* ===============================================
                TICKET SUMMARY
            =============================================== */}

            <section style={panelStyle}>
              <SectionTitle
                icon={<ReceiptText size={19} />}
                title="Ticket Summary"
                description="Current Finance ticket status across all transactions."
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "12px",
                  marginTop: "18px",
                }}
              >
                <StatusBox label="Total" value={summary.total_tickets} />

                <StatusBox
                  label="Pending Payment"
                  value={summary.pending_tickets}
                />

                <StatusBox label="Paid" value={summary.paid_tickets} />

                <StatusBox
                  label="Cancelled"
                  value={summary.cancelled_tickets}
                />

                <StatusBox label="Refunded" value={summary.refunded_tickets} />
              </div>
            </section>

            {/* ===============================================
                TRANSACTION BREAKDOWN
            =============================================== */}

            <section style={panelStyle}>
              <SectionTitle
                icon={<FileText size={19} />}
                title="Collections by Transaction"
                description="Ticket volume and collections grouped by transaction type."
              />

              <div
                style={{
                  marginTop: "18px",
                  display: "grid",
                  gap: "12px",
                }}
              >
                {transactions.length === 0 ? (
                  <EmptyState text="No transaction report data available." />
                ) : (
                  transactions.map((item) => {
                    const percent = Math.min(
                      100,
                      Math.max(
                        0,
                        (Number(item.total_collected) /
                          maxTransactionCollection) *
                          100,
                      ),
                    );

                    return (
                      <article
                        key={item.transaction_type_id}
                        style={{
                          padding: "16px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "13px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "15px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "7px",
                                flexWrap: "wrap",
                              }}
                            >
                              <strong
                                style={{
                                  color: "#0f172a",
                                  fontSize: "14px",
                                }}
                              >
                                {item.transaction_name}
                              </strong>

                              <span style={badgeStyle}>
                                {item.transaction_code}
                              </span>
                            </div>

                            <div
                              style={{
                                marginTop: "5px",
                                color: "#64748b",
                                fontSize: "11px",
                              }}
                            >
                              {workflowLabel(item.workflow_type)}
                            </div>
                          </div>

                          <div
                            style={{
                              textAlign: "right",
                            }}
                          >
                            <div
                              style={{
                                color: "#15803d",
                                fontSize: "18px",
                                fontWeight: 850,
                              }}
                            >
                              {formatMoney(item.total_collected)}
                            </div>

                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "10px",
                              }}
                            >
                              collected
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: "13px",
                            height: "7px",
                            borderRadius: "999px",
                            background: "#f1f5f9",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${percent}%`,
                              height: "100%",
                              borderRadius: "999px",
                              background: "#15803d",
                            }}
                          />
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                            gap: "8px",
                            marginTop: "12px",
                          }}
                        >
                          <MiniStat label="Total" value={item.total_tickets} />

                          <MiniStat label="Paid" value={item.paid_tickets} />

                          <MiniStat
                            label="Pending"
                            value={item.pending_tickets}
                          />
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            {/* ===============================================
                PAYMENT METHODS
            =============================================== */}

            <section style={panelStyle}>
              <SectionTitle
                icon={<CreditCard size={19} />}
                title="Collections by Payment Method"
                description="Completed payments grouped by collection method."
              />

              <div
                style={{
                  marginTop: "18px",
                  display: "grid",
                  gap: "12px",
                }}
              >
                {paymentMethods.length === 0 ? (
                  <EmptyState text="No completed payment methods are available yet." />
                ) : (
                  paymentMethods.map((item) => {
                    const percent = Math.min(
                      100,
                      Math.max(
                        0,
                        (Number(item.total_collected) /
                          maxPaymentMethodCollection) *
                          100,
                      ),
                    );

                    return (
                      <div
                        key={item.payment_method}
                        style={{
                          padding: "15px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "12px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <div>
                            <strong
                              style={{
                                color: "#0f172a",
                                fontSize: "13px",
                              }}
                            >
                              {item.payment_method}
                            </strong>

                            <div
                              style={{
                                marginTop: "3px",
                                color: "#64748b",
                                fontSize: "11px",
                              }}
                            >
                              {item.payment_count} payment
                              {item.payment_count === 1 ? "" : "s"}
                            </div>
                          </div>

                          <strong
                            style={{
                              color: "#15803d",
                            }}
                          >
                            {formatMoney(item.total_collected)}
                          </strong>
                        </div>

                        <div
                          style={{
                            marginTop: "11px",
                            height: "7px",
                            borderRadius: "999px",
                            background: "#f1f5f9",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${percent}%`,
                              height: "100%",
                              background: "#15803d",
                              borderRadius: "999px",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* ===============================================
                30-DAY COLLECTION HISTORY
            =============================================== */}

            <section style={panelStyle}>
              <SectionTitle
                icon={<CalendarDays size={19} />}
                title="Recent Daily Collections"
                description="Finance collections recorded during the latest 30 calendar days."
              />

              <div
                style={{
                  marginTop: "18px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                {dailyCollections.length === 0 ? (
                  <EmptyState text="No paid transactions were recorded during the latest 30 days." />
                ) : (
                  dailyCollections.map((item, index) => {
                    const percent = Math.min(
                      100,
                      Math.max(
                        0,
                        (Number(item.total_collected) / maxDailyCollection) *
                          100,
                      ),
                    );

                    return (
                      <div
                        key={`${item.payment_date}-${index}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "140px minmax(150px, 1fr) 100px 130px",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "11px",
                        }}
                      >
                        <div
                          style={{
                            color: "#334155",
                            fontSize: "12px",
                            fontWeight: 750,
                          }}
                        >
                          {formatDate(item.payment_date)}
                        </div>

                        <div
                          style={{
                            height: "7px",
                            background: "#f1f5f9",
                            borderRadius: "999px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${percent}%`,
                              height: "100%",
                              background: "#15803d",
                              borderRadius: "999px",
                            }}
                          />
                        </div>

                        <div
                          style={{
                            color: "#64748b",
                            fontSize: "11px",
                            textAlign: "right",
                          }}
                        >
                          {item.payment_count} payment
                          {item.payment_count === 1 ? "" : "s"}
                        </div>

                        <strong
                          style={{
                            color: "#0f172a",
                            textAlign: "right",
                            fontSize: "13px",
                          }}
                        >
                          {formatMoney(item.total_collected)}
                        </strong>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}

// ============================================================
// SMALL COMPONENTS
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

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "10px",
          background: "#f0fdf4",
          color: "#15803d",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div>
        <h2
          style={{
            margin: 0,
            color: "#0f172a",
            fontSize: "18px",
          }}
        >
          {title}
        </h2>

        <p
          style={{
            margin: "4px 0 0",
            color: "#64748b",
            fontSize: "12px",
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

function StatusBox({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: "14px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "11px",
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
        {label}
      </div>

      <div
        style={{
          marginTop: "5px",
          color: "#0f172a",
          fontSize: "21px",
          fontWeight: 850,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: "9px",
        borderRadius: "9px",
        background: "#f8fafc",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "9px",
          color: "#64748b",
          fontWeight: 800,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <strong
        style={{
          display: "block",
          marginTop: "3px",
          color: "#0f172a",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "28px",
        border: "1px dashed #cbd5e1",
        borderRadius: "12px",
        textAlign: "center",
        color: "#64748b",
        fontSize: "12px",
      }}
    >
      {text}
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

const badgeStyle: CSSProperties = {
  padding: "4px 7px",

  borderRadius: "999px",

  background: "#f1f5f9",

  color: "#475569",

  fontSize: "9px",

  fontWeight: 800,
};
