import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import signalsRouter from "./signals.js";
import dataRouter from "./data.js";
import webhookRouter from "./webhook.js";
import configRouter from "./config.js";
import scannerRouter from "./scanner.js";
import mt5Router from "./mt5.js";
import riskRouter from "./risk.js";
import observabilityRouter from "./observability.js";
import backtestRouter from "./backtest.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(signalsRouter);
router.use(dataRouter);
router.use(webhookRouter);
router.use(configRouter);
router.use(scannerRouter);
router.use("/mt5", mt5Router);
router.use("/risk", riskRouter);
router.use("/observability", observabilityRouter);
router.use("/backtesting", backtestRouter);

export default router;
