import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  GraduationCap,
  History,
  IdCard,
  Megaphone,
  RefreshCw,
  UserRound,
} from "lucide-react";

const SCHEDULE_API_URL =
  "http://localhost:3000/api/student/enrollments/schedule";

interface ScheduleSubject {
  enrollment_subject_id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  enrollment_type: string;
  status: string;

  section: {
    section_id: number | null;
    section_name: string | null;
  };

  offering: {
    offering_id: number | null;
    status: string | null;
    schedule_days: string | null;
    schedule_time: string | null;
  };

  faculty: {
    faculty_id: number | null;
    faculty_name: string | null;
  };

  schedule_ready?: boolean;
}

interface ScheduleResponse {
  success: boolean;
  message?: string;

  enrollment: {
    enrollment_id: number;
    academic_year_id: number;
    academic_year: string;
    semester_id: number;
    semester_name: string;
    enrollment_status: string;
    approved_at: string | null;
  } | null;

  subjects: ScheduleSubject[];
}

interface ApiErrorResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

interface TodayClass {
  enrollment_subject_id: number;
  subject_code: string;
  subject_name: string;
  section_name: string | null;
  faculty_name: string | null;
  start_minutes: number;
  end_minutes: number;
  start_label: string;
  duration_label: string;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function normalizeDay(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\./g, "");

  const aliases: Record<string, string> = {
    sun: "sunday",
    sunday: "sunday",
    mon: "monday",
    monday: "monday",
    tue: "tuesday",
    tues: "tuesday",
    tuesday: "tuesday",
    wed: "wednesday",
    wednesday: "wednesday",
    thu: "thursday",
    thur: "thursday",
    thurs: "thursday",
    thursday: "thursday",
    fri: "friday",
    friday: "friday",
    sat: "saturday",
    saturday: "saturday",
  };

  return aliases[normalized] || normalized;
}

function isScheduledToday(
  scheduleDays: string | null,
  todayName: string,
): boolean {
  if (!scheduleDays) {
    return false;
  }

  const targetDay = normalizeDay(todayName);

  return scheduleDays
    .split(/[,/&]+/)
    .map((day) => normalizeDay(day))
    .includes(targetDay);
}

function parseClockTime(value: string): number | null {
  const text = value.trim().toUpperCase().replace(/\s+/g, " ");

  let match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);

  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3];

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null;
    }

    if (meridiem === "AM") {
      if (hour === 12) {
        hour = 0;
      }
    } else if (hour !== 12) {
      hour += 12;
    }

    return hour * 60 + minute;
  }

  match = text.match(/^(\d{1,2}):(\d{2})$/);

  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return hour * 60 + minute;
  }

  match = text.match(/^(\d{1,2})$/);

  if (match) {
    const hour = Number(match[1]);

    if (hour < 0 || hour > 23) {
      return null;
    }

    return hour * 60;
  }

  return null;
}

function parseScheduleTimeRange(
  value: string | null,
): { start: number; end: number } | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/[–—]/g, "-");
  const parts = normalized.split(/\s*-\s*/);

  if (parts.length !== 2) {
    return null;
  }

  const start = parseClockTime(parts[0]);
  const end = parseClockTime(parts[1]);

  if (start === null || end === null || end <= start) {
    return null;
  }

  return { start, end };
}

