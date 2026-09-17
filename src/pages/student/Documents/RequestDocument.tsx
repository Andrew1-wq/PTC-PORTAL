import { useCallback, useEffect, useState } from "react";

import type { CSSProperties, FormEvent } from "react";

import { useNavigate } from "react-router-dom";

import {
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCcw,
  Send,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";

const DOCUMENT_REQUEST_API =
  "http://localhost:3000/api/student/document-requests";

type DocumentType = "COR" | "COG";

interface DocumentRequest {
  request_id: number;
  request_number: string;
  document_type: DocumentType;

  purpose: string | null;
  copies: number;

  requested_at: string;

  cancelled_at: string | null;
  cancellation_reason: string | null;

  ticket_id: number | null;
  ticket_number: string | null;

  amount_due: number | string | null;
  amount_paid: number | string | null;

  payment_method: string | null;
  receipt_number: string | null;

  payment_status: string;
  registrar_status: string;

  paid_at: string | null;

  registrar_started_at: string | null;
  registrar_completed_at: string | null;

  ticket_created_at: string | null;
}

interface RequestsResponse {
  success?: boolean;
  code?: string;
  message?: string;
  requests?: DocumentRequest[];
}

interface CreateRequestResponse {
  success?: boolean;
  code?: string;
  message?: string;

  request?: {
    request_id: number;
    request_number: string;
    document_type: DocumentType;
    purpose: string | null;
    copies: number;
  };

  ticket?: {
    ticket_id: number;
    ticket_number: string;
    transaction_type: string;
    amount_due: number | null;
    amount_paid: number;
    payment_status: string;
    registrar_status: string;
  };

  student?: {
    student_id: number;
    student_number: string;
    student_name: string;
  };
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
// FORMAT MONEY
// ============================================================

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not assigned yet";
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

// ============================================================
// PAYMENT STATUS STYLE
// ============================================================

function paymentStatusStyle(status: string): CSSProperties {
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

  if (status === "Cancelled" || status === "Refunded") {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      border: "1px solid #fecaca",
    };
  }

  return {
    color: "#334155",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
  };
}

// ============================================================
// REGISTRAR STATUS STYLE
// ============================================================

function registrarStatusStyle(status: string): CSSProperties {
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

  if (status === "Rejected" || status === "Cancelled") {
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
// COMPONENT
// ============================================================

export default function RequestDocument() {
  const navigate = useNavigate();

  /*
   * IMPORTANT:
   *
   * Do NOT use the whole session object as a dependency.
   *
   * getSession() may create a new object every render.
   * We only extract the primitive role value.
   */
  const session = authService.getSession();
  const token = authService.getToken();

  const role = session?.role ?? null;

  const isStudent = role === "Student" && Boolean(token);

  const [documentType, setDocumentType] = useState<DocumentType>("COR");

  const [purpose, setPurpose] = useState("");

  const [copies, setCopies] = useState(1);

  const [requests, setRequests] = useState<DocumentRequest[]>([]);

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const [createdRequest, setCreatedRequest] =
    useState<CreateRequestResponse | null>(null);

  // ==========================================================
  // AUTH GUARD
  //
  // Only stable primitive values are dependencies.
  // ==========================================================

  useEffect(() => {
    if (!isStudent) {
      navigate("/login", {
        replace: true,
      });
    }
  }, [isStudent, navigate]);

  // ==========================================================
  // LOAD DOCUMENT REQUESTS
  //
  // IMPORTANT:
  //
  // session object is NOT a dependency here.
  // ==========================================================

  const loadRequests = useCallback(async () => {
    if (!isStudent) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const response = await authService.authFetch(DOCUMENT_REQUEST_API, {
        method: "GET",

        headers: {
          Accept: "application/json",
        },
      });

      // ================================================
      // SESSION EXPIRED
      // ================================================

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      // ================================================
      // WRONG ROLE
      // ================================================

      if (response.status === 403) {
        navigate("/login", {
          replace: true,
        });

        return;
      }

      const data = (await response.json()) as RequestsResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load document requests.");
      }

      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (error) {
      console.error("LOAD DOCUMENT REQUESTS ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load document requests.",
      );
    } finally {
      setLoading(false);
    }
  }, [isStudent, navigate]);

  // ==========================================================
  // INITIAL LOAD
  //
  // This will now run when the page opens,
  // NOT continuously.
  // ==========================================================

  useEffect(() => {
    if (!isStudent) {
      return;
    }

    void loadRequests();
  }, [isStudent, loadRequests]);

  // ==========================================================
  // CREATE DOCUMENT REQUEST
  // ==========================================================

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setCreatedRequest(null);

    // ================================================
    // VALIDATE COPIES
    // ================================================

    if (!Number.isInteger(copies) || copies < 1) {
      setErrorMessage("Copies must be at least 1.");

      return;
    }

    try {
      setSubmitting(true);

      const response = await authService.authFetch(DOCUMENT_REQUEST_API, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Accept: "application/json",
        },

        body: JSON.stringify({
          document_type: documentType,

          purpose: purpose.trim(),

          copies,
        }),
      });

      // ================================================
      // SESSION EXPIRED
      // ================================================

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      // ================================================
      // WRONG ROLE
      // ================================================

      if (response.status === 403) {
        navigate("/login", {
          replace: true,
        });

        return;
      }

      const data = (await response.json()) as CreateRequestResponse;

      // ================================================
      // BACKEND ERROR
      // ================================================

      if (!response.ok || !data.success) {
        if (data.code === "ACTIVE_DOCUMENT_REQUEST_EXISTS") {
          throw new Error(
            data.message ||
              `You already have an active ${documentType} request.`,
          );
        }

        throw new Error(data.message || "Unable to create document request.");
      }

      // ================================================
      // SUCCESS
      // ================================================

      setCreatedRequest(data);

      setSuccessMessage(
        data.message || `${documentType} request created successfully.`,
      );

      setPurpose("");
      setCopies(1);

      /*
       * Reload history once.
       *
       * Because loadRequests is now stable,
       * this will NOT trigger a render loop.
       */
      await loadRequests();
    } catch (error) {
      console.error("CREATE DOCUMENT REQUEST ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create document request.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================================
  // DO NOT RENDER STUDENT PAGE IF NOT AUTHORIZED
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
        {/* ===================================================
            HEADER
        =================================================== */}

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
                <FileText size={16} />
                Student Documents
              </div>

              <h1
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "28px",
                }}
              >
                Request a Document
              </h1>

              <p
                style={{
                  margin: "8px 0 0",
                  maxWidth: "720px",
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                Request your Certificate of Registration or Certificate of
                Grades and track the Finance and Registrar status from this
                page.
              </p>
            </div>

            <ReceiptText size={42} color="#15803d" aria-hidden="true" />
          </div>
        </section>

        {/* ===================================================
            NEW REQUEST
        =================================================== */}

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
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: "19px",
              }}
            >
              New Document Request
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              A Finance ticket will automatically be generated after a
              successful request.
            </p>
          </div>

          {/* ERROR */}

          {errorMessage && (
            <div
              style={{
                marginBottom: "18px",
                padding: "12px 14px",
                border: "1px solid #fecaca",
                borderRadius: "10px",
                background: "#fef2f2",
                color: "#991b1b",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* SUCCESS */}

          {successMessage && (
            <div
              style={{
                marginBottom: "18px",
                padding: "12px 14px",
                border: "1px solid #bbf7d0",
                borderRadius: "10px",
                background: "#f0fdf4",
                color: "#166534",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {successMessage}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{
              display: "grid",

              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",

              gap: "16px",
            }}
          >
            {/* DOCUMENT TYPE */}

            <label
              style={{
                display: "grid",
                gap: "7px",
                color: "#334155",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Document Type
              <select
                value={documentType}
                onChange={(event) =>
                  setDocumentType(event.target.value as DocumentType)
                }
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  background: "#ffffff",
                  color: "#0f172a",
                  outline: "none",
                }}
              >
                <option value="COR">Certificate of Registration (COR)</option>

                <option value="COG">Certificate of Grades (COG)</option>
              </select>
            </label>

            {/* COPIES */}

            <label
              style={{
                display: "grid",
                gap: "7px",
                color: "#334155",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Number of Copies
              <input
                type="number"
                min={1}
                step={1}
                value={copies}
                disabled={submitting}
                onChange={(event) => {
                  const value = Number(event.target.value);

                  setCopies(
                    Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1,
                  );
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  color: "#0f172a",
                  outline: "none",
                }}
              />
            </label>

            {/* PURPOSE */}

            <label
              style={{
                display: "grid",
                gridColumn: "1 / -1",
                gap: "7px",
                color: "#334155",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Purpose
              <textarea
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                maxLength={255}
                rows={4}
                placeholder="Example: Scholarship requirement, employment, personal copy..."
                disabled={submitting}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  resize: "vertical",
                  padding: "11px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  color: "#0f172a",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </label>

            {/* SUBMIT */}

            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="submit"
                disabled={submitting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  minWidth: "170px",
                  padding: "11px 18px",
                  border: 0,
                  borderRadius: "10px",
                  background: submitting ? "#86a993" : "#15803d",
                  color: "#ffffff",
                  fontWeight: 800,
                  cursor: submitting ? "wait" : "pointer",
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={17} />
                    Creating...
                  </>
                ) : (
                  <>
                    <Send size={17} />
                    Submit Request
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* ===================================================
            CREATED REQUEST RESULT
        =================================================== */}

        {createdRequest?.request && createdRequest.ticket && (
          <section
            style={{
              padding: "24px",
              border: "1px solid #bbf7d0",
              borderRadius: "18px",
              background: "#f0fdf4",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "18px",
              }}
            >
              <CheckCircle2 size={24} color="#15803d" />

              <div>
                <h2
                  style={{
                    margin: 0,
                    color: "#14532d",
                    fontSize: "18px",
                  }}
                >
                  Request Successfully Created
                </h2>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#166534",
                    fontSize: "13px",
                  }}
                >
                  Present the Finance ticket number to the Cashier.
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",

                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",

                gap: "12px",
              }}
            >
              <InfoBox
                label="Request Number"
                value={createdRequest.request.request_number}
              />

              <InfoBox
                label="Finance Ticket"
                value={createdRequest.ticket.ticket_number}
              />

              <InfoBox
                label="Payment Status"
                value={createdRequest.ticket.payment_status}
              />

              <InfoBox
                label="Registrar Status"
                value={createdRequest.ticket.registrar_status}
              />
            </div>
          </section>
        )}

        {/* ===================================================
            REQUEST HISTORY
        =================================================== */}

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
              justifyContent: "space-between",
              gap: "14px",
              marginBottom: "20px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "19px",
                }}
              >
                My Document Requests
              </h2>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#64748b",
                  fontSize: "13px",
                }}
              >
                Track payment and Registrar processing here.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadRequests()}
              disabled={loading}
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
                cursor: loading ? "wait" : "pointer",
              }}
            >
              <RefreshCcw size={15} />
              Refresh
            </button>
          </div>

          {/* LOADING */}

          {loading ? (
            <div
              style={{
                minHeight: "140px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                color: "#64748b",
              }}
            >
              <Loader2 size={20} />
              Loading document requests...
            </div>
          ) : requests.length === 0 ? (
            <div
              style={{
                padding: "34px",
                textAlign: "center",
                border: "1px dashed #cbd5e1",
                borderRadius: "14px",
                color: "#64748b",
              }}
            >
              <FileText
                size={32}
                style={{
                  marginBottom: "8px",
                }}
              />

              <div
                style={{
                  fontWeight: 700,
                }}
              >
                No document requests yet.
              </div>

              <div
                style={{
                  marginTop: "4px",
                  fontSize: "13px",
                }}
              >
                Submit your first COR or COG request above.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "14px",
              }}
            >
              {requests.map((request) => (
                <article
                  key={request.request_id}
                  style={{
                    padding: "18px",

                    border: "1px solid #e2e8f0",

                    borderRadius: "14px",

                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",

                      justifyContent: "space-between",

                      alignItems: "flex-start",

                      gap: "14px",

                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",

                          alignItems: "center",

                          gap: "8px",

                          color: "#0f172a",

                          fontWeight: 800,
                        }}
                      >
                        <FileText size={18} color="#15803d" />

                        {request.document_type === "COR"
                          ? "Certificate of Registration"
                          : "Certificate of Grades"}
                      </div>

                      <div
                        style={{
                          marginTop: "5px",

                          color: "#64748b",

                          fontSize: "12px",
                        }}
                      >
                        Requested {formatDate(request.requested_at)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",

                        gap: "7px",

                        flexWrap: "wrap",
                      }}
                    >
                      <StatusBadge
                        label={request.payment_status}
                        style={paymentStatusStyle(request.payment_status)}
                      />

                      <StatusBadge
                        label={request.registrar_status}
                        style={registrarStatusStyle(request.registrar_status)}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",

                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",

                      gap: "12px",

                      marginTop: "16px",
                    }}
                  >
                    <InfoBox
                      label="Request Number"
                      value={request.request_number}
                    />

                    <InfoBox
                      label="Finance Ticket"
                      value={request.ticket_number || "Not generated"}
                    />

                    <InfoBox label="Copies" value={String(request.copies)} />

                    <InfoBox
                      label="Amount Due"
                      value={formatMoney(request.amount_due)}
                    />

                    <InfoBox
                      label="Amount Paid"
                      value={formatMoney(request.amount_paid)}
                    />

                    <InfoBox
                      label="Payment Method"
                      value={request.payment_method || "—"}
                    />
                  </div>

                  {request.purpose && (
                    <div
                      style={{
                        marginTop: "14px",

                        padding: "12px 14px",

                        borderRadius: "10px",

                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          marginBottom: "4px",

                          color: "#64748b",

                          fontSize: "11px",

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
                        {request.purpose}
                      </div>
                    </div>
                  )}

                  <RequestProgress
                    paymentStatus={request.payment_status}
                    registrarStatus={request.registrar_status}
                  />
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </DashboardLayout>
  );
}

