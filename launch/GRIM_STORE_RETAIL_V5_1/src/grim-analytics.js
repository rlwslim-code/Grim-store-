import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";

const analyticsEnabled =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_SECRET_KEY);

const supabase = analyticsEnabled
  ? createClient(
      SUPABASE_URL,
      SUPABASE_SECRET_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    )
  : null;


/* ============================================================
   HELPERS
   ============================================================ */

function cleanEmail(email = "") {
  return String(email)
    .trim()
    .toLowerCase()
    .slice(0, 320);
}


function hashValue(value = "") {
  if (!value) return null;

  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}


function clientIp(req) {
  const forwarded =
    req.headers["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded)
      .split(",")[0]
      .trim();
  }

  return (
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    ""
  );
}


function clientCountry(req) {
  const country =
    req.headers["x-vercel-ip-country"] ||
    req.headers["cf-ipcountry"] ||
    req.headers["x-country-code"] ||
    "";

  const value = String(country).toUpperCase();

  return /^[A-Z]{2}$/.test(value)
    ? value
    : null;
}


function detectDevice(userAgent = "") {
  const ua = String(userAgent).toLowerCase();

  if (/ipad|tablet/.test(ua)) {
    return "tablet";
  }

  if (/iphone|android|mobile/.test(ua)) {
    return "mobile";
  }

  return "desktop";
}


