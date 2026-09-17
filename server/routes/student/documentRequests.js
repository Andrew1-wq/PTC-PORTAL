// server/routes/student/documentRequests.js

import crypto from "node:crypto";
import express from "express";
import db from "../../db.js";

const router = express.Router();

const ALLOWED_DOCUMENT_TYPES = new Set(["COR", "COG"]);

function cleanOptionalText(value, maxLength) {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

function temporaryRequestNumber(documentType) {
  return `TMP-${documentType}-${Date.now()}-${crypto
    .randomBytes(6)
    .toString("hex")}`;
}

function publicNumber(prefix, documentType, year, id) {
  return `${prefix}-${documentType}-${year}-${String(id).padStart(6, "0")}`;
}

// ============================================================
// GET MY DOCUMENT REQUESTS
//
// GET /api/student/document-requests
//
// Parent route security:
//   /api/student -> authenticate -> requireRole("Student")
//
// Returns only requests belonging to the authenticated student.
// ============================================================

router.get("/", async (req, res) => {
  try {
    if (!req.user || req.user.role_name !== "Student") {
      return res.status(403).json({
        success: false,
        code: "STUDENT_ACCESS_REQUIRED",
        message: "Student access is required.",
      });
    }

    const userId = Number(req.user.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        code: "INVALID_AUTHENTICATED_USER",
        message: "Authenticated user ID is invalid.",
      });
    }

    const [studentRows] = await db.execute(
      `
        SELECT
          student_id
        FROM students
        WHERE user_id = ?
        LIMIT 1
      `,
      [userId],
    );

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        code: "STUDENT_PROFILE_NOT_FOUND",
        message: "No Student profile is connected to this account.",
      });
    }

    const studentId = Number(studentRows[0].student_id);

    const [rows] = await db.execute(
      `
        SELECT
          sdr.request_id,
          sdr.request_number,
          sdr.document_type,
          sdr.purpose,
          sdr.copies,
          sdr.requested_at,
          sdr.cancelled_at,
          sdr.cancellation_reason,

          ft.ticket_id,
          ft.ticket_number,
          ft.amount_due,
          ft.amount_paid,
          ft.payment_method,
          ft.receipt_number,
          ft.payment_status,
          ft.registrar_status,
          ft.paid_at,
          ft.registrar_started_at,
          ft.registrar_completed_at,
          ft.created_at AS ticket_created_at

        FROM student_document_requests sdr

        INNER JOIN finance_tickets ft
          ON ft.document_request_id = sdr.request_id

        WHERE sdr.student_id = ?

        ORDER BY sdr.request_id DESC
      `,
      [studentId],
    );

    return res.status(200).json({
      success: true,
      code: "DOCUMENT_REQUESTS_RETRIEVED",
      requests: rows,
    });
  } catch (error) {
    console.error("GET STUDENT DOCUMENT REQUESTS ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "DOCUMENT_REQUESTS_LOAD_FAILED",
      message: "Failed to load document requests.",
    });
  }
});

// ============================================================
// CREATE COR / COG REQUEST + AUTOMATIC FINANCE TICKET
//
// POST /api/student/document-requests
//
// Body:
// {
//   "document_type": "COR" | "COG",
//   "purpose": "Optional purpose",
//   "copies": 1
// }
//
// IMPORTANT:
// - Student identity comes ONLY from req.user.
// - Frontend does NOT send student_id or user_id.
// - Document request + Finance ticket are created inside
//   ONE database transaction.
// - Finance payment starts as "Pending Payment".
// - Registrar status starts as "Pending".
// - Finance does NOT manually create COR/COG tickets.
// ============================================================

