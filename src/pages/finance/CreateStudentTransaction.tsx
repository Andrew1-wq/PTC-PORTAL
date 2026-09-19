import { useCallback, useEffect, useMemo, useState } from "react";

import type { FormEvent, ReactNode } from "react";

import { useNavigate } from "react-router-dom";

import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  FileText,
  Loader2,
  ReceiptText,
  Search,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";

const STUDENT_SEARCH_API = "http://localhost:3000/api/finance/tickets/students";

const TRANSACTION_TYPES_API =
  "http://localhost:3000/api/finance/tickets/transaction-types";

const CREATE_TRANSACTION_API =
  "http://localhost:3000/api/finance/tickets/manual";

// ============================================================
// TYPES
// ============================================================

interface FinanceStudent {
  student_id: number;
  student_number: string;
  student_name: string;
}

interface StudentSearchResponse {
  success?: boolean;
  code?: string;
  message?: string;

  query?: string | null;
  count?: number;

  students?: FinanceStudent[];
}

interface FinanceTransactionType {
  transaction_type_id: number;

  transaction_code: string;
  transaction_name: string;

  description: string | null;

  requires_grade_reference: boolean;

  workflow_type:
    | "FINANCE_ONLY"
    | "DOCUMENT_REQUEST"
    | "INCOMPLETE_GRADE"
    | string;

  allow_manual_creation: boolean;

  allow_amount_override: boolean;

  default_amount: number | null;

  is_active: boolean;
}

interface TransactionTypesResponse {
  success?: boolean;
  code?: string;
  message?: string;

  transaction_types?: FinanceTransactionType[];
}

interface CreatedTicket {
  ticket_id: number;

  ticket_number: string;

  source_type: string;

  student: {
    student_id: number;
    student_number: string;
    student_name: string;
  };

  transaction: {
    transaction_type_id: number;
    transaction_code: string;
    transaction_name: string;
    workflow_type: string;
  };

  payment: {
    amount_due: number;
    amount_paid: number;
    payment_status: string;
  };

  registrar: {
    status: string;
  };

  remarks: string | null;
}

interface CreateTransactionResponse {
  success?: boolean;
  code?: string;
  message?: string;

  ticket?: CreatedTicket;
}

// ============================================================
// FORMAT MONEY
// ============================================================

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Not configured";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

// ============================================================
// INFO BOX
// ============================================================

function InfoBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "13px 14px",
        border: "1px solid #e2e8f0",
        borderRadius: "11px",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "5px",
          color: "#64748b",
          fontSize: "10px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: ".05em",
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

// ============================================================
// COMPONENT
// ============================================================

