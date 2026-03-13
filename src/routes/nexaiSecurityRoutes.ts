import express from "express";
import {
  checkAnomalies,
  getDashboardStats,
  getDeviceList,
  getSecurityEvents,
  getSecurityStatus,
  reportSecurityEvent,
  trackDeviceManually,
} from "../controllers/nexaiSecurityController";
import { authenticateToken } from "../middleware/authenticateToken";

const router = express.Router();

/**
 * @openapi
 * /nexai/security/report:
 *   post:
 *     summary: Report security event
 *     description: Client reports security events like integrity failures, root detection, etc.
 *     tags:
 *       - NexAI Security
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event_type
 *             properties:
 *               event_type:
 *                 type: string
 *                 description: Type of security event
 *                 example: integrity_fail
 *               details:
 *                 type: object
 *                 description: Event details
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Event timestamp
 *     responses:
 *       200:
 *         description: Event recorded successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post("/security/report", reportSecurityEvent);

/**
 * @openapi
 * /nexai/security/status:
 *   get:
 *     summary: Get device security status
 *     description: Query the security status of the current device
 *     tags:
 *       - NexAI Security
 *     responses:
 *       200:
 *         description: Device status retrieved successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get("/security/status", getSecurityStatus);

/**
 * @openapi
 * /nexai/security/anomalies:
 *   get:
 *     summary: Check for anomalies
 *     description: Check for multi-account and device switching anomalies (requires authentication)
 *     tags:
 *       - NexAI Security
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Anomaly check completed
 *       401:
 *         description: Authentication required
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get("/security/anomalies", authenticateToken, checkAnomalies);

/**
 * @openapi
 * /nexai/security/track:
 *   post:
 *     summary: Track device
 *     description: Manually track device information (requires authentication)
 *     tags:
 *       - NexAI Security
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Device tracked successfully
 *       401:
 *         description: Authentication required
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post("/security/track", authenticateToken, trackDeviceManually);

/**
 * @openapi
 * /nexai/security/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Get security dashboard statistics (requires admin authentication)
 *     tags:
 *       - NexAI Security
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *         description: Time range for statistics
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get("/security/stats", authenticateToken, getDashboardStats);

/**
 * @openapi
 * /nexai/security/devices:
 *   get:
 *     summary: Get device list
 *     description: Get device list with pagination and filtering (requires admin authentication)
 *     tags:
 *       - NexAI Security
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: riskLevel
 *         schema:
 *           type: string
 *         description: Filter by risk level
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Device list retrieved successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get("/security/devices", authenticateToken, getDeviceList);

/**
 * @openapi
 * /nexai/security/events:
 *   get:
 *     summary: Get security events
 *     description: Get security events with pagination and filtering (requires admin authentication)
 *     tags:
 *       - NexAI Security
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *         description: Filter by event type
 *       - in: query
 *         name: deviceFingerprint
 *         schema:
 *           type: string
 *         description: Filter by device fingerprint
 *     responses:
 *       200:
 *         description: Events retrieved successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get("/security/events", authenticateToken, getSecurityEvents);

export default router;