router.post("/", async (req, res) => {
  if (!req.user || req.user.role_name !== "Student") {
    return res.status(403).json({
      success: false,
      code: "STUDENT_ACCESS_REQUIRED",
      message: "Student access is required.",
    });
  }

  const userId = Number(req.user.user_id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({
      success: false,
      code: "INVALID_AUTHENTICATED_USER",
      message: "Authenticated user ID is invalid.",
    });
  }

  const documentType = String(req.body?.document_type || "")
    .trim()
    .toUpperCase();

  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    return res.status(400).json({
      success: false,
      code: "INVALID_DOCUMENT_TYPE",
      message: "Document type must be COR or COG.",
    });
  }

  const purpose = cleanOptionalText(req.body?.purpose, 255);

  const rawCopies =
    req.body?.copies === undefined || req.body?.copies === null
      ? 1
      : Number(req.body.copies);

  if (!Number.isInteger(rawCopies) || rawCopies < 1) {
    return res.status(400).json({
      success: false,
      code: "INVALID_COPY_COUNT",
      message: "Copies must be a whole number greater than or equal to 1.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // --------------------------------------------------------
    // 1. Resolve authenticated Student account
    // --------------------------------------------------------

    const [studentRows] = await connection.execute(
      `
        SELECT
          s.student_id,
          s.student_number,
          s.first_name,
          s.middle_name,
          s.last_name
        FROM students s
        WHERE s.user_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [userId],
    );

    if (studentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        code: "STUDENT_PROFILE_NOT_FOUND",
        message: "No Student profile is connected to this account.",
      });
    }

    const student = studentRows[0];
    const studentId = Number(student.student_id);

    // --------------------------------------------------------
    // 2. Load active Finance transaction type
    // --------------------------------------------------------

    const [typeRows] = await connection.execute(
      `
        SELECT
          transaction_type_id,
          transaction_code,
          transaction_name,
          default_amount
        FROM finance_transaction_types
        WHERE transaction_code = ?
          AND is_active = 1
        LIMIT 1
      `,
      [documentType],
    );

    if (typeRows.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        code: "TRANSACTION_TYPE_UNAVAILABLE",
        message: `${documentType} requests are currently unavailable.`,
      });
    }

    const transactionType = typeRows[0];

    // --------------------------------------------------------
    // 3. Prevent duplicate active request
    //
    // Student cannot request another COR/COG of same type
    // while previous request is still active.
    //
    // Student can request again when previous request is:
    // - Done
    // - Rejected
    // - Cancelled
    // --------------------------------------------------------

    const [activeRows] = await connection.execute(
      `
        SELECT
          sdr.request_id,
          sdr.request_number,
          ft.ticket_number,
          ft.payment_status,
          ft.registrar_status

        FROM student_document_requests sdr

        INNER JOIN finance_tickets ft
          ON ft.document_request_id = sdr.request_id

        WHERE sdr.student_id = ?
          AND sdr.document_type = ?
          AND sdr.cancelled_at IS NULL
          AND ft.payment_status NOT IN ('Cancelled', 'Refunded')
          AND ft.registrar_status NOT IN (
            'Done',
            'Rejected',
            'Cancelled'
          )

        ORDER BY sdr.request_id DESC

        LIMIT 1
        FOR UPDATE
      `,
      [studentId, documentType],
    );

    if (activeRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        code: "ACTIVE_DOCUMENT_REQUEST_EXISTS",
        message: `You already have an active ${documentType} request.`,
        request: activeRows[0],
      });
    }

    // --------------------------------------------------------
    // 4. Create Student document request
    // --------------------------------------------------------

    const tempRequestNumber = temporaryRequestNumber(documentType);

    const [requestResult] = await connection.execute(
      `
        INSERT INTO student_document_requests
        (
          request_number,
          student_id,
          document_type,
          purpose,
          copies
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [tempRequestNumber, studentId, documentType, purpose, rawCopies],
    );

    const requestId = Number(requestResult.insertId);

    const year = new Date().getFullYear();

    const requestNumber = publicNumber("REQ", documentType, year, requestId);

    await connection.execute(
      `
        UPDATE student_document_requests
        SET request_number = ?
        WHERE request_id = ?
      `,
      [requestNumber, requestId],
    );

    // --------------------------------------------------------
    // 5. Automatically create Finance ticket
    //
    // This is the Ticket ID the student presents
    // to the cashier.
    // --------------------------------------------------------

    const ticketNumber = publicNumber("FIN", documentType, year, requestId);

    const amountDue =
      transactionType.default_amount === null ||
      transactionType.default_amount === undefined
        ? null
        : Number(transactionType.default_amount);

    const [ticketResult] = await connection.execute(
      `
        INSERT INTO finance_tickets
        (
          ticket_number,
          student_id,
          transaction_type_id,
          document_request_id,
          grade_id,
          amount_due,
          amount_paid,
          payment_status,
          registrar_status,
          created_by
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          NULL,
          ?,
          0.00,
          'Pending Payment',
          'Pending',
          ?
        )
      `,
      [
        ticketNumber,
        studentId,
        Number(transactionType.transaction_type_id),
        requestId,
        amountDue,
        userId,
      ],
    );

    const ticketId = Number(ticketResult.insertId);

    // --------------------------------------------------------
    // 6. Commit both request and Finance ticket
    // --------------------------------------------------------

    await connection.commit();

    const studentName = [
      student.first_name,
      student.middle_name,
      student.last_name,
    ]
      .filter(Boolean)
      .join(" ");

    return res.status(201).json({
      success: true,
      code: "DOCUMENT_REQUEST_CREATED",

      message:
        `${documentType} request created successfully. ` +
        `Present the Finance ticket to the Cashier for payment.`,

      request: {
        request_id: requestId,
        request_number: requestNumber,
        document_type: documentType,
        purpose,
        copies: rawCopies,
      },

      ticket: {
        ticket_id: ticketId,
        ticket_number: ticketNumber,
        transaction_type: documentType,
        amount_due: amountDue,
        amount_paid: 0,
        payment_status: "Pending Payment",
        registrar_status: "Pending",
      },

      student: {
        student_id: studentId,
        student_number: student.student_number,
        student_name: studentName,
      },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("CREATE DOCUMENT REQUEST ROLLBACK ERROR:", rollbackError);
    }

    console.error("CREATE STUDENT DOCUMENT REQUEST ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "DOCUMENT_REQUEST_CREATE_FAILED",
      message: "Failed to create the document request and Finance ticket.",
    });
  } finally {
    connection.release();
  }
});

export default router;
