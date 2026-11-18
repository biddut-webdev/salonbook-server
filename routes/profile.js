
import { Router } from "express";
import multer from "multer";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db.js";
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }

    cb(null, true);
  },
});

// Always identify the user from the verified JWT.
// Never accept a user ID from the request body.
function getUserFilter(req) {
  const userId = req.user?.id || req.user?._id || req.user?.sub;

  if (!userId) {
    return null;
  }

  const filters = [{ _id: userId }];

  if (ObjectId.isValid(userId)) {
    filters.push({ _id: new ObjectId(userId) });
  }

  return { $or: filters };
}

// GET /api/profile/me
router.get("/me", verifyJWT, async (req, res, next) => {
  try {
    const filter = getUserFilter(req);

    if (!filter) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    const user = await getDb()
      .collection("user")
      .findOne(filter, {
        projection: {
          name: 1,
          email: 1,
          image: 1,
          phone: 1,
          role: 1,
          isBlocked: 1,
        },
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    return res.json({
      success: true,
      data: {
        name: user.name || "",
        email: user.email || "",
        image: user.image || "",
        phone: user.phone || "",
        role: user.role || "customer",
        isBlocked: user.isBlocked || false,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/profile/me
router.patch("/me", verifyJWT, async (req, res, next) => {
  try {
    const filter = getUserFilter(req);

    if (!filter) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user.",
      });
    }

    const { name, image, phone } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 60
    ) {
      return res.status(400).json({
        success: false,
        message: "Name must be between 1 and 60 characters.",
      });
    }

    if (
      typeof image !== "string" ||
      image.length > 2000 ||
      (image && !/^https:\/\/.+/i.test(image))
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid HTTPS profile image URL.",
      });
    }

    if (
      typeof phone !== "string" ||
      phone.trim().length > 20
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid phone number.",
      });
    }

    // Only these three fields can be updated.
    // role, isBlocked and email are intentionally excluded.
    const updateData = {
      name: name.trim(),
      image: image.trim(),
      phone: phone.trim(),
      updatedAt: new Date(),
    };

    const result = await getDb()
      .collection("user")
      .updateOne(filter, { $set: updateData });

    if (!result.matchedCount) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      data: updateData,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/profile/upload-image
router.post(
  "/upload-image",
  verifyJWT,
  upload.single("image"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select an image.",
        });
      }

      const apiKey = process.env.IMGBB_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          success: false,
          message: "ImgBB API key is not configured.",
        });
      }

      const formData = new FormData();
      formData.append("image", req.file.buffer.toString("base64"));

      const response = await fetch(
        `https://api.imgbb.com/1/upload?key=${apiKey}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        return res.status(502).json({
          success: false,
          message: "Image upload failed. Please try again.",
        });
      }

      return res.json({
        success: true,
        imageUrl: result.data.url,
        message: "Image uploaded successfully.",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
