import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import {fileURLToPath} from "url";
import { OAuth2Client } from "google-auth-library";
import {installGrimPayments} from "./grim-payments.js";
import {
  startGrimSession,
  touchGrimSession,
  endGrimSession,
  trackSupportMessage,
  trackOrderActivity
} from "./grim-analytics.js";

dotenv.config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://rlwslim-code.github.io"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});
// Render terminates HTTPS at its proxy. Trust the first proxy so secure session cookies work in production.
app.set("trust proxy",1);
const dataDir = process.env.DATA_DIR || "/tmp/grim";
fs.mkdirSync(dataDir, { recursive: true });

const uploadDir = path.join(dataDir, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, "grim.db"));

app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET||"CHANGE-ME-BEFORE-LAUNCH",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:2592000000}}));
app.use("/uploads",express.static(uploadDir));
app.get("/health",(q,s)=>s.status(200).send("ok"));
app.use(express.static(path.join(__dirname,"../public")));

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,password_hash TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,user_id INTEGER,name TEXT,email TEXT,phone TEXT,address TEXT,items_json TEXT,total INTEGER,status TEXT DEFAULT 'new',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS support_tickets(id INTEGER PRIMARY KEY,topic TEXT,name TEXT,email TEXT,order_ref TEXT,message TEXT,status TEXT DEFAULT 'open',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS newsletter(id INTEGER PRIMARY KEY,email TEXT UNIQUE,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,type TEXT NOT NULL,price INTEGER NOT NULL,color TEXT NOT NULL,image TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const SEED_PRODUCTS=[{"id":1,"name":"Rose Reaper","type":"Hoodie","price":28000,"color":"Pink"},{"id":2,"name":"Veil","type":"Hoodie","price":28000,"color":"White"},{"id":3,"name":"Abyss","type":"Hoodie","price":28000,"color":"Blue"},{"id":4,"name":"Eclipse Gold","type":"Hoodie","price":28000,"color":"Yellow"},{"id":5,"name":"Rose Reaper","type":"Hoodie","price":28000,"color":"Pink"},{"id":6,"name":"Eclipse Gold","type":"Armless","price":15000,"color":"Yellow"},{"id":7,"name":"Bloodline","type":"Hoodie","price":28000,"color":"Red"},{"id":8,"name":"Obsidian","type":"Armless","price":15000,"color":"Black"},{"id":10,"name":"Obsidian / Veil","type":"Tee","price":18000,"color":"Mixed"},{"id":11,"name":"Veil / Abyss","type":"Hoodie","price":28000,"color":"Mixed"},{"id":12,"name":"Veil","type":"Tee","price":18000,"color":"White"},{"id":13,"name":"Veil / Abyss / Obsidian","type":"Armless","price":15000,"color":"Mixed"},{"id":14,"name":"Void Violet","type":"Hoodie","price":28000,"color":"Purple"},{"id":15,"name":"Veil / Obsidian","type":"Hoodie","price":28000,"color":"Mixed"},{"id":16,"name":"Obsidian / Veil","type":"Hoodie","price":28000,"color":"Mixed"},{"id":17,"name":"Rose Reaper","type":"Hoodie","price":28000,"color":"Pink"},{"id":18,"name":"Obsidian","type":"Hoodie","price":28000,"color":"Black"},{"id":19,"name":"Abyss","type":"Hoodie","price":28000,"color":"Blue"},{"id":20,"name":"Void Violet","type":"Hoodie","price":28000,"color":"Purple"},{"id":21,"name":"Rose Reaper","type":"Tee","price":18000,"color":"Pink"},{"id":22,"name":"Veil","type":"Hoodie","price":28000,"color":"White"},{"id":23,"name":"Obsidian","type":"Tee","price":18000,"color":"Black"},{"id":24,"name":"Veil / Obsidian","type":"Complete GRIM Outfit","price":90000,"color":"Mixed"},{"id":25,"name":"Obsidian","type":"Hoodie","price":28000,"color":"Black"},{"id":26,"name":"Rose Reaper","type":"Hoodie","price":28000,"color":"Pink"}];
if(db.prepare("SELECT COUNT(*) n FROM products").get().n===0){
 const ins=db.prepare("INSERT INTO products(id,name,type,price,color,image,active,sort_order) VALUES(@id,@name,@type,@price,@color,@image,1,@sort_order)");
 const tx=db.transaction(()=>SEED_PRODUCTS.forEach((x,i)=>ins.run({...x,image:`/assets/designs/design-${String(x.id).padStart(2,"0")}.jpeg`,sort_order:i+1})));
 tx();
}

const listProducts=(includeInactive=false)=>db.prepare(`SELECT id,name,type,price,color,image,active,sort_order FROM products ${includeInactive?"":"WHERE active=1"} ORDER BY sort_order,id`).all();
const productById=id=>db.prepare("SELECT id,name,type,price,color,image,active,sort_order FROM products WHERE id=?").get(id);
installGrimPayments(app, {productById});
app.get("/api/products",(q,s)=>s.json(listProducts(false)));
app.get("/api/market",(q,s)=>{let raw=String(q.headers["cf-ipcountry"]||q.headers["x-vercel-ip-country"]||q.headers["x-country-code"]||"").toUpperCase();s.json({country:/^[A-Z]{2}$/.test(raw)?raw:null})});
app.get("/api/me",(q,s)=>s.json(q.session.user||null));

app.post("/api/session/heartbeat", async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ ok: false });
  }

  await touchGrimSession(
    req,
    req.body?.path || req.headers.referer || "/"
  );

  res.json({ ok: true });
});

