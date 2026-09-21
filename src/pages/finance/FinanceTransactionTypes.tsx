import { useCallback, useEffect, useMemo, useState } from "react";

import type { CSSProperties, FormEvent, ReactNode } from "react";

import { useNavigate } from "react-router-dom";

import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCcw,
  Save,
  Settings2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";

const TRANSACTION_TYPES_API =
  "http://localhost:3000/api/finance/tickets/transaction-types";

// ============================================================
// TYPES
// ============================================================

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

  created_at: string | null;
  updated_at: string | null;
}

interface TransactionTypesResponse {
  success?: boolean;
  code?: string;
  message?: string;

  transaction_types?: FinanceTransactionType[];
}

interface CreateTransactionTypeResponse {
  success?: boolean;
  code?: string;
  message?: string;

  transaction_type?: FinanceTransactionType;
}

interface AmountUpdateResponse {
  success?: boolean;
  code?: string;
  message?: string;

  transaction_type?: {
    transaction_type_id: number;
    transaction_code: string;
    transaction_name: string;
    default_amount: number;
  };
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
// WORKFLOW LABEL
// ============================================================

function getWorkflowLabel(workflowType: string) {
  if (workflowType === "FINANCE_ONLY") {
    return "Finance Only";
  }

  if (workflowType === "DOCUMENT_REQUEST") {
    return "Document Request";
  }

  if (workflowType === "INCOMPLETE_GRADE") {
    return "Incomplete Grade";
  }

  return workflowType
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ============================================================
// COMPONENT
// ============================================================

export default function FinanceTransactionTypes() {
  const navigate = useNavigate();

  const session = authService.getSession();

  const token = authService.getToken();

  const role = session?.role ?? null;

  const isFinance = role === "Finance" && Boolean(token);

  // ==========================================================
  // DATA
  // ==========================================================

  const [transactionTypes, setTransactionTypes] = useState<
    FinanceTransactionType[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  // ==========================================================
  // CREATE FORM
  // ==========================================================

  const [transactionCode, setTransactionCode] = useState("");

  const [transactionName, setTransactionName] = useState("");

  const [description, setDescription] = useState("");

  const [defaultAmount, setDefaultAmount] = useState("");

  const [allowAmountOverride, setAllowAmountOverride] = useState(true);

  const [creating, setCreating] = useState(false);

  // ==========================================================
  // AMOUNT EDITING
  // ==========================================================

  const [editingCode, setEditingCode] = useState<string | null>(null);

  const [editedAmount, setEditedAmount] = useState("");

  const [savingAmount, setSavingAmount] = useState(false);

  // ==========================================================
  // MESSAGES
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
  // LOAD TYPES
  // ==========================================================

  const loadTransactionTypes = useCallback(
    async (showLoading = true) => {
      if (!isFinance) {
        return;
      }

      if (showLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

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

        setTransactionTypes(
          Array.isArray(data.transaction_types) ? data.transaction_types : [],
        );
      } catch (error) {
        console.error("LOAD TRANSACTION TYPES ERROR:", error);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load Finance transaction types.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isFinance, navigate],
  );

  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    if (!isFinance) {
      return;
    }

    void loadTransactionTypes();
  }, [isFinance, loadTransactionTypes]);

  // ==========================================================
  // SUMMARY
  // ==========================================================

  const summary = useMemo(() => {
    return {
      total: transactionTypes.length,

      active: transactionTypes.filter((item) => item.is_active).length,

      manual: transactionTypes.filter(
        (item) =>
          item.is_active &&
          item.workflow_type === "FINANCE_ONLY" &&
          item.allow_manual_creation,
      ).length,

      system_workflow: transactionTypes.filter(
        (item) => item.workflow_type !== "FINANCE_ONLY",
      ).length,
    };
  }, [transactionTypes]);

  // ==========================================================
  // CREATE TRANSACTION TYPE
  // ==========================================================

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (creating) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const cleanedCode = transactionCode.trim();

    const cleanedName = transactionName.trim();

    const cleanedDescription = description.trim();

    if (!cleanedCode) {
      setErrorMessage("Transaction code is required.");

      return;
    }

    if (!cleanedName) {
      setErrorMessage("Transaction name is required.");

      return;
    }

    const parsedAmount =
      defaultAmount.trim() === "" ? null : Number(defaultAmount);

    if (
      parsedAmount !== null &&
      (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    ) {
      setErrorMessage("Default amount must be greater than zero.");

      return;
    }

    try {
      setCreating(true);

      const response = await authService.authFetch(TRANSACTION_TYPES_API, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Accept: "application/json",
        },

        body: JSON.stringify({
          transaction_code: cleanedCode,

          transaction_name: cleanedName,

          description: cleanedDescription || null,

          default_amount: parsedAmount,

          allow_amount_override: allowAmountOverride,
        }),
      });

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      const data = (await response.json()) as CreateTransactionTypeResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to create Finance transaction type.",
        );
      }

