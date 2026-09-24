import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FilePenLine,
  GraduationCap,
  History,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import "../../../styles/GradeChangeRequestsR.css";

const API_BASE_URL =
  "http://localhost:3000/api/registrar/grade-change-requests";

type RegistrarRequestStatus = "For Registrar Processing" | "Completed";

interface GradeSnapshot {
  midterm_grade: number | null;
  final_grade: number | null;
  overall_percentage: number | null;
  final_rating: number | null;
  grading_outcome: string | null;
  remarks: string | null;
  outcome_reason: string | null;
}

interface RegistrarGradeChangeRequest {
  grade_change_request_id: number;
  grade_id: number;
  request_type: string;
  status: RegistrarRequestStatus;
  completion_remarks: string;
  requested_at: string | null;
  review_remarks: string | null;
  reviewed_at: string | null;
  reviewed_by_username: string | null;
  processed_at: string | null;
  processed_by_username: string | null;
  registrar_remarks: string | null;

  student: {
    student_id: number | null;
    student_number: string;
    full_name: string;
  };

  class: {
    offering_id: number | null;
    enrollment_subject_id: number | null;
    subject: {
      subject_id: number | null;
      subject_code: string;
      subject_name: string;
    };
    section: {
      section_id: number | null;
      section_name: string;
    };
  };

  faculty: {
    faculty_id: number | null;
    employee_number: string | null;
    faculty_name: string;
  };

  original_grade: GradeSnapshot;
  proposed_grade: GradeSnapshot;
}

interface QueueResponse {
  success?: boolean;
  message?: string;
  error?: string;
  requests?: unknown[];
  grade_change_requests?: unknown[];
}

interface ProcessResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

