import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { validate, createDiagramSchema, createSubjectAreaSchema, updateSubjectAreaSchema } from "../../lib/validation.js";
import * as ctrl from "./controller.js";

const router = Router();

router.get("/", authenticate, ctrl.list);
router.post("/", authenticate, validate(createDiagramSchema), ctrl.create);
router.get("/public/:uid", ctrl.getPublic);
router.put("/:uid/share", authenticate, ctrl.updateShare);
router.put("/:uid/project", authenticate, ctrl.moveToProject);
router.get("/:uid/subject-areas", authenticate, ctrl.listSubjectAreas);
router.post("/:uid/subject-areas", authenticate, validate(createSubjectAreaSchema), ctrl.createSubjectArea);
router.put("/:uid/subject-areas/:areaId", authenticate, validate(updateSubjectAreaSchema), ctrl.updateSubjectArea);
router.delete("/:uid/subject-areas/:areaId", authenticate, ctrl.deleteSubjectArea);
router.get("/:uid", authenticate, ctrl.get);
router.put("/:uid", authenticate, ctrl.update);
router.delete("/:uid", authenticate, ctrl.remove);
router.post("/:uid/restore", authenticate, ctrl.restore);
router.delete("/:uid/permanent", authenticate, ctrl.permanentDelete);
router.post("/save/:uid", authenticate, ctrl.save);
router.post("/fetch-schema", authenticate, ctrl.fetchSchema);
router.post("/test-db-connection", authenticate, ctrl.testDbConnection);

export default router;
