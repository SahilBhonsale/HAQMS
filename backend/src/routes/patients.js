const express = require("express");
const { PrismaClient } = require("@prisma/client");
const {
  authenticate,
  authorizeAdminOnlyLegacy,
} = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/patients
// FIX 1: Replaced in-memory pagination with DB-level skip/take pagination.
// Original fetched ALL patients from DB into memory, then sliced the array in JS.
// With 100k patients, this means loading 100k records to return 5.
// DB pagination with skip/take only fetches the exact 5 records needed.
// Also moved search and gender filtering into the Prisma where clause (DB-level),
// so filtering also doesn't require loading all records.
router.get("/", authenticate, async (req, res) => {
  try {
    const { search, gender } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (gender && gender !== "All") {
      where.gender = { equals: gender, mode: "insensitive" };
    }

    // FIX: Run count and data fetch in parallel for better performance
    const [patients, totalPatients] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.patient.count({ where }),
    ]);

    res.json({
      success: true,
      patients,
      pagination: {
        page,
        limit,
        totalPatients,
        totalPages: Math.ceil(totalPatients / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch patients" });
  }
});

// GET /api/patients/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: { appointments: true },
    });
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json(patient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/patients
router.post("/", authenticate, async (req, res) => {
  try {
    const { name, email, phoneNumber, age, gender, medicalHistory } = req.body;

    if (!name || !phoneNumber || !age || !gender) {
      return res
        .status(400)
        .json({ error: "Name, phoneNumber, age, and gender are required." });
    }

    // FIX 2: Added basic phone number format validation.
    // Original accepted any string including "abc" as a phone number.
    // This regex allows digits, spaces, dashes, parentheses, and optional leading +.
    if (!/^\+?[\d\s\-().]{7,15}$/.test(phoneNumber)) {
      return res.status(400).json({ error: "Invalid phone number format." });
    }

    const patient = await prisma.patient.create({
      data: {
        name,
        email: email || null,
        phoneNumber,
        age: parseInt(age),
        gender,
        medicalHistory: medicalHistory || null,
      },
    });

    res.status(201).json(patient);
  } catch (error) {
    res.status(500).json({ error: "Failed to register patient" });
  }
});

// DELETE /api/patients/:id
// This route uses authorizeAdminOnlyLegacy which now properly enforces ADMIN role.
// Before the auth middleware fix, any logged-in user could delete patients.
router.delete(
  "/:id",
  authenticate,
  authorizeAdminOnlyLegacy,
  async (req, res) => {
    try {
      const { id } = req.params;
      const patient = await prisma.patient.findUnique({ where: { id } });
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      await prisma.patient.delete({ where: { id } });
      res.json({ message: `Successfully deleted patient ${patient.name}` });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete patient" });
    }
  }
);

module.exports = router;
