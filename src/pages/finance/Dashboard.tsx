import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Clock3, FileCheck2, ReceiptText } from "lucide-react";

import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import "../../styles/FinanceDashboard.css";

const FINANCE_DASHBOARD_API = "http://localhost:3000/api/finance/dashboard";

interface FinanceDashboardResponse {
  success?: boolean;
  message?: string;
  summary?: {
    pending_tickets?: number;
    completed_today?: number;
    waiting_for_registrar?: number;
  };
}

export default function FinanceDashboard() {
  const navigate = useNavigate();
  const session = authService.getSession();
  const token = authService.getToken();

  const [summary, setSummary] = useState({
    pending_tickets: 0,
    completed_today: 0,
    waiting_for_registrar: 0,
  });
  const [statusMessage, setStatusMessage] = useState(
    "Loading finance workspace...",
  );

  useEffect(() => {
    if (!session || !token || session.role !== "Finance") {
      navigate("/login", { replace: true });
      return;
    }

    const loadDashboard = async () => {
      try {
        const response = await authService.authFetch(FINANCE_DASHBOARD_API, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (response.status === 401) {
          authService.logout();
          navigate("/login", { replace: true });
          return;
        }

        if (response.status === 403) {
          navigate(authService.getDashboardRoute(session.role), {
            replace: true,
          });
          return;
        }

        const data = (await response.json()) as FinanceDashboardResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || "Unable to load the Finance dashboard.",
          );
        }

        setSummary({
          pending_tickets: Number(data.summary?.pending_tickets ?? 0),
          completed_today: Number(data.summary?.completed_today ?? 0),
          waiting_for_registrar: Number(
            data.summary?.waiting_for_registrar ?? 0,
          ),
        });
        setStatusMessage(data.message || "Finance workspace is ready.");
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Unable to load the Finance dashboard.",
        );
      }
    };

    void loadDashboard();
  }, [navigate, session, token]);

  if (!session || !token || session.role !== "Finance") {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="finance-dashboard">
        <section className="finance-dashboard__hero">
          <div>
            <p className="finance-dashboard__eyebrow">Finance Office</p>
            <h1>Finance Dashboard</h1>
            <p>
              This workspace will manage one ticket per student transaction
              before completed requests are forwarded to the Registrar.
            </p>
          </div>
          <ReceiptText size={42} aria-hidden="true" />
        </section>

        <section
          className="finance-dashboard__cards"
          aria-label="Finance summary"
        >
          <article className="finance-dashboard__card">
            <Clock3 size={24} aria-hidden="true" />
            <div>
              <span>Pending Tickets</span>
              <strong>{summary.pending_tickets}</strong>
            </div>
          </article>

          <article className="finance-dashboard__card">
            <CheckCircle2 size={24} aria-hidden="true" />
            <div>
              <span>Completed Today</span>
              <strong>{summary.completed_today}</strong>
            </div>
          </article>

          <article className="finance-dashboard__card">
            <FileCheck2 size={24} aria-hidden="true" />
            <div>
              <span>Waiting for Registrar</span>
              <strong>{summary.waiting_for_registrar}</strong>
            </div>
          </article>
        </section>

        <section className="finance-dashboard__panel">
          <h2>Finance role connected</h2>
          <p>{statusMessage}</p>
          <p className="finance-dashboard__flow">
            Student / Faculty verification → Finance ticket → payment completed
            → Registrar action.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}