function formatTime(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0",
  )} ${meridiem}`;
}

function formatDuration(start: number, end: number): string {
  const durationMinutes = end - start;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${minutes} min`;
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const user = authService.getSession();
  const isStudent = user?.role === "Student";

  const [scheduleData, setScheduleData] =
    useState<ScheduleResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");

  useEffect(() => {
    if (!isStudent) {
      navigate("/login", { replace: true });
    }
  }, [isStudent, navigate]);

  useEffect(() => {
    if (!isStudent) {
      return;
    }

    const controller = new AbortController();

    const loadTodaySchedule = async () => {
      try {
        setScheduleLoading(true);
        setScheduleError("");

        const response = await authService.authFetch(SCHEDULE_API_URL, {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        const responseData = (await response.json()) as
          | ScheduleResponse
          | ApiErrorResponse;

        if (response.status === 401) {
          authService.logout();
          navigate("/login", { replace: true });
          return;
        }

        if (response.status === 403) {
          throw new Error(
            responseData.message ||
              ("error" in responseData ? responseData.error : undefined) ||
              "You are not authorized to view the Student schedule.",
          );
        }

        if (!response.ok) {
          throw new Error(
            responseData.message ||
              ("error" in responseData ? responseData.error : undefined) ||
              `Schedule request failed (${response.status}).`,
          );
        }

        const data = responseData as ScheduleResponse;

        if (!data.success || !Array.isArray(data.subjects)) {
          throw new Error(
            data.message || "Invalid Student schedule response.",
          );
        }

        setScheduleData(data);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("LOAD DASHBOARD TODAY SCHEDULE ERROR:", error);

        setScheduleError(
          error instanceof Error
            ? error.message
            : "Unable to load today's official schedule.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setScheduleLoading(false);
        }
      }
    };

    void loadTodaySchedule();

    return () => {
      controller.abort();
    };
  }, [isStudent, navigate]);

  const todayClasses = useMemo<TodayClass[]>(() => {
    if (
      !scheduleData?.enrollment ||
      scheduleData.enrollment.enrollment_status !== "Approved"
    ) {
      return [];
    }

    const todayName = DAY_NAMES[new Date().getDay()];

    return (scheduleData.subjects || [])
      .filter((subject) => {
        return (
          subject.status === "Enrolled" &&
          subject.offering.status !== "Cancelled" &&
          isScheduledToday(subject.offering.schedule_days, todayName)
        );
      })
      .map((subject) => {
        const parsedTime = parseScheduleTimeRange(
          subject.offering.schedule_time,
        );

        if (!parsedTime) {
          return null;
        }

        return {
          enrollment_subject_id: subject.enrollment_subject_id,
          subject_code: subject.subject_code,
          subject_name: subject.subject_name,
          section_name: subject.section.section_name,
          faculty_name: subject.faculty.faculty_name,
          start_minutes: parsedTime.start,
          end_minutes: parsedTime.end,
          start_label: formatTime(parsedTime.start),
          duration_label: formatDuration(parsedTime.start, parsedTime.end),
        };
      })
      .filter((subject): subject is TodayClass => subject !== null)
      .sort((a, b) => a.start_minutes - b.start_minutes);
  }, [scheduleData]);

  if (!isStudent) {
    return null;
  }

  return (
    <DashboardLayout>
      <main className="student-dashboard">
        <section className="student-dashboard__hero">
          <div className="student-dashboard__hero-copy">
            <div className="student-dashboard__eyebrow">
              <span>
                <GraduationCap size={16} strokeWidth={2.2} />
              </span>
              Student · Dashboard
            </div>

            <h1>Welcome back, {displayName}</h1>

            <p>
              Review your enrollment, class schedule, academic records, and
              Student announcements from one organized workspace.
            </p>

            <div className="student-dashboard__identity-line">
              <span>{studentNumber}</span>
              {academicIdentity.length > 0 && <i />}
              {academicIdentity.length > 0 && (
                <span>{academicIdentity.join(" · ")}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="student-dashboard__refresh"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={16}
              className={refreshing ? "is-spinning" : ""}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {hasPartialError && !loading && (
          <section className="student-dashboard__notice" role="status">
            <CircleAlert size={18} />
            <div>
              <strong>Some dashboard information is unavailable</strong>
              <p>
                The rest of your Student dashboard is still available. Use the
                Refresh button to try loading the missing information again.
              </p>
            </div>
          </section>
        )}

        <section className="student-dashboard__overview" aria-label="Student overview">
          <article className="student-dashboard__stat student-dashboard__stat--primary">
            <span className="student-dashboard__stat-icon">
              <CheckCircle2 size={19} />
            </span>
            <div>
              <small>Enrollment Status</small>
              <strong className={`student-dashboard__status ${getStatusClass(enrollmentStatus)}`}>
                {loading ? "…" : enrollmentStatus}
              </strong>
              <span>Your current enrollment state</span>
            </div>
          </article>

          <article className="student-dashboard__stat">
            <span className="student-dashboard__stat-icon">
              <CalendarDays size={19} />
            </span>
            <div>
              <small>Current Period</small>
              <strong className="student-dashboard__stat-text">
                {loading ? "…" : currentPeriod}
              </strong>
              <span>Academic year and semester</span>
            </div>
          </article>

          <article className="student-dashboard__stat">
            <span className="student-dashboard__stat-icon">
              <Clock3 size={19} />
            </span>
            <div>
              <small>Today's Classes</small>
              <strong>{loading ? "…" : todayClasses.length}</strong>
              <span>{formatToday()}</span>
            </div>
          </article>

          <article className="student-dashboard__stat">
            <span className="student-dashboard__stat-icon">
              <Megaphone size={19} />
            </span>
            <div>
              <small>Announcements</small>
              <strong>{loading ? "…" : announcements.length}</strong>
              <span>Active notices for Students</span>
            </div>
          </article>
        </section>

        <section className="student-dashboard__quick-access">
          <header className="student-dashboard__section-heading">
            <div>
              <span>Student Services</span>
              <h2>Quick Access</h2>
              <p>Open the Student tools you use most often.</p>
            </div>
          </header>

          <div className="student-dashboard__quick-grid">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.path}
                  type="button"
                  className="student-dashboard__quick-card"
                  onClick={() => navigate(action.path)}
                >
                  <span className="student-dashboard__quick-icon">
                    <Icon size={20} strokeWidth={2.05} />
                  </span>

                  <span className="student-dashboard__quick-copy">
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </span>

                  <ArrowRight size={16} className="student-dashboard__quick-arrow" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Today's Schedule */}
        <div className="dashboard-section">
          <h2>Today's Schedule</h2>

          <div className="schedule-list">
            {scheduleLoading ? (
              <div className="schedule-item">
                <div className="schedule-details">
                  <h4>Loading today's schedule...</h4>
                </div>
              </div>
            ) : scheduleError ? (
              <div className="schedule-item">
                <div className="schedule-details">
                  <h4>Unable to load today's schedule</h4>
                  <p>{scheduleError}</p>
                </div>
              </div>
            ) : !scheduleData?.enrollment ? (
              <div className="schedule-item">
                <div className="schedule-details">
                  <h4>No official schedule available</h4>
                  <p>
                    Your class schedule will appear after your enrollment is
                    approved.
                  </p>
                </div>
              </div>
            ) : todayClasses.length === 0 ? (
              <div className="schedule-item">
                <div className="schedule-details">
                  <h4>No classes scheduled for today.</h4>
                  <p>
                    View the full Student Schedule for your weekly class
                    schedule.
                  </p>
                </div>
              </div>
            ) : (
              todayClasses.map((subject) => (
                <div
                  className="schedule-item"
                  key={subject.enrollment_subject_id}
                >
                  <div className="time">{subject.start_label}</div>

                  <div className="schedule-details">
                    <h4>
                      {subject.subject_code} - {subject.subject_name}
                    </h4>

                    <p>
                      {[
                        subject.section_name,
                        subject.faculty_name,
                      ]
                        .filter(Boolean)
                        .join(" | ") || "Official class"}
                    </p>
                  </div>

                  <div className="duration">
                    {subject.duration_label}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <section className="student-dashboard__academic">
          <header className="student-dashboard__section-heading">
            <div>
              <span>Student Record</span>
              <h2>Academic Information</h2>
              <p>Quick reference information from your Student profile.</p>
            </div>
          </header>

          <div className="student-dashboard__academic-grid">
            <div>
              <small>Program</small>
              <strong>
                {loading
                  ? "…"
                  : profile?.course?.course_code ||
                    profile?.course?.course_name ||
                    "Not recorded"}
              </strong>
            </div>

            <div>
              <small>Year Level</small>
              <strong>{loading ? "…" : formatYearLevel(profile?.year_level)}</strong>
            </div>

            <div>
              <small>Section</small>
              <strong>{loading ? "…" : profile?.section?.section_name || "Not recorded"}</strong>
            </div>

            <div>
              <small>Student Status</small>
              <strong>{loading ? "…" : profile?.student_status || "Not recorded"}</strong>
            </div>
          </div>

          <div className="student-dashboard__secondary-actions">
            {secondaryActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.path}
                  type="button"
                  onClick={() => navigate(action.path)}
                >
                  <span>
                    <Icon size={16} />
                  </span>
                  <strong>{action.title}</strong>
                  <ArrowRight size={14} />
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
