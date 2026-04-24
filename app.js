(function () {
  "use strict";

  const API_BASE = "http://localhost:4000/api";
  const SESSION_KEY = "sb_session";
  const REQUEST_TIMEOUT_MS = 12000;

  const path = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const publicPages = new Set(["index.html", "login.html", "signup.html", "help.html"]);
  const query = new URLSearchParams(window.location.search);

  let currentUserCache = null;

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getNextDestination(defaultPath) {
    const next = query.get("next");
    if (!next) return defaultPath;
    if (!/^[a-z0-9\-_.]+\.html(\?.*)?$/i.test(next)) return defaultPath;
    return next;
  }

  function ensureProtectedRoute() {
    if (publicPages.has(path)) return;
    const session = getSession();
    if (!session || !session.email) {
      const currentTarget = path + window.location.search;
      window.location.href = "login.html?next=" + encodeURIComponent(currentTarget);
    }
  }

  async function api(pathname, options) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(API_BASE + pathname, {
        method: (options && options.method) || "GET",
        headers: {
          "Content-Type": "application/json"
        },
        body: options && options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      const data = await res.json().catch(function () {
        return { ok: false, message: "Invalid server response" };
      });

      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Request failed");
      }

      return data;
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }

      if (err instanceof TypeError) {
        throw new Error("Backend not reachable. Start server: node backend/server.js");
      }

      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function setFormLoading(form, isLoading, loadingText) {
    if (!form) return;
    const submitBtn = form.querySelector('button[type="submit"], .login-btn, .signup-btn');
    if (!submitBtn) return;

    if (!submitBtn.dataset.originalText) {
      submitBtn.dataset.originalText = submitBtn.textContent || "Submit";
    }

    submitBtn.disabled = isLoading;
    submitBtn.style.opacity = isLoading ? "0.75" : "1";
    submitBtn.style.cursor = isLoading ? "not-allowed" : "pointer";
    submitBtn.textContent = isLoading ? (loadingText || "Please wait...") : submitBtn.dataset.originalText;
  }

  function showFormMessage(form, message, isError) {
    if (!form) return;
    let node = form.parentElement.querySelector(".form-alert");
    if (!node) {
      node = document.createElement("p");
      node.className = "form-alert";
      form.parentElement.insertBefore(node, form);
    }
    node.textContent = message;
    node.style.margin = "10px 0";
    node.style.padding = "10px";
    node.style.borderRadius = "8px";
    node.style.fontSize = "14px";
    node.style.background = isError ? "#7f1d1d" : "#064e3b";
    node.style.color = "#fff";
    node.style.border = isError ? "1px solid #ef4444" : "1px solid #10b981";
  }

  function markActiveSidebar() {
    document.querySelectorAll(".sidebar a").forEach(function (a) {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (href === path) {
        a.style.color = "#ffffff";
        a.style.fontWeight = "700";
      }
    });
  }

  function bindLogout() {
    document.querySelectorAll(".logout-item a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        clearSession();
        currentUserCache = null;
        window.location.href = "index.html";
      });
    });
  }

  async function getCurrentUser(force) {
    if (!force && currentUserCache) return currentUserCache;

    const session = getSession();
    if (!session || !session.email) return null;

    try {
      const data = await api("/users/" + encodeURIComponent(session.email));
      currentUserCache = data.user;
      return currentUserCache;
    } catch (_) {
      clearSession();
      currentUserCache = null;
      return null;
    }
  }

  function bindAuthForms() {
    const next = query.get("next");
    if (next) {
      const authAltLinks = document.querySelectorAll('a[href="signup.html"], a[href="login.html"]');
      authAltLinks.forEach(function (a) {
        const href = a.getAttribute("href");
        a.setAttribute("href", href + "?next=" + encodeURIComponent(next));
      });
    }

    if (path === "signup.html") {
      const form = document.querySelector("form");
      if (!form) return;

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        const data = new FormData(form);
        const firstName = String(data.get("first_name") || "").trim();
        const lastName = String(data.get("last_name") || "").trim();
        const email = String(data.get("email") || "").trim().toLowerCase();
        const password = String(data.get("password") || "");

        if (!firstName || !email || !password) {
          showFormMessage(form, "Please fill all required fields.", true);
          return;
        }

        setFormLoading(form, true, "Creating...");
        try {
          const res = await api("/auth/signup", {
            method: "POST",
            body: { firstName: firstName, lastName: lastName, email: email, password: password }
          });

          setSession({ email: res.user.email, loginAt: new Date().toISOString() });
          currentUserCache = res.user;
          showFormMessage(form, "Account created. Redirecting...", false);
          setTimeout(function () {
            window.location.href = getNextDestination("dashboard.html");
          }, 400);
        } catch (err) {
          showFormMessage(form, err.message, true);
        } finally {
          setFormLoading(form, false);
        }
      });
    }

    if (path === "login.html") {
      const form = document.querySelector("form");
      if (!form) return;

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        const data = new FormData(form);
        const email = String(data.get("email") || "").trim().toLowerCase();
        const password = String(data.get("password") || "");

        if (!email || !password) {
          showFormMessage(form, "Email and password are required.", true);
          return;
        }

        setFormLoading(form, true, "Logging in...");
        try {
          const res = await api("/auth/login", {
            method: "POST",
            body: { email: email, password: password }
          });

          setSession({ email: res.user.email, loginAt: new Date().toISOString() });
          currentUserCache = res.user;
          showFormMessage(form, "Login successful. Redirecting...", false);
          setTimeout(function () {
            window.location.href = getNextDestination("dashboard.html");
          }, 350);
        } catch (err) {
          showFormMessage(form, err.message, true);
        } finally {
          setFormLoading(form, false);
        }
      });
    }

    document.querySelectorAll(".google-btn, .facebook-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        alert("Social login will be added with OAuth backend.");
      });
    });
  }

  async function updateTopbarUser(user) {
    const u = user || (await getCurrentUser());
    if (!u) return;

    const welcome = document.querySelector(".topbar h3");
    if (welcome && /welcome/i.test(welcome.textContent)) {
      welcome.textContent = "Welcome, " + u.firstName + "!";
    }
  }

  async function hydrateProfilePage(user) {
    if (path !== "profile.html") return;
    const u = user || (await getCurrentUser());
    if (!u) return;

    const profile = u.profile || {};
    const h2 = document.querySelector(".profile-card h2");
    const intro = document.querySelector(".profile-card > p");
    const detailPs = document.querySelectorAll(".profile-details div p");

    if (h2) h2.textContent = (u.firstName + " " + u.lastName).trim();
    if (intro) intro.textContent = (profile.role || "Freelancer") + " | SkillBridge User";
    if (detailPs[0]) detailPs[0].textContent = u.email;
    if (detailPs[1]) detailPs[1].textContent = profile.location || "India";
    if (detailPs[2]) detailPs[2].textContent = profile.skills || "HTML, CSS, JavaScript";
    if (detailPs[3]) detailPs[3].textContent = profile.about || "Ready to build quality client projects.";
  }

  async function hydrateSettingsPage(user) {
    if (path !== "settings.html") return;
    const u = user || (await getCurrentUser());
    const form = document.querySelector("form");
    if (!u || !form) return;

    const profile = u.profile || {};
    const fullName = form.querySelector('input[name="full_name"]');
    const email = form.querySelector('input[name="email"]');
    const password = form.querySelector('input[name="password"]');
    const updates = form.querySelector('input[name="email_updates"]');

    if (fullName) fullName.value = (u.firstName + " " + u.lastName).trim();
    if (email) email.value = u.email;
    if (password) password.value = "";
    if (updates) updates.checked = Boolean(profile.emailUpdates);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const data = new FormData(form);
      const newName = String(data.get("full_name") || "").trim();
      const newEmail = String(data.get("email") || "").trim().toLowerCase();
      const newPassword = String(data.get("password") || "");
      const emailUpdates = Boolean(data.get("email_updates"));

      if (!newName || !newEmail) {
        showFormMessage(form, "Name and email are required.", true);
        return;
      }

      const nameParts = newName.split(" ").filter(Boolean);
      const firstName = nameParts[0] || u.firstName;
      const lastName = nameParts.slice(1).join(" ") || u.lastName;

      setFormLoading(form, true, "Saving...");
      try {
        const res = await api("/users/" + encodeURIComponent(u.email), {
          method: "PATCH",
          body: {
            firstName: firstName,
            lastName: lastName,
            email: newEmail,
            password: newPassword || undefined,
            profile: {
              role: profile.role || "Freelancer",
              location: profile.location || "India",
              skills: profile.skills || "HTML, CSS, JavaScript",
              about: profile.about || "Ready to build quality client projects.",
              emailUpdates: emailUpdates
            }
          }
        });

        setSession({ email: res.user.email, loginAt: new Date().toISOString() });
        currentUserCache = res.user;
        showFormMessage(form, "Settings saved successfully.", false);
        setTimeout(function () {
          window.location.href = "profile.html";
        }, 400);
      } catch (err) {
        showFormMessage(form, err.message, true);
      } finally {
        setFormLoading(form, false);
      }
    });
  }

  async function bindCreateGig(user) {
    if (path !== "create-gig.html") return;
    const u = user || (await getCurrentUser());
    const form = document.querySelector("form");
    if (!u || !form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      const description = String(data.get("description") || "").trim();
      const price = Number(data.get("price") || 0);
      const deliveryDays = Number(data.get("delivery_days") || 0);

      if (!title || !description || !price || !deliveryDays) {
        showFormMessage(form, "Please fill all fields correctly.", true);
        return;
      }

      setFormLoading(form, true, "Publishing...");
      try {
        await api("/gigs", {
          method: "POST",
          body: {
            ownerEmail: u.email,
            title: title,
            description: description,
            price: price,
            deliveryDays: deliveryDays
          }
        });
        showFormMessage(form, "Gig published successfully.", false);
        setTimeout(function () {
          window.location.href = "mygigs.html";
        }, 350);
      } catch (err) {
        showFormMessage(form, err.message, true);
      } finally {
        setFormLoading(form, false);
      }
    });
  }

  async function renderMyGigs(user) {
    if (path !== "mygigs.html") return;
    const u = user || (await getCurrentUser());
    const container = document.querySelector(".gigs-grid");
    if (!u || !container) return;

    try {
      const res = await api("/gigs?ownerEmail=" + encodeURIComponent(u.email));
      const gigs = res.gigs || [];

      if (!gigs.length) {
        container.innerHTML = "<div class=\"gig-card\"><h3>No gigs yet</h3><p>Create your first gig to start receiving projects.</p></div>";
        return;
      }

      container.innerHTML = gigs.map(function (g) {
        return "<div class=\"gig-card\">" +
          "<h3>" + escapeHtml(g.title) + "</h3>" +
          "<p>" + escapeHtml(g.description) + "</p>" +
          "<p><strong>Price:</strong> Rs " + Number(g.price).toLocaleString("en-IN") + "</p>" +
          "<p><strong>Delivery:</strong> " + g.deliveryDays + " days</p>" +
        "</div>";
      }).join("");
    } catch (err) {
      container.innerHTML = "<div class=\"gig-card\"><h3>Unable to load gigs</h3><p>" + escapeHtml(err.message) + "</p></div>";
    }
  }

  async function bindPostJob(user) {
    if (path !== "post-job.html") return;
    const u = user || (await getCurrentUser());
    const form = document.getElementById("postJobForm") || document.querySelector("form");
    if (!u || !form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      const description = String(data.get("description") || "").trim();
      const budget = Number(data.get("budget") || 0);
      const category = String(data.get("category") || "").trim();
      const deadlineDays = Number(data.get("deadline_days") || 0);

      if (!title || !description || !budget || !category || !deadlineDays) {
        showFormMessage(form, "Please fill all fields correctly.", true);
        return;
      }

      setFormLoading(form, true, "Posting...");
      try {
        await api("/jobs", {
          method: "POST",
          body: {
            ownerEmail: u.email,
            title: title,
            description: description,
            category: category,
            budget: budget,
            deadlineDays: deadlineDays
          }
        });
        showFormMessage(form, "Job posted successfully.", false);
        setTimeout(function () {
          window.location.href = "browse-jobs.html";
        }, 350);
      } catch (err) {
        showFormMessage(form, err.message, true);
      } finally {
        setFormLoading(form, false);
      }
    });
  }

  async function renderBrowseJobs(user) {
    if (path !== "browse-jobs.html") return;
    const u = user || (await getCurrentUser());
    const container = document.getElementById("jobsList");
    if (!u || !container) return;

    const categoryFilter = (query.get("category") || "").trim();

    try {
      const endpoint = categoryFilter
        ? "/jobs?category=" + encodeURIComponent(categoryFilter)
        : "/jobs";

      const [jobsRes, ordersRes] = await Promise.all([
        api(endpoint),
        api("/orders?email=" + encodeURIComponent(u.email))
      ]);

      const jobs = jobsRes.jobs || [];
      const apps = (ordersRes.orders && ordersRes.orders.myApplications) || [];

      if (categoryFilter) {
        const title = document.querySelector(".profile-card h2");
        if (title) title.textContent = "Available Jobs - " + categoryFilter;
      }

      if (!jobs.length) {
        container.innerHTML = "<div class=\"gig-card\"><h3>No jobs found</h3><p>Try another category or check again later.</p></div>";
        return;
      }

      container.innerHTML = jobs.map(function (job) {
        const alreadyApplied = apps.some(function (a) { return a.jobId === job.id; });
        const ownJob = job.ownerEmail === u.email;
        const buttonText = ownJob ? "Your Job" : (alreadyApplied ? "Applied" : "Apply");
        const disabled = ownJob || alreadyApplied ? "disabled" : "";

        return "<div class=\"gig-card\">" +
          "<h3>" + escapeHtml(job.title) + "</h3>" +
          "<p>" + escapeHtml(job.description) + "</p>" +
          "<p><strong>Category:</strong> " + escapeHtml(job.category) + "</p>" +
          "<p><strong>Budget:</strong> Rs " + Number(job.budget).toLocaleString("en-IN") + "</p>" +
          "<p><strong>Deadline:</strong> " + job.deadlineDays + " days</p>" +
          "<div class=\"actions\" style=\"margin-top: 12px;\">" +
            "<button type=\"button\" data-apply-job=\"" + job.id + "\" " + disabled + ">" + buttonText + "</button>" +
          "</div>" +
        "</div>";
      }).join("");

      container.querySelectorAll("button[data-apply-job]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          const jobId = btn.getAttribute("data-apply-job");
          try {
            btn.disabled = true;
            btn.textContent = "Applying...";
            await api("/jobs/" + encodeURIComponent(jobId) + "/apply", {
              method: "POST",
              body: { freelancerEmail: u.email }
            });
            renderBrowseJobs(u);
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
            btn.textContent = "Apply";
          }
        });
      });
    } catch (err) {
      container.innerHTML = "<div class=\"gig-card\"><h3>Unable to load jobs</h3><p>" + escapeHtml(err.message) + "</p></div>";
    }
  }

  async function renderOrdersPage(user) {
    if (path !== "orders.html") return;
    const u = user || (await getCurrentUser());
    const container = document.querySelector(".profile-details");
    if (!u || !container) return;

    try {
      const res = await api("/orders?email=" + encodeURIComponent(u.email));
      const orders = res.orders || {};
      const postedJobs = orders.postedJobs || [];
      const incoming = orders.incomingApplications || [];
      const myApps = orders.myApplications || [];

      const cards = [];
      cards.push("<div><strong>Jobs You Posted</strong><p>" + (postedJobs.length ? postedJobs.length + " active jobs" : "No jobs posted yet") + "</p></div>");

      if (!incoming.length) {
        cards.push("<div><strong>Applications On Your Jobs</strong><p>No applications received yet.</p></div>");
      } else {
        incoming.forEach(function (item) {
          if (!item.job) return;
          cards.push(
            "<div>" +
              "<strong>" + escapeHtml(item.job.title) + "</strong>" +
              "<p>Freelancer: " + escapeHtml(item.freelancerEmail) + "</p>" +
              "<p>Status: " + escapeHtml(item.status) + "</p>" +
              "<div class=\"actions\" style=\"margin-top: 8px;\">" +
                "<button type=\"button\" data-app-action=\"Accepted\" data-app-id=\"" + item.id + "\">Accept</button>" +
                "<button type=\"button\" class=\"secondary-btn\" data-app-action=\"Rejected\" data-app-id=\"" + item.id + "\">Reject</button>" +
              "</div>" +
            "</div>"
          );
        });
      }

      if (!myApps.length) {
        cards.push("<div><strong>Your Applications</strong><p>You have not applied to any job yet.</p></div>");
      } else {
        myApps.forEach(function (item) {
          if (!item.job) return;
          cards.push(
            "<div>" +
              "<strong>Applied: " + escapeHtml(item.job.title) + "</strong>" +
              "<p>Client: " + escapeHtml(item.clientEmail) + "</p>" +
              "<p>Status: " + escapeHtml(item.status) + "</p>" +
            "</div>"
          );
        });
      }

      container.innerHTML = cards.join("");

      container.querySelectorAll("button[data-app-action]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          const appId = btn.getAttribute("data-app-id");
          const status = btn.getAttribute("data-app-action");
          btn.disabled = true;
          const oldText = btn.textContent;
          btn.textContent = "Updating...";

          try {
            await api("/applications/" + encodeURIComponent(appId), {
              method: "PATCH",
              body: { status: status }
            });
            renderOrdersPage(u);
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
            btn.textContent = oldText;
          }
        });
      });
    } catch (err) {
      container.innerHTML = "<div><strong>Unable to load orders</strong><p>" + escapeHtml(err.message) + "</p></div>";
    }
  }

  async function updateDashboardStats(user) {
    if (path !== "dashboard.html") return;
    const u = user || (await getCurrentUser());
    if (!u) return;

    const cards = document.querySelectorAll(".stats .card h3");
    if (cards.length < 3) return;

    try {
      const [gigsRes, ordersRes] = await Promise.all([
        api("/gigs?ownerEmail=" + encodeURIComponent(u.email)),
        api("/orders?email=" + encodeURIComponent(u.email))
      ]);

      const gigs = gigsRes.gigs || [];
      const incoming = (ordersRes.orders && ordersRes.orders.incomingApplications) || [];
      const myApps = (ordersRes.orders && ordersRes.orders.myApplications) || [];

      const acceptedAsFreelancer = myApps.filter(function (a) { return a.status === "Accepted"; });
      const acceptedAsClient = incoming.filter(function (a) { return a.status === "Accepted"; });

      const activeOrders = acceptedAsFreelancer.length + acceptedAsClient.length;
      const completedJobs = Math.max(gigs.length, acceptedAsFreelancer.length);

      const earningsFromJobs = acceptedAsFreelancer.reduce(function (sum, a) {
        const budget = a.job ? Number(a.job.budget || 0) : 0;
        return sum + budget;
      }, 0);

      const earningsFromGigs = gigs.reduce(function (sum, g) {
        return sum + Number(g.price || 0);
      }, 0);

      cards[0].textContent = String(activeOrders || 0);
      cards[1].textContent = String(completedJobs || 0);
      cards[2].textContent = "Rs " + Number(earningsFromJobs + earningsFromGigs).toLocaleString("en-IN");
    } catch (_) {
      cards[0].textContent = "0";
      cards[1].textContent = "0";
      cards[2].textContent = "Rs 0";
    }
  }

  function bindHelpForm() {
    if (path !== "help.html") return;
    const form = document.querySelector(".profile-card form");
    if (!form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const email = String(data.get("email") || "").trim();
      const message = String(data.get("message") || "").trim();

      if (!name || !email || !message) {
        showFormMessage(form, "Please complete all fields.", true);
        return;
      }

      setFormLoading(form, true, "Sending...");
      try {
        await api("/support", {
          method: "POST",
          body: { name: name, email: email, message: message }
        });
        showFormMessage(form, "Message sent successfully. Our team will contact you soon.", false);
        form.reset();
      } catch (err) {
        showFormMessage(form, err.message, true);
      } finally {
        setFormLoading(form, false);
      }
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  document.addEventListener("DOMContentLoaded", async function () {
    ensureProtectedRoute();
    bindLogout();
    markActiveSidebar();
    bindAuthForms();

    const user = await getCurrentUser();
    await updateTopbarUser(user);
    await hydrateProfilePage(user);
    await hydrateSettingsPage(user);
    await bindCreateGig(user);
    await renderMyGigs(user);
    await bindPostJob(user);
    await renderBrowseJobs(user);
    await renderOrdersPage(user);
    await updateDashboardStats(user);
    bindHelpForm();
  });
})();
