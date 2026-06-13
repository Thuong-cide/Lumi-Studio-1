import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import studiosRouter from "./studios";
import photosRouter from "./photos";
import driveRouter from "./drive";
import publicRouter from "./public";
import deliverablesRouter from "./deliverables";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(studiosRouter);
router.use(photosRouter);
router.use(driveRouter);
router.use(publicRouter);
router.use(deliverablesRouter);

export default router;
