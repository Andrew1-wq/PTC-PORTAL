import { useCallback, useEffect, useMemo, useState } from "react";

import type { CSSProperties, FormEvent } from "react";

import { useNavigate } from "react-router-dom";

import {
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Loader2,
  PlayCircle,
  RefreshCcw,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";

// ============================================================
// API
// ============================================================

const REGISTRAR_DOCUMENT_REQUESTS_API =
  "http://localhost:3000/api/registrar/document-requests";

// ============================================================
// TYPES
// ============================================================

type RegistrarStatus =
  | "Pending"
  | "Ready for Processing"
  | "Processing"
  | "Done"
  | "Rejected"
  | "Cancelled"
  | string;

interface RegistrarDocumentRequest {
  ticket_id: number;
  ticket_number: string;

  student: {
    student_id: number;
    student_number: string;
    student_name: string;
  };

  transaction: {
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
  };

  payment: {
    amount_due: number | string | null;
    amount_paid: number | string | null;
    payment_method: string | null;
    receipt_number: string | null;
    payment_status: string;
    paid_at: string | null;
  };

  registrar: {
    status: RegistrarStatus;
    remarks: string | null;
    processed_by: number | null;
    started_at: string | null;
    completed_at: string | null;
  };

  created_at: string | null;
  updated_at: string | null;
}

interface QueueResponse {
  success?: boolean;
  code?: string;
  message?: string;
  requests?: RegistrarDocumentRequest[];
}

interface ActionResponse {
  success?: boolean;
  code?: string;
  message?: string;

  request?: {
    ticket_id: number;
    ticket_number: string;
    request_number: string;
    document_type: string;
    student_number: string;
    student_name: string;
    payment_status: string;
    registrar_status: string;
    registrar_processed_by: number;
  };
}

type FilterStatus = "All" | "Ready for Processing" | "Processing" | "Done";

// ============================================================
// HELPERS
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

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
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

function registrarStatusStyle(status: string): CSSProperties {
  if (status === "Ready for Processing") {
    return {
      color: "#6d28d9",
      background: "#ede9fe",
      border: "1px solid #ddd6fe",
    };
  }

  if (status === "Processing") {
    return {
      color: "#1d4ed8",
      background: "#dbeafe",
      border: "1px solid #bfdbfe",
    };
  }

  if (status === "Done") {
    return {
      color: "#166534",
      background: "#dcfce7",
      border: "1px solid #bbf7d0",
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
// MAIN COMPONENT
// ============================================================

export default function DocumentRequest() {
  const navigate = useNavigate();

  /*
   * Keep authentication dependencies primitive.
   *
   * Do not put the entire session object in useEffect
   * dependencies because getSession() may return a new
   * object every render.
   */
  const session = authService.getSession();
  const token = authService.getToken();

  const role = session?.role ?? null;

  const isRegistrar = role === "Registrar" && Boolean(token);

  // ==========================================================
  // DATA
  // ==========================================================

  const [requests, setRequests] = useState<RegistrarDocumentRequest[]>([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  // ==========================================================
  // FILTERS
  // ==========================================================

  const [searchText, setSearchText] = useState("");

  const [statusFilter, setStatusFilter] = useState<FilterStatus>("All");

  // ==========================================================
  // SELECTED REQUEST
  // ==========================================================

  const [selectedTicketNumber, setSelectedTicketNumber] = useState<
    string | null
  >(null);

  const [remarks, setRemarks] = useState("");

  const [actionLoading, setActionLoading] = useState(false);

  // ==========================================================
  // MESSAGES
  // ==========================================================

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  // ==========================================================
  // AUTH
  // ==========================================================

  useEffect(() => {
    if (!isRegistrar) {
      navigate("/login", {
        replace: true,
      });
    }
  }, [isRegistrar, navigate]);

  // ==========================================================
  // LOAD QUEUE
  // ==========================================================

  const loadRequests = useCallback(
    async (showRefreshLoader = false) => {
      if (!isRegistrar) {
        return;
      }

      if (showRefreshLoader) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage("");

      try {
        const response = await authService.authFetch(
          REGISTRAR_DOCUMENT_REQUESTS_API,
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
          navigate("/login", {
            replace: true,
          });

          return;
        }

        const data = (await response.json()) as QueueResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || "Unable to load Registrar document requests.",
          );
        }

        setRequests(Array.isArray(data.requests) ? data.requests : []);
      } catch (error) {
        console.error("LOAD REGISTRAR REQUESTS ERROR:", error);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load Registrar document requests.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isRegistrar, navigate],
  );

  useEffect(() => {
    if (!isRegistrar) {
      return;
    }

    void loadRequests();
  }, [isRegistrar, loadRequests]);

  // ==========================================================
  // SUMMARY
  // ==========================================================

  const summary = useMemo(() => {
    let ready = 0;
    let processing = 0;
    let done = 0;

    for (const request of requests) {
      if (request.registrar.status === "Ready for Processing") {
        ready += 1;
      }

      if (request.registrar.status === "Processing") {
        processing += 1;
      }

      if (request.registrar.status === "Done") {
        done += 1;
      }
    }

    return {
      total: requests.length,
      ready,
      processing,
      done,
    };
  }, [requests]);

  // ==========================================================
  // FILTERED REQUESTS
  // ==========================================================

  const filteredRequests = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return requests.filter((request) => {
      if (statusFilter !== "All" && request.registrar.status !== statusFilter) {
        return false;
      }

      if (!search) {
        return true;
      }

      const searchable = [
        request.ticket_number,
        request.student.student_number,
        request.student.student_name,
        request.document_request.request_number,
        request.document_request.document_type,
        request.transaction.transaction_name,
        request.payment.receipt_number ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(search);
    });
  }, [requests, searchText, statusFilter]);

  // ==========================================================
  // SELECTED REQUEST
  // ==========================================================

  const selectedRequest = useMemo(() => {
    if (!selectedTicketNumber) {
      return null;
    }

    return (
      requests.find(
        (request) => request.ticket_number === selectedTicketNumber,
      ) ?? null
    );
  }, [requests, selectedTicketNumber]);

  const selectRequest = (request: RegistrarDocumentRequest) => {
    setSelectedTicketNumber(request.ticket_number);

    setRemarks(request.registrar.remarks ?? "");

    setErrorMessage("");
    setSuccessMessage("");
  };

  // ==========================================================
  // START PROCESSING
  // ==========================================================

  const handleStartProcessing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedRequest || actionLoading) {
      return;
    }

    if (selectedRequest.payment.payment_status !== "Paid") {
      setErrorMessage(
        "This request cannot be processed because payment is not complete.",
      );

      return;
    }

    if (selectedRequest.registrar.status !== "Ready for Processing") {
      setErrorMessage(
        "Only requests that are Ready for Processing can be started.",
      );

      return;
    }

    setActionLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await authService.authFetch(
        `${REGISTRAR_DOCUMENT_REQUESTS_API}/${encodeURIComponent(
          selectedRequest.ticket_number,
        )}/start`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",

            Accept: "application/json",
          },

          body: JSON.stringify({
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

      const data = (await response.json()) as ActionResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to start Registrar processing.",
        );
      }

      setSuccessMessage(data.message || "Registrar processing has started.");

      await loadRequests(true);
    } catch (error) {
      console.error("START REGISTRAR PROCESSING ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start Registrar processing.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================================
  // COMPLETE REQUEST
  // ==========================================================

  const handleComplete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedRequest || actionLoading) {
      return;
    }

    if (selectedRequest.payment.payment_status !== "Paid") {
      setErrorMessage(
        "This request cannot be completed because payment is not complete.",
      );

      return;
    }

    if (selectedRequest.registrar.status !== "Processing") {
      setErrorMessage(
        "The request must be Processing before it can be marked Done.",
      );

      return;
    }

    setActionLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await authService.authFetch(
        `${REGISTRAR_DOCUMENT_REQUESTS_API}/${encodeURIComponent(
          selectedRequest.ticket_number,
        )}/complete`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",

            Accept: "application/json",
          },

          body: JSON.stringify({
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

      const data = (await response.json()) as ActionResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to complete document request.");
      }

      setSuccessMessage(
        data.message || "Document request completed successfully.",
      );

      await loadRequests(true);
    } catch (error) {
      console.error("COMPLETE REGISTRAR REQUEST ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete document request.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================================
  // AUTHORIZED RENDER ONLY
  // ==========================================================

  if (!isRegistrar) {
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
              justifyContent: "space-between",
              alignItems: "center",
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
                <FileCheck2 size={16} />
                Registrar Office
              </div>

              <h1
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "28px",
                }}
              >
                Document Requests
              </h1>

              <p
                style={{
                  margin: "8px 0 0",
                  maxWidth: "760px",
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                Process paid COR and COG requests forwarded by the Finance
                Office.
              </p>
            </div>

            <FileText size={42} color="#15803d" />
          </div>
        </section>

        {/* ===================================================
            SUMMARY
        =================================================== */}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "14px",
          }}
        >
          <SummaryCard
            icon={<FileText size={23} />}
            label="Total Requests"
            value={summary.total}
          />

          <SummaryCard
            icon={<Clock3 size={23} />}
            label="Ready for Processing"
            value={summary.ready}
          />

          <SummaryCard
            icon={<PlayCircle size={23} />}
            label="Processing"
            value={summary.processing}
          />

          <SummaryCard
            icon={<CheckCircle2 size={23} />}
            label="Completed"
            value={summary.done}
          />
        </section>

        {/* ===================================================
            SEARCH + FILTER
        =================================================== */}

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
              display: "grid",
              gridTemplateColumns:
                "minmax(240px, 1fr) minmax(190px, 260px) auto",
              gap: "10px",
            }}
          >
            <div
              style={{
                position: "relative",
              }}
            >
              <Search
                size={17}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }}
              />

              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search ticket, student, request number..."
                style={{
                  ...inputStyle,
                  paddingLeft: "38px",
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as FilterStatus)
              }
              style={inputStyle}
            >
              <option value="All">All Statuses</option>

              <option value="Ready for Processing">Ready for Processing</option>

              <option value="Processing">Processing</option>

              <option value="Done">Done</option>
            </select>

            <button
              type="button"
              onClick={() => void loadRequests(true)}
              disabled={refreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                padding: "10px 14px",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                background: "#ffffff",
                color: "#334155",
                fontWeight: 700,
                cursor: refreshing ? "wait" : "pointer",
              }}
            >
              {refreshing ? <Loader2 size={16} /> : <RefreshCcw size={16} />}
              Refresh
            </button>
          </div>
        </section>

        {/* ===================================================
            MESSAGES
        =================================================== */}

        {errorMessage && (
          <div
            style={{
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

        {/* ===================================================
            REQUEST LIST
        =================================================== */}

        <section
          style={{
            padding: "22px",
            border: "1px solid #e2e8f0",
            borderRadius: "18px",
            background: "#ffffff",
          }}
        >
          <div
            style={{
              marginBottom: "18px",
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: "19px",
              }}
            >
              Registrar Queue
            </h2>

            <p
              style={{
                margin: "5px 0 0",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              {filteredRequests.length} request
              {filteredRequests.length === 1 ? "" : "s"} shown
            </p>
          </div>

          {loading ? (
            <div
              style={{
                minHeight: "180px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                color: "#64748b",
              }}
            >
              <Loader2 size={20} />
              Loading Registrar requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                border: "1px dashed #cbd5e1",
                borderRadius: "14px",
                color: "#64748b",
              }}
            >
              <FileText size={34} />

              <p
                style={{
                  margin: "10px 0 0",
                  fontWeight: 700,
                }}
              >
                No document requests found.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "12px",
              }}
            >
              {filteredRequests.map((request) => {
                const isSelected =
                  selectedTicketNumber === request.ticket_number;

                return (
                  <article
                    key={request.ticket_id}
                    onClick={() => selectRequest(request)}
                    style={{
                      padding: "17px",

                      border: isSelected
                        ? "2px solid #15803d"
                        : "1px solid #e2e8f0",

                      borderRadius: "13px",

                      background: isSelected ? "#f8fff9" : "#ffffff",

                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
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
                          <FileText size={17} color="#15803d" />

                          {request.transaction.transaction_name}
                        </div>

                        <div
                          style={{
                            marginTop: "5px",
                            color: "#64748b",
                            fontSize: "12px",
                          }}
                        >
                          {request.ticket_number} •{" "}
                          {request.document_request.request_number}
                        </div>
                      </div>

                      <StatusBadge
                        label={request.registrar.status}
                        style={registrarStatusStyle(request.registrar.status)}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: "10px",
                        marginTop: "14px",
                      }}
                    >
                      <InfoBox
                        label="Student"
                        value={request.student.student_name}
                      />

                      <InfoBox
                        label="Student Number"
                        value={request.student.student_number}
                      />

                      <InfoBox
                        label="Payment"
                        value={request.payment.payment_status}
                      />

                      <InfoBox
                        label="Paid Amount"
                        value={formatMoney(request.payment.amount_paid)}
                      />

                      <InfoBox
                        label="Paid At"
                        value={formatDate(request.payment.paid_at)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ===================================================
            SELECTED REQUEST DETAILS
        =================================================== */}

        {selectedRequest && (
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
                alignItems: "flex-start",
                gap: "16px",
                flexWrap: "wrap",
                marginBottom: "20px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    color: "#15803d",
                    fontSize: "11px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                  }}
                >
                  Selected Request
                </p>

                <h2
                  style={{
                    margin: "5px 0 0",
                    color: "#0f172a",
                  }}
                >
                  {selectedRequest.ticket_number}
                </h2>
              </div>

              <StatusBadge
                label={selectedRequest.registrar.status}
                style={registrarStatusStyle(selectedRequest.registrar.status)}
              />
            </div>

            {/* STUDENT */}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "15px",
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
                    color: "#0f172a",
                  }}
                >
                  {selectedRequest.student.student_name}
                </strong>

                <div
                  style={{
                    marginTop: "3px",
                    color: "#64748b",
                    fontSize: "12px",
                  }}
                >
                  {selectedRequest.student.student_number}
                </div>
              </div>
            </div>

            {/* DETAILS */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
              }}
            >
              <InfoBox
                label="Document"
                value={selectedRequest.transaction.transaction_name}
              />

              <InfoBox
                label="Request Number"
                value={selectedRequest.document_request.request_number}
              />

              <InfoBox
                label="Copies"
                value={String(selectedRequest.document_request.copies)}
              />

              <InfoBox
                label="Payment Status"
                value={selectedRequest.payment.payment_status}
              />

              <InfoBox
                label="Amount Paid"
                value={formatMoney(selectedRequest.payment.amount_paid)}
              />

              <InfoBox
                label="Payment Method"
                value={selectedRequest.payment.payment_method ?? "—"}
              />

              <InfoBox
                label="Receipt Number"
                value={selectedRequest.payment.receipt_number ?? "—"}
              />

              <InfoBox
                label="Paid At"
                value={formatDate(selectedRequest.payment.paid_at)}
              />

              <InfoBox
                label="Started At"
                value={formatDate(selectedRequest.registrar.started_at)}
              />

              <InfoBox
                label="Completed At"
                value={formatDate(selectedRequest.registrar.completed_at)}
              />
            </div>

            {selectedRequest.document_request.purpose && (
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
                  {selectedRequest.document_request.purpose}
                </div>
              </div>
            )}

            {/* ===============================================
                READY → PROCESSING
            =============================================== */}

            {selectedRequest.registrar.status === "Ready for Processing" && (
              <form
                onSubmit={handleStartProcessing}
                style={{
                  marginTop: "20px",
                  padding: "18px",
                  border: "1px solid #ddd6fe",
                  borderRadius: "12px",
                  background: "#faf5ff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    marginBottom: "14px",
                  }}
                >
                  <PlayCircle size={21} color="#6d28d9" />

                  <strong
                    style={{
                      color: "#4c1d95",
                    }}
                  >
                    Start Registrar Processing
                  </strong>
                </div>

                <label style={fieldLabelStyle}>
                  Registrar Remarks
                  <textarea
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Example: Started preparing COR."
                    disabled={actionLoading}
                    style={{
                      ...inputStyle,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                </label>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: "14px",
                  }}
                >
                  <ActionButton
                    loading={actionLoading}
                    label="Start Processing"
                    loadingLabel="Starting..."
                    icon={<PlayCircle size={17} />}
                  />
                </div>
              </form>
            )}

            {/* ===============================================
                PROCESSING → DONE
            =============================================== */}

            {selectedRequest.registrar.status === "Processing" && (
              <form
                onSubmit={handleComplete}
                style={{
                  marginTop: "20px",
                  padding: "18px",
                  border: "1px solid #bfdbfe",
                  borderRadius: "12px",
                  background: "#eff6ff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    marginBottom: "14px",
                  }}
                >
                  <FileCheck2 size={21} color="#1d4ed8" />

                  <strong
                    style={{
                      color: "#1e3a8a",
                    }}
                  >
                    Complete Document Request
                  </strong>
                </div>

                <label style={fieldLabelStyle}>
                  Completion Remarks
                  <textarea
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Example: COR prepared and released to student."
                    disabled={actionLoading}
                    style={{
                      ...inputStyle,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                </label>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: "14px",
                  }}
                >
                  <ActionButton
                    loading={actionLoading}
                    label="Mark as Done"
                    loadingLabel="Completing..."
                    icon={<CheckCircle2 size={17} />}
                  />
                </div>
              </form>
            )}

            {/* ===============================================
                DONE
            =============================================== */}

            {selectedRequest.registrar.status === "Done" && (
              <div
                style={{
                  marginTop: "20px",
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
                    gap: "9px",
                    color: "#166534",
                  }}
                >
                  <CheckCircle2 size={21} />

                  <strong>Request Completed</strong>
                </div>

                <p
                  style={{
                    margin: "8px 0 0",
                    color: "#166534",
                    fontSize: "13px",
                  }}
                >
                  This document request has already been completed by the
                  Registrar.
                </p>

                {selectedRequest.registrar.remarks && (
                  <p
                    style={{
                      margin: "8px 0 0",
                      color: "#166534",
                      fontSize: "13px",
                    }}
                  >
                    Remarks: {selectedRequest.registrar.remarks}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* ===================================================
            WORKFLOW INFO
        =================================================== */}

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
              gap: "10px",
              alignItems: "flex-start",
            }}
          >
            <WalletCards size={21} color="#15803d" />

            <div>
              <strong
                style={{
                  color: "#0f172a",
                }}
              >
                Registrar Workflow
              </strong>

              <p
                style={{
                  margin: "5px 0 0",
                  color: "#64748b",
                  fontSize: "13px",
                  lineHeight: 1.6,
                }}
              >
                Only Finance-paid requests appear in this queue. Registrar can
                move a request from Ready for Processing to Processing, then
                from Processing to Done. Registrar does not change the student's
                payment status.
              </p>
            </div>
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}

// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <article
      style={{
        display: "flex",
        alignItems: "center",
        gap: "13px",
        padding: "18px",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          width: "44px",
          height: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "11px",
          background: "#f0fdf4",
          color: "#15803d",
        }}
      >
        {icon}
      </div>

      <div>
        <span
          style={{
            display: "block",
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 650,
          }}
        >
          {label}
        </span>

        <strong
          style={{
            display: "block",
            marginTop: "2px",
            color: "#0f172a",
            fontSize: "23px",
          }}
        >
          {value}
        </strong>
      </div>
    </article>
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

// ============================================================
// ACTION BUTTON
// ============================================================

function ActionButton({
  loading,
  label,
  loadingLabel,
  icon,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        minWidth: "170px",
        padding: "11px 17px",
        border: 0,
        borderRadius: "10px",
        background: loading ? "#86a993" : "#15803d",
        color: "#ffffff",
        fontWeight: 800,
        cursor: loading ? "wait" : "pointer",
      }}
    >
      {loading ? (
        <>
          <Loader2 size={17} />

          {loadingLabel}
        </>
      ) : (
        <>
          {icon}

          {label}
        </>
      )}
    </button>
  );
}

// ============================================================
// STYLES
// ============================================================

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

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: "7px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 700,
};
