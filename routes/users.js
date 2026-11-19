
import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db.js";
import { verifyJWT, requireRole } from "../lib/auth-middleware.js";
const router = Router();

// Get all customers
router.get("/", verifyJWT, requireRole("admin"), async (req, res) => {
  try {
    const db = getDb();

    const users = await db
      .collection("user")
      .find(
        { role: "customer" },
        {
          projection: {
            name: 1,
            email: 1,
            image: 1,
            role: 1,
            isBlocked: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: users,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to fetch users.",
    });
  }
});

// Block or unblock a customer
router.patch(
  "/:id/status",
  verifyJWT,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isBlocked } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          success: false,
          message: "Invalid user ID.",
        });
      }

      if (typeof isBlocked !== "boolean") {
        return res.status(400).send({
          success: false,
          message: "isBlocked must be true or false.",
        });
      }

      const db = getDb();
      const usersCollection = db.collection("user");

      const filter = {
        _id: new ObjectId(id),
        role: "customer",
      };

      const result = await usersCollection.updateOne(filter, {
        $set: { isBlocked },
      });

      if (result.matchedCount === 0) {
        return res.status(404).send({
          success: false,
          message: "Customer not found.",
        });
      }

      res.send({
        success: true,
        message: isBlocked
          ? "Customer blocked successfully."
          : "Customer unblocked successfully.",
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to update customer status.",
      });
    }
  }
);

export default router;
