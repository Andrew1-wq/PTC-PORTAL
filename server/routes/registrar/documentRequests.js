// server/routes/registrar/documentRequests.js

import express from "express";
import db from "../../db.js";

const router = express.Router();

// ============================================================
// HELPERS
// ============================================================

function getRegistrarUserId(req, res) {
  if (!req.user || req.user.role_name !== "Registrar") {
    res.status(403).json({
      success: false,
      code: "REGISTRAR_ACCESS_REQUIRED",
      message: "Registrar access is required.",
    });

    return null;
  }

  const userId = Number(req.user.user_id);

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({
      success: false,
      code: "INVALID_AUTHENTICATED_USER",
      message: "Authenticated Registrar user ID is invalid.",
    });

    return null;
  }

  return userId;
}

function cleanTicketNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function cleanOptionalText(value, maxLength = 500) {
  if (value === undefined || value === null) {
    return null;
  }

  const cleaned = String(value).trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

// ============================================================
// GET REGISTRAR DOCUMENT REQUEST QUEUE
//
// GET /api/registrar/document-requests
//
// Shows document requests that already passed Finance.
//
// Finance must be Paid before Registrar can process.
// ============================================================

router.get("/", async (req, res) => {
  const registrarUserId = getRegistrarUserId(req, res);

  if (!registrarUserId) {
    return;
  }

  try {
    const [rows] = await db.execute(
      `
        SELECT
          ft.ticket_id,
          ft.ticket_number,

          ft.student_id,
          s.student_number,

          CONCAT_WS(
            ' ',
            s.first_name,
            NULLIF(s.middle_name, ''),
            s.last_name
          ) AS student_name,

          ftt.transaction_code,
          ftt.transaction_name,

          ft.document_request_id,

          sdr.request_number,
          sdr.document_type,
          sdr.purpose,
          sdr.copies,
          sdr.requested_at,

          ft.amount_due,
          ft.amount_paid,
          ft.payment_method,
          ft.receipt_number,
          ft.payment_status,
          ft.paid_at,

          ft.registrar_status,
          ft.registrar_remarks,
          ft.registrar_processed_by,
          ft.registrar_started_at,
          ft.registrar_completed_at,

          ft.created_at,
          ft.updated_at

        FROM finance_tickets ft

        INNER JOIN students s
          ON s.student_id = ft.student_id

        INNER JOIN finance_transaction_types ftt
          ON ftt.transaction_type_id =
             ft.transaction_type_id

        INNER JOIN student_document_requests sdr
          ON sdr.request_id =
             ft.document_request_id

        WHERE ft.document_request_id IS NOT NULL
          AND ft.payment_status = 'Paid'
          AND ft.registrar_status IN (
            'Ready for Processing',
            'Processing',
            'Done'
          )

        ORDER BY
          CASE ft.registrar_status
            WHEN 'Ready for Processing' THEN 1
            WHEN 'Processing' THEN 2
            WHEN 'Done' THEN 3
            ELSE 4
          END,
          ft.paid_at ASC,
          ft.ticket_id ASC
      `,
    );

    const requests = rows.map((row) => ({
      ticket_id: Number(row.ticket_id),
      ticket_number: row.ticket_number,

      student: {
        student_id: Number(row.student_id),
        student_number: row.student_number,
        student_name: row.student_name,
      },

      transaction: {
        transaction_code: row.transaction_code,
        transaction_name: row.transaction_name,
      },

      document_request: {
        request_id: Number(row.document_request_id),
        request_number: row.request_number,
        document_type: row.document_type,
        purpose: row.purpose,
        copies: Number(row.copies ?? 1),
        requested_at: row.requested_at,
      },

      payment: {
        amount_due: row.amount_due === null ? null : Number(row.amount_due),

        amount_paid: Number(row.amount_paid ?? 0),

        payment_method: row.payment_method,
        receipt_number: row.receipt_number,
        payment_status: row.payment_status,
        paid_at: row.paid_at,
      },

      registrar: {
        status: row.registrar_status,
        remarks: row.registrar_remarks,

        processed_by:
          row.registrar_processed_by === null
            ? null
            : Number(row.registrar_processed_by),

        started_at: row.registrar_started_at,
        completed_at: row.registrar_completed_at,
      },

      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return res.status(200).json({
      success: true,
      code: "REGISTRAR_DOCUMENT_REQUESTS_RETRIEVED",
      requests,
    });
  } catch (error) {
    console.error("GET REGISTRAR DOCUMENT REQUESTS ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "REGISTRAR_DOCUMENT_REQUESTS_LOAD_FAILED",
      message: "Failed to load Registrar document requests.",
    });
  }
});

// ============================================================
// GET ONE DOCUMENT REQUEST
//
// GET
// /api/registrar/document-requests/:ticketNumber
// ============================================================

router.get("/:ticketNumber", async (req, res) => {
  const registrarUserId = getRegistrarUserId(req, res);

  if (!registrarUserId) {
    return;
  }

  const ticketNumber = cleanTicketNumber(req.params.ticketNumber);

  if (!ticketNumber) {
    return res.status(400).json({
      success: false,
      code: "TICKET_NUMBER_REQUIRED",
      message: "Ticket number is required.",
    });
  }

  try {
    const [rows] = await db.execute(
      `
        SELECT
          ft.ticket_id,
          ft.ticket_number,

          ft.student_id,
          s.student_number,

          CONCAT_WS(
            ' ',
            s.first_name,
            NULLIF(s.middle_name, ''),
            s.last_name
          ) AS student_name,

          ftt.transaction_code,
          ftt.transaction_name,

          ft.document_request_id,

          sdr.request_number,
          sdr.document_type,
          sdr.purpose,
          sdr.copies,
          sdr.requested_at,
          sdr.cancelled_at,
          sdr.cancellation_reason,

          ft.amount_due,
          ft.amount_paid,
          ft.payment_method,
          ft.receipt_number,
          ft.payment_status,
          ft.paid_by,
          ft.paid_at,

          ft.registrar_status,
          ft.registrar_remarks,
          ft.registrar_processed_by,
          ft.registrar_started_at,
          ft.registrar_completed_at,

          ft.created_at,
          ft.updated_at

        FROM finance_tickets ft

        INNER JOIN students s
          ON s.student_id = ft.student_id

        INNER JOIN finance_transaction_types ftt
          ON ftt.transaction_type_id =
             ft.transaction_type_id

        INNER JOIN student_document_requests sdr
          ON sdr.request_id =
             ft.document_request_id

        WHERE ft.ticket_number = ?
          AND ft.document_request_id IS NOT NULL

        LIMIT 1
      `,
      [ticketNumber],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: "REGISTRAR_DOCUMENT_REQUEST_NOT_FOUND",
        message: "Registrar document request was not found.",
      });
    }

    const row = rows[0];

    return res.status(200).json({
      success: true,
      code: "REGISTRAR_DOCUMENT_REQUEST_RETRIEVED",

      request: {
        ticket_id: Number(row.ticket_id),
        ticket_number: row.ticket_number,

        student: {
          student_id: Number(row.student_id),
          student_number: row.student_number,
          student_name: row.student_name,
        },

        transaction: {
          transaction_code: row.transaction_code,
          transaction_name: row.transaction_name,
        },

        document_request: {
          request_id: Number(row.document_request_id),
          request_number: row.request_number,
          document_type: row.document_type,
          purpose: row.purpose,
          copies: Number(row.copies ?? 1),
          requested_at: row.requested_at,
          cancelled_at: row.cancelled_at,
          cancellation_reason: row.cancellation_reason,
        },

        payment: {
          amount_due: row.amount_due === null ? null : Number(row.amount_due),

          amount_paid: Number(row.amount_paid ?? 0),
          payment_method: row.payment_method,
          receipt_number: row.receipt_number,
          payment_status: row.payment_status,

          paid_by: row.paid_by === null ? null : Number(row.paid_by),

          paid_at: row.paid_at,
        },

        registrar: {
          status: row.registrar_status,
          remarks: row.registrar_remarks,

          processed_by:
            row.registrar_processed_by === null
              ? null
              : Number(row.registrar_processed_by),

          started_at: row.registrar_started_at,
          completed_at: row.registrar_completed_at,
        },

        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  } catch (error) {
    console.error("GET REGISTRAR DOCUMENT REQUEST ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "REGISTRAR_DOCUMENT_REQUEST_LOAD_FAILED",
      message: "Failed to load the Registrar document request.",
    });
  }
});

// ============================================================
// START PROCESSING
//
// PATCH
// /api/registrar/document-requests/:ticketNumber/start
//
// Allowed transition:
//
// Ready for Processing
//        ↓
// Processing
// ============================================================

router.patch("/:ticketNumber/start", async (req, res) => {
  const registrarUserId = getRegistrarUserId(req, res);

  if (!registrarUserId) {
    return;
  }

  const ticketNumber = cleanTicketNumber(req.params.ticketNumber);

  if (!ticketNumber) {
    return res.status(400).json({
      success: false,
      code: "TICKET_NUMBER_REQUIRED",
      message: "Ticket number is required.",
    });
  }

  const remarks = cleanOptionalText(req.body?.remarks);

  let connection;
  let transactionActive = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionActive = true;

    const [rows] = await connection.execute(
      `
          SELECT
            ft.ticket_id,
            ft.ticket_number,
            ft.document_request_id,
            ft.payment_status,
            ft.registrar_status,

            sdr.request_number,
            sdr.document_type,

            s.student_number,

            CONCAT_WS(
              ' ',
              s.first_name,
              NULLIF(s.middle_name, ''),
              s.last_name
            ) AS student_name

          FROM finance_tickets ft

          INNER JOIN students s
            ON s.student_id = ft.student_id

          INNER JOIN student_document_requests sdr
            ON sdr.request_id =
               ft.document_request_id

          WHERE ft.ticket_number = ?
            AND ft.document_request_id IS NOT NULL

          LIMIT 1

          FOR UPDATE
        `,
      [ticketNumber],
    );

    if (rows.length === 0) {
      await connection.rollback();

      transactionActive = false;

      return res.status(404).json({
        success: false,
        code: "REGISTRAR_DOCUMENT_REQUEST_NOT_FOUND",
        message: "Registrar document request was not found.",
      });
    }

    const ticket = rows[0];

    // Payment must already be complete.
    if (ticket.payment_status !== "Paid") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "PAYMENT_NOT_COMPLETED",
        message:
          "Registrar processing cannot begin until Finance marks the ticket Paid.",
      });
    }

    if (ticket.registrar_status === "Processing") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "REQUEST_ALREADY_PROCESSING",
        message: "This document request is already being processed.",
      });
    }

    if (ticket.registrar_status === "Done") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "REQUEST_ALREADY_COMPLETED",
        message: "This document request has already been completed.",
      });
    }

    if (ticket.registrar_status !== "Ready for Processing") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "INVALID_REGISTRAR_STATUS",
        message: `Request cannot start processing from status ${ticket.registrar_status}.`,
      });
    }

    await connection.execute(
      `
          UPDATE finance_tickets

          SET
            registrar_status = 'Processing',
            registrar_processed_by = ?,
            registrar_started_at = NOW(),
            registrar_remarks = ?

          WHERE ticket_id = ?
        `,
      [registrarUserId, remarks, Number(ticket.ticket_id)],
    );

    await connection.commit();

    transactionActive = false;

    return res.status(200).json({
      success: true,
      code: "REGISTRAR_PROCESSING_STARTED",

      message: "Registrar processing has started.",

      request: {
        ticket_id: Number(ticket.ticket_id),
        ticket_number: ticket.ticket_number,

        request_number: ticket.request_number,

        document_type: ticket.document_type,

        student_number: ticket.student_number,

        student_name: ticket.student_name,

        payment_status: "Paid",

        registrar_status: "Processing",

        registrar_processed_by: registrarUserId,
      },
    });
  } catch (error) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("REGISTRAR START ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("START REGISTRAR PROCESSING ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "REGISTRAR_START_PROCESSING_FAILED",
      message: "Failed to start Registrar processing.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ============================================================
// MARK DOCUMENT REQUEST DONE
//
// PATCH
// /api/registrar/document-requests/:ticketNumber/complete
//
// Allowed transition:
//
// Processing
//    ↓
// Done
//
// Finance payment is NOT changed here.
// ============================================================

router.patch("/:ticketNumber/complete", async (req, res) => {
  const registrarUserId = getRegistrarUserId(req, res);

  if (!registrarUserId) {
    return;
  }

  const ticketNumber = cleanTicketNumber(req.params.ticketNumber);

  if (!ticketNumber) {
    return res.status(400).json({
      success: false,
      code: "TICKET_NUMBER_REQUIRED",
      message: "Ticket number is required.",
    });
  }

  const remarks = cleanOptionalText(req.body?.remarks);

  let connection;
  let transactionActive = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionActive = true;

    const [rows] = await connection.execute(
      `
          SELECT
            ft.ticket_id,
            ft.ticket_number,
            ft.document_request_id,
            ft.payment_status,
            ft.registrar_status,
            ft.registrar_processed_by,

            sdr.request_number,
            sdr.document_type,

            s.student_number,

            CONCAT_WS(
              ' ',
              s.first_name,
              NULLIF(s.middle_name, ''),
              s.last_name
            ) AS student_name

          FROM finance_tickets ft

          INNER JOIN students s
            ON s.student_id = ft.student_id

          INNER JOIN student_document_requests sdr
            ON sdr.request_id =
               ft.document_request_id

          WHERE ft.ticket_number = ?
            AND ft.document_request_id IS NOT NULL

          LIMIT 1

          FOR UPDATE
        `,
      [ticketNumber],
    );

    if (rows.length === 0) {
      await connection.rollback();

      transactionActive = false;

      return res.status(404).json({
        success: false,
        code: "REGISTRAR_DOCUMENT_REQUEST_NOT_FOUND",
        message: "Registrar document request was not found.",
      });
    }

    const ticket = rows[0];

    if (ticket.payment_status !== "Paid") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "PAYMENT_NOT_COMPLETED",
        message:
          "This document request cannot be completed because payment is not Paid.",
      });
    }

    if (ticket.registrar_status === "Done") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "REQUEST_ALREADY_COMPLETED",
        message: "This document request has already been completed.",
      });
    }

    if (ticket.registrar_status !== "Processing") {
      await connection.rollback();

      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "REQUEST_NOT_PROCESSING",
        message:
          "The document request must be Processing before it can be marked Done.",
      });
    }

    await connection.execute(
      `
          UPDATE finance_tickets

          SET
            registrar_status = 'Done',
            registrar_remarks =
              COALESCE(?, registrar_remarks),
            registrar_processed_by =
              COALESCE(registrar_processed_by, ?),
            registrar_completed_at = NOW()

          WHERE ticket_id = ?
        `,
      [remarks, registrarUserId, Number(ticket.ticket_id)],
    );

    await connection.commit();

    transactionActive = false;

    return res.status(200).json({
      success: true,
      code: "REGISTRAR_DOCUMENT_REQUEST_COMPLETED",

      message: "Document request has been completed by the Registrar.",

      request: {
        ticket_id: Number(ticket.ticket_id),
        ticket_number: ticket.ticket_number,

        request_number: ticket.request_number,

        document_type: ticket.document_type,

        student_number: ticket.student_number,

        student_name: ticket.student_name,

        payment_status: "Paid",

        registrar_status: "Done",

        registrar_processed_by:
          ticket.registrar_processed_by === null
            ? registrarUserId
            : Number(ticket.registrar_processed_by),
      },
    });
  } catch (error) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("REGISTRAR COMPLETE ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("COMPLETE REGISTRAR DOCUMENT REQUEST ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "REGISTRAR_COMPLETE_REQUEST_FAILED",
      message: "Failed to complete the Registrar document request.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;
