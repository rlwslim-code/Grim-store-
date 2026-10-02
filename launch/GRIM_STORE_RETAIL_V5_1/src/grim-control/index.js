import {
  ensureGrimCustomer,
  startGrimSession,
  touchGrimSession,
  endGrimSession
} from "./sessions.js";

import {
  logGrimActivity,
  trackOrderActivity,
  trackSupportMessage,
  trackPaymentActivity,
  trackSystemError
} from "./activity.js";


function requestPath(req) {
  return String(
    req?.path ||
    req?.originalUrl ||
    ""
  ).split("?")[0];
}


function successfulResponse(res, body) {
  if (res.statusCode >= 400) {
    return false;
  }

  if (
    body &&
    typeof body === "object" &&
    body.ok === false
  ) {
    return false;
  }

  return true;
}


/* ============================================================
   ACCOUNT ACTIVITY
   ============================================================ */

async function trackAccountRequest(
  req,
  path,
  responseBody
) {

  const user =
    req?.session?.user ||
    (
      responseBody?.email
        ? responseBody
        : null
    );

  if (!user?.email) {
    return;
  }


  const authMethod =
    path === "/api/auth/google"
      ? "google"
      : "password";


  const customer =
    await ensureGrimCustomer({
      name:
        user.name || "",

      email:
        user.email,

      phone:
        user.phone || null,

      signupMethod:
        authMethod
    });


  if (!customer) {
    return;
  }


  if (path === "/api/register") {

    await logGrimActivity({
      eventType:
        "signup",

      category:
        "account",

      customerId:
        customer.id,

      title:
        "New GRIM signup",

      message:
        `${user.name || user.email} created a GRIM account.`,

      severity:
        "success",

      path,

      /*
       * The database foundation may already
       * create the signup notification when
       * customer_profiles receives a new row.
       * We log the activity here without
       * creating a second notification.
       */
      notify:
        false,

      actionUrl:
        "/admin.html#users"
    });

    return;
  }


  await logGrimActivity({
    eventType:
      authMethod === "google"
        ? "google_login"
        : "login",

    category:
      "account",

    customerId:
      customer.id,

    title:
      authMethod === "google"
        ? "Google login"
        : "Customer login",

    message:
      `${user.name || user.email} signed in to GRIM.`,

    severity:
      "info",

    path,

    notify:
      true,

    actionUrl:
      "/admin.html#users"
  });
}


/* ============================================================
   ORDER OBSERVER
   ============================================================ */

async function observeOrder(
  req,
  responseBody
) {

  if (!responseBody?.orderId) {
    return;
  }

  const body =
    req.body || {};


  await trackOrderActivity(
    req,
    {
      id:
        responseBody.orderId,

      name:
        body.name,

      email:
        body.email,

      phone:
        body.phone,

      address:
        body.address,

      items:
        Array.isArray(body.items)
          ? body.items
          : [],

      total:
        responseBody.total
    }
  );
}


/* ============================================================
   SUPPORT OBSERVER
   ============================================================ */

async function observeSupport(
  req,
  responseBody
) {

  if (!responseBody?.ticketId) {
    return;
  }

  const body =
    req.body || {};


  await trackSupportMessage(
    req,
    {
      ticketId:
        responseBody.ticketId,

      topic:
        body.topic,

      name:
        body.name,

      email:
        body.email
    }
  );
}


/* ============================================================
   PAYSTACK OBSERVER
   ============================================================ */

async function observePayment(
  req,
  res,
  responseBody
) {

  const reference =
    responseBody?.reference ||
    req?.body?.reference ||
    null;


  /*
   * Configuration/server errors are handled
   * as system errors rather than pretending
   * the customer's payment failed.
   */
  if (res.statusCode >= 500) {
    return;
  }


  if (!reference) {
    return;
  }


  let status =
    responseBody?.status ||
    responseBody?.data?.status ||
    null;


  if (!status) {
    status =
      responseBody?.verified === true
        ? "success"
        : "failed";
  }


  await trackPaymentActivity(
    req,
    {
      reference,

      status,

      amount:
        responseBody?.amount ??
        responseBody?.data?.amount ??
        null,

      currency:
        responseBody?.currency ||
        responseBody?.data?.currency ||
        null
    }
  );
}


/* ============================================================
   AFTER-REQUEST OBSERVER
   ============================================================ */

