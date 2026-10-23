import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env.js";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", routes);
app.use(errorHandler);

export default app;