app.post("/api/logout", async (req, res) => {
  await endGrimSession(req, "logout");

  req.session.user = null;

  req.session.save(() => {
    res.json({ ok: true });
  });
});

app.get("/api/google-config", (req, res) => {
  res.json({
    clientId: process.env.GOOGLE_CLIENT_ID || ""
  });
});
app.post("/api/register",async(q,s)=>{let{name,email,password}=q.body||{};if(!name||!email||!password||password.length<6)return s.status(400).json({error:"Complete all fields."});try{let hash=await bcrypt.hash(password,12),r=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name,email.toLowerCase(),hash);q.session.user = {
  id: r.lastInsertRowid,
  name,
  email: email.toLowerCase()
};

await startGrimSession(
  q,
  q.session.user,
  "password"
);

s.json(q.session.user)
app.post("/api/login", async (q, s) => {
  let { email, password } = q.body || {};

  const u = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get((email || "").toLowerCase());

  if (
    !u ||
    !await bcrypt.compare(password || "", u.password_hash)
  ) {
    return s.status(401).json({
      error: "Incorrect email or password."
    });
  }

  q.session.user = {
    id: u.id,
    name: u.name,
    email: u.email
  };

  await startGrimSession(
    q,
    q.session.user,
    "password"
  );

  s.json(q.session.user);
});
app.post("/api/auth/google", async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({
        error: "Google Sign-In is not configured."
      });
    }

    const credential = String(req.body?.credential || "");

    if (!credential) {
      return res.status(400).json({
        error: "Google credential is required."
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const profile = ticket.getPayload();

    if (!profile?.email || !profile.email_verified) {
      return res.status(401).json({
        error: "Google could not verify this email."
      });
    }

    const email = profile.email.toLowerCase();
    const name =
      profile.name ||
      [profile.given_name, profile.family_name]
        .filter(Boolean)
        .join(" ") ||
      email.split("@")[0];

    let user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email);

    if (!user) {
      const unusablePassword = await bcrypt.hash(
        crypto.randomBytes(32).toString("hex"),
        12
      );

      const result = db
        .prepare(
          "INSERT INTO users(name,email,password_hash) VALUES(?,?,?)"
        )
        .run(name, email, unusablePassword);

      user = {
        id: result.lastInsertRowid,
        name,
        email
      };
    }

    req.session.user = {
      id: user.id,
      name: user.name || name,
      email: user.email
    };
    
    await startGrimSession(
  req,
  req.session.user,
  "google"
);
    
    return res.json({
      ok: true,
      ...req.session.user
    });

  } catch (error) {
    console.error("GRIM Google Sign-In error:", error);

    return res.status(401).json({
      error: "Google Sign-In failed."
    });
  }
});
async function notify(o){if(!process.env.SMTP_HOST||!process.env.STORE_OWNER_EMAIL)return;let t=nodemailer.createTransport({host:process.env.SMTP_HOST,port:+(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}),lines=o.items.map(x=>`${x.name} / ${x.color} / Size ${x.size||"M"} / Qty ${x.qty} / ₦${(x.price*x.qty).toLocaleString()}`).join("\n");await t.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:process.env.STORE_OWNER_EMAIL,subject:`NEW GRIM ORDER #${o.id}`,text:`Customer: ${o.name}\nEmail: ${o.email}\nPhone: ${o.phone}\nAddress: ${o.address}\n\n${lines}\n\nTOTAL ₦${o.total.toLocaleString()}`})}
app.post("/api/payments/verify", async (req, res) => {
  try {
    const reference = String(req.body?.reference || "").trim();

    if (!reference) {
      return res.status(400).json({
        ok: false,
        verified: false,
        error: "Payment reference is required"
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        ok: false,
        verified: false,
        error: "Payment verification is not configured"
      });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.status) {
      return res.status(400).json({
        ok: false,
        verified: false,
        error: result.message || "Payment verification failed"
      });
    }

    const verified = result.data?.status === "success";

    return res.json({
      ok: true,
      verified,
      reference: result.data?.reference,
      amount: result.data?.amount,
      currency: result.data?.currency,
      status: result.data?.status
    });

  } catch (error) {
    console.error("Paystack verification error:", error);

    return res.status(500).json({
      ok: false,
      verified: false,
      error: "Unable to verify payment"
    });
  }
});
app.post("/api/orders",async(q,s)=>{let{name,email,phone,address,items,country,currency}=q.body||{};if(!name||!email||!phone||!address||!items?.length)return s.status(400).json({error:"Complete checkout details."});let clean=[],total=0;for(let x of items){let p=productById(+x.id),qty=Math.max(1,Math.min(10,+x.qty||1));if(p&&p.active){clean.push({...p,qty,size:String(x.size||"M").slice(0,4)});total+=p.price*qty}}if(!clean.length)return s.status(400).json({error:"Your cart has no available products."});let r=db.prepare("INSERT INTO orders(user_id,name,email,phone,address,items_json,total) VALUES(?,?,?,?,?,?,?)").run(q.session.user?.id||null,name,email,phone,address,JSON.stringify(clean),total),o={id:+r.lastInsertRowid,name,email,phone,address,items:clean,total};try{await notify(o)}catch(e){console.error(e)}s.json({ok:true,orderId:o.id,total,country:country||"NG",currency:currency||"NGN"})});
app.post("/api/support",async(q,s)=>{let{topic,name,email,order,message}=q.body||{};if(!topic||!name||!email||!message)return s.status(400).json({error:"Complete the required fields."});let r=db.prepare("INSERT INTO support_tickets(topic,name,email,order_ref,message) VALUES(?,?,?,?,?)").run(String(topic).slice(0,80),String(name).slice(0,100),String(email).slice(0,160),String(order||"").slice(0,50),String(message).slice(0,3000));if(process.env.SMTP_HOST&&process.env.STORE_OWNER_EMAIL){try{let t=nodemailer.createTransport({host:process.env.SMTP_HOST,port:+(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});await t.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:process.env.STORE_OWNER_EMAIL,replyTo:email,subject:`GRIM CUSTOMER CARE #${r.lastInsertRowid} — ${topic}`,text:`Name: ${name}\nEmail: ${email}\nOrder: ${order||"N/A"}\nTopic: ${topic}\n\n${message}`})}catch(e){console.error(e)}}s.json({ok:true,ticketId:r.lastInsertRowid})});
app.post("/api/newsletter",(q,s)=>{let email=String(q.body?.email||"").trim().toLowerCase();if(!email||!email.includes("@"))return s.status(400).json({error:"Enter a valid email."});try{db.prepare("INSERT INTO newsletter(email) VALUES(?)").run(email)}catch(e){}s.json({ok:true})});