interface ActionNotice {
  type: "success" | "error";
  message: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function buildGradeSnapshot(
  raw: Record<string, unknown>,
  nestedKey: string,
  prefix: "old" | "new",
): GradeSnapshot {
  const nested = asRecord(raw[nestedKey]);

  return {
    midterm_grade:
      asNumber(nested.midterm_grade) ??
      asNumber(raw[`${prefix}_midterm_grade`]),
    final_grade:
      asNumber(nested.final_grade) ?? asNumber(raw[`${prefix}_final_grade`]),
    overall_percentage:
      asNumber(nested.overall_percentage) ??
      asNumber(raw[`${prefix}_overall_percentage`]),
    final_rating:
      asNumber(nested.final_rating) ?? asNumber(raw[`${prefix}_final_rating`]),
    grading_outcome:
      asNullableString(nested.grading_outcome) ??
      asNullableString(raw[`${prefix}_grading_outcome`]),
    remarks:
      asNullableString(nested.remarks) ??
      asNullableString(raw[`${prefix}_remarks`]),
    outcome_reason:
      asNullableString(nested.outcome_reason) ??
      asNullableString(raw[`${prefix}_outcome_reason`]),
  };
}

function normalizeRequest(value: unknown): RegistrarGradeChangeRequest | null {
  const raw = asRecord(value);
  const requestId = asNumber(raw.grade_change_request_id);
  const gradeId = asNumber(raw.grade_id);
  const status = asString(raw.status);

  if (
    requestId === null ||
    gradeId === null ||
    (status !== "For Registrar Processing" && status !== "Completed")
  ) {
    return null;
  }

  const studentRaw = asRecord(raw.student);
  const classRaw = asRecord(raw.class);
  const subjectRaw = asRecord(classRaw.subject);
  const sectionRaw = asRecord(classRaw.section);
  const facultyRaw = asRecord(raw.faculty);
  const requestedByRaw = asRecord(raw.requested_by);
  const reviewedByRaw = asRecord(raw.reviewed_by);
  const processedByRaw = asRecord(raw.processed_by);

  const firstName = asString(pick(studentRaw, "first_name"));
  const middleName = asString(pick(studentRaw, "middle_name"));
  const lastName = asString(pick(studentRaw, "last_name"));
  const joinedName = [firstName, middleName, lastName]
    .filter(Boolean)
    .join(" ");

  return {
    grade_change_request_id: requestId,
    grade_id: gradeId,
    request_type: asString(raw.request_type, "INC_COMPLETION"),
    status,
    completion_remarks: asString(
      raw.completion_remarks,
      "No remarks provided.",
    ),
    requested_at:
      asNullableString(raw.requested_at) ??
      asNullableString(requestedByRaw.requested_at),
    review_remarks:
      asNullableString(raw.review_remarks) ??
      asNullableString(reviewedByRaw.review_remarks),
    reviewed_at:
      asNullableString(raw.reviewed_at) ??
      asNullableString(reviewedByRaw.reviewed_at),
    reviewed_by_username:
      asNullableString(raw.reviewed_by_username) ??
      asNullableString(reviewedByRaw.username),
    processed_at:
      asNullableString(raw.processed_at) ??
      asNullableString(processedByRaw.processed_at),
    processed_by_username:
      asNullableString(raw.processed_by_username) ??
      asNullableString(processedByRaw.username),
    registrar_remarks: asNullableString(raw.registrar_remarks),

    student: {
      student_id: asNumber(studentRaw.student_id) ?? asNumber(raw.student_id),
      student_number:
        asString(studentRaw.student_number) ||
        asString(raw.student_number, "—"),
      full_name:
        asString(studentRaw.full_name) ||
        asString(studentRaw.student_name) ||
        asString(raw.student_name) ||
        joinedName ||
        "Student",
    },

    class: {
      offering_id: asNumber(classRaw.offering_id) ?? asNumber(raw.offering_id),
      enrollment_subject_id:
        asNumber(classRaw.enrollment_subject_id) ??
        asNumber(raw.enrollment_subject_id),
      subject: {
        subject_id: asNumber(subjectRaw.subject_id) ?? asNumber(raw.subject_id),
        subject_code:
          asString(subjectRaw.subject_code) || asString(raw.subject_code, "—"),
        subject_name:
          asString(subjectRaw.subject_name) ||
          asString(raw.subject_name, "Subject unavailable"),
      },
      section: {
        section_id: asNumber(sectionRaw.section_id) ?? asNumber(raw.section_id),
        section_name:
          asString(sectionRaw.section_name) || asString(raw.section_name, "—"),
      },
    },

    faculty: {
      faculty_id: asNumber(facultyRaw.faculty_id) ?? asNumber(raw.faculty_id),
      employee_number:
        asNullableString(facultyRaw.employee_number) ??
        asNullableString(raw.employee_number),
      faculty_name:
        asString(facultyRaw.faculty_name) ||
        asString(raw.faculty_name) ||
        asString(requestedByRaw.username, "Faculty"),
    },

    original_grade: buildGradeSnapshot(raw, "original_grade", "old"),
    proposed_grade: buildGradeSnapshot(raw, "proposed_grade", "new"),
  };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(
      `Server returned a non-JSON response (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  return response.json() as Promise<T>;
}

function formatGrade(value: number | null): string {
  return value === null ? "—" : Number(value).toFixed(2);
}

function formatPercentage(value: number | null): string {
  return value === null ? "—" : `${Number(value).toFixed(2)}%`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function outcomeLabel(value: string | null): string {
  if (value === "INCOMPLETE") return "Incomplete";
  if (value === "NUMERIC") return "Numeric";
  if (value === "UNOFFICIAL_DROP") return "Unofficial Drop";
  return value || "—";
}

export default function GradeChangeRequestsR() {
  const navigate = useNavigate();
  const session = authService.getSession();
  const token = authService.getToken();
  const authenticated = Boolean(session && token);
  const userRole = session?.role;

  const [statusFilter, setStatusFilter] = useState<RegistrarRequestStatus>(
    "For Registrar Processing",
  );
  const [requests, setRequests] = useState<RegistrarGradeChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [processRequest, setProcessRequest] =
    useState<RegistrarGradeChangeRequest | null>(null);
  const [registrarRemarks, setRegistrarRemarks] = useState("");
  const [processError, setProcessError] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  useEffect(() => {
    if (!authenticated) {
      authService.logout();
      navigate("/login", { replace: true });
      return;
    }

    if (userRole !== "Registrar" && session) {
      navigate(authService.getDashboardRoute(session.role), { replace: true });
    }
  }, [authenticated, userRole, session, navigate]);

  const loadRequests = useCallback(
    async (signal?: AbortSignal) => {
      try {
        if (refreshKey === 0) setLoading(true);
        else setRefreshing(true);

        setError("");

        const query =
          statusFilter === "For Registrar Processing"
            ? ""
            : `?status=${encodeURIComponent(statusFilter)}`;

        const response = await authService.authFetch(
          `${API_BASE_URL}${query}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            signal,
          },
        );