// ============================================================
// INFO BOX
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

// ============================================================
// STATUS BADGE
// ============================================================

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
        minHeight: "27px",
        padding: "4px 9px",
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

// ============================================================
// REQUEST PROGRESS
// ============================================================

function RequestProgress({
  paymentStatus,
  registrarStatus,
}: {
  paymentStatus: string;
  registrarStatus: string;
}) {
  const paymentComplete = paymentStatus === "Paid";

  const ready =
    registrarStatus === "Ready for Processing" ||
    registrarStatus === "Processing" ||
    registrarStatus === "Done";

  const processing =
    registrarStatus === "Processing" || registrarStatus === "Done";

  const done = registrarStatus === "Done";

  const steps = [
    {
      title: "Request Submitted",

      complete: true,

      icon: FileText,
    },

    {
      title: "Payment Completed",

      complete: paymentComplete,

      icon: WalletCards,
    },

    {
      title: "Ready for Registrar",

      complete: ready,

      icon: ReceiptText,
    },

    {
      title: "Processing",

      complete: processing,

      icon: Clock3,
    },

    {
      title: "Done",

      complete: done,

      icon: CheckCircle2,
    },
  ];

  return (
    <div
      style={{
        display: "grid",

        gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))",

        gap: "8px",

        marginTop: "16px",
      }}
    >
      {steps.map((step) => {
        const Icon = step.icon;

        return (
          <div
            key={step.title}
            style={{
              display: "flex",

              alignItems: "center",

              gap: "7px",

              padding: "8px 9px",

              borderRadius: "9px",

              background: step.complete ? "#f0fdf4" : "#f8fafc",

              color: step.complete ? "#166534" : "#94a3b8",

              fontSize: "10px",

              fontWeight: 750,
            }}
          >
            <Icon size={14} />

            {step.title}
          </div>
        );
      })}
    </div>
  );
}
