import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/student-dashboard.css";
import {
  CheckCircle,
  Clock,
  BookOpen,
  Megaphone,
  Calendar,
  FileText,
  User,
  Award,
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
      <div className="student-dashboard">
        <div className="dashboard-header">
          <div className="header-content">
            <div>
              <h1>Welcome, {user.email}!</h1>
              <p>
                Student Portal - View your schedule, grades, announcements, and
                admission status
              </p>
            </div>
            <div className="header-stats">
              <div className="header-stat">
                <Award size={20} />
                <span>GPA: 3.85</span>
              </div>
              <div className="header-stat">
                <BookOpen size={20} />
                <span>45 Credits</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Info Cards */}
        <div className="info-grid">
          <div className="info-card success">
            <div className="info-icon">
              <CheckCircle size={28} />
            </div>
            <div className="info-content">
              <h3>Admission Status</h3>
              <p className="info-status">Approved</p>
              <small>Confirmed on March 15, 2026</small>
            </div>
          </div>

          <div className="info-card warning">
            <div className="info-icon">
              <Clock size={28} />
            </div>
            <div className="info-content">
              <h3>Entrance Exam</h3>
              <p className="info-status">Scheduled</p>
              <small>March 25, 2026 at 10:00 AM</small>
            </div>
          </div>

          <div className="info-card info">
            <div className="info-icon">
              <Award size={28} />
            </div>
            <div className="info-content">
              <h3>GPA</h3>
              <p className="info-status">3.85</p>
              <small>Current Semester</small>
            </div>
          </div>

          <div className="info-card primary">
            <div className="info-icon">
              <Megaphone size={28} />
            </div>
            <div className="info-content">
              <h3>New Announcements</h3>
              <p className="info-status">5</p>
              <small>Unread messages</small>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-section">
          <h2>Quick Access</h2>
          <div className="action-grid">
            <button
              className="quick-action primary"
              onClick={() => navigate("/student/schedule")}
            >
              <Calendar size={24} />
              <span className="action-label">View Schedule</span>
            </button>

            <button
              className="quick-action secondary"
              onClick={() => navigate("/student/records")}
            >
              <FileText size={24} />
              <span className="action-label">View Grades</span>
            </button>

            <button
              className="quick-action accent"
              onClick={() => navigate("/student/announcements")}
            >
              <Megaphone size={24} />
              <span className="action-label">Announcements</span>
            </button>

            <button
              className="quick-action info"
              onClick={() => navigate("/student/profile")}
            >
              <User size={24} />
              <span className="action-label">My Profile</span>
            </button>
          </div>
        </div>

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

        {/* Recent Announcements */}
        <div className="dashboard-section">
          <h2>Recent Announcements</h2>
          <div className="announcements-list">
            <div className="announcement-item">
              <div className="announcement-date">Mar 21</div>
              <div className="announcement-content">
                <h4>Midterm Examination Schedule Released</h4>
                <p>
                  Check the academic portal for the complete midterm exam
                  schedule for this semester.
                </p>
              </div>
            </div>

            <div className="announcement-item">
              <div className="announcement-date">Mar 19</div>
              <div className="announcement-content">
                <h4>Library Extended Hours</h4>
                <p>
                  The library will be open until 10:00 PM on weekdays during
                  exam season.
                </p>
              </div>
            </div>

            <div className="announcement-item">
              <div className="announcement-date">Mar 17</div>
              <div className="announcement-content">
                <h4>Student Services Office Closed</h4>
                <p>
                  The Student Services office will be closed on March 24 for
                  maintenance.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Academic Information */}
        <div className="dashboard-section">
          <h2>Academic Information</h2>
          <div className="info-boxes">
            <div className="info-box">
              <h3>Current Semester</h3>
              <p className="value">2nd Semester, 2025-2026</p>
            </div>
            <div className="info-box">
              <h3>Total Credits</h3>
              <p className="value">45 Units</p>
            </div>
            <div className="info-box">
              <h3>Status</h3>
              <p className="value active">Active</p>
            </div>
            <div className="info-box">
              <h3>Tuition Fee</h3>
              <p className="value success">Paid</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
