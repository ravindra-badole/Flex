const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");

function loadEnvFromFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

loadEnvFromFile();

const PORT = Number(process.env.PORT || 4000);
const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "skillbridge";
const JSON_DB_PATH = path.join(__dirname, "db.json");
const FRONTEND_ROOT = path.resolve(__dirname, "..");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase() === "client" ? "Client" : "Freelancer";
}

function defaultProfile(role) {
  return {
    role: normalizeRole(role),
    location: "India",
    skills: normalizeRole(role) === "Client" ? "Hiring, Project Management" : "HTML, CSS, JavaScript",
    about: normalizeRole(role) === "Client"
      ? "Ready to hire skilled freelancers for quality projects."
      : "Ready to build quality client projects.",
    emailUpdates: true
  };
}

function sanitizeUser(row) {
  if (!row) return null;

  const createdAt = row.created_at || row.createdAt || nowIso();
  const role = row.role || (row.profile && row.profile.role) || "Freelancer";
  const location = row.location || (row.profile && row.profile.location) || "India";
  const skills = row.skills || (row.profile && row.profile.skills) || "HTML, CSS, JavaScript";
  const about = row.about || (row.profile && row.profile.about) || "Ready to build quality client projects.";
  const emailUpdatesRaw = row.email_updates;
  const emailUpdates = typeof emailUpdatesRaw === "undefined"
    ? Boolean(row.profile && row.profile.emailUpdates)
    : Boolean(emailUpdatesRaw);

  return {
    id: row.id,
    firstName: row.first_name || row.firstName || "",
    lastName: row.last_name || row.lastName || "",
    email: row.email,
    createdAt,
    profile: {
      role,
      location,
      skills,
      about,
      emailUpdates
    }
  };
}

function mapGig(row) {
  return {
    id: row.id,
    ownerEmail: row.owner_email || row.ownerEmail,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    deliveryDays: Number(row.delivery_days || row.deliveryDays),
    createdAt: row.created_at || row.createdAt
  };
}

function mapJob(row) {
  return {
    id: row.id,
    ownerEmail: row.owner_email || row.ownerEmail,
    title: row.title,
    description: row.description,
    category: row.category,
    budget: Number(row.budget),
    deadlineDays: Number(row.deadline_days || row.deadlineDays),
    status: row.status,
    createdAt: row.created_at || row.createdAt
  };
}

function mapApplication(row) {
  return {
    id: row.id,
    jobId: row.job_id || row.jobId,
    clientEmail: row.client_email || row.clientEmail,
    freelancerEmail: row.freelancer_email || row.freelancerEmail,
    status: row.status,
    appliedAt: row.applied_at || row.appliedAt
  };
}

function mapSupportTicket(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    createdAt: row.created_at || row.createdAt
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    applicationId: row.application_id || row.applicationId || "",
    jobId: row.job_id || row.jobId || "",
    senderEmail: row.sender_email || row.senderEmail,
    recipientEmail: row.recipient_email || row.recipientEmail,
    subject: row.subject || "Project update",
    body: row.body,
    createdAt: row.created_at || row.createdAt
  };
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload));
}

function badRequest(res, message) {
  return json(res, 400, { ok: false, message });
}

function serveFile(res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const contents = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(contents);
    return true;
  } catch (_) {
    return false;
  }
}

