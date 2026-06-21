import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import studiosRouter from "./studios";
import photosRouter from "./photos";
import driveRouter from "./drive";
import publicRouter from "./public";
import deliverablesRouter from "./deliverables";
import paymentRouter from "./payment";
import webhooksRouter from "./webhooks";
import { checkSubscription } from "../middlewares/checkSubscription";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(publicRouter);
router.use(webhooksRouter);
router.use(paymentRouter);

router.use("/studios", checkSubscription);
router.use("/drive", checkSubscription);

router.use(studiosRouter);
router.use(photosRouter);
router.use(driveRouter);
router.use(deliverablesRouter);

export default router;
