// renewal-check.mjs
// 使用 Notion + Resend 做到期前 7 天邮件提醒（Asia/Shanghai 时区）

// ============================
// 环境变量
// ============================
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const RESEND_API_KEY = process.env.RESEND_API_KEY; // Resend API Key，必填
const NOTION_VERSION = "2025-09-03";

if (!NOTION_API_KEY || !NOTION_DATABASE_ID || !RESEND_API_KEY) {
  console.error("❌ 缺少 NOTION_API_KEY / NOTION_DATABASE_ID / RESEND_API_KEY 环境变量");
  process.exit(1);
}

// ============================
// 时间与日期工具（固定使用 Asia/Shanghai）
// ============================

// 获取 “上海时区的今天” 的年月日
function getShanghaiTodayYMD() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year").value);
  const m = Number(parts.find((p) => p.type === "month").value);
  const d = Number(parts.find((p) => p.type === "day").value);
  return { y, m, d };
}

// 把 y-m-d 映射到一个“天数编号”（UTC 基准，不受本地时区影响）
function ymdToDayNumber(y, m, d) {
  return Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
}

// 从 Notion 的 date.start 字符串中提取年月日（只看 YYYY-MM-DD）
function parseNotionDateYMD(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

// ============================
// Notion API 请求封装
// ============================
async function notionRequest(path, method = "GET", body = null) {
  const url = `https://api.notion.com/v1/${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`❌ Notion API 错误：${res.status} - ${err}`);
  }

  return res.json();
}

// ============================
// 获取 data_source_id
// ============================
async function getDataSourceId() {
  const db = await notionRequest(`databases/${NOTION_DATABASE_ID}`);
  if (!db.data_sources || db.data_sources.length === 0) {
    throw new Error("❌ 此数据库没有 data_sources");
  }
  const ds = db.data_sources[0];
  console.log("✅ 使用的数据源 data_source_id:", ds.id, "名称:", ds.name);
  return ds.id;
}

// ============================
// 从 Notion 读取全部用户
// ============================
async function fetchAllUsers(dataSourceId) {
  const body = { page_size: 100 }; // 如果未来数据量变大，可做分页
  const data = await notionRequest(
    `data_sources/${dataSourceId}/query`,
    "POST",
    body
  );
  return data.results;
}

// ============================
// 调用 Resend 发送提醒邮件
// ============================
async function sendReminder(email, endDate, name) {
  const displayName = name || "用户";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Notion续期提醒 <qwq@355232.xyz>", // 如需改发件人，请同步修改这里
      to: email,
      subject: `您的套餐将于 ${endDate} 到期，请及时续订`,
      html: `
        <p>您好，${displayName}：</p>
        <p>您的套餐将于 <b>${endDate}</b> 到期。</p>
        <p>如需续期，请尽快联系客服或进入购买页面。 <a href="https://www.goofish.com/personal?spm=a21ybx">戳我进行购买续期</a></p>
        <p>感谢您的使用！</p>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`❌ Resend 邮件发送失败：${res.status} - ${err}`);
  }
}

// ============================
// 更新 Notion 状态字段
// ============================
async function updateStatus(pageId, newStatus) {
  return notionRequest(`pages/${pageId}`, "PATCH", {
    properties: {
      状态: {
        select: { name: newStatus },
      },
    },
  });
}

// ============================
// 主逻辑：检查到期时间
// ============================
async function main() {
  console.log("🚀 开始检查 Notion 用户到期状态...");

  const dataSourceId = await getDataSourceId();
  const users = await fetchAllUsers(dataSourceId);

  // 以上海时区的“今天”作为基准
  const { y: ty, m: tm, d: td } = getShanghaiTodayYMD();
  const todayDayNum = ymdToDayNumber(ty, tm, td);
  console.log(
    `📅 以上海时区为准的今天日期：${ty}-${String(tm).padStart(2, "0")}-${String(
      td
    ).padStart(2, "0")}`
  );

  for (const page of users) {
    const props = page.properties;

    const name =
      props["咸鱼用户名称"]?.title?.[0]?.plain_text ?? "(无名称)";
    const email = props["邮箱地址"]?.email;
    const status = props["状态"]?.select?.name;
    const endDateStr = props["结束时间"]?.date?.start;
    const pageId = page.id;

    if (!email || !endDateStr) continue;

    const { y: ey, m: em, d: ed } = parseNotionDateYMD(endDateStr);
    const endDayNum = ymdToDayNumber(ey, em, ed);

    const diffDays = endDayNum - todayDayNum;

    // ============================
    // 0）已到期处理：自动改成「已到期」
    // ============================
    if (diffDays < 0) {
      if (status !== "已到期") {
        console.log(
          `⚠️ ${name} <${email}> 已过期（结束日期：${endDateStr}），更新状态为「已到期」`
        );
        await updateStatus(pageId, "已到期");
      }
      continue;
    }

    // ============================
    // 1）只有状态 = 使用中 的才参与后续逻辑
    // ============================
    if (status !== "使用中") {
      // 已提醒 / 已到期 / 其他状态 都直接跳过
      continue;
    }

    // ============================
    // 2）刚好剩 7 天：发送提醒 + 改为已提醒
    // ============================
    if (diffDays === 7) {
      console.log(
        `📧 ${name} <${email}> 距离到期还有 7 天（${endDateStr}），发送提醒并标记为「已提醒」`
      );
      await sendReminder(email, endDateStr, name);
      await updateStatus(pageId, "已提醒");
      console.log(
        `✅ 已处理：${name} <${email}> 状态更新为「已提醒」`
      );
      continue;
    }

    // ============================
    // 3）少于 7 天但尚未到期：不发邮件，只提示（方便人工检查）
    // ============================
    if (diffDays >= 0 && diffDays < 7) {
      console.log(
        `🔎 提示：${name} <${email}> 距离到期不足 7 天（剩 ${diffDays} 天），状态为「使用中」，按规则不补发邮件。`
      );
      continue;
    }

    // > 7 天：什么都不做
  }

  console.log("🎉 检查完成");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