function serveFrontend(req, res, pathname) {
  if (req.method !== "GET") return false;

  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const resolved = path.resolve(FRONTEND_ROOT, "." + normalized);

  if (!resolved.startsWith(FRONTEND_ROOT)) {
    return false;
  }

  if (!fs.existsSync(resolved)) {
    return false;
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const nestedIndex = path.join(resolved, "index.html");
    if (fs.existsSync(nestedIndex)) {
      return serveFile(res, nestedIndex);
    }
    return false;
  }

  return serveFile(res, resolved);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (_) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function readJsonDb() {
  if (!fs.existsSync(JSON_DB_PATH)) {
    const empty = {
      users: [],
      jobs: [],
      gigs: [],
      applications: [],
      supportTickets: [],
      messages: []
    };
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }

  const raw = fs.readFileSync(JSON_DB_PATH, "utf8").replace(/^\uFEFF/, "");
  const data = raw ? JSON.parse(raw) : {};
  return {
    users: Array.isArray(data.users) ? data.users : [],
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    gigs: Array.isArray(data.gigs) ? data.gigs : [],
    applications: Array.isArray(data.applications) ? data.applications : [],
    supportTickets: Array.isArray(data.supportTickets) ? data.supportTickets : [],
    messages: Array.isArray(data.messages) ? data.messages : []
  };
}

function createJsonStore() {
  let db = readJsonDb();

  function save() {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(db, null, 2));
  }

  return {
    kind: "json",

    async health() {
      db = readJsonDb();
      return true;
    },

    async createUser({ firstName, lastName, email, password, role }) {
      db = readJsonDb();
      if (db.users.some((user) => user.email === email)) {
        throw new Error("user already exists");
      }

      const profile = defaultProfile(role);
      const user = {
        id: makeId("u"),
        firstName,
        lastName,
        email,
        passwordHash: hashPassword(password),
        createdAt: nowIso(),
        profile
      };

      db.users.push(user);
      save();
      return sanitizeUser(user);
    },

    async authenticateUser(email, password) {
      db = readJsonDb();
      const user = db.users.find((item) => item.email === email && item.passwordHash === hashPassword(password));
      return sanitizeUser(user || null);
    },

    async getUserByEmail(email) {
      db = readJsonDb();
      return sanitizeUser(db.users.find((item) => item.email === email) || null);
    },

    async updateUser(emailParam, body) {
      db = readJsonDb();
      const index = db.users.findIndex((item) => item.email === emailParam);
      if (index === -1) return null;

      const current = db.users[index];
      const nextEmail = normalizeEmail(body.email || current.email);
      const duplicate = db.users.find((item) => item.email === nextEmail && item.id !== current.id);
      if (duplicate) {
        throw new Error("email already used by another account");
      }

      const nextProfile = body.profile || {};
      db.users[index] = {
        ...current,
        firstName: String(body.firstName || current.firstName).trim(),
        lastName: String(body.lastName || current.lastName).trim(),
        email: nextEmail,
        passwordHash: body.password ? hashPassword(String(body.password)) : current.passwordHash,
        profile: {
          role: String(nextProfile.role || current.profile.role || "Freelancer"),
          location: String(nextProfile.location || current.profile.location || "India"),
          skills: String(nextProfile.skills || current.profile.skills || "HTML, CSS, JavaScript"),
          about: String(nextProfile.about || current.profile.about || "Ready to build quality client projects."),
          emailUpdates: typeof nextProfile.emailUpdates === "boolean"
            ? nextProfile.emailUpdates
            : Boolean(current.profile.emailUpdates)
        }
      };

      save();
      return sanitizeUser(db.users[index]);
    },

    async listGigs(ownerEmail) {
      db = readJsonDb();
      return db.gigs
        .filter((gig) => !ownerEmail || gig.ownerEmail === ownerEmail)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(mapGig);
    },

    async createGig({ ownerEmail, title, description, price, deliveryDays }) {
      db = readJsonDb();
      const owner = db.users.find((item) => item.email === ownerEmail);
      if (!owner) return null;

      const gig = {
        id: makeId("g"),
        ownerEmail,
        title,
        description,
        price: Number(price),
        deliveryDays: Number(deliveryDays),
        createdAt: nowIso()
      };

      db.gigs.push(gig);
      save();
      return mapGig(gig);
    },

    async listJobs({ category, ownerEmail }) {
      db = readJsonDb();
      return db.jobs
        .filter((job) => {
          if (category && job.category.toLowerCase() !== category) return false;
          if (ownerEmail && job.ownerEmail !== ownerEmail) return false;
          return true;
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(mapJob);
    },

    async createJob({ ownerEmail, title, description, category, budget, deadlineDays }) {
      db = readJsonDb();
      const owner = db.users.find((item) => item.email === ownerEmail);
      if (!owner) return null;

      const job = {
        id: makeId("j"),
        ownerEmail,
        title,
        description,
        category,
        budget: Number(budget),
        deadlineDays: Number(deadlineDays),
        status: "Open",
        createdAt: nowIso()
      };

      db.jobs.push(job);
      save();
      return mapJob(job);
    },

    async applyToJob(jobId, freelancerEmail) {
      db = readJsonDb();
      const job = db.jobs.find((item) => item.id === jobId);
      if (!job) {
        return { type: "missing_job" };
      }

      if (job.ownerEmail === freelancerEmail) {
        return { type: "own_job" };
      }

      const duplicate = db.applications.find((item) => item.jobId === jobId && item.freelancerEmail === freelancerEmail);
      if (duplicate) {
        return { type: "duplicate" };
      }

      const application = {
        id: makeId("a"),
        jobId,
        clientEmail: job.ownerEmail,
        freelancerEmail,
        status: "Pending",
        appliedAt: nowIso()
      };

      db.applications.push(application);
      save();
      return { type: "ok", application: mapApplication(application) };
    },

    async getOrders(email) {
      db = readJsonDb();
      const jobsById = new Map(db.jobs.map((job) => [job.id, job]));
      const postedJobs = db.jobs
        .filter((job) => job.ownerEmail === email)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(mapJob);

      const incomingApplications = db.applications
        .filter((app) => app.clientEmail === email)
        .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))
        .map((app) => ({
          ...mapApplication(app),
          job: jobsById.has(app.jobId) ? mapJob(jobsById.get(app.jobId)) : null
        }));

      const myApplications = db.applications
        .filter((app) => app.freelancerEmail === email)
        .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))
        .map((app) => ({
          ...mapApplication(app),
          job: jobsById.has(app.jobId) ? mapJob(jobsById.get(app.jobId)) : null
        }));

      return { postedJobs, incomingApplications, myApplications };
    },

    async updateApplicationStatus(appId, status) {
      db = readJsonDb();
      const index = db.applications.findIndex((item) => item.id === appId);
      if (index === -1) return null;

      db.applications[index] = {
        ...db.applications[index],
        status
      };
      save();
      return mapApplication(db.applications[index]);
    },

    async createSupportTicket({ name, email, message }) {
      db = readJsonDb();
      const ticket = {
        id: makeId("s"),
        name,
        email,
        message,
        createdAt: nowIso()
      };
      db.supportTickets.push(ticket);
      save();
      return mapSupportTicket(ticket);
    },

    async listMessages(email) {
      db = readJsonDb();
      return db.messages
        .filter((item) => item.senderEmail === email || item.recipientEmail === email)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(mapMessage);
    },

    async createMessage({ senderEmail, recipientEmail, applicationId, subject, body }) {
      db = readJsonDb();
      const sender = db.users.find((item) => item.email === senderEmail);
      const recipient = db.users.find((item) => item.email === recipientEmail);

      if (!sender || !recipient) {
        return { type: "missing_user" };
      }

      const acceptedApp = db.applications.find((item) => {
        const sameApplication = applicationId ? item.id === applicationId : true;
        const accepted = item.status === "Accepted";
        const participants = item.clientEmail === senderEmail && item.freelancerEmail === recipientEmail
          || item.clientEmail === recipientEmail && item.freelancerEmail === senderEmail;
        return sameApplication && accepted && participants;
      });

      if (!acceptedApp) {
        return { type: "locked" };
      }

      const message = {
        id: makeId("m"),
        applicationId: acceptedApp.id,
        jobId: acceptedApp.jobId,
        senderEmail,
        recipientEmail,
        subject,
        body,
        createdAt: nowIso()
      };

      db.messages.push(message);
      save();
      return { type: "ok", message: mapMessage(message) };
    }
  };
}