// Owner dashboard. Set ADMIN_PASSWORD and SESSION_SECRET in hosting environment variables before launch.
const adminOnly=(q,s,n)=>q.session?.admin?n():s.status(401).json({error:"Admin sign-in required."});
app.get("/api/admin/status",(q,s)=>s.json({loggedIn:!!q.session?.admin}));
app.post("/api/admin/login",(q,s)=>{const expected=String(process.env.ADMIN_PASSWORD||"");const supplied=String(q.body?.password||"");if(!expected)return s.status(503).json({error:"ADMIN_PASSWORD is not configured on the server."});const a=Buffer.from(expected),b=Buffer.from(supplied);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return s.status(401).json({error:"Incorrect admin password."});q.session.admin=true;s.json({ok:true})});
app.post("/api/admin/logout",adminOnly,(q,s)=>{q.session.admin=false;s.json({ok:true})});
app.get("/api/admin/products",adminOnly,(q,s)=>s.json(listProducts(true)));
app.get("/api/admin/orders",adminOnly,(q,s)=>s.json(db.prepare("SELECT id,name,email,phone,address,total,status,created_at FROM orders ORDER BY id DESC LIMIT 200").all()));

const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,uploadDir),filename:(req,file,cb)=>{const ext=(path.extname(file.originalname)||".jpg").toLowerCase().replace(/[^.a-z0-9]/g,"");cb(null,`${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`)}});
const upload=multer({storage,limits:{fileSize:8*1024*1024},fileFilter:(req,file,cb)=>cb(null,/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))});
app.post("/api/admin/products",adminOnly,upload.single("image"),(q,s)=>{const{name,type,color}=q.body,price=+q.body.price,sort_order=+q.body.sort_order||0;if(!name||!type||!color||!Number.isFinite(price)||price<0)return s.status(400).json({error:"Name, type, color and a valid price are required."});const image=q.file?`/uploads/${q.file.filename}`:"/assets/grim-wordmark.png";const r=db.prepare("INSERT INTO products(name,type,price,color,image,active,sort_order) VALUES(?,?,?,?,?,1,?)").run(String(name).slice(0,100),String(type).slice(0,80),Math.round(price),String(color).slice(0,80),image,sort_order);s.json(productById(r.lastInsertRowid))});
app.put("/api/admin/products/:id",adminOnly,upload.single("image"),(q,s)=>{const old=productById(+q.params.id);if(!old)return s.status(404).json({error:"Product not found."});const{name,type,color}=q.body,price=+q.body.price,active=String(q.body.active)!=="0"?1:0,sort_order=+q.body.sort_order||0,image=q.file?`/uploads/${q.file.filename}`:old.image;if(!name||!type||!color||!Number.isFinite(price)||price<0)return s.status(400).json({error:"Complete the product details."});db.prepare("UPDATE products SET name=?,type=?,price=?,color=?,image=?,active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(name).slice(0,100),String(type).slice(0,80),Math.round(price),String(color).slice(0,80),image,active,sort_order,+q.params.id);s.json(productById(+q.params.id))});
app.delete("/api/admin/products/:id",adminOnly,(q,s)=>{db.prepare("UPDATE products SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(+q.params.id);s.json({ok:true})});

app.get("*",(q,s)=>s.sendFile(path.join(__dirname,"../public/index.html")));
app.listen(process.env.PORT||3000,"0.0.0.0",()=>console.log("GRIM STORE RUNNING"));