function detectBrowser(userAgent = "") {
  const ua = String(userAgent);

  if (/Edg\//i.test(ua)) return "Edge";

  if (/CriOS|Chrome/i.test(ua)) {
    return "Chrome";
  }

  if (/FxiOS|Firefox/i.test(ua)) {
    return "Firefox";
  }

  if (
    /Safari/i.test(ua) &&
    !/Chrome|CriOS|Android/i.test(ua)
  ) {
    return "Safari";
  }

  return "Other";
}


function analyticsError(label, error) {
  console.error(
    `[GRIM ANALYTICS] ${label}:`,
    error?.message || error
  );
}


export function grimAnalyticsReady() {
  return analyticsEnabled;
}


/* ============================================================
   CUSTOMER PROFILE
   ============================================================ */

export async function ensureGrimCustomer({
  name = "",
  email = "",
  phone = null,
  signupMethod = "password"
} = {}) {

  if (!supabase) return null;

  const normalizedEmail = cleanEmail(email);

  if (!normalizedEmail) return null;

  try {

    const {
      data: existing,
      error: findError
    } = await supabase
      .from("customer_profiles")
      .select(
        "id,name,email,phone,signup_method,signup_at"
      )
      .eq("email", normalizedEmail)
      .maybeSingle();


    if (findError) {
      throw findError;
    }


    if (existing) {

      const update = {};

      if (
        name &&
        String(name).trim() &&
        !existing.name
      ) {
        update.name =
          String(name).trim().slice(0, 160);
      }

      if (phone && !existing.phone) {
        update.phone =
          String(phone).trim().slice(0, 80);
      }


      if (Object.keys(update).length) {

        const {
          data,
          error
        } = await supabase
          .from("customer_profiles")
          .update(update)
          .eq("id", existing.id)
          .select("*")
          .single();

        if (error) throw error;

        return data;
      }

      return existing;
    }


    const {
      data,
      error
    } = await supabase
      .from("customer_profiles")
      .insert({
        name:
          String(name || "")
            .trim()
            .slice(0, 160),

        email: normalizedEmail,

        phone:
          phone
            ? String(phone)
                .trim()
                .slice(0, 80)
            : null,

        signup_method:
          String(signupMethod || "password")
            .slice(0, 40)
      })
      .select("*")
      .single();


    if (error) throw error;

    return data;

  } catch (error) {

    analyticsError(
      "ensure customer",
      error
    );

    return null;
  }
}


/* ============================================================
   START LOGIN SESSION
   ============================================================ */

export async function startGrimSession(
  req,
  user,
  signupMethod = "password"
) {

  if (!supabase || !user?.email) {
    return null;
  }

  try {

    const customer =
      await ensureGrimCustomer({
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        signupMethod
      });


    if (!customer) return null;


    const userAgent =
      String(
        req.headers["user-agent"] || ""
      ).slice(0, 1000);


    const sessionKey =
      req.sessionID ||
      crypto.randomUUID();


    const {
      data: grimSession,
      error
    } = await supabase
      .from("customer_sessions")
      .insert({
        customer_id: customer.id,

        session_key_hash:
          hashValue(sessionKey),

        login_at:
          new Date().toISOString(),

        last_seen_at:
          new Date().toISOString(),

        current_path:
          req.originalUrl || "/",

        user_agent:
          userAgent,

        ip_hash:
          hashValue(clientIp(req)),

        country:
          clientCountry(req),

        device_type:
          detectDevice(userAgent),

        browser:
          detectBrowser(userAgent)
      })
      .select("id")
      .single();


    if (error) throw error;


    if (req.session) {

      req.session.grimCustomerId =
        customer.id;

      req.session.grimSessionId =
        grimSession.id;
    }


    return {
      customerId: customer.id,
      sessionId: grimSession.id
    };

  } catch (error) {

    analyticsError(
      "start session",
      error
    );

    return null;
  }
}


/* ============================================================
   HEARTBEAT / LAST SEEN
   ============================================================ */

export async function touchGrimSession(
  req,
  currentPath = null
) {

  if (!supabase) return false;

  const sessionId =
    req.session?.grimSessionId;

  if (!sessionId) return false;


  try {

    const update = {
      last_seen_at:
        new Date().toISOString()
    };


    if (currentPath) {
      update.current_path =
        String(currentPath).slice(0, 500);
    }


    const { error } = await supabase
      .from("customer_sessions")
      .update(update)
      .eq("id", sessionId);


    if (error) throw error;

    return true;

  } catch (error) {

    analyticsError(
      "heartbeat",
      error
    );

    return false;
  }
}


/* ============================================================
   LOGOUT / SESSION END
   ============================================================ */

export async function endGrimSession(
  req,
  reason = "logout"
) {

  if (!supabase) return false;

  const sessionId =
    req.session?.grimSessionId;

  if (!sessionId) return false;


  try {

    const now =
      new Date().toISOString();


    const { error } = await supabase
      .from("customer_sessions")
      .update({
        last_seen_at: now,
        logout_at: now,

        ended_reason:
          String(reason || "logout")
            .slice(0, 80)
      })
      .eq("id", sessionId);


    if (error) throw error;


    if (req.session) {
      delete req.session.grimSessionId;
      delete req.session.grimCustomerId;
    }


    return true;

  } catch (error) {

    analyticsError(
      "end session",
      error
    );

    return false;
  }
}


/* ============================================================
   GENERIC LIVE ACTIVITY + ADMIN NOTIFICATION
   ============================================================ */

export async function logGrimActivity({
  eventType,
  category = "website",
  customerId = null,
  sessionId = null,
  orderId = null,
  title = null,
  message = null,
  severity = "info",
  path = null,
  metadata = {},
  notify = false,
  actionUrl = null
} = {}) {

  if (!supabase || !eventType) {
    return null;
  }

  try {

    const {
      data,
      error
    } = await supabase.rpc(
      "grim_log_activity",
      {
        p_event_type:
          String(eventType),

        p_category:
          String(category),

        p_customer_id:
          customerId,

        p_session_id:
          sessionId,

        p_order_id:
          orderId
            ? String(orderId)
            : null,

        p_title:
          title,

        p_message:
          message,

        p_severity:
          severity,

        p_path:
          path,

        p_metadata:
          metadata || {},

        p_notify:
          Boolean(notify),

        p_action_url:
          actionUrl
      }
    );


    if (error) throw error;

    return data;

  } catch (error) {

    analyticsError(
      `event ${eventType}`,
      error
    );

    return null;
  }
}


/* ============================================================
   SUPPORT MESSAGE
   ============================================================ */

export async function trackSupportMessage(
  req,
  {
    ticketId,
    topic,
    name,
    email
  } = {}
) {

  return logGrimActivity({

    eventType: "support_message",

    category: "support",

    customerId:
      req.session?.grimCustomerId || null,

    sessionId:
      req.session?.grimSessionId || null,

    title:
      "New customer-care message",

    message:
      `${name || email || "Customer"} sent a ${topic || "support"} message.`,

    severity:
      "info",

    path:
      req.originalUrl,

    metadata: {
      ticket_id:
        ticketId || null,

      email:
        cleanEmail(email),

      topic:
        topic || null
    },

    notify: true,

    actionUrl:
      "/admin.html#activity"
  });
}


/* ============================================================
   ORDER ACTIVITY
   ============================================================ */

export async function trackOrderActivity(
  req,
  order
) {

  if (!order) return null;


  return logGrimActivity({

    eventType: "new_order",

    category: "order",

    customerId:
      req.session?.grimCustomerId || null,

    sessionId:
      req.session?.grimSessionId || null,

    orderId:
      order.id,

    title:
      "New GRIM order",

    message:
      `${order.name || order.email || "Customer"} placed order #${order.id}.`,

    severity:
      "success",

    path:
      req.originalUrl,

    metadata: {
      order_id:
        order.id,

      email:
        cleanEmail(order.email),

      total:
        order.total,

      item_count:
        Array.isArray(order.items)
          ? order.items.reduce(
              (sum, item) =>
                sum + Number(item.qty || 1),
              0
            )
          : 0
    },

    notify: true,

    actionUrl:
      "/admin.html#orders"
  });
}


/* ============================================================
   PAYMENT ACTIVITY
   ============================================================ */

export async function trackPaymentActivity(
  req,
  {
    reference,
    status,
    amount,
    currency
  } = {}
) {

  const successful =
    String(status).toLowerCase() ===
    "success";


  return logGrimActivity({

    eventType:
      successful
        ? "payment_success"
        : "payment_failed",

    category:
      "payment",

    customerId:
      req.session?.grimCustomerId || null,

    sessionId:
      req.session?.grimSessionId || null,

    title:
      successful
        ? "Payment received"
        : "Payment problem",

    message:
      successful
        ? "A GRIM payment was verified successfully."
        : "A GRIM payment was not completed successfully.",

    severity:
      successful
        ? "success"
        : "error",

    path:
      req.originalUrl,

    metadata: {
      reference:
        reference || null,

      status:
        status || null,

      amount:
        amount || null,

      currency:
        currency || null
    },

    notify: true,

    actionUrl:
      "/admin.html#orders"
  });
}
