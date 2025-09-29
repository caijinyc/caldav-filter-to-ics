import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import { getFilteredCal } from "./index.mjs";
import { FILTER_CONFIG } from "./FILTER_CONFIG.mjs";

// 加载本地 .env 配置
dotenv.config();

let cachedICS = null;

// 日志文件路径
const LOG_FILE_PATH = "api-requests.log";

// 请求日志中间件
function requestLogger(req, res, next) {
  const timestamp = new Date().toISOString();
  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    req.connection.remoteAddress ||
    req.ip;
  const method = req.method;
  const path = req.path;
  const userAgent = req.get("user-agent") || "unknown";

  const logEntry = `${timestamp} | ${ip} | ${method} ${path} | ${userAgent}\n`;

  if (!fs.existsSync(LOG_FILE_PATH)) {
    fs.writeFileSync(LOG_FILE_PATH, "");
  }

  const logFileSize = fs.statSync(LOG_FILE_PATH).size;

  // 异步写入日志，不阻塞请求处理，当文件超过  20MB，重置文件
  if (logFileSize > 10 * 1024 * 1024) {
    fs.writeFileSync(LOG_FILE_PATH, "");
  }

  fs.appendFile(LOG_FILE_PATH, logEntry, (err) => {
    if (err) {
      console.error("❌ Error writing to log file:", err);
    }
  });

  next();
}

// 定时更新缓存
async function updateCache() {
  try {
    console.log("🔄 Scheduled cache update started");
    const cal = await getFilteredCal({
      filterConfig: FILTER_CONFIG,
    });
    cachedICS = cal;
    console.log("✅ Cache updated successfully");
  } catch (err) {
    console.error("❌ Error updating cache:", err);
  }
}

// 启动 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;

// 使用请求日志中间件
app.use(requestLogger);

// 设置定时任务，每5分钟更新一次缓存
const CACHE_UPDATE_INTERVAL = 1 * 60 * 1000; // 1分钟
setInterval(updateCache, CACHE_UPDATE_INTERVAL);

// 启动时立即更新一次缓存
updateCache();

app.get("/filtered.ics", async (req, res) => {
  const returnFilteredICS = () => {
    res.setHeader("Content-Type", "text/calendar");
    res.setHeader("Content-Disposition", "attachment; filename=filtered.ics");
    return res.send(cachedICS);
  };

  if (cachedICS) {
    return returnFilteredICS();
  }

  try {
    console.log("🔄 Generating new .ics");
    const calFiltered = await getFilteredCal({ filterConfig: FILTER_CONFIG });

    // 更新缓存
    cachedICS = calFiltered;

    return returnFilteredICS();
  } catch (err) {
    console.error("❌ Error generating calendar:", err);
    res.status(500).send("Error generating calendar.");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/filtered.ics`);
});