export default function CreateStudentTransaction() {
  const navigate = useNavigate();

  const session = authService.getSession();
  const token = authService.getToken();

  const role = session?.role ?? null;

  const isFinance = role === "Finance" && Boolean(token);

  // ==========================================================
  // STUDENT SEARCH
  // ==========================================================

  const [studentQuery, setStudentQuery] = useState("");

  const [studentResults, setStudentResults] = useState<FinanceStudent[]>([]);

  const [selectedStudent, setSelectedStudent] = useState<FinanceStudent | null>(
    null,
  );

  const [searchingStudents, setSearchingStudents] = useState(false);

  const [studentSearchMessage, setStudentSearchMessage] = useState("");

  // ==========================================================
  // TRANSACTION TYPES
  // ==========================================================

  const [transactionTypes, setTransactionTypes] = useState<
    FinanceTransactionType[]
  >([]);

  const [selectedTransactionCode, setSelectedTransactionCode] = useState("");

  const [loadingTypes, setLoadingTypes] = useState(true);

  // ==========================================================
  // FORM
  // ==========================================================

  const [amountDue, setAmountDue] = useState("");

  const [remarks, setRemarks] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const [createdTicket, setCreatedTicket] = useState<CreatedTicket | null>(
    null,
  );

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
  // SELECTED TRANSACTION TYPE
  // ==========================================================

  const selectedTransactionType = useMemo(() => {
    return (
      transactionTypes.find(
        (item) => item.transaction_code === selectedTransactionCode,
      ) ?? null
    );
  }, [transactionTypes, selectedTransactionCode]);

  // ==========================================================
  // LOAD TRANSACTION TYPES
  // ==========================================================

  const loadTransactionTypes = useCallback(async () => {
    if (!isFinance) {
      return;
    }

    setLoadingTypes(true);
    setErrorMessage("");

    try {
      const response = await authService.authFetch(TRANSACTION_TYPES_API, {
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

      const data = (await response.json()) as TransactionTypesResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load Finance transaction types.",
        );
      }

      const loadedTypes = Array.isArray(data.transaction_types)
        ? data.transaction_types
        : [];

      /*
       * Finance manual assignment must ONLY use:
       *
       * - Active types
       * - FINANCE_ONLY workflow
       * - allow_manual_creation = true
       *
       * This matches backend enforcement.
       */
      setTransactionTypes(
        loadedTypes.filter(
          (item) =>
            item.is_active &&
            item.workflow_type === "FINANCE_ONLY" &&
            item.allow_manual_creation,
        ),
      );
    } catch (error) {
      console.error("LOAD FINANCE TRANSACTION TYPES ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load Finance transaction types.",
      );
    } finally {
      setLoadingTypes(false);
    }
  }, [isFinance, navigate]);

  useEffect(() => {
    if (!isFinance) {
      return;
    }

    void loadTransactionTypes();
  }, [isFinance, loadTransactionTypes]);

  // ==========================================================
  // SEARCH STUDENTS
  //
  // Debounced so the backend is not called every keystroke.
  // ==========================================================

  useEffect(() => {
    if (!isFinance || selectedStudent) {
      return;
    }

    const query = studentQuery.trim();

    if (query.length < 2) {
      setStudentResults([]);
      setStudentSearchMessage("");

      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchingStudents(true);

      setStudentSearchMessage("");

      try {
        const response = await authService.authFetch(
          `${STUDENT_SEARCH_API}?q=${encodeURIComponent(query)}`,
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

        const data = (await response.json()) as StudentSearchResponse;

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to search students.");
        }

        const students = Array.isArray(data.students) ? data.students : [];

        setStudentResults(students);

        if (students.length === 0) {
          setStudentSearchMessage("No students matched your search.");
        }
      } catch (error) {
        console.error("FINANCE STUDENT SEARCH ERROR:", error);

        setStudentResults([]);

        setStudentSearchMessage(
          error instanceof Error ? error.message : "Unable to search students.",
        );
      } finally {
        setSearchingStudents(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isFinance, studentQuery, selectedStudent, navigate]);

  // ==========================================================
  // TRANSACTION TYPE CHANGE
  // ==========================================================

  const handleTransactionTypeChange = (transactionCode: string) => {
    setSelectedTransactionCode(transactionCode);

    setErrorMessage("");
    setSuccessMessage("");
    setCreatedTicket(null);

    const selectedType = transactionTypes.find(
      (item) => item.transaction_code === transactionCode,
    );

    if (!selectedType) {
      setAmountDue("");
      return;
    }

    if (
      selectedType.default_amount !== null &&
      selectedType.default_amount !== undefined
    ) {
      setAmountDue(String(selectedType.default_amount));
    } else {
      setAmountDue("");
    }
  };

  // ==========================================================
  // SELECT STUDENT
  // ==========================================================

  const selectStudent = (student: FinanceStudent) => {
    setSelectedStudent(student);

    setStudentQuery(`${student.student_number} — ${student.student_name}`);

    setStudentResults([]);

    setStudentSearchMessage("");

    setErrorMessage("");
    setSuccessMessage("");
    setCreatedTicket(null);
  };

  // ==========================================================
  // CLEAR STUDENT
  // ==========================================================

  const clearStudent = () => {
    setSelectedStudent(null);

    setStudentQuery("");

    setStudentResults([]);

    setStudentSearchMessage("");

    setCreatedTicket(null);

    setSuccessMessage("");
    setErrorMessage("");
  };

  // ==========================================================
  // CREATE STUDENT TRANSACTION
  // ==========================================================

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setCreatedTicket(null);

    if (!selectedStudent) {
      setErrorMessage("Please select a student.");

      return;
    }

    if (!selectedTransactionType) {
      setErrorMessage("Please select a Finance transaction type.");

      return;
    }

    const parsedAmount = amountDue.trim() === "" ? null : Number(amountDue);

    if (
      parsedAmount !== null &&
      (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    ) {
      setErrorMessage("Amount due must be greater than zero.");

      return;
    }

    /*
     * If there is no configured default,
     * Finance MUST enter an amount.
     */
    if (
      selectedTransactionType.default_amount === null &&
      parsedAmount === null
    ) {
      setErrorMessage(
        "This transaction type has no default amount. Enter the amount due.",
      );

      return;
    }

    /*
     * Fixed transaction type:
     * amount must remain exactly the configured default.
     */
    if (
      !selectedTransactionType.allow_amount_override &&
      selectedTransactionType.default_amount !== null &&
      parsedAmount !== selectedTransactionType.default_amount
    ) {
      setErrorMessage(
        `This transaction uses the fixed amount ${formatMoney(
          selectedTransactionType.default_amount,
        )}.`,
      );

      return;
    }

    try {
      setSubmitting(true);

      const body: {
        student_id: number;
        transaction_code: string;
        amount_due?: number;
        remarks?: string;
      } = {
        student_id: selectedStudent.student_id,

        transaction_code: selectedTransactionType.transaction_code,
      };

      /*
       * Send amount_due only when an actual value exists.
       *
       * Backend will otherwise use default_amount.
       */
      if (parsedAmount !== null) {
        body.amount_due = parsedAmount;
      }

      if (remarks.trim()) {
        body.remarks = remarks.trim();
      }

      const response = await authService.authFetch(CREATE_TRANSACTION_API, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Accept: "application/json",
        },

        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (response.status === 403) {
        const data = (await response.json()) as CreateTransactionResponse;

        throw new Error(
          data.message ||
            "This transaction cannot be manually assigned by Finance.",
        );
      }

      const data = (await response.json()) as CreateTransactionResponse;

      if (!response.ok || !data.success || !data.ticket) {
        throw new Error(
          data.message || "Unable to create the student Finance transaction.",
        );
      }

      setCreatedTicket(data.ticket);

      setSuccessMessage(
        data.message || "Student Finance transaction created successfully.",
      );

      /*
       * Keep student selected so Finance can quickly
       * assign another transaction to the same student.
       */
      setSelectedTransactionCode("");

      setAmountDue("");

      setRemarks("");
    } catch (error) {
      console.error("CREATE STUDENT FINANCE TRANSACTION ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create the student Finance transaction.",
      );
    } finally {
      setSubmitting(false);
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
                Finance
              </div>

              <h1
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "28px",
                }}
              >
                Create Student Transaction
              </h1>

              <p
                style={{
                  margin: "8px 0 0",
                  maxWidth: "760px",
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                Assign a Finance transaction to a specific student. The system
                will automatically generate one Finance ticket for the
                transaction.
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
                flexShrink: 0,
              }}
            >
              <CreditCard size={31} />
            </div>
          </div>
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
            SUCCESS
        ================================================= */}

        {successMessage && createdTicket && (
          <section
            style={{
              padding: "22px",
              border: "1px solid #bbf7d0",
              borderRadius: "16px",
              background: "#f0fdf4",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "11px",
                marginBottom: "17px",
              }}
            >
              <CheckCircle2
                size={24}
                color="#15803d"
                style={{
                  flexShrink: 0,
                }}
              />

              <div>
                <h2
                  style={{
                    margin: 0,
                    color: "#14532d",
                    fontSize: "18px",
                  }}
                >
                  Transaction Created
                </h2>

                <p
                  style={{
                    margin: "5px 0 0",
                    color: "#166534",
                    fontSize: "13px",
                  }}
                >
                  {successMessage}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "11px",
              }}
            >
              <InfoBox
                label="Finance Ticket"
                value={createdTicket.ticket_number}
                icon={<ReceiptText size={13} />}
              />

              <InfoBox
                label="Student"
                value={`${createdTicket.student.student_number} — ${createdTicket.student.student_name}`}
                icon={<UserRound size={13} />}
              />

              <InfoBox
                label="Transaction"
                value={createdTicket.transaction.transaction_name}
              />

              <InfoBox
                label="Amount Due"
                value={formatMoney(createdTicket.payment.amount_due)}
                icon={<CircleDollarSign size={13} />}
              />

              <InfoBox
                label="Payment Status"
                value={createdTicket.payment.payment_status}
              />

              <InfoBox
                label="Registrar"
                value={createdTicket.registrar.status}
              />
            </div>

            <div
              style={{
                marginTop: "15px",
                padding: "11px 13px",
                borderRadius: "10px",
                background: "#dcfce7",
                color: "#166534",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              The student can now see this ticket in their{" "}
              <strong>My Transactions</strong> page. Payment is still pending
              until Finance receives and records the payment.
            </div>
          </section>
        )}

        {/* =================================================
            CREATE TRANSACTION FORM
        ================================================= */}

        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: "20px",
          }}
        >
          {/* ===============================================
              STEP 1 — STUDENT
          =============================================== */}

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
                gap: "10px",
                marginBottom: "18px",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "11px",
                  background: "#f0fdf4",
                  color: "#15803d",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 850,
                }}
              >
                1
              </div>

              <div>
                <h2
                  style={{
                    margin: 0,
                    color: "#0f172a",
                    fontSize: "18px",
                  }}
                >
                  Select Student
                </h2>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  Search using the student number or student name.
                </p>
              </div>
            </div>

            {selectedStudent ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "14px",
                  padding: "16px",
                  border: "1px solid #bbf7d0",
                  borderRadius: "13px",
                  background: "#f0fdf4",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "12px",
                      background: "#dcfce7",
                      color: "#15803d",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <UserRound size={21} />
                  </div>

                  <div>
                    <div
                      style={{
                        color: "#0f172a",
                        fontWeight: 800,
                      }}
                    >
                      {selectedStudent.student_name}
                    </div>

                    <div
                      style={{
                        marginTop: "3px",
                        color: "#64748b",
                        fontSize: "12px",
                      }}
                    >
                      {selectedStudent.student_number}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={clearStudent}
                  style={{
                    width: "34px",
                    height: "34px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "9px",
                    background: "#ffffff",
                    color: "#64748b",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                  }}
                  title="Change student"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  position: "relative",
                }}
              >
                <Search
                  size={18}
                  color="#94a3b8"
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "14px",
                    pointerEvents: "none",
                  }}
                />

                <input
                  type="search"
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                  placeholder="Search student number or name..."
                  autoComplete="off"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: "46px",
                    padding: "11px 44px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "11px",
                    outline: "none",
                    fontFamily: "inherit",
                    color: "#0f172a",
                  }}
                />

                {searchingStudents && (
                  <Loader2
                    size={17}
                    color="#64748b"
                    style={{
                      position: "absolute",
                      right: "14px",
                      top: "14px",
                    }}
                  />
                )}

                {studentResults.length > 0 && (
                  <div
                    style={{
                      marginTop: "8px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      background: "#ffffff",
                      overflow: "hidden",
                      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.09)",
                    }}
                  >
                    {studentResults.map((student) => (
                      <button
                        key={student.student_id}
                        type="button"
                        onClick={() => selectStudent(student)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: "11px",
                          padding: "13px 15px",
                          border: "none",
                          borderBottom: "1px solid #f1f5f9",
                          background: "#ffffff",
                          textAlign: "left",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <UserRound size={18} color="#15803d" />

                        <div>
                          <div
                            style={{
                              color: "#0f172a",
                              fontSize: "13px",
                              fontWeight: 800,
                            }}
                          >
                            {student.student_name}
                          </div>

                          <div
                            style={{
                              marginTop: "2px",
                              color: "#64748b",
                              fontSize: "11px",
                            }}
                          >
                            {student.student_number}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {studentSearchMessage && (
                  <div
                    style={{
                      marginTop: "8px",
                      color: "#64748b",
                      fontSize: "12px",
                    }}
                  >
                    {studentSearchMessage}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ===============================================
              STEP 2 — TRANSACTION
          =============================================== */}

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
                gap: "10px",
                marginBottom: "18px",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "11px",
                  background: "#f0fdf4",
                  color: "#15803d",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 850,
                }}
              >
                2
              </div>

              <div>
                <h2
                  style={{
                    margin: 0,
                    color: "#0f172a",
                    fontSize: "18px",
                  }}
                >
                  Select Transaction
                </h2>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  Only manual Finance-only transaction types are available.
                </p>
              </div>
            </div>

            <label
              style={{
                display: "grid",
                gap: "7px",
                color: "#334155",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Transaction Type
              <select
                value={selectedTransactionCode}
                onChange={(event) =>
                  handleTransactionTypeChange(event.target.value)
                }
                disabled={loadingTypes || submitting}
                required
                style={{
                  width: "100%",
                  minHeight: "45px",
                  padding: "10px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  background: "#ffffff",
                  color: "#0f172a",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              >
                <option value="">
                  {loadingTypes
                    ? "Loading transaction types..."
                    : transactionTypes.length === 0
                      ? "No manual Finance transaction types available"
                      : "Select transaction type"}
                </option>

                {transactionTypes.map((item) => (
                  <option
                    key={item.transaction_type_id}
                    value={item.transaction_code}
                  >
                    {item.transaction_name} ({item.transaction_code})
                  </option>
                ))}
              </select>
            </label>

            {selectedTransactionType && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "14px",
                  borderRadius: "11px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    color: "#0f172a",
                    fontSize: "13px",
                    fontWeight: 800,
                  }}
                >
                  {selectedTransactionType.transaction_name}
                </div>

                {selectedTransactionType.description && (
                  <p
                    style={{
                      margin: "5px 0 0",
                      color: "#64748b",
                      fontSize: "12px",
                      lineHeight: 1.55,
                    }}
                  >
                    {selectedTransactionType.description}
                  </p>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "10px",
                  }}
                >
                  <span
                    style={{
                      padding: "5px 8px",
                      borderRadius: "999px",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontSize: "10px",
                      fontWeight: 800,
                    }}
                  >
                    FINANCE ONLY
                  </span>

                  <span
                    style={{
                      padding: "5px 8px",
                      borderRadius: "999px",
                      background: "#f0fdf4",
                      color: "#166534",
                      fontSize: "10px",
                      fontWeight: 800,
                    }}
                  >
                    {selectedTransactionType.allow_amount_override
                      ? "AMOUNT CAN BE OVERRIDDEN"
                      : "FIXED AMOUNT"}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* ===============================================
              STEP 3 — AMOUNT / REMARKS
          =============================================== */}

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
                gap: "10px",
                marginBottom: "18px",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "11px",
                  background: "#f0fdf4",
                  color: "#15803d",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 850,
                }}
              >
                3
              </div>

              <div>
                <h2
                  style={{
                    margin: 0,
                    color: "#0f172a",
                    fontSize: "18px",
                  }}
                >
                  Amount and Remarks
                </h2>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  Confirm the amount before assigning the transaction.
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              <label
                style={{
                  display: "grid",
                  gap: "7px",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                Amount Due
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amountDue}
                  onChange={(event) => setAmountDue(event.target.value)}
                  disabled={
                    submitting ||
                    !selectedTransactionType ||
                    (selectedTransactionType.default_amount !== null &&
                      !selectedTransactionType.allow_amount_override)
                  }
                  placeholder="Enter amount"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: "45px",
                    padding: "10px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    background:
                      selectedTransactionType &&
                      !selectedTransactionType.allow_amount_override
                        ? "#f8fafc"
                        : "#ffffff",
                    color: "#0f172a",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                {selectedTransactionType && (
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: "11px",
                      fontWeight: 500,
                      lineHeight: 1.45,
                    }}
                  >
                    {selectedTransactionType.default_amount === null
                      ? "No default amount is configured. Finance must enter the amount."
                      : selectedTransactionType.allow_amount_override
                        ? `Default amount: ${formatMoney(
                            selectedTransactionType.default_amount,
                          )}. Finance may override it.`
                        : `Fixed configured amount: ${formatMoney(
                            selectedTransactionType.default_amount,
                          )}.`}
                  </span>
                )}
              </label>

              <label
                style={{
                  display: "grid",
                  gap: "7px",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                Finance Remarks
                <textarea
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  maxLength={500}
                  rows={4}
                  disabled={submitting}
                  placeholder="Optional remarks about this transaction..."
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    resize: "vertical",
                    padding: "11px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    outline: "none",
                    fontFamily: "inherit",
                    color: "#0f172a",
                  }}
                />
              </label>
            </div>
          </section>

          {/* ===============================================
              SUBMIT
          =============================================== */}

          <section
            style={{
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "9px",
                color: "#64748b",
                maxWidth: "650px",
                fontSize: "12px",
                lineHeight: 1.55,
              }}
            >
              <FileText
                size={17}
                color="#15803d"
                style={{
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              />

              <span>
                Creating the transaction generates exactly one Finance ticket.
                The payment starts as <strong>Pending Payment</strong> and
                Registrar remains <strong>Not Applicable</strong> because
                manually assigned transactions are Finance-only.
              </span>
            </div>

            <button
              type="submit"
              disabled={
                submitting || !selectedStudent || !selectedTransactionType
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                minWidth: "210px",
                padding: "12px 18px",
                border: 0,
                borderRadius: "10px",
                background:
                  submitting || !selectedStudent || !selectedTransactionType
                    ? "#86a993"
                    : "#15803d",
                color: "#ffffff",
                fontWeight: 800,
                cursor: submitting
                  ? "wait"
                  : !selectedStudent || !selectedTransactionType
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={17} />
                  Creating...
                </>
              ) : (
                <>
                  <ReceiptText size={17} />
                  Create Transaction
                </>
              )}
            </button>
          </section>
        </form>
      </main>
    </DashboardLayout>
  );
}