async function observeFinishedRequest(
  req,
  res,
  responseBody
) {

  try {
    const path =
      requestPath(req);


    /*
     * Successful account actions
     */
    if (
      successfulResponse(
        res,
        responseBody
      ) &&
      (
        path === "/api/register" ||
        path === "/api/login" ||
        path === "/api/auth/google"
      )
    ) {
      await trackAccountRequest(
        req,
        path,
        responseBody
      );
    }


    /*
     * Successful order
     */
    if (
      path === "/api/orders" &&
      successfulResponse(
        res,
        responseBody
      )
    ) {
      await observeOrder(
        req,
        responseBody
      );
    }


    /*
     * Successful customer-care ticket
     */
    if (
      path === "/api/support" &&
      successfulResponse(
        res,
        responseBody
      )
    ) {
      await observeSupport(
        req,
        responseBody
      );
    }


    /*
     * Paystack verification
     */
    if (
      path === "/api/payments/verify"
    ) {
      await observePayment(
        req,
        res,
        responseBody
      );
    }


    /*
     * Any unexpected server error
     */
    if (
      res.statusCode >= 500 &&
      !path.startsWith("/api/admin/")
    ) {
      await trackSystemError(
        req,
        {
          title:
            "GRIM server error",

          message:
            `${req.method} ${path} returned ${res.statusCode}.`,

          metadata: {
            status_code:
              res.statusCode,

            method:
              req.method,

            path
          }
        }
      );
    }

  } catch (error) {
    console.error(
      "[GRIM CONTROL] observer:",
      error?.message || error
    );
  }
}


/* ============================================================
   INSTALLER
   ============================================================ */

export function installGrimControl(app) {

  if (!app) {
    throw new Error(
      "GRIM Control requires the Express app."
    );
  }


  /*
   * Protect against accidentally installing
   * this system twice.
   */
  if (
    app.locals?.grimControlInstalled
  ) {
    return;
  }


  app.locals.grimControlInstalled =
    true;


  /*
   * This middleware observes API responses
   * without requiring us to rewrite the
   * existing login/order/payment routes.
   */
  app.use(async (req, res, next) => {

    const path =
      requestPath(req);


    /*
     * If a signed-in customer does not yet
     * have a GRIM analytics session, create
     * one before handling their next API call.
     */
    if (
      req?.session?.user &&
      !req?.session?.grimSessionId &&
      path !== "/api/logout"
    ) {
      await startGrimSession(
        req,
        req.session.user,
        "password"
      );
    }


    let capturedBody = null;

    const originalJson =
      res.json.bind(res);


    res.json = function (body) {
      capturedBody = body;
      return originalJson(body);
    };


    res.once("finish", () => {
      observeFinishedRequest(
        req,
        res,
        capturedBody
      ).catch(error => {
        console.error(
          "[GRIM CONTROL] finish observer:",
          error?.message || error
        );
      });
    });


    next();
  });


  /* ==========================================================
     HEARTBEAT
     ========================================================== */

  app.post(
    "/api/session/heartbeat",
    async (req, res) => {

      if (!req?.session?.user) {
        return res.status(401).json({
          ok: false,
          authenticated: false
        });
      }


      /*
       * Normally the middleware above already
       * created this. This fallback makes the
       * endpoint self-healing.
       */
      if (
        !req.session.grimSessionId
      ) {
        await startGrimSession(
          req,
          req.session.user,
          "password"
        );
      }


      await touchGrimSession(
        req,
        req.body?.path ||
        req.headers?.referer ||
        "/"
      );


      return res.json({
        ok: true
      });
    }
  );


  /* ==========================================================
     CUSTOMER LOGOUT
     ========================================================== */

  app.post(
    "/api/logout",
    async (req, res) => {

      await endGrimSession(
        req,
        "logout"
      );


      if (!req.session) {
        return res.json({
          ok: true
        });
      }


      req.session.user = null;


      if (
        typeof req.session.save !==
        "function"
      ) {
        return res.json({
          ok: true
        });
      }


      req.session.save(error => {

        if (error) {
          console.error(
            "[GRIM CONTROL] logout save:",
            error
          );
        }


        res.json({
          ok: true
        });
      });
    }
  );


  console.log(
    "[GRIM CONTROL] Control center installed."
  );
}