      setSuccessMessage(
        data.message || "Finance transaction type created successfully.",
      );

      setTransactionCode("");

      setTransactionName("");

      setDescription("");

      setDefaultAmount("");

      setAllowAmountOverride(true);

      await loadTransactionTypes(false);
    } catch (error) {
      console.error("CREATE TRANSACTION TYPE ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create Finance transaction type.",
      );
    } finally {
      setCreating(false);
    }
  };

  // ==========================================================
  // START AMOUNT EDIT
  // ==========================================================

  const beginAmountEdit = (item: FinanceTransactionType) => {
    setEditingCode(item.transaction_code);

    setEditedAmount(
      item.default_amount === null ? "" : String(item.default_amount),
    );

    setErrorMessage("");
    setSuccessMessage("");
  };

  // ==========================================================
  // SAVE AMOUNT
  // ==========================================================

  const saveAmount = async (item: FinanceTransactionType) => {
    if (savingAmount) {
      return;
    }

    const parsedAmount = Number(editedAmount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage("Default amount must be greater than zero.");

      return;
    }

    try {
      setSavingAmount(true);

      setErrorMessage("");
      setSuccessMessage("");

      const response = await authService.authFetch(
        `${TRANSACTION_TYPES_API}/${encodeURIComponent(
          item.transaction_code,
        )}/amount`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",

            Accept: "application/json",
          },

          body: JSON.stringify({
            default_amount: parsedAmount,
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

      const data = (await response.json()) as AmountUpdateResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update default amount.");
      }

      setSuccessMessage(data.message || "Default amount updated successfully.");

      setEditingCode(null);

      setEditedAmount("");

      await loadTransactionTypes(false);
    } catch (error) {
      console.error("UPDATE DEFAULT AMOUNT ERROR:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update default amount.",
      );
    } finally {
      setSavingAmount(false);
    }
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
                <Settings2 size={16} />
                Finance Configuration
              </div>

              <h1
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "28px",
                }}
              >
                Transaction Types
              </h1>

              <p
                style={{
                  margin: "8px 0 0",
                  maxWidth: "760px",
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                Configure reusable Finance transaction types and default amounts
                used when creating student Finance tickets.
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
              <WalletCards size={31} />
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
            label="Total Types"
            value={summary.total}
            icon={<ReceiptText size={21} />}
          />

          <SummaryCard
            label="Active Types"
            value={summary.active}
            icon={<CheckCircle2 size={21} />}
          />

          <SummaryCard
            label="Manual Finance Types"
            value={summary.manual}
            icon={<CircleDollarSign size={21} />}
          />

          <SummaryCard
            label="System Workflows"
            value={summary.system_workflow}
            icon={<ShieldCheck size={21} />}
          />
        </section>

        {/* =================================================
            MESSAGES
        ================================================= */}

        {errorMessage && (
          <section
            style={{
              display: "flex",
              gap: "10px",
              padding: "14px",
              border: "1px solid #fecaca",
              borderRadius: "11px",
              background: "#fef2f2",
              color: "#991b1b",
            }}
          >
            <AlertCircle size={18} />

            <span
              style={{
                fontSize: "13px",
              }}
            >
              {errorMessage}
            </span>
          </section>
        )}

        {successMessage && (
          <section
            style={{
              display: "flex",
              gap: "10px",
              padding: "14px",
              border: "1px solid #bbf7d0",
              borderRadius: "11px",
              background: "#f0fdf4",
              color: "#166534",
            }}
          >
            <CheckCircle2 size={18} />

            <span
              style={{
                fontSize: "13px",
              }}
            >
              {successMessage}
            </span>
          </section>
        )}

        {/* =================================================
            CREATE NEW TYPE
        ================================================= */}

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
              gap: "10px",
              alignItems: "center",
              marginBottom: "18px",
            }}
          >
            <Plus size={20} color="#15803d" />

            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  color: "#0f172a",
                }}
              >
                Create Transaction Type
              </h2>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                New types created here are Finance-only and may be manually
                assigned to students.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleCreate}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "15px",
            }}
          >
            <FieldLabel label="Transaction Code">
              <input
                value={transactionCode}
                onChange={(event) => setTransactionCode(event.target.value)}
                placeholder="Example: ID_REPLACEMENT"
                disabled={creating}
                style={inputStyle}
              />
            </FieldLabel>

            <FieldLabel label="Transaction Name">
              <input
                value={transactionName}
                onChange={(event) => setTransactionName(event.target.value)}
                placeholder="Example: ID Replacement"
                disabled={creating}
                style={inputStyle}
              />
            </FieldLabel>

            <FieldLabel label="Default Amount">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={defaultAmount}
                onChange={(event) => setDefaultAmount(event.target.value)}
                placeholder="Optional"
                disabled={creating}
                style={inputStyle}
              />
            </FieldLabel>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                alignSelf: "end",
                minHeight: "45px",
                color: "#334155",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={allowAmountOverride}
                onChange={(event) =>
                  setAllowAmountOverride(event.target.checked)
                }
                disabled={creating}
              />
              Allow amount override
            </label>

            <label
              style={{
                display: "grid",
                gap: "7px",
                gridColumn: "1 / -1",
                color: "#334155",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={255}
                disabled={creating}
                placeholder="Optional description..."
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
                disabled={creating}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "11px 18px",
                  border: 0,
                  borderRadius: "10px",
                  background: creating ? "#86a993" : "#15803d",
                  color: "#ffffff",
                  fontWeight: 800,
                  cursor: creating ? "wait" : "pointer",
                }}
              >
                {creating ? (
                  <>
                    <Loader2 size={17} />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={17} />
                    Create Type
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* =================================================
            LIST
        ================================================= */}

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
              alignItems: "center",
              gap: "14px",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  color: "#0f172a",
                }}
              >
                Configured Transaction Types
              </h2>

              <p
                style={{
                  margin: "5px 0 0",
                  color: "#64748b",
                  fontSize: "12px",
                }}
              >
                System workflows and Finance-created transaction types.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadTransactionTypes(false)}
              disabled={refreshing}
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
                cursor: refreshing ? "wait" : "pointer",
              }}
            >
              <RefreshCcw size={15} />

              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {loading ? (
            <div
              style={{
                minHeight: "170px",
                display: "grid",
                placeItems: "center",
                color: "#64748b",
              }}
            >
              <div
                style={{
                  display: "grid",
                  justifyItems: "center",
                  gap: "8px",
                }}
              >
                <Loader2 size={25} />
                Loading transaction types...
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "13px",
              }}
            >
              {transactionTypes.map((item) => {
                const isEditing = editingCode === item.transaction_code;

                return (
                  <article
                    key={item.transaction_type_id}
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
                        gap: "15px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          flex: "1 1 300px",
                        }}
                      >
                        <div
                          style={{
                            width: "42px",
                            height: "42px",
                            borderRadius: "11px",
                            background:
                              item.workflow_type === "FINANCE_ONLY"
                                ? "#eff6ff"
                                : "#f0fdf4",
                            color:
                              item.workflow_type === "FINANCE_ONLY"
                                ? "#2563eb"
                                : "#15803d",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          {item.workflow_type === "FINANCE_ONLY" ? (
                            <CircleDollarSign size={21} />
                          ) : (
                            <FileText size={21} />
                          )}
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
                              {item.transaction_name}
                            </strong>

                            <span
                              style={{
                                padding: "4px 7px",
                                borderRadius: "999px",
                                background: "#f1f5f9",
                                color: "#475569",
                                fontSize: "10px",
                                fontWeight: 800,
                              }}
                            >
                              {item.transaction_code}
                            </span>

                            <span
                              style={{
                                padding: "4px 7px",
                                borderRadius: "999px",
                                background: item.is_active
                                  ? "#dcfce7"
                                  : "#fee2e2",
                                color: item.is_active ? "#166534" : "#991b1b",
                                fontSize: "10px",
                                fontWeight: 800,
                              }}
                            >
                              {item.is_active ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </div>

                          <p
                            style={{
                              margin: "6px 0 0",
                              color: "#64748b",
                              fontSize: "12px",
                              lineHeight: 1.5,
                            }}
                          >
                            {item.description || "No description provided."}
                          </p>

                          <div
                            style={{
                              display: "flex",
                              gap: "7px",
                              flexWrap: "wrap",
                              marginTop: "9px",
                            }}
                          >
                            <Badge>
                              {getWorkflowLabel(item.workflow_type)}
                            </Badge>

                            {item.allow_manual_creation && (
                              <Badge>Manual Creation</Badge>
                            )}

                            <Badge>
                              {item.allow_amount_override
                                ? "Amount Override Allowed"
                                : "Fixed Amount"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          minWidth: "210px",
                        }}
                      >
                        <div
                          style={{
                            marginBottom: "5px",
                            color: "#64748b",
                            fontSize: "10px",
                            fontWeight: 800,
                            textTransform: "uppercase",
                          }}
                        >
                          Default Amount
                        </div>

                        {isEditing ? (
                          <div
                            style={{
                              display: "flex",
                              gap: "7px",
                            }}
                          >
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={editedAmount}
                              onChange={(event) =>
                                setEditedAmount(event.target.value)
                              }
                              style={{
                                ...inputStyle,
                                width: "130px",
                              }}
                            />

                            <button
                              type="button"
                              onClick={() => void saveAmount(item)}
                              disabled={savingAmount}
                              style={iconButtonStyle}
                              title="Save amount"
                            >
                              <Save size={16} />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div
                              style={{
                                color: "#0f172a",
                                fontSize: "17px",
                                fontWeight: 850,
                              }}
                            >
                              {formatMoney(item.default_amount)}
                            </div>

                            {item.is_active && (
                              <button
                                type="button"
                                onClick={() => beginAmountEdit(item)}
                                style={{
                                  marginTop: "6px",
                                  padding: 0,
                                  border: "none",
                                  background: "transparent",
                                  color: "#15803d",
                                  fontSize: "11px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                Edit Amount
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
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
  value: number;
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
            fontSize: "24px",
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

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
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

function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        padding: "4px 7px",
        borderRadius: "999px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        color: "#64748b",
        fontSize: "9px",
        fontWeight: 800,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

// ============================================================
// SHARED STYLES
// ============================================================

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

const iconButtonStyle: CSSProperties = {
  width: "42px",
  minWidth: "42px",

  height: "44px",

  display: "grid",

  placeItems: "center",

  border: "none",

  borderRadius: "10px",

  background: "#15803d",

  color: "#ffffff",

  cursor: "pointer",
};