        const data = await readJsonResponse<QueueResponse>(response);

        if (response.status === 401) {
          authService.logout();
          navigate("/login", { replace: true });
          return;
        }

        if (response.status === 403) {
          throw new Error(data.message || "Registrar access is required.");
        }

        if (!response.ok || data.success === false) {
          throw new Error(
            data.message ||
              data.error ||
              "Unable to load grade change requests.",
          );
        }

        const rawRequests = Array.isArray(data.requests)
          ? data.requests
          : Array.isArray(data.grade_change_requests)
            ? data.grade_change_requests
            : [];

        setRequests(
          rawRequests
            .map(normalizeRequest)
            .filter(
              (request): request is RegistrarGradeChangeRequest =>
                request !== null,
            ),
        );
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        console.error("REGISTRAR GRADE CHANGE LOAD ERROR:", requestError);
        setRequests([]);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load grade change requests.",
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [navigate, refreshKey, statusFilter],
  );

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") return;

    const controller = new AbortController();
    void loadRequests(controller.signal);

    return () => controller.abort();
  }, [authenticated, userRole, loadRequests]);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return requests;

    return requests.filter((request) =>
      [
        request.student.student_number,
        request.student.full_name,
        request.class.subject.subject_code,
        request.class.subject.subject_name,
        request.class.section.section_name,
        request.faculty.faculty_name,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [requests, search]);

  const openProcessModal = (request: RegistrarGradeChangeRequest) => {
    if (request.status !== "For Registrar Processing") return;

    setProcessRequest(request);
    setRegistrarRemarks(
      "Approved INC completion was verified and posted to the official academic record.",
    );
    setProcessError("");
    setNotice(null);
  };

  const closeProcessModal = () => {
    if (processingId !== null) return;
    setProcessRequest(null);
    setRegistrarRemarks("");
    setProcessError("");
  };

  const processApprovedRequest = async () => {
    if (!processRequest) return;

    const remarks = registrarRemarks.trim();
    if (!remarks) {
      setProcessError("Registrar remarks are required.");
      return;
    }

    if (remarks.length > 1000) {
      setProcessError("Registrar remarks must not exceed 1000 characters.");
      return;
    }

    try {
      const requestId = processRequest.grade_change_request_id;
      setProcessingId(requestId);
      setProcessError("");

      const response = await authService.authFetch(
        `${API_BASE_URL}/${requestId}/process`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrar_remarks: remarks }),
        },
      );

      const data = await readJsonResponse<ProcessResponse>(response);

      if (response.status === 401) {
        authService.logout();
        navigate("/login", { replace: true });
        return;
      }

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message ||
            data.error ||
            "Unable to process grade change request.",
        );
      }

      setNotice({
        type: "success",
        message:
          data.message ||
          "INC completion grade change was posted to the official academic record.",
      });

      setProcessRequest(null);
      setRegistrarRemarks("");
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      console.error("REGISTRAR GRADE CHANGE PROCESS ERROR:", requestError);
      setProcessError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to process grade change request.",
      );
    } finally {
      setProcessingId(null);
    }
  };

  useEffect(() => {
    if (!processRequest) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && processingId === null) {
        closeProcessModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [processRequest, processingId]);

  if (!authenticated || userRole !== "Registrar") return null;

  return (
    <DashboardLayout>
      <main className="registrar-grade-change-page">
        <section className="registrar-grade-change-header">
          <div>
            <button
              type="button"
              className="registrar-grade-change-back"
              onClick={() => navigate("/registrar/dashboard")}
            >
              <ArrowLeft size={15} /> Dashboard
            </button>

            <div className="registrar-grade-change-eyebrow">
              <span>
                <FileCheck2 size={16} />
              </span>
              Registrar · Official Grade Changes
            </div>

            <h1>INC Completion Processing</h1>
            <p>
              Post Program Head-approved INC completion requests to the official
              academic record. Registrar processing does not recalculate the
              grade; it posts the already approved proposed values
              transactionally.
            </p>
          </div>

          <button
            type="button"
            className="registrar-grade-change-refresh"
            onClick={() => {
              setNotice(null);
              setRefreshKey((current) => current + 1);
            }}
            disabled={loading || refreshing || processingId !== null}
          >
            <RefreshCw
              size={16}
              className={refreshing ? "registrar-grade-change-spin" : ""}
            />
            {refreshing ? "Refreshing..." : "Refresh Queue"}
          </button>
        </section>

        {notice && (
          <section
            className={`registrar-grade-change-notice ${notice.type}`}
            role="status"
          >
            {notice.type === "success" ? (
              <CheckCircle2 size={19} />
            ) : (
              <AlertCircle size={19} />
            )}
            <div>
              <strong>
                {notice.type === "success"
                  ? "Official record updated"
                  : "Action failed"}
              </strong>
              <p>{notice.message}</p>
            </div>
          </section>
        )}

        <section className="registrar-grade-change-summary">
          <article
            className={
              statusFilter === "For Registrar Processing" ? "active" : ""
            }
          >
            <span>
              <ShieldCheck size={18} />
            </span>
            <div>
              <small>Current Queue</small>
              <strong>{loading ? "…" : requests.length}</strong>
              <p>{statusFilter}</p>
            </div>
          </article>

          <article>
            <span>
              <FilePenLine size={18} />
            </span>
            <div>
              <small>Workflow</small>
              <strong>INC</strong>
              <p>Approved grade completion</p>
            </div>
          </article>

          <article>
            <span>
              <BadgeCheck size={18} />
            </span>
            <div>
              <small>Registrar Rule</small>
              <strong>Post</strong>
              <p>No grade recalculation</p>
            </div>
          </article>
        </section>

        <section className="registrar-grade-change-filters">
          <div className="registrar-grade-change-search">
            <Search size={16} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, subject, section, or Faculty..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => {
              setSearch("");
              setNotice(null);
              setStatusFilter(event.target.value as RegistrarRequestStatus);
              setRefreshKey((current) => current + 1);
            }}
          >
            <option value="For Registrar Processing">
              For Registrar Processing
            </option>
            <option value="Completed">Completed History</option>
          </select>

          <button
            type="button"
            onClick={() => setSearch("")}
            disabled={!search}
          >
            <RotateCcw size={14} /> Clear Search
          </button>
        </section>

        {error && !loading && (
          <section className="registrar-grade-change-error" role="alert">
            <AlertCircle size={20} />
            <div>
              <strong>Grade change requests could not be loaded</strong>
              <p>{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
            >
              Try Again
            </button>
          </section>
        )}

        {loading && (
          <section className="registrar-grade-change-loading">
            <div className="registrar-grade-change-spinner" />
            <div>
              <strong>Loading grade change requests</strong>
              <span>Retrieving approved INC completion records...</span>
            </div>
          </section>
        )}

        {!loading && !error && filteredRequests.length === 0 && (
          <section className="registrar-grade-change-empty">
            {statusFilter === "Completed" ? (
              <History size={26} />
            ) : (
              <CheckCircle2 size={26} />
            )}
            <strong>
              {statusFilter === "Completed"
                ? "No completed INC grade changes found"
                : "No requests waiting for Registrar processing"}
            </strong>
            <p>
              {requests.length === 0
                ? statusFilter === "Completed"
                  ? "Completed INC completion transactions will appear here."
                  : "Program Head-approved INC completion requests will appear here."
                : "No requests match your current search."}
            </p>
          </section>
        )}

        {!loading && !error && filteredRequests.length > 0 && (
          <section className="registrar-grade-change-list">
            <header>
              <div>
                <span>Official Record Queue</span>
                <h2>{statusFilter}</h2>
                <p>
                  Verify the approved request details before posting the exact
                  proposed grade to the student's official record.
                </p>
              </div>
              <strong>
                {filteredRequests.length} request
                {filteredRequests.length === 1 ? "" : "s"}
              </strong>
            </header>

            <div className="registrar-grade-change-cards">
              {filteredRequests.map((request) => (
                <article
                  className="registrar-grade-change-card"
                  key={request.grade_change_request_id}
                >
                  <div className="registrar-grade-change-card-top">
                    <div className="registrar-grade-change-student">
                      <span>
                        <GraduationCap size={18} />
                      </span>
                      <div>
                        <strong>{request.student.full_name}</strong>
                        <p>{request.student.student_number}</p>
                        <small>
                          Request #{request.grade_change_request_id} · Grade #
                          {request.grade_id}
                        </small>
                      </div>
                    </div>

                    <span
                      className={`registrar-grade-change-status ${request.status === "Completed" ? "completed" : "pending"}`}
                    >
                      {request.status}
                    </span>
                  </div>

                  <div className="registrar-grade-change-context">
                    <div>
                      <BookOpenCheck size={15} />
                      <span>
                        <small>Subject</small>
                        <strong>{request.class.subject.subject_code}</strong>
                        <p>{request.class.subject.subject_name}</p>
                      </span>
                    </div>

                    <div>
                      <UserRound size={15} />
                      <span>
                        <small>Faculty</small>
                        <strong>{request.faculty.faculty_name}</strong>
                        <p>
                          {request.faculty.employee_number || "Faculty request"}
                        </p>
                      </span>
                    </div>

                    <div>
                      <Clock3 size={15} />
                      <span>
                        <small>Program Head Review</small>
                        <strong>
                          {request.reviewed_by_username || "Program Head"}
                        </strong>
                        <p>{formatDateTime(request.reviewed_at)}</p>
                      </span>
                    </div>
                  </div>

                  <div className="registrar-grade-change-comparison">
                    <section className="old">
                      <header>
                        <span>
                          <ShieldCheck size={16} />
                        </span>
                        <div>
                          <small>Current Official Record</small>
                          <strong>Approved INC</strong>
                        </div>
                      </header>

                      <div className="registrar-grade-change-grade-grid">
                        <div>
                          <small>Midterm</small>
                          <strong>
                            {formatGrade(request.original_grade.midterm_grade)}
                          </strong>
                        </div>
                        <div>
                          <small>Final</small>
                          <strong>
                            {formatGrade(request.original_grade.final_grade)}
                          </strong>
                        </div>
                        <div>
                          <small>Overall</small>
                          <strong>
                            {formatPercentage(
                              request.original_grade.overall_percentage,
                            )}
                          </strong>
                        </div>
                        <div>
                          <small>Rating</small>
                          <strong>
                            {formatGrade(request.original_grade.final_rating)}
                          </strong>
                        </div>
                        <div>
                          <small>Outcome</small>
                          <strong>
                            {outcomeLabel(
                              request.original_grade.grading_outcome,
                            )}
                          </strong>
                        </div>
                        <div>
                          <small>Remarks</small>
                          <strong>
                            {request.original_grade.remarks || "—"}
                          </strong>
                        </div>
                      </div>

                      <div className="registrar-grade-change-reason">
                        <small>INC Reason</small>
                        <p>
                          {request.original_grade.outcome_reason ||
                            "No reason recorded."}
                        </p>
                      </div>
                    </section>

                    <section className="new">
                      <header>
                        <span>
                          <FilePenLine size={16} />
                        </span>
                        <div>
                          <small>Program Head-Approved Proposal</small>
                          <strong>Ready for Posting</strong>
                        </div>
                      </header>

                      <div className="registrar-grade-change-grade-grid">
                        <div>
                          <small>Midterm</small>
                          <strong>
                            {formatGrade(request.proposed_grade.midterm_grade)}
                          </strong>
                        </div>
                        <div>
                          <small>Final</small>
                          <strong>
                            {formatGrade(request.proposed_grade.final_grade)}
                          </strong>
                        </div>
                        <div>
                          <small>Overall</small>
                          <strong>
                            {formatPercentage(
                              request.proposed_grade.overall_percentage,
                            )}
                          </strong>
                        </div>
                        <div>
                          <small>Rating</small>
                          <strong>
                            {formatGrade(request.proposed_grade.final_rating)}
                          </strong>
                        </div>
                        <div>
                          <small>Outcome</small>
                          <strong>
                            {outcomeLabel(
                              request.proposed_grade.grading_outcome,
                            )}
                          </strong>
                        </div>
                        <div>
                          <small>Remarks</small>
                          <strong>
                            {request.proposed_grade.remarks || "—"}
                          </strong>
                        </div>
                      </div>

                      <div className="registrar-grade-change-reason">
                        <small>Faculty Completion Remarks</small>
                        <p>{request.completion_remarks}</p>
                      </div>
                    </section>
                  </div>

                  <div className="registrar-grade-change-review-note">
                    <CheckCircle2 size={15} />
                    <div>
                      <strong>Program Head review</strong>
                      <p>
                        {request.review_remarks ||
                          "No review remarks recorded."}
                      </p>
                    </div>
                  </div>

                  {request.status === "Completed" && (
                    <div className="registrar-grade-change-completed-note">
                      <BadgeCheck size={15} />
                      <div>
                        <strong>
                          Processed by{" "}
                          {request.processed_by_username || "Registrar"}
                        </strong>
                        <p>
                          {request.registrar_remarks ||
                            "Official grade change completed."}
                        </p>
                        <small>{formatDateTime(request.processed_at)}</small>
                      </div>
                    </div>
                  )}

                  <footer className="registrar-grade-change-actions">
                    {request.status === "For Registrar Processing" ? (
                      <button
                        type="button"
                        onClick={() => openProcessModal(request)}
                        disabled={
                          processingId === request.grade_change_request_id
                        }
                      >
                        <FileCheck2 size={14} /> Process Official Grade Change
                      </button>
                    ) : (
                      <span>
                        <BadgeCheck size={14} /> Official grade change completed
                      </span>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          </section>
        )}

        {processRequest && (
          <div
            className="registrar-grade-change-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeProcessModal();
            }}
          >
            <section
              className="registrar-grade-change-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="registrar-grade-change-modal-title"
            >
              <header>
                <div>
                  <span>
                    <FileCheck2 size={18} />
                  </span>
                  <div>
                    <small>Registrar Processing</small>
                    <h2 id="registrar-grade-change-modal-title">
                      Post Approved INC Completion
                    </h2>
                    <p>
                      This will replace the current Approved INC with the exact
                      Program Head-approved numeric grade and update the
                      enrollment subject result.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeProcessModal}
                  disabled={processingId !== null}
                  aria-label="Close processing modal"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="registrar-grade-change-modal-summary">
                <div>
                  <small>Student</small>
                  <strong>{processRequest.student.full_name}</strong>
                  <span>{processRequest.student.student_number}</span>
                </div>
                <div>
                  <small>Subject</small>
                  <strong>{processRequest.class.subject.subject_code}</strong>
                  <span>{processRequest.class.subject.subject_name}</span>
                </div>
                <div>
                  <small>Approved Result</small>
                  <strong>
                    {formatGrade(processRequest.proposed_grade.final_rating)} —{" "}
                    {processRequest.proposed_grade.remarks || "—"}
                  </strong>
                  <span>
                    {formatPercentage(
                      processRequest.proposed_grade.overall_percentage,
                    )}
                  </span>
                </div>
              </div>

              <div className="registrar-grade-change-modal-warning">
                <ShieldCheck size={17} />
                <p>
                  Registrar does not change or recalculate the approved
                  proposal. Processing posts the existing approved values to the
                  official grade record and records the transaction in the audit
                  trail.
                </p>
              </div>

              <div className="registrar-grade-change-modal-field">
                <div>
                  <label htmlFor="registrar-grade-change-remarks">
                    Registrar Remarks
                  </label>
                  <span>{registrarRemarks.length}/1000</span>
                </div>
                <textarea
                  id="registrar-grade-change-remarks"
                  value={registrarRemarks}
                  onChange={(event) => setRegistrarRemarks(event.target.value)}
                  maxLength={1000}
                  rows={5}
                  disabled={processingId !== null}
                />

                {processError && (
                  <div
                    className="registrar-grade-change-modal-error"
                    role="alert"
                  >
                    <AlertCircle size={15} /> {processError}
                  </div>
                )}
              </div>

              <footer>
                <button
                  type="button"
                  className="cancel"
                  onClick={closeProcessModal}
                  disabled={processingId !== null}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="confirm"
                  onClick={() => void processApprovedRequest()}
                  disabled={processingId !== null}
                >
                  <FileCheck2 size={14} />
                  {processingId !== null
                    ? "Processing..."
                    : "Post Official Grade"}
                </button>
              </footer>
            </section>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
