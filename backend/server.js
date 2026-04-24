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

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function sanitizeUser(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    createdAt: row.created_at,
    profile: {
      role: row.role || "Freelancer",
      location: row.location || "India",
      skills: row.skills || "HTML, CSS, JavaScript",
      about: row.about || "Ready to build quality client projects.",
      emailUpdates: Boolean(row.email_updates)
    }
  };
}

function mapGig(row) {
  return {
    id: row.id,
    ownerEmail: row.owner_email,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    deliveryDays: row.delivery_days,
    createdAt: row.created_at
  };
}

function mapJob(row) {
  return {
    id: row.id,
    ownerEmail: row.owner_email,
    title: row.title,
    description: row.description,
    category: row.category,
    budget: Number(row.budget),
    deadlineDays: row.deadline_days,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapApplication(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    clientEmail: row.client_email,
    freelancerEmail: row.freelancer_email,
    status: row.status,
    appliedAt: row.applied_at
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

async function bootstrapDb() {
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

  return pool;
}

(async function start() {
  let pool;
  try {
    pool = await bootstrapDb();
  } catch (err) {
    console.error("MySQL bootstrap failed:", err.message);
    process.exit(1);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === "OPTIONS") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && pathname === "/api/health") {
      try {
        await pool.query("SELECT 1");
        return json(res, 200, { ok: true, service: "skillbridge-backend", db: "mysql" });
      } catch (_) {
        return json(res, 500, { ok: false, message: "database unavailable" });
      }
    }

    if (req.method === "POST" && pathname === "/api/auth/signup") {
      try {
        const body = await parseBody(req);
        const firstName = String(body.firstName || "").trim();
        const lastName = String(body.lastName || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!firstName || !email || !password) {
          return badRequest(res, "firstName, email and password are required");
        }
        if (password.length < 6) {
          return badRequest(res, "password must be at least 6 characters");
        }

        const [existing] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
        if (existing.length) {
          return badRequest(res, "user already exists");
        }

        const userId = makeId("u");
        const passwordHash = hashPassword(password);

        await pool.execute(
          `INSERT INTO users
          (id, first_name, last_name, email, password_hash, role, location, skills, about, email_updates)
          VALUES (?, ?, ?, ?, ?, 'Freelancer', 'India', 'HTML, CSS, JavaScript', 'Ready to build quality client projects.', 1)`,
          [userId, firstName, lastName, email, passwordHash]
        );

        const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
        return json(res, 201, { ok: true, user: sanitizeUser(rows[0]) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      try {
        const body = await parseBody(req);
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!email || !password) {
          return badRequest(res, "email and password are required");
        }

        const [rows] = await pool.execute(
          "SELECT * FROM users WHERE email = ? AND password_hash = ? LIMIT 1",
          [email, hashPassword(password)]
        );

        if (!rows.length) {
          return json(res, 401, { ok: false, message: "invalid credentials" });
        }

        return json(res, 200, { ok: true, user: sanitizeUser(rows[0]) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "GET" && /^\/api\/users\/.+/.test(pathname)) {
      try {
        const email = decodeURIComponent(pathname.split("/")[3] || "").trim().toLowerCase();
        const [rows] = await pool.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
        if (!rows.length) {
          return json(res, 404, { ok: false, message: "user not found" });
        }
        return json(res, 200, { ok: true, user: sanitizeUser(rows[0]) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "PATCH" && /^\/api\/users\/.+/.test(pathname)) {
      try {
        const emailParam = decodeURIComponent(pathname.split("/")[3] || "").trim().toLowerCase();
        const body = await parseBody(req);

        const [currentRows] = await pool.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [emailParam]);
        if (!currentRows.length) {
          return json(res, 404, { ok: false, message: "user not found" });
        }

        const current = currentRows[0];
        const nextEmail = String(body.email || current.email).trim().toLowerCase();

        const [dupRows] = await pool.execute(
          "SELECT id FROM users WHERE email = ? AND email <> ? LIMIT 1",
          [nextEmail, current.email]
        );
        if (dupRows.length) {
          return badRequest(res, "email already used by another account");
        }

        const firstName = String(body.firstName || current.first_name).trim();
        const lastName = String(body.lastName || current.last_name).trim();
        const passwordHash = body.password ? hashPassword(String(body.password)) : current.password_hash;

        const nextProfile = body.profile || {};
        const role = String(nextProfile.role || current.role || "Freelancer");
        const location = String(nextProfile.location || current.location || "India");
        const skills = String(nextProfile.skills || current.skills || "HTML, CSS, JavaScript");
        const about = String(nextProfile.about || current.about || "Ready to build quality client projects.");
        const emailUpdates = typeof nextProfile.emailUpdates === "boolean" ? (nextProfile.emailUpdates ? 1 : 0) : Number(current.email_updates ? 1 : 0);

        await pool.execute(
          `UPDATE users
          SET first_name = ?, last_name = ?, email = ?, password_hash = ?, role = ?, location = ?, skills = ?, about = ?, email_updates = ?
          WHERE id = ?`,
          [firstName, lastName, nextEmail, passwordHash, role, location, skills, about, emailUpdates, current.id]
        );

        const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [current.id]);
        return json(res, 200, { ok: true, user: sanitizeUser(rows[0]) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "GET" && pathname === "/api/gigs") {
      try {
        const ownerEmail = String(url.searchParams.get("ownerEmail") || "").trim().toLowerCase();
        let rows;
        if (ownerEmail) {
          [rows] = await pool.execute("SELECT * FROM gigs WHERE owner_email = ? ORDER BY created_at DESC", [ownerEmail]);
        } else {
          [rows] = await pool.execute("SELECT * FROM gigs ORDER BY created_at DESC");
        }
        return json(res, 200, { ok: true, gigs: rows.map(mapGig) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && pathname === "/api/gigs") {
      try {
        const body = await parseBody(req);
        const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
        const title = String(body.title || "").trim();
        const description = String(body.description || "").trim();
        const price = Number(body.price || 0);
        const deliveryDays = Number(body.deliveryDays || 0);

        if (!ownerEmail || !title || !description || !price || !deliveryDays) {
          return badRequest(res, "ownerEmail, title, description, price, deliveryDays are required");
        }

        const [ownerRows] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [ownerEmail]);
        if (!ownerRows.length) {
          return json(res, 404, { ok: false, message: "owner not found" });
        }

        const gigId = makeId("g");
        await pool.execute(
          `INSERT INTO gigs (id, owner_email, title, description, price, delivery_days)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [gigId, ownerEmail, title, description, price, deliveryDays]
        );

        const [rows] = await pool.execute("SELECT * FROM gigs WHERE id = ? LIMIT 1", [gigId]);
        return json(res, 201, { ok: true, gig: mapGig(rows[0]) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "GET" && pathname === "/api/jobs") {
      try {
        const category = String(url.searchParams.get("category") || "").trim().toLowerCase();
        const ownerEmail = String(url.searchParams.get("ownerEmail") || "").trim().toLowerCase();

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
        return json(res, 200, { ok: true, jobs: rows.map(mapJob) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && pathname === "/api/jobs") {
      try {
        const body = await parseBody(req);
        const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
        const title = String(body.title || "").trim();
        const description = String(body.description || "").trim();
        const category = String(body.category || "").trim();
        const budget = Number(body.budget || 0);
        const deadlineDays = Number(body.deadlineDays || 0);

        if (!ownerEmail || !title || !description || !category || !budget || !deadlineDays) {
          return badRequest(res, "ownerEmail, title, description, category, budget, deadlineDays are required");
        }

        const [ownerRows] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [ownerEmail]);
        if (!ownerRows.length) {
          return json(res, 404, { ok: false, message: "owner not found" });
        }

        const jobId = makeId("j");
        await pool.execute(
          `INSERT INTO jobs (id, owner_email, title, description, category, budget, deadline_days, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Open')`,
          [jobId, ownerEmail, title, description, category, budget, deadlineDays]
        );

        const [rows] = await pool.execute("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
        return json(res, 201, { ok: true, job: mapJob(rows[0]) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && /^\/api\/jobs\/[^/]+\/apply$/.test(pathname)) {
      try {
        const jobId = pathname.split("/")[3];
        const body = await parseBody(req);
        const freelancerEmail = String(body.freelancerEmail || "").trim().toLowerCase();

        if (!freelancerEmail) {
          return badRequest(res, "freelancerEmail is required");
        }

        const [jobRows] = await pool.execute("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
        if (!jobRows.length) {
          return json(res, 404, { ok: false, message: "job not found" });
        }

        const job = jobRows[0];
        if (job.owner_email === freelancerEmail) {
          return badRequest(res, "owner cannot apply on own job");
        }

        const [dupRows] = await pool.execute(
          "SELECT id FROM applications WHERE job_id = ? AND freelancer_email = ? LIMIT 1",
          [jobId, freelancerEmail]
        );
        if (dupRows.length) {
          return badRequest(res, "already applied");
        }

        const appId = makeId("a");
        await pool.execute(
          `INSERT INTO applications (id, job_id, client_email, freelancer_email, status)
          VALUES (?, ?, ?, ?, 'Pending')`,
          [appId, jobId, job.owner_email, freelancerEmail]
        );

        const [rows] = await pool.execute("SELECT * FROM applications WHERE id = ? LIMIT 1", [appId]);
        return json(res, 201, { ok: true, application: mapApplication(rows[0]) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "GET" && pathname === "/api/orders") {
      try {
        const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
        if (!email) {
          return badRequest(res, "email query parameter is required");
        }

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

        const incomingApplications = incomingRows.map((r) => ({
          id: r.id,
          jobId: r.job_id,
          clientEmail: r.client_email,
          freelancerEmail: r.freelancer_email,
          status: r.status,
          appliedAt: r.applied_at,
          job: r.j_id
            ? {
                id: r.j_id,
                ownerEmail: r.j_owner_email,
                title: r.j_title,
                description: r.j_description,
                category: r.j_category,
                budget: Number(r.j_budget),
                deadlineDays: r.j_deadline_days,
                status: r.j_status,
                createdAt: r.j_created_at
              }
            : null
        }));

        const myApplications = myRows.map((r) => ({
          id: r.id,
          jobId: r.job_id,
          clientEmail: r.client_email,
          freelancerEmail: r.freelancer_email,
          status: r.status,
          appliedAt: r.applied_at,
          job: r.j_id
            ? {
                id: r.j_id,
                ownerEmail: r.j_owner_email,
                title: r.j_title,
                description: r.j_description,
                category: r.j_category,
                budget: Number(r.j_budget),
                deadlineDays: r.j_deadline_days,
                status: r.j_status,
                createdAt: r.j_created_at
              }
            : null
        }));

        return json(res, 200, {
          ok: true,
          orders: { postedJobs, incomingApplications, myApplications }
        });
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

        const [rows] = await pool.execute("SELECT id FROM applications WHERE id = ? LIMIT 1", [appId]);
        if (!rows.length) {
          return json(res, 404, { ok: false, message: "application not found" });
        }

        await pool.execute("UPDATE applications SET status = ? WHERE id = ?", [status, appId]);

        const [updatedRows] = await pool.execute("SELECT * FROM applications WHERE id = ? LIMIT 1", [appId]);
        return json(res, 200, { ok: true, application: mapApplication(updatedRows[0]) });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    if (req.method === "POST" && pathname === "/api/support") {
      try {
        const body = await parseBody(req);
        const name = String(body.name || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const message = String(body.message || "").trim();

        if (!name || !email || !message) {
          return badRequest(res, "name, email and message are required");
        }

        const ticketId = makeId("s");
        await pool.execute(
          `INSERT INTO support_tickets (id, name, email, message)
           VALUES (?, ?, ?, ?)`,
          [ticketId, name, email, message]
        );

        return json(res, 201, {
          ok: true,
          ticket: {
            id: ticketId,
            name,
            email,
            message
          }
        });
      } catch (err) {
        return badRequest(res, err.message || "invalid request");
      }
    }

    return json(res, 404, { ok: false, message: "route not found" });
  });

  server.listen(PORT, () => {
    console.log(`SkillBridge backend (MySQL) running on http://localhost:${PORT}`);
    console.log(`MySQL: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  });
})();