async function createMySqlStore() {
  const admin = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true
  });

  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await admin.end();

  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4"
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(80) PRIMARY KEY,
      first_name VARCHAR(120) NOT NULL,
      last_name VARCHAR(120) NOT NULL,
      email VARCHAR(200) NOT NULL UNIQUE,
      password_hash VARCHAR(128) NOT NULL,
      role VARCHAR(120) NOT NULL DEFAULT 'Freelancer',
      location VARCHAR(120) NOT NULL DEFAULT 'India',
      skills TEXT NOT NULL,
      about TEXT NOT NULL,
      email_updates TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gigs (
      id VARCHAR(80) PRIMARY KEY,
      owner_email VARCHAR(200) NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      price DECIMAL(12,2) NOT NULL,
      delivery_days INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_gigs_owner_email (owner_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id VARCHAR(80) PRIMARY KEY,
      owner_email VARCHAR(200) NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(150) NOT NULL,
      budget DECIMAL(12,2) NOT NULL,
      deadline_days INT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Open',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_jobs_owner_email (owner_email),
      INDEX idx_jobs_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id VARCHAR(80) PRIMARY KEY,
      job_id VARCHAR(80) NOT NULL,
      client_email VARCHAR(200) NOT NULL,
      freelancer_email VARCHAR(200) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Pending',
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_job_freelancer (job_id, freelancer_email),
      INDEX idx_apps_client (client_email),
      INDEX idx_apps_freelancer (freelancer_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_support_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(80) PRIMARY KEY,
      application_id VARCHAR(80) NULL,
      job_id VARCHAR(80) NULL,
      sender_email VARCHAR(200) NOT NULL,
      recipient_email VARCHAR(200) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_messages_sender (sender_email),
      INDEX idx_messages_recipient (recipient_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query("ALTER TABLE messages ADD COLUMN application_id VARCHAR(80) NULL").catch(() => {});
  await pool.query("ALTER TABLE messages ADD COLUMN job_id VARCHAR(80) NULL").catch(() => {});

  return {
    kind: "mysql",

    async health() {
      await pool.query("SELECT 1");
      return true;
    },

    async createUser({ firstName, lastName, email, password, role }) {
      const [existing] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
      if (existing.length) {
        throw new Error("user already exists");
      }

      const userId = makeId("u");
      const passwordHash = hashPassword(password);
      const profile = defaultProfile(role);
      await pool.execute(
        `INSERT INTO users
        (id, first_name, last_name, email, password_hash, role, location, skills, about, email_updates)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [userId, firstName, lastName, email, passwordHash, profile.role, profile.location, profile.skills, profile.about]
      );

      const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
      return sanitizeUser(rows[0]);
    },

    async authenticateUser(email, password) {
      const [rows] = await pool.execute(
        "SELECT * FROM users WHERE email = ? AND password_hash = ? LIMIT 1",
        [email, hashPassword(password)]
      );
      return sanitizeUser(rows[0] || null);
    },

    async getUserByEmail(email) {
      const [rows] = await pool.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
      return sanitizeUser(rows[0] || null);
    },

    async updateUser(emailParam, body) {
      const [currentRows] = await pool.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [emailParam]);
      if (!currentRows.length) return null;

      const current = currentRows[0];
      const nextEmail = normalizeEmail(body.email || current.email);
      const [dupRows] = await pool.execute(
        "SELECT id FROM users WHERE email = ? AND email <> ? LIMIT 1",
        [nextEmail, current.email]
      );
      if (dupRows.length) {
        throw new Error("email already used by another account");
      }

      const firstName = String(body.firstName || current.first_name).trim();
      const lastName = String(body.lastName || current.last_name).trim();
      const passwordHash = body.password ? hashPassword(String(body.password)) : current.password_hash;
      const nextProfile = body.profile || {};
      const role = String(nextProfile.role || current.role || "Freelancer");
      const location = String(nextProfile.location || current.location || "India");
      const skills = String(nextProfile.skills || current.skills || "HTML, CSS, JavaScript");
      const about = String(nextProfile.about || current.about || "Ready to build quality client projects.");
      const emailUpdates = typeof nextProfile.emailUpdates === "boolean"
        ? (nextProfile.emailUpdates ? 1 : 0)
        : Number(current.email_updates ? 1 : 0);

      await pool.execute(
        `UPDATE users
        SET first_name = ?, last_name = ?, email = ?, password_hash = ?, role = ?, location = ?, skills = ?, about = ?, email_updates = ?
        WHERE id = ?`,
        [firstName, lastName, nextEmail, passwordHash, role, location, skills, about, emailUpdates, current.id]
      );

      const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [current.id]);
      return sanitizeUser(rows[0]);
    },

    async listGigs(ownerEmail) {
      let rows;
      if (ownerEmail) {
        [rows] = await pool.execute("SELECT * FROM gigs WHERE owner_email = ? ORDER BY created_at DESC", [ownerEmail]);
      } else {
        [rows] = await pool.execute("SELECT * FROM gigs ORDER BY created_at DESC");
      }
      return rows.map(mapGig);
    },

    async createGig({ ownerEmail, title, description, price, deliveryDays }) {
      const [ownerRows] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [ownerEmail]);
      if (!ownerRows.length) return null;

      const gigId = makeId("g");
      await pool.execute(
        `INSERT INTO gigs (id, owner_email, title, description, price, delivery_days)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [gigId, ownerEmail, title, description, price, deliveryDays]
      );

      const [rows] = await pool.execute("SELECT * FROM gigs WHERE id = ? LIMIT 1", [gigId]);
      return mapGig(rows[0]);
    },

    async listJobs({ category, ownerEmail }) {
      let sql = "SELECT * FROM jobs";
      const params = [];

      if (category || ownerEmail) {
        const where = [];
        if (category) {
          where.push("LOWER(category) = ?");
          params.push(category);
        }
        if (ownerEmail) {
          where.push("owner_email = ?");
          params.push(ownerEmail);
        }
        sql += " WHERE " + where.join(" AND ");
      }

      sql += " ORDER BY created_at DESC";
      const [rows] = await pool.execute(sql, params);
      return rows.map(mapJob);
    },

    async createJob({ ownerEmail, title, description, category, budget, deadlineDays }) {
      const [ownerRows] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [ownerEmail]);
      if (!ownerRows.length) return null;

      const jobId = makeId("j");
      await pool.execute(
        `INSERT INTO jobs (id, owner_email, title, description, category, budget, deadline_days, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Open')`,
        [jobId, ownerEmail, title, description, category, budget, deadlineDays]
      );

      const [rows] = await pool.execute("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
      return mapJob(rows[0]);
    },

    async applyToJob(jobId, freelancerEmail) {
      const [jobRows] = await pool.execute("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
      if (!jobRows.length) {
        return { type: "missing_job" };
      }

      const job = jobRows[0];
      if (job.owner_email === freelancerEmail) {
        return { type: "own_job" };
      }

      const [dupRows] = await pool.execute(
        "SELECT id FROM applications WHERE job_id = ? AND freelancer_email = ? LIMIT 1",
        [jobId, freelancerEmail]
      );
      if (dupRows.length) {
        return { type: "duplicate" };
      }

      const appId = makeId("a");
      await pool.execute(
        `INSERT INTO applications (id, job_id, client_email, freelancer_email, status)
        VALUES (?, ?, ?, ?, 'Pending')`,
        [appId, jobId, job.owner_email, freelancerEmail]
      );

      const [rows] = await pool.execute("SELECT * FROM applications WHERE id = ? LIMIT 1", [appId]);
      return { type: "ok", application: mapApplication(rows[0]) };
    },

    async getOrders(email) {
      const [postedJobRows] = await pool.execute(
        "SELECT * FROM jobs WHERE owner_email = ? ORDER BY created_at DESC",
        [email]
      );

      const [incomingRows] = await pool.execute(
        `SELECT
           a.id, a.job_id, a.client_email, a.freelancer_email, a.status, a.applied_at,
           j.id AS j_id, j.owner_email AS j_owner_email, j.title AS j_title,
           j.description AS j_description, j.category AS j_category, j.budget AS j_budget,
           j.deadline_days AS j_deadline_days, j.status AS j_status, j.created_at AS j_created_at
         FROM applications a
         LEFT JOIN jobs j ON j.id = a.job_id
         WHERE a.client_email = ?
         ORDER BY a.applied_at DESC`,
        [email]
      );

      const [myRows] = await pool.execute(
        `SELECT
           a.id, a.job_id, a.client_email, a.freelancer_email, a.status, a.applied_at,
           j.id AS j_id, j.owner_email AS j_owner_email, j.title AS j_title,
           j.description AS j_description, j.category AS j_category, j.budget AS j_budget,
           j.deadline_days AS j_deadline_days, j.status AS j_status, j.created_at AS j_created_at
         FROM applications a
         LEFT JOIN jobs j ON j.id = a.job_id
         WHERE a.freelancer_email = ?
         ORDER BY a.applied_at DESC`,
        [email]
      );

      const postedJobs = postedJobRows.map(mapJob);
      const incomingApplications = incomingRows.map((row) => ({
        id: row.id,
        jobId: row.job_id,
        clientEmail: row.client_email,
        freelancerEmail: row.freelancer_email,
        status: row.status,
        appliedAt: row.applied_at,
        job: row.j_id
          ? {
              id: row.j_id,
              ownerEmail: row.j_owner_email,
              title: row.j_title,
              description: row.j_description,
              category: row.j_category,
              budget: Number(row.j_budget),
              deadlineDays: row.j_deadline_days,
              status: row.j_status,
              createdAt: row.j_created_at
            }
          : null
      }));

      const myApplications = myRows.map((row) => ({
        id: row.id,
        jobId: row.job_id,
        clientEmail: row.client_email,
        freelancerEmail: row.freelancer_email,
        status: row.status,
        appliedAt: row.applied_at,
        job: row.j_id
          ? {
              id: row.j_id,
              ownerEmail: row.j_owner_email,
              title: row.j_title,
              description: row.j_description,
              category: row.j_category,
              budget: Number(row.j_budget),
              deadlineDays: row.j_deadline_days,
              status: row.j_status,
              createdAt: row.j_created_at
            }
          : null
      }));

      return { postedJobs, incomingApplications, myApplications };
    },

    async updateApplicationStatus(appId, status) {
      const [rows] = await pool.execute("SELECT id FROM applications WHERE id = ? LIMIT 1", [appId]);
      if (!rows.length) return null;

      await pool.execute("UPDATE applications SET status = ? WHERE id = ?", [status, appId]);
      const [updatedRows] = await pool.execute("SELECT * FROM applications WHERE id = ? LIMIT 1", [appId]);
      return mapApplication(updatedRows[0]);
    },

    async createSupportTicket({ name, email, message }) {
      const ticketId = makeId("s");
      await pool.execute(
        `INSERT INTO support_tickets (id, name, email, message)
         VALUES (?, ?, ?, ?)`,
        [ticketId, name, email, message]
      );

      return {
        id: ticketId,
        name,
        email,
        message,
        createdAt: nowIso()
      };
    },

    async listMessages(email) {
      const [rows] = await pool.execute(
        `SELECT * FROM messages
         WHERE sender_email = ? OR recipient_email = ?
         ORDER BY created_at DESC`,
        [email, email]
      );
      return rows.map(mapMessage);
    },

    async createMessage({ senderEmail, recipientEmail, applicationId, subject, body }) {
      const [senderRows] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [senderEmail]);
      const [recipientRows] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [recipientEmail]);

      if (!senderRows.length || !recipientRows.length) {
        return { type: "missing_user" };
      }

      let acceptedSql = `
        SELECT * FROM applications
        WHERE status = 'Accepted'
          AND ((client_email = ? AND freelancer_email = ?) OR (client_email = ? AND freelancer_email = ?))`;
      const acceptedParams = [senderEmail, recipientEmail, recipientEmail, senderEmail];
      if (applicationId) {
        acceptedSql += " AND id = ?";
        acceptedParams.push(applicationId);
      }
      acceptedSql += " LIMIT 1";

      const [acceptedRows] = await pool.execute(acceptedSql, acceptedParams);
      if (!acceptedRows.length) {
        return { type: "locked" };
      }

      const acceptedApp = acceptedRows[0];
      const messageId = makeId("m");
      await pool.execute(
        `INSERT INTO messages (id, application_id, job_id, sender_email, recipient_email, subject, body)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [messageId, acceptedApp.id, acceptedApp.job_id, senderEmail, recipientEmail, subject, body]
      );

      const [rows] = await pool.execute("SELECT * FROM messages WHERE id = ? LIMIT 1", [messageId]);
      return { type: "ok", message: mapMessage(rows[0]) };
    }
  };
}

(async function start() {
  let store;

  try {
    store = await createMySqlStore();
    console.log("Storage mode: MySQL");
  } catch (err) {
    console.warn("MySQL unavailable, falling back to local JSON storage.");
    console.warn(err.message);
    store = createJsonStore();
    console.log("Storage mode: JSON");
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === "OPTIONS") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && pathname === "/api/health") {
      try {
        await store.health();
        return json(res, 200, { ok: true, service: "skillbridge-backend", db: store.kind });
      } catch (_) {
        return json(res, 500, { ok: false, message: "database unavailable" });
      }
    }

    if (req.method === "POST" && pathname === "/api/auth/signup") {
      try {
        const body = await parseBody(req);
        const firstName = String(body.firstName || "").trim();
        const lastName = String(body.lastName || "").trim();
        const email = normalizeEmail(body.email);
        const password = String(body.password || "");
        const role = normalizeRole(body.role);

        if (!firstName || !email || !password) {
          return badRequest(res, "firstName, email and password are required");
        }
        if (password.length < 6) {
          return badRequest(res, "password must be at least 6 characters");
        }

        const user = await store.createUser({ firstName, lastName, email, password, role });
        return json(res, 201, { ok: true, user });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      try {
        const body = await parseBody(req);
        const email = normalizeEmail(body.email);
        const password = String(body.password || "");

        if (!email || !password) {
          return badRequest(res, "email and password are required");
        }

        const user = await store.authenticateUser(email, password);
        if (!user) {
          return json(res, 401, { ok: false, message: "invalid credentials" });
        }

        return json(res, 200, { ok: true, user });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "GET" && /^\/api\/users\/.+/.test(pathname)) {
      try {
        const email = normalizeEmail(decodeURIComponent(pathname.split("/")[3] || ""));
        const user = await store.getUserByEmail(email);
        if (!user) {
          return json(res, 404, { ok: false, message: "user not found" });
        }
        return json(res, 200, { ok: true, user });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "PATCH" && /^\/api\/users\/.+/.test(pathname)) {
      try {
        const email = normalizeEmail(decodeURIComponent(pathname.split("/")[3] || ""));
        const body = await parseBody(req);
        const user = await store.updateUser(email, body);
        if (!user) {
          return json(res, 404, { ok: false, message: "user not found" });
        }
        return json(res, 200, { ok: true, user });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "GET" && pathname === "/api/gigs") {
      try {
        const ownerEmail = normalizeEmail(url.searchParams.get("ownerEmail"));
        const gigs = await store.listGigs(ownerEmail);
        return json(res, 200, { ok: true, gigs });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && pathname === "/api/gigs") {
      try {
        const body = await parseBody(req);
        const ownerEmail = normalizeEmail(body.ownerEmail);
        const title = String(body.title || "").trim();
        const description = String(body.description || "").trim();
        const price = Number(body.price || 0);
        const deliveryDays = Number(body.deliveryDays || 0);

        if (!ownerEmail || !title || !description || !price || !deliveryDays) {
          return badRequest(res, "ownerEmail, title, description, price, deliveryDays are required");
        }

        const gig = await store.createGig({ ownerEmail, title, description, price, deliveryDays });
        if (!gig) {
          return json(res, 404, { ok: false, message: "owner not found" });
        }

        return json(res, 201, { ok: true, gig });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "GET" && pathname === "/api/jobs") {
      try {
        const category = String(url.searchParams.get("category") || "").trim().toLowerCase();
        const ownerEmail = normalizeEmail(url.searchParams.get("ownerEmail"));
        const jobs = await store.listJobs({ category, ownerEmail });
        return json(res, 200, { ok: true, jobs });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && pathname === "/api/jobs") {
      try {
        const body = await parseBody(req);
        const ownerEmail = normalizeEmail(body.ownerEmail);
        const title = String(body.title || "").trim();
        const description = String(body.description || "").trim();
        const category = String(body.category || "").trim();
        const budget = Number(body.budget || 0);
        const deadlineDays = Number(body.deadlineDays || 0);

        if (!ownerEmail || !title || !description || !category || !budget || !deadlineDays) {
          return badRequest(res, "ownerEmail, title, description, category, budget, deadlineDays are required");
        }

        const job = await store.createJob({ ownerEmail, title, description, category, budget, deadlineDays });
        if (!job) {
          return json(res, 404, { ok: false, message: "owner not found" });
        }

        return json(res, 201, { ok: true, job });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && /^\/api\/jobs\/[^/]+\/apply$/.test(pathname)) {
      try {
        const jobId = pathname.split("/")[3];
        const body = await parseBody(req);
        const freelancerEmail = normalizeEmail(body.freelancerEmail);

        if (!freelancerEmail) {
          return badRequest(res, "freelancerEmail is required");
        }

        const result = await store.applyToJob(jobId, freelancerEmail);
        if (result.type === "missing_job") {
          return json(res, 404, { ok: false, message: "job not found" });
        }
        if (result.type === "own_job") {
          return badRequest(res, "owner cannot apply on own job");
        }
        if (result.type === "duplicate") {
          return badRequest(res, "already applied");
        }

        return json(res, 201, { ok: true, application: result.application });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "GET" && pathname === "/api/orders") {
      try {
        const email = normalizeEmail(url.searchParams.get("email"));
        if (!email) {
          return badRequest(res, "email query parameter is required");
        }

        const orders = await store.getOrders(email);
        return json(res, 200, { ok: true, orders });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "PATCH" && /^\/api\/applications\/[^/]+$/.test(pathname)) {
      try {
        const appId = pathname.split("/")[3];
        const body = await parseBody(req);
        const status = String(body.status || "").trim();
        const allowed = new Set(["Pending", "Accepted", "Rejected"]);

        if (!allowed.has(status)) {
          return badRequest(res, "status must be Pending, Accepted, or Rejected");
        }

        const application = await store.updateApplicationStatus(appId, status);
        if (!application) {
          return json(res, 404, { ok: false, message: "application not found" });
        }

        return json(res, 200, { ok: true, application });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && pathname === "/api/support") {
      try {
        const body = await parseBody(req);
        const name = String(body.name || "").trim();
        const email = normalizeEmail(body.email);
        const message = String(body.message || "").trim();

        if (!name || !email || !message) {
          return badRequest(res, "name, email and message are required");
        }

        const ticket = await store.createSupportTicket({ name, email, message });
        return json(res, 201, { ok: true, ticket });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "GET" && pathname === "/api/messages") {
      try {
        const email = normalizeEmail(url.searchParams.get("email"));
        if (!email) {
          return badRequest(res, "email query parameter is required");
        }

        const messages = await store.listMessages(email);
        return json(res, 200, { ok: true, messages });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && pathname === "/api/messages") {
      try {
        const body = await parseBody(req);
        const senderEmail = normalizeEmail(body.senderEmail);
        const recipientEmail = normalizeEmail(body.recipientEmail);
        const applicationId = String(body.applicationId || "").trim();
        const subject = String(body.subject || "Project update").trim();
        const messageBody = String(body.body || "").trim();

        if (!senderEmail || !recipientEmail || !messageBody) {
          return badRequest(res, "senderEmail, recipientEmail and body are required");
        }

        const message = await store.createMessage({
          senderEmail,
          recipientEmail,
          applicationId,
          subject,
          body: messageBody
        });

        if (message.type === "missing_user") {
          return json(res, 404, { ok: false, message: "sender or recipient not found" });
        }
        if (message.type === "locked") {
          return json(res, 403, { ok: false, message: "chat unlocks after the client accepts the application" });
        }

        return json(res, 201, { ok: true, message: message.message });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (serveFrontend(req, res, pathname)) {
      return;
    }

    return json(res, 404, { ok: false, message: "route not found" });
  });

  server.listen(PORT, () => {
    console.log(`SkillBridge backend running on http://localhost:${PORT}`);
  });
})();
